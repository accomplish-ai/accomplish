/**
 * Desktop Connector State
 *
 * In-memory connection state for built-in connectors that use custom flows
 * instead of ConnectorAuthStore (i.e., GitHub and Google). State is initialized
 * at startup and updated as connectors connect/disconnect during the session.
 */

const connectedProviders = new Set<string>();

export function setDesktopConnectorConnected(providerId: string, connected: boolean): void {
  if (connected) {
    connectedProviders.add(providerId);
  } else {
    connectedProviders.delete(providerId);
  }
}

export function isDesktopConnectorConnected(providerId: string): boolean {
  return connectedProviders.has(providerId);
}
