// apps/desktop/src/renderer/components/settings/shared/ProviderFormHeader.tsx

import { cn } from '@/lib/utils';

interface ProviderFormHeaderProps {
  logoSrc: string;
  providerName: string;
  invertInDark?: boolean;
}

export function ProviderFormHeader({ logoSrc, providerName, invertInDark }: ProviderFormHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-5">
      {/* Fixed-size container to prevent layout shift when switching providers */}
      <div className="h-8 w-8 flex items-center justify-center flex-shrink-0">
        <img
          src={logoSrc}
          alt={`${providerName} logo`}
          className={cn('h-6 w-6 object-contain', invertInDark && 'dark:invert')}
        />
      </div>
      <span className="text-base font-medium text-foreground">{providerName} Settings</span>
    </div>
  );
}
