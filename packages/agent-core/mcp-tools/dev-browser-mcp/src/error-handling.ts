export function toAIFriendlyError(error: unknown, context: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes('strict mode violation')) {
    const countMatch = lowerMsg.match(/resolved to (\d+) elements/);
    const count = countMatch ? countMatch[1] : 'multiple';
    return new Error(
      `"${context}" matched ${count} elements. ` +
        `Use browser_snapshot() to get updated refs or a more specific selector.`,
    );
  }

  if (lowerMsg.includes('intercepts pointer events')) {
    return new Error(
      `"${context}" is blocked by an overlay. ` +
        `Try: 1) Dismiss the overlay, 2) Press Escape, 3) Click outside it. Then retry.`,
    );
  }

  if (lowerMsg.includes('not visible') && !lowerMsg.includes('timeout')) {
    return new Error(
      `"${context}" exists but is not visible. ` +
        `Try browser_scroll() to scroll it into view or browser_wait() to wait for it.`,
    );
  }

  if (lowerMsg.includes('waiting for') && lowerMsg.includes('timeout')) {
    return new Error(
      `"${context}" was not found within timeout. ` +
        `Run browser_snapshot() to see current elements on the page.`,
    );
  }

  if (
    lowerMsg.includes('target closed') ||
    lowerMsg.includes('session closed') ||
    lowerMsg.includes('page closed')
  ) {
    return new Error(
      `The page was closed unexpectedly. ` +
        `Use browser_navigate() to reload or browser_open_page() to open a new tab.`,
    );
  }

  if (lowerMsg.includes('econnrefused') || lowerMsg.includes('net::err_')) {
    return new Error(
      `Connection failed: ${message}. ` +
        `Verify the URL is accessible and try browser_navigate() again.`,
    );
  }

  return new Error(
    `${message}. Run browser_snapshot() to see the current page state before retrying.`,
    { cause: error },
  );
}
