/**
 * State types and reducer for useBrowserPreview.
 * Extracted from useBrowserPreview.ts to keep files under 200 lines.
 */

import type { ViewStatus } from './StatusBadge';

export type PreviewState = {
  frameData: string | null;
  currentUrl: string;
  status: ViewStatus;
  error: string | undefined;
  isCollapsed: boolean;
};

export type PreviewAction =
  | { type: 'RESET' }
  | { type: 'IDLE' }
  | { type: 'SET_COLLAPSED'; value: boolean }
  | { type: 'SET_STARTING' }
  | { type: 'SET_FRAME'; frame: string }
  | { type: 'SET_URL'; url: string }
  | { type: 'SET_STATUS'; status: ViewStatus; message?: string };

const VIEW_STATUSES = new Set<string>(['idle', 'starting', 'streaming', 'stopping', 'error']);

export function isViewStatus(s: string): s is ViewStatus {
  return VIEW_STATUSES.has(s);
}

function assertNever(x: never): never {
  throw new Error(`Unhandled action type: ${JSON.stringify(x)}`);
}

export const initialPreviewState: PreviewState = {
  frameData: null,
  currentUrl: '',
  status: 'idle',
  error: undefined,
  isCollapsed: false,
};

export function previewReducer(state: PreviewState, action: PreviewAction): PreviewState {
  switch (action.type) {
    case 'RESET':
      return initialPreviewState;
    case 'IDLE':
      return { ...initialPreviewState, isCollapsed: state.isCollapsed };
    case 'SET_COLLAPSED':
      return { ...state, isCollapsed: action.value };
    case 'SET_STARTING':
      return { ...state, status: 'starting' };
    case 'SET_FRAME':
      return { ...state, frameData: action.frame, status: 'streaming' };
    case 'SET_URL':
      return { ...state, currentUrl: action.url };
    case 'SET_STATUS':
      return { ...state, status: action.status, error: action.message };
    default:
      return assertNever(action);
  }
}
