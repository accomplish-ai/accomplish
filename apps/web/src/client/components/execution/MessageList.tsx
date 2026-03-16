import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import { springs } from '../../lib/animations';
import type { TaskMessage } from '@accomplish_ai/agent-core/common';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Wrench, Terminal, Check, Copy, Play } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { StreamingText } from '../ui/streaming-text';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { BrowserScriptCard } from '../BrowserScriptCard';
import { getToolDisplayInfo } from '../../constants/tool-mappings';
import { SpinningIcon } from './SpinningIcon';

export interface MessageBubbleProps {
  message: TaskMessage;
  shouldStream?: boolean;
  isLastMessage?: boolean;
  isRunning?: boolean;
  showContinueButton?: boolean;
  continueLabel?: string;
  onContinue?: () => void;
  isLoading?: boolean;
}

const COPIED_STATE_DURATION_MS = 1000;

export const MessageBubble = memo(
  function MessageBubble({
    message,
    shouldStream = false,
    isLastMessage = false,
    isRunning = false,
    showContinueButton = false,
    continueLabel,
    onContinue,
    isLoading = false,
  }: MessageBubbleProps) {
    const [streamComplete, setStreamComplete] = useState(!shouldStream);
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    const handleCopy = useCallback(async () => {
      try {
        await navigator.clipboard.writeText(message.content);
        setCopied(true);

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          setCopied(false);
        }, COPIED_STATE_DURATION_MS);
      } catch {
        // clipboard write may fail in non-secure contexts
      }
    }, [message.content]);

    if (isTool && message.toolName === 'todowrite') {
      return null;
    }

    if (isTool && message.toolName?.endsWith('complete_task')) {
      return null;
    }

    const showCopyButton = !isTool && !!message.content?.trim();

    const proseClasses = cn(
      'text-sm prose prose-sm max-w-none',
      'prose-headings:text-foreground',
      'prose-p:text-foreground prose-p:my-2',
      'prose-strong:text-foreground prose-strong:font-semibold',
      'prose-em:text-foreground',
      // prose-code is overridden by CodeBlock for fenced blocks; inline code keeps default
      'prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs',
      'prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0',
      'prose-ul:text-foreground prose-ol:text-foreground',
      'prose-li:text-foreground prose-li:my-1',
      'prose-a:text-primary prose-a:underline',
      'prose-blockquote:text-muted-foreground prose-blockquote:border-l-4 prose-blockquote:border-border prose-blockquote:pl-4',
      'prose-hr:border-border',
      'prose-table:w-full prose-thead:border-b prose-thead:border-border prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-foreground prose-th:font-semibold prose-td:px-3 prose-td:py-2 prose-td:text-foreground prose-tr:border-b prose-tr:border-border',
      'break-words',
    );

    // Custom renderer so fenced code blocks get syntax highlighting and a copy
    // button while inline backtick code keeps the simple prose style.
    const markdownComponents: Components = {
      code({ className, children, node, ...props }) {
        const code = String(children).replace(/\n$/, '');
        // Use node.properties.className array to correctly parse languages like c++, c#, etc.
        const classes: string[] =
          (node?.properties?.className as string[] | undefined) ??
          (className ? className.split(' ') : []);
        const langClass = classes.find((c) => c.startsWith('language-'));
        const language = langClass ? langClass.slice('language-'.length) : undefined;
        const inline = typeof className === 'undefined' && !code.includes('\n');

        return (
          <CodeBlock language={language} inline={inline} {...props}>
            {code}
          </CodeBlock>
        );
      },
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.gentle}
        className={cn('flex flex-col group', isUser ? 'items-end' : 'items-start')}
      >
        {isTool &&
        toolName?.endsWith('browser_script') &&
        (message.toolInput as { actions?: unknown[] })?.actions ? (
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
                {isAssistant && showContinueButton && onContinue && (
                  <Button
                    size="sm"
                    onClick={onContinue}
                    disabled={isLoading}
                    className="mt-3 gap-1.5"
                  >
                    <Play className="h-3 w-3" />
                    {continueLabel || 'Continue'}
                  </Button>
                )}
              </>
            )}
            {showCopyButton && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleCopy}
                    data-testid="message-copy-button"
                    className={cn(
                      'absolute bottom-2 right-2',
                      'opacity-0 group-hover:opacity-100 transition-all duration-200',
                      'p-1 rounded',
                      isUser ? 'hover:bg-primary-foreground/20' : 'hover:bg-accent',
                      isUser
                        ? !copied
                          ? 'text-primary-foreground/70 hover:text-primary-foreground'
                          : '!bg-green-500/20 !text-green-300'
                        : !copied
                          ? 'text-muted-foreground hover:text-foreground'
                          : '!bg-green-500/10 !text-green-600',
                    )}
                    aria-label={'Copy to clipboard'}
                  >
                    <Check className={cn('absolute h-4 w-4', !copied && 'hidden')} />
                    <Copy className={cn('absolute h-4 w-4', copied && 'hidden')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <span>Copy to clipboard</span>
                </TooltipContent>
              </Tooltip>
            )}
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
    prev.showContinueButton === next.showContinueButton &&
    prev.isLoading === next.isLoading,
);
