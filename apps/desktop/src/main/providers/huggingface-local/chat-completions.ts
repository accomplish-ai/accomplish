/**
 * Chat completion handlers for the HuggingFace Local inference server.
 * Implements non-streaming and streaming (SSE) completion logic.
 */

import http from 'http';
import { getLogCollector } from '../../logging';
import {
  state,
  type ChatCompletionRequest,
  incrementGenerations,
  decrementGenerations,
} from './server-state';
import { formatChatPrompt } from './model-loader';
import { writeJsonError } from './request-helpers';

/**
 * Validate sampling parameters and write a 400 error if invalid.
 * Returns true if valid, false if an error was written.
 */
export function validateSamplingParams(
  chatReq: ChatCompletionRequest,
  res: http.ServerResponse,
): boolean {
  const maxTokens = chatReq.max_tokens ?? 512;
  const temperature = chatReq.temperature ?? 0.7;
  const topP = chatReq.top_p ?? 0.9;

  if (!Number.isFinite(maxTokens) || maxTokens < 1 || maxTokens > 32768) {
    writeJsonError(res, 400, 'max_tokens must be between 1 and 32768');
    return false;
  }
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    writeJsonError(res, 400, 'temperature must be between 0 and 2');
    return false;
  }
  if (!Number.isFinite(topP) || topP <= 0 || topP > 1) {
    writeJsonError(res, 400, 'top_p must be between 0 and 1');
    return false;
  }
  return true;
}

/**
 * Handle a chat completion request (non-streaming).
 */
export async function handleChatCompletion(
  req: ChatCompletionRequest,
  res: http.ServerResponse,
): Promise<void> {
  if (!state.tokenizer || !state.model) {
    writeJsonError(res, 503, 'No model loaded', 'server_error');
    return;
  }

  if (!validateSamplingParams(req, res)) return;

  const maxNewTokens = req.max_tokens ?? 512;
  const temperature = req.temperature ?? 0.7;
  const topP = req.top_p ?? 0.9;

  const prompt = formatChatPrompt(req.messages, state.tokenizer);
  const inputs = state.tokenizer(prompt, { return_tensor: true });

  incrementGenerations();
  try {
    const outputs = await state.model.generate({
      ...inputs,
      max_new_tokens: maxNewTokens,
      temperature,
      top_p: topP,
      do_sample: temperature > 0,
    });

    const promptLength = inputs.input_ids.dims?.[1] || 0;
    const generatedTokens = outputs.slice(null, promptLength);
    const text = state.tokenizer!.decode(generatedTokens[0], { skip_special_tokens: true });

    const completionTokens = generatedTokens.dims?.[1] || 0;
    const totalTokens = promptLength + completionTokens;

    const result = {
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

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } finally {
    decrementGenerations();
  }
}

/**
 * Handle a streaming chat completion request via SSE.
 */
export async function handleStreamingCompletion(
  req: ChatCompletionRequest,
  res: http.ServerResponse,
): Promise<void> {
  if (!state.tokenizer || !state.model) {
    writeJsonError(res, 503, 'No model loaded', 'server_error');
    return;
  }

  if (!validateSamplingParams(req, res)) return;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const prompt = formatChatPrompt(req.messages, state.tokenizer);
  const inputs = state.tokenizer(prompt, { return_tensor: true });
  const maxNewTokens = req.max_tokens ?? 512;
  const temperature = req.temperature ?? 0.7;
  const topP = req.top_p ?? 0.9;

  const completionId = `chatcmpl-hf-${Date.now()}`;

  incrementGenerations();
  try {
    await state.model.generate({
      ...inputs,
      max_new_tokens: maxNewTokens,
      temperature,
      top_p: topP,
      do_sample: temperature > 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback_function: (output: any) => {
        const lastToken = output.slice(null, -1);
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
    getLogCollector().logEnv('ERROR', '[HF Server] Streaming generation error:', {
      error: String(error),
    });
  } finally {
    decrementGenerations();
    // Guard against double-end
    if (!res.writableEnded) {
      res.end();
    }
  }
}
