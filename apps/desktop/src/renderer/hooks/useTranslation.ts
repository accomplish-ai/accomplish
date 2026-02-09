/**
 * Custom hook for using i18next translations
 *
 * Provides a typed wrapper around react-i18next's useTranslation hook
 * with default namespace set to 'common'.
 */

import { useTranslation as useI18nTranslation } from 'react-i18next';

/**
 * Custom hook for accessing translations
 *
 * @returns Translation object with t function and i18n instance
 *
 * @example
 * ```tsx
 * const { t } = useTranslation();
 * return <h1>{t('app.name')}</h1>; // Returns: "WaIA"
 * ```
 */
export const useTranslation = () => {
  return useI18nTranslation<'common'>('common');
};

export default useTranslation;
