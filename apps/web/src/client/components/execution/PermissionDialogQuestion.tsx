import { useEffect } from 'react';
import type { PermissionRequest } from '@accomplish_ai/agent-core';
import { cn } from '@/lib/utils';

interface PermissionDialogQuestionProps {
  permissionRequest: PermissionRequest;
  selectedOptions: string[];
  setSelectedOptions: (opts: string[]) => void;
  customResponse: string;
  setCustomResponse: (v: string) => void;
  onSubmit: () => void;
}

export function PermissionDialogQuestion({
  permissionRequest,
  selectedOptions,
  setSelectedOptions,
  customResponse,
  setCustomResponse,
  onSubmit,
}: PermissionDialogQuestionProps) {
  useEffect(() => {
    setSelectedOptions([]);
    setCustomResponse('');
  }, [permissionRequest, setCustomResponse, setSelectedOptions]);

  return (
    <>
      <p className="text-sm text-foreground mb-4">{permissionRequest.question}</p>

      {permissionRequest.options && permissionRequest.options.length > 0 && (
        <div className="mb-4 space-y-2">
          {permissionRequest.options
            .filter((opt) => opt.label.toLowerCase() !== 'other')
            .map((option, idx) => (
              <button
                key={idx}
                type="button"
                aria-pressed={selectedOptions.includes(option.label)}
                onClick={() => {
                  setCustomResponse('');
                  if (permissionRequest.multiSelect) {
                    setSelectedOptions(
                      selectedOptions.includes(option.label)
                        ? selectedOptions.filter((o) => o !== option.label)
                        : [...selectedOptions, option.label],
                    );
                  } else {
                    setSelectedOptions([option.label]);
                  }
                }}
                className={cn(
                  'w-full text-left p-3 rounded-lg border transition-colors',
                  selectedOptions.includes(option.label)
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50',
                )}
              >
                <div className="font-medium text-sm">{option.label}</div>
                {option.description && (
                  <div className="text-xs text-muted-foreground mt-1">{option.description}</div>
                )}
              </button>
            ))}
        </div>
      )}

      {permissionRequest.options && permissionRequest.options.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or type your own</span>
          <div className="flex-1 h-px bg-border" />
        </div>
      )}

      <div className="mb-4">
        <textarea
          value={customResponse}
          onChange={(e) => {
            setSelectedOptions([]);
            setCustomResponse(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          placeholder="Enter a different option..."
          aria-label="Custom response"
          maxLength={10000}
          rows={1}
          className="w-full resize-none overflow-hidden rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          style={{ minHeight: '38px', maxHeight: '150px' }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) {
              return;
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && customResponse.trim()) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
      </div>
    </>
  );
}
