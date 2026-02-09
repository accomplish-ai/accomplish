import { describe, it, expect, beforeEach } from 'vitest';
import {
  configureFromEnv,
  configure,
  getFullPageName,
  getConnectionMode,
  resetConnection,
  type ConnectionConfig,
} from './connection.js';

describe('connection', () => {
  beforeEach(() => {
    resetConnection();
    delete process.env.CDP_ENDPOINT;
    delete process.env.CDP_SECRET;
    delete process.env.DEV_BROWSER_PORT;
    delete process.env.ACCOMPLISH_TASK_ID;
  });

  describe('configureFromEnv', () => {
    it('defaults to builtin mode when CDP_ENDPOINT is not set', () => {
      const cfg = configureFromEnv();
      expect(cfg.mode).toBe('builtin');
      expect(cfg.devBrowserUrl).toBe('http://localhost:9224');
    });

    it('uses remote mode when CDP_ENDPOINT is set', () => {
      process.env.CDP_ENDPOINT = 'http://remote-browser:9222';
      const cfg = configureFromEnv();
      expect(cfg.mode).toBe('remote');
      expect(cfg.cdpEndpoint).toBe('http://remote-browser:9222');
    });

    it('passes CDP_SECRET as header in remote mode', () => {
      process.env.CDP_ENDPOINT = 'http://remote:9222';
      process.env.CDP_SECRET = 'my-secret';
      const cfg = configureFromEnv();
      expect(cfg.cdpHeaders).toEqual({ 'X-CDP-Secret': 'my-secret' });
    });

    it('respects custom DEV_BROWSER_PORT in builtin mode', () => {
      process.env.DEV_BROWSER_PORT = '5555';
      const cfg = configureFromEnv();
      expect(cfg.devBrowserUrl).toBe('http://localhost:5555');
    });

    it('uses ACCOMPLISH_TASK_ID for task isolation', () => {
      process.env.ACCOMPLISH_TASK_ID = 'task-abc';
      const cfg = configureFromEnv();
      expect(cfg.taskId).toBe('task-abc');
    });

    it('defaults taskId to "default" when ACCOMPLISH_TASK_ID is not set', () => {
      const cfg = configureFromEnv();
      expect(cfg.taskId).toBe('default');
    });

    it('does not include cdpHeaders when CDP_SECRET is not set', () => {
      process.env.CDP_ENDPOINT = 'http://remote:9222';
      const cfg = configureFromEnv();
      expect(cfg.cdpHeaders).toEqual({});
    });
  });

  describe('configure', () => {
    it('sets config and getConnectionMode reflects it', () => {
      configure({ mode: 'remote', cdpEndpoint: 'ws://x', taskId: 'task-1' });
      expect(getConnectionMode()).toBe('remote');
    });

    it('switches between modes', () => {
      configure({ mode: 'builtin', devBrowserUrl: 'http://localhost:9224', taskId: 't' });
      expect(getConnectionMode()).toBe('builtin');

      configure({ mode: 'remote', cdpEndpoint: 'ws://x', taskId: 't' });
      expect(getConnectionMode()).toBe('remote');
    });
  });

  describe('getFullPageName', () => {
    it('prefixes page name with task ID', () => {
      configure({ mode: 'remote', cdpEndpoint: 'ws://x', taskId: 'task-1' });
      expect(getFullPageName('main')).toBe('task-1-main');
    });

    it('defaults to "main" when no name given', () => {
      configure({ mode: 'remote', cdpEndpoint: 'ws://x', taskId: 'task-1' });
      expect(getFullPageName()).toBe('task-1-main');
    });

    it('works with empty string page name', () => {
      configure({ mode: 'remote', cdpEndpoint: 'ws://x', taskId: 'task-1' });
      expect(getFullPageName('')).toBe('task-1-main');
    });

    it('uses configureFromEnv taskId', () => {
      process.env.ACCOMPLISH_TASK_ID = 'env-task';
      configureFromEnv();
      expect(getFullPageName('page1')).toBe('env-task-page1');
    });
  });
});
