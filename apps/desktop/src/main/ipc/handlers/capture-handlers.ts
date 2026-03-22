import { BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { getStorage } from '../../store/storage';
import { handle, assertTrustedWindow } from './utils';

export function registerCaptureHandlers(): void {
  const storage = getStorage();

  const assertDebugModeEnabled = () => {
    if (!storage.getDebugMode()) {
      throw new Error('Debug mode is disabled');
    }
  };

  handle('debug:capture-screenshot', async (event: IpcMainInvokeEvent) => {
    try {
      assertDebugModeEnabled();
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
    let window: BrowserWindow;
    try {
      window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Untrusted window';
      return { success: false, error: message };
    }
    try {
      const image = await window.webContents.capturePage();
      const pngBuffer = image.toPNG();
      const base64 = pngBuffer.toString('base64');
      const size = image.getSize();
      return { success: true, data: base64, width: size.width, height: size.height };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  handle('debug:capture-axtree', async (event: IpcMainInvokeEvent) => {
    try {
      assertDebugModeEnabled();
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
    let window: BrowserWindow;
    try {
      window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Untrusted window';
      return { success: false, error: message };
    }
    try {
      const axtree = await window.webContents.executeJavaScript(`
        (function() {
          var MAX_DEPTH = 15;
          var MAX_TEXT = 200;
          var MAX_NODES = 5000;
          var nodeCount = 0;
          function walk(el, depth) {
            if (depth > MAX_DEPTH || nodeCount >= MAX_NODES) return null;
            nodeCount++;
            var tag = el.tagName ? el.tagName.toLowerCase() : '#text';
            var node = { tag: tag };
            var role = el.getAttribute ? el.getAttribute('role') : null;
            if (role) node.role = role;
            var ariaLabel = el.getAttribute ? el.getAttribute('aria-label') : null;
            if (ariaLabel) node.ariaLabel = ariaLabel.substring(0, MAX_TEXT);
            if (el.id) node.id = el.id;
            var text = '';
            for (var i = 0; i < el.childNodes.length; i++) {
              if (el.childNodes[i].nodeType === 3) {
                text += el.childNodes[i].textContent;
              }
            }
            text = text.trim();
            if (text) node.text = text.substring(0, MAX_TEXT);
            var children = [];
            for (var j = 0; j < el.children.length; j++) {
              var child = walk(el.children[j], depth + 1);
              if (child) children.push(child);
            }
            if (children.length > 0) node.children = children;
            return node;
          }
          if (!document.body) return '{}';
          return JSON.stringify(walk(document.body, 0));
        })()
      `);
      return { success: true, data: axtree };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });
}
