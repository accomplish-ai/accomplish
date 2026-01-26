/**
 * Redact sensitive data from log strings
 * Handles API keys, tokens, and other secrets
 */

// Patterns for sensitive data
const REDACTION_PATTERNS = [
  // API keys - various formats
  /sk-[a-zA-Z0-9]{20,}/g,  // OpenAI/Anthropic style
  /xai-[a-zA-Z0-9]{20,}/g,  // xAI
  /AIza[a-zA-Z0-9_-]{35}/g,  // Google API keys
  /AKIA[A-Z0-9]{16}/g,  // AWS Access Key ID

  // Generic patterns
  /(?:api[_-]?key|apikey|secret|token|password|credential)['":\s]*[=:]\s*['"]?([a-zA-Z0-9_-]{16,})['"]?/gi,

  // Bearer tokens
  /Bearer\s+[a-zA-Z0-9._-]+/gi,

  // Base64 encoded secrets (at least 32 chars, likely secrets)
  /(?:secret|password|key)['":\s]*[=:]\s*['"]?([A-Za-z0-9+/=]{32,})['"]?/gi,
];

export function redact(text: string): string {
  let result = text;

  for (const pattern of REDACTION_PATTERNS) {
    result = result.replace(pattern, (match) => {
      // Keep first 4 chars for identification, redact rest
      const prefix = match.slice(0, 4);
      return `${prefix}[REDACTED]`;
    });
  }

  return result;
}
