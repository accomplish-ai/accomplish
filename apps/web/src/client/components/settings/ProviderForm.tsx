import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CloudBrowserProviderConfig } from '@accomplish_ai/agent-core/common';

export interface ProviderDefinition {
  id: string;
  name: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; required: boolean }[];
}

export interface ProviderFormProps {
  provider: ProviderDefinition;
  config?: CloudBrowserProviderConfig;
  isActive: boolean;
  saving: boolean;
  onSave: (config: CloudBrowserProviderConfig) => void | Promise<void>;
  onToggleActive: () => void;
  onRemove: () => void;
}

export default function ProviderForm({
  provider,
  config,
  isActive,
  saving,
  onSave,
  onToggleActive,
  onRemove,
}: ProviderFormProps) {
  // Initialize from config; ProviderForm is re-mounted each time it opens (conditional render)
  const [formValues, setFormValues] = useState<Record<string, string>>(() => {
    const values: Record<string, string> = {};
    for (const field of provider.fields) {
      const key = field.key as keyof CloudBrowserProviderConfig;
      const val = config?.[key];
      values[field.key] = typeof val === 'string' ? val : '';
    }
    return values;
  });

  const buildProviderConfig = (): CloudBrowserProviderConfig => ({
    provider: provider.id as CloudBrowserProviderConfig['provider'],
    enabled: true,
    apiKey: formValues.apiKey || undefined,
    projectId: formValues.projectId || undefined,
    endpoint: formValues.endpoint || undefined,
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave(buildProviderConfig());
  };

  const handleSetActive = async () => {
    // Save current form values first (preserving unsaved edits), then toggle active
    if (isFormValid) {
      await onSave(buildProviderConfig());
    }
    onToggleActive();
  };

  const isFormValid = provider.fields
    .filter((f) => f.required)
    .every((f) => Boolean(formValues[f.key]?.trim()));

  return (
    <div className="border-t border-border p-4 space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        {provider.fields.map((field) => (
          <div key={field.key}>
            <Label htmlFor={`cloud-browser-${provider.id}-${field.key}`} className="mb-1">
              {field.label}
              {field.required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            <Input
              id={`cloud-browser-${provider.id}-${field.key}`}
              type={field.key === 'apiKey' ? 'password' : 'text'}
              placeholder={field.placeholder}
              value={formValues[field.key] ?? ''}
              onChange={(e) => setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
            />
          </div>
        ))}

        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" size="sm" disabled={saving || !isFormValid}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
          {config && (
            <>
              <Button
                type="button"
                size="sm"
                variant={isActive ? 'secondary' : 'outline'}
                onClick={handleSetActive}
                disabled={saving}
                className={
                  isActive ? '' : 'text-green-600 dark:text-green-400 hover:bg-green-500/10'
                }
              >
                {isActive ? 'Deactivate' : 'Set Active'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onRemove}
                disabled={saving}
                className="text-destructive hover:bg-destructive/10"
              >
                Remove
              </Button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
