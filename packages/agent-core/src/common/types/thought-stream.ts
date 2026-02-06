/**
 * Types for the thought stream API, which bridges MCP tools (report-thought,
 * report-checkpoint) with the Electron UI for real-time subagent streaming.
 */

/** Category of a thought event */
export type ThoughtCategory = 'observation' | 'reasoning' | 'decision' | 'action';

/** Status of a checkpoint event */
export type CheckpointStatus = 'progress' | 'complete' | 'stuck';

export interface ThoughtEvent {
  taskId: string;
  content: string;
  category: ThoughtCategory;
  agentName: string;
  timestamp: number;
}

export interface CheckpointEvent {
  taskId: string;
  status: CheckpointStatus;
  summary: string;
  nextPlanned?: string;
  blocker?: string;
  agentName: string;
  timestamp: number;
}
