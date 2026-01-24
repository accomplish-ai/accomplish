'use client';

import {InfoIcon} from "lucide-react";
import {Label} from "@/components/ui/label";
import {Button} from "@/components/ui/button";

interface GeneralSettingsProps {
  debugMode: boolean;
  onToggleDebugMode: () => void;
}

interface GeneralSettingsItem {
  title: string;
  description: string;
  value: string;
}

export function GeneralSettings({ debugMode, onToggleDebugMode }: GeneralSettingsProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">General</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage system preferences for Openwork.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="text-sm font-medium text-foreground">Debug Mode</div>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              Show detailed backend logs in the task view.
            </p>
          </div>
          <div className="ml-4">
            <button
              data-testid="settings-debug-toggle"
              onClick={onToggleDebugMode}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-accomplish ${debugMode ? 'bg-primary' : 'bg-muted'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-accomplish ${debugMode ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>
        </div>
        {debugMode && (
            <div className="flex flex-col gap-4 bg-muted/50 p-2 rounded-xl">
              <div className='flex flex-col gap-1'>
                <div className='flex items-center gap-1'>
                  <InfoIcon className='size-3.5 text-muted-foreground' />
                  <p>
                    Debug mode is enabled. Backend logs will appear in the task view when running tasks.
                  </p>
                </div>
              </div>
            </div>
        )}
      </section>
    </div>
  );
}
