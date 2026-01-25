'use client';

import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Layers, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAccomplish } from '@/lib/accomplish';

type SettingsTab = 'general' | 'providers';

interface SettingsNavItem {
  id: SettingsTab;
  label: string;
  icon: LucideIcon;
}

interface SettingsNavProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

const settingsNavItems: SettingsNavItem[] = [
  {
    id: 'general',
    label: 'General',
    icon: Settings,
  },
  {
    id: 'providers',
    label: 'Providers',
    icon: Layers,
  },
];

export function SettingsNav({ activeTab, onTabChange }: SettingsNavProps) {
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    const accomplish = getAccomplish();
    accomplish.getVersion().then(setAppVersion).catch(() => setAppVersion(null));
  }, []);

  return (
    <aside className="flex w-50 flex-col border-r border-border bg-muted/40 p-4">
      <nav className="space-y-1">
        {settingsNavItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
              activeTab === item.id
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            )}
          >
            <item.icon className="size-4" />
            <span className="flex flex-col">
              <span className="font-medium text-foreground">{item.label}</span>
            </span>
          </button>
        ))}
      </nav>
      <div className="mt-auto pt-4 text-xs text-muted-foreground">
        Openwork Desktop{appVersion ? ` v${appVersion}` : ''}
      </div>
    </aside>
  );
}
