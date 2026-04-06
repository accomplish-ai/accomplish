/**
 * WhatsAppDaemonService — top-level orchestrator for WhatsApp in the daemon.
 *
 * Owns the lifecycle of WhatsAppService, TaskBridge, and storage sync.
 * Follows the same pattern as PermissionService/ThoughtStreamService:
 * service class in daemon, RPC methods in daemon-routes.ts, desktop IPC
 * handlers proxy to daemon RPC.
 *
 * Emits events for notification forwarding to connected Electron clients:
 *   'qr'     — QR code ready for display
 *   'status' — connection status changed
 */
import { EventEmitter } from 'node:events';
import type { StorageAPI } from '@accomplish_ai/agent-core';
import type { MessagingConnectionStatus } from '@accomplish_ai/agent-core/common';
import {
  WhatsAppService,
  TaskBridge,
  wireTaskBridge,
  wireStatusListeners,
} from './whatsapp/index.js';
import type { TaskService } from './task-service.js';
import type { PermissionService } from './permission-service.js';
import { log } from './logger.js';

export interface WhatsAppDaemonConfig {
  providerId: 'whatsapp';
  enabled: boolean;
  status: MessagingConnectionStatus;
  phoneNumber?: string;
  lastConnectedAt?: number;
  qrCode?: string;
  qrIssuedAt?: number;
}

export class WhatsAppDaemonService extends EventEmitter {
  private storage: StorageAPI;
  private dataDir: string;
  private taskService: TaskService;
  private permissionService: PermissionService;
  private service: WhatsAppService | null = null;
  private bridge: TaskBridge | null = null;

  constructor(
    storage: StorageAPI,
    dataDir: string,
    taskService: TaskService,
    permissionService: PermissionService,
  ) {
    super();
    this.storage = storage;
    this.dataDir = dataDir;
    this.taskService = taskService;
    this.permissionService = permissionService;
  }

  /**
   * Start the WhatsApp Baileys connection.
   * Creates WhatsAppService, wires TaskBridge and storage listeners,
   * then connects. Emits 'qr' and 'status' events for notification forwarding.
   */
  async connect(): Promise<void> {
    // Dispose previous if reconnecting
    if (this.service) {
      this.disposeInternal();
    }

    const service = new WhatsAppService(this.dataDir);
    this.service = service;

    // Wire task bridge (direct calls to taskService, not RPC)
    const { bridge } = wireTaskBridge(
      service,
      this.taskService,
      this.permissionService,
      this.storage,
    );
    this.bridge = bridge;

    // Initialize watermark on first connect (or first post-upgrade connect).
    // For upgrades: use lastConnectedAt so messages since the last session are caught up.
    // For fresh installs: use Date.now() to skip history replay.
    const config0 = this.storage.getMessagingConfig();
    const wa0 = config0?.integrations?.whatsapp;
    if (!wa0?.lastProcessedAt) {
      const initialWatermark = (wa0?.lastConnectedAt as number) ?? Date.now();
      this.storage.setMessagingConfig({
        integrations: {
          ...(config0?.integrations ?? {}),
          whatsapp: {
            ...(wa0 ?? { platform: 'whatsapp', enabled: true, tunnelEnabled: false }),
            lastProcessedAt: initialWatermark,
          },
        },
      });
    }

    // Wire storage sync (phone number, status persistence, ownerLid)
    wireStatusListeners(service, this.storage, bridge);

    // Restore enabled state from storage
    const config = this.storage.getMessagingConfig();
    const waConfig = config?.integrations?.whatsapp;
    if (waConfig?.enabled !== undefined) {
      bridge.setEnabled(waConfig.enabled);
    }

    // Forward events for RPC notification broadcasting
    service.on('qr', (qr: string) => this.emit('qr', qr));
    service.on('status', (status: MessagingConnectionStatus) => this.emit('status', status));

    await service.connect();
  }

  /**
   * Disconnect WhatsApp, clean auth state, and update storage.
   */
  async disconnect(): Promise<void> {
    if (this.service) {
      await this.service.disconnect();
    }
    this.disposeInternal();

    // Clear persisted config
    const config = this.storage.getMessagingConfig();
    if (config?.integrations?.whatsapp) {
      this.storage.setMessagingConfig({
        integrations: {
          ...(config.integrations ?? {}),
          whatsapp: undefined,
        },
      });
    }
  }

  /**
   * Get current WhatsApp config, including QR recovery data.
   * Returns null if WhatsApp was never configured.
   */
  getConfig(): WhatsAppDaemonConfig | null {
    const config = this.storage.getMessagingConfig();
    const waConfig = config?.integrations?.whatsapp;

    // Overlay live status from the service instance if available
    const liveStatus = this.service?.getStatus();
    const status: MessagingConnectionStatus =
      liveStatus ?? (waConfig?.connectionStatus as MessagingConnectionStatus) ?? 'disconnected';

    if (!waConfig && !this.service) {
      return null;
    }

    // If the service is alive (connect() was called), treat as enabled
    // even if the persisted config hasn't been written yet (first-time QR flow).
    const result: WhatsAppDaemonConfig = {
      providerId: 'whatsapp',
      enabled: this.service ? true : (waConfig?.enabled ?? false),
      status,
      phoneNumber: waConfig?.phoneNumber as string | undefined,
      lastConnectedAt: waConfig?.lastConnectedAt as number | undefined,
    };

    // Include QR recovery data when in qr_ready state
    if (status === 'qr_ready' && this.service) {
      const qrCode = this.service.getQrCode();
      const qrIssuedAt = this.service.getQrIssuedAt();
      if (qrCode && qrIssuedAt) {
        result.qrCode = qrCode;
        result.qrIssuedAt = qrIssuedAt;
      }
    }

    return result;
  }

  /**
   * Enable or disable the task bridge.
   */
  setEnabled(enabled: boolean): void {
    if (this.bridge) {
      this.bridge.setEnabled(enabled);
    }

    // Persist to storage
    const config = this.storage.getMessagingConfig();
    if (config?.integrations?.whatsapp) {
      this.storage.setMessagingConfig({
        integrations: {
          ...(config.integrations ?? {}),
          whatsapp: {
            ...(config.integrations.whatsapp ?? {}),
            enabled,
          },
        },
      });
    }
  }

  /**
   * Auto-connect if WhatsApp was previously enabled and connected.
   * Called once during daemon startup. Failures are logged but don't crash the daemon.
   */
  autoConnectIfEnabled(): void {
    const config = this.storage.getMessagingConfig();
    const waConfig = config?.integrations?.whatsapp;

    if (!waConfig?.enabled) {
      return;
    }

    // Only auto-connect if there was a previous successful connection
    // (meaning auth credentials exist on disk)
    const wasConnected = waConfig.connectionStatus === 'connected' || waConfig.lastConnectedAt;
    if (!wasConnected) {
      return;
    }

    log.info('[WhatsApp] Auto-connecting (previously enabled)...');
    this.connect().catch((err) => {
      log.error('[WhatsApp] Auto-connect failed:', err);
    });
  }

  /**
   * Clean shutdown — dispose service and bridge.
   */
  dispose(): void {
    this.disposeInternal();
    this.removeAllListeners();
  }

  private disposeInternal(): void {
    if (this.bridge) {
      this.bridge.dispose();
      this.bridge = null;
    }
    if (this.service) {
      this.service.dispose();
      this.service = null;
    }
  }
}
