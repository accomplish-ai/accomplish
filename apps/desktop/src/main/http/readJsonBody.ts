import type { IncomingMessage } from 'http';

/**
 * Represents an HTTP error with a status code.
 * Thrown by readJsonBody when the request is invalid or too large.
 */
export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

/**
 * Reads and parses the JSON body of an incoming HTTP request.
 *
 * Security hardening:
 * - Enforces a configurable maximum body size (default: 1 MB) to prevent
 *   memory exhaustion from oversized payloads.
 * - Pauses the request stream when the limit is exceeded, allowing the caller
 *   to send a 413 response before the socket is torn down.
 * - Guarantees promise settlement on client abort or premature connection close.
 */
export async function readJsonBody<T = unknown>(
  req: IncomingMessage,
  options: { maxBytes?: number } = {},
): Promise<T> {
  const maxBytes = options.maxBytes ?? 1 * 1024 * 1024;

  return new Promise<T>((resolve, reject) => {
    let received = 0;
    const chunks: Buffer[] = [];
    let settled = false;

    const cleanup = (): void => {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('aborted', onAborted);
      req.off('close', onClose);
    };

    const settleReject = (err: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(err);
    };

    const settleResolve = (value: T): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };

    const onAborted = (): void => {
      settleReject(new HttpError(400, 'Client aborted request'));
    };

    const onClose = (): void => {
      if (!settled && !req.complete) {
        settleReject(new HttpError(400, 'Connection closed before request completed'));
      }
    };

    const onError = (err: Error): void => {
      settleReject(err);
    };

    const onData = (chunk: Buffer): void => {
      received += chunk.length;
      if (received > maxBytes) {
        req.pause();
        settleReject(new HttpError(413, 'Payload too large'));
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = (): void => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        settleReject(new HttpError(400, 'Empty request body'));
        return;
      }
      try {
        settleResolve(JSON.parse(raw) as T);
      } catch {
        settleReject(new HttpError(400, 'Invalid JSON'));
      }
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);
    req.on('close', onClose);
  });
}
