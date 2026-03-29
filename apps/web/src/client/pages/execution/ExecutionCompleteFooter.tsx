import { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaskStore } from '../../stores/taskStore';
import { FAVORITABLE_STATUSES } from '../../lib/task-utils';
import { getStatusTranslationKey } from './executionStatusUtils';
import { Button } from '@/components/ui/button';
import { StarButton } from '@/components/ui/StarButton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WarningCircle } from '@phosphor-icons/react';

export function ExecutionCompleteFooter({
  taskId,
  onStartNewTask,
}: {
  taskId: string;
  onStartNewTask: () => void;
}) {
  const { t: tExecution } = useTranslation('execution');
  const { currentTask, favorites, loadFavorites, addFavorite, removeFavorite } = useTaskStore();
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

  const failedErrorMessage =
    currentTask?.status === 'failed' ? (currentTask.result?.error ?? null) : null;

  const showFailedAlert =
    failedErrorMessage !== null &&
    failedErrorMessage.length > 0 &&
    !failedErrorMessage.includes('Check the debug panel for details');

  return (
    <div className="flex-shrink-0 border-t border-border bg-card/50 px-6 py-4 flex flex-col items-center gap-3">
      <p className="text-sm text-muted-foreground">
        {tExecution('taskStatus', { status: statusLabel })}
      </p>
      {showFailedAlert && (
        <Alert
          variant="destructive"
          className="py-2 px-3 flex items-center gap-2 [&>svg]:static [&>svg~*]:pl-0 max-w-md w-full"
        >
          <WarningCircle className="h-4 w-4 shrink-0" />
          <AlertDescription className="text-xs leading-tight">
            {failedErrorMessage}
          </AlertDescription>
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
