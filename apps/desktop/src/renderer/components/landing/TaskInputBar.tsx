'use client';

import { useRef, useEffect } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import { analytics } from '@/lib/analytics';
import { CornerDownLeft, Loader2 } from 'lucide-react';
import {Textarea} from "@/components/ui/textarea";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";

interface TaskInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;
  large?: boolean;
  autoFocus?: boolean;
}

export default function TaskInputBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Assign a task or ask anything',
  isLoading = false,
  disabled = false,
  large = false,
  autoFocus = false,
}: TaskInputBarProps) {
  const isDisabled = disabled || isLoading;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const accomplish = getAccomplish();

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ignore Enter during IME composition (Chinese/Japanese input)
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="relative flex items-center gap-2 rounded-md border border-border  p-1 shadow-sm transition-all duration-200 ease-accomplish focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
      {/* Text input */}
      <Textarea
        data-testid="task-input-textarea"
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isDisabled}
        rows={1}
        className={cn(
            'resize-none bg-transparent! border-none focus-visible:ring-0 focus:ring-0 min-h-auto',
            large && 'text-xl'
        )}
      />

      {/* Submit button */}
      <Button
        data-testid="task-input-submit"
        type="button"
        title="Submit"
        onClick={() => {
          analytics.trackSubmitTask();
          accomplish.logEvent({
            level: 'info',
            message: 'Task input submit clicked',
            context: { prompt: value },
          });
          onSubmit();
        }}
        disabled={!value.trim() || isDisabled}
      >
        {isLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <CornerDownLeft className="size-4" />
        )}
      </Button>
    </div>
  );
}
