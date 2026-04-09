/**
 * Minimal type declarations for the mixpanel Node.js SDK.
 * The official package does not ship types.
 */
declare module 'mixpanel' {
  interface Mixpanel {
    track(eventName: string, properties?: Record<string, unknown>): void;
    people: {
      set(
        distinctId: string,
        properties: Record<string, unknown>,
        callback?: (err: Error | undefined) => void,
      ): void;
    };
  }

  interface InitOptions {
    geolocate?: boolean;
    protocol?: string;
    host?: string;
    debug?: boolean;
    verbose?: boolean;
  }

  function init(token: string, options?: InitOptions): Mixpanel;
}
