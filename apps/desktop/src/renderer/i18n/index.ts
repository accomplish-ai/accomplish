/**
 * Renderer Process i18n Configuration
 *
 * Uses react-i18next with translations loaded from the main process via IPC.
 * This allows the renderer to stay in sync with the main process language settings.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Static English locale imports — bundled by Vite, always available as fallback
import enCommon from '../../../locales/en/common.json';
import enHome from '../../../locales/en/home.json';
import enSettings from '../../../locales/en/settings.json';
import enExecution from '../../../locales/en/execution.json';
import enHistory from '../../../locales/en/history.json';
import enErrors from '../../../locales/en/errors.json';
import enSidebar from '../../../locales/en/sidebar.json';

// Supported languages and namespaces
export const SUPPORTED_LANGUAGES = ['en', 'zh-CN'] as const;
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

// Type for the window.accomplish API
interface AccomplishI18nAPI {
  i18n: {
    getLanguage: () => Promise<'en' | 'zh-CN' | 'auto'>;
    setLanguage: (language: 'en' | 'zh-CN' | 'auto') => Promise<void>;
    getTranslations: (language?: string) => Promise<{
      language: string;
      translations: Record<string, Record<string, unknown>>;
    }>;
    getSupportedLanguages: () => Promise<readonly string[]>;
    getResolvedLanguage: () => Promise<string>;
    onLanguageChange: (
      callback: (data: { language: string; resolvedLanguage: string }) => void
    ) => () => void;
  };
}

// Get the accomplish API from window (typed)
function getAccomplishAPI(): AccomplishI18nAPI | null {
  if (typeof window !== 'undefined' && 'accomplish' in window) {
    return window.accomplish as unknown as AccomplishI18nAPI;
  }
  return null;
}

// Flag to track initialization
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Update document direction based on language
 */
function updateDocumentDirection(language: string): void {
  if (typeof document === 'undefined') return;

  document.documentElement.lang = language;
}

/**
 * Initialize i18n with translations from main process
 */
export async function initI18n(): Promise<void> {
  // Prevent double initialization
  if (isInitialized) {
    return;
  }

  // Return existing promise if initialization is in progress
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const api = getAccomplishAPI();

    // Default fallback resources — full English from static imports
    let initialResources: Record<string, Record<string, Record<string, unknown>>> = {
      en: {
        common: enCommon as Record<string, unknown>,
        home: enHome as Record<string, unknown>,
        settings: enSettings as Record<string, unknown>,
        execution: enExecution as Record<string, unknown>,
        history: enHistory as Record<string, unknown>,
        errors: enErrors as Record<string, unknown>,
        sidebar: enSidebar as Record<string, unknown>,
      },
    };
    let initialLanguage: SupportedLanguage = 'en';

    // Try to load translations from main process
    if (api) {
      try {
        const result = await api.i18n.getTranslations();
        initialLanguage = result.language as SupportedLanguage;

        // Convert main process format to i18next format
        initialResources = {
          [initialLanguage]: result.translations as Record<string, Record<string, unknown>>,
        };

        // Also load English as fallback if not already loaded
        if (initialLanguage !== 'en') {
          const enResult = await api.i18n.getTranslations('en');
          initialResources.en = enResult.translations as Record<string, Record<string, unknown>>;
        }
      } catch (error) {
        console.warn('[i18n] Failed to load translations from main process:', error);
      }
    }

    await i18n
      .use(LanguageDetector)
      .use(initReactI18next)
      .init({
        resources: initialResources,
        lng: initialLanguage,
        fallbackLng: 'en',
        defaultNS: 'common',
        ns: NAMESPACES as unknown as string[],

        interpolation: {
          escapeValue: false, // React already escapes values
        },

        // Language detection options
        detection: {
          order: ['localStorage', 'navigator'],
          caches: ['localStorage'],
          lookupLocalStorage: 'openwork-language',
        },

        // Debug mode (only in development)
        debug: process.env.NODE_ENV === 'development',

        // Return key if translation is missing
        returnNull: false,
        returnEmptyString: false,

        // React options
        react: {
          useSuspense: false, // We handle loading states ourselves
        },
      });

    // Subscribe to language changes from main process
    if (api) {
      api.i18n.onLanguageChange(async ({ resolvedLanguage }) => {
        if (resolvedLanguage !== i18n.language) {
          // Load translations for new language if not cached
          if (!i18n.hasResourceBundle(resolvedLanguage, 'common')) {
            try {
              const result = await api.i18n.getTranslations(resolvedLanguage);
              Object.entries(result.translations).forEach(([ns, translations]) => {
                i18n.addResourceBundle(resolvedLanguage, ns, translations, true, true);
              });
            } catch (error) {
              console.warn('[i18n] Failed to load translations for new language:', error);
            }
          }
          await i18n.changeLanguage(resolvedLanguage);
          updateDocumentDirection(resolvedLanguage);
        }
      });
    }

    // Set initial document direction
    updateDocumentDirection(initialLanguage);

    isInitialized = true;
    console.log(`[i18n] Initialized with language: ${initialLanguage}`);
  })();

  return initializationPromise;
}

/**
 * Change language and sync with main process
 */
export async function changeLanguage(language: 'en' | 'zh-CN' | 'auto'): Promise<void> {
  const api = getAccomplishAPI();

  if (api) {
    // Update main process first
    await api.i18n.setLanguage(language);

    // Load translations if needed
    const resolvedLanguage = await api.i18n.getResolvedLanguage();
    if (!i18n.hasResourceBundle(resolvedLanguage, 'common')) {
      const result = await api.i18n.getTranslations(resolvedLanguage);
      Object.entries(result.translations).forEach(([ns, translations]) => {
        i18n.addResourceBundle(resolvedLanguage, ns, translations, true, true);
      });
    }

    // Change i18next language and update document direction
    await i18n.changeLanguage(resolvedLanguage);
    updateDocumentDirection(resolvedLanguage);
  } else {
    // Fallback: just change i18next language directly
    const resolvedLanguage = language === 'auto' ? 'en' : language;
    await i18n.changeLanguage(resolvedLanguage);
    updateDocumentDirection(resolvedLanguage);
  }
}

/**
 * Get the current language preference from main process
 */
export async function getLanguagePreference(): Promise<'en' | 'zh-CN' | 'auto'> {
  const api = getAccomplishAPI();
  if (api) {
    return api.i18n.getLanguage();
  }
  return 'auto';
}

export default i18n;
