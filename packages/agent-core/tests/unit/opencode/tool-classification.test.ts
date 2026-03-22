import { describe, it, expect } from 'vitest';
import {
  NON_TASK_CONTINUATION_TOOLS,
  isHiddenToolName,
  isNonTaskContinuationToolName,
} from '../../../src/opencode/tool-classification.js';

describe('tool-classification', () => {
  it('should treat helper tools as non-task continuation tools', () => {
    expect(NON_TASK_CONTINUATION_TOOLS).toContain('prune');
    expect(NON_TASK_CONTINUATION_TOOLS).toContain('distill');
    expect(NON_TASK_CONTINUATION_TOOLS).toContain('extract');
    expect(NON_TASK_CONTINUATION_TOOLS).toContain('context_info');
    expect(NON_TASK_CONTINUATION_TOOLS).toContain('request_connector_auth');

    expect(isNonTaskContinuationToolName('start_task')).toBe(true);
    expect(isNonTaskContinuationToolName('skill')).toBe(true);
    expect(isNonTaskContinuationToolName('mcp_prune')).toBe(true);
    expect(isNonTaskContinuationToolName('mcp_distill')).toBe(true);
    expect(isNonTaskContinuationToolName('mcp_extract')).toBe(true);
    expect(isNonTaskContinuationToolName('mcp_context_info')).toBe(true);
    expect(isNonTaskContinuationToolName('mcp_request_connector_auth')).toBe(true);
  });

  it('should keep real task tools counting toward continuation', () => {
    expect(isNonTaskContinuationToolName('browser_click')).toBe(false);
    expect(isNonTaskContinuationToolName('read_file')).toBe(false);
    expect(isNonTaskContinuationToolName('bash')).toBe(false);
  });

  it('should identify hidden housekeeping tools', () => {
    expect(isHiddenToolName('discard')).toBe(true);
    expect(isHiddenToolName('extract')).toBe(true);
    expect(isHiddenToolName('context_info')).toBe(true);
    expect(isHiddenToolName('prune')).toBe(true);
    expect(isHiddenToolName('distill')).toBe(true);
    expect(isHiddenToolName('mcp_prune')).toBe(true);
    expect(isHiddenToolName('browser_click')).toBe(false);
  });
});
