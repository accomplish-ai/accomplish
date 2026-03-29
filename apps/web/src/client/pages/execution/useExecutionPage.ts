import { useExecutionCore } from './useExecutionCore';
import { useExecutionActions } from './useExecutionActions';

/**
 * Orchestrates all state and actions for the ExecutionPage.
 * Combines useExecutionCore (state/effects) and useExecutionActions (callbacks).
 */
export function useExecutionPage() {
  const core = useExecutionCore();
  const actions = useExecutionActions(core);
  return { ...core, ...actions };
}
