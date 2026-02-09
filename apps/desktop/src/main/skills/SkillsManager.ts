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

    console.log('[SkillsManager] Initializing...');
    await this.getCoreManager().initialize();
    this.initialized = true;
    console.log('[SkillsManager] Initialized');
  }

  async resync(): Promise<void> {
    console.log('[SkillsManager] Resyncing skills...');
    await this.getCoreManager().resync();
  }

  async getAll() {
    return this.getCoreManager().getAllSkills();
  }

  async getEnabled() {
    return this.getCoreManager().getEnabledSkills();
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    this.getCoreManager().setSkillEnabled(id, enabled);
  }

  async getContent(id: string): Promise<string | null> {
    return this.getCoreManager().getSkillContent(id);
  }

  async addFromFile(sourcePath: string) {
    return this.getCoreManager().addSkill(sourcePath);
  }

  async addFromGitHub(rawUrl: string) {
    return this.getCoreManager().addSkill(rawUrl);
  }

  async delete(id: string): Promise<void> {
    const deleted = this.getCoreManager().deleteSkill(id);
    if (!deleted) {
      throw new Error('Skill not found or cannot be deleted');
    }
  }
}

export const skillsManager = new SkillsManager();
