import { useTranslation } from 'react-i18next';
import type { ToolSupportStatus } from '@accomplish_ai/agent-core';
import { ModelSelector, ToolSupportBadge, AlertCallout } from '../shared';
import type { OllamaModel } from './ollama-types';

export function OllamaModelSelector({
  models,
  value,
  onChange,
  error,
}: {
  models: OllamaModel[];
  value: string | null;
  onChange: (modelId: string) => void;
  error: boolean;
}) {
  const { t } = useTranslation('settings');
  const sortedModels = [...models].sort((a, b) => {
    const order: Record<ToolSupportStatus, number> = { supported: 0, unknown: 1, unsupported: 2 };
    const aOrder = order[a.toolSupport || 'unknown'];
    const bOrder = order[b.toolSupport || 'unknown'];
    return aOrder - bOrder;
  });

  const toolIconMap: Record<ToolSupportStatus | 'unknown', string> = {
    supported: '✓',
    unsupported: '✗',
    unknown: '?',
  };

  const selectorModels = sortedModels.map((model) => {
    const toolSupport = model.toolSupport || 'unknown';
    const toolIcon = toolIconMap[toolSupport];
    return { id: model.id, name: `${model.name} ${toolIcon}` };
  });

  const selectedModel = models.find((m) => m.id === value);
  const hasUnsupportedSelected = selectedModel?.toolSupport === 'unsupported';
  const hasUnknownSelected = selectedModel?.toolSupport === 'unknown';

  return (
    <div>
      <ModelSelector models={selectorModels} value={value} onChange={onChange} error={error} />
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
