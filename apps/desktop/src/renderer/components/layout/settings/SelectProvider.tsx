'use client';

import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { API_KEY_PROVIDERS, type ProviderId } from './types';

interface SelectProviderProps {
  onSelect: (providerId: ProviderId) => void;
  onBack: () => void;
}

export default function SelectProvider({ onSelect, onBack }: SelectProviderProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-foreground">
        {t('settings.wizard.selectProvider', 'Select Provider')}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {API_KEY_PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            type="button"
            onClick={() => onSelect(provider.id)}
            className="rounded-xl border border-border bg-card p-4 text-center transition-all hover:border-primary hover:bg-muted"
          >
            <div className="font-medium text-foreground">{provider.name}</div>
          </button>
        ))}
      </div>
      <div className="flex justify-start pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {t('settings.wizard.back', 'Back')}
        </button>
      </div>
    </div>
  );
}
