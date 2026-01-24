// apps/desktop/src/renderer/components/settings/shared/ModelSelector.tsx

import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Model {
  id: string;
  name: string;
}

interface ModelSelectorProps {
  models: Model[];
  value: string | null;
  onChange: (modelId: string) => void;
  loading?: boolean;
  error?: boolean;
  errorMessage?: string;
  placeholder?: string;
}

export function ModelSelector({
  models,
  value,
  onChange,
  loading,
  error,
  errorMessage = 'Please select a model',
  placeholder = 'Select model...',
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Show search functionality when there are many models (e.g., OpenRouter)
  const showSearch = models.length > 10;

  // Filter models based on search term
  const filteredModels = search
    ? models.filter((m) =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.id.toLowerCase().includes(search.toLowerCase())
      )
    : models;

  // Get display name for selected value
  const selectedModel = models.find((m) => m.id === value);
  const displayValue = selectedModel?.name || '';
  const handleValueChange = (nextValue: string | null) => {
    if (!nextValue) return;
    onChange(nextValue);
  };

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

  if (loading) {
    return (
      <div className="h-10 animate-pulse rounded-md bg-muted" />
    );
  }

  // For small model lists, use simple select
  if (!showSearch) {
    return (
      <div className="grid gap-2">
        <Label>Model</Label>
        <Select value={value || ''} onValueChange={handleValueChange}>
          <SelectTrigger
            className="w-full"
            aria-invalid={error && !value ? true : undefined}
            data-testid="model-selector"
          >
            <SelectValue placeholder={placeholder}>{displayValue}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && !value && (
          <p className="text-sm text-destructive" data-testid="model-selector-error">
            {errorMessage}
          </p>
        )}
      </div>
    );
  }

  // For large model lists, use searchable dropdown
  return (
    <div ref={containerRef} className="grid gap-2">
      <Label>Model</Label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          data-testid="model-selector"
          aria-invalid={error && !value ? true : undefined}
          className={`w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm text-left flex items-center justify-between ${
            error ? 'border-destructive' : 'border-input'
          }`}
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
                <Input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search models..."
                  className="h-8"
                />
              </div>

              {/* Model list */}
              <div className="max-h-60 overflow-y-auto">
                {filteredModels.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No models found</div>
                ) : (
                  filteredModels.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        onChange(model.id);
                        setIsOpen(false);
                        setSearch('');
                      }}
                      className={`w-full px-3 py-2 text-sm text-left hover:bg-muted ${
                        model.id === value ? 'bg-muted font-medium' : ''
                      }`}
                    >
                      {model.name}
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {error && !value && (
        <p className="text-sm text-destructive" data-testid="model-selector-error">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
