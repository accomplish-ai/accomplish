import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Prevent undici from crashing on Node 20 (undici 8 requires Node 22 APIs)
vi.mock('undici', () => ({
  ProxyAgent: class ProxyAgent {},
  Agent: class Agent {},
  fetch: vi.fn(),
  setGlobalDispatcher: vi.fn(),
  getGlobalDispatcher: vi.fn(),
}));
import fs from 'fs';
import path from 'path';

if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = () => {};
}

// Load English locale files so tests get real translated text
const localesDir = path.resolve(process.cwd(), 'locales/en');
const translations: Record<string, Record<string, unknown>> = {};

if (fs.existsSync(localesDir)) {
  const files = fs.readdirSync(localesDir).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const ns = file.replace('.json', '');
    translations[ns] = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf-8'));
  }
}

function getNestedValue(obj: Record<string, unknown>, keyPath: string): string | undefined {
  const parts = keyPath.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(text: string, options?: Record<string, unknown>): string {
  if (!options) {
    return text;
  }
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return options[key] !== undefined ? String(options[key]) : match;
  });
}

// Mock react-i18next for all tests — resolves keys to actual English text
vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const namespace = ns || 'common';
      const nsData = translations[namespace];
      const value = nsData ? getNestedValue(nsData, key) : undefined;
      if (value) {
        return interpolate(value, options);
      }
      // Fallback: return namespaced key for debugging
      return ns ? `${ns}:${key}` : key;
    },
    i18n: {
      language: 'en',
      changeLanguage: vi.fn().mockResolvedValue(undefined),
    },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

const g = global as unknown as { window: { accomplish?: unknown } };
if (!g.window) {
  g.window = {};
}
g.window.accomplish = {
  ...(g.window.accomplish ? (g.window.accomplish as object) : {}),
  pickFolder: vi.fn().mockResolvedValue(null),
  pickFiles: vi.fn().mockResolvedValue([]),
  getFilePath: vi.fn((file: File) => file.name),
  processDroppedFiles: vi.fn().mockResolvedValue([]),
  onTaskProgress: vi.fn().mockReturnValue(() => {}),
  onTaskUpdate: vi.fn().mockReturnValue(() => {}),
  onTaskSummary: vi.fn().mockReturnValue(() => {}),
  onTodoUpdate: vi.fn().mockReturnValue(() => {}),
};

export {};
