import { useState } from 'react';
import { motion } from 'framer-motion';
import { springs } from '../../lib/animations';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangle, AlertCircle, File, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PermissionRequest } from '@accomplish_ai/agent-core/common';
import { isDeleteOperation, getDisplayFilePaths } from './permission-utils';
import { PermissionDialogFile } from './PermissionDialogFile';
import { PermissionDialogQuestion } from './PermissionDialogQuestion';
import { PermissionDialogTool } from './PermissionDialogTool';

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

  const isDelete = isDeleteOperation(permissionRequest);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      data-testid="execution-permission-card"
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
                isDelete
                  ? 'bg-red-500/10'
                  : permissionRequest.type === 'file'
                    ? 'bg-amber-500/10'
                    : permissionRequest.type === 'question'
                      ? 'bg-primary/10'
                      : 'bg-warning/10',
              )}
            >
              {isDelete ? (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              ) : permissionRequest.type === 'file' ? (
                <File className="h-5 w-5 text-amber-600" />
              ) : permissionRequest.type === 'question' ? (
                <Brain className="h-5 w-5 text-primary" />
              ) : (
                <AlertCircle className="h-5 w-5 text-warning" />
              )}
            </div>
            <h3
              className={cn('text-lg font-semibold', isDelete ? 'text-red-600' : 'text-foreground')}
            >
              {isDelete
                ? 'File Deletion Warning'
                : permissionRequest.type === 'file'
                  ? 'File Permission Required'
                  : permissionRequest.type === 'question'
                    ? permissionRequest.header || 'Question'
                    : 'Permission Required'}
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto px-6 min-h-0">
            {permissionRequest.type === 'file' && (
              <PermissionDialogFile permissionRequest={permissionRequest} />
            )}
            {permissionRequest.type === 'question' && (
              <PermissionDialogQuestion
                permissionRequest={permissionRequest}
                selectedOptions={selectedOptions}
                setSelectedOptions={setSelectedOptions}
                customResponse={customResponse}
                setCustomResponse={setCustomResponse}
                onSubmit={() => handleRespond(true)}
              />
            )}
            {permissionRequest.type === 'tool' && (
              <PermissionDialogTool permissionRequest={permissionRequest} />
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
              className={cn('flex-1', isDelete && 'bg-red-600 hover:bg-red-700 text-white')}
              data-testid="permission-allow-button"
              disabled={
                permissionRequest.type === 'question' &&
                selectedOptions.length === 0 &&
                !customResponse.trim()
              }
            >
              {isDelete
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
