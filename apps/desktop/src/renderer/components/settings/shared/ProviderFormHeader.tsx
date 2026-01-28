// apps/desktop/src/renderer/components/settings/shared/ProviderFormHeader.tsx

interface ProviderFormHeaderProps {
  logoSrc: string;
  providerName: string;
}

export function ProviderFormHeader({
  logoSrc,
  providerName,
}: ProviderFormHeaderProps) {
  return (
    <div className="mb-5 flex items-center gap-3">
      {/* Fixed-size container to prevent layout shift when switching providers */}
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center">
        <img
          src={logoSrc}
          alt={`${providerName} logo`}
          className="h-6 w-6 object-contain"
        />
      </div>
      <span className="text-base font-medium text-foreground">
        {providerName} Settings
      </span>
    </div>
  );
}
