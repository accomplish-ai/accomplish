import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Desktop Control SKILL.md Rules', () => {
  it('should strictly document that needs_planning is required for desktop automation', () => {
    const skillPath = path.join(__dirname, '../../SKILL.md');
    const skillContent = fs.readFileSync(skillPath, 'utf8');

    // Assert that the instruction is present in SKILL.md
    expect(skillContent).toContain('needs_planning: true');
    expect(skillContent).toContain(
      'ALL tasks involving desktop.* tools MUST use `needs_planning: true`',
    );
  });
});
