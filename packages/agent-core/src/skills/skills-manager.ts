import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type { Database } from 'better-sqlite3';
import type { Skill, SkillSource, SkillFrontmatter } from '../shared/types/skills.js';

interface SkillRow {
  id: string;
  name: string;
  command: string;
  description: string;
  source: string;
  is_enabled: number;
  is_verified: number;
  is_hidden: number;
  file_path: string;
  github_url: string | null;
  updated_at: string;
}

export interface SkillsManagerOptions {
  bundledSkillsPath: string;
  userSkillsPath: string;
  database: Database;
}

function rowToSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    command: row.command,
    description: row.description,
    source: row.source as SkillSource,
    isEnabled: row.is_enabled === 1,
    isVerified: row.is_verified === 1,
    isHidden: row.is_hidden === 1,
    filePath: row.file_path,
    githubUrl: row.github_url || undefined,
    updatedAt: row.updated_at,
  };
}

export class SkillsManager {
  private readonly bundledSkillsPath: string;
  private readonly userSkillsPath: string;
  private readonly db: Database;
  private initialized = false;

  constructor(options: SkillsManagerOptions) {
    this.bundledSkillsPath = options.bundledSkillsPath;
    this.userSkillsPath = options.userSkillsPath;
    this.db = options.database;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[SkillsManager] Initializing...');

    if (!fs.existsSync(this.userSkillsPath)) {
      fs.mkdirSync(this.userSkillsPath, { recursive: true });
    }

    await this.resync();

    this.initialized = true;
    console.log('[SkillsManager] Initialized');
  }

  async resync(): Promise<Skill[]> {
    console.log('[SkillsManager] Resyncing skills...');

    const existingSkills = this.getAllSkills();
    const existingById = new Map(existingSkills.map((s) => [s.id, s]));
    const existingByPath = new Map(existingSkills.map((s) => [s.filePath, s]));

    const bundledSkills = this.scanDirectory(this.bundledSkillsPath, 'official');
    const userSkills = this.scanDirectory(this.userSkillsPath, 'custom');

    const allFoundSkills = [...bundledSkills, ...userSkills];
    const processedPaths = new Set<string>();

    for (const skill of allFoundSkills) {
      if (processedPaths.has(skill.filePath)) {
        continue;
      }
      processedPaths.add(skill.filePath);

      const existingByFilePath = existingByPath.get(skill.filePath);
      if (existingByFilePath) {
        skill.id = existingByFilePath.id;
        skill.isEnabled = existingByFilePath.isEnabled;
        if (existingByFilePath.githubUrl) {
          skill.source = existingByFilePath.source;
          skill.githubUrl = existingByFilePath.githubUrl;
        }
      } else {
        const existingById_ = existingById.get(skill.id);
        if (existingById_) {
          skill.isEnabled = existingById_.isEnabled;
        }
      }

      this.upsertSkill(skill);
    }

    for (const existingSkill of existingSkills) {
      if (!processedPaths.has(existingSkill.filePath)) {
        console.log(
          `[SkillsManager] Removing stale skill: ${existingSkill.name} (${existingSkill.filePath})`
        );
        this.deleteSkillFromDb(existingSkill.id);
      }
    }

    console.log(`[SkillsManager] Synced ${allFoundSkills.length} skills`);

    return this.getAllSkills();
  }

  getAllSkills(): Skill[] {
    const rows = this.db.prepare('SELECT * FROM skills ORDER BY name').all() as SkillRow[];
    return rows.map(rowToSkill);
  }

  getEnabledSkills(): Skill[] {
    const rows = this.db
      .prepare('SELECT * FROM skills WHERE is_enabled = 1 ORDER BY name')
      .all() as SkillRow[];
    return rows.map(rowToSkill);
  }

  getSkillById(skillId: string): Skill | null {
    const row = this.db
      .prepare('SELECT * FROM skills WHERE id = ?')
      .get(skillId) as SkillRow | undefined;
    return row ? rowToSkill(row) : null;
  }

  setSkillEnabled(skillId: string, enabled: boolean): void {
    this.db.prepare('UPDATE skills SET is_enabled = ? WHERE id = ?').run(enabled ? 1 : 0, skillId);
  }

  getSkillContent(skillId: string): string | null {
    const skill = this.getSkillById(skillId);
    if (!skill) return null;

    try {
      return fs.readFileSync(skill.filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  async addSkill(sourcePath: string): Promise<Skill | null> {
    if (sourcePath.startsWith('http://') || sourcePath.startsWith('https://')) {
      return this.addFromUrl(sourcePath);
    }

    return this.addFromFile(sourcePath);
  }

  deleteSkill(skillId: string): boolean {
    const skill = this.getSkillById(skillId);
    if (!skill) {
      return false;
    }

    if (skill.source === 'official') {
      console.warn('[SkillsManager] Cannot delete official skills');
      return false;
    }

    const skillDir = path.dirname(skill.filePath);
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true });
    }

    this.deleteSkillFromDb(skillId);
    return true;
  }

  private scanDirectory(dirPath: string, defaultSource: SkillSource): Skill[] {
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
        const frontmatter = this.parseFrontmatter(content);

        const name = frontmatter.name || entry.name;
        const source = defaultSource;
        const id = this.generateId(name, source);
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
        console.error(`[SkillsManager] Failed to parse ${skillMdPath}:`, err);
      }
    }

    return skills;
  }

  private parseFrontmatter(content: string): SkillFrontmatter {
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

  private generateId(name: string, source: SkillSource): string {
    const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return `${source}-${safeName}`;
  }

  private sanitizeSkillName(name: string): string {
    return name
      .replace(/\.\./g, '')
      .replace(/[/\\]/g, '-')
      .replace(/[^a-zA-Z0-9-_\s]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .trim();
  }

  private isPathWithinDirectory(filePath: string, directory: string): boolean {
    const resolved = path.resolve(filePath);
    const resolvedDir = path.resolve(directory);
    return resolved.startsWith(resolvedDir + path.sep);
  }

  private async addFromFile(sourcePath: string): Promise<Skill> {
    const content = fs.readFileSync(sourcePath, 'utf-8');
    const frontmatter = this.parseFrontmatter(content);

    if (!frontmatter.name) {
      throw new Error('SKILL.md must have a name in frontmatter');
    }

    const safeName = this.sanitizeSkillName(frontmatter.name);
    if (!safeName) {
      throw new Error('Invalid skill name');
    }

    const skillDir = path.join(this.userSkillsPath, safeName);

    if (!this.isPathWithinDirectory(skillDir, this.userSkillsPath)) {
      throw new Error('Invalid skill name: path traversal detected');
    }

    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }

    const destPath = path.join(skillDir, 'SKILL.md');
    fs.copyFileSync(sourcePath, destPath);

    const skill: Skill = {
      id: this.generateId(safeName, 'custom'),
      name: frontmatter.name,
      command: frontmatter.command || `/${safeName}`,
      description: frontmatter.description || '',
      source: 'custom',
      isEnabled: true,
      isVerified: false,
      isHidden: false,
      filePath: destPath,
      updatedAt: new Date().toISOString(),
    };

    this.upsertSkill(skill);
    return skill;
  }

  private async addFromUrl(rawUrl: string): Promise<Skill> {
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

    let fetchUrl = rawUrl;
    if (rawUrl.includes('github.com') && !rawUrl.includes('raw.githubusercontent.com')) {
      if (rawUrl.includes('/tree/')) {
        fetchUrl = rawUrl
          .replace('github.com', 'raw.githubusercontent.com')
          .replace('/tree/', '/');
        if (!fetchUrl.endsWith('SKILL.md')) {
          fetchUrl = fetchUrl.replace(/\/?$/, '/SKILL.md');
        }
      } else if (rawUrl.includes('/blob/')) {
        fetchUrl = rawUrl
          .replace('github.com', 'raw.githubusercontent.com')
          .replace('/blob/', '/');
      } else {
        fetchUrl = rawUrl.replace('github.com', 'raw.githubusercontent.com');
        if (!fetchUrl.endsWith('SKILL.md')) {
          fetchUrl = fetchUrl.replace(/\/?$/, '/SKILL.md');
        }
      }
    }

    console.log('[SkillsManager] Fetching from:', fetchUrl);

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }
    const content = await response.text();

    const frontmatter = this.parseFrontmatter(content);

    if (!frontmatter.name) {
      throw new Error('SKILL.md must have a name in frontmatter');
    }

    const safeName = this.sanitizeSkillName(frontmatter.name);
    if (!safeName) {
      throw new Error('Invalid skill name');
    }

    const skillDir = path.join(this.userSkillsPath, safeName);

    if (!this.isPathWithinDirectory(skillDir, this.userSkillsPath)) {
      throw new Error('Invalid skill name: path traversal detected');
    }

    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }

    const destPath = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(destPath, content);

    const skill: Skill = {
      id: this.generateId(safeName, 'community'),
      name: frontmatter.name,
      command: frontmatter.command || `/${safeName}`,
      description: frontmatter.description || '',
      source: 'community',
      isEnabled: true,
      isVerified: false,
      isHidden: false,
      filePath: destPath,
      githubUrl: rawUrl,
      updatedAt: new Date().toISOString(),
    };

    this.upsertSkill(skill);
    return skill;
  }

  private upsertSkill(skill: Skill): void {
    this.db
      .prepare(
        `
      INSERT INTO skills (id, name, command, description, source, is_enabled, is_verified, is_hidden, file_path, github_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        command = excluded.command,
        description = excluded.description,
        is_enabled = excluded.is_enabled,
        is_verified = excluded.is_verified,
        is_hidden = excluded.is_hidden,
        file_path = excluded.file_path,
        github_url = excluded.github_url,
        updated_at = excluded.updated_at
    `
      )
      .run(
        skill.id,
        skill.name,
        skill.command,
        skill.description,
        skill.source,
        skill.isEnabled ? 1 : 0,
        skill.isVerified ? 1 : 0,
        skill.isHidden ? 1 : 0,
        skill.filePath,
        skill.githubUrl || null,
        skill.updatedAt
      );
  }

  private deleteSkillFromDb(skillId: string): void {
    this.db.prepare('DELETE FROM skills WHERE id = ?').run(skillId);
  }
}
