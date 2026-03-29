import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { ConnectorCard } from './ConnectorCard';
import type { McpConnector } from '@accomplish_ai/agent-core/common';

interface ConnectorListProps {
  connectors: McpConnector[];
  onConnect: (connectorId: string) => void;
  onDisconnect: (connectorId: string) => void;
  onToggleEnabled: (connectorId: string) => void;
  onDelete: (connectorId: string) => void;
}

export function ConnectorList({
  connectors,
  onConnect,
  onDisconnect,
  onToggleEnabled,
  onDelete,
}: ConnectorListProps) {
  const { t } = useTranslation('settings');

  if (connectors.length > 0) {
    return (
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
                onConnect={onConnect}
                onDisconnect={onDisconnect}
                onToggleEnabled={onToggleEnabled}
                onDelete={onDelete}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <motion.div
      className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
      variants={settingsVariants.fadeSlide}
      initial="initial"
      animate="animate"
      transition={settingsTransitions.enter}
    >
      {t('connectors.empty')}
    </motion.div>
  );
}
