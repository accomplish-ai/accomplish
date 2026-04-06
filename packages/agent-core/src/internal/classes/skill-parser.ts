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

/**
 * Canonical slug normalizer — single source of truth used by generateId,
 * sanitizeSkillName, and scanDirectory so IDs are stable across scan / import / resync.
 */
export function normalizeSkillSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.\./g, '') // strip path-traversal sequences
    .replace(/[/\\]/g, '-') // forward/back-slash → dash
    .replace(/[^a-z0-9-]/g, '-') // everything else disallowed → dash
    .replace(/-+/g, '-') // collapse consecutive dashes
    .replace(/^-|-$/g, ''); // strip leading/trailing dashes
}

export function generateId(name: string, source: SkillSource): string {
  return `${source}-${normalizeSkillSlug(name)}`;
}

export function sanitizeSkillName(name: string): string {
  return normalizeSkillSlug(name);
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
      const safeName = normalizeSkillSlug(name);

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
