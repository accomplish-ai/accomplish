import type { Skill } from '@accomplish_ai/agent-core';

export interface SlashCommandState {
  isOpen: boolean;
  query: string;
  /** Character index where the '/' trigger starts */
  triggerStart: number;
  skills: Skill[];
  filteredSkills: Skill[];
  selectedIndex: number;
}

export const INITIAL_SLASH_STATE: SlashCommandState = {
  isOpen: false,
  query: '',
  triggerStart: -1,
  skills: [],
  filteredSkills: [],
  selectedIndex: 0,
};

/** Options accepted by the {@link useSlashCommand} hook. */
export interface UseSlashCommandOptions {
  /** Current text value of the input/textarea. */
  value: string;
  /** Ref to the textarea element where the slash command is being typed. */
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Called with the new text value after a skill command is inserted. */
  onChange: (value: string) => void;
}

/** Values returned by the {@link useSlashCommand} hook. */
export interface UseSlashCommandReturn {
  /** Current popover state (open, filtered skills, selected index, etc.). */
  state: SlashCommandState;
  /** Close the popover and reset state. */
  dismiss: () => void;
  /** Insert the given skill's command into the text and close the popover. */
  selectSkill: (skill: Skill) => void;
  /** Keyboard event handler — returns `true` when the event was consumed. */
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
  /** Call on every input change to detect slash triggers and update filtering. */
  handleChange: (newValue: string, selectionStart: number | null) => void;
}

/** Filter skills by matching `query` against command, name, and description (case-insensitive). */
export function filterSkills(skills: Skill[], query: string): Skill[] {
  if (!query) {
    return skills;
  }
  const q = query.toLowerCase();
  return skills.filter(
    (s) =>
      s.command.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q),
  );
}

/**
 * Detect if the character at `pos` is a slash trigger:
 * either at position 0 or preceded by whitespace/newline.
 */
export function isSlashTrigger(value: string, pos: number): boolean {
  if (value[pos] !== '/') {
    return false;
  }
  return pos === 0 || /\s/.test(value[pos - 1]);
}

/**
 * Walk backwards from cursor to find the active slash-trigger range.
 * Returns { triggerStart, query } or null if no active trigger.
 */
export function findSlashContext(
  value: string,
  cursorPos: number,
): { triggerStart: number; query: string } | null {
  let i = cursorPos - 1;
  while (i >= 0) {
    const ch = value[i];
    if (ch === '/') {
      if (isSlashTrigger(value, i)) {
        return { triggerStart: i, query: value.slice(i + 1, cursorPos) };
      }
      return null;
    }
    if (/\s/.test(ch)) {
      return null;
    }
    i--;
  }
  return null;
}
