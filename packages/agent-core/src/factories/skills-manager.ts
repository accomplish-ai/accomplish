import { SkillsManager } from '../internal/classes/SkillsManager.js';
import type { SkillsManagerAPI, SkillsManagerOptions } from '../types/skills-manager.js';

export function createSkillsManager(options: SkillsManagerOptions): SkillsManagerAPI {
  return new SkillsManager(options);
}
