import crypto from 'crypto';

/**
 * Shared secret for authenticating requests to local HTTP servers
 * (permission-api, thought-stream-api). Generated once at module load
 * and passed to MCP tools via environment variable.
 */
export const SERVER_SECRET = crypto.randomBytes(32).toString('hex');
