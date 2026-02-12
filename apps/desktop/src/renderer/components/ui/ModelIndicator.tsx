/**
 * ModelIndicator component
 *
 * Ultra-minimal Claude-style model selector.
 * Just text and chevron, very clean and unobtrusive.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Settings, AlertTriangle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getModelDisplayName } from '@/lib/model-utils';
import { useProviderSettings } from '@/components/settings/hooks/useProviderSettings';
import { cn } from '@/lib/utils';

interface ModelIndicatorProps {
  /** Whether a task is currently running */
  isRunning?: boolean;
  /** Callback when user wants to open Settings to change model */
  onOpenSettings: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Hide the indicator when no model is selected (instead of showing warning) */
  hideWhenNoModel?: boolean;
}

export function ModelIndicator({
  isRunning = false,
  onOpenSettings,
  className,
  hideWhenNoModel = false,
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
          'flex items-center gap-1 px-1 animate-pulse',
          className
        )}
      >
        <div className="w-20 h-4 rounded bg-muted-foreground/10" />
      </div>
    );
  }

  // Hide completely when no model and hideWhenNoModel is true
  if (hideWhenNoModel && !hasModel) {
    return null;
  }

  // When running, just show text without dropdown
  if (isRunning) {
    return (
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1',
          className
        )}
        data-testid="model-indicator-trigger"
      >
        <span className="text-[13px] font-medium text-foreground/60">
          {modelDisplayName}
        </span>
      </div>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-md transition-all duration-150',
            'hover:bg-black/[0.04] dark:hover:bg-white/[0.08] focus:outline-none',
            isWarning && 'text-warning',
            className
          )}
          data-testid="model-indicator-trigger"
        >
          {/* Warning icon when no model */}
          {isWarning && (
            <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
          )}

          {/* Model name */}
          <span
            className={cn(
              'text-[13px] font-medium',
              isWarning ? 'text-warning' : 'text-foreground/80'
            )}
          >
            {isWarning ? 'Select model' : modelDisplayName}
          </span>

          {/* Chevron */}
          <ChevronDown
            className={cn(
              'w-3 h-3 flex-shrink-0 transition-transform duration-150',
              isWarning ? 'text-warning/60' : 'text-muted-foreground/60',
              open && 'rotate-180'
            )}
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-48 shadow-lg"
      >
        {/* Current model display */}
        {hasModel && (
          <>
            <div className="px-3 py-2">
              <div className="text-[11px] text-muted-foreground/60 uppercase tracking-wide mb-1">
                Current
              </div>
              <div className="text-sm font-medium text-foreground">
                {modelDisplayName}
              </div>
            </div>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Change model action */}
        <DropdownMenuItem
          onClick={handleOpenSettings}
          disabled={isRunning}
          className="gap-2 px-3 py-2 cursor-pointer"
        >
          <Settings className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm">
            {isWarning ? 'Configure model' : 'Change model'}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
