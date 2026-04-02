import { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { ErrorCategory } from '@accomplish_ai/agent-core/common';
import { useTaskStore } from '../../stores/taskStore';
import { FAVORITABLE_STATUSES } from '../../lib/task-utils';
import { getStatusTranslationKey } from './executionStatusUtils';
import { Button } from '@/components/ui/button';
import { StarButton } from '@/components/ui/StarButton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  WarningCircle,
  ArrowClockwise,
  Key,
  WifiSlash,
  Clock,
  CurrencyCircleDollar,
  TextAa,
} from '@phosphor-icons/react';

const ERROR_ICONS: Record<ErrorCategory, React.ElementType> = {
  quota: CurrencyCircleDollar,
  rate_limit: Clock,
  auth: Key,
  model_not_found: WarningCircle,
  context_length: TextAa,
  network: WifiSlash,
  unknown: WarningCircle,
};

interface ExecutionCompleteFooterProps {
  taskId: string;
  onStartNewTask: () => void;
  onOpenSettings?: () => void;
  onRetry?: () => void;
}

export function ExecutionCompleteFooter({
  taskId,
  onStartNewTask,
  onOpenSettings,
  onRetry,
}: ExecutionCompleteFooterProps) {
  const { t: tExecution } = useTranslation('execution');
  const { currentTask, favorites, loadFavorites, addFavorite, removeFavorite } = useTaskStore(
    useShallow((s) => ({
      currentTask: s.currentTask,
      favorites: s.favorites,
      loadFavorites: s.loadFavorites,
      addFavorite: s.addFavorite,
      removeFavorite: s.removeFavorite,
    })),
  );
  const favoritesList = Array.isArray(favorites) ? favorites : [];
  const isFavorited = favoritesList.some((f) => f.taskId === taskId);

  useEffect(() => {
    if (typeof loadFavorites === 'function') {
      loadFavorites();
    }
  }, [loadFavorites]);

  const handleToggleFavorite = useCallback(async () => {
    try {
      if (isFavorited) {
        await removeFavorite(taskId);
      } else {
        await addFavorite(taskId);
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  }, [taskId, isFavorited, addFavorite, removeFavorite]);

  const rawStatus = currentTask?.status ?? '';
  const statusLabel = rawStatus ? tExecution(getStatusTranslationKey(rawStatus)) : '';
  const canFavorite = FAVORITABLE_STATUSES.includes(rawStatus);

  const result = currentTask?.status === 'failed' ? currentTask.result : null;
  const errorMessage = result?.error ?? null;
  const errorCategory: ErrorCategory = result?.errorCategory ?? 'unknown';
  const errorRetryable = result?.errorRetryable ?? false;
  const showError = errorMessage !== null && errorMessage.length > 0;

  const ErrorIcon = showError ? ERROR_ICONS[errorCategory] : WarningCircle;

  const handleErrorAction = useCallback(() => {
    if (errorCategory === 'context_length') {
      onStartNewTask();
    } else if (
      errorCategory === 'auth' ||
      errorCategory === 'quota' ||
      errorCategory === 'model_not_found'
    ) {
      onOpenSettings?.();
    } else if (errorRetryable) {
      onRetry?.();
    }
  }, [errorCategory, errorRetryable, onStartNewTask, onOpenSettings, onRetry]);

  const actionLabel = getActionLabel(errorCategory, errorRetryable);

  return (
    <div className="flex-shrink-0 border-t border-border bg-card/50 px-6 py-4 flex flex-col items-center gap-3">
      <p className="text-sm text-muted-foreground">
        {tExecution('taskStatus', { status: statusLabel })}
      </p>
      {showError && (
        <Alert
          variant="destructive"
          className="py-2 px-3 flex items-center gap-2 [&>svg]:static [&>svg~*]:pl-0 max-w-md w-full"
        >
          <ErrorIcon className="h-4 w-4 shrink-0" />
          <AlertDescription className="text-xs leading-tight flex-1">
            {errorMessage}
          </AlertDescription>
          {actionLabel && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 h-6 text-xs px-2"
              onClick={handleErrorAction}
            >
              {errorRetryable && <ArrowClockwise className="h-3 w-3 mr-1" />}
              {actionLabel}
            </Button>
          )}
        </Alert>
      )}
      <div className="flex items-center gap-2">
        {canFavorite && (
          <StarButton
            isFavorite={isFavorited}
            onToggle={() => void handleToggleFavorite()}
            size="md"
            data-testid="favorite-toggle"
          />
        )}
        <Button onClick={onStartNewTask} data-testid="start-new-task">
          {tExecution('startNewTask')}
        </Button>
      </div>
    </div>
  );
}

function getActionLabel(category: ErrorCategory, retryable: boolean): string | null {
  switch (category) {
    case 'quota':
    case 'auth':
    case 'model_not_found':
      return 'Open Settings';
    case 'rate_limit':
    case 'network':
      return 'Retry';
    case 'context_length':
      return 'Start New Task';
    case 'unknown':
      return retryable ? 'Retry' : null;
    default:
      return null;
  }
}
