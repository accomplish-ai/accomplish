/**
 * Web i18n Configuration (Platform-Agnostic, Optional Electron IPC)
 *
 * All translations are bundled as static imports. Language preference is
 * persisted in localStorage. This module remains platform-agnostic, but when running
 * in an Electron renderer, it will call window.accomplish.setLanguage() (IPC to main process)
 * if present, to sync the language preference with the main process. This integration is
 * fully optional: calls are guarded by (typeof window !== 'undefined' && window.accomplish?.setLanguage)
 * and are fire-and-forget with error logging. See the symbols window.accomplish.setLanguage and
 * getLanguagePreference in this module for the conditional Electron integration logic.
 */

import i18n from 'i18next';
import { createLogger } from '../lib/logger';

const logger = createLogger('i18n');
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Static English locale imports
import enCommon from '@locales/en/common.json';
import enHome from '@locales/en/home.json';
import enSettings from '@locales/en/settings.json';
import enExecution from '@locales/en/execution.json';
import enHistory from '@locales/en/history.json';
import enErrors from '@locales/en/errors.json';
import enSidebar from '@locales/en/sidebar.json';

// Static Chinese locale imports
import zhCNCommon from '@locales/zh-CN/common.json';
import zhCNHome from '@locales/zh-CN/home.json';
import zhCNSettings from '@locales/zh-CN/settings.json';
import zhCNExecution from '@locales/zh-CN/execution.json';
import zhCNHistory from '@locales/zh-CN/history.json';
import zhCNErrors from '@locales/zh-CN/errors.json';
import zhCNSidebar from '@locales/zh-CN/sidebar.json';

// Static Russian locale imports
import ruCommon from '@locales/ru/common.json';
import ruHome from '@locales/ru/home.json';
import ruSettings from '@locales/ru/settings.json';
import ruExecution from '@locales/ru/execution.json';
import ruHistory from '@locales/ru/history.json';
import ruErrors from '@locales/ru/errors.json';
import ruSidebar from '@locales/ru/sidebar.json';

// Static French locale imports
import frCommon from '@locales/fr/common.json';
import frHome from '@locales/fr/home.json';
import frSettings from '@locales/fr/settings.json';
import frExecution from '@locales/fr/execution.json';
import frHistory from '@locales/fr/history.json';
import frErrors from '@locales/fr/errors.json';
import frSidebar from '@locales/fr/sidebar.json';

// Supported languages and namespaces
export const SUPPORTED_LANGUAGES = ['en', 'zh-CN', 'ru', 'fr'] as const;
export const NAMESPACES = [
  'common',
  'home',
  'execution',
  'settings',
  'history',
  'errors',
  'sidebar',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type Namespace = (typeof NAMESPACES)[number];

export const LANGUAGE_STORAGE_KEY = 'openwork-language';

// Flag to track initialization
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

function updateDocumentDirection(language: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.lang = language;
}

/**
 * Read the stored language preference from localStorage.
 * Returns the concrete language to use (resolves 'auto' via navigator).
 */
function resolveStoredLanguage(): SupportedLanguage {
  if (typeof localStorage === 'undefined') {
    return 'en';
  }
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === 'en' || stored === 'zh-CN' || stored === 'ru' || stored === 'fr') {
    return stored;
  }
  // 'auto' or missing — detect from browser
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  if (nav.startsWith('zh')) {
    return 'zh-CN';
  }
  if (nav.startsWith('ru')) {
    return 'ru';
  }
  if (nav.startsWith('fr')) {
    return 'fr';
  }
  return 'en';
}

/**
 * Initialize i18n with bundled translations
 */
export async function initI18n(): Promise<void> {
  if (isInitialized) {
    return;
  }
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const initialLanguage = resolveStoredLanguage();

    await i18n
      .use(LanguageDetector)
      .use(initReactI18next)
      .init({
        resources: {
          en: {
            common: enCommon as Record<string, unknown>,
            home: enHome as Record<string, unknown>,
            settings: enSettings as Record<string, unknown>,
            execution: enExecution as Record<string, unknown>,
            history: enHistory as Record<string, unknown>,
            errors: enErrors as Record<string, unknown>,
            sidebar: enSidebar as Record<string, unknown>,
          },
          'zh-CN': {
            common: zhCNCommon as Record<string, unknown>,
            home: zhCNHome as Record<string, unknown>,
            settings: zhCNSettings as Record<string, unknown>,
            execution: zhCNExecution as Record<string, unknown>,
            history: zhCNHistory as Record<string, unknown>,
            errors: zhCNErrors as Record<string, unknown>,
            sidebar: zhCNSidebar as Record<string, unknown>,
          },
          ru: {
            common: ruCommon as Record<string, unknown>,
            home: ruHome as Record<string, unknown>,
            settings: ruSettings as Record<string, unknown>,
            execution: ruExecution as Record<string, unknown>,
            history: ruHistory as Record<string, unknown>,
            errors: ruErrors as Record<string, unknown>,
            sidebar: ruSidebar as Record<string, unknown>,
          },
          fr: {
            common: frCommon as Record<string, unknown>,
            home: frHome as Record<string, unknown>,
            settings: frSettings as Record<string, unknown>,
            execution: frExecution as Record<string, unknown>,
            history: frHistory as Record<string, unknown>,
            errors: frErrors as Record<string, unknown>,
            sidebar: frSidebar as Record<string, unknown>,
          },
        },
        lng: initialLanguage,
        fallbackLng: 'en',
        defaultNS: 'common',
        ns: NAMESPACES as unknown as string[],

        interpolation: {
          escapeValue: false,
        },

        detection: {
          order: ['localStorage', 'navigator'],
          caches: ['localStorage'],
          lookupLocalStorage: LANGUAGE_STORAGE_KEY,
        },

        debug: import.meta.env.DEV,

        returnEmptyString: false,

        react: {
          useSuspense: false,
        },
      });

    updateDocumentDirection(initialLanguage);
    isInitialized = true;
    logger.info(`Initialized with language: ${initialLanguage}`);
    // Sync initial language to main process so the agent reflects the stored preference
    if (typeof window !== 'undefined' && window.accomplish?.setLanguage) {
      const storedPref = getLanguagePreference();
      window.accomplish.setLanguage(storedPref).catch((error) => {
        logger.warn('Failed to sync initial language preference to main process', { error });
      });
    }
  })();

  return initializationPromise;
}

/**
 * Change language and persist to localStorage and main-process DB (Electron only)
 */
export async function changeLanguage(
  language: 'en' | 'zh-CN' | 'ru' | 'fr' | 'auto',
): Promise<void> {
  const resolvedLanguage = language === 'auto' ? resolveAutoLanguage() : language;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  await i18n.changeLanguage(resolvedLanguage);
  updateDocumentDirection(resolvedLanguage);
  // Persist to main process so the agent reads the correct language
  if (typeof window !== 'undefined' && window.accomplish?.setLanguage) {
    window.accomplish.setLanguage(language).catch((error) => {
      logger.warn('Failed to sync language preference to main process', { error });
    });
  }
}

/**
 * Get the current language preference from localStorage
 */
export function getLanguagePreference(): 'en' | 'zh-CN' | 'ru' | 'fr' | 'auto' {
  if (typeof localStorage === 'undefined') {
    return 'auto';
  }
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (
    stored === 'en' ||
    stored === 'zh-CN' ||
    stored === 'ru' ||
    stored === 'fr' ||
    stored === 'auto'
  ) {
    return stored;
  }
  return 'auto';
}

function resolveAutoLanguage(): SupportedLanguage {
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  if (nav.startsWith('zh')) {
    return 'zh-CN';
  }
  if (nav.startsWith('ru')) {
    return 'ru';
  }
  if (nav.startsWith('fr')) {
    return 'fr';
  }
  return 'en';
}

export default i18n;
