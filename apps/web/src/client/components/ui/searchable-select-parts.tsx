/**
 * Internal sub-components for SearchableSelect.
 * Not intended for use outside searchable-select.tsx.
 */

import { motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';

export interface SelectItem {
  id: string;
  name: string;
}

export function ChevronIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function SelectTrigger({
  displayValue,
  placeholder,
  isOpen,
  error,
  testId,
  onClick,
  listboxId,
}: {
  displayValue: string;
  placeholder: string;
  isOpen: boolean;
  error?: boolean;
  testId?: string;
  onClick: () => void;
  listboxId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      aria-controls={listboxId}
      className={`w-full rounded-md border bg-background px-3 py-2.5 text-sm text-left flex items-center justify-between ${
        error ? 'border-destructive' : 'border-input'
      }`}
    >
      <span className={displayValue ? 'text-foreground' : 'text-muted-foreground'}>
        {displayValue || placeholder}
      </span>
      <ChevronIcon isOpen={isOpen} />
    </button>
  );
}

export function SelectOption({
  item,
  isSelected,
  onSelect,
  testId,
}: {
  item: SelectItem;
  isSelected: boolean;
  onSelect: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={testId ? `${testId}-option-${item.id}` : undefined}
      data-model-id={item.id}
      role="option"
      aria-selected={isSelected}
      className={`w-full px-3 py-2 text-sm text-left hover:bg-muted ${
        isSelected ? 'bg-muted font-medium' : ''
      }`}
    >
      {item.name}
    </button>
  );
}

export function SelectDropdown({
  items,
  value,
  showSearch,
  search,
  onSearchChange,
  searchPlaceholder,
  emptyMessage,
  onSelect,
  inputRef,
  testId,
  listboxId,
}: {
  items: SelectItem[];
  value: string | null;
  showSearch: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  emptyMessage: string;
  onSelect: (id: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  testId?: string;
  listboxId: string;
}) {
  return (
    <motion.div
      id={listboxId}
      role="listbox"
      className="absolute z-50 w-full mt-1 rounded-md border border-input bg-background shadow-lg"
      variants={settingsVariants.scaleDropdown}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={settingsTransitions.fast}
      style={{ transformOrigin: 'top' }}
      data-testid={testId ? `${testId}-dropdown` : undefined}
    >
      {showSearch && (
        <div className="p-2 border-b border-input">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      )}
      <div className="max-h-60 overflow-y-auto">
        {items.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">{emptyMessage}</div>
        ) : (
          items.map((item) => (
            <SelectOption
              key={item.id}
              item={item}
              isSelected={item.id === value}
              onSelect={() => onSelect(item.id)}
              testId={testId}
            />
          ))
        )}
      </div>
    </motion.div>
  );
}

export function SelectError({ message, testId }: { message: string; testId?: string }) {
  return (
    <p
      className="mt-2 text-sm text-destructive"
      data-testid={testId ? `${testId}-error` : undefined}
    >
      {message}
    </p>
  );
}

export function SelectLoading({
  label,
  loadingMessage,
}: {
  label: string;
  loadingMessage?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-foreground">{label}</label>
      <div className="flex items-center gap-2.5 rounded-md border border-input bg-background px-3 py-2.5">
        <svg className="h-4 w-4 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span className="text-sm text-muted-foreground">
          {loadingMessage || `Loading ${label.toLowerCase()}...`}
        </span>
      </div>
    </div>
  );
}
