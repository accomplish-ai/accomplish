import type { Skill, SkillParameter } from '../common/types/skills.js';

export interface SkillTemplate {
  id: string;
  name: string;
  description: string;
  command: string;
  category: 'research' | 'development' | 'productivity' | 'content' | 'automation';
  icon: string;
  parameters?: SkillParameter[];
  tags: string[];
}

export const SKILL_TEMPLATES: SkillTemplate[] = [
  {
    id: 'research-assistant',
    name: 'Research Assistant',
    description: 'Conduct comprehensive research on any topic with web searches, summarization, and source citations',
    command: 'Research {{topic}} and provide a detailed summary with sources',
    category: 'research',
    icon: '🔍',
    parameters: [
      {
        name: 'topic',
        type: 'string',
        description: 'The topic to research',
        required: true,
        placeholder: 'e.g., "artificial intelligence trends 2026"',
      },
      {
        name: 'depth',
        type: 'select',
        description: 'How deep should the research be?',
        required: false,
        defaultValue: 'medium',
        options: ['quick', 'medium', 'deep'],
      },
    ],
    tags: ['research', 'web', 'summarization'],
  },
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Comprehensive code review with best practices, security checks, and suggestions',
    command: 'Review the code in {{filePath}} for quality, security, and best practices',
    category: 'development',
    icon: '💻',
    parameters: [
      {
        name: 'filePath',
        type: 'string',
        description: 'Path to the file or directory to review',
        required: true,
        placeholder: 'e.g., "src/components"',
      },
    ],
    tags: ['code', 'review', 'development'],
  },
  {
    id: 'pr-reviewer',
    name: 'Pull Request Reviewer',
    description: 'Analyze pull requests, suggest improvements, and check for potential issues',
    command: 'Review the pull request changes and provide detailed feedback',
    category: 'development',
    icon: '🔀',
    parameters: [],
    tags: ['git', 'pr', 'review'],
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes Organizer',
    description: 'Organize and summarize meeting notes with action items and key decisions',
    command: 'Organize the meeting notes in {{filePath}}, extract action items and key decisions',
    category: 'productivity',
    icon: '📝',
    parameters: [
      {
        name: 'filePath',
        type: 'string',
        description: 'Path to meeting notes file',
        required: true,
        placeholder: 'e.g., "notes/meeting-2026-02-14.md"',
      },
    ],
    tags: ['productivity', 'organization', 'meetings'],
  },
  {
    id: 'blog-writer',
    name: 'Blog Post Writer',
    description: 'Write engaging blog posts with SEO optimization and proper formatting',
    command: 'Write a blog post about {{topic}} with {{wordCount}} words, optimized for SEO',
    category: 'content',
    icon: '✍️',
    parameters: [
      {
        name: 'topic',
        type: 'string',
        description: 'Blog post topic',
        required: true,
        placeholder: 'e.g., "Getting started with TypeScript"',
      },
      {
        name: 'wordCount',
        type: 'number',
        description: 'Target word count',
        required: false,
        defaultValue: 1000,
      },
      {
        name: 'tone',
        type: 'select',
        description: 'Writing tone',
        required: false,
        defaultValue: 'professional',
        options: ['casual', 'professional', 'technical', 'friendly'],
      },
    ],
    tags: ['content', 'writing', 'seo'],
  },
  {
    id: 'email-drafter',
    name: 'Email Drafter',
    description: 'Draft professional emails for various scenarios',
    command: 'Draft a {{tone}} email about {{subject}}',
    category: 'productivity',
    icon: '📧',
    parameters: [
      {
        name: 'subject',
        type: 'string',
        description: 'Email subject or purpose',
        required: true,
        placeholder: 'e.g., "project status update"',
      },
      {
        name: 'tone',
        type: 'select',
        description: 'Email tone',
        required: false,
        defaultValue: 'professional',
        options: ['formal', 'professional', 'casual', 'friendly'],
      },
    ],
    tags: ['email', 'communication', 'productivity'],
  },
  {
    id: 'test-generator',
    name: 'Test Generator',
    description: 'Generate comprehensive test suites for your code',
    command: 'Generate unit tests for {{filePath}} using best practices',
    category: 'development',
    icon: '🧪',
    parameters: [
      {
        name: 'filePath',
        type: 'string',
        description: 'Path to the file to test',
        required: true,
        placeholder: 'e.g., "src/utils/helpers.ts"',
      },
      {
        name: 'framework',
        type: 'select',
        description: 'Testing framework',
        required: false,
        defaultValue: 'vitest',
        options: ['vitest', 'jest', 'mocha', 'jasmine'],
      },
    ],
    tags: ['testing', 'development', 'quality'],
  },
  {
    id: 'file-organizer',
    name: 'File Organizer',
    description: 'Organize files and folders based on type, date, or custom rules',
    command: 'Organize files in {{directory}} by {{organizeBy}}',
    category: 'automation',
    icon: '📁',
    parameters: [
      {
        name: 'directory',
        type: 'string',
        description: 'Directory to organize',
        required: true,
        placeholder: 'e.g., "~/Downloads"',
      },
      {
        name: 'organizeBy',
        type: 'select',
        description: 'Organization method',
        required: false,
        defaultValue: 'type',
        options: ['type', 'date', 'extension', 'name'],
      },
    ],
    tags: ['automation', 'files', 'organization'],
  },
  {
    id: 'documentation-generator',
    name: 'Documentation Generator',
    description: 'Generate comprehensive documentation for your codebase',
    command: 'Generate documentation for {{directory}} with JSDoc/TSDoc comments',
    category: 'development',
    icon: '📚',
    parameters: [
      {
        name: 'directory',
        type: 'string',
        description: 'Directory to document',
        required: true,
        placeholder: 'e.g., "src/"',
      },
      {
        name: 'format',
        type: 'select',
        description: 'Documentation format',
        required: false,
        defaultValue: 'markdown',
        options: ['markdown', 'html', 'jsdoc'],
      },
    ],
    tags: ['documentation', 'development'],
  },
  {
    id: 'weekly-digest',
    name: 'Weekly Project Digest',
    description: 'Create a weekly digest of project activity across files, commits, and calendar',
    command: 'Create a weekly digest for the project with git commits, file changes, and calendar events',
    category: 'productivity',
    icon: '📊',
    parameters: [
      {
        name: 'projectPath',
        type: 'string', 
        description: 'Project directory path',
        required: false,
        placeholder: 'e.g., "~/projects/myapp"',
      },
    ],
    tags: ['productivity', 'reporting', 'git'],
  },
];

/**
 * Get all skill templates
 */
export function getAllTemplates(): SkillTemplate[] {
  return SKILL_TEMPLATES;
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: SkillTemplate['category']): SkillTemplate[] {
  return SKILL_TEMPLATES.filter(t => t.category === category);
}

/**
 * Get a template by ID
 */
export function getTemplateById(id: string): SkillTemplate | undefined {
  return SKILL_TEMPLATES.find(t => t.id === id);
}

/**
 * Convert a template to a Skill
 */
export function templateToSkill(template: SkillTemplate, parameterValues?: Record<string, any>): Partial<Skill> {
  let command = template.command;
  
  // Replace parameter placeholders with actual values
  if (parameterValues && template.parameters) {
    for (const param of template.parameters) {
      const value = parameterValues[param.name] ?? param.defaultValue ?? '';
      command = command.replace(`{{${param.name}}}`, String(value));
    }
  }
  
  return {
    name: template.name,
    description: template.description,
    command,
    parameters: template.parameters,
    source: 'official',
    isEnabled: true,
    isVerified: true,
    isHidden: false,
  };
}
