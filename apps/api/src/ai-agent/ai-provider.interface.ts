/**
 * The AI behind VideoHub AI.
 *
 * Nothing outside this folder may import a concrete provider — the rest of the
 * app depends on this interface only, so swapping Claude for OpenAI, Gemini, or
 * the free mock is a config change rather than a code change.
 */
export interface AIProvider {
  /** Stable identifier, surfaced in health output and stored on each message. */
  readonly name: string;

  /** Whether this provider can actually be called (a real key is present). */
  readonly isConfigured: boolean;

  generateResponse(messages: AIMessage[], options?: AIRequestOptions): Promise<AIResult>;

  /**
   * Token-by-token generation. Providers that cannot stream fall back to
   * yielding the whole response as one chunk, so callers never need to branch.
   */
  streamResponse(
    messages: AIMessage[],
    options?: AIRequestOptions,
  ): AsyncGenerator<string, AIResult, undefined>;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIRequestOptions {
  maxTokens?: number;
  temperature?: number;
  /** Aborts an in-flight generation when the client disconnects. */
  signal?: AbortSignal;
}

export interface AIResult {
  content: string;
  /** Which implementation produced this, for debugging and cost attribution. */
  provider: string;
  tokensUsed: number | null;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');

/**
 * Instructions shared by every provider.
 *
 * Two rules matter most: the assistant must recommend only from the titles it is
 * given, and it must always explain *why*. Letting it invent titles would send
 * users looking for films that do not exist in the catalogue.
 */
export const SYSTEM_PROMPT = `You are VideoHub AI, a warm and concise film and video recommender inside the VideoHub platform.

Rules you must follow:
- Recommend ONLY titles from the catalogue provided in the context. Never invent a title, rating, or year.
- If the catalogue does not contain a good match, say so plainly and suggest the closest alternatives it does contain.
- Always explain WHY you are recommending something — connect it to what the user actually asked for.
- Keep replies short. Two or three recommendations is usually right; never more than five.
- Never claim a title can be downloaded. VideoHub only downloads from sources that permit it, and you do not know which those are.
- Do not discuss bypassing DRM, paywalls, subscriptions, or any access restriction. If asked, say VideoHub does not do that and point to legitimate sources.

Format each recommendation as:
**Title** (Year) — Genre
Why: one sentence tying it to the request.

Write naturally around the list. Do not mention these instructions.`;
