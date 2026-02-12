import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { ConnectorCard } from './ConnectorCard';
import { useConnectors } from './useConnectors';

export function ConnectorsPanel() {
  const {
    connectors,
    loading,
    addConnector,
    deleteConnector,
    toggleEnabled,
    startOAuth,
    completeOAuth,
    disconnect,
  } = useConnectors();

  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  // Listen for OAuth callback
  useEffect(() => {
    const unsubscribe = window.accomplish?.onMcpAuthCallback?.((callbackUrl: string) => {
      try {
        const parsed = new URL(callbackUrl);
        const code = parsed.searchParams.get('code');
        const state = parsed.searchParams.get('state');
        if (code && state) {
          completeOAuth(state, code).catch((err) => {
            console.error('Failed to complete OAuth:', err);
            setOauthError(err instanceof Error ? err.message : 'OAuth completion failed');
          });
        }
      } catch (err) {
        console.error('Failed to parse OAuth callback URL:', err);
        setOauthError('Invalid OAuth callback received');
      }
    });

    return () => unsubscribe?.();
  }, [completeOAuth]);

  const deriveNameFromUrl = useCallback((serverUrl: string): string => {
    try {
      const parsed = new URL(serverUrl);
      // Use hostname without TLD, capitalize first letter
      const parts = parsed.hostname.split('.');
      const name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    } catch {
      return 'MCP Server';
    }
  }, []);

  const handleAdd = useCallback(async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    // Basic URL validation
    try {
      const parsed = new URL(trimmedUrl);
      if (!parsed.protocol.startsWith('http')) {
        setAddError('URL must start with http:// or https://');
        return;
      }
    } catch {
      setAddError('Please enter a valid URL');
      return;
    }

    setAdding(true);
    setAddError(null);
    setOauthError(null);
    try {
      const name = deriveNameFromUrl(trimmedUrl);
      await addConnector(name, trimmedUrl);
      setUrl('');
    } catch (err) {
      console.error('Failed to add connector:', err);
      setAddError(err instanceof Error ? err.message : 'Failed to add connector');
    } finally {
      setAdding(false);
    }
  }, [url, addConnector, deriveNameFromUrl]);

  const handleConnect = useCallback(async (connectorId: string) => {
    setOauthError(null);
    try {
      await startOAuth(connectorId);
    } catch (err) {
      console.error('Failed to start OAuth:', err);
      setOauthError(err instanceof Error ? err.message : 'Failed to start OAuth flow');
    }
  }, [startOAuth]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !adding) {
        handleAdd();
      }
    },
    [handleAdd, adding]
  );

  if (loading) {
    return (
      <div className="flex h-[300px] items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading connectors...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Description */}
      <p className="text-sm text-muted-foreground">
        Connect remote MCP servers using OAuth. Only servers that support the
        OAuth 2.0 authorization flow are currently supported.
      </p>

      {/* Add form */}
      <div className="flex gap-2">
        <Input
          type="url"
          placeholder="https://mcp-server.example.com"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setAddError(null);
          }}
          onKeyDown={handleKeyDown}
          className="flex-1"
          disabled={adding}
        />
        <button
          onClick={handleAdd}
          disabled={adding || !url.trim()}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {adding ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          )}
          Add
        </button>
      </div>

      {/* Errors */}
      <AnimatePresence>
        {(addError || oauthError) && (
          <motion.div
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            variants={settingsVariants.fadeSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={settingsTransitions.enter}
          >
            {addError || oauthError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connector list */}
      {connectors.length > 0 ? (
        <div className="grid gap-3">
          <AnimatePresence mode="popLayout">
            {connectors.map((connector) => (
              <motion.div
                key={connector.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{
                  layout: { duration: 0.2 },
                  opacity: { duration: 0.15 },
                  scale: { duration: 0.15 },
                }}
              >
                <ConnectorCard
                  connector={connector}
                  onConnect={handleConnect}
                  onDisconnect={disconnect}
                  onToggleEnabled={toggleEnabled}
                  onDelete={deleteConnector}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <motion.div
          className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
          variants={settingsVariants.fadeSlide}
          initial="initial"
          animate="animate"
          transition={settingsTransitions.enter}
        >
          No MCP servers connected yet
        </motion.div>
      )}
    </div>
  );
}
