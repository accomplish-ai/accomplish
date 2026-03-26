/**
 * HTTP routing handler for the HuggingFace Local inference server.
 * Routes requests to the appropriate sub-handler and sets CORS headers.
 */

import http from 'http';
import { getLogCollector } from '../../logging';
import { state, type ChatCompletionRequest } from './server-state';
import { readBody, writeJsonError, setCorsHeaders } from './request-helpers';
import { handleChatCompletion, handleStreamingCompletion } from './chat-completions';

export { readBody } from './request-helpers';
export { handleChatCompletion, handleStreamingCompletion } from './chat-completions';

/**
 * Create the HTTP request handler for the inference server.
 */
export function createRequestHandler(): (
  req: http.IncomingMessage,
  res: http.ServerResponse,
) => Promise<void> {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    setCorsHeaders(req, res);

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
          writeJsonError(res, 503, 'Model is loading, please wait', 'server_error');
          return;
        }

        if (!state.model || !state.tokenizer) {
          writeJsonError(res, 503, 'No model loaded', 'server_error');
          return;
        }

        const body = await readBody(req);
        let chatReq: ChatCompletionRequest;
        try {
          chatReq = JSON.parse(body);
        } catch {
          writeJsonError(res, 400, 'Invalid JSON in request body');
          return;
        }

        if (!Array.isArray(chatReq.messages) || chatReq.messages.length === 0) {
          writeJsonError(res, 400, 'messages must be a non-empty array');
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
            writeJsonError(res, 400, 'Invalid message format');
            return;
          }
        }

        if (chatReq.stream) {
          await handleStreamingCompletion(chatReq, res);
        } else {
          await handleChatCompletion(chatReq, res);
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
      writeJsonError(res, 404, 'Not found', 'invalid_request');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      getLogCollector().logEnv('ERROR', '[HF Server] Request error:', { error: String(error) });

      if (error.message === 'PayloadTooLarge') {
        if (!res.headersSent) {
          writeJsonError(res, 413, 'Request entity too large');
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
