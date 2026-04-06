/**
 * HTTP utility helpers for the HuggingFace Local inference server.
 * Contains body-reading, JSON response helpers, and request validation.
 */

import http from 'http';
import type { ChatCompletionRequest } from './server-state';

/**
 * Read the full request body as a string.
 * Enforces a max size limit (default 10MB) to prevent OOM.
 * Does NOT destroy the socket on overflow — the caller is responsible for
 * sending a 413 response and ending the connection.
 */
export function readBody(
  req: http.IncomingMessage,
  limitBytes = 10 * 1024 * 1024,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    let overLimit = false;

    req.on('data', (chunk: Buffer) => {
      if (overLimit) return;
      size += chunk.length;
      if (size > limitBytes) {
        overLimit = true;
        reject(new Error('PayloadTooLarge'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!overLimit) {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Write a JSON error response.
 */
export function writeJsonError(
  res: http.ServerResponse,
  status: number,
  message: string,
  type = 'invalid_request_error',
): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message, type } }));
}

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
 * Set CORS headers on the response, restricted to localhost origins.
 */
export function setCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
