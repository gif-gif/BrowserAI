import { AppError } from '../shared/errors/app-error';
import { chatPortCommandSchema, streamEventSchema, type ChatPortCommand, type StreamEvent } from './contracts';

export const CHAT_STREAM_PORT_NAME = 'chat-stream-v1';

export type ChatStreamStatus = 'idle' | 'streaming' | 'completed' | 'failed';
export interface ChatStreamState {
  requestId: string;
  status: ChatStreamStatus;
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  images?: Array<Extract<StreamEvent, { type: 'image' }>['image']>;
  error?: StreamEvent & { type: 'failed' };
}

export function reduceChatStreamEvent(state: ChatStreamState, event: StreamEvent): ChatStreamState {
  if (event.requestId !== state.requestId) return state;
  switch (event.type) {
    case 'started': return { ...state, status: 'streaming' };
    case 'delta': return { ...state, status: 'streaming', text: state.text + event.text };
    case 'image': return { ...state, images: [...(state.images ?? []), event.image] };
    case 'usage': return {
      ...state,
      usage: {
        ...(event.inputTokens === undefined ? {} : { inputTokens: event.inputTokens }),
        ...(event.outputTokens === undefined ? {} : { outputTokens: event.outputTokens }),
        ...(event.totalTokens === undefined ? {} : { totalTokens: event.totalTokens }),
      },
    };
    case 'completed': return { ...state, status: 'completed' };
    case 'failed': return { ...state, status: 'failed', error: event };
  }
}

export interface RuntimePort {
  postMessage(message: ChatPortCommand): void;
  onMessage: { addListener(listener: (message: unknown) => void): void; removeListener(listener: (message: unknown) => void): void };
  disconnect(): void;
}

export class ChatPortClient {
  constructor(private readonly port: RuntimePort) {}

  send(command: ChatPortCommand): void {
    const parsed = chatPortCommandSchema.safeParse(command);
    if (!parsed.success) throw new AppError('INVALID_MESSAGE', '流式消息格式无效');
    this.port.postMessage(parsed.data);
  }

  subscribe(requestId: string, listener: (event: StreamEvent) => void): () => void {
    const onMessage = (input: unknown) => {
      const parsed = streamEventSchema.safeParse(input);
      if (parsed.success && parsed.data.requestId === requestId) listener(parsed.data);
    };
    this.port.onMessage.addListener(onMessage);
    return () => this.port.onMessage.removeListener(onMessage);
  }

  disconnect(): void { this.port.disconnect(); }
}
