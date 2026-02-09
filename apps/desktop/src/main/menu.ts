/**
 * Application Menu Configuration for WaIA
 *
 * Creates the application menu with Spanish labels
 */

import { Menu, MenuItemConstructorOptions, app, shell, dialog, BrowserWindow } from 'electron';
import path from 'path';

/**
 * Build the application menu with Spanish labels
 */
export function buildMenu(): Menu {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Nueva Tarea',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            // Send IPC event to create new task
            const mainWindow = getMainWindow();
            if (mainWindow) {
              mainWindow.webContents.send('menu-new-task');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Configuración',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            const mainWindow = getMainWindow();
            if (mainWindow) {
              mainWindow.webContents.send('menu-open-settings');
            }
          },
        },
        { type: 'separator' },
        { role: 'close', label: 'Cerrar' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'forceReload', label: 'Forzar recarga' },
        { role: 'toggleDevTools', label: 'Alternar herramientas de desarrollo' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Restablecer zoom' },
        { role: 'zoomIn', label: 'Ampliar' },
        { role: 'zoomOut', label: 'Reducir' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
      ],
    },
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        { role: 'zoom', label: 'Zoom' },
        { type: 'separator' },
        { role: 'front', label: 'Traer al frente' },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Acerca de WaIA',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'Acerca de WaIA',
              message: 'WaIA',
              detail: `Asistente de escritorio potenciado por IA\n\nVersión: ${app.getVersion()}\n\nWaIA es un asistente de escritorio de código abierto que automatiza la gestión de archivos, creación de documentos y tareas del navegador localmente en tu máquina.`,
            });
          },
        },
        {
          label: 'Más información',
          click: async () => {
            await shell.openExternal('https://github.com/jivagrisma/clone-Openwork');
          },
        },
      ],
    },
  ];

  // macOS specific adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: 'WaIA',
      submenu: [
        { role: 'about', label: 'Acerca de WaIA' },
        { type: 'separator' },
        { role: 'services', label: 'Servicios' },
        { type: 'separator' },
        { role: 'hide', label: 'Ocultar WaIA' },
        { role: 'hideOthers', label: 'Ocultar demás' },
        { role: 'unhide', label: 'Mostrar todos' },
        { type: 'separator' },
        { role: 'quit', label: 'Salir de WaIA' },
      ],
    });

    // Remove Window submenu on macOS (it's in the app menu)
    template.splice(4, 1);
  }

  return Menu.buildFromTemplate(template);
}

/**
 * Get the main window instance
 */
function getMainWindow(): BrowserWindow | undefined {
  const windows = BrowserWindow.getAllWindows();
  return windows.find((w: BrowserWindow) => w.getTitle() === 'WaIA') || windows[0];
}
