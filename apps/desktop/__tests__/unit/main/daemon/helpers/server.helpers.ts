import net from 'net';

export const SERVER_READY_WAIT = process.platform === 'win32' ? 800 : 200;

function makeSocketClient(
  socketPath: string,
  onData: (line: string) => void,
): { client: net.Socket; cleanup: () => void } {
  const client = net.createConnection(socketPath);
  let buffer = '';

  const cleanup = () => {
    try {
      client.destroy();
    } catch {
      /* ignore */
    }
  };

  client.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) {
        onData(line.trim());
      }
    }
  });
  client.on('close', () => {
    buffer = '';
  });
  client.on('end', () => {
    buffer = '';
  });

  return { client, cleanup };
}

export function sendJsonRpc(
  socketPath: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const { client, cleanup } = makeSocketClient(socketPath, (line) => {
      try {
        resolve(JSON.parse(line) as Record<string, unknown>);
      } catch {
        reject(new Error(`Invalid JSON: ${line}`));
      } finally {
        cleanup();
      }
    });

    client.on('connect', () => {
      client.write(JSON.stringify(payload) + '\n');
    });
    client.on('error', (err) => {
      cleanup();
      reject(err);
    });
    client.on('close', () => {
      reject(new Error('Connection closed before response'));
    });
    client.setTimeout(3000, () => {
      cleanup();
      reject(new Error('Timeout'));
    });
  });
}

export function sendRawLine(socketPath: string, rawLine: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const { client, cleanup } = makeSocketClient(socketPath, (line) => {
      try {
        resolve(JSON.parse(line) as Record<string, unknown>);
      } catch {
        reject(new Error(`Invalid JSON: ${line}`));
      } finally {
        cleanup();
      }
    });

    client.on('connect', () => {
      client.write(rawLine + '\n');
    });
    client.on('error', (err) => {
      cleanup();
      reject(err);
    });
    client.on('close', () => {
      reject(new Error('Connection closed before response'));
    });
    client.setTimeout(3000, () => {
      cleanup();
      reject(new Error('Timeout'));
    });
  });
}
