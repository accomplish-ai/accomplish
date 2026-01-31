/**
 * ModelIndicator component
 *
 * Shows the current active model in a compact selector format.
 * Clicking opens a dropdown with model info and link to Settings.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Settings, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ProviderIcon } from '@/components/ui/ProviderIcon';
import { getModelDisplayName, getProviderDisplayName } from '@/lib/model-utils';
import { useProviderSettings } from '@/components/settings/hooks/useProviderSettings';
import { cn } from '@/lib/utils';
import type { ProviderType } from '@accomplish/shared';

interface ModelIndicatorProps {
  /** Whether a task is currently running */
  isRunning?: boolean;
  /** Callback when user wants to open Settings to change model */
  onOpenSettings: () => void;
  /** Additional CSS classes */
  className?: string;
}

export function ModelIndicator({
  isRunning = false,
  onOpenSettings,
  className,
}: ModelIndicatorProps) {
  const { settings, loading, refetch } = useProviderSettings();
  const [open, setOpen] = useState(false);

  // Refetch settings when dropdown opens to ensure we have latest data
  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (isOpen) {
      refetch();
    }
    setOpen(isOpen);
  }, [refetch]);

  // Also refetch on mount and periodically to catch settings changes
  useEffect(() => {
    refetch();
    // Refetch every 2 seconds to catch settings changes from other windows
    const interval = setInterval(refetch, 2000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Get active provider and model info
  const activeProviderId = settings?.activeProviderId;
  const activeProvider = activeProviderId
    ? settings?.connectedProviders[activeProviderId]
    : null;
  const selectedModelId = activeProvider?.selectedModelId;

  // Determine display values
  const hasModel = Boolean(activeProviderId && selectedModelId);
  const modelDisplayName = selectedModelId
    ? getModelDisplayName(selectedModelId)
    : null;
  const providerDisplayName = activeProviderId
    ? getProviderDisplayName(activeProviderId)
    : null;

  // Determine state
  const isWarning = !hasModel && !loading;

  const handleOpenSettings = () => {
    setOpen(false);
    onOpenSettings();
  };

  if (loading) {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 animate-pulse',
          className
        )}
      >
        <div className="w-4 h-4 rounded bg-muted-foreground/20" />
        <div className="w-16 h-3.5 rounded bg-muted-foreground/20" />
      </div>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-md transition-all duration-150',
            'hover:bg-muted/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/50',
            isWarning && 'bg-warning/5 hover:bg-warning/10 border border-warning/30',
            isRunning && !isWarning && 'bg-muted/50',
            !isWarning && !isRunning && 'bg-transparent hover:bg-muted/50',
            className
          )}
          data-testid="model-indicator-trigger"
        >
          {/* Running indicator dot */}
          {isRunning && hasModel && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          )}

          {/* Provider icon or warning icon */}
          {isWarning ? (
            <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
          ) : (
            <ProviderIcon
              provider={activeProviderId as ProviderType}
              size="sm"
              className="flex-shrink-0"
            />
          )}

          {/* Model name - truncate long names */}
          <span
            className={cn(
              'text-sm font-medium truncate max-w-[140px]',
              isWarning ? 'text-warning' : 'text-foreground/90'
            )}
          >
            {isWarning ? 'No model selected' : modelDisplayName}
          </span>

          {/* Chevron */}
          <ChevronDown
            className={cn(
              'w-3 h-3 transition-transform duration-150 flex-shrink-0',
              isWarning ? 'text-warning/70' : 'text-muted-foreground/70',
              open && 'rotate-180'
            )}
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-56 shadow-md"
      >
        {/* Current model info header */}
        <div className="px-2.5 py-2">
          <DropdownMenuLabel className="px-0 pb-1.5 text-[9px] text-muted-foreground/60 uppercase tracking-wider font-medium">
            {isWarning ? 'No Model Configured' : 'Current Model'}
          </DropdownMenuLabel>

          <div className="flex items-center gap-2">
            {isWarning ? (
              <div className="w-7 h-7 rounded-md bg-warning/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 text-warning" />
              </div>
            ) : (
              <ProviderIcon
                provider={activeProviderId as ProviderType}
                size="md"
                className="w-7 h-7 rounded-md text-[10px]"
              />
            )}

            <div className="flex-1 min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'text-xs font-semibold truncate cursor-default',
                      isWarning ? 'text-warning' : 'text-foreground'
                    )}
                  >
                    {isWarning ? 'Setup Required' : modelDisplayName}
                  </div>
                </TooltipTrigger>
                {modelDisplayName && !isWarning && (
                  <TooltipContent side="top" className="text-xs">
                    {modelDisplayName}
                  </TooltipContent>
                )}
              </Tooltip>
              <div className="text-[10px] text-muted-foreground/70 truncate">
                {isWarning
                  ? 'Add an API key to get started'
                  : providerDisplayName}
              </div>
            </div>

            {/* Status badge */}
            {!isWarning && (
              <div
                className={cn(
                  'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium flex-shrink-0',
                  isRunning
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {isRunning ? (
                  <>
                    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Running</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-2 h-2" />
                    <span>Ready</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <DropdownMenuSeparator className="bg-border/40" />

        {/* Change model action */}
        <DropdownMenuItem
          onClick={handleOpenSettings}
          disabled={isRunning}
          className="gap-2 px-2.5 py-2 cursor-pointer focus:bg-muted/50"
        >
          <div
            className={cn(
              'w-6 h-6 rounded flex items-center justify-center flex-shrink-0',
              isWarning
                ? 'bg-warning/10 text-warning'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <Settings className="w-3 h-3" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium">
              {isWarning ? 'Configure Model' : 'Change Model'}
            </div>
            <div className="text-[10px] text-muted-foreground/60">
              {isRunning
                ? 'Stop task to change'
                : isWarning
                  ? 'Add API key in Settings'
                  : 'Open Settings'}
            </div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
