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

const OPENAI_API = 'https://api.openai.com/v1/chat/completions';

/**
 * OpenAI Chat Completions.
 *
 * Also works unchanged against any OpenAI-compatible endpoint (Groq, Together,
 * a local Ollama in OpenAI mode) by pointing `OPENAI_BASE_URL` elsewhere.
 */
@Injectable()
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(config: ConfigService<AppConfig, true>) {
    const ai = config.get('ai', { infer: true });
    this.apiKey = ai.openaiApiKey;
    this.model = ai.openaiModel;
    this.maxTokens = ai.maxTokens;
  }

  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async generateResponse(messages: AIMessage[], options?: AIRequestOptions): Promise<AIResult> {
    const response = await this.request(messages, options, false);
    const payload = (await response.json()) as OpenAIResponse;

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('OpenAI returned an empty response.');

    return {
      content,
      provider: this.name,
      tokensUsed: payload.usage?.total_tokens ?? null,
    };
  }

  async *streamResponse(
    messages: AIMessage[],
    options?: AIRequestOptions,
  ): AsyncGenerator<string, AIResult, undefined> {
    const response = await this.request(messages, options, true);
    const body = response.body;
    if (!body) throw new Error('OpenAI returned no response body.');

    const reader = body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    let content = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
          if (!dataLine) continue;

          const raw = dataLine.slice(5).trim();
          if (!raw || raw === '[DONE]') continue;

          try {
            const event = JSON.parse(raw) as OpenAIStreamEvent;
            const delta = event.choices?.[0]?.delta?.content;
            if (delta) {
              content += delta;
              yield delta;
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
    if (!this.isConfigured) throw new Error('OPENAI_API_KEY is not set.');

    const response = await fetch(OPENAI_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options?.maxTokens ?? this.maxTokens,
        // OpenAI takes the system prompt as a normal message.
        messages: messages.slice(-AI.MAX_HISTORY_MESSAGES).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(stream ? { stream: true } : {}),
      }),
      signal: options?.signal ?? AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(`OpenAI API ${response.status}: ${detail.slice(0, 500)}`);
      throw new Error(`OpenAI API responded ${response.status}`);
    }

    return response;
  }
}

interface OpenAIResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { total_tokens?: number };
}

interface OpenAIStreamEvent {
  choices?: { delta?: { content?: string } }[];
}
