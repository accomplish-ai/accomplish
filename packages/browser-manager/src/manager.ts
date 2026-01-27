import type { BrowserContext, Browser } from 'playwright';
import { chromium } from 'playwright';
import type {
  BrowserState,
  BrowserMode,
  AcquireOptions,
  StateSubscriber,
  BrowserManagerConfig,
} from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { findAvailablePorts, PortExhaustedError, checkPortStatus } from './port-finder.js';
import { performHealthCheck, evaluateHealth } from './health.js';
import { LaunchModeLauncher } from './launcher.js';

export class BrowserManager {
  private state: BrowserState = { status: 'idle' };
  private subscribers = new Set<StateSubscriber>();
  private config: Required<BrowserManagerConfig>;
  private context: BrowserContext | null = null;
  private browser: Browser | null = null;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private currentPorts: { http: number; cdp: number } | null = null;
  private reconnectAttempts = 0;
  private degradedSince: number | null = null;
  private readonly DEGRADED_WARNING_THRESHOLD_MS = 120000; // 2 minutes

  // Guards against concurrent operations
  private acquirePromise: Promise<Browser> | null = null;
  private reconnecting = false;
  private disconnectHandler: (() => void) | null = null;

  constructor(config: BrowserManagerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getState(): BrowserState {
    return this.state;
  }

  subscribe(callback: StateSubscriber): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private setState(newState: BrowserState): void {
    this.state = newState;
    for (const subscriber of this.subscribers) {
      try {
        subscriber(newState);
      } catch (err) {
        console.error('Subscriber error:', err);
      }
    }
  }

  async acquire(options: AcquireOptions = {}): Promise<Browser> {
    // Prevent concurrent acquire() calls - return existing promise if one is in progress
    if (this.acquirePromise) {
      return this.acquirePromise;
    }

    this.acquirePromise = this.doAcquire(options).finally(() => {
      this.acquirePromise = null;
    });

    return this.acquirePromise;
  }

  private async doAcquire(options: AcquireOptions): Promise<Browser> {
    const { preferExisting = false, headless = false } = options;

    try {
      // Find available ports
      let ports: { http: number; cdp: number };
      try {
        ports = await findAvailablePorts({
          portRangeStart: this.config.portRangeStart,
          portRangeEnd: this.config.portRangeEnd,
        });
      } catch (err) {
        if (err instanceof PortExhaustedError) {
          this.setState({
            status: 'failed_port_exhausted',
            triedPorts: err.triedPorts,
          });
          throw err;
        }
        throw err;
      }

      this.currentPorts = ports;

      // Check if we can reuse existing healthy server
      if (preferExisting) {
        this.setState({ status: 'checking_existing', port: ports.http });
        const portStatus = await checkPortStatus(ports.http, ports.cdp);

        if (portStatus === 'ours_healthy') {
          // Connect to existing browser
          this.setState({ status: 'connecting', port: ports.http });

          try {
            this.browser = await chromium.connectOverCDP(`http://localhost:${ports.cdp}`, {
              timeout: 5000,
            });

            // Get WebSocket endpoint
            const cdpResponse = await fetch(`http://127.0.0.1:${ports.cdp}/json/version`);
            if (!cdpResponse.ok) {
              throw new Error(`CDP endpoint returned ${cdpResponse.status}`);
            }
            const cdpInfo = (await cdpResponse.json()) as { webSocketDebuggerUrl: string };
            const wsEndpoint = cdpInfo.webSocketDebuggerUrl;
            if (!wsEndpoint) {
              throw new Error('CDP endpoint did not return webSocketDebuggerUrl');
            }

            const mode: BrowserMode = 'launch';

            this.setState({
              status: 'healthy',
              port: ports.http,
              cdpPort: ports.cdp,
              mode,
              wsEndpoint,
            });

            this.startHealthMonitoring();
            this.setupDisconnectHandler();

            return this.browser;
          } catch (err) {
            // Failed to connect, fall through to launch
            console.warn('Failed to connect to existing browser:', err);
          }
        }
      }

      // Launch new browser
      this.setState({ status: 'launching', port: ports.http });

      const launcher = new LaunchModeLauncher();
      const result = await launcher.launch(ports.http, ports.cdp, {
        headless,
        onProgress: (message) => {
          if (message.includes('Installing')) {
            this.setState({ status: 'installing_chromium' });
          }
        },
      });

      this.context = result.context;

      // Connect to the browser via CDP for monitoring
      this.setState({ status: 'connecting', port: ports.http });
      this.browser = await chromium.connectOverCDP(`http://localhost:${ports.cdp}`, {
        timeout: 5000,
      });

      const mode: BrowserMode = 'launch';

      this.setState({
        status: 'healthy',
        port: ports.http,
        cdpPort: ports.cdp,
        mode,
        wsEndpoint: result.wsEndpoint,
      });

      this.startHealthMonitoring();
      this.setupDisconnectHandler();

      return this.browser;
    } catch (err) {
      // Clean up any partially created resources
      await this.cleanupResources();

      if (err instanceof PortExhaustedError) {
        throw err; // Already set state above
      }

      this.setState({
        status: 'failed_launch',
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private setupDisconnectHandler(): void {
    if (!this.browser) return;

    // Remove old handler if exists to prevent memory leaks
    if (this.disconnectHandler && this.browser) {
      this.browser.off('disconnected', this.disconnectHandler);
    }

    // Create new handler
    this.disconnectHandler = () => {
      void this.handleDisconnect();
    };

    this.browser.on('disconnected', this.disconnectHandler);
  }

  private removeDisconnectHandler(): void {
    if (this.browser && this.disconnectHandler) {
      this.browser.off('disconnected', this.disconnectHandler);
    }
    this.disconnectHandler = null;
  }

  private startHealthMonitoring(): void {
    // Clear any existing interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      void this.performPeriodicHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  private async performPeriodicHealthCheck(): Promise<void> {
    if (!this.currentPorts) return;

    // Capture and validate state once at start
    const currentState = this.state;
    if (currentState.status !== 'healthy' && currentState.status !== 'degraded') return;

    const check = await performHealthCheck(this.currentPorts.http, this.currentPorts.cdp);
    const healthResult = evaluateHealth(check, this.config.degradedThresholdMs);

    // Check state hasn't changed during the async operation
    if (this.state.status !== 'healthy' && this.state.status !== 'degraded') return;

    if (healthResult.status === 'healthy') {
      // Reset degraded timer on recovery
      this.degradedSince = null;
      if (this.state.status === 'degraded') {
        // Recovered from degraded
        this.setState({
          status: 'healthy',
          port: currentState.port,
          cdpPort: currentState.cdpPort,
          mode: currentState.mode,
          wsEndpoint: currentState.wsEndpoint,
        });
      }
    } else if (healthResult.status === 'degraded') {
      // Track how long we've been degraded
      if (!this.degradedSince) {
        this.degradedSince = Date.now();
      } else if (Date.now() - this.degradedSince > this.DEGRADED_WARNING_THRESHOLD_MS) {
        console.warn('Browser has been degraded for >2 minutes');
      }
      this.setState({
        status: 'degraded',
        port: currentState.port,
        cdpPort: currentState.cdpPort,
        mode: currentState.mode,
        wsEndpoint: currentState.wsEndpoint,
        latency: healthResult.latency,
      });
    } else if (healthResult.status === 'stale' || healthResult.status === 'free') {
      // Browser has crashed
      void this.handleDisconnect();
    }
  }

  private async handleDisconnect(): Promise<void> {
    // Guard against concurrent reconnection attempts
    if (this.reconnecting) {
      return;
    }
    this.reconnecting = true;

    try {
      if (!this.currentPorts) return;

      // Stop health monitoring during reconnection
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      // Remove old disconnect handler
      this.removeDisconnectHandler();

      // Start reconnection attempts
      for (let attempt = 0; attempt < this.config.reconnectMaxAttempts; attempt++) {
        this.reconnectAttempts = attempt + 1;
        this.setState({
          status: 'reconnecting',
          port: this.currentPorts.http,
          attempt: attempt + 1,
          maxAttempts: this.config.reconnectMaxAttempts,
        });

        // Wait for backoff period
        const backoffMs = this.config.reconnectBackoffMs[attempt] || 4000;
        await new Promise(resolve => setTimeout(resolve, backoffMs));

        // Try to reconnect
        try {
          const check = await performHealthCheck(this.currentPorts.http, this.currentPorts.cdp);
          const healthResult = evaluateHealth(check, this.config.degradedThresholdMs);

          if (healthResult.status === 'healthy' || healthResult.status === 'degraded') {
            // Reconnect successful
            this.browser = await chromium.connectOverCDP(`http://localhost:${this.currentPorts.cdp}`, {
              timeout: 5000,
            });

            const cdpResponse = await fetch(`http://127.0.0.1:${this.currentPorts.cdp}/json/version`);
            const cdpInfo = (await cdpResponse.json()) as { webSocketDebuggerUrl: string };
            const wsEndpoint = cdpInfo.webSocketDebuggerUrl;

            const mode: BrowserMode = 'launch';

            this.setState({
              status: 'healthy',
              port: this.currentPorts.http,
              cdpPort: this.currentPorts.cdp,
              mode,
              wsEndpoint,
            });

            this.reconnectAttempts = 0;
            this.startHealthMonitoring();
            this.setupDisconnectHandler();
            return;
          }
        } catch (err) {
          // Log error for debugging
          console.warn(`Reconnection attempt ${attempt + 1} failed:`, err);
          // Continue to next attempt
          continue;
        }
      }

      // All reconnection attempts failed
      this.setState({
        status: 'failed_crashed',
        error: `Browser crashed after ${this.config.reconnectMaxAttempts} reconnection attempts`,
      });
      this.reconnectAttempts = 0;
    } finally {
      this.reconnecting = false;
    }
  }

  private async cleanupResources(): Promise<void> {
    // Clear health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Remove disconnect handler
    this.removeDisconnectHandler();

    // Close browser connection
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Ignore errors on close
      }
      this.browser = null;
    }

    // Close context (will close the actual browser process)
    if (this.context) {
      try {
        await this.context.close();
      } catch {
        // Ignore errors on close
      }
      this.context = null;
    }

    this.currentPorts = null;
    this.degradedSince = null;
  }

  async stop(): Promise<void> {
    await this.cleanupResources();
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this.setState({ status: 'idle' });
  }
}
