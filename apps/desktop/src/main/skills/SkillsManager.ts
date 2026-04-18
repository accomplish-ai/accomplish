/**
 * SkillsManager — thin daemon-client wrapper.
 *
 * Milestone 4 of the daemon-only-SQLite migration
 * (plan: /Users/yanai/.claude/plans/squishy-exploring-hamster.md).
 *
 * Pre-M4 this held a `createSkillsManager()` singleton from agent-core,
 * which owned the skills DB table and ran disk scans against bundled +
 * user skill directories. Both main and daemon could hit the same table.
 *
 * Post-M4 the daemon owns it. `SkillsService` on the daemon side runs
 * `createSkillsManager()` inside its own process; every method here
 * just delegates to the matching `skills.*` RPC. The handful of
 * callers that need the user-skills path (for the file picker's default
 * dir, and for `shell.openPath` / `shell.showItemInFolder` in
 * `skills-handlers.ts`) read it once via `getUserSkillsPath()` and
 * cache it locally.
 *
 * `initialize()` is retained as a no-op so existing startup wiring
 * (`app-startup.ts`) keeps compiling. The daemon does its own init on
 * boot, before any `skills.*` RPC can arrive.
 */
import type { Skill } from '@accomplish_ai/agent-core/desktop-main';
import { getDaemonClient } from '../daemon-bootstrap';

export class SkillsManager {
  private cachedUserSkillsPath: string | null = null;

  async getUserSkillsPath(): Promise<string> {
    if (!this.cachedUserSkillsPath) {
      this.cachedUserSkillsPath = await getDaemonClient().call('skills.getUserSkillsPath');
    }
    return this.cachedUserSkillsPath;
  }

  async initialize(): Promise<void> {
    // No-op — the daemon initializes its own SkillsService on startup.
    // Kept as a method so `app-startup.ts` doesn't need to branch.
  }

  async resync(): Promise<Skill[]> {
    return getDaemonClient().call('skills.resync');
  }

  async getAll(): Promise<Skill[]> {
    return getDaemonClient().call('skills.list');
  }

  async getEnabled(): Promise<Skill[]> {
    return getDaemonClient().call('skills.listEnabled');
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await getDaemonClient().call('skills.setEnabled', { skillId: id, enabled });
  }

  async getContent(id: string): Promise<string | null> {
    return getDaemonClient().call('skills.getContent', { skillId: id });
  }

  async addFromFile(sourcePath: string): Promise<Skill | null> {
    return getDaemonClient().call('skills.addFromPath', { sourcePath });
  }

  async addFromFolder(folderPath: string): Promise<Skill | null> {
    return getDaemonClient().call('skills.addFromPath', { sourcePath: folderPath });
  }

  async addFromGitHub(rawUrl: string): Promise<Skill | null> {
    return getDaemonClient().call('skills.addFromPath', { sourcePath: rawUrl });
  }

  async delete(id: string): Promise<void> {
    await getDaemonClient().call('skills.delete', { skillId: id });
  }
}

export const skillsManager = new SkillsManager();
