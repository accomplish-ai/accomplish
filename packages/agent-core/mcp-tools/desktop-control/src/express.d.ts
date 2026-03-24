/**
 * Ambient type declaration for express.
 *
 * The desktop-control tool is not a pnpm workspace member (it is nested
 * inside packages/agent-core). Its devDependencies may not be installed
 * during normal development. This shim prevents IDE errors when the
 * @types/express package is not locally available.
 *
 * When the tool is built or run via tsx, the actual express types will
 * be resolved from the hoisted mcp-tools/node_modules.
 */
declare module 'express' {
  import type { Server } from 'http';
  import type { IncomingMessage, ServerResponse } from 'http';

  interface Request extends IncomingMessage {
    body: unknown;
    params: Record<string, string>;
    query: Record<string, string | string[] | undefined>;
  }

  interface Response extends ServerResponse {
    status(code: number): Response;
    json(body: unknown): Response;
  }

  type RequestHandler = (req: Request, res: Response, next: () => void) => void;

  interface Express {
    (req: IncomingMessage, res: ServerResponse): void;
    use(handler: RequestHandler): Express;
    use(middleware: { (req: Request, res: Response, next: () => void): void }): Express;
    get(path: string, handler: (req: Request, res: Response) => void): Express;
    post(path: string, handler: (req: Request, res: Response) => void | Promise<void>): Express;
    listen(port: number, hostname: string, callback: () => void): Server;
  }

  interface ExpressStatic {
    (): Express;
    json(): RequestHandler;
  }

  const express: ExpressStatic;
  export = express;
  export type { Express, Request, Response, RequestHandler };
}
