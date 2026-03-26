import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Lightning } from '@phosphor-icons/react';
import type { Skill } from '@accomplish_ai/agent-core';
import { cn } from '@/lib/utils';

/** Props for the {@link SlashCommandPopover} component. */
interface SlashCommandPopoverProps {
  isOpen: boolean;
  skills: Skill[];
  selectedIndex: number;
  query: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Character index of the `/` trigger inside the textarea value. */
  triggerStart: number;
  onSelect: (skill: Skill) => void;
  onDismiss: () => void;
}

/** Calculate the visual position of a character in a textarea via an off-screen mirror. */
function getCaretPosition(textarea: HTMLTextAreaElement, charIndex: number) {
  const mirror = document.createElement('div');
  const style = window.getComputedStyle(textarea);
  const properties = [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'letterSpacing',
    'lineHeight',
    'padding',
    'paddingTop',
    'paddingLeft',
    'paddingRight',
    'paddingBottom',
    'border',
    'borderWidth',
    'boxSizing',
    'whiteSpace',
    'wordWrap',
    'wordBreak',
    'overflowWrap',
  ] as const;

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.overflow = 'hidden';

  for (const prop of properties) {
    mirror.style.setProperty(
      prop.replace(/([A-Z])/g, '-$1').toLowerCase(),
      style.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase()),
    );
  }

  const textBefore = textarea.value.substring(0, charIndex);
  const textNode = document.createTextNode(textBefore);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';

  mirror.appendChild(textNode);
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();

  const top = markerRect.top - mirrorRect.top - textarea.scrollTop;
  const left = markerRect.left - mirrorRect.left;

  document.body.removeChild(mirror);

  return { top, left };
}

/**
 * Floating popover that renders a filtered list of available skills.
 * Positioned near the textarea caret using a mirror-element measurement.
 * Supports mouse selection, outside-click dismissal, and keyboard hints.
 */
export function SlashCommandPopover({
  isOpen,
  skills,
  selectedIndex,
  query,
  textareaRef,
  triggerStart,
  onSelect,
  onDismiss,
}: SlashCommandPopoverProps) {
  const { t } = useTranslation('home');
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({
    bottom: '100%',
    left: 0,
  });

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const caretPos = getCaretPosition(textarea, triggerStart);
    const textareaRect = textarea.getBoundingClientRect();
    const containerRect = textarea.parentElement?.getBoundingClientRect();
    if (containerRect) {
      const offsetTop = textareaRect.top - containerRect.top;
      setPopoverStyle({
        bottom: containerRect.height - offsetTop - caretPos.top + 4,
        left: Math.max(0, Math.min(caretPos.left, containerRect.width - 280)),
      });
    }
  }, [isOpen, triggerStart, textareaRef]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onDismiss]);

  if (!isOpen || skills.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={listRef}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.12 }}
          style={popoverStyle}
          className="absolute z-50 w-[280px] rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-border/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lightning className="h-3 w-3" weight="bold" />
              <span>
                {query
                  ? t('slashCommand.filtering', {
                      query,
                      defaultValue: `Skills matching "${query}"`,
                    })
                  : t('slashCommand.title', { defaultValue: 'Skills' })}
              </span>
            </div>
          </div>
          <div
            id="slash-command-listbox"
            role="listbox"
            className="max-h-[240px] overflow-y-auto py-1"
          >
            {skills.map((skill, index) => (
              <button
                type="button"
                key={skill.id}
                id={`slash-suggestion-${index}`}
                role="option"
                aria-selected={index === selectedIndex}
                ref={index === selectedIndex ? selectedRef : undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => {
                  onSelect(skill);
                }}
                className={cn(
                  'w-full px-3 py-2 text-left transition-colors',
                  index === selectedIndex ? 'bg-accent' : 'hover:bg-accent/50',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-primary/80">{skill.command}</span>
                </div>
                <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                  {skill.description}
                </div>
              </button>
            ))}
          </div>
          <div className="px-3 py-1.5 border-t border-border/50 flex items-center gap-3 text-[10px] text-muted-foreground/60">
            <span>↑↓ {t('slashCommand.navigate', { defaultValue: 'navigate' })}</span>
            <span>↵ {t('slashCommand.select', { defaultValue: 'select' })}</span>
            <span>esc {t('slashCommand.dismiss', { defaultValue: 'dismiss' })}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
