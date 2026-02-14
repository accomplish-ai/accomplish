export type SkillSource = 'official' | 'community' | 'custom';

export interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'select';
  description: string;
  required: boolean;
  defaultValue?: string | number | boolean;
  options?: string[]; // For select type
  placeholder?: string;
}

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
  parameters?: SkillParameter[];
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  command?: string;
  verified?: boolean;
  hidden?: boolean;
  parameters?: SkillParameter[];
}
