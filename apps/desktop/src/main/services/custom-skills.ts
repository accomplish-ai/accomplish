import type { CustomSkillConfig, McpServerConfig } from '@accomplish/shared';
import { getCustomSkills } from '../store/appSettings';

/**
 * Convert internal CustomSkillConfig to OpenCode McpServerConfig
 */
export function toMcpServerConfig(skill: CustomSkillConfig): McpServerConfig {
    const env: Record<string, string> = { ...skill.env };

    // For stdio type, we verify the command exists in the command array
    const command = [skill.command, ...skill.args];

    return {
        type: 'local',
        command,
        enabled: skill.enabled,
        environment: env,
        // Default timeouts for custom skills can be adjusted if needed
        timeout: 30000,
    };
}

/**
 * Get all custom skills as OpenCode MCP configuration map
 */
export function getCustomSkillsConfig(): Record<string, McpServerConfig> {
    const customSkills = getCustomSkills();
    const mcpConfig: Record<string, McpServerConfig> = {};

    for (const skill of customSkills) {
        if (!skill.enabled) continue;

        // Create a safe key for the MCP map (sanitize name)
        // We replace any non-alphanumeric character with underscore to ensure valid tool names
        // e.g. "YouTube Music (Local)" -> "youtube_music_local"
        let safeName = skill.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, ''); // Trim leading/trailing underscores

        // Fallback if name becomes empty or to ensure uniqueness if needed (though collision is rare for user config)
        if (!safeName) {
            safeName = `custom_${skill.id.replace(/-/g, '_')}`;
        }

        // Handle potential collisions by appending a short hash from ID if the key already exists
        if (mcpConfig[safeName]) {
            safeName = `${safeName}_${skill.id.substring(0, 4)}`;
        }

        mcpConfig[safeName] = toMcpServerConfig(skill);
    }

    return mcpConfig;
}
