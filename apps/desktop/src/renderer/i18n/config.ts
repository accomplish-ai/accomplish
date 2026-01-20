/**
 * i18n Configuration for Renderer Process
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Initialize i18n for the renderer process
 * This must be called before rendering the React app
 */
export async function initI18n(): Promise<void> {
  // Get initial locale from main process
  const initialLocale = window.accomplish?.getInitialLocale 
    ? await window.accomplish.getInitialLocale()
    : 'en';

  await i18n
    .use(initReactI18next)
    .init({
      lng: initialLocale,
      fallbackLng: 'en',
      debug: false,

      // Translation resources will be loaded from public/locales/{lng}/translation.json
      // The backend option is intentionally omitted - we'll load resources via fetch
      // to work correctly with both dev (Vite) and production (file:// protocol)
      
      interpolation: {
        escapeValue: false, // React already escapes values
      },

      react: {
        useSuspense: false, // Disable suspense to avoid flicker on initial load
      },
    });
}

/**
 * Load translation resources for a specific language
 * This function handles both dev (http) and production (file://) protocols
 */
export async function loadTranslations(language: string): Promise<void> {
  try {
    // In production, translations are in extraResources: process.resourcesPath/locales
    // In dev, Vite serves from /locales
    let translationPath: string;
    
    if (window.accomplish?.getResourcesPath) {
      // Production: load from resources path
      const resourcesPath = await window.accomplish.getResourcesPath();
      // Convert to file:// URL - resourcesPath already includes full system path
      translationPath = `file:///${resourcesPath.replace(/\\/g, '/')}/locales/${language}/translation.json`;
    } else {
      // Dev: load from Vite dev server
      translationPath = `/locales/${language}/translation.json`;
    }
    
    // Fetch the JSON file
    const response = await fetch(translationPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch translations: ${response.statusText}`);
    }
    
    const translations = await response.json();
    
    // Add resource bundle to i18next
    i18n.addResourceBundle(language, 'translation', translations, true, true);
  } catch (error) {
    console.error(`Failed to load translations for language: ${language}`, error);
    
    // If loading fails and it's not English, try loading English as fallback
    if (language !== 'en') {
      try {
        let fallbackPath: string;
        if (window.accomplish?.getResourcesPath) {
          const resourcesPath = await window.accomplish.getResourcesPath();
          fallbackPath = `file:///${resourcesPath.replace(/\\/g, '/')}/locales/en/translation.json`;
        } else {
          fallbackPath = '/locales/en/translation.json';
        }
        
        const response = await fetch(fallbackPath);
        if (response.ok) {
          const fallback = await response.json();
          i18n.addResourceBundle('en', 'translation', fallback, true, true);
        }
      } catch (fallbackError) {
        console.error('Failed to load fallback English translations', fallbackError);
      }
    }
  }
}

/**
 * Change the current language
 */
export async function changeLanguage(language: string): Promise<void> {
  // Load translations if not already loaded
  if (!i18n.hasResourceBundle(language, 'translation')) {
    await loadTranslations(language);
  }
  
  // Change language in i18next
  await i18n.changeLanguage(language);
  
  // Persist preference to main process (if available)
  if (window.accomplish?.setLocale) {
    await window.accomplish.setLocale(language);
  }
}

export default i18n;
