import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';

export interface SelectItem {
  id: string;
  name: string;
}

function ChevronIcon({ isOpen }: { isOpen: boolean }) {
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

function SelectTrigger({
  displayValue,
  placeholder,
  isOpen,
  error,
  testId,
  onClick,
}: {
  displayValue: string;
  placeholder: string;
  isOpen: boolean;
  error?: boolean;
  testId?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
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

function SelectOption({
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
      className={`w-full px-3 py-2 text-sm text-left hover:bg-muted ${
        isSelected ? 'bg-muted font-medium' : ''
      }`}
    >
      {item.name}
    </button>
  );
}

function SelectDropdown({
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
}) {
  return (
    <motion.div
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

function SelectError({ message, testId }: { message: string; testId?: string }) {
  return (
    <p
      className="mt-2 text-sm text-destructive"
      data-testid={testId ? `${testId}-error` : undefined}
    >
      {message}
    </p>
  );
}

function SelectLoading({ label, loadingMessage }: { label: string; loadingMessage?: string }) {
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

interface SearchableSelectProps {
  items: SelectItem[];
  value: string | null;
  onChange: (id: string) => void;
  label: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loading?: boolean;
  loadingMessage?: string;
  error?: boolean;
  errorMessage?: string;
  testId?: string;
}

export function SearchableSelect({
  items,
  value,
  onChange,
  label,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No items found',
  loading,
  loadingMessage,
  error,
  errorMessage,
  testId,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showSearch = items.length > 10;

  const filteredItems = search
    ? items.filter(
        (item) =>
          item.name.toLowerCase().includes(search.toLowerCase()) ||
          item.id.toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  const selectedItem = items.find((item) => item.id === value);
  const displayValue = selectedItem?.name || '';

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

  useEffect(() => {
    if (isOpen && showSearch && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, showSearch]);

  if (loading) {
    return <SelectLoading label={label} loadingMessage={loadingMessage} />;
  }

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef}>
      <label className="mb-2 block text-sm font-medium text-foreground">{label}</label>
      <div className="relative">
        <SelectTrigger
          displayValue={displayValue}
          placeholder={placeholder}
          isOpen={isOpen}
          error={error}
          testId={testId}
          onClick={() => setIsOpen(!isOpen)}
        />
        <AnimatePresence>
          {isOpen && (
            <SelectDropdown
              items={filteredItems}
              value={value}
              showSearch={showSearch}
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder={searchPlaceholder}
              emptyMessage={emptyMessage}
              onSelect={handleSelect}
              inputRef={inputRef}
              testId={testId}
            />
          )}
        </AnimatePresence>
      </div>
      {error && errorMessage && <SelectError message={errorMessage} testId={testId} />}
    </div>
  );
}
