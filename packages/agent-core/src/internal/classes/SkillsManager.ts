import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type { Skill, SkillSource, SkillFrontmatter } from '../../common/types/skills.js';
import type { SkillsManagerOptions } from '../../types/skills-manager.js';
import {
  getAllSkills as dbGetAllSkills,
  getEnabledSkills as dbGetEnabledSkills,
  getSkillById as dbGetSkillById,
  upsertSkill as dbUpsertSkill,
  setSkillEnabled as dbSetSkillEnabled,
  deleteSkill as dbDeleteSkill,
} from '../../storage/repositories/skills.js';

export type { SkillsManagerOptions };

export class SkillsManager {
  private readonly bundledSkillsPath: string;
  private readonly userSkillsPath: string;
  private initialized = false;

  constructor(options: SkillsManagerOptions) {
    this.bundledSkillsPath = options.bundledSkillsPath;
    this.userSkillsPath = options.userSkillsPath;
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

      dbUpsertSkill(skill);
    }

    for (const existingSkill of existingSkills) {
      if (!processedPaths.has(existingSkill.filePath)) {
        console.log(
          `[SkillsManager] Removing stale skill: ${existingSkill.name} (${existingSkill.filePath})`
        );
        dbDeleteSkill(existingSkill.id);
      }
    }

    console.log(`[SkillsManager] Synced ${allFoundSkills.length} skills`);

    return this.getAllSkills();
  }

  getAllSkills(): Skill[] {
    return dbGetAllSkills();
  }

  getEnabledSkills(): Skill[] {
    return dbGetEnabledSkills();
  }

  getSkillById(skillId: string): Skill | null {
    return dbGetSkillById(skillId);
  }

  setSkillEnabled(skillId: string, enabled: boolean): void {
    dbSetSkillEnabled(skillId, enabled);
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

    dbDeleteSkill(skillId);
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

  private addFromFile(sourcePath: string): Skill {
    const content = fs.readFileSync(sourcePath, 'utf-8');
    const frontmatter = this.validateSkillFrontmatter(content);
    const destPath = this.prepareSkillDir(frontmatter);
    fs.copyFileSync(sourcePath, destPath);
    return this.persistSkill(frontmatter, destPath, 'custom');
  }

  private async addFromUrl(rawUrl: string): Promise<Skill> {
    const fetchUrl = this.resolveGithubRawUrl(rawUrl);

    console.log('[SkillsManager] Fetching from:', fetchUrl);

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }
    const content = await response.text();
    const frontmatter = this.validateSkillFrontmatter(content);
    const destPath = this.prepareSkillDir(frontmatter);
    fs.writeFileSync(destPath, content);
    return this.persistSkill(frontmatter, destPath, 'community', rawUrl);
  }

  private resolveGithubRawUrl(rawUrl: string): string {
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
      return rawUrl;
    }

    let fetchUrl = rawUrl;
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
    return fetchUrl;
  }

  private validateSkillFrontmatter(content: string): SkillFrontmatter & { name: string } {
    const frontmatter = this.parseFrontmatter(content);

    if (!frontmatter.name) {
      throw new Error('SKILL.md must have a name in frontmatter');
    }

    return frontmatter as SkillFrontmatter & { name: string };
  }

  private prepareSkillDir(frontmatter: SkillFrontmatter & { name: string }): string {
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

    return path.join(skillDir, 'SKILL.md');
  }

  private persistSkill(
    frontmatter: SkillFrontmatter & { name: string },
    destPath: string,
    source: SkillSource,
    githubUrl?: string,
  ): Skill {
    const safeName = this.sanitizeSkillName(frontmatter.name);

    const skill: Skill = {
      id: this.generateId(safeName, source),
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
}
