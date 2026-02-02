/**
 * Unit tests for config-generator constants
 *
 * Tests the constants extracted from config-generator.ts for:
 * - ACCOMPLISH_AGENT_NAME
 * - NPM_PACKAGES
 * - PROVIDER_URLS
 * - MCP_SERVER_CONFIG
 * - ZAI_MODELS
 * - MCP_SERVERS
 * - PROVIDER_ID_TO_OPENCODE
 * - BASE_ENABLED_PROVIDERS
 *
 * @module config-generator/constants.unit.test
 */

import { describe, it, expect } from 'vitest';
import type { ProviderId } from '@accomplish/shared';
import {
  ACCOMPLISH_AGENT_NAME,
  NPM_PACKAGES,
  PROVIDER_URLS,
  MCP_SERVER_CONFIG,
  ZAI_MODELS,
  MCP_SERVERS,
  PROVIDER_ID_TO_OPENCODE,
  BASE_ENABLED_PROVIDERS,
} from '@main/opencode/config-generator/constants';

describe('config-generator constants', () => {
  describe('ACCOMPLISH_AGENT_NAME', () => {
    it('should be "accomplish"', () => {
      expect(ACCOMPLISH_AGENT_NAME).toBe('accomplish');
    });
  });

  describe('NPM_PACKAGES', () => {
    it('should map openai-compatible providers to @ai-sdk/openai-compatible', () => {
      expect(NPM_PACKAGES.ollama).toBe('@ai-sdk/openai-compatible');
      expect(NPM_PACKAGES.openrouter).toBe('@ai-sdk/openai-compatible');
      expect(NPM_PACKAGES.moonshot).toBe('@ai-sdk/openai-compatible');
      expect(NPM_PACKAGES.litellm).toBe('@ai-sdk/openai-compatible');
      expect(NPM_PACKAGES.zai).toBe('@ai-sdk/openai-compatible');
      expect(NPM_PACKAGES.lmstudio).toBe('@ai-sdk/openai-compatible');
      expect(NPM_PACKAGES['azure-foundry']).toBe('@ai-sdk/openai-compatible');
    });
  });

  describe('PROVIDER_URLS', () => {
    it('should have correct OpenRouter URL', () => {
      expect(PROVIDER_URLS.openrouter).toBe('https://openrouter.ai/api/v1');
    });

    it('should have correct Moonshot URL', () => {
      expect(PROVIDER_URLS.moonshot).toBe('https://api.moonshot.ai/v1');
    });

    it('should have correct Z.AI URLs for china and international', () => {
      expect(PROVIDER_URLS.zai.china).toBe('https://open.bigmodel.cn/api/paas/v4');
      expect(PROVIDER_URLS.zai.international).toBe('https://api.z.ai/api/coding/paas/v4');
    });
  });

  describe('MCP_SERVER_CONFIG', () => {
    it('should have TIMEOUT_MS of 30000', () => {
      expect(MCP_SERVER_CONFIG.TIMEOUT_MS).toBe(30000);
    });

    it('should have TYPE "local"', () => {
      expect(MCP_SERVER_CONFIG.TYPE).toBe('local');
    });

    it('should have ENABLED set to true', () => {
      expect(MCP_SERVER_CONFIG.ENABLED).toBe(true);
    });

    it('should have SOURCE_FILE for dev mode', () => {
      expect(MCP_SERVER_CONFIG.SOURCE_FILE).toBe('src/index.ts');
    });

    it('should have DIST_FILE for production mode', () => {
      expect(MCP_SERVER_CONFIG.DIST_FILE).toBe('dist/index.mjs');
    });
  });

  describe('ZAI_MODELS', () => {
    it('should include all 5 GLM models', () => {
      expect(Object.keys(ZAI_MODELS)).toHaveLength(5);
      expect(ZAI_MODELS['glm-4.7-flashx']).toBeDefined();
      expect(ZAI_MODELS['glm-4.7']).toBeDefined();
      expect(ZAI_MODELS['glm-4.7-flash']).toBeDefined();
      expect(ZAI_MODELS['glm-4.6']).toBeDefined();
      expect(ZAI_MODELS['glm-4.5-flash']).toBeDefined();
    });

    it('should have tools: true for all models', () => {
      for (const modelId of Object.keys(ZAI_MODELS)) {
        expect(ZAI_MODELS[modelId].tools).toBe(true);
      }
    });

    it('should have correct display names', () => {
      expect(ZAI_MODELS['glm-4.7-flashx'].name).toBe('GLM-4.7 FlashX (Latest)');
      expect(ZAI_MODELS['glm-4.7'].name).toBe('GLM-4.7');
      expect(ZAI_MODELS['glm-4.7-flash'].name).toBe('GLM-4.7 Flash');
      expect(ZAI_MODELS['glm-4.6'].name).toBe('GLM-4.6');
      expect(ZAI_MODELS['glm-4.5-flash'].name).toBe('GLM-4.5 Flash');
    });
  });

  describe('MCP_SERVERS', () => {
    it('should list all 5 MCP servers', () => {
      expect(MCP_SERVERS).toHaveLength(5);
      expect(MCP_SERVERS).toContain('file-permission');
      expect(MCP_SERVERS).toContain('ask-user-question');
      expect(MCP_SERVERS).toContain('dev-browser-mcp');
      expect(MCP_SERVERS).toContain('complete-task');
      expect(MCP_SERVERS).toContain('start-task');
    });
  });

  describe('PROVIDER_ID_TO_OPENCODE', () => {
    it('should map all 14 providers correctly', () => {
      expect(Object.keys(PROVIDER_ID_TO_OPENCODE)).toHaveLength(14);
    });

    it('should map standard providers to their names', () => {
      expect(PROVIDER_ID_TO_OPENCODE.anthropic).toBe('anthropic');
      expect(PROVIDER_ID_TO_OPENCODE.openai).toBe('openai');
      expect(PROVIDER_ID_TO_OPENCODE.google).toBe('google');
      expect(PROVIDER_ID_TO_OPENCODE.xai).toBe('xai');
      expect(PROVIDER_ID_TO_OPENCODE.deepseek).toBe('deepseek');
      expect(PROVIDER_ID_TO_OPENCODE.moonshot).toBe('moonshot');
      expect(PROVIDER_ID_TO_OPENCODE.ollama).toBe('ollama');
      expect(PROVIDER_ID_TO_OPENCODE.openrouter).toBe('openrouter');
      expect(PROVIDER_ID_TO_OPENCODE.litellm).toBe('litellm');
      expect(PROVIDER_ID_TO_OPENCODE.minimax).toBe('minimax');
      expect(PROVIDER_ID_TO_OPENCODE.lmstudio).toBe('lmstudio');
      expect(PROVIDER_ID_TO_OPENCODE['azure-foundry']).toBe('azure-foundry');
    });

    it('should map zai to zai-coding-plan', () => {
      expect(PROVIDER_ID_TO_OPENCODE.zai).toBe('zai-coding-plan');
    });

    it('should map bedrock to amazon-bedrock', () => {
      expect(PROVIDER_ID_TO_OPENCODE.bedrock).toBe('amazon-bedrock');
    });

    it('should have keys matching ProviderId type', () => {
      const providerIds: ProviderId[] = [
        'anthropic',
        'openai',
        'google',
        'xai',
        'deepseek',
        'moonshot',
        'zai',
        'bedrock',
        'azure-foundry',
        'ollama',
        'openrouter',
        'litellm',
        'minimax',
        'lmstudio',
      ];
      for (const id of providerIds) {
        expect(PROVIDER_ID_TO_OPENCODE[id]).toBeDefined();
      }
    });
  });

  describe('BASE_ENABLED_PROVIDERS', () => {
    it('should have 10 providers (not including ollama, lmstudio, litellm)', () => {
      expect(BASE_ENABLED_PROVIDERS).toHaveLength(10);
    });

    it('should include standard cloud providers', () => {
      expect(BASE_ENABLED_PROVIDERS).toContain('anthropic');
      expect(BASE_ENABLED_PROVIDERS).toContain('openai');
      expect(BASE_ENABLED_PROVIDERS).toContain('google');
      expect(BASE_ENABLED_PROVIDERS).toContain('xai');
      expect(BASE_ENABLED_PROVIDERS).toContain('deepseek');
      expect(BASE_ENABLED_PROVIDERS).toContain('moonshot');
      expect(BASE_ENABLED_PROVIDERS).toContain('minimax');
    });

    it('should include openrouter proxy provider', () => {
      expect(BASE_ENABLED_PROVIDERS).toContain('openrouter');
    });

    it('should include zai-coding-plan (not zai)', () => {
      expect(BASE_ENABLED_PROVIDERS).toContain('zai-coding-plan');
      expect(BASE_ENABLED_PROVIDERS).not.toContain('zai');
    });

    it('should include amazon-bedrock (not bedrock)', () => {
      expect(BASE_ENABLED_PROVIDERS).toContain('amazon-bedrock');
      expect(BASE_ENABLED_PROVIDERS).not.toContain('bedrock');
    });

    it('should NOT include local providers (ollama, lmstudio, litellm)', () => {
      expect(BASE_ENABLED_PROVIDERS).not.toContain('ollama');
      expect(BASE_ENABLED_PROVIDERS).not.toContain('lmstudio');
      expect(BASE_ENABLED_PROVIDERS).not.toContain('litellm');
    });
  });
});
