export const PROMPT_DEFAULT_MAX_LENGTH = 60_000;

export function sanitizeString(
  input: unknown,
  fieldName: string,
  maxLength = PROMPT_DEFAULT_MAX_LENGTH,
): string {
  if (typeof input !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required`);
  }
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} exceeds maximum length of ${maxLength}`);
  }
  return trimmed;
}

export function sanitizeOptionalString(
  input: unknown,
  fieldName: string,
  maxLength = PROMPT_DEFAULT_MAX_LENGTH,
): string | undefined {
  if (input === null || input === undefined) {
    return undefined;
  }
  return sanitizeString(input, fieldName, maxLength);
}
