import net from 'net';

export const SERVER_READY_WAIT = process.platform === 'win32' ? 800 : 200;

export function sendJsonRpc(
  socketPath: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath, () => {
      client.write(JSON.stringify(payload) + '\n');
    });

    let buffer = '';
    client.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) {
          client.destroy();
          resolve(JSON.parse(line) as Record<string, unknown>);
        }
      }
    });

    client.on('error', reject);
    client.setTimeout(3000, () => {
      client.destroy();
      reject(new Error('Timeout'));
    });
  });
}

export function sendRawLine(
  socketPath: string,
  rawLine: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const client = require('net').createConnection(socketPath, () => {
      client.write(rawLine + '\n');
    });
    let buffer = '';
    client.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines: string[] = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) {
          client.destroy();
          resolve(JSON.parse(line) as Record<string, unknown>);
        }
      }
    });
    client.on('error', reject);
    client.setTimeout(3000, () => { client.destroy(); reject(new Error('Timeout')); });
  });
}
