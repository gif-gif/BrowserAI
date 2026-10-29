import { AppError } from '../../shared/errors/app-error';
import type { ExtractedPageContext } from '../../shared/types/context';

interface TabSnapshotState {
  navigationKey: string;
  snapshot?: ExtractedPageContext;
}

/** Raw page context is intentionally kept in service-worker memory only. */
export class ContextSnapshotService {
  private readonly tabs = new Map<number, TabSnapshotState>();
  private readonly pendingSelections = new Map<number, string>();

  store(snapshot: ExtractedPageContext): void {
    const pendingSelection = this.pendingSelections.get(snapshot.tabId)?.trim();
    this.pendingSelections.delete(snapshot.tabId);
    const stored = pendingSelection
      ? { ...snapshot, selection: { text: pendingSelection } }
      : snapshot;
    this.tabs.set(snapshot.tabId, {
      navigationKey: stored.metadata.navigationKey,
      snapshot: stored,
    });
  }

  attachSelection(tabId: number, text: string): void {
    const selection = text.trim();
    if (!selection) return;
    const state = this.tabs.get(tabId);
    if (state?.snapshot) {
      this.tabs.set(tabId, {
        ...state,
        snapshot: { ...state.snapshot, selection: { text: selection } },
      });
      return;
    }
    this.pendingSelections.set(tabId, selection);
  }

  /** Mirrors the live page selection; an empty text removes it. */
  syncSelection(tabId: number, text: string): void {
    const selection = text.trim();
    if (selection) {
      this.attachSelection(tabId, selection);
      return;
    }
    this.pendingSelections.delete(tabId);
    const state = this.tabs.get(tabId);
    if (state?.snapshot?.selection) {
      const snapshot = { ...state.snapshot };
      delete snapshot.selection;
      this.tabs.set(tabId, { ...state, snapshot });
    }
  }

  current(tabId: number): ExtractedPageContext | undefined {
    return this.tabs.get(tabId)?.snapshot;
  }

  invalidate(tabId: number, navigationKey: string): void {
    this.pendingSelections.delete(tabId);
    this.tabs.set(tabId, { navigationKey });
  }

  remove(tabId: number): void {
    this.tabs.delete(tabId);
    this.pendingSelections.delete(tabId);
  }

  requireCurrent(tabId: number, snapshotId: string): ExtractedPageContext {
    const state = this.tabs.get(tabId);
    const snapshot = state?.snapshot;
    if (!snapshot || snapshot.snapshotId !== snapshotId || snapshot.metadata.navigationKey !== state.navigationKey) {
      throw new AppError('CONTEXT_STALE', '当前页面已变化，请重新获取页面上下文');
    }
    return snapshot;
  }

  require(tabId: number, snapshotId: string, navigationKey: string): ExtractedPageContext {
    const state = this.tabs.get(tabId);
    const snapshot = state?.snapshot;
    if (
      !state
      || state.navigationKey !== navigationKey
      || !snapshot
      || snapshot.snapshotId !== snapshotId
      || snapshot.metadata.navigationKey !== navigationKey
    ) {
      throw new AppError('CONTEXT_STALE', '当前页面已变化，请重新获取页面上下文');
    }
    return snapshot;
  }
}
