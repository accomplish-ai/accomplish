import { useTranslation } from 'react-i18next';
import { LanguageSelector } from './LanguageSelector';
import { ThemeSelector } from './ThemeSelector';

interface AboutTabProps {
  appVersion: string;
}

export function AboutTab({ appVersion }: AboutTabProps) {
  const { t } = useTranslation('settings');
  return (
    <div className="space-y-6">
      <ThemeSelector />
      <LanguageSelector />
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="space-y-4">
          <div>
            <div className="text-sm text-muted-foreground">{t('about.visitUs')}</div>
            <a
              href="https://www.accomplish.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              www.accomplish.ai
            </a>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">{t('about.haveQuestion')}</div>
            <a href="mailto:support@accomplish.ai" className="text-primary hover:underline">
              support@accomplish.ai
            </a>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">{t('about.versionLabel')}</div>
            <div className="font-medium">{appVersion || t('about.loading')}</div>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-border text-xs text-muted-foreground">
          {t('about.allRightsReserved')}
        </div>
      </div>
    </div>
  );
}
