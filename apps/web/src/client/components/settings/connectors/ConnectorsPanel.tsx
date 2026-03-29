import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { SlackConnectorSection } from './SlackConnectorSection';
import { ConnectorAddForm } from './ConnectorAddForm';
import { ConnectorList } from './ConnectorList';
import { useConnectorsPanel } from './useConnectorsPanel';

export function ConnectorsPanel() {
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

  if (loading) {
    return (
      <div className="flex h-[300px] items-center justify-center">
        <div className="text-sm text-muted-foreground">{t('connectors.loading')}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('connectors.description')}</p>

      <SlackConnectorSection
        slackAuth={slackAuth}
        slackActionLoading={slackActionLoading}
        onAuthenticate={handleSlackAuthenticate}
        onDisconnect={handleSlackDisconnect}
      />

      <ConnectorAddForm
        url={url}
        adding={adding}
        onUrlChange={handleUrlChange}
        onAdd={handleAdd}
        onKeyDown={handleKeyDown}
      />

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

      <ConnectorList
        connectors={connectors}
        onConnect={handleConnect}
        onDisconnect={disconnect}
        onToggleEnabled={toggleEnabled}
        onDelete={deleteConnector}
      />
    </div>
  );
}
