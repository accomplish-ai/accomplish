/**
 * Coerce an unknown value to a string for use in error messages.
 *
 * The OpenCode stream parser casts JSON.parse output via a type assertion,
 * so values typed as `string` at compile time may be objects at runtime.
 * This function ensures a usable string regardless of the actual type.
 */
export function serializeError(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  return JSON.stringify(error) || 'Unknown error';
}
