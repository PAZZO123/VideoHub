import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI } from '@videohub/config';
import type { AppConfig } from '../../config/configuration';
import type {
  AIMessage,
  AIProvider,
  AIRequestOptions,
  AIResult,
} from '../ai-provider.interface';

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Google Gemini.
 *
 * Gemini's shape differs from the other two: roles are `user` / `model`, the
 * system prompt is `systemInstruction`, and streaming returns a JSON array
 * rather than SSE frames — so the stream is decoded by scanning for whole
 * objects instead of splitting on blank lines.
 */
@Injectable()
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(config: ConfigService<AppConfig, true>) {
    const ai = config.get('ai', { infer: true });
    this.apiKey = ai.geminiApiKey;
    this.model = ai.geminiModel;
    this.maxTokens = ai.maxTokens;
  }

  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async generateResponse(messages: AIMessage[], options?: AIRequestOptions): Promise<AIResult> {
    const response = await this.request(messages, options, false);
    const payload = (await response.json()) as GeminiResponse;

    const content = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();

    if (!content) throw new Error('Gemini returned an empty response.');

    return {
      content,
      provider: this.name,
      tokensUsed: payload.usageMetadata?.totalTokenCount ?? null,
    };
  }

  async *streamResponse(
    messages: AIMessage[],
    options?: AIRequestOptions,
  ): AsyncGenerator<string, AIResult, undefined> {
    const response = await this.request(messages, options, true);
    const body = response.body;
    if (!body) throw new Error('Gemini returned no response body.');

    const reader = body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    let content = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Gemini streams `data: {...}` frames when alt=sse is requested.
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
          if (!dataLine) continue;

          const raw = dataLine.slice(5).trim();
          if (!raw) continue;

          try {
            const event = JSON.parse(raw) as GeminiResponse;
            const chunk = event.candidates?.[0]?.content?.parts
              ?.map((part) => part.text ?? '')
              .join('');
            if (chunk) {
              content += chunk;
              yield chunk;
            }
          } catch {
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { content: content.trim(), provider: this.name, tokensUsed: null };
  }

  private async request(
    messages: AIMessage[],
    options: AIRequestOptions | undefined,
    stream: boolean,
  ): Promise<Response> {
    if (!this.isConfigured) throw new Error('GEMINI_API_KEY is not set.');

    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const contents = messages
      .filter((m) => m.role !== 'system')
      .slice(-AI.MAX_HISTORY_MESSAGES)
      .map((m) => ({
        // Gemini calls the assistant "model".
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const endpoint = stream
      ? `${GEMINI_API}/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`
      : `${GEMINI_API}/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: {
          maxOutputTokens: options?.maxTokens ?? this.maxTokens,
          ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
        },
      }),
      signal: options?.signal ?? AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      // The key is in the URL, so never log the endpoint itself.
      this.logger.error(`Gemini API ${response.status}: ${detail.slice(0, 500)}`);
      throw new Error(`Gemini API responded ${response.status}`);
    }

    return response;
  }
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { totalTokenCount?: number };
}
