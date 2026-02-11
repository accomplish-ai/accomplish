/**
 * Translation API Server
 *
 * HTTP server that the translate-content MCP server calls to translate
 * text to/from the user's language. This bridges the MCP server
 * (separate process) with the main translation service.
 */

import http from 'http';
import {
  getTaskLanguage,
  translateFromEnglish,
  translateToEnglish,
} from './services/translationService';

export const TRANSLATION_API_PORT = 9228;

const MAX_BODY_SIZE = 1_000_000; // 1 MB

let getActiveTaskId: (() => string | null) | null = null;

/**
 * Initialize the translation API with dependencies
 */
export function initTranslationApi(taskIdGetter: () => string | null): void {
  getActiveTaskId = taskIdGetter;
}

/**
 * Create and start the HTTP server for translation requests
 */
export function startTranslationApiServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    // CORS headers for local requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Only handle POST /translate
    if (req.method !== 'POST' || req.url !== '/translate') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
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

    let data: {
      text?: string;
      direction?: 'to-user' | 'to-english';
    };

    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    // Validate required fields
    if (!data.text) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'text is required' }));
      return;
    }

    // Default direction is to-user (translate English content to user's language)
    const direction = data.direction || 'to-user';

    // Check if we have the necessary dependencies
    if (!getActiveTaskId) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Translation API not initialized' }));
      return;
    }

    const taskId = getActiveTaskId();
    if (!taskId) {
      // No active task means we can't determine the user's language
      // Return original text
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ translatedText: data.text, language: 'unknown' }));
      return;
    }

    // Get the user's language for this task
    const userLanguage = getTaskLanguage(taskId);
    if (!userLanguage || userLanguage === 'en') {
      // User is using English, no translation needed
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ translatedText: data.text, language: 'en' }));
      return;
    }

    try {
      let translatedText: string;

      if (direction === 'to-user') {
        // Translate from English to user's language
        translatedText = await translateFromEnglish(data.text, userLanguage);
      } else {
        // Translate from user's language to English
        translatedText = await translateToEnglish(data.text, userLanguage);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          translatedText,
          language: userLanguage,
          direction,
        })
      );
    } catch (error) {
      console.error('[Translation API] Translation failed:', error);
      // Return original text on error
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
