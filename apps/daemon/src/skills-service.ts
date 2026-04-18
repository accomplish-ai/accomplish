/**
 * SkillsService — thin wrapper around `createSkillsManager` from agent-core.
 *
 * Milestone 4 of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Pre-M4: desktop main owned a `createSkillsManager()` instance and kept
 * it in `apps/desktop/src/main/skills/SkillsManager.ts`. Both daemon and
 * main could concurrently touch the `skills` SQLite table because the
 * daemon bundles the storage layer too.
 *
 * Post-M4: main never instantiates `createSkillsManager`. The daemon owns
 * the singleton and exposes CRUD + lifecycle via `skills.*` RPCs. Every
 * write emits a `skills.changed` notification so the renderer reloads its
 * cache through the shared notification forwarder.
 *
 * The Electron-only bits that used to live alongside SkillsManager
 * (`dialog.showOpenDialog`, `shell.openPath`, `shell.showItemInFolder`)
 * stay in the desktop IPC handler — the daemon only sees file paths that
 * main has already resolved.
 */
import { EventEmitter } from 'node:events';
import path from 'node:path';
import {
  createSkillsManager,
  type SkillsManagerAPI,
  type Skill,
  type SkillsChangedPayload,
} from '@accomplish_ai/agent-core';

export const SKILLS_CHANGED = 'skills.changed' as const;

export interface SkillsServiceOptions {
  /** Data directory (daemon CLI `--data-dir`). User-installed skills live
   *  under `${dataDir}/skills`, matching the desktop pre-M4 path. */
  dataDir: string;
  /** Absolute path to the bundled-skills directory. In packaged builds
   *  this is `${resourcesPath}/bundled-skills`; in dev builds it's
   *  `${appPath}/bundled-skills`. Main computes either from
   *  `app.isPackaged` + `process.resourcesPath` / `app.getAppPath()` and
   *  passes the resolved value in so the daemon never needs to re-derive
   *  it. */
  bundledSkillsPath: string;
}

export class SkillsService extends EventEmitter {
  private readonly inner: SkillsManagerAPI;
  private readonly userSkillsPath: string;
  private initialized = false;

  constructor(opts: SkillsServiceOptions) {
    super();
    this.userSkillsPath = path.join(opts.dataDir, 'skills');
    this.inner = createSkillsManager({
      bundledSkillsPath: opts.bundledSkillsPath,
      userSkillsPath: this.userSkillsPath,
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.inner.initialize();
    this.initialized = true;
  }

  // ─── Reads (no events) ────────────────────────────────────────────────

  list(): Skill[] {
    return this.inner.getAllSkills();
  }

  listEnabled(): Skill[] {
    return this.inner.getEnabledSkills();
  }

  getContent(skillId: string): string | null {
    return this.inner.getSkillContent(skillId);
  }

  getUserSkillsPath(): string {
    return this.userSkillsPath;
  }

  // ─── Writes (emit skills.changed) ─────────────────────────────────────

  setEnabled(skillId: string, enabled: boolean): void {
    this.inner.setSkillEnabled(skillId, enabled);
    this.emitChange('updated');
  }

  async addFromPath(sourcePath: string): Promise<Skill | null> {
    const skill = await this.inner.addSkill(sourcePath);
    if (skill) {
      this.emitChange('added');
    }
    return skill;
  }

  delete(skillId: string): void {
    const deleted = this.inner.deleteSkill(skillId);
    if (!deleted) {
      throw new Error('Skill not found or cannot be deleted');
    }
    this.emitChange('removed');
  }

  async resync(): Promise<Skill[]> {
    const skills = await this.inner.resync();
    this.emitChange('resynced');
    return skills;
  }

  private emitChange(kind: SkillsChangedPayload['kind']): void {
    this.emit(SKILLS_CHANGED, { kind } satisfies SkillsChangedPayload);
  }
}

export type { SkillsChangedPayload };
