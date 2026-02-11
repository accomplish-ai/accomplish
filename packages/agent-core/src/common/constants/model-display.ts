export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // Anthropic
  'claude-opus-4-6': 'Claude Opus 4.6',
  'claude-opus-4-5': 'Claude Opus 4.5',
  'claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  'claude-opus-4': 'Claude Opus 4',
  'claude-sonnet-4': 'Claude Sonnet 4',
  'claude-haiku-3-5': 'Claude Haiku 3.5',
  // OpenAI
  'gpt-5.2': 'GPT 5.2',
  'gpt-5.2-codex': 'GPT 5.2 Codex',
  'gpt-5.1-codex-max': 'GPT 5.1 Codex Max',
  'gpt-5.1-codex-mini': 'GPT 5.1 Codex Mini',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'o1': 'o1',
  'o1-mini': 'o1 Mini',
  'o1-preview': 'o1 Preview',
  'o3-mini': 'o3 Mini',
  // Google
  'gemini-3-pro-preview': 'Gemini 3 Pro',
  'gemini-3-flash-preview': 'Gemini 3 Flash',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
  'gemini-2.0-flash-thinking': 'Gemini 2.0 Flash Thinking',
  'gemini-1.5-pro': 'Gemini 1.5 Pro',
  // xAI
  'grok-4': 'Grok 4',
  'grok-3': 'Grok 3',
  'grok-2': 'Grok 2',
  'grok-beta': 'Grok Beta',
  // DeepSeek
  'deepseek-chat': 'DeepSeek Chat',
  'deepseek-reasoner': 'DeepSeek Reasoner',
  // Moonshot
  'kimi-k2.5': 'Kimi K2.5',
  'kimi-k2-turbo-preview': 'Kimi K2 Turbo',
  'kimi-latest': 'Kimi Latest',
  // Z.AI
  'glm-4.7-flashx': 'GLM-4.7 FlashX',
  'glm-4.7': 'GLM-4.7',
  'glm-4.7-flash': 'GLM-4.7 Flash',
  'glm-4.6': 'GLM-4.6',
  'glm-4.5-flash': 'GLM-4.5 Flash',
  // MiniMax
  'MiniMax-M2': 'MiniMax M2',
  'MiniMax-M2.1': 'MiniMax M2.1',
};

export const PROVIDER_PREFIXES = [
  'anthropic/',
  'openai/',
  'google/',
  'xai/',
  'deepseek/',
  'moonshot/',
  'ollama/',
  'openrouter/',
  'litellm/',
  'bedrock/',
  'zai/',
  'zai-coding-plan/',
  'minimax/',
  'lmstudio/',
  'azure-foundry/',
];

/**
 * Convert a model ID to a human-readable display name
 */
export function getModelDisplayName(modelId: string): string {
  if (!modelId) {
    return 'AI';
  }

  // Strip provider prefixes
  let cleanId = modelId;
  for (const prefix of PROVIDER_PREFIXES) {
    if (cleanId.startsWith(prefix)) {
      cleanId = cleanId.slice(prefix.length);
      break;
    }
  }

  // Handle openrouter format: openrouter/provider/model
  if (cleanId.includes('/')) {
    cleanId = cleanId.split('/').pop() || cleanId;
  }

  // Strip date suffixes (e.g., "-20250514", "-20241022")
  cleanId = cleanId.replace(/-\d{8}$/, '');

  // Check for known model mapping
  if (MODEL_DISPLAY_NAMES[cleanId]) {
    return MODEL_DISPLAY_NAMES[cleanId];
  }

  // Fallback: capitalize and clean up the model ID
  return (
    cleanId
      .split('-')
      .map(part => {
        // Keep version numbers as-is
        if (/^\d/.test(part)) return part;
        // Capitalize first letter
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim() || 'AI'
  );
}
