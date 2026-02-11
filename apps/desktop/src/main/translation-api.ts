/**
 * Translation API Server
 *
 * Localhost HTTP bridge between the translate-content MCP server (child process)
 * and the main-process translation service. Authenticated via a shared secret
 * passed to the MCP server as TRANSLATION_API_SECRET env var.
 */

import crypto from 'crypto';
import http from 'http';
import {
  getTaskLanguage,
  translateFromEnglish,
  translateToEnglish,
} from './services/translationService';

export const TRANSLATION_API_PORT = 9228;

/** Random per-launch secret; pass to MCP child processes via env. */
export const TRANSLATION_API_SECRET = crypto.randomBytes(32).toString('hex');

const MAX_BODY_SIZE = 1_000_000; // 1 MB

let getActiveTaskId: (() => string | null) | null = null;

export function initTranslationApi(taskIdGetter: () => string | null): void {
  getActiveTaskId = taskIdGetter;
}

export function startTranslationApiServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/translate') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Verify shared secret
    if (req.headers['x-translation-secret'] !== TRANSLATION_API_SECRET) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }

    let body = '';
    let bytesRead = 0;
    for await (const chunk of req) {
      bytesRead += (chunk as string | Buffer).length;
      if (bytesRead > MAX_BODY_SIZE) {
        req.destroy();
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        return;
      }
      body += chunk;
    }

    let data: { text?: string; direction?: 'to-user' | 'to-english' };

    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    if (!data.text) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'text is required' }));
      return;
    }

    const direction = data.direction || 'to-user';

    if (!getActiveTaskId) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Translation API not initialized' }));
      return;
    }

    const taskId = getActiveTaskId();
    if (!taskId) {
      // No active task — can't determine user language; return original text
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ translatedText: data.text, language: 'unknown' }));
      return;
    }

    const userLanguage = getTaskLanguage(taskId);
    if (!userLanguage || userLanguage === 'en') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ translatedText: data.text, language: 'en' }));
      return;
    }

    try {
      const translatedText =
        direction === 'to-user'
          ? await translateFromEnglish(data.text, userLanguage)
          : await translateToEnglish(data.text, userLanguage);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ translatedText, language: userLanguage, direction }));
    } catch (error) {
      console.error('[Translation API] Translation failed:', error);
      // Graceful degradation — return original text so the agent isn't blocked
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          translatedText: data.text,
          language: userLanguage,
          error: 'Translation failed, returning original text',
        })
      );
    }
  });

  server.listen(TRANSLATION_API_PORT, '127.0.0.1', () => {
    console.log(`[Translation API] Server listening on port ${TRANSLATION_API_PORT}`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(
        `[Translation API] Port ${TRANSLATION_API_PORT} already in use, skipping server start`
      );
    } else {
      console.error('[Translation API] Server error:', error);
    }
  });

  return server;
}
