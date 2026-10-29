import type { ReactNode } from 'react';

interface CodeBlockProps {
  className?: string;
  children?: ReactNode;
}

export function CodeBlock({ className, children }: CodeBlockProps) {
  const language = /(?:^|\s)language-([^\s]+)/.exec(className ?? '')?.[1];
  return (
    <code
      className={className}
      {...(language ? { 'data-language': language } : {})}
    >
      {children}
    </code>
  );
}
