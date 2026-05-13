import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';
import { changeLanguage, getLanguagePreference } from '@/i18n';

const originalLocalStorage = window.localStorage;

function setThrowingLocalStorage(): void {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn(() => {
        throw new Error('storage unavailable');
      }),
      setItem: vi.fn(() => {
        throw new Error('storage unavailable');
      }),
    },
  });
}

afterEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  });
  vi.restoreAllMocks();
});

describe('i18n storage handling', () => {
  it('falls back to auto when localStorage cannot be read', () => {
    setThrowingLocalStorage();

    expect(getLanguagePreference()).toBe('auto');
  });

  it('changes language when localStorage cannot be written', async () => {
    setThrowingLocalStorage();
    const changeLanguageSpy = vi.spyOn(i18n, 'changeLanguage').mockResolvedValue(i18n);

    await changeLanguage('fr');

    expect(changeLanguageSpy).toHaveBeenCalledWith('fr');
  });
});
