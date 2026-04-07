/**
 * Returns the OS-appropriate modifier key label for push-to-talk:
 * 'Option' on macOS, 'Alt' everywhere else.
 * Safe to call during SSR (checks for navigator existence).
 */
export function getModifierKeyLabel(): string {
  if (typeof navigator === 'undefined') {
    return 'Alt';
  }
  return /Mac/i.test(navigator.userAgent) ? 'Option' : 'Alt';
}
