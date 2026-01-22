/**
 * Utility functions for model display names
 */

/**
 * Model ID to display name mappings
 */
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // Anthropic
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
};

/**
 * Provider prefixes to strip from model IDs
 */
const PROVIDER_PREFIXES = [
  'anthropic/',
  'openai/',
  'google/',
  'xai/',
  'deepseek/',
  'ollama/',
  'openrouter/',
  'litellm/',
  'bedrock/',
  'zai-coding-plan/',
];

/**
 * Convert a model ID to a human-readable display name
 *
 * Examples:
 * - "anthropic/claude-sonnet-4-20250514" → "Claude Sonnet"
 * - "openai/gpt-4o" → "GPT-4o"
 * - "ollama/llama3.2" → "Llama3.2"
 * - "openrouter/anthropic/claude-opus-4-5" → "Claude Opus"
 *
 * @param modelId - The full model ID (may include provider prefix)
 * @returns Human-readable display name
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
  return cleanId
    .split('-')
    .map(part => {
      // Keep version numbers as-is
      if (/^\d/.test(part)) return part;
      // Capitalize first letter
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim() || 'AI';
}
