import { describe, expect, it } from 'vitest';
import { validateTaskConfig } from '../../../src/utils/task-validation.js';
import type { TaskConfig, FileAttachmentInfo } from '../../../src/common/types/task.js';

describe('validateTaskConfig', () => {
  it('preserves files array on the validated config', () => {
    const files: FileAttachmentInfo[] = [
      {
        id: 'att-1',
        name: 'readme.md',
        path: '/tmp/readme.md',
        type: 'text',
        size: 1024,
        content: '# Hello',
      },
    ];
    const config: TaskConfig = {
      prompt: 'Summarize the file',
      files,
    };

    const validated = validateTaskConfig(config);
    expect(validated.files).toEqual(files);
  });

  it('preserves modelId on the validated config', () => {
    const config: TaskConfig = {
      prompt: 'Do something',
      modelId: 'claude-sonnet',
    };

    const validated = validateTaskConfig(config);
    expect(validated.modelId).toBe('claude-sonnet');
  });

  it('omits files when none are provided', () => {
    const config: TaskConfig = { prompt: 'No files here' };
    const validated = validateTaskConfig(config);
    expect(validated.files).toBeUndefined();
  });

  it('omits files when array is empty', () => {
    const config: TaskConfig = { prompt: 'Empty files', files: [] };
    const validated = validateTaskConfig(config);
    expect(validated.files).toBeUndefined();
  });

  it('preserves multiple files', () => {
    const files: FileAttachmentInfo[] = [
      { id: 'a', name: 'a.txt', path: '/a.txt', type: 'text', size: 100 },
      { id: 'b', name: 'b.png', path: '/b.png', type: 'image', size: 200 },
    ];
    const config: TaskConfig = { prompt: 'Two files', files };
    const validated = validateTaskConfig(config);
    expect(validated.files).toHaveLength(2);
  });

  it('preserves source=ui through validation', () => {
    const config: TaskConfig = { prompt: 'UI task', source: 'ui' };
    const validated = validateTaskConfig(config);
    expect(validated.source).toBe('ui');
  });

  it('preserves source=whatsapp through validation', () => {
    const config: TaskConfig = { prompt: 'WA task', source: 'whatsapp' };
    const validated = validateTaskConfig(config);
    expect(validated.source).toBe('whatsapp');
  });

  it('preserves source=scheduler through validation', () => {
    const config: TaskConfig = { prompt: 'Scheduled task', source: 'scheduler' };
    const validated = validateTaskConfig(config);
    expect(validated.source).toBe('scheduler');
  });

  it('omits source when not provided (defaults at consumer)', () => {
    const config: TaskConfig = { prompt: 'No source' };
    const validated = validateTaskConfig(config);
    expect(validated.source).toBeUndefined();
  });

  it('drops unknown source values (sanity guard beyond Zod)', () => {
    const config = { prompt: 'Bad source', source: 'pirate' } as unknown as TaskConfig;
    const validated = validateTaskConfig(config);
    expect(validated.source).toBeUndefined();
  });

  // Regression: `TaskService.startTask` writes `config.workspaceId` but an
  // earlier version of `validateTaskConfig` rebuilt the object field-by-field
  // and silently dropped this one. Downstream, `resolveTaskConfig` never saw
  // the workspace and skipped knowledge-note injection for every non-resume
  // task. This test pins the fix so the field always makes it through.
  it('preserves workspaceId on the validated config', () => {
    const config: TaskConfig = {
      prompt: 'Workspace task',
      workspaceId: 'ws_abc123',
    };

    const validated = validateTaskConfig(config);
    expect(validated.workspaceId).toBe('ws_abc123');
  });

  it('rejects a workspaceId longer than 128 chars (matches other ID fields)', () => {
    const longId = 'ws_' + 'x'.repeat(200);
    const config: TaskConfig = {
      prompt: 'Long workspace',
      workspaceId: longId,
    };

    expect(() => validateTaskConfig(config)).toThrow(/exceeds maximum length/i);
  });

  it('omits workspaceId when not provided', () => {
    const config: TaskConfig = { prompt: 'No workspace' };
    const validated = validateTaskConfig(config);
    expect(validated.workspaceId).toBeUndefined();
  });
});
