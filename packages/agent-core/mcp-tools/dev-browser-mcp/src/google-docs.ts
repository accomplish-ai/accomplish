import type { Page } from 'playwright';

export const EMULATED_WIDTH = 1280;
export const EMULATED_HEIGHT = 720;

const WORKSPACE_EDITOR_PATTERNS = [
  /docs\.google\.com\/document/,
  /docs\.google\.com\/spreadsheets/,
  /docs\.google\.com\/presentation/,
  /sheets\.google\.com/,
  /slides\.google\.com/,
];

export function isGoogleWorkspaceEditorUrl(url: string): boolean {
  return WORKSPACE_EDITOR_PATTERNS.some((p) => p.test(url));
}

export function getGoogleWorkspaceBodyTypingHint(url: string): string | null {
  if (/docs\.google\.com\/document/.test(url))
    return 'Click in the document body first, then type.';
  if (/sheets\.google\.com/.test(url) || /docs\.google\.com\/spreadsheets/.test(url)) {
    return 'Click a cell first, then type.';
  }
  if (/slides\.google\.com/.test(url) || /docs\.google\.com\/presentation/.test(url)) {
    return 'Click a text box first, then type.';
  }
  return null;
}

export async function hasVisibleGoogleWorkspaceTypingOverlay(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const overlay = document.querySelector('.docs-texteventtarget-iframe');
    if (!overlay) return false;
    const rect = (overlay as HTMLElement).getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

export async function dismissGoogleWorkspaceTypingOverlay(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
}

export async function getGoogleDocsElementType(
  page: Page,
  element: import('playwright').ElementHandle,
): Promise<string> {
  const tag = await element.evaluate((el) => (el as HTMLElement).tagName.toLowerCase());
  const role = await element.getAttribute('role');
  return role || tag;
}

export async function typeViaKeyboard(page: Page, text: string, delay = 20): Promise<void> {
  for (const char of text) {
    await page.keyboard.type(char, { delay });
  }
}

export async function focusGoogleWorkspaceEditorBody(page: Page): Promise<void> {
  await page.mouse.click(EMULATED_WIDTH / 2, EMULATED_HEIGHT / 2);
}

export async function hasFocusedGoogleWorkspaceTextInput(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName.toLowerCase();
    return (
      tag === 'textarea' ||
      tag === 'input' ||
      (active as HTMLElement).contentEditable === 'true' ||
      active.closest('[contenteditable="true"]') !== null
    );
  });
}
