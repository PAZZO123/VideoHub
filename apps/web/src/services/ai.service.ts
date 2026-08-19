import type { AIConversationDto, AIMessageDto, RecommendationDto } from '@videohub/types';
import { api, tokenStore, unwrap } from '@/lib/api-client';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export interface StreamHandlers {
  onConversation?: (conversationId: string) => void;
  onToken?: (token: string) => void;
  onDone?: (message: AIMessageDto) => void;
  onError?: (message: string) => void;
}

export const aiService = {
  conversations(): Promise<AIConversationDto[]> {
    return unwrap(api.get('/ai/conversations'));
  },

  conversation(id: string): Promise<AIConversationDto> {
    return unwrap(api.get(`/ai/conversations/${encodeURIComponent(id)}`));
  },

  deleteConversation(id: string): Promise<{ removed: true }> {
    return unwrap(api.delete(`/ai/conversations/${encodeURIComponent(id)}`));
  },

  chat(message: string, conversationId?: string): Promise<{ conversationId: string; message: AIMessageDto }> {
    return unwrap(api.post('/ai/chat', { message, ...(conversationId ? { conversationId } : {}) }));
  },

  recommendations(): Promise<RecommendationDto[]> {
    return unwrap(api.get('/ai/recommendations'));
  },

  /**
   * Streams a reply over SSE.
   *
   * Uses fetch rather than EventSource because the request must be a POST and
   * carry an Authorization header, neither of which EventSource supports.
   * Returns an abort function so an unmounting component can stop generation.
   */
  stream(
    message: string,
    conversationId: string | undefined,
    handlers: StreamHandlers,
  ): () => void {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(`${API_URL}/ai/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(tokenStore.getAccess()
              ? { Authorization: `Bearer ${tokenStore.getAccess()}` }
              : {}),
          },
          body: JSON.stringify({ message, ...(conversationId ? { conversationId } : {}) }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          handlers.onError?.(
            response.status === 429
              ? 'You are sending messages too quickly. Please wait a moment.'
              : 'VideoHub AI could not answer just now.',
          );
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE frames end with a blank line; a partial frame waits for more.
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';

          for (const frame of frames) {
            const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
            if (!dataLine) continue;

            try {
              const event = JSON.parse(dataLine.slice(5).trim()) as
                | { type: 'conversation'; conversationId: string }
                | { type: 'token'; token: string }
                | { type: 'done'; message: AIMessageDto }
                | { type: 'error'; message: string };

              if (event.type === 'conversation') handlers.onConversation?.(event.conversationId);
              else if (event.type === 'token') handlers.onToken?.(event.token);
              else if (event.type === 'done') handlers.onDone?.(event.message);
              else if (event.type === 'error') handlers.onError?.(event.message);
            } catch {
              continue;
            }
          }
        }
      } catch (error) {
        // An abort is the caller's own doing, not a failure to report.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        handlers.onError?.('Lost connection to VideoHub AI.');
      }
    })();

    return () => controller.abort();
  },
};
