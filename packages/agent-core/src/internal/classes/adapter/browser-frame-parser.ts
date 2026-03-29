import type { BrowserFramePayload } from '../../../common/types/browser-view.js';

/**
 * Parse browser-frame JSON lines from PTY output.
 *
 * Lines matching `{ type: "browser-frame", frame: "...", pageName: "..." }` are
 * extracted and delivered via `onFrame`. All other lines pass through unchanged.
 *
 * Incomplete trailing lines are buffered across calls.
 *
 * Contributed by samarthsinh2660 (PR #414) for ENG-695.
 */
export function parseBrowserFrames(
  data: string,
  buffer: string,
  onFrame: (payload: BrowserFramePayload) => void,
): { output: string; buffer: string } {
  try {
    const combined = `${buffer}${data}`;
    const lines = combined.split('\n');
    // Keep the incomplete trailing chunk for the next call
    const newBuffer = lines.pop() ?? '';

    const passthrough: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        passthrough.push(line);
        continue;
      }

      let isBrowserFrame = false;
      try {
        const parsed = JSON.parse(trimmed) as {
          type?: string;
          frame?: string;
          pageName?: string;
          timestamp?: number;
        };
        if (parsed.type === 'browser-frame' && parsed.frame && parsed.pageName) {
          onFrame({
            pageName: parsed.pageName,
            frame: parsed.frame,
            timestamp: parsed.timestamp ?? Date.now(),
          });
          isBrowserFrame = true;
        }
      } catch {
        // Not JSON or not a browser-frame — pass through as-is
      }

      if (!isBrowserFrame) {
        passthrough.push(line);
      }
    }

    return { output: passthrough.join('\n'), buffer: newBuffer };
  } catch {
    // Ignore errors in frame detection to avoid breaking the main data path
    return { output: data, buffer };
  }
}
