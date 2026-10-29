export const OPENAI_TEXT_STREAM_CHUNKS = [
  {
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gpt-test',
    choices: [{ index: 0, delta: { role: 'assistant', content: '你' }, finish_reason: null }],
  },
  {
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gpt-test',
    choices: [{ index: 0, delta: { content: '好' }, finish_reason: null }],
  },
  {
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gpt-test',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  },
  {
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gpt-test',
    choices: [],
    usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
  },
] as const;
