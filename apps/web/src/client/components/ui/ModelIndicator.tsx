/**
 * ModelIndicator component
 *
 * Ultra-minimal Claude-style model selector.
 * Shows current model with inline switching for same-provider siblings
 * and sub-menu access to all other connected providers.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretDown, Warning } from '@phosphor-icons/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  getModelDisplayName,
  DEFAULT_PROVIDERS,
  PROVIDER_META,
} from '@accomplish_ai/agent-core/common';
import type { ProviderId, ConnectedProvider } from '@accomplish_ai/agent-core/common';
import { useProviderSettings } from '@/components/settings/hooks/useProviderSettings';
import { ProviderSubMenu } from '@/components/ui/ProviderSubMenu';
import { cn } from '@/lib/utils';

interface ModelIndicatorProps {
  /** Whether a task is currently running */
  isRunning?: boolean;
  /** Callback kept for call-site compatibility — no longer used inside the dropdown */
  onOpenSettings: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Hide the indicator when no model is selected (instead of showing warning) */
  hideWhenNoModel?: boolean;
}

export function ModelIndicator({
  isRunning = false,
  className,
  hideWhenNoModel = false,
}: ModelIndicatorProps) {
  const { t } = useTranslation('common');
  const { settings, loading, refetch, updateModel, setActiveProvider } = useProviderSettings();
  const [open, setOpen] = useState(false);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        refetch();
      }
      setOpen(isOpen);
    },
    [refetch],
  );

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, 2000);
    return () => clearInterval(interval);
  }, [refetch]);

  const activeProviderId = settings?.activeProviderId;
  const activeProvider = activeProviderId ? settings?.connectedProviders[activeProviderId] : null;
  const selectedModelId = activeProvider?.selectedModelId;

  const hasModel = Boolean(activeProviderId && selectedModelId);
  const modelDisplayName = selectedModelId ? getModelDisplayName(selectedModelId) : null;
  const isWarning = !hasModel && !loading;

  // Same-provider sibling models (excludes the currently selected one)
  const siblingModels: Array<{ id: string; displayName: string }> = (() => {
    if (!activeProviderId || !selectedModelId) {
      return [];
    }
    const dynamic = activeProvider?.availableModels;
    const source =
      dynamic && dynamic.length > 0
        ? dynamic.map((m) => ({ id: m.id, displayName: m.name }))
        : (DEFAULT_PROVIDERS.find((p) => p.id === activeProviderId)?.models ?? []).map((m) => ({
            id: m.fullId,
            displayName: getModelDisplayName(m.fullId),
          }));
    return source.filter((m) => m.id !== selectedModelId);
  })();

  // Other connected providers (not the active one)
  const otherProviders = Object.entries(settings?.connectedProviders ?? {}).filter(
    ([id, p]) => id !== activeProviderId && p.connectionStatus === 'connected',
  ) as Array<[ProviderId, ConnectedProvider]>;

  const handleSelectModel = useCallback(
    async (modelId: string) => {
      if (!activeProviderId) {
        return;
      }
      setOpen(false);
      await updateModel(activeProviderId, modelId);
    },
    [activeProviderId, updateModel],
  );

  const handleSelectProviderModel = useCallback(
    async (providerId: ProviderId, modelId: string) => {
      setOpen(false);
      await updateModel(providerId, modelId);
      await setActiveProvider(providerId);
    },
    [updateModel, setActiveProvider],
  );

  if (loading) {
    return (
      <div className={cn('flex items-center gap-1 px-1 animate-pulse', className)}>
        <div className="w-20 h-4 rounded bg-muted-foreground/10" />
      </div>
    );
  }

  if (hideWhenNoModel && !hasModel) {
    return null;
  }

  if (isRunning) {
    return (
      <div
        className={cn('flex items-center gap-1 px-2 py-1', className)}
        data-testid="model-indicator-trigger"
      >
        <span className="text-[13px] font-medium text-foreground/60">{modelDisplayName}</span>
      </div>
    );
  }

  const providerLabel = activeProviderId
    ? (PROVIDER_META[activeProviderId]?.name ?? activeProviderId)
    : null;

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-md transition-all duration-150',
            'hover:bg-black/[0.04] dark:hover:bg-white/[0.08] focus:outline-none',
            isWarning && 'text-warning',
            className,
          )}
          data-testid="model-indicator-trigger"
        >
          {isWarning && <Warning className="w-3.5 h-3.5 text-warning flex-shrink-0" />}
          <span
            className={cn(
              'text-[13px] font-medium',
              isWarning ? 'text-warning' : 'text-foreground/80',
            )}
          >
            {isWarning ? t('model.selectModel') : modelDisplayName}
          </span>
          <CaretDown
            className={cn(
              'w-3 h-3 flex-shrink-0 transition-transform duration-150',
              isWarning ? 'text-warning/60' : 'text-muted-foreground/60',
              open && 'rotate-180',
            )}
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-52 shadow-lg">
        {/* Current model — always first */}
        {hasModel && (
          <>
            <div className="px-3 py-2">
              <div className="text-[11px] text-muted-foreground/60 uppercase tracking-wide mb-0.5">
                {providerLabel} · {t('model.current')}
              </div>
              <div className="text-sm font-medium text-foreground">{modelDisplayName}</div>
            </div>

            {/* Same-provider sibling models */}
            {siblingModels.length > 0 && (
              <>
                <DropdownMenuSeparator />
                {siblingModels.map((model) => (
                  <DropdownMenuItem
                    key={model.id}
                    disabled={isRunning}
                    className="px-3 py-2 text-sm cursor-pointer"
                    onClick={() => void handleSelectModel(model.id)}
                  >
                    {model.displayName}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </>
        )}

        {/* Warning state — no model configured */}
        {isWarning && (
          <div className="px-3 py-2 text-sm text-muted-foreground">{t('model.selectModel')}</div>
        )}

        {/* Other connected providers */}
        {otherProviders.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {otherProviders.map(([providerId, provider]) => (
              <ProviderSubMenu
                key={providerId}
                providerId={providerId}
                provider={provider}
                onSelectModel={handleSelectProviderModel}
                disabled={isRunning}
              />
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
