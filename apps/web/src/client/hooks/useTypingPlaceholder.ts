import { useState, useEffect } from 'react';

const DEFAULT_PLACEHOLDER = 'Describe a task and let AI handle the rest';
const TYPING_SPEED = 40;

interface UseTypingPlaceholderOptions {
  typingSpeed?: number;
  enabled?: boolean;
  text?: string;
}

export function useTypingPlaceholder({
  typingSpeed = TYPING_SPEED,
  enabled = true,
  text = DEFAULT_PLACEHOLDER,
}: UseTypingPlaceholderOptions = {}): string {
  const [state, setState] = useState({
    text,
    charCount: 0,
    completed: false,
  });
  const isCurrentText = state.text === text;
  const charCount = isCurrentText ? state.charCount : 0;
  const completed = isCurrentText ? state.completed : false;

  useEffect(() => {
    if (!enabled || completed) return;

    const id = setTimeout(
      () => {
        setState((prev) => {
          const baseline = prev.text === text ? prev : { text, charCount: 0, completed: false };
          const nextCharCount = baseline.charCount + 1;
          return {
            text,
            charCount: nextCharCount,
            completed: nextCharCount >= text.length,
          };
        });
      },
      charCount === 0 ? 400 : typingSpeed,
    );

    return () => clearTimeout(id);
  }, [enabled, charCount, typingSpeed, completed, text]);

  if (!enabled || completed) {
    return text;
  }

  return text.slice(0, charCount);
}
