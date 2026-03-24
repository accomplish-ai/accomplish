import {
  FileText,
  MagnifyingGlass,
  Terminal,
  Brain,
  Clock,
  WarningCircle,
  Globe,
  Cursor,
  TextT,
  Image,
  Code,
  Keyboard,
  ArrowsDownUp,
  ListChecks,
  Stack,
  Highlighter,
  ListNumbers,
  Upload,
  ArrowsOutCardinal,
  FrameCorners,
  ShieldCheck,
  ChatCircleDots,
  CheckCircle,
  Lightbulb,
  Flag,
  Play,
} from '@phosphor-icons/react';

export const THINKING_PHRASES = [
  'Doing...',
  'Executing...',
  'Running...',
  'Handling it...',
  'Accomplishing...',
];

export const TOOL_PROGRESS_MAP: Record<string, { label: string; icon: typeof FileText }> = {
  invalid: { label: 'Retrying...', icon: WarningCircle },
  Read: { label: 'Reading files', icon: FileText },
  Glob: { label: 'Finding files', icon: MagnifyingGlass },
  Grep: { label: 'Searching code', icon: MagnifyingGlass },
  Bash: { label: 'Running command', icon: Terminal },
  Write: { label: 'Writing file', icon: FileText },
  Edit: { label: 'Editing file', icon: FileText },
  Task: { label: 'Running agent', icon: Brain },
  WebFetch: { label: 'Fetching web page', icon: MagnifyingGlass },
  WebSearch: { label: 'Searching web', icon: MagnifyingGlass },
  dev_browser_execute: { label: 'Executing browser action', icon: Terminal },
  browser_navigate: { label: 'Navigating', icon: Globe },
  browser_snapshot: { label: 'Reading page', icon: MagnifyingGlass },
  browser_click: { label: 'Clicking', icon: Cursor },
  browser_type: { label: 'Typing', icon: TextT },
  browser_screenshot: { label: 'Taking screenshot', icon: Image },
  browser_evaluate: { label: 'Running script', icon: Code },
  browser_keyboard: { label: 'Pressing keys', icon: Keyboard },
  browser_scroll: { label: 'Scrolling', icon: ArrowsDownUp },
  browser_hover: { label: 'Hovering', icon: Cursor },
  browser_select: { label: 'Selecting option', icon: ListChecks },
  browser_wait: { label: 'Waiting', icon: Clock },
  browser_tabs: { label: 'Managing tabs', icon: Stack },
  browser_pages: { label: 'Getting pages', icon: Stack },
  browser_highlight: { label: 'Highlighting', icon: Highlighter },
  browser_sequence: { label: 'Browser sequence', icon: ListNumbers },
  browser_file_upload: { label: 'Uploading file', icon: Upload },
  browser_drag: { label: 'Dragging', icon: ArrowsOutCardinal },
  browser_get_text: { label: 'Getting text', icon: FileText },
  browser_is_visible: { label: 'Checking visibility', icon: MagnifyingGlass },
  browser_is_enabled: { label: 'Checking state', icon: MagnifyingGlass },
  browser_is_checked: { label: 'Checking state', icon: MagnifyingGlass },
  browser_iframe: { label: 'Switching frame', icon: FrameCorners },
  browser_canvas_type: { label: 'Typing in canvas', icon: TextT },
  browser_script: { label: 'Browser Actions', icon: Globe },
  request_file_permission: { label: 'Requesting permission', icon: ShieldCheck },
  AskUserQuestion: { label: 'Asking question', icon: ChatCircleDots },
  complete_task: { label: 'Completing task', icon: CheckCircle },
  report_thought: { label: 'Thinking', icon: Lightbulb },
  report_checkpoint: { label: 'Checkpoint', icon: Flag },
  start_task: { label: 'Starting Task', icon: Play },
};

export function getBaseToolName(toolName: string): string {
  let idx = 0;
  while ((idx = toolName.indexOf('_', idx)) !== -1) {
    const candidate = toolName.substring(idx + 1);
    if (TOOL_PROGRESS_MAP[candidate]) {
      return candidate;
    }
    idx += 1;
  }
  return toolName;
}

export function getToolDisplayInfo(
  toolName: string,
): { label: string; icon: typeof FileText } | undefined {
  if (TOOL_PROGRESS_MAP[toolName]) {
    return TOOL_PROGRESS_MAP[toolName];
  }
  const baseName = getBaseToolName(toolName);
  return TOOL_PROGRESS_MAP[baseName];
}
