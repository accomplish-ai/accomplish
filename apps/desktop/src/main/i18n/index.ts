/**
 * Main Process i18n Module
 *
 * Provides internationalization support for the main process.
 * The renderer process uses react-i18next separately with lazy loading.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// Supported languages
export const SUPPORTED_LANGUAGES = ['en', 'zh-CN', 'he'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Translation namespaces
export const NAMESPACES = [
  'common',
  'home',
  'execution',
  'settings',
  'history',
  'errors',
  'sidebar',
] as const;
export type Namespace = (typeof NAMESPACES)[number];

// Translation cache
type TranslationData = Record<string, unknown>;
const translationCache: Record<string, Record<string, TranslationData>> = {};

// Current language (defaults to system language or 'en')
let currentLanguage: SupportedLanguage = 'en';

/**
 * Get the path to locales directory
 */
function getLocalesPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'locales');
  }
  // In development, use app.getAppPath() which returns the desktop app directory
  // app.getAppPath() returns apps/desktop in dev mode
  return path.join(app.getAppPath(), 'locales');
}

/**
 * Load translation file for a specific language and namespace
 */
function loadTranslation(language: SupportedLanguage, namespace: Namespace): TranslationData {
  const cacheKey = `${language}/${namespace}`;
  if (translationCache[language]?.[namespace]) {
    return translationCache[language][namespace];
  }

  const localesPath = getLocalesPath();
  const filePath = path.join(localesPath, language, `${namespace}.json`);

  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as TranslationData;

      // Cache the translation
      if (!translationCache[language]) {
        translationCache[language] = {};
      }
      translationCache[language][namespace] = data;

      return data;
    }
  } catch (error) {
    console.error(`[i18n] Failed to load translation: ${cacheKey}`, error);
  }

  // Return empty object if file not found
  return {};
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: TranslationData, key: string): string | undefined {
  const keys = key.split('.');
  let current: unknown = obj;

  for (const k of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[k];
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Interpolate variables in a translation string
 * Supports {{variable}} syntax
 */
function interpolate(text: string, variables?: Record<string, string | number>): string {
  if (!variables) return text;

  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return variables[key] !== undefined ? String(variables[key]) : `{{${key}}}`;
  });
}

/**
 * Initialize i18n with the system language or stored preference
 */
export function initializeI18n(storedLanguage?: string | null): void {
  if (storedLanguage && SUPPORTED_LANGUAGES.includes(storedLanguage as SupportedLanguage)) {
    currentLanguage = storedLanguage as SupportedLanguage;
  } else {
    // Try to detect system language
    const systemLocale = app.getLocale();
    if (systemLocale.startsWith('zh')) {
      currentLanguage = 'zh-CN';
    } else if (systemLocale.startsWith('he')) {
      currentLanguage = 'he';
    } else {
      currentLanguage = 'en';
    }
  }

  console.log(`[i18n] Initialized with language: ${currentLanguage}`);
}

/**
 * Get the current language
 */
export function getLanguage(): SupportedLanguage {
  return currentLanguage;
}

/**
 * Set the current language
 */
export function setLanguage(language: SupportedLanguage): void {
  if (SUPPORTED_LANGUAGES.includes(language)) {
    currentLanguage = language;
    console.log(`[i18n] Language changed to: ${currentLanguage}`);
  }
}

/**
 * Translate a key
 *
 * @param key - Translation key in format "namespace:key.path" or "key.path" (uses 'common' namespace)
 * @param variables - Variables to interpolate
 * @returns Translated string or the key if not found
 */
export function t(key: string, variables?: Record<string, string | number>): string {
  let namespace: Namespace = 'common';
  let translationKey = key;

  // Parse namespace from key (e.g., "errors:api.timeout")
  if (key.includes(':')) {
    const [ns, k] = key.split(':');
    if (NAMESPACES.includes(ns as Namespace)) {
      namespace = ns as Namespace;
      translationKey = k;
    }
  }

  // Load translation
  const translations = loadTranslation(currentLanguage, namespace);
  let value = getNestedValue(translations, translationKey);

  // Fallback to English if not found
  if (value === undefined && currentLanguage !== 'en') {
    const fallbackTranslations = loadTranslation('en', namespace);
    value = getNestedValue(fallbackTranslations, translationKey);
  }

  // Return interpolated value or key
  if (value !== undefined) {
    return interpolate(value, variables);
  }

  console.warn(`[i18n] Missing translation: ${namespace}:${translationKey}`);
  return key;
}

/**
 * Get all translations for a namespace (used by renderer)
 */
export function getTranslations(
  language: SupportedLanguage,
  namespace: Namespace
): TranslationData {
  return loadTranslation(language, namespace);
}

/**
 * Get all translations for all namespaces (used by renderer initial load)
 */
export function getAllTranslations(language: SupportedLanguage): Record<Namespace, TranslationData> {
  const result = {} as Record<Namespace, TranslationData>;
  for (const ns of NAMESPACES) {
    result[ns] = loadTranslation(language, ns);
  }
  return result;
}

/**
 * Clear translation cache (useful for development hot reload)
 */
export function clearTranslationCache(): void {
  for (const lang of Object.keys(translationCache)) {
    delete translationCache[lang];
  }
}
