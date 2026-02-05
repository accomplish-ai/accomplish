export interface TruncatableElement {
  ref: string;
  role: string;
  name: string;
  inViewport: boolean;
  [key: string]: unknown;
}

export interface TruncateOptions {
  maxElements?: number;
}

export interface TruncateResult<T extends TruncatableElement> {
  elements: T[];
  totalElements: number;
  includedElements: number;
  truncated: boolean;
}

export const ROLE_PRIORITIES: Record<string, number> = {
  button: 100,
  textbox: 95,
  searchbox: 95,
  checkbox: 90,
  radio: 90,
  switch: 90,
  combobox: 85,
  listbox: 85,
  slider: 85,
  spinbutton: 85,
  link: 80,
  tab: 75,
  menuitem: 70,
  menuitemcheckbox: 70,
  menuitemradio: 70,
  option: 70,
  navigation: 60,
  menu: 60,
  tablist: 55,
  form: 50,
  dialog: 50,
  alertdialog: 50,
};

const VIEWPORT_BONUS = 50;
const DEFAULT_PRIORITY = 50;

export function getElementPriority(role: string, inViewport: boolean): number {
  const basePriority = ROLE_PRIORITIES[role] ?? DEFAULT_PRIORITY;
  return inViewport ? basePriority + VIEWPORT_BONUS : basePriority;
}

export function truncateElements<T extends TruncatableElement>(
  elements: T[],
  options: TruncateOptions
): TruncateResult<T> {
  const maxElements = options.maxElements ?? 300;
  const totalElements = elements.length;

  if (totalElements <= maxElements) {
    return {
      elements,
      totalElements,
      includedElements: totalElements,
      truncated: false,
    };
  }

  const scored = elements.map(element => ({
    element,
    score: getElementPriority(element.role, element.inViewport),
  }));

  scored.sort((a, b) => b.score - a.score);

  const truncatedElements = scored.slice(0, maxElements).map(s => s.element);

  return {
    elements: truncatedElements,
    totalElements,
    includedElements: maxElements,
    truncated: true,
  };
}
