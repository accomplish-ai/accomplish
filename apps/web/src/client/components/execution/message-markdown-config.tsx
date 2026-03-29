import type { Components } from 'react-markdown';
import { cn } from '@/lib/utils';
import { CodeBlock } from '@/components/ui/CodeBlock';

// Hoisted to module scope — stable reference, shared by all message bubbles.
export const proseClasses = cn(
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

// Hoisted to module scope — stable reference avoids ReactMarkdown reconciliation on every render.
// Custom renderer: fenced code blocks get syntax highlighting + copy button;
// inline backtick code keeps simple prose styling.
export const markdownComponents: Components = {
  code({ className, children, node, ...props }) {
    const code = String(children).replace(/\n$/, '');
    // Use node.properties.className array to correctly parse languages like c++, c#, etc.
    const classes: string[] =
      (node?.properties?.className as string[] | undefined) ??
      (className ? className.split(' ') : []);
    const langClass = classes.find((c) => c.startsWith('language-'));
    const language = langClass ? langClass.slice('language-'.length) : undefined;
    // Guard against single-line fenced blocks without a language identifier:
    // they also have no className but should NOT be treated as inline code.
    const hasLanguageClass = classes.some((c) => c.startsWith('language-'));
    const inline = typeof className === 'undefined' && !hasLanguageClass && !code.includes('\n');

    return (
      <CodeBlock language={language} inline={inline} {...props}>
        {code}
      </CodeBlock>
    );
  },
};
