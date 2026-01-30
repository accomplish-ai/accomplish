// apps/desktop/src/renderer/components/settings/ProviderGrid.tsx

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import type { ProviderId, ProviderSettings } from '@accomplish/shared';
import { PROVIDER_META } from '@accomplish/shared';
import { ProviderCard } from './ProviderCard';
import { settingsVariants, settingsTransitions } from '@/lib/animations';

// Provider order matching Figma design (4 columns per row)
const PROVIDER_ORDER: ProviderId[] = [
  'openai',
  'anthropic',
  'google',
  'bedrock',
  'moonshot',
  'azure-foundry',
  'deepseek',
  'zai',
  'ollama',
  'lmstudio',
  'xai',
  'openrouter',
  'litellm',
  'minimax',
];

interface ProviderGridProps {
  settings: ProviderSettings;
  selectedProvider: ProviderId | null;
  onSelectProvider: (providerId: ProviderId) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}

export function ProviderGrid({
  settings,
  selectedProvider,
  onSelectProvider,
  expanded,
  onToggleExpanded,
}: ProviderGridProps) {
  const { t } = useTranslation('settings');
  const [search, setSearch] = useState('');

  const filteredProviders = useMemo(() => {
    if (!search.trim()) return PROVIDER_ORDER;
    const query = search.toLowerCase();
    return PROVIDER_ORDER.filter(id => {
      const meta = PROVIDER_META[id];
      return meta.name.toLowerCase().includes(query);
    });
  }, [search]);

  return (
    <div className="rounded-xl border border-border bg-[#edebe7] p-4" data-testid="provider-grid">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-foreground">{t('providers.title')}</span>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('providers.search')}
            data-testid="provider-search-input"
            className="w-48 rounded-md border border-input bg-background pl-9 pr-3 py-1.5 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Providers - first 4 always visible */}
      <div className="grid grid-cols-4 gap-3 min-h-[110px] justify-items-center">
        {filteredProviders.slice(0, 4).map(providerId => (
          <ProviderCard
            key={providerId}
            providerId={providerId}
            connectedProvider={settings?.connectedProviders?.[providerId]}
            isActive={settings?.activeProviderId === providerId}
            isSelected={selectedProvider === providerId}
            onSelect={onSelectProvider}
          />
        ))}
      </div>

      {/* Expanded providers (5-10) with staggered animation */}
      <AnimatePresence mode="sync">
        {expanded && filteredProviders.length > 4 && (
          <motion.div
            className="grid grid-cols-4 gap-3 mt-3 justify-items-center overflow-hidden"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {filteredProviders.slice(4).map((providerId, index) => (
              <motion.div
                key={providerId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: index * 0.03 }}
              >
                <ProviderCard
                  providerId={providerId}
                  connectedProvider={settings?.connectedProviders?.[providerId]}
                  isActive={settings?.activeProviderId === providerId}
                  isSelected={selectedProvider === providerId}
                  onSelect={onSelectProvider}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Show All / Hide toggle */}
      <div className="mt-4 text-center border-t border-border pt-3">
        <button
          onClick={onToggleExpanded}
          className="text-sm text-muted-foreground hover:text-foreground font-medium"
          data-testid="show-all-toggle"
        >
          {expanded ? t('providers.showLess') : t('providers.showMore')}
        </button>
      </div>
    </div>
  );
}
