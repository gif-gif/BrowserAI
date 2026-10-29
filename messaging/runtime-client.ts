import { AppError } from '../shared/errors/app-error';
import type { RuntimeCommand, RuntimeResponse } from './contracts';

export interface RuntimeMessageApi {
  sendMessage(message: RuntimeCommand): Promise<unknown>;
}

export class RuntimeClient {
  constructor(private readonly runtime: RuntimeMessageApi) {}

  async send<T>(command: RuntimeCommand): Promise<T> {
    const response = await this.runtime.sendMessage(command) as RuntimeResponse<T>;
    if (!response || response.version !== 1 || response.requestId !== command.requestId) {
      throw new AppError('INVALID_MESSAGE', 'Background 返回了无效响应');
    }
    if (!response.ok) {
      throw new AppError(response.error.code, response.error.message, response.error);
    }
    return response.data;
  }
}
