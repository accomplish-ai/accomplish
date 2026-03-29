import matter from 'gray-matter';
import * as fs from 'fs';
import * as path from 'path';
import type { Skill, SkillSource, SkillFrontmatter } from '../../common/types/skills.js';
import { createConsoleLogger } from '../../utils/logging.js';

const log = createConsoleLogger({ prefix: 'SkillsManager' });

export function parseFrontmatter(content: string): SkillFrontmatter {
  try {
    const { data } = matter(content);
    return {
      name: data.name || '',
      description: data.description || '',
      command: data.command,
      verified: data.verified,
      hidden: data.hidden,
    };
  } catch {
    return { name: '', description: '' };
  }
}

export function generateId(name: string, source: SkillSource): string {
  const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `${source}-${safeName}`;
}

export function sanitizeSkillName(name: string): string {
  return name
    .replace(/\.\./g, '')
    .replace(/[/\\]/g, '-')
    .replace(/[^a-zA-Z0-9-_\s]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim();
}

export function isPathWithinDirectory(filePath: string, directory: string): boolean {
  const resolved = path.resolve(filePath);
  const resolvedDir = path.resolve(directory);
  return resolved.startsWith(resolvedDir + path.sep);
}

export function scanDirectory(dirPath: string, defaultSource: SkillSource): Skill[] {
  const skills: Skill[] = [];

  if (!fs.existsSync(dirPath)) {
    return skills;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillMdPath = path.join(dirPath, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) continue;

    try {
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      const frontmatter = parseFrontmatter(content);

      const name = frontmatter.name || entry.name;
      const source = defaultSource;
      const id = generateId(name, source);
      const safeName = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      skills.push({
        id,
        name,
        command: frontmatter.command || `/${safeName}`,
        description: frontmatter.description || '',
        source,
        isEnabled: true,
        isVerified: frontmatter.verified || false,
        isHidden: frontmatter.hidden || false,
        filePath: skillMdPath,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      log.error(`[SkillsManager] Failed to parse ${skillMdPath}: ${err}`);
    }
  }

  return skills;
}
