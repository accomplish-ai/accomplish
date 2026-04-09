import { useState, useRef, useEffect, useId } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  SelectTrigger,
  SelectDropdown,
  SelectError,
  SelectLoading,
} from './searchable-select-parts';

export type { SelectItem } from './searchable-select-parts';

interface SearchableSelectProps {
  items: import('./searchable-select-parts').SelectItem[];
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
  const instanceId = useId();

  const listboxId = testId ? `${testId}-listbox` : `${instanceId}-listbox`;

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
          listboxId={listboxId}
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
              listboxId={listboxId}
            />
          )}
        </AnimatePresence>
      </div>
      {error && errorMessage && <SelectError message={errorMessage} testId={testId} />}
    </div>
  );
}
