export type SkillSource = 'official' | 'community' | 'custom';

export interface Skill {
  id: string;
  name: string;
  command: string;
  description: string;
  source: SkillSource;
  isEnabled: boolean;
  isVerified: boolean;
  isHidden: boolean;
  filePath: string;
  githubUrl?: string;
  updatedAt: string;
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  command?: string;
  verified?: boolean;
  hidden?: boolean;
}
