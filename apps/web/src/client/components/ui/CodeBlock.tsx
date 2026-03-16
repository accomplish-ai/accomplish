import { useState, useCallback, useRef, useEffect } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import { Check, Copy } from '@phosphor-icons/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const COPIED_TIMEOUT_MS = 1200;

// Figure out whether dark mode is active at render time.
function isDarkMode() {
  if (typeof document === 'undefined') {
    return false;
  }
  return document.documentElement.classList.contains('dark');
}

interface CodeBlockProps {
  language?: string;
  children: string;
  inline?: boolean;
}

export function CodeBlock({ language, children, inline = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [isDark, setIsDark] = useState(isDarkMode);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the copy-reset timer on unmount to avoid calling setState after unmount.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Re-sync isDark whenever the 'dark' class is toggled on <html>.
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, COPIED_TIMEOUT_MS);
    } catch {
      // clipboard API may be unavailable in non-secure contexts
    }
  }, [children]);

  // Inline code gets simple styling, no copy button needed.
  if (inline) {
    return (
      <code className="bg-muted text-foreground px-1 py-0.5 rounded text-xs font-mono">
        {children}
      </code>
    );
  }

  const displayLang = language || 'text';
  const prismTheme = isDark ? themes.oneDark : themes.oneLight;

  return (
    <div className="group/code relative my-3 overflow-hidden rounded-lg border border-border bg-muted">
      {/* Header bar with language label and copy button */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/70">
        <span className="text-xs font-medium text-muted-foreground select-none">{displayLang}</span>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleCopy}
              data-testid="code-block-copy-button"
              aria-label="Copy code to clipboard"
              className={cn(
                'flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors transition-opacity',
                'opacity-0 pointer-events-none',
                'group-hover/code:opacity-100 group-hover/code:pointer-events-auto',
                'group-focus-within/code:opacity-100 group-focus-within/code:pointer-events-auto',
                'focus-visible:opacity-100 focus-visible:pointer-events-auto',
                'text-muted-foreground hover:bg-accent hover:text-foreground',
                copied && '!text-green-600 dark:!text-green-400',
              )}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Copy to clipboard</TooltipContent>
        </Tooltip>
      </div>

      {/* Syntax highlighted code via prism-react-renderer (~18KB vs ~200KB alternatives) */}
      <Highlight theme={prismTheme} code={children} language={displayLang}>
        {({ className: hlClassName, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={hlClassName}
            style={{
              ...style,
              margin: 0,
              padding: '0.75rem',
              backgroundColor: 'transparent',
              fontSize: '0.8125rem',
              lineHeight: '1.6',
              overflowX: 'auto',
              fontFamily: 'ui-monospace, "Cascadia Code", Menlo, Monaco, "Courier New", monospace',
            }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
