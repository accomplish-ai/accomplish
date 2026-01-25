'use client';

import { InfoIcon } from "lucide-react";
import type { Appearance } from "@accomplish/shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet} from "@/components/ui/field";
import {Switch} from "@/components/ui/switch";

interface GeneralSettingsProps {
  debugMode: boolean;
  onToggleDebugMode: () => void;
  appearance: Appearance;
  onAppearanceChange: (appearance: Appearance) => void;
}

const appearanceLabels: Record<Appearance, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export function GeneralSettings({
  debugMode,
  onToggleDebugMode,
  appearance,
  onAppearanceChange,
}: GeneralSettingsProps) {
  return (
      <FieldGroup>
        <FieldSet>
          <FieldLegend>General</FieldLegend>
          <FieldDescription>
            Manage system preferences for Openwork
          </FieldDescription>
        </FieldSet>

        <Card>
          <CardHeader>
            <CardTitle className='text-sm'>
              Appearance
            </CardTitle>
            <CardDescription>
              Choose your preferred color scheme
            </CardDescription>
            <CardAction>
              <Select value={appearance} onValueChange={(value) => onAppearanceChange(value as Appearance)}>
                <SelectTrigger className="w-32">
                  <SelectValue>{appearanceLabels[appearance]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </CardAction>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-sm'>
              Debug Mode
            </CardTitle>
            <CardDescription>
              Show detailed backend logs in the task view.
            </CardDescription>
            <CardAction>
              <Switch checked={debugMode} onCheckedChange={onToggleDebugMode} />
            </CardAction>
          </CardHeader>
          {debugMode && (
            <CardContent>
              <Field className='bg-muted/50 px-3 py-2 rounded-lg'>
                <FieldLabel className='justify-between'>
                  <div className='flex items-center gap-1'>
                    <InfoIcon className='size-3.5 text-muted-foreground' />
                    <p className='text-muted-foreground'>Debug mode is enabled. Backend logs will appear in the task view when running tasks.</p>
                  </div>
                </FieldLabel>
              </Field>
            </CardContent>
          )}
        </Card>
      </FieldGroup>
  );
}
