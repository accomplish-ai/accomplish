import type { ProviderId } from '@accomplish_ai/agent-core/common';
import anthropicLogo from '/assets/ai-logos/anthropic.svg';
import openaiLogo from '/assets/ai-logos/openai.svg';
import googleLogo from '/assets/ai-logos/google.svg';
import xaiLogo from '/assets/ai-logos/xai.svg';
import deepseekLogo from '/assets/ai-logos/deepseek.svg';
import moonshotLogo from '/assets/ai-logos/moonshot.svg';
import zaiLogo from '/assets/ai-logos/zai.svg';
import bedrockLogo from '/assets/ai-logos/bedrock.svg';
import vertexLogo from '/assets/ai-logos/vertex.svg';
import azureLogo from '/assets/ai-logos/azure.svg';
import ollamaLogo from '/assets/ai-logos/ollama.svg';
import openrouterLogo from '/assets/ai-logos/openrouter.svg';
import litellmLogo from '/assets/ai-logos/litellm.svg';
import minimaxLogo from '/assets/ai-logos/minimax.svg';
import lmstudioLogo from '/assets/ai-logos/lmstudio.png';

export const PROVIDER_LOGOS: Record<ProviderId, string> = {
  anthropic: anthropicLogo,
  openai: openaiLogo,
  google: googleLogo,
  xai: xaiLogo,
  deepseek: deepseekLogo,
  moonshot: moonshotLogo,
  zai: zaiLogo,
  bedrock: bedrockLogo,
  vertex: vertexLogo,
  'azure-foundry': azureLogo,
  ollama: ollamaLogo,
  openrouter: openrouterLogo,
  litellm: litellmLogo,
  minimax: minimaxLogo,
  lmstudio: lmstudioLogo,
};

export const DARK_INVERT_PROVIDERS = new Set<ProviderId>(['openai', 'xai', 'ollama', 'openrouter']);

export function getProviderLogo(providerId: ProviderId): string | undefined {
  return PROVIDER_LOGOS[providerId];
}
