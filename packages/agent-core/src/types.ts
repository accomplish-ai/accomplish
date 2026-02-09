export interface PlatformConfig {
  userDataPath: string;
  tempPath: string;
  isPackaged: boolean;
  resourcesPath?: string;
  appPath?: string;
  platform: NodeJS.Platform;
  arch: string;
}

export interface CliResolverConfig {
  isPackaged: boolean;
  resourcesPath?: string;
  appPath?: string;
}

export interface ResolvedCliPaths {
  cliPath: string;
  cliDir: string;
  source: 'bundled' | 'local' | 'global';
}

export interface BundledNodePaths {
  nodePath: string;
  npmPath: string;
  npxPath: string;
  binDir: string;
}
