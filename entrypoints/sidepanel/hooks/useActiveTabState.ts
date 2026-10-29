import { useCallback, useEffect, useRef, useState } from 'react';
import type { RuntimeCommand } from '../../../messaging/contracts';
import { normalizeError, type AppError } from '../../../shared/errors/app-error';
import type { ActiveTabState } from '../../../shared/types/tab-state';

export interface RuntimeSender {
  send(command: RuntimeCommand): Promise<unknown>;
}

export interface TabActivitySource {
  subscribe(listener: () => void): () => void;
}

interface UseActiveTabStateOptions {
  runtime: RuntimeSender;
  tabActivity?: TabActivitySource;
  onBeforeLoad?: () => void;
  createRequestId?: () => string;
  pinCurrentTab?: boolean | (() => boolean);
  /** Always show this tab instead of the active one (the in-page floating chat). */
  tabId?: number;
}

interface ActiveTabStateResult {
  data?: ActiveTabState;
  loading: boolean;
  error?: AppError;
  refresh(tabId?: number, options?: ActiveTabRefreshOptions): Promise<ActiveTabState | undefined>;
  apply(nextState: ActiveTabState): ActiveTabState;
}

interface ActiveTabRefreshOptions {
  preserveTransient?: boolean;
  /**
   * Revalidate without showing the loading state. Transient UI is only reset
   * when the result switches to another tab or conversation, so refocusing the
   * panel (e.g. after a screenshot) does not make it flash.
   */
  background?: boolean;
}

function defaultRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `active-tab-${Date.now()}`;
}

export function useActiveTabState({
  runtime,
  tabActivity,
  onBeforeLoad,
  createRequestId = defaultRequestId,
  pinCurrentTab = false,
  tabId: fixedTabId,
}: UseActiveTabStateOptions): ActiveTabStateResult {
  const [data, setData] = useState<ActiveTabState>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError>();
  const generationRef = useRef(0);
  const runtimeRef = useRef(runtime);
  const beforeLoadRef = useRef(onBeforeLoad);
  const requestIdRef = useRef(createRequestId);
  const dataRef = useRef<ActiveTabState | undefined>(undefined);
  const pinCurrentTabRef = useRef<boolean | (() => boolean)>(pinCurrentTab);

  runtimeRef.current = runtime;
  beforeLoadRef.current = onBeforeLoad;
  requestIdRef.current = createRequestId;
  dataRef.current = data;
  pinCurrentTabRef.current = pinCurrentTab;

  const refresh = useCallback(async (tabId?: number, options?: ActiveTabRefreshOptions) => {
    const generation = ++generationRef.current;
    const background = Boolean(options?.background && dataRef.current);
    if (!background) {
      if (!options?.preserveTransient) beforeLoadRef.current?.();
      setLoading(true);
      setError(undefined);
    }

    try {
      const current = dataRef.current;
      const command: RuntimeCommand = tabId === undefined ? {
        version: 1,
        requestId: requestIdRef.current(),
        type: 'GET_ACTIVE_TAB_STATE',
      } : current?.tabId === tabId ? {
        // OPEN_CONVERSATION has existed since the first version of the runtime
        // protocol. Reusing it keeps terminal stream reconciliation pinned to
        // the original content tab without breaking when an older extension
        // service worker is still alive during an extension reload.
        version: 1,
        requestId: requestIdRef.current(),
        type: 'OPEN_CONVERSATION',
        tabId,
        conversationId: current.conversation.id,
      } : {
        version: 1,
        requestId: requestIdRef.current(),
        type: 'GET_TAB_STATE',
        tabId,
      };
      const result = await runtimeRef.current.send(command) as ActiveTabState;
      if (generation !== generationRef.current) return undefined;
      if (background && !options?.preserveTransient && (
        result.tabId !== current?.tabId || result.conversation.id !== current?.conversation.id
      )) beforeLoadRef.current?.();
      if (background) setError(undefined);
      setData(result);
      return result;
    } catch (caught) {
      if (generation !== generationRef.current) return undefined;
      // A failed background check keeps showing the state we already have.
      if (background) return undefined;
      setError(normalizeError(caught));
      return undefined;
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, []);

  const apply = useCallback((nextState: ActiveTabState) => {
    generationRef.current += 1;
    beforeLoadRef.current?.();
    setData(nextState);
    setError(undefined);
    setLoading(false);
    return nextState;
  }, []);

  useEffect(() => {
    void refresh(fixedTabId);
    return tabActivity?.subscribe(() => {
      const pinCurrentTab = fixedTabId !== undefined || (typeof pinCurrentTabRef.current === 'function'
        ? pinCurrentTabRef.current()
        : pinCurrentTabRef.current);
      void refresh(pinCurrentTab ? dataRef.current?.tabId ?? fixedTabId : undefined, { background: true });
    });
  }, [fixedTabId, refresh, tabActivity]);

  return { data, loading, error, refresh, apply };
}
