/**
 * Shared status-mapping utilities for execution page components.
 */

/**
 * Maps raw task status values to i18n translation keys.
 * Handles the `interrupted → status.stopped` special case and other
 * statuses via the conventional `status.<rawStatus>` pattern.
 */
export function getStatusTranslationKey(rawStatus: string): string {
  if (rawStatus === 'interrupted') {
    return 'status.stopped';
  }
  return `status.${rawStatus}`;
}
