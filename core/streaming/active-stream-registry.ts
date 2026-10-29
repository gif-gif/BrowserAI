import { AppError } from '../../shared/errors/app-error';

export interface ActiveStreamEntry {
  requestId: string;
  conversationId: string;
  assistantMessageId: string;
  controller: AbortController;
  startedAt?: number;
  cancelled?: boolean;
}

export class ActiveStreamRegistry {
  private readonly entries = new Map<string, ActiveStreamEntry>();
  private readonly pendingCancellations = new Set<string>();

  register(entry: ActiveStreamEntry): ActiveStreamEntry {
    if (this.entries.has(entry.requestId)) {
      throw new AppError('INVALID_MESSAGE', `请求 ${entry.requestId} 已在处理中`);
    }
    const cancelled = this.pendingCancellations.delete(entry.requestId);
    const registered = { ...entry, startedAt: entry.startedAt ?? Date.now(), cancelled };
    this.entries.set(entry.requestId, registered);
    if (cancelled) registered.controller.abort();
    return registered;
  }

  get(requestId: string): ActiveStreamEntry | undefined {
    return this.entries.get(requestId);
  }

  cancel(requestId: string): ActiveStreamEntry | undefined {
    const entry = this.entries.get(requestId);
    if (!entry) {
      this.pendingCancellations.add(requestId);
      return undefined;
    }
    entry.cancelled = true;
    entry.controller.abort();
    return entry;
  }

  remove(requestId: string): ActiveStreamEntry | undefined {
    const entry = this.entries.get(requestId);
    this.entries.delete(requestId);
    this.pendingCancellations.delete(requestId);
    return entry;
  }

  list(): ActiveStreamEntry[] {
    return [...this.entries.values()];
  }
}
