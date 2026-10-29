import { AppError, serializeAppError } from '../shared/errors/app-error';
import {
  parseRuntimeCommand,
  type RuntimeCommand,
  type RuntimeCommandType,
  type RuntimeResponse,
} from './contracts';

type CommandByType<T extends RuntimeCommandType> = Extract<RuntimeCommand, { type: T }>;
type CommandHandler<T extends RuntimeCommandType> = (command: CommandByType<T>) => Promise<unknown> | unknown;

export type RuntimeCommandHandlers = {
  [T in RuntimeCommandType]: CommandHandler<T>;
};

export function createBackgroundRouter(handlers: RuntimeCommandHandlers) {
  return async (input: unknown): Promise<RuntimeResponse> => {
    const parsed = parseRuntimeCommand(input);
    if (!parsed.ok) {
      return {
        version: 1,
        requestId: parsed.requestId,
        ok: false,
        error: serializeAppError(new AppError('INVALID_MESSAGE', '消息格式无效')),
      };
    }

    const command = parsed.command;
    try {
      const handler = handlers[command.type] as (value: RuntimeCommand) => Promise<unknown> | unknown;
      const data = await handler(command);
      return { version: 1, requestId: command.requestId, ok: true, data };
    } catch (error) {
      return {
        version: 1,
        requestId: command.requestId,
        ok: false,
        error: serializeAppError(error),
      };
    }
  };
}
