/// <reference types="vite/client" />

declare module 'proxy-from-env' {
  export function getProxyForUrl(url: string): string;
}
