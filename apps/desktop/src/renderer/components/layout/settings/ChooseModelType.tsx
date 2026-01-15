'use client';

import { useTranslation } from 'react-i18next';
import { Cloud, HardDrive } from 'lucide-react';
import type { ModelType } from './types';

interface ChooseModelTypeProps {
  onSelect: (type: ModelType) => void;
}

export default function ChooseModelType({ onSelect }: ChooseModelTypeProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-foreground">
        {t('settings.wizard.chooseModel', 'Choose Model')}
      </h2>
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => onSelect('cloud')}
          className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 transition-all hover:border-primary hover:bg-muted"
        >
          <Cloud className="h-8 w-8 text-primary" />
          <div className="text-center">
            <div className="font-medium text-foreground">
              {t('settings.wizard.cloud', 'Cloud')}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {t('settings.wizard.cloudDescription', 'Use AI models from cloud providers')}
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onSelect('local')}
          className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 transition-all hover:border-primary hover:bg-muted"
        >
          <HardDrive className="h-8 w-8 text-primary" />
          <div className="text-center">
            <div className="font-medium text-foreground">
              {t('settings.wizard.local', 'Local')}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {t('settings.wizard.localDescription', 'Use Ollama on your machine')}
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
