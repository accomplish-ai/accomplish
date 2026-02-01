/**
 * Test Local Agent Config Generator
 *
 * Generates an isolated OpenCode config for testing the local agent that doesn't
 * conflict with the main `pnpm dev` instance.
 *
 * Key differences from main config:
 * - Uses port 9226 for dev-browser HTTP (vs 9224)
 * - Uses port 9227 for Chrome CDP (vs 9225)
 * - Uses isolated Chrome profile at ~/.accomplish-test-local-agent-chrome
 * - Writes config to ~/.opencode/opencode-test-local-agent.json
 *
 * IMPORTANT: This uses the SAME agent configuration (system prompt, MCP servers)
 * as production via the shared-config module. Only ports and paths differ.
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

// Import shared config builder - this ensures test uses the SAME agent as production
import {
  buildOpenCodeConfig,
  createNpxTsxCommandResolver,
  type OpenCodeConfig,
} from '../src/main/opencode/shared-config';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Isolated ports for test local agent (avoid conflict with pnpm dev on 9224/9225)
const TEST_LOCAL_AGENT_HTTP_PORT = 9226;
const TEST_LOCAL_AGENT_CDP_PORT = 9227;
const TEST_LOCAL_AGENT_CHROME_PROFILE = path.join(os.homedir(), '.accomplish-test-local-agent-chrome');

// Permission API ports (same as main app - these don't conflict)
const PERMISSION_API_PORT = 3847;
const QUESTION_API_PORT = 3848;

/**
 * Get the skills directory path relative to this script
 */
function getSkillsPath(): string {
  // Script is at apps/desktop/scripts/test-local-agent-config.ts
  // Skills are at apps/desktop/skills/
  return path.resolve(__dirname, '..', 'skills');
}

/**
 * Generate isolated OpenCode config for test local agent
 *
 * This uses the SAME config structure as production (via shared-config module),
 * just with isolated ports and paths for testing.
 */
export function generateTestLocalAgentConfig(): string {
  const homeDir = os.homedir();
  const configDir = path.join(homeDir, '.opencode');
  const configPath = path.join(configDir, 'opencode-test-local-agent.json');

  // Ensure config directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Ensure isolated Chrome profile directory exists
  if (!fs.existsSync(TEST_LOCAL_AGENT_CHROME_PROFILE)) {
    fs.mkdirSync(TEST_LOCAL_AGENT_CHROME_PROFILE, { recursive: true });
  }

  const skillsPath = getSkillsPath();

  // Build config using the SAME shared config builder as production
  // Only differences: isolated ports and browser profile for testing
  const config: OpenCodeConfig = buildOpenCodeConfig({
    ports: {
      permissionApi: PERMISSION_API_PORT,
      questionApi: QUESTION_API_PORT,
      browserHttp: TEST_LOCAL_AGENT_HTTP_PORT,
      browserCdp: TEST_LOCAL_AGENT_CDP_PORT,
    },
    paths: {
      skillsPath,
      browserProfile: TEST_LOCAL_AGENT_CHROME_PROFILE,
    },
    commandResolver: createNpxTsxCommandResolver(skillsPath),
    // Use all default providers - API keys come from environment
    enabledProviders: ['anthropic', 'openai', 'google', 'xai', 'deepseek'],
  });

  const configJson = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, configJson);

  console.log('[test-local-agent] Config generated at:', configPath);
  console.log('[test-local-agent] Using ports:', { http: TEST_LOCAL_AGENT_HTTP_PORT, cdp: TEST_LOCAL_AGENT_CDP_PORT });
  console.log('[test-local-agent] Chrome profile:', TEST_LOCAL_AGENT_CHROME_PROFILE);
  console.log('[test-local-agent] Using SAME agent config as production (via shared-config)');

  return configPath;
}

// Export constants for use by CLI script
export { TEST_LOCAL_AGENT_HTTP_PORT, TEST_LOCAL_AGENT_CDP_PORT, TEST_LOCAL_AGENT_CHROME_PROFILE };

// Allow running directly (ES module check)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  generateTestLocalAgentConfig();
}
