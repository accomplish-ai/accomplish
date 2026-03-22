import { BrowserWindow, dialog, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { skillsManager } from '../../skills';
import { handle } from './utils';

export function registerSkillsHandlers(): void {
  handle('skills:list', async () => {
    return skillsManager.getAll();
  });

  handle('skills:list-enabled', async () => {
    return skillsManager.getEnabled();
  });

  handle('skills:set-enabled', async (_event: IpcMainInvokeEvent, id: string, enabled: boolean) => {
    await skillsManager.setEnabled(id, enabled);
  });

  handle('skills:get-content', async (_event: IpcMainInvokeEvent, id: string) => {
    return skillsManager.getContent(id);
  });

  handle('skills:get-user-skills-path', async () => {
    return skillsManager.getUserSkillsPath();
  });

  handle('skills:pick-file', async (event: IpcMainInvokeEvent) => {
    const mainWindow =
      BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select a SKILL.md file',
      filters: [
        { name: 'Skill Files', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  handle('skills:add-from-file', async (_event: IpcMainInvokeEvent, filePath: string) => {
    return skillsManager.addFromFile(filePath);
  });

  handle('skills:add-from-github', async (_event: IpcMainInvokeEvent, rawUrl: string) => {
    return skillsManager.addFromGitHub(rawUrl);
  });

  handle('skills:delete', async (_event: IpcMainInvokeEvent, id: string) => {
    await skillsManager.delete(id);
  });

  handle('skills:resync', async () => {
    await skillsManager.resync();
    return skillsManager.getAll();
  });

  handle('skills:open-in-editor', async (_event: IpcMainInvokeEvent, filePath: string) => {
    const error = await shell.openPath(filePath);
    if (error) {
      throw new Error(`Failed to open path in editor: ${error}`);
    }
  });

  handle('skills:show-in-folder', async (_event: IpcMainInvokeEvent, filePath: string) => {
    shell.showItemInFolder(filePath);
  });
}
