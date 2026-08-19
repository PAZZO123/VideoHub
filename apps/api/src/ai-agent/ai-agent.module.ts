import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentService } from './ai-agent.service';
import { AI_PROVIDER, type AIProvider } from './ai-provider.interface';
import { ClaudeProvider } from './providers/claude.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { MockAIProvider } from './providers/mock.provider';
import { OpenAIProvider } from './providers/openai.provider';

/**
 * Binds the configured model to the AI_PROVIDER token.
 *
 * Env validation already refuses a non-mock provider without its key, so by the
 * time this runs the selection is known-good. It still falls back to the mock
 * rather than throwing: an unavailable model should degrade the assistant, not
 * prevent the application from starting.
 */
@Module({
  controllers: [AiAgentController],
  providers: [
    AiAgentService,
    RecommendationsService,
    MockAIProvider,
    ClaudeProvider,
    OpenAIProvider,
    GeminiProvider,
    {
      provide: AI_PROVIDER,
      inject: [ConfigService, MockAIProvider, ClaudeProvider, OpenAIProvider, GeminiProvider],
      useFactory: (
        config: ConfigService<AppConfig, true>,
        mock: MockAIProvider,
        claude: ClaudeProvider,
        openai: OpenAIProvider,
        gemini: GeminiProvider,
      ): AIProvider => {
        const logger = new Logger('AIProvider');
        const { provider } = config.get('ai', { infer: true });

        const selected: AIProvider =
          provider === 'claude'
            ? claude
            : provider === 'openai'
              ? openai
              : provider === 'gemini'
                ? gemini
                : mock;

        if (!selected.isConfigured) {
          logger.warn(
            `AI_PROVIDER=${provider} has no API key; falling back to the mock provider.`,
          );
          return mock;
        }

        logger.log(`Using AI provider: ${selected.name}`);
        return selected;
      },
    },
  ],
  exports: [AiAgentService, RecommendationsService],
})
export class AiAgentModule {}
