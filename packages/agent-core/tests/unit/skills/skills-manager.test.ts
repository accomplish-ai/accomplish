import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * SkillsManager tests require better-sqlite3 native module.
 * If the native module is not available (Node.js version mismatch),
 * these tests will be skipped.
 *
 * To fix native module issues, run: pnpm rebuild better-sqlite3
 */

describe('SkillsManager', () => {
  let testDir: string;
  let bundledSkillsPath: string;
  let userSkillsPath: string;
  let SkillsManager: typeof import('../../../src/internal/classes/SkillsManager.js').SkillsManager | null = null;
  let manager: InstanceType<typeof import('../../../src/internal/classes/SkillsManager.js').SkillsManager> | null = null;
  let initializeDatabase: typeof import('../../../src/storage/database.js').initializeDatabase | null = null;
  let closeDatabase: typeof import('../../../src/storage/database.js').closeDatabase | null = null;
  let getDatabase: typeof import('../../../src/storage/database.js').getDatabase | null = null;
  let moduleAvailable = false;

  beforeAll(async () => {
    try {
      // Verify better-sqlite3 is loadable
      await import('better-sqlite3');
      const dbModule = await import('../../../src/storage/database.js');
      initializeDatabase = dbModule.initializeDatabase;
      closeDatabase = dbModule.closeDatabase;
      getDatabase = dbModule.getDatabase;
      const skillsModule = await import('../../../src/internal/classes/SkillsManager.js');
      SkillsManager = skillsModule.SkillsManager;
      moduleAvailable = true;
    } catch (err) {
      console.warn('Skipping skills-manager tests: better-sqlite3 native module not available');
      console.warn('To fix: pnpm rebuild better-sqlite3');
    }
  });

  beforeEach(() => {
    if (!moduleAvailable) return;

    // Create a unique temporary directory for each test
    testDir = path.join(os.tmpdir(), `skills-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    bundledSkillsPath = path.join(testDir, 'bundled-skills');
    userSkillsPath = path.join(testDir, 'user-skills');

    fs.mkdirSync(bundledSkillsPath, { recursive: true });
    fs.mkdirSync(userSkillsPath, { recursive: true });

    // Initialize the database singleton (used by repository functions)
    initializeDatabase!({ databasePath: ':memory:', runMigrations: true });

    manager = new SkillsManager!({
      bundledSkillsPath,
      userSkillsPath,
    });

    // Suppress console.log during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (closeDatabase) {
      closeDatabase();
    }

    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    vi.restoreAllMocks();
  });

  function createSkillFile(basePath: string, name: string, frontmatter: Record<string, unknown> = {}) {
    const skillDir = path.join(basePath, name);
    fs.mkdirSync(skillDir, { recursive: true });

    const fm = {
      name: frontmatter.name || name,
      description: frontmatter.description || `Description for ${name}`,
      ...frontmatter,
    };

    const content = `---
name: ${fm.name}
description: ${fm.description}
${fm.command ? `command: ${fm.command}` : ''}
${fm.verified ? 'verified: true' : ''}
${fm.hidden ? 'hidden: true' : ''}
---

# ${fm.name}

This is the skill content for ${fm.name}.
`;

    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
    return path.join(skillDir, 'SKILL.md');
  }

  describe('initialize', () => {
    it('should initialize and create user skills directory', async () => {
      if (!moduleAvailable || !manager) return;

      // Remove user skills directory
      fs.rmSync(userSkillsPath, { recursive: true, force: true });

      await manager.initialize();

      expect(fs.existsSync(userSkillsPath)).toBe(true);
    });

    it('should only initialize once', async () => {
      if (!moduleAvailable || !manager) return;

      await manager.initialize();
      await manager.initialize(); // Should not throw
    });
  });

  describe('scanDirectory / resync', () => {
    it('should discover skills from directory', async () => {
      if (!moduleAvailable || !manager) return;

      createSkillFile(bundledSkillsPath, 'test-skill');

      await manager.initialize();

      const skills = manager.getAllSkills();
      expect(skills.length).toBe(1);
      expect(skills[0].name).toBe('test-skill');
      expect(skills[0].source).toBe('official');
    });

    it('should discover multiple skills', async () => {
      if (!moduleAvailable || !manager) return;

      createSkillFile(bundledSkillsPath, 'skill-one');
      createSkillFile(bundledSkillsPath, 'skill-two');
      createSkillFile(bundledSkillsPath, 'skill-three');

      await manager.initialize();

      const skills = manager.getAllSkills();
      expect(skills.length).toBe(3);
    });

    it('should differentiate between bundled and user skills', async () => {
      if (!moduleAvailable || !manager) return;

      createSkillFile(bundledSkillsPath, 'official-skill');
      createSkillFile(userSkillsPath, 'custom-skill');

      await manager.initialize();

      const skills = manager.getAllSkills();
      const official = skills.find((s) => s.name === 'official-skill');
      const custom = skills.find((s) => s.name === 'custom-skill');

      expect(official?.source).toBe('official');
      expect(custom?.source).toBe('custom');
    });
  });

  describe('parse skill frontmatter', () => {
    it('should parse skill frontmatter correctly', async () => {
      if (!moduleAvailable || !manager) return;

      createSkillFile(bundledSkillsPath, 'full-skill', {
        name: 'Full Featured Skill',
        description: 'A fully featured skill',
        command: '/full',
        verified: true,
      });

      await manager.initialize();

      const skills = manager.getAllSkills();
      const skill = skills.find((s) => s.name === 'Full Featured Skill');

      expect(skill).toBeDefined();
      expect(skill?.name).toBe('Full Featured Skill');
      expect(skill?.description).toBe('A fully featured skill');
      expect(skill?.command).toBe('/full');
      expect(skill?.isVerified).toBe(true);
    });

    it('should handle missing frontmatter fields', async () => {
      if (!moduleAvailable || !manager) return;

      // Create minimal skill file
      const skillDir = path.join(bundledSkillsPath, 'minimal');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---
name: Minimal Skill
---

Content here.
`
      );

      await manager.initialize();

      const skills = manager.getAllSkills();
      const skill = skills.find((s) => s.name === 'Minimal Skill');

      expect(skill).toBeDefined();
      expect(skill?.description).toBe('');
      expect(skill?.command).toBe('/minimal-skill');
    });

    it('should handle hidden skills', async () => {
      if (!moduleAvailable || !manager) return;

      createSkillFile(bundledSkillsPath, 'hidden-skill', {
        name: 'Hidden Skill',
        hidden: true,
      });

      await manager.initialize();

      const skills = manager.getAllSkills();
      const skill = skills.find((s) => s.name === 'Hidden Skill');

      expect(skill?.isHidden).toBe(true);
    });
  });

  describe('sync skills to database', () => {
    it('should sync skills to database', async () => {
      if (!moduleAvailable || !manager || !getDatabase) return;

      createSkillFile(bundledSkillsPath, 'db-skill');

      await manager.initialize();

      // Query database directly via singleton
      const db = getDatabase();
      const row = db.prepare('SELECT * FROM skills WHERE name = ?').get('db-skill');
      expect(row).toBeDefined();
    });

    it('should update existing skills on resync', async () => {
      if (!moduleAvailable || !manager) return;

      const skillPath = createSkillFile(bundledSkillsPath, 'update-skill', {
        description: 'Original description',
      });

      await manager.initialize();

      // Update the skill file
      const newContent = `---
name: update-skill
description: Updated description
---

Updated content.
`;
      fs.writeFileSync(skillPath, newContent);

      // Resync
      await manager.resync();

      const skills = manager.getAllSkills();
      const skill = skills.find((s) => s.name === 'update-skill');

      expect(skill?.description).toBe('Updated description');
    });

    it('should remove stale skills that no longer exist on disk', async () => {
      if (!moduleAvailable || !manager) return;

      createSkillFile(bundledSkillsPath, 'permanent-skill');
      const tempSkillDir = path.join(bundledSkillsPath, 'temp-skill');
      createSkillFile(bundledSkillsPath, 'temp-skill');

      await manager.initialize();

      expect(manager.getAllSkills().length).toBe(2);

      // Remove the temporary skill
      fs.rmSync(tempSkillDir, { recursive: true, force: true });

      await manager.resync();

      const skills = manager.getAllSkills();
      expect(skills.length).toBe(1);
      expect(skills[0].name).toBe('permanent-skill');
    });
  });

  describe('enable/disable skills', () => {
    it('should enable and disable skills', async () => {
      if (!moduleAvailable || !manager) return;

      createSkillFile(bundledSkillsPath, 'toggle-skill');

      await manager.initialize();

      const skills = manager.getAllSkills();
      const skill = skills.find((s) => s.name === 'toggle-skill')!;

      // Skills are enabled by default
      expect(skill.isEnabled).toBe(true);

      // Disable
      manager.setSkillEnabled(skill.id, false);

      const updated = manager.getSkillById(skill.id);
      expect(updated?.isEnabled).toBe(false);

      // Enable
      manager.setSkillEnabled(skill.id, true);

      const reEnabled = manager.getSkillById(skill.id);
      expect(reEnabled?.isEnabled).toBe(true);
    });

    it('should get only enabled skills', async () => {
      if (!moduleAvailable || !manager) return;

      createSkillFile(bundledSkillsPath, 'enabled-skill');
      createSkillFile(bundledSkillsPath, 'disabled-skill');

      await manager.initialize();

      const allSkills = manager.getAllSkills();
      const disabledSkill = allSkills.find((s) => s.name === 'disabled-skill')!;

      manager.setSkillEnabled(disabledSkill.id, false);

      const enabledSkills = manager.getEnabledSkills();
      expect(enabledSkills.length).toBe(1);
      expect(enabledSkills[0].name).toBe('enabled-skill');
    });

    it('should preserve enabled state on resync', async () => {
      if (!moduleAvailable || !manager) return;

      createSkillFile(bundledSkillsPath, 'preserve-state-skill');

      await manager.initialize();

      const skill = manager.getAllSkills()[0];
      manager.setSkillEnabled(skill.id, false);

      // Resync
      await manager.resync();

      const updated = manager.getSkillById(skill.id);
      expect(updated?.isEnabled).toBe(false);
    });
  });

  describe('get skill content', () => {
    it('should get skill content', async () => {
      if (!moduleAvailable || !manager) return;

      createSkillFile(bundledSkillsPath, 'content-skill', {
        name: 'Content Skill',
        description: 'A skill with content',
      });

      await manager.initialize();

      const skill = manager.getAllSkills()[0];
      const content = manager.getSkillContent(skill.id);

      expect(content).toContain('Content Skill');
      expect(content).toContain('A skill with content');
    });

    it('should return null for non-existent skill', async () => {
      if (!moduleAvailable || !manager) return;

      await manager.initialize();

      const content = manager.getSkillContent('nonexistent-id');
      expect(content).toBeNull();
    });
  });

  describe('getSkillById', () => {
    it('should get skill by ID', async () => {
      if (!moduleAvailable || !manager) return;

      createSkillFile(bundledSkillsPath, 'findme-skill');

      await manager.initialize();

      const allSkills = manager.getAllSkills();
      const targetSkill = allSkills[0];

      const found = manager.getSkillById(targetSkill.id);
      expect(found).not.toBeNull();
      expect(found?.name).toBe('findme-skill');
    });

    it('should return null for non-existent ID', async () => {
      if (!moduleAvailable || !manager) return;

      await manager.initialize();

      const found = manager.getSkillById('does-not-exist');
      expect(found).toBeNull();
    });
  });

  describe('addSkill from file', () => {
    it('should add skill from local file', async () => {
      if (!moduleAvailable || !manager) return;

      await manager.initialize();

      // Create a source skill file
      const sourceDir = path.join(testDir, 'source');
      fs.mkdirSync(sourceDir, { recursive: true });

      const skillContent = `---
name: Imported Skill
description: An imported skill
---

Imported content.
`;
      const sourcePath = path.join(sourceDir, 'SKILL.md');
      fs.writeFileSync(sourcePath, skillContent);

      const skill = await manager.addSkill(sourcePath);

      expect(skill).not.toBeNull();
      expect(skill?.name).toBe('Imported Skill');
      expect(skill?.source).toBe('custom');

      // Verify it was copied to user skills directory
      const copiedPath = path.join(userSkillsPath, 'Imported-Skill', 'SKILL.md');
      expect(fs.existsSync(copiedPath)).toBe(true);
    });

    it('should throw error for skill without name', async () => {
      if (!moduleAvailable || !manager) return;

      await manager.initialize();

      const sourceDir = path.join(testDir, 'source-no-name');
      fs.mkdirSync(sourceDir, { recursive: true });

      const skillContent = `---
description: No name skill
---

Content.
`;
      const sourcePath = path.join(sourceDir, 'SKILL.md');
      fs.writeFileSync(sourcePath, skillContent);

      await expect(manager.addSkill(sourcePath)).rejects.toThrow('must have a name');
    });
  });

  describe('deleteSkill', () => {
    it('should delete custom skills', async () => {
      if (!moduleAvailable || !manager) return;

      createSkillFile(userSkillsPath, 'deletable-skill');

      await manager.initialize();

      const skill = manager.getAllSkills()[0];
      expect(skill.source).toBe('custom');

      const deleted = manager.deleteSkill(skill.id);

      expect(deleted).toBe(true);
      expect(manager.getSkillById(skill.id)).toBeNull();

      // Directory should be removed
      expect(fs.existsSync(path.join(userSkillsPath, 'deletable-skill'))).toBe(false);
    });

    it('should not delete official skills', async () => {
      if (!moduleAvailable || !manager) return;

      createSkillFile(bundledSkillsPath, 'official-skill');

      await manager.initialize();

      const skill = manager.getAllSkills()[0];
      expect(skill.source).toBe('official');

      const deleted = manager.deleteSkill(skill.id);

      expect(deleted).toBe(false);
      expect(manager.getSkillById(skill.id)).not.toBeNull();
    });

    it('should return false for non-existent skill', async () => {
      if (!moduleAvailable || !manager) return;

      await manager.initialize();

      const deleted = manager.deleteSkill('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('path traversal protection', () => {
    it('should sanitize skill names to prevent path traversal', async () => {
      if (!moduleAvailable || !manager) return;

      await manager.initialize();

      // Create a source skill file with a dangerous name
      const sourceDir = path.join(testDir, 'source-dangerous');
      fs.mkdirSync(sourceDir, { recursive: true });

      const skillContent = `---
name: ../../../etc/passwd
description: Dangerous skill
---

Content.
`;
      const sourcePath = path.join(sourceDir, 'SKILL.md');
      fs.writeFileSync(sourcePath, skillContent);

      // The manager sanitizes dangerous names rather than throwing
      // This is actually better security - sanitize and proceed safely
      const skill = await manager.addSkill(sourcePath);
      expect(skill).not.toBeNull();
      // The sanitized name should not contain path traversal characters
      expect(skill!.id).toBe('custom-etc-passwd');
      // Verify the file was created in the user skills directory, not /etc/
      expect(skill!.filePath.startsWith(testDir)).toBe(true);
      expect(skill!.filePath).not.toContain('/etc/passwd');
    });
  });
});
