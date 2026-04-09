import { useTranslation } from 'react-i18next';
import type { ToolSupportStatus } from '@accomplish_ai/agent-core/common';
import { ModelSelector, ToolSupportBadge, AlertCallout } from '../shared';
import type { LMStudioModel } from './useLMStudioProviderConnect';

export function LMStudioModelSelector({
  models,
  value,
  onChange,
  error,
}: {
  models: LMStudioModel[];
  value: string | null;
  onChange: (modelId: string) => void;
  error: boolean;
}) {
  const { t } = useTranslation('settings');
  const sortedModels = [...models].sort((a, b) => {
    const order: Record<ToolSupportStatus, number> = { supported: 0, unknown: 1, unsupported: 2 };
    return order[a.toolSupport] - order[b.toolSupport];
  });

  const TOOL_ICON_MAP: Record<string, string> = { supported: '✓', unsupported: '✗' };
  const selectorModels = sortedModels.map((model) => {
    const toolIcon = TOOL_ICON_MAP[model.toolSupport] ?? '?';
    return { id: `lmstudio/${model.id}`, name: `${model.name} ${toolIcon}` };
  });

  const selectedModel = models.find((m) => `lmstudio/${m.id}` === value);
  const hasUnsupportedSelected = selectedModel?.toolSupport === 'unsupported';
  const hasUnknownSelected = selectedModel?.toolSupport === 'unknown';

  return (
    <div>
      <ModelSelector
        models={selectorModels}
        value={value}
        onChange={onChange}
        error={error}
        errorMessage={t('common.pleaseSelectModel')}
        placeholder={t('common.selectModel')}
      />
      {hasUnsupportedSelected && (
        <AlertCallout
          variant="warning"
          title={t('common.toolUnsupported')}
          detail={t('common.toolUnsupportedDetail')}
        />
      )}
      {hasUnknownSelected && (
        <AlertCallout
          variant="info"
          title={t('common.toolUnknown')}
          detail={t('common.toolUnknownDetail')}
        />
      )}
      <div className="flex items-center gap-3 pt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <ToolSupportBadge status="supported" t={t} />
          <span>{t('common.functionCallingVerified')}</span>
        </span>
      </div>
    </div>
  );
}
