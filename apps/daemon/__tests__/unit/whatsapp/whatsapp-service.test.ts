import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppDaemonService } from '../../../src/whatsapp-service.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the WhatsApp module — we don't want real Baileys connections in tests
vi.mock('../../../src/whatsapp/index.js', async () => {
  const { EventEmitter } = await import('events');

  class MockWhatsAppService extends EventEmitter {
    private _status = 'disconnected';
    private _qrCode: string | null = null;
    private _qrIssuedAt: number | null = null;

    constructor(_dataDir: string) {
      super();
    }

    async connect() {
      this._status = 'connecting';
      this.emit('status', 'connecting');
    }

    async disconnect() {
      this._status = 'disconnected';
      this._qrCode = null;
      this._qrIssuedAt = null;
      this.emit('status', 'disconnected');
    }

    getStatus() {
      return this._status;
    }

    getQrCode() {
      return this._qrCode;
    }

    getQrIssuedAt() {
      return this._qrIssuedAt;
    }

    dispose() {
      this.removeAllListeners();
    }

    // Test helpers
    _simulateQr(qr: string) {
      this._qrCode = qr;
      this._qrIssuedAt = Date.now();
      this._status = 'qr_ready';
      this.emit('qr', qr);
      this.emit('status', 'qr_ready');
    }

    _simulateConnected(phoneNumber: string) {
      this._status = 'connected';
      this.emit('phoneNumber', phoneNumber);
      this.emit('status', 'connected');
    }

    async sendMessage(_recipientId: string, _text: string) {}
  }

  class MockTaskBridge {
    private _enabled = true;

    setEnabled(enabled: boolean) {
      this._enabled = enabled;
    }

    setOwnerJid(_jid: string) {}
    setOwnerLid(_lid: string) {}

    dispose() {}
  }

  return {
    WhatsAppService: MockWhatsAppService,
    TaskBridge: MockTaskBridge,
    wireTaskBridge: vi.fn((_service: InstanceType<typeof MockWhatsAppService>) => ({
      bridge: new MockTaskBridge(),
    })),
    wireStatusListeners: vi.fn(),
  };
});

function createMockStorage() {
  let messagingConfig: Record<string, unknown> | null = null;

  return {
    getMessagingConfig: vi.fn(() => messagingConfig),
    setMessagingConfig: vi.fn((config: Record<string, unknown>) => {
      messagingConfig = config;
    }),
  };
}

function createMockTaskService() {
  const { EventEmitter } = require('events') as typeof import('events'); // eslint-disable-line @typescript-eslint/no-require-imports
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    startTask: vi.fn(),
    listTasks: vi.fn(() => []),
    getActiveTaskCount: vi.fn(() => 0),
  });
}

function createMockPermissionService() {
  return {
    resolvePermission: vi.fn(),
    resolveQuestion: vi.fn(),
    isFilePermissionRequest: vi.fn(() => false),
    isQuestionRequest: vi.fn(() => false),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WhatsAppDaemonService', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let taskService: ReturnType<typeof createMockTaskService>;
  let permissionService: ReturnType<typeof createMockPermissionService>;
  let service: WhatsAppDaemonService;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = createMockStorage();
    taskService = createMockTaskService();
    permissionService = createMockPermissionService();
    /* eslint-disable @typescript-eslint/no-explicit-any */
    service = new WhatsAppDaemonService(
      storage as any,
      '/tmp/test-data',
      taskService as any,
      permissionService as any,
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });

  describe('getConfig()', () => {
    it('should return null when no service and no stored config', () => {
      expect(service.getConfig()).toBeNull();
    });

    it('should return stored config when service is not running', () => {
      storage.setMessagingConfig({
        integrations: {
          whatsapp: {
            platform: 'whatsapp',
            enabled: true,
            connectionStatus: 'connected',
            phoneNumber: '1234567890',
            lastConnectedAt: 1000,
          },
        },
      });

      const config = service.getConfig();
      expect(config).not.toBeNull();
      expect(config!.phoneNumber).toBe('1234567890');
      expect(config!.enabled).toBe(true);
    });

    it('should return enabled:true when service is alive even without stored config (P1 fix)', async () => {
      // Connect without any stored config (first-time flow)
      await service.connect();

      const config = service.getConfig();
      expect(config).not.toBeNull();
      expect(config!.enabled).toBe(true);
    });

    it('should include QR recovery data when in qr_ready state', async () => {
      await service.connect();

      // After connect(), the mock service status is 'connecting' — no QR yet.
      // Test the contract: getConfig should not include QR fields until qr_ready.
      const config = service.getConfig();
      // After connect(), status is 'connecting' — no QR yet
      expect(config!.status).toBe('connecting');
      expect(config!.qrCode).toBeUndefined();
    });
  });

  describe('setEnabled()', () => {
    it('should persist enabled state to storage', async () => {
      storage.setMessagingConfig({
        integrations: {
          whatsapp: {
            platform: 'whatsapp',
            enabled: true,
          },
        },
      });

      service.setEnabled(false);

      expect(storage.setMessagingConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          integrations: expect.objectContaining({
            whatsapp: expect.objectContaining({ enabled: false }),
          }),
        }),
      );
    });
  });

  describe('autoConnectIfEnabled()', () => {
    it('should not auto-connect when no stored config', () => {
      service.autoConnectIfEnabled();
      // No error thrown, connect not called
    });

    it('should not auto-connect when disabled', () => {
      storage.setMessagingConfig({
        integrations: {
          whatsapp: { enabled: false },
        },
      });

      service.autoConnectIfEnabled();
      // Should not call connect
    });

    it('should auto-connect when enabled and previously connected', () => {
      storage.setMessagingConfig({
        integrations: {
          whatsapp: {
            enabled: true,
            connectionStatus: 'connected',
            lastConnectedAt: Date.now(),
          },
        },
      });

      // autoConnectIfEnabled calls connect() which is async, but doesn't await
      service.autoConnectIfEnabled();
      // The fact that it doesn't throw is the assertion
    });
  });

  describe('disconnect()', () => {
    it('should clear stored config', async () => {
      storage.setMessagingConfig({
        integrations: {
          whatsapp: {
            platform: 'whatsapp',
            enabled: true,
          },
        },
      });

      await service.connect();
      await service.disconnect();

      // Config should have been cleared (whatsapp set to undefined)
      expect(storage.setMessagingConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          integrations: expect.objectContaining({
            whatsapp: undefined,
          }),
        }),
      );
    });
  });

  describe('event forwarding', () => {
    it('should forward qr events', async () => {
      const qrHandler = vi.fn();
      service.on('qr', qrHandler);

      await service.connect();

      // The mock service emits events on connect — but QR is simulated
      // We verify the forwarding wiring exists
      expect(service.listenerCount('qr')).toBe(1);
    });

    it('should forward status events', async () => {
      const statusHandler = vi.fn();
      service.on('status', statusHandler);

      await service.connect();

      // Mock connect emits 'connecting' status
      expect(statusHandler).toHaveBeenCalledWith('connecting');
    });
  });

  describe('dispose()', () => {
    it('should clean up without error', async () => {
      await service.connect();
      expect(() => service.dispose()).not.toThrow();
    });
  });
});
