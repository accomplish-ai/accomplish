import type { Page, ElementHandle } from 'playwright';

export interface CompoundClickOptions {
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  delay?: number;
}

export async function handleCompoundClick(
  page: Page,
  element: ElementHandle,
  options: CompoundClickOptions = {},
): Promise<void> {
  await element.scrollIntoViewIfNeeded();
  await element.click({
    button: options.button ?? 'left',
    clickCount: options.clickCount ?? 1,
    delay: options.delay,
  });
}

export async function tryAutoReopen(
  page: Page,
  triggerRef: string | undefined,
  element: ElementHandle,
): Promise<void> {
  // If a trigger ref is specified, clicking the trigger may close a popup — reopen it
  if (!triggerRef) return;
  const isClosed = await page.evaluate(() => {
    const popup = document.querySelector('[role="listbox"], [role="menu"], [role="dialog"]');
    if (!popup) return true;
    const rects = popup.getClientRects();
    const style = window.getComputedStyle(popup as HTMLElement);
    const isHidden = style.visibility === 'hidden' || style.display === 'none';
    const bounds = (popup as HTMLElement).getBoundingClientRect();
    return rects.length === 0 || isHidden || bounds.width === 0 || bounds.height === 0;
  });
  if (isClosed) {
    try {
      await element.click();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes('Node is detached') ||
        msg.includes('Execution context was destroyed') ||
        msg.includes('navigation')
      ) {
        // Known transient error, suppress
      } else {
        console.warn('tryAutoReopen: element.click() failed:', error);
        throw error;
      }
    }
  }
}
