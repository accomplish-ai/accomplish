import { useTranslation } from 'react-i18next';
import { SpinnerGap } from '@phosphor-icons/react';

export function SidebarFallback() {
  const { t } = useTranslation('errors');
  return (
    <div className="flex flex-col items-center justify-center h-full p-4 text-muted-foreground">
      <SpinnerGap className="animate-spin mb-2" />
      <div>{t('boundary.sidebarLoading')}</div>
    </div>
  );
}
