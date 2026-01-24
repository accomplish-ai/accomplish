// apps/desktop/skills/dev-browser-mcp/src/snapshot/parser.test.ts

import { describe, it, expect } from 'vitest';
import { parseSnapshot, extractTitleFromSnapshot } from './parser.js';

describe('parseSnapshot', () => {
  it('parses a simple element with ref', () => {
    const yaml = `- button "Submit" [ref=e1]`;
    const result = parseSnapshot(yaml, 'https://example.com', 'Test Page');

    expect(result.elements.size).toBe(1);
    expect(result.elements.get('e1')).toEqual({
      ref: 'e1',
      role: 'button',
      name: 'Submit',
    });
  });

  it('parses element with value', () => {
    const yaml = `- textbox "Email" [ref=e1]: "user@example.com"`;
    const result = parseSnapshot(yaml, 'https://example.com', 'Test');

    expect(result.elements.get('e1')?.value).toBe('user@example.com');
  });

  it('parses disabled attribute', () => {
    const yaml = `- button "Submit" [ref=e1] [disabled]`;
    const result = parseSnapshot(yaml, 'https://example.com', 'Test');

    expect(result.elements.get('e1')?.disabled).toBe(true);
  });

  it('parses checked attribute', () => {
    const yaml = `- checkbox "Agree" [ref=e1] [checked]`;
    const result = parseSnapshot(yaml, 'https://example.com', 'Test');

    expect(result.elements.get('e1')?.checked).toBe(true);
  });

  it('parses checked=mixed attribute', () => {
    const yaml = `- checkbox "Partial" [ref=e1] [checked=mixed]`;
    const result = parseSnapshot(yaml, 'https://example.com', 'Test');

    expect(result.elements.get('e1')?.checked).toBe('mixed');
  });

  it('parses multiple elements', () => {
    const yaml = `
- textbox "Email" [ref=e1]
- textbox "Password" [ref=e2]
- button "Login" [ref=e3]
    `.trim();
    const result = parseSnapshot(yaml, 'https://example.com', 'Login');

    expect(result.elements.size).toBe(3);
    expect(result.elements.has('e1')).toBe(true);
    expect(result.elements.has('e2')).toBe(true);
    expect(result.elements.has('e3')).toBe(true);
  });

  it('skips elements without refs', () => {
    const yaml = `
- heading "Welcome"
- button "Submit" [ref=e1]
    `.trim();
    const result = parseSnapshot(yaml, 'https://example.com', 'Test');

    expect(result.elements.size).toBe(1);
    expect(result.elements.has('e1')).toBe(true);
  });

  it('stores url and title', () => {
    const yaml = `- button "Test" [ref=e1]`;
    const result = parseSnapshot(yaml, 'https://example.com/page', 'My Page');

    expect(result.url).toBe('https://example.com/page');
    expect(result.title).toBe('My Page');
  });
});

describe('extractTitleFromSnapshot', () => {
  it('extracts title from Page Title header', () => {
    const snapshot = `# Page Info
Page Title: My Login Page
URL: https://example.com`;

    expect(extractTitleFromSnapshot(snapshot)).toBe('My Login Page');
  });

  it('returns empty string if no title found', () => {
    const snapshot = `# Some other content`;
    expect(extractTitleFromSnapshot(snapshot)).toBe('');
  });
});
