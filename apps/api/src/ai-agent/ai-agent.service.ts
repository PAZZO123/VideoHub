import { Inject, Injectable, Logger } from '@nestjs/common';
import { AIRole, Prisma } from '@prisma/client';
import { AI } from '@videohub/config';
import {
  ErrorCode,
  type AIConversationDto,
  type AIMessageDto,
  type AIRecommendationDto,
} from '@videohub/types';
import type { VisibilityContext } from '../common/content-visibility';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import {
  AI_PROVIDER,
  SYSTEM_PROMPT,
  type AIMessage,
  type AIProvider,
} from './ai-provider.interface';

const CONVERSATION_INCLUDE = {
  messages: { orderBy: { createdAt: 'asc' as const } },
} as const;

type ConversationRow = Prisma.AIConversationGetPayload<{ include: typeof CONVERSATION_INCLUDE }>;
type MessageRow = Prisma.AIMessageGetPayload<Record<string, never>>;

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recommendations: RecommendationsService,
    @Inject(AI_PROVIDER) private readonly provider: AIProvider,
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  async listConversations(userId: string): Promise<AIConversationDto[]> {
    const conversations = await this.prisma.aIConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    return conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    }));
  }

  async getConversation(userId: string, conversationId: string): Promise<AIConversationDto> {
    const conversation = await this.prisma.aIConversation.findFirst({
      where: { id: conversationId, userId },
      include: CONVERSATION_INCLUDE,
    });

    if (!conversation) {
      throw AppException.notFound(
        ErrorCode.CONVERSATION_NOT_FOUND,
        'That conversation could not be found.',
      );
    }

    return this.toConversationDto(conversation);
  }

  async deleteConversation(userId: string, conversationId: string): Promise<{ removed: true }> {
    const { count } = await this.prisma.aIConversation.deleteMany({
      where: { id: conversationId, userId },
    });

    if (count === 0) {
      throw AppException.notFound(
        ErrorCode.CONVERSATION_NOT_FOUND,
        'That conversation could not be found.',
      );
    }

    return { removed: true };
  }

  /**
   * Streams a reply.
   *
   * The user's message is persisted *before* generation starts, so a failure
   * mid-stream still leaves a coherent conversation rather than losing what they
   * typed. The assistant message is written once the stream completes.
   */
  async *streamReply(
    userId: string,
    message: string,
    conversationId: string | undefined,
    context: VisibilityContext,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent, void, undefined> {
    const conversation = await this.resolveConversation(userId, conversationId, message);

    yield { type: 'conversation', conversationId: conversation.id };

    await this.prisma.aIMessage.create({
      data: { conversationId: conversation.id, role: AIRole.USER, content: message },
    });

    const prompt = await this.buildPrompt(conversation.id, context);

    let content = '';
    let provider = this.provider.name;
    let tokensUsed: number | null = null;

    try {
      const stream = this.provider.streamResponse(prompt, {
        signal,
        maxTokens: AI.DEFAULT_MAX_TOKENS,
      });

      for (;;) {
        const next = await stream.next();
        if (next.done) {
          const result = next.value;
          content = result.content || content;
          provider = result.provider;
          tokensUsed = result.tokensUsed;
          break;
        }
        content += next.value;
        yield { type: 'token', token: next.value };
      }
    } catch (error: unknown) {
      this.logger.error(
        `AI generation failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );

      // The user's message is already saved; report the failure and stop rather
      // than persisting a half-written reply.
      yield {
        type: 'error',
        message:
          'VideoHub AI could not answer just now. Please try again in a moment.',
      };
      return;
    }

    const recommendations = await this.buildRecommendations(content, context);

    const saved = await this.prisma.aIMessage.create({
      data: {
        conversationId: conversation.id,
        role: AIRole.ASSISTANT,
        content,
        recommendations: recommendations as unknown as Prisma.InputJsonValue,
        provider,
        tokensUsed,
      },
    });

    await this.prisma.aIConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    yield {
      type: 'done',
      message: this.toMessageDto(saved, recommendations),
    };
  }

  /** Non-streaming variant, used by tests and clients that cannot take SSE. */
  async sendMessage(
    userId: string,
    message: string,
    conversationId: string | undefined,
    context: VisibilityContext,
  ): Promise<{ conversationId: string; message: AIMessageDto }> {
    const conversation = await this.resolveConversation(userId, conversationId, message);

    await this.prisma.aIMessage.create({
      data: { conversationId: conversation.id, role: AIRole.USER, content: message },
    });

    const prompt = await this.buildPrompt(conversation.id, context);

    let result;
    try {
      result = await this.provider.generateResponse(prompt, {
        maxTokens: AI.DEFAULT_MAX_TOKENS,
      });
    } catch (error: unknown) {
      this.logger.error(
        `AI generation failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw AppException.serviceUnavailable(
        ErrorCode.AI_UNAVAILABLE,
        'VideoHub AI is unavailable right now. Please try again in a moment.',
      );
    }

    const recommendations = await this.buildRecommendations(result.content, context);

    const saved = await this.prisma.aIMessage.create({
      data: {
        conversationId: conversation.id,
        role: AIRole.ASSISTANT,
        content: result.content,
        recommendations: recommendations as unknown as Prisma.InputJsonValue,
        provider: result.provider,
        tokensUsed: result.tokensUsed,
      },
    });

    await this.prisma.aIConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return {
      conversationId: conversation.id,
      message: this.toMessageDto(saved, recommendations),
    };
  }

  private async resolveConversation(
    userId: string,
    conversationId: string | undefined,
    firstMessage: string,
  ): Promise<{ id: string }> {
    if (conversationId) {
      const existing = await this.prisma.aIConversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true },
      });
      if (!existing) {
        throw AppException.notFound(
          ErrorCode.CONVERSATION_NOT_FOUND,
          'That conversation could not be found.',
        );
      }
      return existing;
    }

    return this.prisma.aIConversation.create({
      data: { userId, title: this.titleFrom(firstMessage) },
      select: { id: true },
    });
  }

  /**
   * Assembles the prompt: system rules, the catalogue the model may recommend
   * from, then the recent conversation.
   */
  private async buildPrompt(
    conversationId: string,
    context: VisibilityContext,
  ): Promise<AIMessage[]> {
    const [catalogue, history] = await Promise.all([
      this.recommendations.catalogueForPrompt(context),
      this.prisma.aIMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        // Only recent turns are sent; older ones cost tokens for little gain.
        take: AI.MAX_HISTORY_MESSAGES,
      }),
    ]);

    const conversation: AIMessage[] = history
      .reverse()
      .filter((row) => row.role !== AIRole.SYSTEM)
      .map((row) => ({
        role: row.role === AIRole.USER ? ('user' as const) : ('assistant' as const),
        content: row.content,
      }));

    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: catalogue },
      ...conversation,
    ];
  }

  /** Turns titles the assistant named into real, linkable cards. */
  private async buildRecommendations(
    content: string,
    context: VisibilityContext,
  ): Promise<AIRecommendationDto[]> {
    const movies = await this.recommendations.resolveMentioned(content, context);

    return movies.map((movie) => ({
      movieId: movie.id,
      videoId: null,
      title: movie.title,
      reason: this.reasonFor(movie.title, content),
      rating: movie.rating,
      genres: movie.genres.map((genre) => genre.name),
      posterUrl: movie.posterUrl,
      sources: [],
    }));
  }

  /** Pulls the "Why:" line the system prompt asks for, per title. */
  private reasonFor(title: string, content: string): string {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`\\*\\*${escaped}[^\\n]*\\n+Why:\\s*(.+)`, 'i').exec(content);
    return match?.[1]?.trim() ?? 'Recommended for you.';
  }

  private titleFrom(message: string): string {
    const trimmed = message.trim().replace(/\s+/g, ' ');
    return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed || 'New conversation';
  }

  private toConversationDto(conversation: ConversationRow): AIConversationDto {
    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messages: conversation.messages.map((message) =>
        this.toMessageDto(message, this.readRecommendations(message.recommendations)),
      ),
    };
  }

  /**
   * Reads the stored recommendation payload back out of the JSON column.
   *
   * Prisma types this as `JsonValue`, which is genuinely wider than what we
   * wrote — so it is narrowed by checking it is an array rather than asserted.
   */
  private readRecommendations(value: Prisma.JsonValue): AIRecommendationDto[] {
    return Array.isArray(value) ? (value as unknown as AIRecommendationDto[]) : [];
  }

  private toMessageDto(message: MessageRow, recommendations: AIRecommendationDto[]): AIMessageDto {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      recommendations,
      createdAt: message.createdAt.toISOString(),
    };
  }
}

export type StreamEvent =
  | { type: 'conversation'; conversationId: string }
  | { type: 'token'; token: string }
  | { type: 'done'; message: AIMessageDto }
  | { type: 'error'; message: string };
