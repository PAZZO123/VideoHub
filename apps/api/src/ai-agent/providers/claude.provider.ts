import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI } from '@videohub/config';
import type { AppConfig } from '../../config/configuration';
import {
  SYSTEM_PROMPT,
  type AIMessage,
  type AIProvider,
  type AIRequestOptions,
  type AIResult,
} from '../ai-provider.interface';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Anthropic's Messages API.
 *
 * Called over plain fetch rather than the SDK: the surface used here is small,
 * and it keeps the dependency footprint down on a free-tier deployment.
 *
 * Note that a Claude Pro subscription does not include API access — the API is
 * billed separately. `AI_PROVIDER=mock` remains the default for development.
 */
@Injectable()
export class ClaudeProvider implements AIProvider {
  readonly name = 'claude';
  private readonly logger = new Logger(ClaudeProvider.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(config: ConfigService<AppConfig, true>) {
    const ai = config.get('ai', { infer: true });
    this.apiKey = ai.anthropicApiKey;
    this.model = ai.anthropicModel;
    this.maxTokens = ai.maxTokens;
  }

  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async generateResponse(messages: AIMessage[], options?: AIRequestOptions): Promise<AIResult> {
    const response = await this.request(messages, options, false);
    const payload = (await response.json()) as AnthropicResponse;

    const content = payload.content
      ?.filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (!content) throw new Error('Claude returned an empty response.');

    return {
      content,
      provider: this.name,
      tokensUsed:
        (payload.usage?.input_tokens ?? 0) + (payload.usage?.output_tokens ?? 0) || null,
    };
  }

  async *streamResponse(
    messages: AIMessage[],
    options?: AIRequestOptions,
  ): AsyncGenerator<string, AIResult, undefined> {
    const response = await this.request(messages, options, true);
    const body = response.body;
    if (!body) throw new Error('Claude returned no response body.');

    const reader = body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    let content = '';
    let tokensUsed: number | null = null;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line; a partial frame stays in
        // the buffer until the rest of it arrives.
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
          if (!dataLine) continue;

          const raw = dataLine.slice(5).trim();
          if (!raw || raw === '[DONE]') continue;

          let event: AnthropicStreamEvent;
          try {
            event = JSON.parse(raw) as AnthropicStreamEvent;
          } catch {
            continue;
          }

          if (event.type === 'content_block_delta' && event.delta?.text) {
            content += event.delta.text;
            yield event.delta.text;
          }

          if (event.type === 'message_delta' && event.usage?.output_tokens) {
            tokensUsed = event.usage.output_tokens;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { content: content.trim(), provider: this.name, tokensUsed };
  }

  private async request(
    messages: AIMessage[],
    options: AIRequestOptions | undefined,
    stream: boolean,
  ): Promise<Response> {
    if (!this.isConfigured) {
      throw new Error('ANTHROPIC_API_KEY is not set.');
    }

    // Anthropic takes the system prompt as a top-level field, not a message.
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const conversation = messages
      .filter((m) => m.role !== 'system')
      .slice(-AI.MAX_HISTORY_MESSAGES);

    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options?.maxTokens ?? this.maxTokens,
        system: system || SYSTEM_PROMPT,
        messages: conversation.map((m) => ({ role: m.role, content: m.content })),
        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(stream ? { stream: true } : {}),
      }),
      signal: options?.signal ?? AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      // Logged, never returned — the body can echo the prompt back.
      this.logger.error(`Claude API ${response.status}: ${detail.slice(0, 500)}`);
      throw new Error(`Claude API responded ${response.status}`);
    }

    return response;
  }
}

interface AnthropicResponse {
  content?: { type: string; text: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface AnthropicStreamEvent {
  type: string;
  delta?: { text?: string };
  usage?: { output_tokens?: number };
}
