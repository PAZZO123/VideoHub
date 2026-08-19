import { Injectable } from '@nestjs/common';
import type {
  AIMessage,
  AIProvider,
  AIRequestOptions,
  AIResult,
} from '../ai-provider.interface';

/**
 * A deterministic stand-in for a real model.
 *
 * This is the default provider, and it is what makes the whole application
 * usable and testable at zero cost with no API key. It does not attempt to be
 * clever: it reads the catalogue block the service already assembled, picks
 * titles that match the request, and writes them up in the same shape a real
 * provider is asked to produce — so the UI, persistence, streaming and
 * recommendation-extraction paths are all exercised identically.
 */
@Injectable()
export class MockAIProvider implements AIProvider {
  readonly name = 'mock';
  readonly isConfigured = true;

  async generateResponse(
    messages: AIMessage[],
    _options?: AIRequestOptions,
  ): Promise<AIResult> {
    return {
      content: this.compose(messages),
      provider: this.name,
      tokensUsed: null,
    };
  }

  async *streamResponse(
    messages: AIMessage[],
    options?: AIRequestOptions,
  ): AsyncGenerator<string, AIResult, undefined> {
    const content = this.compose(messages);

    // Emitted word by word so the client's streaming path is genuinely
    // exercised rather than receiving one lump.
    for (const token of content.split(/(\s+)/)) {
      if (options?.signal?.aborted) break;
      yield token;
      await new Promise((resolve) => setTimeout(resolve, 12));
    }

    return { content, provider: this.name, tokensUsed: null };
  }

  private compose(messages: AIMessage[]): string {
    const question = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const catalogue = this.parseCatalogue(messages);

    if (catalogue.length === 0) {
      return "There's nothing in the VideoHub catalogue yet that I can recommend from. Once some titles are added, ask me again and I'll suggest something.";
    }

    const wanted = question.toLowerCase();
    const scored = catalogue
      .map((entry) => ({ entry, score: this.score(entry, wanted) }))
      .sort((a, b) => b.score - a.score || (b.entry.rating ?? 0) - (a.entry.rating ?? 0));

    const picks = scored.slice(0, 3).map(({ entry }) => entry);
    const opener = this.opener(wanted);

    const body = picks
      .map(
        (entry) =>
          `**${entry.title}**${entry.year ? ` (${entry.year})` : ''}${
            entry.genres ? ` — ${entry.genres}` : ''
          }\nWhy: ${this.reason(entry, wanted)}`,
      )
      .join('\n\n');

    return `${opener}\n\n${body}`;
  }

  /**
   * Reads the catalogue block the service injects as a system message.
   * Lines look like: `- Title (Year) | Genre, Genre | rating 8.7 | slug`
   */
  private parseCatalogue(messages: AIMessage[]): CatalogueEntry[] {
    const block = messages.find(
      (m) => m.role === 'system' && m.content.includes('CATALOGUE'),
    )?.content;
    if (!block) return [];

    return block
      .split('\n')
      .filter((line) => line.startsWith('- '))
      .map((line) => {
        const [titlePart = '', genrePart = '', ratingPart = ''] = line.slice(2).split(' | ');
        const yearMatch = /\((\d{4})\)\s*$/.exec(titlePart.trim());
        return {
          title: titlePart.replace(/\s*\(\d{4}\)\s*$/, '').trim(),
          year: yearMatch?.[1] ?? null,
          genres: genrePart.trim() || null,
          rating: Number.parseFloat(ratingPart.replace('rating', '').trim()) || null,
        };
      })
      .filter((entry) => entry.title.length > 0);
  }

  private score(entry: CatalogueEntry, wanted: string): number {
    let score = 0;
    const genres = (entry.genres ?? '').toLowerCase();

    // Genre words in the question are the strongest signal available.
    for (const word of genres.split(/[,\s]+/).filter(Boolean)) {
      if (wanted.includes(word)) score += 10;
    }

    const moods: Record<string, string[]> = {
      funny: ['comedy'],
      laugh: ['comedy'],
      scary: ['horror'],
      frightening: ['horror'],
      family: ['family', 'animation'],
      kids: ['family', 'animation'],
      romantic: ['romance'],
      love: ['romance'],
      space: ['science fiction', 'sci-fi'],
      african: ['african'],
      thrilling: ['thriller'],
      tense: ['thriller'],
    };

    for (const [mood, tags] of Object.entries(moods)) {
      if (wanted.includes(mood) && tags.some((tag) => genres.includes(tag))) score += 8;
    }

    if (entry.title.toLowerCase().split(/\s+/).some((word) => word.length > 3 && wanted.includes(word))) {
      score += 6;
    }

    return score + (entry.rating ?? 0) / 10;
  }

  private opener(wanted: string): string {
    if (wanted.includes('trending')) return "Here's what's moving on VideoHub right now:";
    if (wanted.includes('family') || wanted.includes('kids')) {
      return 'For watching together, these should land well:';
    }
    if (wanted.includes('funny') || wanted.includes('laugh')) {
      return 'For something lighter:';
    }
    return "Based on what you're looking for, I'd recommend:";
  }

  private reason(entry: CatalogueEntry, wanted: string): string {
    const genres = (entry.genres ?? '').toLowerCase();

    if (wanted.includes('short') || wanted.includes('under')) {
      return 'It moves quickly and does not overstay its welcome.';
    }
    if (genres.includes('comedy')) return 'Sharp and genuinely funny, with a light touch.';
    if (genres.includes('horror')) return 'Builds real dread without leaning on cheap shocks.';
    if (genres.includes('animation')) return 'Beautifully animated and easy to watch together.';
    if (genres.includes('romance')) return 'Warm and character-driven rather than saccharine.';
    if (genres.includes('science fiction') || genres.includes('sci-fi')) {
      return 'A strong premise carried by ideas rather than spectacle alone.';
    }
    if (genres.includes('thriller')) return 'Tight, tense, and paced so it never sags.';
    if ((entry.rating ?? 0) >= 8) return 'One of the best-rated titles in the catalogue right now.';
    return 'A solid match for what you described, and well worth the time.';
  }
}

interface CatalogueEntry {
  title: string;
  year: string | null;
  genres: string | null;
  rating: number | null;
}
