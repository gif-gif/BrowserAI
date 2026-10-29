import { useCallback, useEffect, useReducer, useRef } from 'react';
import { isDocumentAttachment, type ChatAttachment } from '../../../shared/types/chat';
import type { PageTechStackEvidence } from '../../../shared/types/tech-stack';
import type { SkillInvocation } from '../../../shared/types/skill';
import { chatPortCommandSchema, streamEventSchema, type ChatPortCommand } from '../../../messaging/contracts';
import {
  chatStreamReducer,
  initialChatStreamState,
  type SidePanelStreamState,
} from '../state/chat-stream-reducer';

export interface ChatStreamPort {
  postMessage(message: unknown): void;
  onMessage: {
    addListener(listener: (message: unknown) => void): void;
    removeListener(listener: (message: unknown) => void): void;
  };
  onDisconnect: {
    addListener(listener: () => void): void;
    removeListener(listener: () => void): void;
  };
  disconnect(): void;
}

export interface StartChatInput {
  tabId: number;
  conversationId: string;
  text: string;
  attachments?: ChatAttachment[];
  contextSelection: {
    includePage: boolean;
    includeSelection: boolean;
    snapshotId?: string;
  };
  allowPageActions?: boolean;
  techStackEvidence?: PageTechStackEvidence;
  skill?: SkillInvocation;
}

interface UseChatStreamOptions {
  createPort: () => ChatStreamPort;
  createRequestId: () => string;
  onReconcile: () => boolean | Promise<boolean>;
}

interface UseChatStreamResult {
  stream: SidePanelStreamState;
  canStop: boolean;
  start(input: StartChatInput): string | undefined;
  stop(): void;
  reset(): void;
}

export function useChatStream({
  createPort,
  createRequestId,
  onReconcile,
}: UseChatStreamOptions): UseChatStreamResult {
  const [stream, dispatch] = useReducer(chatStreamReducer, initialChatStreamState);
  const createPortRef = useRef(createPort);
  const createRequestIdRef = useRef(createRequestId);
  const onReconcileRef = useRef(onReconcile);
  const portRef = useRef<ChatStreamPort | undefined>(undefined);
  const activeRequestIdRef = useRef<string | undefined>(undefined);
  const displayedRequestIdRef = useRef<string | undefined>(undefined);
  const stopRequestedRef = useRef(false);
  const disposedRef = useRef(false);
  const detachRef = useRef<() => void>(() => undefined);

  createPortRef.current = createPort;
  createRequestIdRef.current = createRequestId;
  onReconcileRef.current = onReconcile;

  const reset = useCallback(() => {
    activeRequestIdRef.current = undefined;
    displayedRequestIdRef.current = undefined;
    stopRequestedRef.current = false;
    dispatch({ type: 'reset' });
  }, []);

  const reconcileRequest = useCallback(async (requestId?: string) => {
    try {
      const reconciled = await onReconcileRef.current();
      if (
        reconciled
        && (!requestId || displayedRequestIdRef.current === requestId)
        && !activeRequestIdRef.current
      ) reset();
    } catch {
      // Keep the completed optimistic turn visible when persisted state cannot
      // be reloaded. A later tab refresh can reconcile it without flashing the
      // empty/default screen in the meantime.
    }
  }, [reset]);

  const connectRef = useRef<() => void>(() => undefined);
  connectRef.current = () => {
    if (disposedRef.current) return;

    const port = createPortRef.current();
    portRef.current = port;

    const handleMessage = (input: unknown) => {
      const parsed = streamEventSchema.safeParse(input);
      if (!parsed.success || parsed.data.requestId !== activeRequestIdRef.current) return;

      dispatch({ type: 'event', event: parsed.data });
      if (parsed.data.type === 'completed' || parsed.data.type === 'failed') {
        activeRequestIdRef.current = undefined;
        stopRequestedRef.current = false;
        void reconcileRequest(parsed.data.requestId);
      }
    };

    const handleDisconnect = () => {
      if (disposedRef.current || portRef.current !== port) return;
      detachRef.current();
      portRef.current = undefined;
      reset();
      void onReconcileRef.current();
      connectRef.current();
    };

    port.onMessage.addListener(handleMessage);
    port.onDisconnect.addListener(handleDisconnect);
    detachRef.current = () => {
      port.onMessage.removeListener(handleMessage);
      port.onDisconnect.removeListener(handleDisconnect);
    };
  };

  useEffect(() => {
    disposedRef.current = false;
    connectRef.current();
    return () => {
      disposedRef.current = true;
      detachRef.current();
      portRef.current?.disconnect();
      portRef.current = undefined;
    };
  }, []);

  const recoverPort = useCallback((failedPort: ChatStreamPort) => {
    if (portRef.current !== failedPort) return;
    detachRef.current();
    detachRef.current = () => undefined;
    portRef.current = undefined;
    try { failedPort.disconnect(); } catch { /* The port is already unavailable. */ }
    reset();
    void onReconcileRef.current();
    try { connectRef.current(); } catch { /* Retry lazily on the next send. */ }
  }, [reset]);

  const start = useCallback((input: StartChatInput) => {
    if (activeRequestIdRef.current) return undefined;
    if (!portRef.current) {
      try { connectRef.current(); } catch { return undefined; }
    }
    const port = portRef.current;
    if (!port) return undefined;

    const requestId = createRequestIdRef.current();
    const userAttachments = (input.attachments ?? []).filter(
      (attachment): attachment is ChatAttachment =>
        isDocumentAttachment(attachment) || attachment.source === 'upload' || attachment.source === 'screenshot',
    );
    const command = {
      version: 1,
      requestId,
      type: 'START_CHAT',
      ...input,
      attachments: userAttachments,
      allowPageActions: input.allowPageActions ?? false,
    };
    const parsed = chatPortCommandSchema.safeParse(command);
    if (!parsed.success) return undefined;

    activeRequestIdRef.current = requestId;
    displayedRequestIdRef.current = requestId;
    stopRequestedRef.current = false;
    dispatch({ type: 'start', requestId });
    try {
      port.postMessage(parsed.data);
      return requestId;
    } catch {
      recoverPort(port);
      return undefined;
    }
  }, [recoverPort]);

  const stop = useCallback(() => {
    const requestId = activeRequestIdRef.current;
    const port = portRef.current;
    if (!requestId || !port || stopRequestedRef.current) return;

    stopRequestedRef.current = true;
    dispatch({ type: 'cancel', requestId });
    const command: ChatPortCommand = { version: 1, requestId, type: 'CANCEL_CHAT' };
    try {
      port.postMessage(command);
    } catch {
      recoverPort(port);
    }
  }, [recoverPort]);

  return {
    stream,
    canStop: stream.status === 'streaming' && !stopRequestedRef.current,
    start,
    stop,
    reset,
  };
}
