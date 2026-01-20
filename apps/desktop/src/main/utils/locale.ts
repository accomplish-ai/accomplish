/**
 * Locale detection and management utilities for Electron main process
 */
import { app } from 'electron';
import Store from 'electron-store';

const store = new Store();

// Supported locales
export type SupportedLocale = 'en' | 'zh-CN' | 'ja' | 'ko' | 'fr' | 'es';

export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'zh-CN', 'ja', 'ko', 'fr', 'es'];
export const DEFAULT_LOCALE: SupportedLocale = 'en';

// Locale mapping from system locale to supported locale
const LOCALE_MAP: Record<string, SupportedLocale> = {
  // English
  'en': 'en',
  'en-US': 'en',
  'en-GB': 'en',
  'en-AU': 'en',
  'en-CA': 'en',
  'en-NZ': 'en',
  
  // Chinese (Simplified)
  'zh': 'zh-CN',
  'zh-CN': 'zh-CN',
  'zh-Hans': 'zh-CN',
  'zh-Hans-CN': 'zh-CN',
  
  // Japanese
  'ja': 'ja',
  'ja-JP': 'ja',
  
  // Korean
  'ko': 'ko',
  'ko-KR': 'ko',
  
  // French
  'fr': 'fr',
  'fr-FR': 'fr',
  'fr-CA': 'fr',
  'fr-BE': 'fr',
  'fr-CH': 'fr',
  
  // Spanish
  'es': 'es',
  'es-ES': 'es',
  'es-MX': 'es',
  'es-AR': 'es',
  'es-CO': 'es',
  'es-CL': 'es',
};

/**
 * Map system locale to supported locale
 */
export function mapSystemLocale(systemLocale: string): SupportedLocale {
  // Direct match
  if (systemLocale in LOCALE_MAP) {
    return LOCALE_MAP[systemLocale];
  }
  
  // Try language code only (e.g., 'en-US' -> 'en')
  const languageCode = systemLocale.split('-')[0].toLowerCase();
  if (languageCode in LOCALE_MAP) {
    return LOCALE_MAP[languageCode];
  }
  
  // Fallback to default
  return DEFAULT_LOCALE;
}

/**
 * Get system locale from Electron app
 * MUST be called after app.whenReady()
 */
export function getSystemLocale(): SupportedLocale {
  const systemLocale = app.getLocale();
  return mapSystemLocale(systemLocale);
}

/**
 * Get initial locale based on saved preference or system locale
 */
export function getInitialLocale(): SupportedLocale {
  // Check for saved preference
  const savedLocale = store.get('locale') as SupportedLocale | undefined;
  
  if (savedLocale && SUPPORTED_LOCALES.includes(savedLocale)) {
    return savedLocale;
  }
  
  // Fall back to system locale
  return getSystemLocale();
}

/**
 * Save locale preference
 */
export function saveLocale(locale: SupportedLocale): void {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }
  store.set('locale', locale);
}

/**
 * Get saved locale preference
 */
export function getSavedLocale(): SupportedLocale | null {
  const savedLocale = store.get('locale') as SupportedLocale | undefined;
  return savedLocale && SUPPORTED_LOCALES.includes(savedLocale) ? savedLocale : null;
}
