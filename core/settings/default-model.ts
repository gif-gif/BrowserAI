/** Model IDs that are clearly not chat/text models (embeddings, speech, images, moderation…). */
const NON_TEXT_MODEL = /(embed|embedding|whisper|tts|audio|speech|transcri|realtime|dall-?e|image|imagen|veo|sora|moderation|rerank|davinci|babbage|search-preview|computer-use)/i;

/** Preferred families, matched against the model ID in list order. */
const PREFERRED_FAMILY = /(claude|gpt|gemini)/i;

export function isTextModel(model: string): boolean {
  return !NON_TEXT_MODEL.test(model);
}

/**
 * Picks the model to preselect after a quick setup: the first Claude / GPT / Gemini text model
 * in the order the Gateway returned them, else the first text model, else the first model.
 */
export function pickDefaultModel(models: readonly string[]): string | undefined {
  const candidates = models.map((model) => model.trim()).filter(Boolean);
  const textModels = candidates.filter(isTextModel);
  return textModels.find((model) => PREFERRED_FAMILY.test(model)) ?? textModels[0] ?? candidates[0];
}
