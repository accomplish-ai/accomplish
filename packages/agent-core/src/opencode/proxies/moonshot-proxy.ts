import http from 'http';
import https from 'https';
import { URL } from 'url';

const MOONSHOT_PROXY_PORT = 9229;
const MAX_REQUEST_SIZE = 10 * 1024 * 1024;
const DEBUG = process.env.DEBUG_MOONSHOT_PROXY === '1';

let server: http.Server | null = null;
let targetBaseUrl: string | null = null;

const reasoningContentCache = new Map<string, string>();

function hashMessageContent(msg: Record<string, unknown>): string {
  const content = String(msg.content || '');
  const toolCalls = JSON.stringify(msg.tool_calls || []);
  return `${content.slice(0, 100)}::${toolCalls.slice(0, 200)}`;
}

function extractAndCacheReasoningContent(responseText: string): void {
  let fullReasoningContent = '';
  let fullContent = '';
  let toolCalls: unknown[] = [];

  const lines = responseText.split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const jsonStr = line.slice(6).trim();
    if (jsonStr === '[DONE]') continue;

    try {
      const data = JSON.parse(jsonStr) as Record<string, unknown>;
      const choices = data.choices as Array<Record<string, unknown>> | undefined;
      if (!choices?.[0]) continue;

      const choice = choices[0];
      const delta = choice.delta as Record<string, unknown> | undefined;
      const message = choice.message as Record<string, unknown> | undefined;

      if (delta) {
        if (delta.reasoning_content) {
          fullReasoningContent += String(delta.reasoning_content);
        }
        if (delta.content) {
          fullContent += String(delta.content);
        }
        if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const tcObj = tc as Record<string, unknown>;
            const index = tcObj.index as number;
            if (!toolCalls[index]) {
              toolCalls[index] = { ...tcObj };
            } else {
              const existing = toolCalls[index] as Record<string, unknown>;
              if (tcObj.function && typeof tcObj.function === 'object') {
                const fn = tcObj.function as Record<string, unknown>;
                const existingFn = (existing.function || {}) as Record<string, unknown>;
                if (fn.arguments) {
                  existingFn.arguments = (existingFn.arguments || '') + String(fn.arguments);
                }
                existing.function = existingFn;
              }
            }
          }
        }
      }

      if (message) {
        if (message.reasoning_content) {
          fullReasoningContent = String(message.reasoning_content);
        }
        if (message.content) {
          fullContent = String(message.content);
        }
        if (message.tool_calls) {
          toolCalls = message.tool_calls as unknown[];
        }
      }
    } catch {
      // intentionally empty
    }
  }

  if (!fullReasoningContent) {
    try {
      const data = JSON.parse(responseText) as Record<string, unknown>;
      const choices = data.choices as Array<Record<string, unknown>> | undefined;
      if (choices?.[0]) {
        const message = choices[0].message as Record<string, unknown> | undefined;
        if (message?.reasoning_content) {
          fullReasoningContent = String(message.reasoning_content);
          fullContent = String(message.content || '');
          toolCalls = (message.tool_calls as unknown[]) || [];
        }
      }
    } catch {
      // intentionally empty
    }
  }

  if (fullReasoningContent && (fullContent || toolCalls.length > 0)) {
    const mockMsg: Record<string, unknown> = {
      content: fullContent,
      tool_calls: toolCalls,
    };
    const hash = hashMessageContent(mockMsg);
    reasoningContentCache.set(hash, fullReasoningContent);

    if (DEBUG) {
      console.log(
        `[Moonshot Proxy] Cached reasoning_content (${fullReasoningContent.length} chars) for hash: ${hash.slice(0, 50)}...`,
      );
    }

    if (reasoningContentCache.size > 100) {
      const firstKey = reasoningContentCache.keys().next().value;
      if (firstKey) reasoningContentCache.delete(firstKey);
    }
  }
}

export interface MoonshotProxyInfo {
  baseURL: string;
  targetBaseURL: string;
  port: number;
}

function normalizeBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`Invalid protocol: ${parsed.protocol}. Only http and https are supported.`);
    }
    return parsed.origin + parsed.pathname.replace(/\/$/, '');
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Invalid URL format: ${url}`);
    }
    throw error;
  }
}

function getProxyBaseUrl(): string {
  return `http://127.0.0.1:${MOONSHOT_PROXY_PORT}`;
}

function shouldTransformBody(contentType: string | undefined): boolean {
  return !!contentType && contentType.toLowerCase().includes('application/json');
}

export function transformMoonshotRequestBody(body: Buffer): Buffer {
  const text = body.toString('utf8');
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    let modified = false;

    if (DEBUG) {
      console.log('[Moonshot Proxy] Incoming request keys:', Object.keys(parsed));
      if (Array.isArray(parsed.messages)) {
        console.log('[Moonshot Proxy] Message count:', parsed.messages.length);
        parsed.messages.forEach((msg, i) => {
          const m = msg as Record<string, unknown>;
          console.log(
            `[Moonshot Proxy] Message ${i}: role=${m.role}, has_tool_calls=${Boolean(m.tool_calls)}, has_reasoning_content=${'reasoning_content' in m}`,
          );
        });
      }
    }

    const topLevelDisallowedKeys = ['enable_thinking', 'reasoning', 'reasoning_effort'];
    for (const key of topLevelDisallowedKeys) {
      if (key in parsed) {
        delete parsed[key];
        modified = true;
        if (DEBUG) {
          console.log(`[Moonshot Proxy] Removed top-level key: ${key}`);
        }
      }
    }

    if ('max_completion_tokens' in parsed && !('max_tokens' in parsed)) {
      parsed.max_tokens = parsed.max_completion_tokens;
      delete parsed.max_completion_tokens;
      modified = true;
    }

    const processMessagesArray = (messages: unknown): void => {
      if (!Array.isArray(messages)) return;
      for (const message of messages) {
        if (!message || typeof message !== 'object') continue;
        const msg = message as Record<string, unknown>;
        const role = msg.role;
        const _hasToolCalls = Boolean(msg.tool_calls);
        const _hasToolCallContent =
          Array.isArray(msg.content) &&
          msg.content.some(
            (item) =>
              item &&
              typeof item === 'object' &&
              (item as Record<string, unknown>).type === 'tool_call',
          );
        if (typeof role === 'string' && role === 'assistant' && !('reasoning_content' in msg)) {
          const hash = hashMessageContent(msg);
          const cachedReasoning = reasoningContentCache.get(hash);
          if (cachedReasoning) {
            msg.reasoning_content = cachedReasoning;
            if (DEBUG) {
              console.log(
                `[Moonshot Proxy] Restored reasoning_content from cache (${cachedReasoning.length} chars)`,
              );
            }
          } else {
            msg.reasoning_content = 'Thinking...';
            if (DEBUG) {
              console.log(`[Moonshot Proxy] No cached reasoning_content, using placeholder`);
            }
          }
          modified = true;
        }
      }
    };

    const visitForMessages = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        for (const item of value) visitForMessages(item);
        return;
      }
      const record = value as Record<string, unknown>;
      if ('messages' in record) {
        processMessagesArray(record.messages);
      }
      for (const key of Object.keys(record)) {
        visitForMessages(record[key]);
      }
    };

    visitForMessages(parsed);

    if (DEBUG) {
      console.log(`[Moonshot Proxy] Transform modified: ${modified}`);
      if (Array.isArray(parsed.messages)) {
        parsed.messages.forEach((msg, i) => {
          const m = msg as Record<string, unknown>;
          console.log(
            `[Moonshot Proxy] After transform msg ${i}: role=${m.role}, has_reasoning_content=${'reasoning_content' in m}, has_tool_calls=${Boolean(m.tool_calls)}`,
          );
        });
      }
    }

    const result = Buffer.from(JSON.stringify(parsed), 'utf8');
    if (DEBUG && modified) {
      console.log(`[Moonshot Proxy] Body transformed: ${body.length} -> ${result.length} bytes`);
    }
    return result;
  } catch (e) {
    console.error('[Moonshot Proxy] Transform error:', e);
    return body;
  }
}

function isValidRequestPath(pathname: string): boolean {
  if (pathname === '/health') return true;
  if (pathname === '/chat/completions' || pathname.startsWith('/chat/')) return true;
  if (pathname === '/completions' || pathname.startsWith('/completions/')) return true;
  if (pathname === '/embeddings' || pathname.startsWith('/embeddings/')) return true;
  if (pathname === '/models' || pathname.startsWith('/models/')) return true;
  return false;
}

function proxyRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', target: targetBaseUrl, port: MOONSHOT_PROXY_PORT }));
    return;
  }

  if (!targetBaseUrl) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Moonshot proxy target not configured',
        hint: 'Configure Moonshot AI in Settings > Providers',
      }),
    );
    return;
  }

  const url = new URL(req.url || '/', 'http://localhost');
  if (!isValidRequestPath(url.pathname)) {
    console.warn(`[Moonshot Proxy] Rejected invalid path: ${url.pathname}`);
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Invalid request path. Only OpenAI-compatible API paths are allowed.',
      }),
    );
    return;
  }

  const targetUrl = new URL(`${targetBaseUrl}${url.pathname}${url.search}`);
  const isHttps = targetUrl.protocol === 'https:';

  const chunks: Buffer[] = [];
  let totalSize = 0;
  let aborted = false;

  req.on('data', (chunk) => {
    if (aborted) return;
    totalSize += chunk.length;
    if (totalSize > MAX_REQUEST_SIZE) {
      aborted = true;
      console.warn(`[Moonshot Proxy] Request exceeded size limit: ${totalSize} bytes`);
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request too large. Maximum size is 10MB.' }));
      req.destroy();
      return;
    }
    chunks.push(Buffer.from(chunk));
  });

  req.on('end', () => {
    if (aborted) return;

    const rawBody = Buffer.concat(chunks);
    const contentType = req.headers['content-type'];
    const contentEncoding = req.headers['content-encoding'];

    if (DEBUG) {
      console.log(`[Moonshot Proxy] Request: ${req.method} ${req.url}`);
      console.log(
        `[Moonshot Proxy] Content-Type: ${contentType}, Content-Encoding: ${contentEncoding}, Body size: ${rawBody.length}`,
      );
    }

    const body =
      rawBody.length > 0 && shouldTransformBody(contentType)
        ? transformMoonshotRequestBody(rawBody)
        : rawBody;

    if (DEBUG) {
      console.log(`[Moonshot Proxy] Transformed body size: ${body.length} (was ${rawBody.length})`);
    }

    const headers = { ...req.headers } as Record<string, string | string[] | undefined>;
    delete headers.host;
    headers['content-length'] = String(body.length);

    const requestOptions: http.RequestOptions = {
      method: req.method,
      headers,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: `${targetUrl.pathname}${targetUrl.search}`,
    };

    const proxy = (isHttps ? https : http).request(requestOptions, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);

      const responseChunks: Buffer[] = [];

      proxyRes.on('data', (chunk: Buffer) => {
        responseChunks.push(chunk);
        res.write(chunk);
      });

      proxyRes.on('end', () => {
        res.end();

        try {
          const responseText = Buffer.concat(responseChunks).toString('utf8');
          extractAndCacheReasoningContent(responseText);
        } catch (e) {
          if (DEBUG) {
            console.error('[Moonshot Proxy] Error extracting reasoning_content:', e);
          }
        }
      });

      proxyRes.on('error', (err) => {
        console.error('[Moonshot Proxy] Response stream error:', err);
        res.end();
      });
    });

    proxy.on('error', (error) => {
      console.error('[Moonshot Proxy] Request error:', error);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
      }
      res.end(
        JSON.stringify({
          error: 'Moonshot proxy request failed',
          details: error.message,
          hint: 'Check your Moonshot API key and network connectivity',
        }),
      );
    });

    if (body.length > 0) {
      proxy.write(body);
    }
    proxy.end();
  });

  req.on('error', (error) => {
    console.error('[Moonshot Proxy] Incoming request error:', error);
    if (!res.headersSent) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ error: 'Invalid request', details: error.message }));
  });
}

export async function ensureMoonshotProxy(baseURL: string): Promise<MoonshotProxyInfo> {
  targetBaseUrl = normalizeBaseUrl(baseURL);

  if (!server) {
    server = http.createServer(proxyRequest);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Moonshot proxy server startup timeout'));
      }, 5000);

      server!.once('error', (error: NodeJS.ErrnoException) => {
        clearTimeout(timeout);
        server = null;
        if (error.code === 'EADDRINUSE') {
          reject(
            new Error(
              `Port ${MOONSHOT_PROXY_PORT} is already in use. ` +
                'Please close other applications using this port or restart the app.',
            ),
          );
        } else {
          reject(error);
        }
      });

      server!.listen(MOONSHOT_PROXY_PORT, '127.0.0.1', () => {
        clearTimeout(timeout);
        console.log(`[Moonshot Proxy] Listening on port ${MOONSHOT_PROXY_PORT}`);
        resolve();
      });
    });
  }

  return {
    baseURL: getProxyBaseUrl(),
    targetBaseURL: targetBaseUrl,
    port: MOONSHOT_PROXY_PORT,
  };
}

export async function stopMoonshotProxy(): Promise<void> {
  if (!server) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.warn('[Moonshot Proxy] Shutdown timeout, forcing close');
      server = null;
      targetBaseUrl = null;
      resolve();
    }, 3000);

    server!.close((err) => {
      clearTimeout(timeout);
      if (err && (err as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
        console.error('[Moonshot Proxy] Error during shutdown:', err);
        reject(err);
      } else {
        console.log('[Moonshot Proxy] Server stopped');
        resolve();
      }
    });

    server = null;
    targetBaseUrl = null;
  });
}

export function isMoonshotProxyRunning(): boolean {
  return server !== null && server.listening;
}
