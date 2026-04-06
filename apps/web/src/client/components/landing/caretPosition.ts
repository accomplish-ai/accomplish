/**
 * Calculate the visual position of a character in a textarea via an off-screen mirror.
 * Extracted from SlashCommandPopover to keep the component under 200 lines.
 */

const MIRRORED_PROPERTIES = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'padding',
  'paddingTop',
  'paddingLeft',
  'paddingRight',
  'paddingBottom',
  'border',
  'borderWidth',
  'boxSizing',
  'whiteSpace',
  'wordWrap',
  'wordBreak',
  'overflowWrap',
] as const;

export function getCaretPosition(textarea: HTMLTextAreaElement, charIndex: number) {
  const mirror = document.createElement('div');
  const style = window.getComputedStyle(textarea);

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.overflow = 'hidden';

  for (const prop of MIRRORED_PROPERTIES) {
    mirror.style.setProperty(
      prop.replace(/([A-Z])/g, '-$1').toLowerCase(),
      style.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase()),
    );
  }

  const textBefore = textarea.value.substring(0, charIndex);
  const textNode = document.createTextNode(textBefore);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';

  mirror.appendChild(textNode);
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();

  const top = markerRect.top - mirrorRect.top - textarea.scrollTop;
  const left = markerRect.left - mirrorRect.left;

  document.body.removeChild(mirror);

  return { top, left };
}
