import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Shield, Plus, Trash2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { getAccomplish } from '@/lib/accomplish';
import type { SandboxConfig } from '@accomplish_ai/agent-core/common';
import { settingsVariants, settingsTransitions } from '@/lib/animations';

const DEFAULT_ALLOWED_DOMAINS = [
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'api.x.ai',
  'api.deepseek.com',
  'api.moonshot.cn',
  'openrouter.ai',
  '*.amazonaws.com',
  '*.azure.com',
  '*.openai.azure.com',
  'github.com',
  '*.github.com',
  '*.npmjs.org',
  'registry.npmjs.org',
  'pypi.org',
  '*.pypi.org',
];

const DEFAULT_PROTECTED_PATHS = [
  '~/.claude/settings.json',
  '~/.claude/hooks/**',
  '.claude/settings.json',
  '.claude/hooks/**',
  '.mcp.json',
  '.git/hooks/**',
];

const DEFAULT_CONFIG: SandboxConfig = {
  enabled: true,
  allowedDomains: [...DEFAULT_ALLOWED_DOMAINS],
  allowedDomainsVersion: 2,
  additionalWritePaths: [],
  denyReadPaths: [],
  allowPty: true,
  allowLocalBinding: true,
  allowAllUnixSockets: true,
  enableWeakerNestedSandbox: false,
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

function normalizeBoolean(value: unknown, defaultValue: boolean): boolean {
  return typeof value === 'boolean' ? value : defaultValue;
}

function normalizeSandboxConfigForUI(config: unknown): SandboxConfig {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { ...DEFAULT_CONFIG };
  }

  const raw = config as Record<string, unknown>;
  const rawAllowedDomains = raw.allowedDomains ?? raw.additionalAllowedDomains;
  const hasAllowedDomains = rawAllowedDomains !== undefined && rawAllowedDomains !== null;
  const normalizedAllowedDomains = normalizeStringArray(rawAllowedDomains);
  const rawAdditionalWritePaths = raw.additionalWritePaths ?? raw.additionalAllowWrite;
  const rawDenyReadPaths = raw.denyReadPaths ?? raw.additionalDenyRead ?? raw.denyRead;

  return {
    enabled: normalizeBoolean(raw.enabled, DEFAULT_CONFIG.enabled),
    allowedDomains: hasAllowedDomains ? normalizedAllowedDomains : [...DEFAULT_ALLOWED_DOMAINS],
    allowedDomainsVersion: 2,
    additionalWritePaths: normalizeStringArray(rawAdditionalWritePaths),
    denyReadPaths: normalizeStringArray(rawDenyReadPaths),
    allowPty: normalizeBoolean(raw.allowPty, DEFAULT_CONFIG.allowPty),
    allowLocalBinding: normalizeBoolean(raw.allowLocalBinding, DEFAULT_CONFIG.allowLocalBinding),
    allowAllUnixSockets: normalizeBoolean(raw.allowAllUnixSockets, DEFAULT_CONFIG.allowAllUnixSockets),
    enableWeakerNestedSandbox: normalizeBoolean(
      raw.enableWeakerNestedSandbox,
      DEFAULT_CONFIG.enableWeakerNestedSandbox
    ),
  };
}

function Toggle({ checked, onChange, variant = 'primary' }: {
  checked: boolean;
  onChange: () => void;
  variant?: 'primary' | 'warning';
}) {
  const activeColor = variant === 'warning' ? 'bg-warning' : 'bg-primary';
  return (
    <button
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-accomplish ${
        checked ? activeColor : 'bg-muted'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-accomplish ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function EditableList({ items, onAdd, onRemove, placeholder, mono = false }: {
  items: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  placeholder: string;
  mono?: boolean;
}) {
  const [inputValue, setInputValue] = useState('');
  const normalizedItems = Array.isArray(items) ? items : [];

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !normalizedItems.includes(trimmed)) {
      onAdd(trimmed);
      setInputValue('');
    }
  };

  return (
    <>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={placeholder}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={handleAdd}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {normalizedItems.length > 0 && (
        <div className="space-y-1.5">
          {normalizedItems.map((item) => (
            <div
              key={item}
              className="flex items-center justify-between rounded-md bg-muted px-3 py-2"
            >
              <span className={`text-sm text-foreground ${mono ? 'font-mono' : ''}`}>{item}</span>
              <button
                onClick={() => onRemove(item)}
                className="text-muted-foreground hover:text-destructive ml-2"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

interface SecurityPanelProps {
  onApplied?: () => void;
}

export function SecurityPanel({ onApplied }: SecurityPanelProps = {}) {
  const [config, setConfig] = useState<SandboxConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    getAccomplish().getSandboxConfig().then((stored) => {
      setConfig(normalizeSandboxConfigForUI(stored));
    }).catch((err) => {
      console.error('Failed to load sandbox config:', err);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  const saveConfig = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const normalizedConfig = normalizeSandboxConfigForUI(config);
      setConfig(normalizedConfig);
      await getAccomplish().setSandboxConfig(normalizedConfig);
      setSaveStatus('success');
      onApplied?.();
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium text-foreground">Sandbox Security</h3>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              The sandbox restricts filesystem and network access when running tasks,
              preventing unauthorized operations outside of allowed paths and domains.
            </p>
          </div>
        </div>
      </div>

      {/* Master Toggle */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-foreground">Enable Sandbox</div>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              Restricts tasks with OS-level filesystem and network controls.
            </p>
          </div>
          <Toggle
            checked={config.enabled}
            onChange={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
          />
        </div>
        {!config.enabled && (
          <div className="mt-4 rounded-xl bg-warning/10 p-3.5 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-sm text-warning">
              Sandbox is disabled. Tasks will run without security restrictions.
            </p>
          </div>
        )}
      </div>

      {/* Network Access */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="font-medium text-foreground mb-4">Network Access</h3>

        <div>
          <div className="text-sm font-medium text-foreground mb-2">
            Allowed Domains
          </div>
          <EditableList
            items={config.allowedDomains}
            onAdd={(domain) => setConfig((prev) => {
              if (prev.allowedDomains.includes(domain)) {
                return prev;
              }
              return {
                ...prev,
                allowedDomains: [...prev.allowedDomains, domain],
              };
            })}
            onRemove={(domain) => setConfig((prev) => ({
              ...prev,
              allowedDomains: prev.allowedDomains.filter(d => d !== domain),
            }))}
            placeholder="example.com or *.example.com"
          />
        </div>
      </div>

      {/* Filesystem Access */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="font-medium text-foreground mb-4">Filesystem Access</h3>

        <div className="mb-6">
          <div className="text-sm font-medium text-foreground mb-1">
            Additional Write Paths
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Extra paths tasks can write to, beyond the task working directory.
          </p>
          <EditableList
            items={config.additionalWritePaths}
            onAdd={(p) => setConfig((prev) => ({
              ...prev,
              additionalWritePaths: [...prev.additionalWritePaths, p],
            }))}
            onRemove={(p) => setConfig((prev) => ({
              ...prev,
              additionalWritePaths: prev.additionalWritePaths.filter(x => x !== p),
            }))}
            placeholder="/path/to/directory"
            mono
          />
        </div>

        <div className="mb-4">
          <div className="text-sm font-medium text-muted-foreground mb-2">
            Protected Paths (always blocked from writes)
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground font-mono max-h-24 overflow-y-auto">
            {DEFAULT_PROTECTED_PATHS.join(', ')}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-foreground mb-1">
            Deny Read Paths
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Paths that tasks cannot read from.
          </p>
          <EditableList
            items={config.denyReadPaths}
            onAdd={(p) => setConfig((prev) => ({
              ...prev,
              denyReadPaths: [...prev.denyReadPaths, p],
            }))}
            onRemove={(p) => setConfig((prev) => ({
              ...prev,
              denyReadPaths: prev.denyReadPaths.filter(x => x !== p),
            }))}
            placeholder="/path/to/sensitive/directory"
            mono
          />
        </div>
      </div>

      {/* Advanced Options */}
      <div className="rounded-lg border border-border bg-card p-5">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center justify-between w-full"
        >
          <h3 className="font-medium text-foreground">Advanced Options</h3>
          {showAdvanced ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              className="mt-4 space-y-4"
              variants={settingsVariants.slideDown}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 mr-4">
                  <div className="text-sm font-medium text-foreground">Allow PTY</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Enable pseudo-terminal operations. Required for interactive CLI tools.
                  </p>
                </div>
                <Toggle
                  checked={config.allowPty}
                  onChange={() => setConfig((prev) => ({ ...prev, allowPty: !prev.allowPty }))}
                />
              </div>

              <div className="flex items-start justify-between">
                <div className="flex-1 mr-4">
                  <div className="text-sm font-medium text-foreground">Allow Local Binding</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Allow binding to local ports (e.g., localhost:3000).
                  </p>
                </div>
                <Toggle
                  checked={config.allowLocalBinding}
                  onChange={() => setConfig((prev) => ({
                    ...prev,
                    allowLocalBinding: !prev.allowLocalBinding,
                  }))}
                />
              </div>

              <div className="flex items-start justify-between">
                <div className="flex-1 mr-4">
                  <div className="text-sm font-medium text-foreground">Allow Unix Sockets</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Allow connecting to Unix domain sockets.
                  </p>
                </div>
                <Toggle
                  checked={config.allowAllUnixSockets}
                  onChange={() => setConfig((prev) => ({
                    ...prev,
                    allowAllUnixSockets: !prev.allowAllUnixSockets,
                  }))}
                />
              </div>

              <div className="flex items-start justify-between">
                <div className="flex-1 mr-4">
                  <div className="text-sm font-medium text-foreground flex items-center gap-2">
                    Weaker Nested Sandbox
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">
                      Reduces Security
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use weaker sandbox for nested container environments. Only enable if needed.
                  </p>
                </div>
                <Toggle
                  checked={config.enableWeakerNestedSandbox}
                  onChange={() => setConfig((prev) => ({
                    ...prev,
                    enableWeakerNestedSandbox: !prev.enableWeakerNestedSandbox,
                  }))}
                  variant="warning"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Apply Button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Running tasks may need to be restarted after changes.
        </p>
        <button
          onClick={saveConfig}
          disabled={saving}
          className={`rounded-md px-6 py-2 text-sm font-medium transition-colors ${
            saveStatus === 'success'
              ? 'bg-green-500 text-white'
              : saveStatus === 'error'
              ? 'bg-destructive text-destructive-foreground'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}
        >
          {saving ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Apply Changes'}
        </button>
      </div>
    </div>
  );
}
