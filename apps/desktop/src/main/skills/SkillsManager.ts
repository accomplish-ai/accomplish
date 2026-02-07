import { app } from 'electron';
import path from 'path';
import { createSkillsManager, type SkillsManagerAPI } from '@accomplish_ai/agent-core';

function getBundledSkillsPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bundled-skills');
  }
  return path.join(app.getAppPath(), 'bundled-skills');
}

function getUserSkillsPath(): string {
  return path.join(app.getPath('userData'), 'skills');
}

export class SkillsManager {
  private coreManager: SkillsManagerAPI | null = null;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  getBundledSkillsPath(): string {
    return getBundledSkillsPath();
  }

  getUserSkillsPath(): string {
    return getUserSkillsPath();
  }

  private getCoreManager(): SkillsManagerAPI {
    if (!this.coreManager) {
      this.coreManager = createSkillsManager({
        bundledSkillsPath: getBundledSkillsPath(),
        userSkillsPath: getUserSkillsPath(),
      });
    }
    return this.coreManager;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (!this.initializationPromise) {
      this.initializationPromise = (async () => {
        console.log('[SkillsManager] Initializing...');
        await this.getCoreManager().initialize();
        this.initialized = true;
        console.log('[SkillsManager] Initialized');
      })().catch((error) => {
        this.initializationPromise = null;
        throw error;
      });
    }

    await this.initializationPromise;
  }

  async resync(): Promise<void> {
    await this.ensureInitialized();
    console.log('[SkillsManager] Resyncing skills...');
    await this.getCoreManager().resync();
  }

  async getAll() {
    await this.ensureInitialized();
    return this.getCoreManager().getAllSkills();
  }

  async getEnabled() {
    await this.ensureInitialized();
    return this.getCoreManager().getEnabledSkills();
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.ensureInitialized();
    this.getCoreManager().setSkillEnabled(id, enabled);
  }

  async getContent(id: string): Promise<string | null> {
    await this.ensureInitialized();
    return this.getCoreManager().getSkillContent(id);
  }

  async addFromFile(sourcePath: string) {
    await this.ensureInitialized();
    return this.getCoreManager().addSkill(sourcePath);
  }

  async addFromGitHub(rawUrl: string) {
    await this.ensureInitialized();
    return this.getCoreManager().addSkill(rawUrl);
  }

  async delete(id: string): Promise<void> {
    await this.ensureInitialized();
    const deleted = this.getCoreManager().deleteSkill(id);
    if (!deleted) {
      throw new Error('Skill not found or cannot be deleted');
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    await this.initialize();
  }
}

export const skillsManager = new SkillsManager();
