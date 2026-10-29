import type { SerializedAppError } from '../../../shared/errors/app-error';
import type { ImageAttachment } from '../../../shared/types/chat';
import type { StreamEvent } from '../../../messaging/contracts';

export type SidePanelStreamStatus = 'idle' | 'streaming' | 'cancelled' | 'completed' | 'failed';

export interface SidePanelStreamState {
  requestId?: string;
  status: SidePanelStreamStatus;
  text: string;
  images: ImageAttachment[];
  error?: SerializedAppError;
}

export type ChatStreamAction =
  | { type: 'start'; requestId: string }
  | { type: 'event'; event: StreamEvent }
  | { type: 'cancel'; requestId: string }
  | { type: 'reset' };

export const initialChatStreamState: SidePanelStreamState = {
  status: 'idle',
  text: '',
  images: [],
};

export function chatStreamReducer(
  state: SidePanelStreamState,
  action: ChatStreamAction,
): SidePanelStreamState {
  switch (action.type) {
    case 'start':
      return { requestId: action.requestId, status: 'streaming', text: '', images: [] };
    case 'cancel':
      return action.requestId === state.requestId && state.status === 'streaming'
        ? { ...state, status: 'cancelled' }
        : state;
    case 'reset':
      return initialChatStreamState;
    case 'event': {
      const { event } = action;
      if (event.requestId !== state.requestId || state.status === 'idle') return state;
      if ((state.status === 'completed' || state.status === 'failed') && event.type !== 'usage') return state;
      if (state.status === 'cancelled' && (event.type === 'started' || event.type === 'delta' || event.type === 'image')) {
        return state;
      }

      switch (event.type) {
        case 'started':
          return { ...state, status: 'streaming' };
        case 'delta':
          return { ...state, text: state.text + event.text };
        case 'image': {
          const id = `generated-${event.requestId}-${event.index}`;
          if (state.images.some((image) => image.id === id)) return state;
          const extension = event.image.mimeType === 'image/jpeg' ? 'jpg' : event.image.mimeType.split('/')[1];
          return {
            ...state,
            images: [...state.images, {
              id,
              name: `generated-image-${event.index + 1}.${extension}`,
              mimeType: event.image.mimeType,
              dataUrl: event.image.dataUrl,
              source: 'generated',
            }],
          };
        }
        case 'usage':
          return state;
        case 'completed':
          return { ...state, status: 'completed' };
        case 'failed':
          return event.error.code === 'REQUEST_CANCELLED'
            ? { ...state, status: 'cancelled', error: undefined }
            : {
                ...state,
                status: 'failed',
                error: event.error as SerializedAppError,
              };
      }
    }
  }
}
