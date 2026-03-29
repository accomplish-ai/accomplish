import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Check, Copy } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

const COPIED_STATE_DURATION_MS = 1000;

interface MessageCopyButtonProps {
  content: string;
  isUser: boolean;
}

export function MessageCopyButton({ content, isUser }: MessageCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tone = isUser ? 'user' : 'assistant';
  const stateClassMap = {
    user: {
      idle: 'text-primary-foreground/70 hover:text-primary-foreground',
      copied: 'bg-accent text-foreground hover:bg-accent',
    },
    assistant: {
      idle: 'text-muted-foreground hover:text-foreground',
      copied: 'bg-accent text-foreground hover:bg-accent',
    },
  } as const;
  const stateClasses = copied ? stateClassMap[tone].copied : stateClassMap[tone].idle;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, COPIED_STATE_DURATION_MS);
    } catch {
      // clipboard write may fail in non-secure contexts
    }
  }, [content]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleCopy}
          data-testid="message-copy-button"
          className={cn(
            'absolute bottom-2 right-2',
            'opacity-0 transition-all duration-200',
            'group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100',
            'p-1 rounded',
            isUser ? 'hover:bg-primary-foreground/20' : 'hover:bg-accent',
            stateClasses,
          )}
          aria-label={'Copy to clipboard'}
        >
          <Check className={cn('absolute h-4 w-4', !copied && 'hidden')} />
          <Copy className={cn('absolute h-4 w-4', copied && 'hidden')} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <span>Copy to clipboard</span>
      </TooltipContent>
    </Tooltip>
  );
}
