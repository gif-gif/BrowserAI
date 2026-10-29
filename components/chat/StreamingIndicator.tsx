import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider';

export function useBatchedStreamingText(content: string, active: boolean): string {
  const [visibleContent, setVisibleContent] = useState(content);
  const latestContent = useRef(content);
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    latestContent.current = content;
    if (!active || typeof requestAnimationFrame === 'undefined') {
      setVisibleContent(content);
      return;
    }
    if (frame.current !== undefined) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      setVisibleContent(latestContent.current);
    });
  }, [active, content]);

  useEffect(() => () => {
    if (frame.current !== undefined && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(frame.current);
    }
  }, []);

  return visibleContent;
}

export function StreamingIndicator() {
  const { messages } = useI18n();
  return (
    <span className="streaming-indicator" role="status" aria-label={messages.generating}>
      <span>{messages.generating}</span>
      <span className="streaming-indicator__dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}
