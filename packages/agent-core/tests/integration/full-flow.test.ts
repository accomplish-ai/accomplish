import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Integration tests for @accomplish/core
 *
 * These tests verify that multiple core components work together correctly.
 * Unlike unit tests that mock dependencies, integration tests use real
 * database connections and file systems.
 *
 * Note: These tests require better-sqlite3 native module. If the native module
 * is not available (Node.js version mismatch), tests will be skipped.
 * To fix native module issues, run: pnpm rebuild better-sqlite3
 */

describe('Core Package Integration', () => {
  let tempDir: string;
  let dbPath: string;
  let secureStoragePath: string;
  let bundledSkillsPath: string;
  let userSkillsPath: string;

  // Dynamically imported modules (due to native dependencies)
  let databaseModule: typeof import('../../src/storage/database.js') | null = null;
  let secureStorageModule: typeof import('../../src/storage/secure-storage.js') | null = null;
  let migrationsModule: typeof import('../../src/storage/migrations/index.js') | null = null;
  let skillsModule: typeof import('../../src/skills/skills-manager.js') | null = null;
  let pathsModule: typeof import('../../src/utils/paths.js') | null = null;
  let moduleAvailable = false;

  beforeAll(async () => {
    try {
      // Load all modules that depend on better-sqlite3
      databaseModule = await import('../../src/storage/database.js');
      secureStorageModule = await import('../../src/storage/secure-storage.js');
      migrationsModule = await import('../../src/storage/migrations/index.js');
      skillsModule = await import('../../src/skills/skills-manager.js');
      pathsModule = await import('../../src/utils/paths.js');
      moduleAvailable = true;
    } catch (err) {
      console.warn('Skipping integration tests: better-sqlite3 native module not available');
      console.warn('To fix: pnpm rebuild better-sqlite3');
    }
  });

  beforeEach(() => {
    // Create a unique temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-integration-'));
    dbPath = path.join(tempDir, 'test.db');
    secureStoragePath = tempDir;
    bundledSkillsPath = path.join(tempDir, 'bundled-skills');
    userSkillsPath = path.join(tempDir, 'user-skills');

    // Create skill directories
    fs.mkdirSync(bundledSkillsPath, { recursive: true });
    fs.mkdirSync(userSkillsPath, { recursive: true });

    // Suppress console.log during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Close database and clean up
    if (databaseModule) {
      databaseModule.resetDatabaseInstance();
    }

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    vi.restoreAllMocks();
  });

  describe('Database initialization with migrations', () => {
    it('should initialize database and run all migrations', () => {
      if (!moduleAvailable || !databaseModule || !migrationsModule) return;

      const db = databaseModule.initializeDatabase({ databasePath: dbPath });

      expect(db).toBeDefined();
      expect(databaseModule.isDatabaseInitialized()).toBe(true);
      expect(databaseModule.getDatabasePath()).toBe(dbPath);

      // Check that migrations ran successfully
      const version = migrationsModule.getStoredVersion(db);
      expect(version).toBeGreaterThan(0);
      expect(version).toBe(migrationsModule.CURRENT_VERSION);

      // Check that all expected tables were created
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>;
      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain('schema_meta');
      expect(tableNames).toContain('app_settings');
      expect(tableNames).toContain('providers');
      expect(tableNames).toContain('provider_meta');
      expect(tableNames).toContain('tasks');
      expect(tableNames).toContain('skills');
    });

    it('should handle database close and reopen', () => {
      if (!moduleAvailable || !databaseModule) return;

      // Initialize database
      const db1 = databaseModule.initializeDatabase({ databasePath: dbPath });
      expect(databaseModule.isDatabaseInitialized()).toBe(true);

      // Close database
      databaseModule.closeDatabase();
      expect(databaseModule.isDatabaseInitialized()).toBe(false);

      // Reopen database
      const db2 = databaseModule.initializeDatabase({ databasePath: dbPath });
      expect(databaseModule.isDatabaseInitialized()).toBe(true);

      // Should get a new connection
      expect(db1 === db2).toBe(false);
    });
  });

  describe('Secure storage for API keys', () => {
    it('should store and retrieve API keys securely', () => {
      if (!moduleAvailable || !secureStorageModule) return;

      const storage = secureStorageModule.createSecureStorage({
        storagePath: secureStoragePath,
        appId: 'integration-test',
      });

      // Store API keys for different providers
      storage.storeApiKey('anthropic', 'sk-ant-test-key-12345');
      storage.storeApiKey('openai', 'sk-openai-test-key-67890');
      storage.storeApiKey('google', 'google-api-key-abcdef');

      // Retrieve and verify
      expect(storage.getApiKey('anthropic')).toBe('sk-ant-test-key-12345');
      expect(storage.getApiKey('openai')).toBe('sk-openai-test-key-67890');
      expect(storage.getApiKey('google')).toBe('google-api-key-abcdef');
    });

    it('should delete API keys', () => {
      if (!moduleAvailable || !secureStorageModule) return;

      const storage = secureStorageModule.createSecureStorage({
        storagePath: secureStoragePath,
        appId: 'integration-test',
      });

      // Store and then delete
      storage.storeApiKey('xai', 'xai-api-key-xyz');
      expect(storage.getApiKey('xai')).toBe('xai-api-key-xyz');

      const deleted = storage.deleteApiKey('xai');
      expect(deleted).toBe(true);
      expect(storage.getApiKey('xai')).toBeNull();
    });

    it('should persist data across storage instances', () => {
      if (!moduleAvailable || !secureStorageModule) return;

      // Create first instance and store data
      const storage1 = secureStorageModule.createSecureStorage({
        storagePath: secureStoragePath,
        appId: 'integration-test',
      });
      storage1.storeApiKey('anthropic', 'persistent-key');

      // Create second instance pointing to same location
      const storage2 = secureStorageModule.createSecureStorage({
        storagePath: secureStoragePath,
        appId: 'integration-test',
      });

      // Data should be available
      expect(storage2.getApiKey('anthropic')).toBe('persistent-key');
    });

    it('should report if any API key exists', async () => {
      if (!moduleAvailable || !secureStorageModule) return;

      const storage = secureStorageModule.createSecureStorage({
        storagePath: secureStoragePath,
        appId: 'integration-test',
      });

      // Initially no keys
      expect(await storage.hasAnyApiKey()).toBe(false);

      // Add a key
      storage.storeApiKey('openai', 'test-key');
      expect(await storage.hasAnyApiKey()).toBe(true);
    });

    it('should get all API keys at once', async () => {
      if (!moduleAvailable || !secureStorageModule) return;

      const storage = secureStorageModule.createSecureStorage({
        storagePath: secureStoragePath,
        appId: 'integration-test',
      });

      storage.storeApiKey('anthropic', 'key1');
      storage.storeApiKey('openai', 'key2');

      const allKeys = await storage.getAllApiKeys();
      expect(allKeys.anthropic).toBe('key1');
      expect(allKeys.openai).toBe('key2');
      expect(allKeys.google).toBeNull();
      expect(allKeys.xai).toBeNull();
    });
  });

  describe('Platform config creation', () => {
    it('should create platform config with defaults', () => {
      if (!moduleAvailable || !pathsModule) return;

      const config = pathsModule.createDefaultPlatformConfig('TestApp');

      expect(config.userDataPath).toBeDefined();
      expect(config.userDataPath.length).toBeGreaterThan(0);
      expect(config.tempPath).toBe(os.tmpdir());
      expect(config.isPackaged).toBe(false);
      expect(config.platform).toBe(process.platform);
      expect(config.arch).toBe(process.arch);
    });

    it('should accept overrides for platform config', () => {
      if (!moduleAvailable || !pathsModule) return;

      const customPath = '/custom/user/data';
      const config = pathsModule.createDefaultPlatformConfig('TestApp', {
        userDataPath: customPath,
        isPackaged: true,
        resourcesPath: '/app/resources',
      });

      expect(config.userDataPath).toBe(customPath);
      expect(config.isPackaged).toBe(true);
      expect(config.resourcesPath).toBe('/app/resources');
      // Non-overridden values should use defaults
      expect(config.tempPath).toBe(os.tmpdir());
    });

    it('should resolve paths relative to user data', () => {
      if (!moduleAvailable || !pathsModule) return;

      const config = pathsModule.createDefaultPlatformConfig('TestApp', {
        userDataPath: '/app/data',
      });

      const resolved = pathsModule.resolveUserDataPath(config, 'databases', 'main.db');
      expect(resolved).toBe(path.join('/app/data', 'databases', 'main.db'));
    });

    it('should resolve resources path when set', () => {
      if (!moduleAvailable || !pathsModule) return;

      const config = pathsModule.createDefaultPlatformConfig('TestApp', {
        resourcesPath: '/app/resources',
      });

      const resolved = pathsModule.resolveResourcesPath(config, 'assets', 'logo.png');
      expect(resolved).toBe(path.join('/app/resources', 'assets', 'logo.png'));
    });

    it('should return null for resources path when not set', () => {
      if (!moduleAvailable || !pathsModule) return;

      const config = pathsModule.createDefaultPlatformConfig('TestApp');

      const resolved = pathsModule.resolveResourcesPath(config, 'assets', 'logo.png');
      expect(resolved).toBeNull();
    });
  });

  describe('Skills manager with database sync', () => {
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
---

# ${fm.name}

This is the skill content for ${fm.name}.
`;

      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
      return path.join(skillDir, 'SKILL.md');
    }

    it('should discover skills and sync to database', async () => {
      if (!moduleAvailable || !databaseModule || !skillsModule) return;

      // Initialize database
      const db = databaseModule.initializeDatabase({ databasePath: dbPath });

      // Create some skill files
      createSkillFile(bundledSkillsPath, 'test-skill-1', {
        name: 'Test Skill One',
        description: 'First test skill',
        command: '/test1',
      });
      createSkillFile(bundledSkillsPath, 'test-skill-2', {
        name: 'Test Skill Two',
        description: 'Second test skill',
      });

      // Initialize skills manager
      const manager = new skillsModule.SkillsManager({
        bundledSkillsPath,
        userSkillsPath,
        database: db,
      });

      await manager.initialize();

      // Check skills were discovered
      const skills = manager.getAllSkills();
      expect(skills.length).toBe(2);

      // Check skills are synced to database
      const dbSkills = db.prepare('SELECT * FROM skills').all() as Array<{ name: string }>;
      expect(dbSkills.length).toBe(2);

      const skillNames = dbSkills.map((s) => s.name);
      expect(skillNames).toContain('Test Skill One');
      expect(skillNames).toContain('Test Skill Two');
    });

    it('should preserve enabled state through resync', async () => {
      if (!moduleAvailable || !databaseModule || !skillsModule) return;

      const db = databaseModule.initializeDatabase({ databasePath: dbPath });

      createSkillFile(bundledSkillsPath, 'toggle-skill', {
        name: 'Toggle Skill',
        description: 'A skill to toggle',
      });

      const manager = new skillsModule.SkillsManager({
        bundledSkillsPath,
        userSkillsPath,
        database: db,
      });

      await manager.initialize();

      // Disable the skill
      const skill = manager.getAllSkills()[0];
      manager.setSkillEnabled(skill.id, false);
      expect(manager.getSkillById(skill.id)?.isEnabled).toBe(false);

      // Resync
      await manager.resync();

      // Enabled state should be preserved
      expect(manager.getSkillById(skill.id)?.isEnabled).toBe(false);
    });

    it('should differentiate between official and custom skills', async () => {
      if (!moduleAvailable || !databaseModule || !skillsModule) return;

      const db = databaseModule.initializeDatabase({ databasePath: dbPath });

      createSkillFile(bundledSkillsPath, 'official-skill', {
        name: 'Official Skill',
        description: 'An official bundled skill',
      });
      createSkillFile(userSkillsPath, 'custom-skill', {
        name: 'Custom Skill',
        description: 'A user-added custom skill',
      });

      const manager = new skillsModule.SkillsManager({
        bundledSkillsPath,
        userSkillsPath,
        database: db,
      });

      await manager.initialize();

      const skills = manager.getAllSkills();
      const official = skills.find((s) => s.name === 'Official Skill');
      const custom = skills.find((s) => s.name === 'Custom Skill');

      expect(official?.source).toBe('official');
      expect(custom?.source).toBe('custom');
    });

    it('should allow adding custom skills from file', async () => {
      if (!moduleAvailable || !databaseModule || !skillsModule) return;

      const db = databaseModule.initializeDatabase({ databasePath: dbPath });

      const manager = new skillsModule.SkillsManager({
        bundledSkillsPath,
        userSkillsPath,
        database: db,
      });

      await manager.initialize();

      // Create a skill file to import
      const importDir = path.join(tempDir, 'import');
      fs.mkdirSync(importDir, { recursive: true });
      const skillContent = `---
name: Imported Skill
description: An imported custom skill
---

Imported content here.
`;
      const importPath = path.join(importDir, 'SKILL.md');
      fs.writeFileSync(importPath, skillContent);

      // Import the skill
      const importedSkill = await manager.addSkill(importPath);

      expect(importedSkill).not.toBeNull();
      expect(importedSkill?.name).toBe('Imported Skill');
      expect(importedSkill?.source).toBe('custom');

      // Skill should be in the list
      const skills = manager.getAllSkills();
      expect(skills.some((s) => s.name === 'Imported Skill')).toBe(true);
    });

    it('should allow deleting custom skills but not official skills', async () => {
      if (!moduleAvailable || !databaseModule || !skillsModule) return;

      const db = databaseModule.initializeDatabase({ databasePath: dbPath });

      createSkillFile(bundledSkillsPath, 'official', {
        name: 'Official',
        description: 'Official skill',
      });
      createSkillFile(userSkillsPath, 'custom', {
        name: 'Custom',
        description: 'Custom skill',
      });

      const manager = new skillsModule.SkillsManager({
        bundledSkillsPath,
        userSkillsPath,
        database: db,
      });

      await manager.initialize();

      const skills = manager.getAllSkills();
      const official = skills.find((s) => s.name === 'Official')!;
      const custom = skills.find((s) => s.name === 'Custom')!;

      // Should not delete official skill
      expect(manager.deleteSkill(official.id)).toBe(false);
      expect(manager.getSkillById(official.id)).not.toBeNull();

      // Should delete custom skill
      expect(manager.deleteSkill(custom.id)).toBe(true);
      expect(manager.getSkillById(custom.id)).toBeNull();
    });
  });

  describe('Full workflow integration', () => {
    it('should support complete app initialization workflow', async () => {
      if (!moduleAvailable || !databaseModule || !secureStorageModule || !skillsModule || !pathsModule)
        return;

      // 1. Create platform config
      const platformConfig = pathsModule.createDefaultPlatformConfig('IntegrationTest', {
        userDataPath: tempDir,
      });

      // 2. Initialize database
      const dbFullPath = pathsModule.resolveUserDataPath(platformConfig, 'test.db');
      const db = databaseModule.initializeDatabase({ databasePath: dbFullPath });

      // 3. Initialize secure storage
      const storage = secureStorageModule.createSecureStorage({
        storagePath: platformConfig.userDataPath,
        appId: 'integration-test',
      });

      // 4. Store an API key
      storage.storeApiKey('anthropic', 'sk-ant-integration-test');

      // 5. Create skill directories and initialize skills manager
      const skillsPath = pathsModule.resolveUserDataPath(platformConfig, 'skills');
      fs.mkdirSync(skillsPath, { recursive: true });

      const manager = new skillsModule.SkillsManager({
        bundledSkillsPath,
        userSkillsPath: skillsPath,
        database: db,
      });

      await manager.initialize();

      // Verify all components are working together
      expect(databaseModule.isDatabaseInitialized()).toBe(true);
      expect(storage.getApiKey('anthropic')).toBe('sk-ant-integration-test');
      expect(manager.getAllSkills()).toBeDefined();

      // Clean up
      databaseModule.closeDatabase();
    });
  });
});
