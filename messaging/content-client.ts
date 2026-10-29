import { AppError } from '../shared/errors/app-error';
import { contentCommandSchema, type ContentCommand } from './contracts';

export interface TabMessageApi {
  sendMessage(tabId: number, message: ContentCommand): Promise<unknown>;
}

export class ContentClient {
  constructor(private readonly tabs: TabMessageApi) {}

  async send<T>(tabId: number, command: ContentCommand): Promise<T> {
    const validated = contentCommandSchema.safeParse(command);
    if (!validated.success) throw new AppError('INVALID_MESSAGE', 'Content Script 消息格式无效');
    return this.tabs.sendMessage(tabId, validated.data) as Promise<T>;
  }
}
