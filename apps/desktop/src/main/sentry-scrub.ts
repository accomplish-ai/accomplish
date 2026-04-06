/**
 * sentry-scrub.ts — Scrubs sensitive data from Sentry error events.
 *
 * Redacts API keys, Bearer tokens, JWK private key fields, DPoP nonces,
 * and downgrades expected operational errors to warnings.
 *
 * Ported from accomplish-commercial-fork (clean utility — no secrets, no enterprise code).
 */

import type { Breadcrumb, ErrorEvent } from '@sentry/electron/main';

const SENSITIVE_PATTERNS = [
  // OpenAI / Anthropic / generic sk- keys
  /\bsk-[a-zA-Z0-9_-]{20,}\b/g,
  // Google AI keys
  /\bAIza[a-zA-Z0-9_-]{30,}\b/g,
  // Generic key- prefixed tokens
  /\bkey-[a-zA-Z0-9_-]{20,}\b/g,
  // Bearer tokens
  /Bearer\s+[a-zA-Z0-9._\-/+=]{10,}/gi,
  // Authorization header values
  /(?<=authorization['":\s]+)[a-zA-Z0-9._\-/+=]{20,}/gi,
  // JWK private key field ("d" in Ed25519 / EC keys)
  /"d"\s*:\s*"[A-Za-z0-9_-]{20,}"/g,
  // DPoP nonce values
  /dpop[_-]nonce["'\s:=]+[A-Za-z0-9_-]{10,}/gi,
];

const REDACTED = '[REDACTED]';

const EXPECTED_OPERATIONAL_ERRORS: RegExp[] = [
  // Quota / billing — user's provider account limits
  /quota/i,
  /billing/i,
  /insufficient[\s_]*(funds|quota)/i,
  // Rate limits — user hitting their provider's rate limits
  /rate[\s_-]*limit/i,
  /throttl/i,
  /too[\s_]*many[\s_]*requests/i,
  /\b429\b/,
  // Invalid API key — user entered a bad key
  /invalid[\s_-]*api[\s_-]*key/i,
  // Context overflow — local model context window too small
  /n_keep.*n_ctx/i,
  /context window is too small/i,
  /context size has been exceeded/i,
  /exceeds the available context size/i,
  // Bedrock inference profile — user needs to configure inference profile ARN
  /inference.profile/i,
  // Skill fetch errors — user entered a bad GitHub URL
  /skill not found at url/i,
  /failed to fetch skill/i,
  /invalid github url/i,
  /url must use https/i,
  /url must be from github/i,
  /invalid url format/i,
  /skill\.md must have a name/i,
  // OAuth server doesn't support dynamic client registration
  /does not support dynamic client registration/i,
  // Connection / network errors — user's local provider is unreachable
  /unable to connect/i,
  /ECONNREFUSED/,
  /ECONNRESET/,
  /ETIMEDOUT/,
  /ENOTFOUND/,
  /fetch failed/i,
  /network error/i,
  // No response — local model didn't produce output
  /model did not produce any response/i,
  /must call start_task_start_task before any other tool/i,
  // Humanized connection error
  /couldn't reach the ai model/i,
];

export function isOperationalErrorMessage(text: string): boolean {
  return EXPECTED_OPERATIONAL_ERRORS.some((pattern) => pattern.test(text));
}

export function isExpectedOperationalError(event: ErrorEvent): boolean {
  const texts: string[] = [];
  if (event.message) texts.push(event.message);
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) texts.push(ex.value);
      if (ex.type) texts.push(ex.type);
    }
  }
  return texts.some((text) => isOperationalErrorMessage(text));
}

export function scrubString(str: string): string {
  let result = str;
  for (const pattern of SENSITIVE_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, REDACTED);
  }
  return result;
}

function scrubRecord(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = scrubString(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  if (isExpectedOperationalError(event)) {
    event.level = 'warning';
    event.tags = { ...event.tags, operational: 'true' };
  }

  if (event.message) {
    event.message = scrubString(event.message);
  }

  if (event.exception?.values) {
    for (const exception of event.exception.values) {
      if (exception.value) {
        exception.value = scrubString(exception.value);
      }
    }
  }

  if (event.breadcrumbs) {
    for (const breadcrumb of event.breadcrumbs) {
      if (breadcrumb.message) {
        breadcrumb.message = scrubString(breadcrumb.message);
      }
      if (breadcrumb.data && typeof breadcrumb.data === 'object') {
        breadcrumb.data = scrubRecord(breadcrumb.data as Record<string, unknown>);
      }
    }
  }

  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === 'console') {
    return null;
  }

  if (breadcrumb.message) {
    breadcrumb.message = scrubString(breadcrumb.message);
  }

  if (breadcrumb.data && typeof breadcrumb.data === 'object') {
    breadcrumb.data = scrubRecord(breadcrumb.data as Record<string, unknown>);
  }

  return breadcrumb;
}
