import type { Skill } from '../common/types/skills';

export interface SkillsManagerOptions {
  bundledSkillsPath: string;
  userSkillsPath: string;
}

export interface SkillsManagerAPI {
  initialize(): Promise<void>;
  resync(): Promise<Skill[]>;
  getAllSkills(): Skill[];
  getEnabledSkills(): Skill[];
  getSkillById(skillId: string): Skill | null;
  setSkillEnabled(skillId: string, enabled: boolean): void;
  getSkillContent(skillId: string): string | null;
  addSkill(sourcePath: string): Promise<Skill | null>;
  deleteSkill(skillId: string): boolean;
}
