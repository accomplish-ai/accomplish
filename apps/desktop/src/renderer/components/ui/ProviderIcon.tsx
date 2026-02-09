/**
 * Provider brand icon component
 * Shows a colored icon with the provider's initial
 */

import type { ProviderType } from '@accomplish_ai/agent-core/common';
import { cn } from '@/lib/utils';

interface ProviderIconProps {
  provider: ProviderType | string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Provider brand colors
 */
const PROVIDER_COLORS: Record<string, string> = {
  anthropic: 'bg-[#D4A574]', // Warm coral/tan
  openai: 'bg-[#10A37F]',    // Green
  google: 'bg-[#4285F4]',    // Blue
  xai: 'bg-[#1DA1F2]',       // Twitter blue
  deepseek: 'bg-[#6366F1]',  // Indigo
  moonshot: 'bg-[#8B5CF6]',  // Purple
  ollama: 'bg-[#F97316]',    // Orange
  openrouter: 'bg-[#EC4899]', // Pink
  litellm: 'bg-[#06B6D4]',   // Cyan
  bedrock: 'bg-[#FF9900]',   // AWS Orange
  zai: 'bg-[#22C55E]',       // Green
  minimax: 'bg-[#EF4444]',   // Red
  lmstudio: 'bg-[#3B82F6]',  // Blue
  'azure-foundry': 'bg-[#0078D4]', // Azure blue
  custom: 'bg-[#6B7280]',    // Gray
};

/**
 * Provider initials
 */
const PROVIDER_INITIALS: Record<string, string> = {
  anthropic: 'A',
  openai: 'G',   // GPT
  google: 'G',
  xai: 'X',
  deepseek: 'D',
  moonshot: 'K', // Kimi
  ollama: 'O',
  openrouter: 'R',
  litellm: 'L',
  bedrock: 'B',
  zai: 'Z',
  minimax: 'M',
  lmstudio: 'L',
  'azure-foundry': 'A',
  custom: 'C',
};

const SIZE_CLASSES = {
  sm: 'w-4 h-4 text-[9px]',
  md: 'w-5 h-5 text-[10px]',
  lg: 'w-6 h-6 text-xs',
};

export function ProviderIcon({ provider, size = 'md', className }: ProviderIconProps) {
  const colorClass = provider ? PROVIDER_COLORS[provider] || PROVIDER_COLORS.custom : PROVIDER_COLORS.custom;
  const initial = provider ? PROVIDER_INITIALS[provider] || provider.charAt(0).toUpperCase() : '?';
  const sizeClass = SIZE_CLASSES[size];

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded font-semibold text-white flex-shrink-0',
        colorClass,
        sizeClass,
        className
      )}
    >
      {initial}
    </div>
  );
}
