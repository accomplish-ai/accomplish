/**
 * Unit tests for isSameApex — the apex-domain check for manifest `path:` URLs.
 * Pure function; no Electron / network mocks needed.
 */

import { describe, it, expect } from 'vitest';

import {
  isSameApex,
  isTrustedManifestPath,
  isTrustedUpdateInfo,
} from '../../../src/main/updater/origin';

describe('isSameApex', () => {
  it('accepts same-apex subdomain (typical accomplish layout)', () => {
    // Feed lives on d.accomplish.ai; artifacts on downloads.accomplish.ai — shared apex.
    expect(isSameApex('https://downloads.accomplish.ai/x/a.exe', 'https://d.accomplish.ai')).toBe(
      true,
    );
  });

  it('accepts identical host', () => {
    expect(isSameApex('https://d.accomplish.ai/x/a.exe', 'https://d.accomplish.ai')).toBe(true);
  });

  it('accepts bare apex (no subdomain)', () => {
    expect(isSameApex('https://accomplish.ai/x/a.exe', 'https://d.accomplish.ai')).toBe(true);
  });

  it('rejects different apex (attacker-controlled)', () => {
    expect(isSameApex('https://evil.example.com/malware.exe', 'https://d.accomplish.ai')).toBe(
      false,
    );
  });

  it('rejects label-trick hosts (myaccomplish.ai vs accomplish.ai)', () => {
    // `myaccomplish.ai`.endsWith('accomplish.ai') is true by raw string match, but our
    // boundary-aware check (hostname === apex || hostname.endsWith('.' + apex)) rejects it.
    expect(isSameApex('https://myaccomplish.ai/x/a.exe', 'https://d.accomplish.ai')).toBe(false);
  });

  it('accepts localhost with localhost feed (dev opt-in)', () => {
    expect(isSameApex('http://localhost:8080/a.exe', 'http://localhost:8080')).toBe(true);
  });

  it('accepts IP with same IP feed (dev opt-in)', () => {
    expect(isSameApex('http://127.0.0.1:8080/a.exe', 'http://127.0.0.1:8080')).toBe(true);
  });

  it('rejects DIFFERENT IPv4 even when last-two-octets match (would pass the apex rule)', () => {
    // Naive apex of '127.0.0.1' is '0.1'; '192.168.0.1' endsWith '.0.1' → would
    // falsely accept without IP-literal special-case. Pin the fix.
    expect(isSameApex('http://192.168.0.1/a.exe', 'http://127.0.0.1')).toBe(false);
  });

  it('rejects different IPv6 addresses', () => {
    expect(isSameApex('http://[::2]/a.exe', 'http://[::1]/')).toBe(false);
  });

  it('accepts same IPv6', () => {
    expect(isSameApex('http://[::1]/a.exe', 'http://[::1]/')).toBe(true);
  });

  it('rejects IP candidate against DNS feed (or vice versa)', () => {
    expect(isSameApex('http://127.0.0.1/a.exe', 'https://d.accomplish.ai')).toBe(false);
    expect(isSameApex('https://d.accomplish.ai/a.exe', 'http://127.0.0.1')).toBe(false);
  });

  it('rejects HTTPS → HTTP downgrade even on same apex', () => {
    // An HTTPS feed must never direct users to a plaintext download URL.
    expect(isSameApex('http://downloads.accomplish.ai/a.exe', 'https://d.accomplish.ai')).toBe(
      false,
    );
  });

  it('rejects HTTP → HTTPS upgrade (scheme must match)', () => {
    // Symmetric: a dev feed on http://localhost shouldn't accept https://localhost
    // (different URL anyway, but pin the scheme-equality rule).
    expect(isSameApex('https://localhost:8080/a.exe', 'http://localhost:8080')).toBe(false);
  });

  it('accepts same apex + same scheme (HTTPS)', () => {
    expect(isSameApex('https://downloads.accomplish.ai/a.exe', 'https://d.accomplish.ai')).toBe(
      true,
    );
  });

  it('rejects malformed URL candidates (returns false, never throws)', () => {
    expect(isSameApex('not a url', 'https://d.accomplish.ai')).toBe(false);
    expect(isSameApex('', 'https://d.accomplish.ai')).toBe(false);
  });

  it('rejects when reference URL is malformed', () => {
    expect(isSameApex('https://d.accomplish.ai/a.exe', 'not a url')).toBe(false);
  });

  it('accepts deep subdomain chains', () => {
    expect(isSameApex('https://a.b.c.accomplish.ai/x/a.exe', 'https://d.accomplish.ai')).toBe(true);
  });
});

describe('isTrustedManifestPath', () => {
  it('accepts relative manifest paths', () => {
    expect(
      isTrustedManifestPath('downloads/1.0.0/app.zip', 'https://downloads.accomplish.ai'),
    ).toBe(true);
  });

  it('rejects protocol-relative URLs', () => {
    expect(
      isTrustedManifestPath('//evil.example.com/app.zip', 'https://downloads.accomplish.ai'),
    ).toBe(false);
  });

  it('rejects non-http absolute URLs', () => {
    expect(isTrustedManifestPath('file:///tmp/app.zip', 'https://downloads.accomplish.ai')).toBe(
      false,
    );
  });
});

describe('isTrustedUpdateInfo', () => {
  it('accepts native update info with same-apex file URLs', () => {
    expect(
      isTrustedUpdateInfo(
        {
          files: [{ url: 'https://downloads.accomplish.ai/downloads/1.0.0/app.zip' }],
          path: 'https://downloads.accomplish.ai/downloads/1.0.0/app.zip',
        },
        'https://downloads.accomplish.ai',
      ),
    ).toBe(true);
  });

  it('rejects native update info with cross-apex file URLs', () => {
    expect(
      isTrustedUpdateInfo(
        {
          files: [{ url: 'https://evil.example.com/app.zip' }],
          path: 'https://downloads.accomplish.ai/downloads/1.0.0/app.zip',
        },
        'https://downloads.accomplish.ai',
      ),
    ).toBe(false);
  });
});
