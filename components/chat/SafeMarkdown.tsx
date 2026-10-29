import type { ComponentPropsWithoutRef } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { safeMarkdownUrlTransform, toSafeExternalUrl } from '../../core/security/safe-link';
import { CodeBlock } from './CodeBlock';

interface SafeMarkdownProps {
  content: string;
}

function SafeLink({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) {
  const safeHref = toSafeExternalUrl(href);
  if (!safeHref) return <span data-blocked-link="true">{children}</span>;

  return (
    <a
      {...props}
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
    >
      {children}
    </a>
  );
}

export function SafeMarkdown({ content }: SafeMarkdownProps) {
  const { messages } = useI18n();
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      urlTransform={safeMarkdownUrlTransform}
      components={{
        a: SafeLink,
        img: ({ alt }) => <span className="blocked-image" data-blocked-image="true">{alt || messages.imageBlocked}</span>,
        code: CodeBlock,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
