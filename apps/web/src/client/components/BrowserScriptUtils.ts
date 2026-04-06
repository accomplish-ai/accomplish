import {
  Globe,
  CursorText,
  Cursor,
  Keyboard,
  Camera,
  Image,
  Clock,
  Code,
} from '@phosphor-icons/react';

// Browser action type from the MCP tool
export interface BrowserAction {
  action: string;
  url?: string;
  selector?: string;
  ref?: string;
  text?: string;
  key?: string;
  code?: string;
}

// Action type to icon mapping
export const ACTION_ICONS: Record<string, typeof Globe> = {
  goto: Globe,
  findAndFill: CursorText,
  findAndClick: Cursor,
  fillByRef: CursorText,
  clickByRef: Cursor,
  keyboard: Keyboard,
  snapshot: Camera,
  screenshot: Image,
  waitForSelector: Clock,
  waitForLoad: Clock,
  waitForNavigation: Clock,
  evaluate: Code,
};

// Format action to human-readable label
export function formatActionLabel(
  action: BrowserAction,
  t: (key: string, options?: { [key: string]: string | number }) => string,
): string {
  const maxLength = 25;
  let label = '';

  switch (action.action) {
    case 'goto': {
      try {
        const hostname = new URL(action.url || '').hostname.replace('www.', '');
        label = t('browserScript.actions.navigateTo', { hostname });
      } catch {
        label = t('browserScript.actions.navigate');
      }
      break;
    }
    case 'findAndFill':
    case 'fillByRef': {
      const text = action.text || '';
      label = text
        ? t('browserScript.actions.fill', { text })
        : t('browserScript.actions.fillField');
      break;
    }
    case 'findAndClick':
    case 'clickByRef': {
      const target = action.ref || action.selector || 'element';
      // Simplify selector for display
      const simplified = target.length > 15 ? target.slice(0, 12) + '...' : target;
      label = t('browserScript.actions.click', { target: simplified });
      break;
    }
    case 'keyboard':
      label = t('browserScript.actions.press', { key: action.key || 'key' });
      break;
    case 'snapshot':
      label = t('browserScript.actions.capturePage');
      break;
    case 'screenshot':
      label = t('browserScript.actions.screenshot');
      break;
    case 'waitForSelector':
      label = t('browserScript.actions.waitForElement');
      break;
    case 'waitForLoad':
      label = t('browserScript.actions.waitForPage');
      break;
    case 'waitForNavigation':
      label = t('browserScript.actions.waitForNavigation');
      break;
    case 'evaluate':
      label = t('browserScript.actions.runScript');
      break;
    default:
      label = action.action;
  }

  // Truncate if too long
  if (label.length > maxLength) {
    return label.slice(0, maxLength - 3) + '...';
  }
  return label;
}

// Generate stable key for action based on content, not index
export function getActionKey(action: BrowserAction, index: number): string {
  const parts = [action.action];
  if (action.url) {
    parts.push(action.url);
  }
  if (action.selector) {
    parts.push(action.selector);
  }
  if (action.ref) {
    parts.push(action.ref);
  }
  if (action.text) {
    parts.push(action.text);
  }
  if (action.key) {
    parts.push(action.key);
  }
  // Include index as fallback for duplicate actions
  return `${parts.join('-')}-${index}`;
}

export interface BrowserScriptCardProps {
  actions: BrowserAction[];
  isRunning?: boolean;
}

// Custom comparison for memo - compare actions by content, not reference
export function arePropsEqual(
  prevProps: BrowserScriptCardProps,
  nextProps: BrowserScriptCardProps,
): boolean {
  if (prevProps.isRunning !== nextProps.isRunning) {
    return false;
  }
  if (prevProps.actions.length !== nextProps.actions.length) {
    return false;
  }

  // Deep compare actions array
  for (let i = 0; i < prevProps.actions.length; i++) {
    const prev = prevProps.actions[i];
    const next = nextProps.actions[i];
    if (
      prev.action !== next.action ||
      prev.url !== next.url ||
      prev.selector !== next.selector ||
      prev.ref !== next.ref ||
      prev.text !== next.text ||
      prev.key !== next.key
    ) {
      return false;
    }
  }
  return true;
}
