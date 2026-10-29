import type { DomainProviderContentPart, DomainProviderMessage } from './provider-adapter';

export type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | DomainProviderContentPart[];
};

export function toOpenAIMessages(messages: DomainProviderMessage[]): OpenAIChatMessage[] {
  return messages.map(({ role, content }) => ({ role, content }));
}
