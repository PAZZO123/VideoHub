import type { AIMessage } from '../ai-provider.interface';
import { MockAIProvider } from './mock.provider';

const CATALOGUE: AIMessage = {
  role: 'system',
  content: `CATALOGUE — the only titles you may recommend:
- Night of the Living Dead (1968) | Horror, Thriller | rating 7.8 | night-of-the-living-dead-1968
- Big Buck Bunny (2008) | Animation, Comedy, Family | rating 7.4 | big-buck-bunny-2008
- His Girl Friday (1940) | Comedy, Romance | rating 7.9 | his-girl-friday-1940
- Tears of Steel (2012) | Science Fiction, Drama | rating 7.1 | tears-of-steel-2012
- The General (1926) | Comedy, Action, War | rating 8.1 | the-general-1926`,
};

const ask = (text: string): AIMessage[] => [CATALOGUE, { role: 'user', content: text }];

describe('MockAIProvider', () => {
  let provider: MockAIProvider;

  beforeEach(() => {
    provider = new MockAIProvider();
  });

  it('is always usable, so the app works with no API key', () => {
    expect(provider.isConfigured).toBe(true);
  });

  it('only recommends titles that exist in the catalogue', async () => {
    const { content } = await provider.generateResponse(ask('recommend me something'));

    const titles = [...content.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]);
    const known = [
      'Night of the Living Dead',
      'Big Buck Bunny',
      'His Girl Friday',
      'Tears of Steel',
      'The General',
    ];

    expect(titles.length).toBeGreaterThan(0);
    // Inventing a title would send users after films that do not exist.
    for (const title of titles) {
      expect(known).toContain(title?.replace(/\s*\(\d{4}\)\s*$/, ''));
    }
  });

  it('gives every recommendation a reason', async () => {
    const { content } = await provider.generateResponse(ask('something good'));

    const titleCount = [...content.matchAll(/\*\*/g)].length / 2;
    const reasonCount = [...content.matchAll(/^Why:/gm)].length;
    expect(reasonCount).toBe(titleCount);
  });

  it('matches a genre asked for by name', async () => {
    const { content } = await provider.generateResponse(ask('I want a horror movie'));
    expect(content).toContain('Night of the Living Dead');
  });

  it('maps a mood to a genre', async () => {
    const { content } = await provider.generateResponse(ask('give me something funny'));
    // Comedy titles should surface ahead of the horror one.
    expect(content).toMatch(/His Girl Friday|The General|Big Buck Bunny/);
    expect(content).not.toContain('Night of the Living Dead');
  });

  it('handles a family request with family-friendly titles', async () => {
    const { content } = await provider.generateResponse(
      ask('what should I watch with my family?'),
    );
    expect(content).toContain('Big Buck Bunny');
  });

  it('says so plainly when the catalogue is empty rather than inventing titles', async () => {
    const { content } = await provider.generateResponse([
      { role: 'system', content: 'CATALOGUE — the only titles you may recommend:' },
      { role: 'user', content: 'recommend something' },
    ]);

    expect(content).toMatch(/nothing in the VideoHub catalogue/i);
    expect(content).not.toContain('**');
  });

  it('never recommends more than three titles', async () => {
    const { content } = await provider.generateResponse(ask('recommend everything you have'));
    expect([...content.matchAll(/^\*\*/gm)].length).toBeLessThanOrEqual(3);
  });

  it('reports itself as the mock provider', async () => {
    const result = await provider.generateResponse(ask('hello'));
    expect(result.provider).toBe('mock');
  });

  describe('streaming', () => {
    it('emits multiple chunks and returns the assembled content', async () => {
      const stream = provider.streamResponse(ask('recommend a comedy'));

      const chunks: string[] = [];
      let result;
      for (;;) {
        const next = await stream.next();
        if (next.done) {
          result = next.value;
          break;
        }
        chunks.push(next.value);
      }

      expect(chunks.length).toBeGreaterThan(5);
      expect(chunks.join('')).toBe(result.content);
    });

    it('stops early when the caller aborts', async () => {
      const controller = new AbortController();
      const stream = provider.streamResponse(ask('recommend something'), {
        signal: controller.signal,
      });

      await stream.next();
      controller.abort();

      let extra = 0;
      for (;;) {
        const next = await stream.next();
        if (next.done) break;
        extra += 1;
      }

      // An abandoned request must not keep generating.
      expect(extra).toBe(0);
    });
  });
});
