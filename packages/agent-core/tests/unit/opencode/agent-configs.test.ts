import { describe, it, expect } from 'vitest';
import { getSubagentDefinitions } from '../../../src/opencode/agent-configs.js';

describe('Agent Configs', () => {
  describe('getSubagentDefinitions', () => {
    it('should return three subagent definitions', () => {
      const subagents = getSubagentDefinitions();
      expect(subagents).toHaveLength(3);
    });

    it('should define researcher, browser, and quick agents', () => {
      const subagents = getSubagentDefinitions();
      const names = subagents.map((s) => s.name);
      expect(names).toContain('researcher');
      expect(names).toContain('browser');
      expect(names).toContain('quick');
    });

    it('should set all subagents to subagent mode', () => {
      const subagents = getSubagentDefinitions();
      for (const sub of subagents) {
        expect(sub.mode).toBe('subagent');
      }
    });

    it('should include non-empty descriptions and prompts', () => {
      const subagents = getSubagentDefinitions();
      for (const sub of subagents) {
        expect(sub.description.length).toBeGreaterThan(10);
        expect(sub.prompt.length).toBeGreaterThan(50);
      }
    });

    it('should include complete_task instruction in each subagent prompt', () => {
      const subagents = getSubagentDefinitions();
      for (const sub of subagents) {
        expect(sub.prompt).toContain('complete_task');
      }
    });

    it('researcher should focus on information gathering', () => {
      const subagents = getSubagentDefinitions();
      const researcher = subagents.find((s) => s.name === 'researcher');
      expect(researcher?.prompt).toContain('research');
      expect(researcher?.prompt).toContain('summarize');
    });

    it('browser agent should mention browser tools', () => {
      const subagents = getSubagentDefinitions();
      const browser = subagents.find((s) => s.name === 'browser');
      expect(browser?.prompt).toContain('browser');
      expect(browser?.prompt).toContain('screenshots');
    });

    it('quick agent should emphasize speed and conciseness', () => {
      const subagents = getSubagentDefinitions();
      const quick = subagents.find((s) => s.name === 'quick');
      expect(quick?.prompt).toContain('concise');
      expect(quick?.prompt).toContain('quickly');
    });
  });
});
