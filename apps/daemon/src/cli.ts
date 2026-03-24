export function parseArgs(argv: string[] = process.argv.slice(2)): {
  socketPath?: string;
  dataDir?: string;
  version?: boolean;
} {
  const result: { socketPath?: string; dataDir?: string; version?: boolean } = {};

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--socket-path' && argv[i + 1]) {
      result.socketPath = argv[i + 1];
      i++;
    } else if (argv[i] === '--data-dir' && argv[i + 1]) {
      result.dataDir = argv[i + 1];
      i++;
    } else if (argv[i] === '--version') {
      result.version = true;
    }
  }

  return result;
}
