/**
 * HTTP utility helpers for the HuggingFace Local inference server.
 * Contains body-reading and JSON response helpers.
 */

import http from 'http';

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
