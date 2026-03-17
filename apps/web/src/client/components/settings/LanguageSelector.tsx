import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, CaretDown } from '@phosphor-icons/react';
import { changeLanguage, getLanguagePreference } from '@/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Auto label in each supported system language so it's always recognizable
const AUTO_LABELS: Record<string, string> = {
  en: 'Auto (System)',
  'zh-CN': '自动（跟随系统）',
};
const AUTO_FALLBACK = 'Auto (System)';

// Compute once at module level — navigator.language is static
const systemLang = typeof navigator !== 'undefined' ? navigator.language : 'en';
const matchedLang = Object.keys(AUTO_LABELS).find(
  (key) => systemLang === key || systemLang.startsWith(key.split('-')[0]),
);
const autoLabel = AUTO_LABELS[matchedLang ?? ''] || AUTO_FALLBACK;

const LANGUAGE_OPTIONS = [
  { value: 'auto' as const, label: autoLabel },
  { value: 'en' as const, label: 'English' },
  { value: 'zh-CN' as const, label: '简体中文' },
];

type LanguageValue = (typeof LANGUAGE_OPTIONS)[number]['value'];
const LANGUAGE_VALUES = new Set<LanguageValue>(LANGUAGE_OPTIONS.map((option) => option.value));

function isLanguageValue(value: string): value is LanguageValue {
  return LANGUAGE_VALUES.has(value as LanguageValue);
}

export function LanguageSelector() {
  const { t } = useTranslation('settings');
  const [currentLanguage, setCurrentLanguage] = useState<LanguageValue>(getLanguagePreference);
  const [open, setOpen] = useState(false);

  const handleChange = useCallback(async (value: string) => {
    if (!isLanguageValue(value)) {
      return;
    }
    setCurrentLanguage(value);
    await changeLanguage(value);
  }, []);

  const currentLabel = LANGUAGE_OPTIONS.find((opt) => opt.value === currentLanguage)?.label;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Globe className="h-4 w-4 text-muted-foreground" />
            {t('language.title')}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
            {t('language.description')}
          </p>
        </div>
        <div className="ml-4">
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex items-center gap-2 h-8 rounded-md border border-border px-3 text-sm text-foreground transition-all duration-150',
                  'hover:bg-black/[0.04] dark:hover:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-ring',
                )}
              >
                <span>{currentLabel}</span>
                <CaretDown
                  className={cn(
                    'w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-150',
                    open && 'rotate-180',
                  )}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8}>
              <DropdownMenuRadioGroup value={currentLanguage} onValueChange={handleChange}>
                {LANGUAGE_OPTIONS.map((opt) => (
                  <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
