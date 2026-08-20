import { ArchiveOrgProvider } from './archive.provider';

/**
 * The provider is tested against a stubbed `fetch` — no test reaches
 * archive.org. A suite that depends on a third party being up is a suite that
 * fails for reasons that have nothing to do with the code.
 */
describe('ArchiveOrgProvider', () => {
  let provider: ArchiveOrgProvider;
  let fetchMock: jest.Mock;

  const metadata = (overrides: Record<string, unknown> = {}, files?: unknown[]) => ({
    metadata: {
      title: 'Big Buck Bunny',
      description: 'A <b>large</b> rabbit&nbsp;&amp; friends.',
      licenseurl: 'http://creativecommons.org/licenses/by/3.0/',
      date: '2008-05-20',
      creator: 'Blender Foundation',
      ...overrides,
    },
    files: files ?? [
      { name: 'source.avi', format: 'Cinepack', size: '900000000' },
      { name: 'bunny_512kb.mp4', format: '512Kb MPEG4', size: '40000000', length: '596.5' },
      { name: 'bunny.mp4', format: 'h.264', size: '300000000', length: '596.5' },
    ],
  });

  const reply = (body: unknown, ok = true, status = 200) => ({
    ok,
    status,
    json: async () => body,
  });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    provider = new ArchiveOrgProvider();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getById', () => {
    it('builds a direct, playable URL from the item and file name', async () => {
      fetchMock.mockResolvedValue(reply(metadata()));

      const video = await provider.getById('BigBuckBunny_124');

      expect(video?.playbackUrl).toBe(
        'https://archive.org/download/BigBuckBunny_124/bunny_512kb.mp4',
      );
    });

    it('prefers the small derivative over the full-size file', async () => {
      // A viewer on a mobile connection should not be handed 300 MB when a
      // 40 MB derivative of the same film exists.
      fetchMock.mockResolvedValue(reply(metadata()));

      const video = await provider.getById('BigBuckBunny_124');

      expect(video?.sizeBytes).toBe(40_000_000);
    });

    it('ignores formats that no browser can play', async () => {
      fetchMock.mockResolvedValue(
        reply(metadata({}, [{ name: 'reel.avi', format: 'Cinepack', size: '10' }])),
      );

      expect(await provider.getById('OnlyAvi')).toBeNull();
    });

    it('returns null when the item does not exist', async () => {
      fetchMock.mockResolvedValue(reply({}));

      expect(await provider.getById('does-not-exist')).toBeNull();
    });

    it('strips HTML out of the description', async () => {
      fetchMock.mockResolvedValue(reply(metadata()));

      const video = await provider.getById('BigBuckBunny_124');

      expect(video?.description).toBe('A large rabbit & friends.');
    });

    it('reads the duration', async () => {
      fetchMock.mockResolvedValue(reply(metadata()));

      expect((await provider.getById('BigBuckBunny_124'))?.durationSeconds).toBe(597);
    });

    it('reads an hh:mm:ss duration too', async () => {
      fetchMock.mockResolvedValue(
        reply(
          metadata({}, [
            { name: 'a_512kb.mp4', format: '512Kb MPEG4', size: '10', length: '1:04:23' },
          ]),
        ),
      );

      expect((await provider.getById('x'))?.durationSeconds).toBe(3863);
    });
  });

  describe('licensing', () => {
    it.each([
      ['http://creativecommons.org/licenses/by/3.0/', true, 'CC BY 3.0'],
      ['http://creativecommons.org/publicdomain/mark/1.0/', true, 'Public Domain'],
      ['http://creativecommons.org/licenses/publicdomain/', true, 'Public Domain'],
      ['http://creativecommons.org/licenses/by-sa/4.0/', true, 'CC BY-SA 4.0'],
    ])('treats %s as redistributable', async (licenseurl, expected, label) => {
      fetchMock.mockResolvedValue(reply(metadata({ licenseurl })));

      const video = await provider.getById('x');

      expect(video?.redistributable).toBe(expected);
      expect(video?.licence).toBe(label);
    });

    it('refuses to assume redistribution when no licence is stated', async () => {
      // The whole download policy hangs off this flag. An item that merely
      // happens to be reachable is not an item we may hand out.
      fetchMock.mockResolvedValue(reply(metadata({ licenseurl: undefined })));

      expect((await provider.getById('x'))?.redistributable).toBe(false);
    });

    it('does not treat a non-commercial licence as redistributable', async () => {
      fetchMock.mockResolvedValue(
        reply(metadata({ licenseurl: 'http://creativecommons.org/licenses/by-nc-nd/4.0/' })),
      );

      expect((await provider.getById('x'))?.redistributable).toBe(false);
    });
  });

  describe('search', () => {
    it('drops results that have no playable file rather than storing a dead link', async () => {
      fetchMock
        .mockResolvedValueOnce(
          reply({ response: { docs: [{ identifier: 'good' }, { identifier: 'bad' }] } }),
        )
        .mockResolvedValueOnce(reply(metadata()))
        .mockResolvedValueOnce(reply(metadata({}, [{ name: 'x.avi', format: 'Cinepack' }])));

      const results = await provider.search('collection:(feature_films)', 2);

      expect(results).toHaveLength(1);
      expect(results[0]?.externalId).toBe('good');
    });

    it('survives an upstream outage without throwing', async () => {
      // A sync must degrade to "found nothing", not take the process down.
      fetchMock.mockResolvedValue(reply(null, false, 503));

      await expect(provider.search('anything', 5)).resolves.toEqual([]);
    });

    it('survives a network error without throwing', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNRESET'));

      await expect(provider.search('anything', 5)).resolves.toEqual([]);
    });
  });
});
