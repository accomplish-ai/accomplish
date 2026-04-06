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
});
