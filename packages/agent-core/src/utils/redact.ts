const REDACTION_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /xai-[a-zA-Z0-9]{20,}/g,
  /AIza[a-zA-Z0-9_-]{35}/g,
  /AKIA[A-Z0-9]{16}/g,
  /(?:api[_-]?key|apikey|secret|token|password|credential)['":\s]*[=:]\s*['"]?([a-zA-Z0-9_-]{16,})['"]?/gi,
  /Bearer\s+[a-zA-Z0-9._-]+/gi,
  /(?:secret|password|key)['":\s]*[=:]\s*['"]?([A-Za-z0-9+/=]{32,})['"]?/gi,
];

export function redact(text: string): string {
  let result = text;

  for (const pattern of REDACTION_PATTERNS) {
    result = result.replace(pattern, (match) => {
      const prefix = match.slice(0, 4);
      return `${prefix}[REDACTED]`;
    });
  }

  return result;
}
