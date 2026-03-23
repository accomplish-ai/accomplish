import { useState } from 'react';
import { motion } from 'framer-motion';
import { springs } from '../../lib/animations';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangle, AlertCircle, File, Brain, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

function getOperationBadgeClasses(operation?: string): string {
  switch (operation) {
    case 'delete':
      return 'bg-red-500/10 text-red-600';
    case 'overwrite':
      return 'bg-orange-500/10 text-orange-600';
    case 'modify':
      return 'bg-yellow-500/10 text-yellow-600';
    case 'create':
      return 'bg-green-500/10 text-green-600';
    case 'rename':
    case 'move':
      return 'bg-blue-500/10 text-blue-600';
    default:
      return 'bg-gray-500/10 text-gray-600';
  }
}

function isDeleteOperation(request: { type: string; fileOperation?: string }): boolean {
  return request.type === 'file' && request.fileOperation === 'delete';
}

function getDisplayFilePaths(request: { filePath?: string; filePaths?: string[] }): string[] {
  if (request.filePaths && request.filePaths.length > 0) {
    return request.filePaths;
  }
  if (request.filePath) {
    return [request.filePath];
  }
  return [];
}

import type { PermissionRequest } from '@accomplish_ai/agent-core/common';

interface PermissionDialogProps {
  permissionRequest: PermissionRequest;
  onRespond: (allowed: boolean, selectedOptions?: string[], customText?: string) => void;
}

export function PermissionDialog({ permissionRequest, onRespond }: PermissionDialogProps) {
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [customResponse, setCustomResponse] = useState('');

  const handleRespond = (allowed: boolean) => {
    const isQuestion = permissionRequest.type === 'question';
    const hasCustomText = isQuestion && customResponse.trim();
    onRespond(
      allowed,
      isQuestion ? (hasCustomText ? [] : selectedOptions) : undefined,
      hasCustomText ? customResponse.trim() : undefined,
    );
    setSelectedOptions([]);
    setCustomResponse('');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      data-testid="execution-permission-modal"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={springs.bouncy}
      >
        <Card className="w-full max-w-lg mx-4 max-h-[80vh] flex flex-col overflow-hidden">
          <div className="flex items-start gap-4 p-6 pb-4 shrink-0">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full shrink-0',
                isDeleteOperation(permissionRequest)
                  ? 'bg-red-500/10'
                  : permissionRequest.type === 'file'
                    ? 'bg-amber-500/10'
                    : permissionRequest.type === 'question'
                      ? 'bg-primary/10'
                      : permissionRequest.type === 'desktop'
                        ? 'bg-violet-500/10'
                        : 'bg-warning/10',
              )}
            >
              {isDeleteOperation(permissionRequest) ? (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              ) : permissionRequest.type === 'file' ? (
                <File className="h-5 w-5 text-amber-600" />
              ) : permissionRequest.type === 'question' ? (
                <Brain className="h-5 w-5 text-primary" />
              ) : permissionRequest.type === 'desktop' ? (
                <Monitor className="h-5 w-5 text-violet-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-warning" />
              )}
            </div>
            <h3
              className={cn(
                'text-lg font-semibold',
                isDeleteOperation(permissionRequest) ? 'text-red-600' : 'text-foreground',
              )}
            >
              {isDeleteOperation(permissionRequest)
                ? 'File Deletion Warning'
                : permissionRequest.type === 'file'
                  ? 'File Permission Required'
                  : permissionRequest.type === 'question'
                    ? permissionRequest.header || 'Question'
                    : permissionRequest.type === 'desktop'
                      ? 'Desktop Action Approval'
                      : 'Permission Required'}
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto px-6 min-h-0">
            {permissionRequest.type === 'file' && (
              <>
                {isDeleteOperation(permissionRequest) && (
                  <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-sm text-red-600">
                      {(() => {
                        const paths = getDisplayFilePaths(permissionRequest);
                        return paths.length > 1
                          ? `${paths.length} files will be permanently deleted:`
                          : 'This file will be permanently deleted:';
                      })()}
                    </p>
                  </div>
                )}

                {!isDeleteOperation(permissionRequest) && (
                  <div className="mb-3">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                        getOperationBadgeClasses(permissionRequest.fileOperation),
                      )}
                    >
                      {permissionRequest.fileOperation?.toUpperCase()}
                    </span>
                  </div>
                )}

                <div
                  className={cn(
                    'mb-4 p-3 rounded-lg',
                    isDeleteOperation(permissionRequest)
                      ? 'bg-red-500/5 border border-red-500/20'
                      : 'bg-muted',
                  )}
                >
                  {(() => {
                    const paths = getDisplayFilePaths(permissionRequest);
                    if (paths.length > 1) {
                      return (
                        <ul className="space-y-1">
                          {paths.map((path, idx) => (
                            <li
                              key={idx}
                              className={cn(
                                'text-sm font-mono break-all',
                                isDeleteOperation(permissionRequest)
                                  ? 'text-red-600'
                                  : 'text-foreground',
                              )}
                            >
                              • {path}
                            </li>
                          ))}
                        </ul>
                      );
                    }
                    return (
                      <p
                        className={cn(
                          'text-sm font-mono break-all',
                          isDeleteOperation(permissionRequest) ? 'text-red-600' : 'text-foreground',
                        )}
                      >
                        {paths[0]}
                      </p>
                    );
                  })()}
                  {permissionRequest.targetPath && (
                    <p className="text-sm font-mono text-muted-foreground mt-1">
                      → {permissionRequest.targetPath}
                    </p>
                  )}
                </div>

                {isDeleteOperation(permissionRequest) && (
                  <p className="text-sm text-red-600/80 mb-4">This action cannot be undone.</p>
                )}

                {permissionRequest.contentPreview && (
                  <details className="mb-4">
                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                      Preview content
                    </summary>
                    <pre className="mt-2 p-2 rounded bg-muted text-xs overflow-x-auto max-h-32 overflow-y-auto">
                      {permissionRequest.contentPreview}
                    </pre>
                  </details>
                )}
              </>
            )}

            {permissionRequest.type === 'question' && (
              <>
                <p className="text-sm text-foreground mb-4">{permissionRequest.question}</p>

                {permissionRequest.options && permissionRequest.options.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {permissionRequest.options
                      .filter((opt) => opt.label.toLowerCase() !== 'other')
                      .map((option, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setCustomResponse('');
                            if (permissionRequest.multiSelect) {
                              setSelectedOptions((prev) =>
                                prev.includes(option.label)
                                  ? prev.filter((o) => o !== option.label)
                                  : [...prev, option.label],
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
                            <div className="text-xs text-muted-foreground mt-1">
                              {option.description}
                            </div>
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
                      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && customResponse.trim()) {
                        handleRespond(true);
                      }
                    }}
                  />
                </div>
              </>
            )}

            {permissionRequest.type === 'desktop' && (
              <>
                <div className="mb-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-violet-500/10 text-violet-600">
                    {permissionRequest.desktopAction?.toUpperCase()}
                  </span>
                </div>

                <p className="text-sm text-foreground mb-4">
                  {permissionRequest.toolName
                    ? `Allow ${permissionRequest.toolName}?`
                    : 'Allow this desktop action?'}
                </p>

                {permissionRequest.targetWindow && (
                  <div className="mb-3 p-3 rounded-lg bg-muted">
                    <p className="text-xs text-muted-foreground mb-1">Target Window</p>
                    <p className="text-sm font-mono text-foreground">
                      {permissionRequest.targetWindow}
                    </p>
                  </div>
                )}

                {permissionRequest.coordinates && (
                  <div className="mb-3 p-3 rounded-lg bg-muted">
                    <p className="text-xs text-muted-foreground mb-1">Coordinates</p>
                    <p className="text-sm font-mono text-foreground">
                      ({permissionRequest.coordinates.x}, {permissionRequest.coordinates.y})
                    </p>
                  </div>
                )}

                {permissionRequest.toolInput && typeof permissionRequest.toolInput === 'object' && (
                  <div className="mb-4 p-3 rounded-lg bg-muted text-xs font-mono overflow-x-auto">
                    <p className="text-muted-foreground mb-1">Details</p>
                    <pre className="text-foreground">
                      {JSON.stringify(permissionRequest.toolInput, null, 2)}
                    </pre>
                  </div>
                )}
              </>
            )}

            {permissionRequest.type === 'tool' && (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Allow {permissionRequest.toolName}?
                </p>
                {permissionRequest.toolName && (
                  <div className="mb-4 p-3 rounded-lg bg-muted text-xs font-mono overflow-x-auto">
                    <p className="text-muted-foreground mb-1">Tool: {permissionRequest.toolName}</p>
                    <pre className="text-foreground">
                      {JSON.stringify(permissionRequest.toolInput, null, 2)}
                    </pre>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex gap-3 p-6 pt-4 shrink-0 border-t border-border">
            <Button
              variant="outline"
              onClick={() => handleRespond(false)}
              className="flex-1"
              data-testid="permission-deny-button"
            >
              {permissionRequest.type === 'question' ? 'Cancel' : 'Deny'}
            </Button>
            <Button
              onClick={() => handleRespond(true)}
              className={cn(
                'flex-1',
                isDeleteOperation(permissionRequest) && 'bg-red-600 hover:bg-red-700 text-white',
              )}
              data-testid="permission-allow-button"
              disabled={
                permissionRequest.type === 'question' &&
                selectedOptions.length === 0 &&
                !customResponse.trim()
              }
            >
              {isDeleteOperation(permissionRequest)
                ? getDisplayFilePaths(permissionRequest).length > 1
                  ? 'Delete All'
                  : 'Delete'
                : permissionRequest.type === 'question'
                  ? 'Submit'
                  : 'Allow'}
            </Button>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}
