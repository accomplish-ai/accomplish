import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converts a string to Title Case.
 *
 * - Splits by space, hyphen, or underscore.
 * - Capitalizes the first letter of every word.
 * - Lowercases the rest of the word.
 *
 * @param input - The raw string to format.
 * @returns The formatted Title Case string.
 */
export function toTitleCase(input: string): string {
  if (!input) return "";

  return input
      .toLowerCase()
      .split(/[\s-_]+/) // Split on spaces, hyphens, or underscores
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
};
