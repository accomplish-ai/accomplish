import { useState, useEffect, memo } from 'react';
import { motion } from 'framer-motion';
import { springs } from '../../lib/animations';
import type { TaskMessage } from '@accomplish_ai/agent-core/common';
import { Wrench, Terminal } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { StreamingText } from '../ui/streaming-text';
import { BrowserScriptCard } from '../BrowserScriptCard';
import { getToolDisplayInfo } from '../../constants/tool-mappings';
import { SpinningIcon } from './SpinningIcon';
import { markdownComponents, proseClasses } from './message-markdown-config';
import { MessageTaskAction } from './MessageTaskAction';
import { MessageCopyButton } from './MessageCopyButton';

export interface MessageBubbleProps {
  message: TaskMessage;
  shouldStream?: boolean;
  isLastMessage?: boolean;
  isRunning?: boolean;
  showTaskActionButton?: boolean;
  taskActionLabel?: string;
  taskActionPendingLabel?: string;
  onTaskAction?: () => void;
  isTaskActionRunning?: boolean;
  taskActionError?: string | null;
  isLoading?: boolean;
}

export const MessageBubble = memo(
  function MessageBubble({
    message,
    shouldStream = false,
    isLastMessage = false,
    isRunning = false,
    showTaskActionButton = false,
    taskActionLabel,
    taskActionPendingLabel,
    onTaskAction,
    isTaskActionRunning = false,
    taskActionError,
    isLoading = false,
  }: MessageBubbleProps) {
    const [streamComplete, setStreamComplete] = useState(!shouldStream);
    const isUser = message.type === 'user';
    const isTool = message.type === 'tool';
    const isSystem = message.type === 'system';
    const isAssistant = message.type === 'assistant';

    const toolName = message.toolName || message.content?.match(/Using tool: (\w+)/)?.[1];
    const toolDisplayInfo = toolName ? getToolDisplayInfo(toolName) : undefined;
    const ToolIcon = toolDisplayInfo?.icon;

    useEffect(() => {
      if (!shouldStream) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: sync from prop
        setStreamComplete(true);
      }
    }, [shouldStream]);

    if (isTool && message.toolName === 'todowrite') {
      return null;
    }

    if (isTool && message.toolName?.endsWith('complete_task')) {
      return null;
    }

    const showCopyButton = !isTool && !!message.content?.trim();

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.gentle}
        className={cn('flex flex-col group', isUser ? 'items-end' : 'items-start')}
      >
        {isTool &&
        toolName?.endsWith('browser_script') &&
        Array.isArray((message.toolInput as { actions?: unknown })?.actions) ? (
          <BrowserScriptCard
            actions={
              (
                message.toolInput as {
                  actions: Array<{
                    action: string;
                    url?: string;
                    selector?: string;
                    ref?: string;
                    text?: string;
                    key?: string;
                  }>;
                }
              ).actions
            }
            isRunning={isLastMessage && isRunning}
          />
        ) : (
          <div
            className={cn(
              'max-w-[85%] rounded-2xl px-4 py-3 transition-all duration-150 relative',
              isUser
                ? 'bg-primary text-primary-foreground'
                : isTool
                  ? 'bg-muted border border-border'
                  : isSystem
                    ? 'bg-muted/50 border border-border'
                    : 'bg-card border border-border',
            )}
          >
            {isTool ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                {ToolIcon ? <ToolIcon className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
                <span>{toolDisplayInfo?.label || toolName || 'Processing'}</span>
                {isLastMessage && isRunning && <SpinningIcon className="h-3.5 w-3.5 ml-1" />}
              </div>
            ) : (
              <>
                {isSystem && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5 font-medium">
                    <Terminal className="h-3.5 w-3.5" />
                    System
                  </div>
                )}
                {isUser ? (
                  <p
                    className={cn(
                      'text-sm whitespace-pre-wrap break-words',
                      'text-primary-foreground',
                    )}
                  >
                    {message.content}
                  </p>
                ) : isAssistant && shouldStream && !streamComplete ? (
                  <StreamingText
                    text={message.content}
                    speed={120}
                    isComplete={streamComplete}
                    onComplete={() => setStreamComplete(true)}
                  >
                    {(streamedText) => (
                      <div className={proseClasses}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {streamedText}
                        </ReactMarkdown>
                      </div>
                    )}
                  </StreamingText>
                ) : (
                  <div className={proseClasses}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                )}
                <p
                  className={cn(
                    'text-xs mt-1.5',
                    isUser ? 'text-primary-foreground/70' : 'text-muted-foreground',
                  )}
                >
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>
                {isAssistant && showTaskActionButton && onTaskAction && (
                  <MessageTaskAction
                    onTaskAction={onTaskAction}
                    isLoading={isLoading}
                    isTaskActionRunning={isTaskActionRunning}
                    taskActionLabel={taskActionLabel}
                    taskActionPendingLabel={taskActionPendingLabel}
                    taskActionError={taskActionError}
                  />
                )}
              </>
            )}
            {showCopyButton && <MessageCopyButton content={message.content} isUser={isUser} />}
          </div>
        )}
      </motion.div>
    );
  },
  (prev, next) =>
    prev.message.id === next.message.id &&
    prev.shouldStream === next.shouldStream &&
    prev.isLastMessage === next.isLastMessage &&
    prev.isRunning === next.isRunning &&
    prev.showTaskActionButton === next.showTaskActionButton &&
    prev.taskActionLabel === next.taskActionLabel &&
    prev.taskActionPendingLabel === next.taskActionPendingLabel &&
    prev.isTaskActionRunning === next.isTaskActionRunning &&
    prev.taskActionError === next.taskActionError &&
    prev.isLoading === next.isLoading,
);
