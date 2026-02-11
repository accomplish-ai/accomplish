import { describe, expect, it } from 'vitest';
import {
  parseAllowedDomainsFromEnv,
  normalizeNavigationUrl,
  matchesDomainPattern,
  isNavigationAllowed,
  assertNavigationAllowed,
} from '../../../mcp-tools/dev-browser-mcp/src/url-policy.js';

describe('url-policy', () => {
  describe('parseAllowedDomainsFromEnv', () => {
    it('returns null when env var is missing', () => {
      expect(parseAllowedDomainsFromEnv(undefined)).toBeNull();
      expect(parseAllowedDomainsFromEnv('')).toBeNull();
      expect(parseAllowedDomainsFromEnv('   ')).toBeNull();
    });

    it('parses and normalizes domain lists', () => {
      const parsed = parseAllowedDomainsFromEnv(
        JSON.stringify(['Example.com', '  *.Example.com  ', 'example.com']),
      );
      expect(parsed).toEqual(['example.com', '*.example.com']);
    });

    it('fails closed on malformed JSON', () => {
      expect(parseAllowedDomainsFromEnv('{not-json')).toEqual([]);
      expect(parseAllowedDomainsFromEnv(JSON.stringify({ bad: true }))).toEqual([]);
    });
  });

  describe('normalizeNavigationUrl', () => {
    it('adds https when protocol is omitted', () => {
      expect(normalizeNavigationUrl('news.ycombinator.com')).toBe(
        'https://news.ycombinator.com',
      );
    });

    it('keeps existing http/https URLs unchanged', () => {
      expect(normalizeNavigationUrl('http://example.com')).toBe(
        'http://example.com',
      );
      expect(normalizeNavigationUrl('https://example.com')).toBe(
        'https://example.com',
      );
    });
  });

  describe('matchesDomainPattern', () => {
    it('matches exact domains', () => {
      expect(matchesDomainPattern('news.ycombinator.com', 'news.ycombinator.com')).toBe(true);
      expect(matchesDomainPattern('news.ycombinator.com', 'example.com')).toBe(false);
    });

    it('matches wildcard subdomains but not base domain', () => {
      expect(matchesDomainPattern('sub.example.com', '*.example.com')).toBe(true);
      expect(matchesDomainPattern('example.com', '*.example.com')).toBe(false);
    });
  });

  describe('isNavigationAllowed', () => {
    it('allows navigation when policy is unset', () => {
      expect(isNavigationAllowed('https://news.ycombinator.com', null)).toBe(true);
    });

    it('blocks domains not in allowlist', () => {
      expect(
        isNavigationAllowed('https://news.ycombinator.com', ['api.openai.com']),
      ).toBe(false);
    });

    it('allows exact and wildcard matches', () => {
      const allowlist = ['news.ycombinator.com', '*.example.com'];
      expect(isNavigationAllowed('https://news.ycombinator.com', allowlist)).toBe(true);
      expect(isNavigationAllowed('https://sub.example.com/path', allowlist)).toBe(true);
    });
  });

  describe('assertNavigationAllowed', () => {
    it('throws a clear allowlist error when blocked', () => {
      expect(() =>
        assertNavigationAllowed('https://news.ycombinator.com', ['api.openai.com']),
      ).toThrow(/blocked by sandbox allowlist/i);
    });
  });
});
