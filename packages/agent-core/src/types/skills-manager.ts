import type { Skill } from '../common/types/skills';

/** Options for creating a SkillsManager instance */
export interface SkillsManagerOptions {
  /** Path to the directory containing built-in skills */
  bundledSkillsPath: string;
  /** Path to the directory containing user-installed skills */
  userSkillsPath: string;
}

/** API for managing custom prompt skill files */
export interface SkillsManagerAPI {
  /** Initialize the skills manager, loading skills from both bundled and user directories */
  initialize(): Promise<void>;
  /** Reload all skills from disk and return the updated list */
  resync(): Promise<Skill[]>;
  /** Get all registered skills (both bundled and user-installed) */
  getAllSkills(): Skill[];
  /** Get only skills that are currently enabled */
  getEnabledSkills(): Skill[];
  /** Find a skill by its unique identifier */
  getSkillById(skillId: string): Skill | null;
  /** Enable or disable a skill by ID */
  setSkillEnabled(skillId: string, enabled: boolean): void;
  /** Read the raw content of a skill file */
  getSkillContent(skillId: string): string | null;
  /** Install a new skill from a file path, returns the skill or null on failure */
  addSkill(sourcePath: string): Promise<Skill | null>;
  /** Remove a user-installed skill by ID */
  deleteSkill(skillId: string): boolean;
}
