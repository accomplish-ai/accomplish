/**
 * Types for the thought stream API, which bridges MCP tools (report-thought,
 * report-checkpoint) with the Electron UI for real-time subagent streaming.
 */

export interface ThoughtEvent {
  taskId: string;
  content: string;
  category: 'observation' | 'reasoning' | 'decision' | 'action';
  agentName: string;
  timestamp: number;
}

export interface CheckpointEvent {
  taskId: string;
  status: 'progress' | 'complete' | 'stuck';
  summary: string;
  nextPlanned?: string;
  blocker?: string;
  agentName: string;
  timestamp: number;
}
