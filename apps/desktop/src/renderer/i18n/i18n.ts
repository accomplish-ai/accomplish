import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/translation.json';

// Supported languages - add new languages here
export const SUPPORTED_LANGUAGES = [
    { code: 'en', name: 'English', nativeName: 'English' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const LANGUAGE_STORAGE_KEY = 'accomplish-language';

// Get saved language or fall back to English
function getSavedLanguage(): string {
    try {
        return localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'en';
    } catch {
        return 'en';
    }
}

// Save language preference
export function saveLanguage(lang: string): void {
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
        // Silently fail if localStorage is unavailable
    }
}

i18n.use(initReactI18next).init({
    resources: {
        en: { translation: en },
    },
    lng: getSavedLanguage(),
    fallbackLng: 'en',
    interpolation: {
        escapeValue: false, // React already handles XSS protection
    },
});

export default i18n;
