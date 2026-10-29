import { AppError } from '../../shared/errors/app-error';
import type { DomainProviderContentPart, DomainProviderMessage } from './provider-adapter';

type AnthropicImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: AnthropicImageMediaType; data: string } };

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export interface AnthropicRequestMessages {
  system?: string;
  messages: AnthropicMessage[];
}

const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/u;

function toContentBlock(part: DomainProviderContentPart): AnthropicContentBlock {
  if (part.type === 'text') return { type: 'text', text: part.text };
  const match = DATA_URL_PATTERN.exec(part.image_url.url);
  // Remote image URLs are never fetched from the extension; only inline data URLs are sent.
  if (!match) throw new AppError('INVALID_MESSAGE', '图片附件格式无效');
  return {
    type: 'image',
    source: { type: 'base64', media_type: match[1] as AnthropicImageMediaType, data: match[2]! },
  };
}

function textOf(content: DomainProviderMessage['content']): string {
  if (typeof content === 'string') return content;
  return content.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
}

function isEmpty(content: AnthropicMessage['content']): boolean {
  return typeof content === 'string' ? !content.trim() : content.length === 0;
}

function asBlocks(content: AnthropicMessage['content']): AnthropicContentBlock[] {
  return typeof content === 'string' ? [{ type: 'text', text: content }] : content;
}

/**
 * Messages API keeps system instructions outside the turn list and expects
 * alternating user/assistant turns, so system messages are hoisted and
 * consecutive same-role turns are merged.
 */
export function toAnthropicMessages(messages: DomainProviderMessage[]): AnthropicRequestMessages {
  const system: string[] = [];
  const turns: AnthropicMessage[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      const text = textOf(message.content).trim();
      if (text) system.push(text);
      continue;
    }
    const content = typeof message.content === 'string'
      ? message.content
      : message.content.map(toContentBlock);
    if (isEmpty(content)) continue;

    const previous = turns.at(-1);
    if (previous?.role === message.role) {
      previous.content = [...asBlocks(previous.content), ...asBlocks(content)];
    } else {
      turns.push({ role: message.role, content });
    }
  }

  return { ...(system.length ? { system: system.join('\n\n') } : {}), messages: turns };
}
