import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WhatsAppCard } from './WhatsAppCard';
import { SlackConnectorSection } from '@/components/settings/connectors/SlackConnectorSection';
import { ConnectorAddForm } from '@/components/settings/connectors/ConnectorAddForm';
import { ConnectorList } from '@/components/settings/connectors/ConnectorList';
import { OAuthConnectorCard } from '@/components/settings/connectors/OAuthConnectorCard';
import { DatadogConnectorCard } from '@/components/settings/connectors/DatadogConnectorCard';
import { LightdashConnectorCard } from '@/components/settings/connectors/LightdashConnectorCard';
import { useConnectorsPanel } from '@/components/settings/connectors/useConnectorsPanel';
import { GoogleAccountsSection } from '../google-accounts/GoogleAccountsSection';
import { OAuthProviderId } from '@accomplish_ai/agent-core/common';
import jiraIcon from '/assets/icons/integrations/jira.svg';
import githubIcon from '/assets/icons/integrations/github.svg';
import notionIcon from '/assets/icons/integrations/notion.svg';
import mondayIcon from '/assets/icons/integrations/monday.svg';

export function IntegrationsPanel() {
  const { t } = useTranslation('settings');
  const {
    connectors,
    slackAuth,
    builtInAuthStates,
    builtInActionLoading,
    loading,
    deleteConnector,
    toggleEnabled,
    disconnect,
    url,
    adding,
    slackActionLoading,
    addError,
    tabError,
    dismissTabError,
    handleAdd,
    handleConnect,
    handleBuiltInAuthenticate,
    handleBuiltInDisconnect,
    handleSlackAuthenticate,
    handleSlackDisconnect,
    handleKeyDown,
    handleUrlChange,
    refetch,
  } = useConnectorsPanel();

  const getAuthState = (providerId: OAuthProviderId) =>
    builtInAuthStates[providerId] ?? { connected: false, pendingAuthorization: false };

  const isActionLoading = (providerId: OAuthProviderId) =>
    builtInActionLoading[providerId] ?? false;

  return (
    <div data-testid="integrations-panel">
      <Tabs defaultValue="messaging">
        <TabsList>
          <TabsTrigger value="messaging">{t('integrations.tabs.messaging')}</TabsTrigger>
          <TabsTrigger value="connectors">{t('integrations.tabs.connectors')}</TabsTrigger>
          <TabsTrigger value="custom">{t('integrations.tabs.custom')}</TabsTrigger>
        </TabsList>

        <AnimatePresence>
          {tabError && (
            <motion.div
              className="mt-3 flex items-center justify-between rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
              data-testid="tab-error-zone"
            >
              <span>{tabError}</span>
              <button
                onClick={dismissTabError}
                aria-label={t('integrations.errorDismiss')}
                className="ml-3 shrink-0 text-destructive opacity-70 hover:opacity-100"
                data-testid="tab-error-dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <TabsContent value="messaging">
          <div className="space-y-3">
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
                className="rounded-lg border border-border/50 bg-card overflow-hidden opacity-60"
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
        </TabsContent>

        <TabsContent value="connectors">
          <div className="flex flex-col gap-3">
            <GoogleAccountsSection />

            <OAuthConnectorCard
              iconSrc={jiraIcon}
              displayName={t('connectors.jira.title')}
              authState={getAuthState(OAuthProviderId.Jira)}
              actionLoading={isActionLoading(OAuthProviderId.Jira)}
              onAuthenticate={() => handleBuiltInAuthenticate(OAuthProviderId.Jira)}
              onDisconnect={() => handleBuiltInDisconnect(OAuthProviderId.Jira)}
              testId="jira-auth-card"
            />

            <OAuthConnectorCard
              iconSrc={githubIcon}
              displayName={t('connectors.github.title')}
              authState={getAuthState(OAuthProviderId.GitHub)}
              actionLoading={isActionLoading(OAuthProviderId.GitHub)}
              onAuthenticate={() => handleBuiltInAuthenticate(OAuthProviderId.GitHub)}
              onDisconnect={() => handleBuiltInDisconnect(OAuthProviderId.GitHub)}
              testId="github-auth-card"
            />

            <OAuthConnectorCard
              iconSrc={notionIcon}
              displayName={t('connectors.notion.title')}
              authState={getAuthState(OAuthProviderId.Notion)}
              actionLoading={isActionLoading(OAuthProviderId.Notion)}
              onAuthenticate={() => handleBuiltInAuthenticate(OAuthProviderId.Notion)}
              onDisconnect={() => handleBuiltInDisconnect(OAuthProviderId.Notion)}
              testId="notion-auth-card"
            />

            <OAuthConnectorCard
              iconSrc={mondayIcon}
              displayName={t('connectors.monday.title')}
              authState={getAuthState(OAuthProviderId.Monday)}
              actionLoading={isActionLoading(OAuthProviderId.Monday)}
              onAuthenticate={() => handleBuiltInAuthenticate(OAuthProviderId.Monday)}
              onDisconnect={() => handleBuiltInDisconnect(OAuthProviderId.Monday)}
              marketplaceUrl="https://monday.com/marketplace"
              testId="monday-auth-card"
            />

            <DatadogConnectorCard
              authState={getAuthState(OAuthProviderId.Datadog)}
              actionLoading={isActionLoading(OAuthProviderId.Datadog)}
              onAuthenticate={() => handleBuiltInAuthenticate(OAuthProviderId.Datadog)}
              onDisconnect={() => handleBuiltInDisconnect(OAuthProviderId.Datadog)}
              refetch={refetch}
            />

            <LightdashConnectorCard
              authState={getAuthState(OAuthProviderId.Lightdash)}
              actionLoading={isActionLoading(OAuthProviderId.Lightdash)}
              onAuthenticate={() => handleBuiltInAuthenticate(OAuthProviderId.Lightdash)}
              onDisconnect={() => handleBuiltInDisconnect(OAuthProviderId.Lightdash)}
              refetch={refetch}
            />
          </div>
        </TabsContent>

        <TabsContent value="custom">
          {loading ? (
            <div className="flex h-[120px] items-center justify-center">
              <div className="text-sm text-muted-foreground">{t('connectors.loading')}</div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <ConnectorAddForm
                url={url}
                adding={adding}
                onUrlChange={handleUrlChange}
                onAdd={handleAdd}
                onKeyDown={handleKeyDown}
              />

              <AnimatePresence>
                {addError && (
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
                    {addError}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
