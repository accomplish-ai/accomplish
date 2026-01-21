import { ipcMain } from 'electron';
import type { CustomSkillConfig } from '@accomplish/shared';
import { getCustomSkills, setCustomSkills } from '../store/appSettings';
import { generateOpenCodeConfig } from '../opencode/config-generator';

/**
 * Register skills-related IPC handlers
 */
export function registerSkillsHandlers(): void {
    // Get custom skills
    ipcMain.handle('settings:getCustomSkills', async () => {
        return getCustomSkills();
    });

    // Save custom skills
    ipcMain.handle('settings:saveCustomSkills', async (_event, skills: CustomSkillConfig[]) => {
        // Validate input (basic check)
        if (!Array.isArray(skills)) {
            throw new Error('Invalid skills configuration: must be an array');
        }

        // Save to store
        setCustomSkills(skills);

        // Regenerate OpenCode config to apply changes
        await generateOpenCodeConfig();

        return skills;
    });
}
