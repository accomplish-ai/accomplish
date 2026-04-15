import { useEffect, useState, useCallback } from 'react';
import { useOutlet, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { isRunningInElectron, getAccomplish } from './lib/accomplish';
import { logger } from './lib/logger';
import { springs, variants } from './lib/animations';
import type { ProviderId } from '@accomplish_ai/agent-core/common';
import { OAuthProviderId } from '@accomplish_ai/agent-core/common';

// Components
import Sidebar from './components/layout/Sidebar';
import { SidebarFallback } from './components/layout/SidebarFallback';
import { TaskLauncher } from './components/TaskLauncher';
import { AuthErrorToast } from './components/AuthErrorToast';
import { DaemonConnectionToast } from './components/DaemonConnectionToast';
import { CloseConfirmDialog } from './components/CloseConfirmDialog';
import SettingsDialog from './components/layout/SettingsDialog';
import { useTaskStore } from './stores/taskStore';
import { SpinnerGap, Warning } from '@phosphor-icons/react';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

type AppStatus = 'loading' | 'ready' | 'error';

/**
 * Freezes the outlet so exit animations can complete before the new outlet renders.
 */
function AnimatedOutlet() {
  const outlet = useOutlet();
  const [frozenOutlet] = useState(outlet);
  return frozenOutlet;
}

/**
 * Wraps the outlet with AnimatePresence + motion for page transitions.
 */
function AnimatedOutletWrapper() {
  const location = useLocation();

  // Analytics: track page views on route changes
  useEffect(() => {
    if (isRunningInElectron()) {
      try {
        getAccomplish()
          .analytics?.trackPageView(location.pathname)
          .catch(() => {});
      } catch {
        /* not in Electron or analytics unavailable */
      }
    }
  }, [location.pathname]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        className="h-full"
        initial="initial"
        animate="animate"
        exit="exit"
        variants={variants.fadeUp}
        transition={springs.gentle}
      >
        <AnimatedOutlet />
      </motion.div>
    </AnimatePresence>
  );
}

export function App() {
  const { t } = useTranslation('errors');
  const [status, setStatus] = useState<AppStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authSettingsOpen, setAuthSettingsOpen] = useState(false);
  const [authSettingsTab, setAuthSettingsTab] = useState<
    'providers' | 'voice' | 'skills' | 'integrations' | 'scheduler' | 'general' | 'about'
  >('providers');
  const [authSettingsProvider, setAuthSettingsProvider] = useState<ProviderId | undefined>(
    undefined,
  );

  // Get store state and actions
  const { openLauncher, authError, clearAuthError } = useTaskStore();

  // Handle re-login from auth error toast
  const handleAuthReLogin = useCallback(() => {
    if (authError) {
      if (authError.providerId === OAuthProviderId.Slack) {
        setAuthSettingsProvider(undefined);
        setAuthSettingsTab('integrations');
      } else {
        setAuthSettingsProvider(authError.providerId as ProviderId);
        setAuthSettingsTab('providers');
      }
      setAuthSettingsOpen(true);
    }
  }, [authError]);

  // Handle auth settings dialog close
  const handleAuthSettingsClose = useCallback(
    (open: boolean) => {
      setAuthSettingsOpen(open);
      if (!open) {
        setAuthSettingsTab('providers');
        setAuthSettingsProvider(undefined);
        clearAuthError();
      }
    },
    [clearAuthError],
  );

  // Cmd+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openLauncher();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openLauncher]);

  useEffect(() => {
    const checkStatus = async () => {
      if (!isRunningInElectron()) {
        setErrorMessage(t('app.mustRunInDesktop'));
        setStatus('error');
        return;
      }

      try {
        const accomplish = getAccomplish();
        await accomplish.setOnboardingComplete(true);
        setStatus('ready');
      } catch (error) {
        logger.error('Failed to initialize app:', error);
        setStatus('ready');
      }
    };

    checkStatus();
  }, [t]);

  // Loading state
  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <SpinnerGap className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="max-w-md text-center">
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <Warning className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <h1 className="mb-2 text-xl font-semibold text-foreground">{t('app.unableToStart')}</h1>
          <p className="text-muted-foreground">{errorMessage}</p>
        </div>
      </div>
    );
  }

  // Ready - render the app with sidebar
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Invisible drag region for window dragging (macOS hiddenInset titlebar) */}
      <div className="drag-region fixed top-0 left-0 right-0 h-10 z-50 pointer-events-none" />
      <ErrorBoundary fallback={(_error, _reset) => <SidebarFallback />}>
        <Sidebar />
      </ErrorBoundary>
      <main className="flex-1 overflow-hidden">
        <AnimatedOutletWrapper />
      </main>
      <TaskLauncher />

      {/* Auth Error Toast - shown when OAuth session expires */}
      <AuthErrorToast error={authError} onReLogin={handleAuthReLogin} onDismiss={clearAuthError} />

      {/* Daemon Connection Toast - shown when daemon disconnects */}
      <DaemonConnectionToast
        onOpenSettings={() => {
          setAuthSettingsTab('general');
          setAuthSettingsOpen(true);
        }}
      />

      {/* Close Confirmation Dialog - themed replacement for native OS dialog */}
      <CloseConfirmDialog />

      {/* Settings Dialog for re-authentication */}
      <SettingsDialog
        open={authSettingsOpen}
        onOpenChange={handleAuthSettingsClose}
        initialProvider={authSettingsProvider}
        initialTab={authSettingsTab}
        onApiKeySaved={() => {
          clearAuthError();
          setAuthSettingsOpen(false);
        }}
      />
    </div>
  );
}
