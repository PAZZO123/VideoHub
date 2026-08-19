import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { DownloadRefusalReason } from '@videohub/types';
import { DownloadPolicyService } from './download-policy.service';
import * as networkGuard from './network-guard';

describe('DownloadPolicyService', () => {
  let moduleRef: TestingModule;
  let service: DownloadPolicyService;

  beforeEach(async () => {
    // DNS is stubbed so these tests assert policy, not network conditions.
    // network-guard.spec.ts covers the resolution logic itself.
    jest
      .spyOn(networkGuard, 'resolveHostSafely')
      .mockResolvedValue({ safe: true, addresses: ['93.184.216.34'] });

    moduleRef = await Test.createTestingModule({
      providers: [
        DownloadPolicyService,
        {
          provide: ConfigService,
          // Empty list means "use the built-in allowlist".
          useValue: { get: () => ({ allowedHosts: [], maxMb: 1024 }) },
        },
      ],
    }).compile();

    service = moduleRef.get(DownloadPolicyService);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await moduleRef.close();
  });

  describe('malformed input', () => {
    it.each([
      ['', 'empty'],
      ['   ', 'whitespace'],
      ['not a url', 'not a url'],
      ['ftp://example.com/file.mp4', 'ftp'],
      ['file:///etc/passwd', 'file'],
      ['javascript:alert(1)', 'javascript'],
      ['data:video/mp4;base64,AAAA', 'data'],
    ])('refuses %s (%s)', async (url) => {
      const decision = await service.evaluate(url);
      expect(decision.permitted).toBe(false);
      expect(decision.refusalReason).toBe(DownloadRefusalReason.UNSUPPORTED_URL);
    });
  });

  describe('protected platforms', () => {
    it.each([
      ['https://www.netflix.com/watch/80100172', DownloadRefusalReason.PROTECTED_CONTENT],
      ['https://www.disneyplus.com/movies/x/y', DownloadRefusalReason.PROTECTED_CONTENT],
      ['https://www.primevideo.com/detail/x', DownloadRefusalReason.PROTECTED_CONTENT],
      ['https://www.hulu.com/watch/x', DownloadRefusalReason.PROTECTED_CONTENT],
      ['https://tv.apple.com/movie/x', DownloadRefusalReason.PROTECTED_CONTENT],
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', DownloadRefusalReason.ROBOTS_DISALLOWED],
      ['https://youtu.be/dQw4w9WgXcQ', DownloadRefusalReason.ROBOTS_DISALLOWED],
      ['https://vimeo.com/12345', DownloadRefusalReason.ROBOTS_DISALLOWED],
    ])('refuses %s', async (url, reason) => {
      const decision = await service.evaluate(url);
      expect(decision.permitted).toBe(false);
      expect(decision.refusalReason).toBe(reason);
    });

    it('refuses subdomains of a protected platform', async () => {
      const decision = await service.evaluate('https://music.youtube.com/watch?v=x');
      expect(decision.permitted).toBe(false);
    });

    it('always returns the original URL so the UI can link to the source', async () => {
      const decision = await service.evaluate('https://www.netflix.com/watch/80100172');
      expect(decision.normalisedUrl).toContain('netflix.com');
    });

    it('gives a message that explains rather than just refusing', async () => {
      const decision = await service.evaluate('https://www.netflix.com/watch/1');
      expect(decision.message.length).toBeGreaterThan(40);
      expect(decision.message.toLowerCase()).toContain('does not bypass');
    });
  });

  describe('credentials in the URL', () => {
    it('refuses a URL carrying a username and password', async () => {
      const decision = await service.evaluate('https://user:pass@archive.org/details/x');
      expect(decision.permitted).toBe(false);
      expect(decision.refusalReason).toBe(DownloadRefusalReason.REQUIRES_AUTH);
    });

    it('refuses a URL carrying only a username', async () => {
      const decision = await service.evaluate('https://user@archive.org/details/x');
      expect(decision.permitted).toBe(false);
      expect(decision.refusalReason).toBe(DownloadRefusalReason.REQUIRES_AUTH);
    });
  });

  describe('allowlist', () => {
    it('permits an allowlisted host', async () => {
      const decision = await service.evaluate('https://archive.org/details/night_of_the_living_dead');
      expect(decision.permitted).toBe(true);
      expect(decision.refusalReason).toBeNull();
    });

    it('permits a subdomain of an allowlisted host', async () => {
      const decision = await service.evaluate('https://ia800207.archive.org/file.mp4');
      expect(decision.permitted).toBe(true);
    });

    it('refuses a host that is not on the list', async () => {
      const decision = await service.evaluate('https://random-file-host.example/video.mp4');
      expect(decision.permitted).toBe(false);
      expect(decision.refusalReason).toBe(DownloadRefusalReason.HOST_NOT_ALLOWED);
    });

    it('does not treat a lookalike domain as allowlisted', async () => {
      // `archive.org.evil.com` ends with neither `archive.org` nor `.archive.org`.
      const decision = await service.evaluate('https://archive.org.evil.com/x.mp4');
      expect(decision.permitted).toBe(false);
      expect(decision.refusalReason).toBe(DownloadRefusalReason.HOST_NOT_ALLOWED);
    });

    it('is case-insensitive about the host', async () => {
      const decision = await service.evaluate('https://ARCHIVE.ORG/details/x');
      expect(decision.permitted).toBe(true);
    });
  });

  describe('SSRF', () => {
    it('refuses an allowlisted host that resolves to a private address', async () => {
      jest
        .spyOn(networkGuard, 'resolveHostSafely')
        .mockResolvedValue({ safe: false, reason: 'loopback (127.0.0.0/8)', addresses: [] });

      const decision = await service.evaluate('https://archive.org/details/x');
      expect(decision.permitted).toBe(false);
      expect(decision.refusalReason).toBe(DownloadRefusalReason.HOST_NOT_ALLOWED);
    });

    it('does not disclose the blocked range to the caller', async () => {
      jest
        .spyOn(networkGuard, 'resolveHostSafely')
        .mockResolvedValue({ safe: false, reason: 'loopback (127.0.0.0/8)', addresses: [] });

      const decision = await service.evaluate('https://archive.org/details/x');
      expect(decision.message).not.toContain('127.0.0');
      expect(decision.internalNote).toContain('loopback');
    });
  });

  describe('normalisation', () => {
    it('strips the fragment', async () => {
      const decision = await service.evaluate('https://archive.org/details/x#t=42');
      expect(decision.normalisedUrl).not.toContain('#');
    });

    it('preserves the query string', async () => {
      const decision = await service.evaluate('https://archive.org/download/x?format=mp4');
      expect(decision.normalisedUrl).toContain('format=mp4');
    });

    it('trims surrounding whitespace', async () => {
      const decision = await service.evaluate('  https://archive.org/details/x  ');
      expect(decision.permitted).toBe(true);
    });
  });

  describe('redirects', () => {
    it('re-evaluates a redirect target against the same rules', async () => {
      const decision = await service.evaluateRedirect(
        'https://www.netflix.com/watch/1',
        'https://archive.org/details/x',
      );
      expect(decision.permitted).toBe(false);
      expect(decision.refusalReason).toBe(DownloadRefusalReason.PROTECTED_CONTENT);
    });

    it('resolves a relative redirect against the current URL', async () => {
      const decision = await service.evaluateRedirect(
        '/download/other.mp4',
        'https://archive.org/details/x',
      );
      expect(decision.permitted).toBe(true);
      expect(decision.normalisedUrl).toBe('https://archive.org/download/other.mp4');
    });

    it('refuses a redirect that leaves the allowlist', async () => {
      const decision = await service.evaluateRedirect(
        'https://evil.example/payload.mp4',
        'https://archive.org/details/x',
      );
      expect(decision.permitted).toBe(false);
    });
  });

  describe('supportedHosts', () => {
    it('exposes the allowlist with a stated basis for each entry', () => {
      const hosts = service.supportedHosts;
      expect(hosts.length).toBeGreaterThan(0);
      expect(hosts.every((h) => h.basis.length > 0)).toBe(true);
      expect(hosts.some((h) => h.host === 'archive.org')).toBe(true);
    });
  });
});
