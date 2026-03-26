import { useState, useEffect } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import type { ConnectedProvider, CopilotOAuthCredentials } from '@accomplish_ai/agent-core';
import { COPILOT_MODELS } from '@accomplish_ai/agent-core/common';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useCopilotConnection');

function buildCopilotProvider(): ConnectedProvider {
  return {
    providerId: 'copilot',
    connectionStatus: 'connected',
    selectedModelId: 'copilot/gpt-4o',
    credentials: { type: 'copilot-oauth' } as CopilotOAuthCredentials,
    lastConnectedAt: new Date().toISOString(),
    availableModels: COPILOT_MODELS.map((m) => ({ id: m.id, name: m.displayName })),
  };
}

interface UseCopilotConnectionOptions {
  isConnected: boolean;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
}

interface UseCopilotConnectionResult {
  connecting: boolean;
  error: string | null;
  userCode: string | null;
  verificationUri: string | null;
  handleConnect: () => Promise<void>;
  handleDisconnect: () => Promise<void>;
}

export function useCopilotConnection({
  isConnected,
  onConnect,
  onDisconnect,
}: UseCopilotConnectionOptions): UseCopilotConnectionResult {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [verificationUri, setVerificationUri] = useState<string | null>(null);

  // Check if already connected on mount
  useEffect(() => {
    if (isConnected) {
      return;
    }

    const accomplish = getAccomplish();
    accomplish
      .getCopilotOAuthStatus()
      .then((status) => {
        if (status.connected) {
          onConnect(buildCopilotProvider());
        }
      })
      .catch((err) => logger.error('Failed to check Copilot status:', err));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    setUserCode(null);
    setVerificationUri(null);

    let pollStarted = false;

    try {
      const accomplish = getAccomplish();

      // loginGithubCopilot now returns immediately with the user code;
      // polling continues in the background on the main process side.
      const result = await accomplish.loginGithubCopilot();

      if (result.ok) {
        if (result.userCode) {
          setUserCode(result.userCode);
        }
        if (result.verificationUri) {
          setVerificationUri(result.verificationUri);
        }
        // Keep connecting=true while the background poll is in flight to prevent re-clicks.
        pollStarted = true;

        // Drive timeout from the real expires_in returned by the main process (default 900s).
        const POLL_INTERVAL_MS = 5000;
        const expiresInMs = (result.expiresIn ?? 900) * 1000;
        const MAX_ATTEMPTS = Math.max(1, Math.ceil(expiresInMs / POLL_INTERVAL_MS));

        const poll = async () => {
          for (let i = 0; i < MAX_ATTEMPTS; i++) {
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
            const status = await accomplish.getCopilotOAuthStatus();
            if (status.connected) {
              onConnect(buildCopilotProvider());
              setUserCode(null);
              setVerificationUri(null);
              setConnecting(false);
              return;
            }
          }
          setError('Timed out waiting for GitHub authorization. Please try again.');
          setUserCode(null);
          setVerificationUri(null);
          setConnecting(false);
        };

        void poll().catch((err) => {
          logger.error('Error polling Copilot status:', err);
          setError(err instanceof Error ? err.message : 'Connection failed');
          setConnecting(false);
        });

        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      // Only clear connecting if we didn't hand off to the background poll.
      if (!pollStarted) {
        setConnecting(false);
      }
    }
  };

  const handleDisconnect = async () => {
    try {
      const accomplish = getAccomplish();
      await accomplish.logoutGithubCopilot();
    } catch (err) {
      logger.error('Failed to logout from Copilot:', err);
    }
    setUserCode(null);
    setVerificationUri(null);
    onDisconnect();
  };

  return {
    connecting,
    error,
    userCode,
    verificationUri,
    handleConnect,
    handleDisconnect,
  };
}
