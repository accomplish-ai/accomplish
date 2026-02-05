export interface OpenCodeMessageBase {
  type: string;
  timestamp?: number;
  sessionID?: string;
}

export interface OpenCodeStepStartMessage extends OpenCodeMessageBase {
  type: 'step_start';
  part: {
    id: string;
    sessionID: string;
    messageID: string;
    type: 'step-start';
    snapshot?: string;
  };
}

export interface OpenCodeTextMessage extends OpenCodeMessageBase {
  type: 'text';
  part: {
    id: string;
    sessionID: string;
    messageID: string;
    type: 'text';
    text: string;
    time?: {
      start: number;
      end: number;
    };
  };
}

export interface OpenCodeToolCallMessage extends OpenCodeMessageBase {
  type: 'tool_call';
  part: {
    id: string;
    sessionID: string;
    messageID: string;
    type: 'tool-call';
    tool: string;
    input: unknown;
    time?: {
      start: number;
      end?: number;
    };
  };
}

export interface OpenCodeToolUseMessage extends OpenCodeMessageBase {
  type: 'tool_use';
  part: {
    id: string;
    sessionID: string;
    messageID: string;
    type: 'tool';
    callID?: string;
    tool: string;
    state: {
      status: 'pending' | 'running' | 'completed' | 'error';
      input?: unknown;
      output?: string;
    };
    time?: {
      start: number;
      end?: number;
    };
  };
}

export interface OpenCodeToolResultMessage extends OpenCodeMessageBase {
  type: 'tool_result';
  part: {
    id: string;
    sessionID: string;
    messageID: string;
    type: 'tool-result';
    toolCallID: string;
    output?: string;
    isError?: boolean;
    time?: {
      start: number;
      end: number;
    };
  };
}

export interface OpenCodeStepFinishMessage extends OpenCodeMessageBase {
  type: 'step_finish';
  part: {
    id: string;
    sessionID: string;
    messageID: string;
    type: 'step-finish';
    reason: 'stop' | 'end_turn' | 'tool_use' | 'error';
    snapshot?: string;
    cost?: number;
    tokens?: {
      input: number;
      output: number;
      reasoning: number;
      cache?: {
        read: number;
        write: number;
      };
    };
  };
}

export interface OpenCodeErrorMessage extends OpenCodeMessageBase {
  type: 'error';
  error: string;
  code?: string;
}

export type OpenCodeMessage =
  | OpenCodeStepStartMessage
  | OpenCodeTextMessage
  | OpenCodeToolCallMessage
  | OpenCodeToolUseMessage
  | OpenCodeToolResultMessage
  | OpenCodeStepFinishMessage
  | OpenCodeErrorMessage;
