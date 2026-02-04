const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'claude-opus-4-5': 'Claude Opus',
  'claude-sonnet-4': 'Claude Sonnet',
  'claude-haiku-3-5': 'Claude Haiku',
  // OpenAI
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'o1': 'o1',
  'o1-mini': 'o1 Mini',
  'o1-preview': 'o1 Preview',
  'o3-mini': 'o3 Mini',
  // Google
  'gemini-2.0-flash': 'Gemini Flash',
  'gemini-2.0-flash-thinking': 'Gemini Flash Thinking',
  'gemini-1.5-pro': 'Gemini Pro',
  // xAI
  'grok-2': 'Grok 2',
  'grok-beta': 'Grok Beta',
  // DeepSeek
  'deepseek-chat': 'DeepSeek Chat',
  'deepseek-reasoner': 'DeepSeek Reasoner',
  // Moonshot
  'kimi-k2.5': 'Kimi K2.5',
  'kimi-k2-turbo-preview': 'Kimi K2 Turbo (Preview)',
  'kimi-latest': 'Kimi Latest',
};

const PROVIDER_PREFIXES = [
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
  'zai-coding-plan/',
];

export function getModelDisplayName(modelId: string): string {
  if (!modelId) {
    return 'AI';
  }

  let cleanId = modelId;
  for (const prefix of PROVIDER_PREFIXES) {
    if (cleanId.startsWith(prefix)) {
      cleanId = cleanId.slice(prefix.length);
      break;
    }
  }

  if (cleanId.includes('/')) {
    cleanId = cleanId.split('/').pop() || cleanId;
  }

  cleanId = cleanId.replace(/-\d{8}$/, '');

  if (MODEL_DISPLAY_NAMES[cleanId]) {
    return MODEL_DISPLAY_NAMES[cleanId];
  }

  return cleanId
    .split('-')
    .map(part => {
      if (/^\d/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim() || 'AI';
}

export function getKnownModelIds(): string[] {
  return Object.keys(MODEL_DISPLAY_NAMES);
}

export function isKnownModel(modelId: string): boolean {
  let cleanId = modelId;
  for (const prefix of PROVIDER_PREFIXES) {
    if (cleanId.startsWith(prefix)) {
      cleanId = cleanId.slice(prefix.length);
      break;
    }
  }
  if (cleanId.includes('/')) {
    cleanId = cleanId.split('/').pop() || cleanId;
  }
  cleanId = cleanId.replace(/-\d{8}$/, '');

  return cleanId in MODEL_DISPLAY_NAMES;
}
