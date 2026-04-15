import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { WhatsAppCard } from './WhatsAppCard';
import { SlackConnectorSection } from '@/components/settings/connectors/SlackConnectorSection';
import { ConnectorAddForm } from '@/components/settings/connectors/ConnectorAddForm';
import { ConnectorList } from '@/components/settings/connectors/ConnectorList';
import { useConnectorsPanel } from '@/components/settings/connectors/useConnectorsPanel';
import { GoogleAccountsSection } from '../google-accounts/GoogleAccountsSection';

export function IntegrationsPanel() {
  const { t } = useTranslation('settings');
  const {
    connectors,
    slackAuth,
    loading,
    deleteConnector,
    toggleEnabled,
    disconnect,
    url,
    adding,
    slackActionLoading,
    addError,
    oauthError,
    handleAdd,
    handleConnect,
    handleSlackAuthenticate,
    handleSlackDisconnect,
    handleKeyDown,
    handleUrlChange,
  } = useConnectorsPanel();

  return (
    <div className="space-y-6" data-testid="integrations-panel">
      <GoogleAccountsSection />

      <div>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('integrations.messaging')}
        </h4>

        <WhatsAppCard />

        <SlackConnectorSection
          slackAuth={slackAuth}
          slackActionLoading={slackActionLoading}
          onAuthenticate={handleSlackAuthenticate}
          onDisconnect={handleSlackDisconnect}
        />

        {(['Telegram', 'Microsoft Teams'] as const).map((name) => (
          <div
            key={name}
            className="mt-3 rounded-lg border border-border/50 bg-card overflow-hidden opacity-60"
          >
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-muted" />
                <div>
                  <span className="font-medium text-foreground text-sm">{name}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('integrations.comingSoon')}
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t('integrations.comingSoon')}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('connectors.title')}
        </h4>

        {loading ? (
          <div className="flex h-[120px] items-center justify-center">
            <div className="text-sm text-muted-foreground">{t('connectors.loading')}</div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{t('connectors.customDescription')}</p>

            <ConnectorAddForm
              url={url}
              adding={adding}
              onUrlChange={handleUrlChange}
              onAdd={handleAdd}
              onKeyDown={handleKeyDown}
            />

            <AnimatePresence>
              {(oauthError || addError) && (
                <motion.div
                  className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  variants={settingsVariants.fadeSlide}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={settingsTransitions.enter}
                  role="alert"
                  aria-live="assertive"
                  aria-atomic="true"
                >
                  {oauthError || addError}
                </motion.div>
              )}
            </AnimatePresence>

            <ConnectorList
              connectors={connectors}
              onConnect={handleConnect}
              onDisconnect={disconnect}
              onToggleEnabled={toggleEnabled}
              onDelete={deleteConnector}
            />
          </div>
        )}
      </div>
    </div>
  );
}
