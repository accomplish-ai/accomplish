// apps/desktop/src/renderer/components/settings/shared/SearchableSelect.tsx

import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';

export interface SelectOption {
  id: string;
  name: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Threshold to show search input (default: 10) */
  searchThreshold?: number;
  /** Always show search input regardless of option count */
  alwaysShowSearch?: boolean;
  testId?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  label,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found',
  searchThreshold = 10,
  alwaysShowSearch = false,
  testId,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showSearch = alwaysShowSearch || options.length > searchThreshold;

  // Filter options based on search term
  const filteredOptions = search
    ? options.filter(
        (opt) =>
          opt.name.toLowerCase().includes(search.toLowerCase()) ||
          opt.id.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  // Get display name for selected value
  const selectedOption = options.find((opt) => opt.id === value);
  const displayValue = selectedOption?.name || selectedOption?.id || '';

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && showSearch && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, showSearch]);

  // For small option lists without search, use simple select
  if (!showSearch) {
    return (
      <div>
        {label && <label className="mb-2 block text-sm font-medium text-foreground">{label}</label>}
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            data-testid={testId}
            className="w-full appearance-none rounded-md border border-input bg-background pl-3 pr-10 py-2.5 text-sm"
          >
            {!value && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    );
  }

  // For large option lists, use searchable dropdown
  return (
    <div ref={containerRef}>
      {label && <label className="mb-2 block text-sm font-medium text-foreground">{label}</label>}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          data-testid={testId}
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-left flex items-center justify-between"
        >
          <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
            {displayValue || placeholder}
          </span>
          <svg
            className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              className="absolute z-50 w-full mt-1 rounded-md border border-input bg-background shadow-lg"
              variants={settingsVariants.scaleDropdown}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.fast}
              style={{ transformOrigin: 'top' }}
            >
              {/* Search input */}
              <div className="p-2 border-b border-input">
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              {/* Options list */}
              <div className="max-h-60 overflow-y-auto">
                {filteredOptions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">{emptyMessage}</div>
                ) : (
                  filteredOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        onChange(option.id);
                        setIsOpen(false);
                        setSearch('');
                      }}
                      className={`w-full px-3 py-2 text-sm text-left hover:bg-muted ${
                        option.id === value ? 'bg-muted font-medium' : ''
                      }`}
                    >
                      {option.name}
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
