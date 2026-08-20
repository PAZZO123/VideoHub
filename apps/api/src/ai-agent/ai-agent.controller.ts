import { Body, Controller, Delete, Get, Param, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AIConversationDto, RecommendationDto } from '@videohub/types';
import type { Request, Response } from 'express';
import { CurrentUser, OptionalAuth, RawResponse, type RequestUser } from '../common/decorators';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { AiAgentService } from './ai-agent.service';
import { SendMessageDto } from './dto/ai.dto';

@ApiTags('ai')
@Controller('ai')
export class AiAgentController {
  constructor(
    private readonly aiAgent: AiAgentService,
    private readonly recommendations: RecommendationsService,
  ) {}

  @ApiBearerAuth()
  @Get('conversations')
  @ApiOperation({ summary: 'List your conversations' })
  listConversations(@CurrentUser('id') userId: string): Promise<AIConversationDto[]> {
    return this.aiAgent.listConversations(userId);
  }

  @ApiBearerAuth()
  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get one conversation with its messages' })
  getConversation(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<AIConversationDto> {
    return this.aiAgent.getConversation(userId, id);
  }

  @ApiBearerAuth()
  @Delete('conversations/:id')
  @ApiOperation({ summary: 'Delete a conversation' })
  deleteConversation(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<{ removed: true }> {
    return this.aiAgent.deleteConversation(userId, id);
  }

  // Open to everyone, signed in or not. A guest's thread is created with no
  // owner and is never listed; their conversation id is the only handle to it.
  //
  // AI calls cost money per request, so this ceiling is deliberately low and
  // configurable — a public deployment must not be able to run up a bill. With
  // no account to key on, the throttler falls back to the caller's IP, which is
  // exactly what is wanted for anonymous traffic.
  @OptionalAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('chat')
  @ApiOperation({
    summary: 'Send a message and get the full reply',
    description:
      'Non-streaming. Use /ai/stream for token-by-token output. No account required; signing in keeps the conversation in your history.',
  })
  @ApiResponse({ status: 503, description: 'The AI provider is unavailable.' })
  chat(@CurrentUser() user: RequestUser | undefined, @Body() dto: SendMessageDto) {
    return this.aiAgent.sendMessage(user?.id ?? null, dto.message, dto.conversationId, { user });
  }

  @OptionalAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RawResponse()
  @Post('stream')
  @ApiOperation({
    summary: 'Send a message and stream the reply over SSE',
    description:
      'Emits `conversation`, then `token` per chunk, then `done` with the saved message (or `error`).',
  })
  async stream(
    @CurrentUser() user: RequestUser | undefined,
    @Body() dto: SendMessageDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    // Stops nginx and similar from buffering the stream into one lump.
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    // Lets the provider stop generating the moment the client goes away, so an
    // abandoned tab does not keep burning tokens.
    const controller = new AbortController();
    request.on('close', () => controller.abort());

    try {
      for await (const event of this.aiAgent.streamReply(
        user?.id ?? null,
        dto.message,
        dto.conversationId,
        { user },
        controller.signal,
      )) {
        if (response.writableEnded) break;
        response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    } catch {
      if (!response.writableEnded) {
        response.write(
          `event: error\ndata: ${JSON.stringify({
            type: 'error',
            message: 'VideoHub AI could not answer just now. Please try again.',
          })}\n\n`,
        );
      }
    } finally {
      if (!response.writableEnded) response.end();
    }
  }

  @OptionalAuth()
  @Get('recommendations')
  @ApiOperation({
    summary: 'Blended recommendations',
    description:
      'Combines trending, genre similarity and your own history. Falls back to trending for guests and new accounts. No AI call, so it is fast and free.',
  })
  recommendationsFor(@CurrentUser() user?: RequestUser): Promise<RecommendationDto[]> {
    return this.recommendations.forUser(user?.id, { user });
  }
}
