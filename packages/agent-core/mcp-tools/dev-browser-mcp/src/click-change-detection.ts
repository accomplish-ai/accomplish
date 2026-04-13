import type { Page } from 'playwright';

export interface ClickChangeResult {
  changed: boolean;
  addedNodes: number;
  removedNodes: number;
  urlChanged: boolean;
  newUrl?: string;
}

export async function detectChangesAfterClick(
  page: Page,
  clickFn: () => Promise<void>,
  timeoutMs = 2000,
): Promise<ClickChangeResult> {
  const urlBefore = page.url();

  const observerScript = () => {
    const result = { addedNodes: 0, removedNodes: 0 };
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        result.addedNodes += m.addedNodes.length;
        result.removedNodes += m.removedNodes.length;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    (window as unknown as Record<string, unknown>).__clickObserver = { observer, result };
  };

  await page.evaluate(observerScript);
  let mutationResult: { addedNodes: number; removedNodes: number } = {
    addedNodes: 0,
    removedNodes: 0,
  };
  try {
    await clickFn();
    await page.waitForTimeout(timeoutMs);
  } finally {
    mutationResult = await page
      .evaluate(() => {
        const state = (window as unknown as Record<string, unknown>).__clickObserver as
          | { observer: MutationObserver; result: { addedNodes: number; removedNodes: number } }
          | undefined;
        if (state) {
          state.observer.disconnect();
        }
        delete (window as unknown as Record<string, unknown>).__clickObserver;
        return state?.result ?? { addedNodes: 0, removedNodes: 0 };
      })
      .catch(() => ({ addedNodes: 0, removedNodes: 0 }));
  }

  const urlAfter = page.url();
  const urlChanged = urlAfter !== urlBefore;

  return {
    changed: mutationResult.addedNodes > 0 || mutationResult.removedNodes > 0 || urlChanged,
    addedNodes: mutationResult.addedNodes,
    removedNodes: mutationResult.removedNodes,
    urlChanged,
    newUrl: urlChanged ? urlAfter : undefined,
  };
}
