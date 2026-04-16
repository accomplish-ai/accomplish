import http from 'http';

export interface OAuthCallbackResult {
  code: string;
  state: string;
  redirectUri: string;
}

export interface OAuthCallbackServer {
  redirectUri: string;
  waitForCallback: () => Promise<OAuthCallbackResult>;
  shutdown: () => void;
}

export interface OAuthCallbackServerOptions {
  host?: string;
  port?: number;
  callbackPath?: string;
  timeoutMs?: number;
}

const CALLBACK_TIMEOUT_MS = 60_000;

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><title>Authentication Successful</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
<div style="text-align:center"><h1>Authentication successful</h1><p>You can close this tab.</p></div>
</body></html>`;

const ERROR_HTML = `<!DOCTYPE html>
<html><head><title>Authentication Failed</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
<div style="text-align:center"><h1>Authentication failed</h1><p>Missing code or state parameter.</p></div>
</body></html>`;

function renderErrorHtml(message: string): string {
  return ERROR_HTML.replace('Missing code or state parameter.', message);
}

function closeServer(server: http.Server): void {
  server.closeAllConnections();
  server.close();
}

export async function createOAuthCallbackServer(
  options: OAuthCallbackServerOptions = {},
): Promise<OAuthCallbackServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 0;
  const callbackPath = options.callbackPath ?? '/callback';
  const timeoutMs = options.timeoutMs ?? CALLBACK_TIMEOUT_MS;
  let resolveCallback: (value: OAuthCallbackResult) => void;
  let rejectCallback: (reason: Error) => void;
  let settled = false;

  const callbackPromise = new Promise<OAuthCallbackResult>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const server = http.createServer((req, res) => {
    if (!req.url?.startsWith(callbackPath)) {
      res.writeHead(404);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${host}`);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    if (error) {
      const message = errorDescription ?? error;
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(renderErrorHtml(message), () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          closeServer(server);
          rejectCallback(new Error(message));
        }
      });
      return;
    }

    if (!code || !state) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(ERROR_HTML);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(SUCCESS_HTML, () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        closeServer(server);
        resolveCallback({ code, state, redirectUri });
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.on('error', reject);
  });

  const boundPort = (server.address() as { port: number }).port;
  const redirectUri = `http://${host}:${boundPort}${callbackPath}`;

  const timeout = setTimeout(() => {
    if (!settled) {
      settled = true;
      closeServer(server);
      rejectCallback(new Error('OAuth callback timed out'));
    }
  }, timeoutMs);

  return {
    redirectUri,
    waitForCallback: () => callbackPromise,
    shutdown: () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        closeServer(server);
        rejectCallback(new Error('OAuth callback server shut down'));
      }
    },
  };
}
