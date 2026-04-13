export interface BrowserNavigateInput {
  url: string;
  page_name?: string;
}

export interface BrowserSnapshotInput {
  page_name?: string;
  interactive_only?: boolean; // default true — only buttons, inputs, links
  full_snapshot?: boolean; // default false
  max_elements?: number; // default 300, range 1-1000
  viewport_only?: boolean;
  include_history?: boolean; // default true
  max_tokens?: number; // default 8000, range 1000-50000
}

export type BrowserClickInput =
  | {
      target: 'ref';
      ref: string;
      position?: 'center' | 'center-lower';
      button?: 'left' | 'right' | 'middle';
      click_count?: number;
      trigger_ref?: string;
      page_name?: string;
    }
  | {
      target: 'selector';
      selector: string;
      position?: 'center' | 'center-lower';
      button?: 'left' | 'right' | 'middle';
      click_count?: number;
      trigger_ref?: string;
      page_name?: string;
    }
  | {
      target: 'coords';
      x: number;
      y: number;
      position?: 'center' | 'center-lower';
      button?: 'left' | 'right' | 'middle';
      click_count?: number;
      trigger_ref?: string;
      page_name?: string;
    };

export type BrowserTypeInput =
  | { target: 'ref'; ref: string; text: string; press_enter?: boolean; page_name?: string }
  | {
      target: 'selector';
      selector: string;
      text: string;
      press_enter?: boolean;
      page_name?: string;
    };

export type BrowserHoverInput =
  | { target: 'ref'; ref: string; page_name?: string }
  | { target: 'selector'; selector: string; page_name?: string }
  | { target: 'coords'; x: number; y: number; page_name?: string };

// BrowserScrollInput, BrowserSelectInput already refactored above

export type BrowserGetTextInput =
  | { target: 'ref'; ref: string; page_name?: string }
  | { target: 'selector'; selector: string; page_name?: string };

export type BrowserIsVisibleInput =
  | { target: 'ref'; ref: string; page_name?: string }
  | { target: 'selector'; selector: string; page_name?: string };

export type BrowserIsEnabledInput =
  | { target: 'ref'; ref: string; page_name?: string }
  | { target: 'selector'; selector: string; page_name?: string };

export type BrowserIsCheckedInput =
  | { target: 'ref'; ref: string; page_name?: string }
  | { target: 'selector'; selector: string; page_name?: string };

export type BrowserDragInput =
  | { target: 'ref'; ref: string; to: { x: number; y: number }; page_name?: string }
  | { target: 'selector'; selector: string; to: { x: number; y: number }; page_name?: string };

export type BrowserFileUploadInput =
  | { target: 'ref'; ref: string; file_path: string; page_name?: string }
  | { target: 'selector'; selector: string; file_path: string; page_name?: string };

export interface BrowserScreenshotInput {
  page_name?: string;
  full_page?: boolean;
}

export interface BrowserEvaluateInput {
  script: string;
  page_name?: string;
}

export type BrowserKeyboardInput =
  | { text: string; key?: never; typing_delay?: number; page_name?: string }
  | { key: string; text?: never; typing_delay?: number; page_name?: string };

export interface SequenceAction {
  action: 'click' | 'type' | 'snapshot' | 'screenshot' | 'wait';
  ref?: string;
  selector?: string;
  x?: number;
  y?: number;
  text?: string;
  press_enter?: boolean;
  full_page?: boolean;
  timeout?: number;
}

export interface BrowserSequenceInput {
  actions: SequenceAction[];
  page_name?: string;
}

export interface ScriptAction {
  action:
    | 'goto'
    | 'waitForLoad'
    | 'waitForSelector'
    | 'waitForNavigation'
    | 'findAndFill'
    | 'findAndClick'
    | 'fillByRef'
    | 'clickByRef'
    | 'snapshot'
    | 'screenshot'
    | 'keyboard'
    | 'evaluate';
  url?: string;
  selector?: string;
  ref?: string;
  text?: string;
  key?: string;
  press_enter?: boolean;
  timeout?: number;
  full_page?: boolean;
  code?: string;
  skip_if_not_found?: boolean;
}

export interface BrowserScriptInput {
  actions: ScriptAction[];
  page_name?: string;
}

export type BrowserScrollInput =
  | {
      mode: 'relative';
      direction: 'up' | 'down' | 'left' | 'right';
      amount: number;
      page_name?: string;
    }
  | { mode: 'absolute'; position: 'top' | 'bottom'; page_name?: string }
  | {
      mode: 'element';
      selector?: string;
      ref?: string;
      amount?: number;
      direction?: 'up' | 'down' | 'left' | 'right';
      page_name?: string;
    };

export type BrowserSelectInput =
  | { method: 'value'; value: string; selector?: string; ref?: string; page_name?: string }
  | { method: 'label'; label: string; selector?: string; ref?: string; page_name?: string }
  | { method: 'index'; index: number; selector?: string; ref?: string; page_name?: string };

export interface BrowserWaitInput {
  condition: 'selector' | 'hidden' | 'navigation' | 'network_idle' | 'timeout' | 'function';
  selector?: string;
  script?: string;
  timeout?: number;
  page_name?: string;
}

export interface BrowserIframeInput {
  action: 'enter' | 'exit';
  ref?: string;
  selector?: string;
  page_name?: string;
}

export interface BrowserCanvasTypeInput {
  text: string;
  position?: 'start' | 'current';
  page_name?: string;
}

export interface BrowserHighlightInput {
  enabled: boolean;
  page_name?: string;
}
