import type { Conversation, ChatAttachment } from '../../shared/types/chat';
import type { ExtractedPageContext } from '../../shared/types/context';
import type { PageTechStackEvidence } from '../../shared/types/tech-stack';
import type { SkillInvocation } from '../../shared/types/skill';
import type { DomainProviderMessage } from '../providers/provider-adapter';
import { buildPrompt, type PromptBuildMetadata } from './prompt-builder';
import type { ContextSnapshotService } from './context-snapshot-service';

export interface ContextSelectionInput {
  includePage: boolean;
  includeSelection: boolean;
  snapshotId?: string;
  additionalTabIds?: number[];
}

export interface BuiltChatContext {
  messages: DomainProviderMessage[];
  metadata: PromptBuildMetadata;
  snapshot?: ExtractedPageContext;
  additionalSnapshots: ExtractedPageContext[];
}

export function buildChatContext(options: {
  conversation: Conversation;
  tabId: number;
  question: string;
  attachments?: ChatAttachment[];
  contextSelection: ContextSelectionInput;
  snapshots: ContextSnapshotService;
  characterBudget?: number;
  techStackEvidence?: PageTechStackEvidence;
  additionalSnapshots?: ExtractedPageContext[];
  skill?: SkillInvocation;
}): BuiltChatContext {
  const needsContext = options.contextSelection.includePage || options.contextSelection.includeSelection;
  const snapshot = needsContext && options.contextSelection.snapshotId
    ? options.snapshots.requireCurrent(options.tabId, options.contextSelection.snapshotId)
    : undefined;
  const additionalSnapshots = options.additionalSnapshots ?? [];

  const built = buildPrompt({
    history: options.conversation.messages.filter((message) => message.status === 'complete'),
    question: options.question,
    attachments: options.attachments,
    context: snapshot,
    includePage: options.contextSelection.includePage,
    includeSelection: options.contextSelection.includeSelection,
    characterBudget: options.characterBudget ?? 120_000,
    techStackEvidence: options.techStackEvidence,
    additionalContexts: additionalSnapshots,
    ...(options.skill ? { skill: options.skill } : {}),
  });
  return { ...built, ...(snapshot ? { snapshot } : {}), additionalSnapshots };
}
