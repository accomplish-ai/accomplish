import { describe, it, expect } from 'vitest';
import { getElementPriority, ROLE_PRIORITIES, truncateElements, type TruncatableElement } from './priority';

describe('priority scoring', () => {
  describe('getElementPriority', () => {
    it('should score buttons highest', () => {
      const score = getElementPriority('button', true);
      expect(score).toBe(150); // 100 base + 50 viewport bonus
    });

    it('should score textbox high', () => {
      const score = getElementPriority('textbox', true);
      expect(score).toBe(145); // 95 base + 50 viewport bonus
    });

    it('should give viewport bonus', () => {
      const inViewport = getElementPriority('link', true);
      const outViewport = getElementPriority('link', false);
      expect(inViewport - outViewport).toBe(50);
    });

    it('should default unknown roles to 50', () => {
      const score = getElementPriority('unknown-role', false);
      expect(score).toBe(50);
    });

    it('should score navigation lower than primary inputs', () => {
      const navigation = getElementPriority('navigation', false);
      const button = getElementPriority('button', false);
      expect(button).toBeGreaterThan(navigation);
    });
  });

  describe('ROLE_PRIORITIES', () => {
    it('should define priorities for all interactive roles', () => {
      const interactiveRoles = [
        'button', 'link', 'textbox', 'checkbox', 'radio',
        'combobox', 'listbox', 'option', 'tab', 'menuitem',
      ];
      for (const role of interactiveRoles) {
        expect(ROLE_PRIORITIES[role]).toBeDefined();
        expect(ROLE_PRIORITIES[role]).toBeGreaterThan(0);
      }
    });
  });
});

describe('truncateElements', () => {
  const createElements = (count: number, role = 'button', inViewport = true): TruncatableElement[] => {
    return Array.from({ length: count }, (_, i) => ({
      ref: `e${i + 1}`,
      role,
      name: `Element ${i + 1}`,
      inViewport,
    }));
  };

  it('should return all elements when under limit', () => {
    const elements = createElements(5);
    const result = truncateElements(elements, { maxElements: 10 });
    expect(result.elements).toHaveLength(5);
    expect(result.truncated).toBe(false);
  });

  it('should truncate to maxElements', () => {
    const elements = createElements(100);
    const result = truncateElements(elements, { maxElements: 50 });
    expect(result.elements).toHaveLength(50);
    expect(result.truncated).toBe(true);
    expect(result.totalElements).toBe(100);
  });

  it('should prioritize viewport elements', () => {
    const inViewport = createElements(5, 'button', true);
    const outViewport = createElements(5, 'button', false);
    const mixed = [...outViewport, ...inViewport]; // Out of viewport first

    const result = truncateElements(mixed, { maxElements: 5 });

    // Should keep all viewport elements
    expect(result.elements.every(e => e.inViewport)).toBe(true);
  });

  it('should prioritize by role', () => {
    const buttons = createElements(3, 'button', false);
    const links = createElements(3, 'link', false);
    const navs = createElements(3, 'navigation', false);
    const mixed = [...navs, ...links, ...buttons]; // Lowest priority first

    const result = truncateElements(mixed, { maxElements: 3 });

    // Should keep buttons (highest priority)
    expect(result.elements.every(e => e.role === 'button')).toBe(true);
  });

  it('should return metadata about truncation', () => {
    const elements = createElements(100);
    const result = truncateElements(elements, { maxElements: 30 });

    expect(result.totalElements).toBe(100);
    expect(result.includedElements).toBe(30);
    expect(result.truncated).toBe(true);
  });
});
