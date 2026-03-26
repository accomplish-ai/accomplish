/**
 * HTTP routing and SSE streaming handler for the HuggingFace Local inference server.
 * Implements the OpenAI-compatible /v1/chat/completions endpoint.
 */

import http from 'http';
import { getLogCollector } from '../../logging';
import { state, type ChatCompletionRequest } from './server-state';
import { formatChatPrompt } from './model-loader';

/**
 * Handle a chat completion request (non-streaming).
 */
export async function handleChatCompletion(req: ChatCompletionRequest): Promise<object> {
  if (!state.tokenizer || !state.model) {
    throw new Error('No model loaded');
  }

  const prompt = formatChatPrompt(req.messages, state.tokenizer);
  const inputs = state.tokenizer(prompt, { return_tensors: 'pt' });

  const maxNewTokens = req.max_tokens || 512;
  const temperature = req.temperature ?? 0.7;
  const topP = req.top_p ?? 0.9;

  const outputs = await state.model.generate({
    ...inputs,
    max_new_tokens: maxNewTokens,
    temperature,
    top_p: topP,
    do_sample: temperature > 0,
  });

  const promptLength = inputs.input_ids.dims?.[1] || 0;
  const generatedTokens = outputs.slice(null, [promptLength, null]);
  const text = state.tokenizer.decode(generatedTokens[0], { skip_special_tokens: true });

  const completionTokens = generatedTokens.dims?.[1] || 0;
  const totalTokens = promptLength + completionTokens;

  return {
    id: `chatcmpl-hf-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: state.loadedModelId,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: text.trim(),
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: promptLength,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    },
  };
}

/**
 * Handle a streaming chat completion request via SSE.
 */
export async function handleStreamingCompletion(
  req: ChatCompletionRequest,
  res: http.ServerResponse,
): Promise<void> {
  if (!state.tokenizer || !state.model) {
    throw new Error('No model loaded');
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const prompt = formatChatPrompt(req.messages, state.tokenizer);
  const inputs = state.tokenizer(prompt, { return_tensors: 'pt' });
  const maxNewTokens = req.max_tokens || 512;
  const temperature = req.temperature ?? 0.7;
  const topP = req.top_p ?? 0.9;

  const completionId = `chatcmpl-hf-${Date.now()}`;

  try {
    await state.model.generate({
      ...inputs,
      max_new_tokens: maxNewTokens,
      temperature,
      top_p: topP,
      do_sample: temperature > 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback_function: (output: any) => {
        const lastToken = output.slice(null, [-1, null]);
        // Capture tokenizer before async generate to avoid null-deref if stopServer fires mid-stream
        const tokenizer = state.tokenizer;
        if (!tokenizer) {
          return;
        }
        const tokenText = tokenizer.decode(lastToken[0], { skip_special_tokens: true });

        if (tokenText) {
          const chunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: state.loadedModelId,
            choices: [
              {
                index: 0,
                delta: { content: tokenText },
                finish_reason: null,
              },
            ],
          };
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      },
    });

    const stopChunk = {
      id: completionId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: state.loadedModelId,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop',
        },
      ],
    };
    res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
    res.write('data: [DONE]\n\n');
  } catch (error) {
    const errorChunk = {
      error: {
        message: error instanceof Error ? error.message : 'Generation failed',
        type: 'server_error',
      },
    };
    res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
  } finally {
    // Guard against double-end: handleStreamingCompletion may have already ended the stream
    if (!res.writableEnded) {
      res.end();
    }
  }
}

/**
 * Read the full request body as a string.
 * Enforces a max size limit (default 10MB) to prevent OOM.
 */
export function readBody(
  req: http.IncomingMessage,
  limitBytes = 10 * 1024 * 1024,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limitBytes) {
        req.destroy(); // Stop receiving data
        reject(new Error('PayloadTooLarge'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/**
 * Create the HTTP request handler for the inference server.
 */
export function createRequestHandler(): (
  req: http.IncomingMessage,
  res: http.ServerResponse,
) => Promise<void> {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    // CORS headers
    const origin = req.headers.origin;
    if (origin && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else {
      res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url || '';

    try {
      // GET /v1/models
      if (req.method === 'GET' && url === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            object: 'list',
            data: state.loadedModelId
              ? [
                  {
                    id: state.loadedModelId,
                    object: 'model',
                    created: Math.floor(Date.now() / 1000),
                    owned_by: 'huggingface-local',
                  },
                ]
              : [],
          }),
        );
        return;
      }

      // POST /v1/chat/completions
      if (req.method === 'POST' && url === '/v1/chat/completions') {
        if (state.isLoading) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: { message: 'Model is loading, please wait', type: 'server_error' },
            }),
          );
          return;
        }

        if (!state.model || !state.tokenizer) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'No model loaded', type: 'server_error' } }));
          return;
        }

        const body = await readBody(req);
        let chatReq: ChatCompletionRequest;
        try {
          chatReq = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: { message: 'Invalid JSON in request body', type: 'invalid_request_error' },
            }),
          );
          return;
        }

        if (!Array.isArray(chatReq.messages) || chatReq.messages.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: {
                message: 'messages must be a non-empty array',
                type: 'invalid_request_error',
              },
            }),
          );
          return;
        }

        for (const message of chatReq.messages) {
          if (
            !message ||
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (message as any).role === undefined ||
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (message as any).content === undefined ||
            typeof message.content !== 'string' ||
            !['system', 'user', 'assistant'].includes(message.role)
          ) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                error: { message: 'Invalid message format', type: 'invalid_request_error' },
              }),
            );
            return;
          }
        }

        if (chatReq.stream) {
          await handleStreamingCompletion(chatReq, res);
        } else {
          const result = await handleChatCompletion(chatReq);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        }
        return;
      }

      // Health check
      if (req.method === 'GET' && (url === '/health' || url === '/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            model: state.loadedModelId,
            isLoading: state.isLoading,
          }),
        );
        return;
      }

      // 404 for everything else
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Not found', type: 'invalid_request' } }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      getLogCollector().logEnv('ERROR', '[HF Server] Request error:', { error: String(error) });

      if (error.message === 'PayloadTooLarge') {
        if (!res.headersSent) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: { message: 'Request entity too large', type: 'invalid_request_error' },
            }),
          );
        }
        return;
      }

      if (!res.writableEnded) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
        }
        res.end(
          JSON.stringify({
            error: {
              message: error instanceof Error ? error.message : 'Internal server error',
              type: 'server_error',
            },
          }),
        );
      }
    }
  };
}
