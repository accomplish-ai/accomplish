import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { getAccomplish } from '@/lib/accomplish';

export function CloudBrowsersPanel() {
  const [apiKey, setApiKey] = useState('');
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<{
    id: string;
    projectId: string;
    enabled: boolean;
    lastValidated?: number;
  } | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [keyPrefix, setKeyPrefix] = useState<string | null>(null);

  const accomplish = getAccomplish();

  const fetchConfig = useCallback(async () => {
    try {
      const data = await accomplish.getBrowserbaseConfig();
      setConfig(data.config);
      setHasApiKey(data.hasApiKey);
      setKeyPrefix(data.keyPrefix);
      if (data.config?.projectId) {
        setProjectId(data.config.projectId);
      }
    } catch (err) {
      console.error('Failed to load Browserbase config:', err);
    } finally {
      setLoading(false);
    }
  }, [accomplish]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleConnect = async () => {
    const trimmedKey = apiKey.trim();
    const trimmedProjectId = projectId.trim();

    if (!trimmedKey) {
      setError('API key is required');
      return;
    }
    if (!trimmedProjectId) {
      setError('Project ID is required');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      await accomplish.connectBrowserbase(trimmedKey, trimmedProjectId);
      setApiKey('');
      await fetchConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      await accomplish.disconnectBrowserbase();
      setApiKey('');
      setProjectId('');
      await fetchConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[300px] items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading cloud browsers...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Connect cloud browser providers for browser automation tasks. Browserbase provides
        hosted browser sessions that can be used for web automation.
      </p>

      <motion.div
        className="rounded-lg border border-border bg-muted/30 p-4"
        variants={settingsVariants.fadeSlide}
        initial="initial"
        animate="animate"
        transition={settingsTransitions.enter}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-lg font-semibold text-primary">
            BB
          </div>
          <div>
            <h3 className="font-medium">Browserbase</h3>
            <p className="text-xs text-muted-foreground">
              Hosted browser sessions for automation
            </p>
          </div>
        </div>

        {config && hasApiKey ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-green-600 dark:text-green-400">
                Connected
              </span>
              {keyPrefix && (
                <span className="text-muted-foreground">API key: {keyPrefix}</span>
              )}
              <span className="text-muted-foreground">Project: {config.projectId}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={connecting}
            >
              {connecting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                'Disconnect'
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">API Key</label>
              <Input
                type="password"
                placeholder="bb_live_..."
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setError(null);
                }}
                disabled={connecting}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Project ID</label>
              <Input
                type="text"
                placeholder="Your Browserbase project ID"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setError(null);
                }}
                disabled={connecting}
              />
            </div>
            <a
              href="https://www.browserbase.com/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              Get API key and Project ID from Browserbase settings →
            </a>
            <Button
              onClick={handleConnect}
              disabled={connecting || !apiKey.trim() || !projectId.trim()}
            >
              {connecting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                'Connect'
              )}
            </Button>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            variants={settingsVariants.fadeSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={settingsTransitions.enter}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
