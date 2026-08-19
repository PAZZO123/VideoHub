import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SUGGESTED_PROMPTS } from '@videohub/config';
import type { AIMessageDto, AIRecommendationDto } from '@videohub/types';
import { Film, Plus, Send, Sparkles, Star, Trash2, User } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/cn';
import { aiService } from '@/services/ai.service';

/** A recommendation the assistant made, resolved to a real catalogue record. */
function RecommendationCard({ item }: { item: AIRecommendationDto }): JSX.Element {
  return (
    <li className="flex gap-3 rounded-xl border border-white/[0.08] bg-ink-800 p-3">
      <div className="h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-750">
        {item.posterUrl ? (
          <img src={item.posterUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center">
            <Film className="size-5 text-ink-500" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h4 className="truncate font-semibold text-ink-100">{item.title}</h4>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-400">
          {item.rating !== null && (
            <span className="inline-flex items-center gap-1">
              <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
              {item.rating.toFixed(1)}
            </span>
          )}
          {item.genres.length > 0 && <span>{item.genres.slice(0, 2).join(' / ')}</span>}
        </div>

        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-400">{item.reason}</p>

        {item.movieId && (
          <Link
            to={`/movies/${item.movieId}`}
            className="mt-2 inline-block text-xs font-semibold text-brand-300 hover:text-brand-200"
          >
            View details →
          </Link>
        )}
      </div>
    </li>
  );
}

function MessageBubble({
  message,
  isStreaming = false,
}: {
  message: Pick<AIMessageDto, 'role' | 'content' | 'recommendations'>;
  isStreaming?: boolean;
}): JSX.Element {
  const isUser = message.role === 'USER';

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <span
        aria-hidden="true"
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-lg',
          isUser ? 'bg-ink-700' : 'bg-brand-sheen',
        )}
      >
        {isUser ? (
          <User className="size-4 text-ink-200" />
        ) : (
          <Sparkles className="size-4 text-white" />
        )}
      </span>

      <div className={cn('min-w-0 max-w-[46rem]', isUser && 'flex flex-col items-end')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm leading-relaxed',
            isUser ? 'bg-brand-600 text-white' : 'bg-ink-850 text-ink-100',
          )}
        >
          {/* Markdown-lite: the system prompt only asks for **bold** titles. */}
          <p className="whitespace-pre-wrap">
            {message.content.split(/(\*\*.+?\*\*)/g).map((part, index) =>
              part.startsWith('**') && part.endsWith('**') ? (
                <strong key={index} className="font-semibold text-white">
                  {part.slice(2, -2)}
                </strong>
              ) : (
                part
              ),
            )}
            {isStreaming && (
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-brand-400 align-middle" />
            )}
          </p>
        </div>

        {message.recommendations.length > 0 && (
          <ul className="mt-3 grid w-full gap-2 sm:grid-cols-2">
            {message.recommendations.map((item) => (
              <RecommendationCard key={`${item.movieId ?? item.title}`} item={item} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function AiPage(): JSX.Element {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [messages, setMessages] = useState<AIMessageDto[]>([]);
  const [input, setInput] = useState('');
  const [streamed, setStreamed] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);

  const abortRef = useRef<(() => void) | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const { data: conversations } = useQuery({
    queryKey: ['ai-conversations'],
    queryFn: () => aiService.conversations(),
    enabled: isAuthenticated,
  });

  // Keep the newest message in view as tokens arrive.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streamed]);

  // Stop generating if the user navigates away mid-stream.
  useEffect(() => () => abortRef.current?.(), []);

  const send = (text: string): void => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    setError(null);
    setInput('');
    setStreamed('');
    setIsStreaming(true);

    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        role: 'USER',
        content: trimmed,
        recommendations: [],
        createdAt: new Date().toISOString(),
      },
    ]);

    abortRef.current = aiService.stream(trimmed, conversationId, {
      onConversation: (id) => setConversationId(id),
      onToken: (token) => setStreamed((prev) => prev + token),
      onDone: (message) => {
        setMessages((prev) => [...prev, message]);
        setStreamed('');
        setIsStreaming(false);
        void queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
      },
      onError: (message) => {
        setError(message);
        setStreamed('');
        setIsStreaming(false);
      },
    });
  };

  // A suggested prompt can arrive as ?q= from the homepage CTA.
  useEffect(() => {
    const seeded = searchParams.get('q');
    if (seeded && isAuthenticated && messages.length === 0 && !isStreaming) {
      setSearchParams({}, { replace: true });
      send(seeded);
    }
    // Intentionally runs only on mount and on auth settling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const startNew = (): void => {
    abortRef.current?.();
    setMessages([]);
    setStreamed('');
    setConversationId(undefined);
    setError(null);
    setIsStreaming(false);
  };

  const openConversation = async (id: string): Promise<void> => {
    abortRef.current?.();
    const conversation = await aiService.conversation(id);
    setConversationId(id);
    setMessages(conversation.messages ?? []);
    setStreamed('');
    setError(null);
  };

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-2xl px-4 pb-20 pt-32 text-center sm:px-6">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-sheen">
          <Sparkles className="size-7 text-white" aria-hidden="true" />
        </span>
        <h1 className="mt-6 font-display text-display-md font-bold text-white">VideoHub AI</h1>
        <p className="mt-4 text-ink-400">
          Sign in to chat with VideoHub AI. It recommends from the VideoHub catalogue and always
          explains why.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/login" state={{ from: '/ai' }}>
            <Button size="lg">Sign in</Button>
          </Link>
          <Link to="/register">
            <Button size="lg" variant="outline">
              Create an account
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1400px] gap-6 px-4 pb-24 pt-24 sm:px-6 lg:px-10">
      {/* Conversation list */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <Button
          fullWidth
          variant="outline"
          leftIcon={<Plus className="size-4" />}
          onClick={startNew}
        >
          New conversation
        </Button>

        {conversations && conversations.length > 0 && (
          <nav aria-label="Conversations" className="mt-4">
            <ul className="flex flex-col gap-1">
              {conversations.map((conversation) => (
                <li key={conversation.id} className="group/row flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void openConversation(conversation.id)}
                    className={cn(
                      'min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      conversation.id === conversationId
                        ? 'bg-white/[0.08] text-white'
                        : 'text-ink-300 hover:bg-white/[0.04] hover:text-white',
                    )}
                  >
                    {conversation.title}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${conversation.title}`}
                    onClick={async () => {
                      await aiService.deleteConversation(conversation.id);
                      if (conversation.id === conversationId) startNew();
                      void queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
                    }}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-500 opacity-0 transition-all hover:bg-red-500/15 hover:text-red-400 focus-visible:opacity-100 group-hover/row:opacity-100"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </aside>

      {/* Chat */}
      <div className="flex min-w-0 flex-1 flex-col">
        {messages.length === 0 && !isStreaming ? (
          <div className="py-10 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-sheen">
              <Sparkles className="size-7 text-white" aria-hidden="true" />
            </span>
            <h1 className="mt-6 font-display text-display-md font-bold text-white">
              VideoHub AI
            </h1>
            <p className="mt-3 text-ink-400">
              Describe a mood, a genre, a runtime, or a film you loved.
            </p>

            <ul className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <li key={prompt.text}>
                  <button
                    type="button"
                    onClick={() => send(prompt.text)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-2 text-sm text-ink-200 transition-colors hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
                  >
                    <span aria-hidden="true">{prompt.emoji}</span>
                    {prompt.text}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-col gap-6 py-4" role="log" aria-live="polite">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {isStreaming && (
              <MessageBubble
                message={{ role: 'ASSISTANT', content: streamed, recommendations: [] }}
                isStreaming
              />
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="my-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <div ref={endRef} />

        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            send(input);
          }}
          className="sticky bottom-20 mt-6 sm:bottom-4"
        >
          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-ink-850/95 p-2 backdrop-blur-xl transition-colors focus-within:border-brand-400/60">
            <label htmlFor="ai-input" className="sr-only">
              Message VideoHub AI
            </label>
            <textarea
              id="ai-input"
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends; Shift+Enter makes a new line.
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask for a recommendation…"
              className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-ink-400"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!input.trim() || isStreaming}
              isLoading={isStreaming}
              aria-label="Send message"
            >
              <Send className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
