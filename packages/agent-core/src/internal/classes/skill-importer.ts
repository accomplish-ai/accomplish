import * as fs from 'fs';
import * as path from 'path';
import type { Skill, SkillSource, SkillFrontmatter } from '../../common/types/skills.js';
import { upsertSkill as dbUpsertSkill } from '../../storage/repositories/skills.js';
import { createConsoleLogger } from '../../utils/logging.js';
import {
  parseFrontmatter,
  generateId,
  sanitizeSkillName,
  normalizeSkillSlug,
  isPathWithinDirectory,
  scanDirectory,
} from './skill-parser.js';

export { scanDirectory, normalizeSkillSlug };

const log = createConsoleLogger({ prefix: 'SkillsManager' });

export function validateSkillFrontmatter(content: string): SkillFrontmatter & { name: string } {
  const frontmatter = parseFrontmatter(content);

  if (!frontmatter.name) {
    throw new Error('SKILL.md must have a name in frontmatter');
  }

  return frontmatter as SkillFrontmatter & { name: string };
}

export function prepareSkillDir(
  frontmatter: SkillFrontmatter & { name: string },
  userSkillsPath: string,
): string {
  const safeName = sanitizeSkillName(frontmatter.name);
  if (!safeName) {
    throw new Error('Invalid skill name');
  }

  const skillDir = path.join(userSkillsPath, safeName);

  if (!isPathWithinDirectory(skillDir, userSkillsPath)) {
    throw new Error('Invalid skill name: path traversal detected');
  }

  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  return path.join(skillDir, 'SKILL.md');
}

export function persistSkill(
  frontmatter: SkillFrontmatter & { name: string },
  destPath: string,
  source: SkillSource,
  githubUrl?: string,
): Skill {
  const safeName = sanitizeSkillName(frontmatter.name);

  const skill: Skill = {
    id: generateId(safeName, source),
    name: frontmatter.name,
    command: frontmatter.command || `/${safeName}`,
    description: frontmatter.description || '',
    source,
    isEnabled: true,
    isVerified: false,
    isHidden: false,
    filePath: destPath,
    ...(githubUrl && { githubUrl }),
    updatedAt: new Date().toISOString(),
  };

  dbUpsertSkill(skill);
  return skill;
}

export function addFromFile(sourcePath: string, userSkillsPath: string): Skill {
  const content = fs.readFileSync(sourcePath, 'utf-8');
  const frontmatter = validateSkillFrontmatter(content);
  const destPath = prepareSkillDir(frontmatter, userSkillsPath);
  fs.copyFileSync(sourcePath, destPath);
  return persistSkill(frontmatter, destPath, 'custom');
}

export function addFromFolder(folderPath: string, userSkillsPath: string): Skill {
  const skillMdPath = path.join(folderPath, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    throw new Error(`Selected folder does not contain a SKILL.md file: ${folderPath}`);
  }

  const content = fs.readFileSync(skillMdPath, 'utf-8');
  const frontmatter = validateSkillFrontmatter(content);
  const destSkillMdPath = prepareSkillDir(frontmatter, userSkillsPath);
  const destDir = path.dirname(destSkillMdPath);

  const resolvedSourceDir = path.resolve(folderPath);
  const resolvedDestDir = path.resolve(destDir);

  // Skip delete+copy when re-importing an already-installed skill (same directory)
  if (resolvedSourceDir === resolvedDestDir) {
    return persistSkill(frontmatter, destSkillMdPath, 'custom');
  }

  // Remove existing contents so re-imports don't leave stale files
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true });
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Copy only top-level files from source folder
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      fs.copyFileSync(path.join(folderPath, entry.name), path.join(destDir, entry.name));
    }
  }

  return persistSkill(frontmatter, destSkillMdPath, 'custom');
}

export function resolveGithubRawUrl(rawUrl: string): string {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL format');
  }

  const allowedHosts = ['github.com', 'raw.githubusercontent.com'];
  if (!allowedHosts.includes(parsedUrl.hostname)) {
    throw new Error('URL must be from github.com or raw.githubusercontent.com');
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('URL must use HTTPS');
  }

  if (parsedUrl.hostname === 'raw.githubusercontent.com') {
    // Validate path: /owner/repo/branch/...
    const rawParts = parsedUrl.pathname.split('/').filter(Boolean);
    if (rawParts.length < 3) {
      throw new Error(
        'URL must include at least owner, repo, and branch (e.g. raw.githubusercontent.com/owner/repo/branch/...)',
      );
    }
    return rawUrl;
  }

  // Validate path has at least owner/repo/branch segments
  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
  // github.com paths: /owner/repo or /owner/repo/tree/branch/... etc.
  // We need at least owner/repo/branch — so after stripping tree|blob prefix we need 3 segments
  const pathWithoutTreeBlob = parsedUrl.pathname
    .replace('/tree/', '/')
    .replace('/blob/', '/')
    .split('/')
    .filter(Boolean);
  if (pathParts.length < 2 || pathWithoutTreeBlob.length < 3) {
    throw new Error(
      'URL must include at least owner, repo, and branch reference (e.g. github.com/owner/repo/tree/branch)',
    );
  }
  let fetchUrl = rawUrl;
  if (rawUrl.includes('/tree/')) {
    fetchUrl = rawUrl.replace('github.com', 'raw.githubusercontent.com').replace('/tree/', '/');
    if (!fetchUrl.endsWith('SKILL.md')) {
      fetchUrl = fetchUrl.replace(/\/?$/, '/SKILL.md');
    }
  } else if (rawUrl.includes('/blob/')) {
    fetchUrl = rawUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
  } else {
    fetchUrl = rawUrl.replace('github.com', 'raw.githubusercontent.com');
    if (!fetchUrl.endsWith('SKILL.md')) {
      fetchUrl = fetchUrl.replace(/\/?$/, '/SKILL.md');
    }
  }
  return fetchUrl;
}

export async function addFromUrl(rawUrl: string, userSkillsPath: string): Promise<Skill> {
  const fetchUrl = resolveGithubRawUrl(rawUrl);

  log.info(`[SkillsManager] Fetching from: ${fetchUrl}`);

  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`);
  }
  const content = await response.text();
  const frontmatter = validateSkillFrontmatter(content);
  const destPath = prepareSkillDir(frontmatter, userSkillsPath);
  fs.writeFileSync(destPath, content);
  return persistSkill(frontmatter, destPath, 'community', rawUrl);
}
