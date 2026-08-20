import { Inject, Injectable, Logger } from '@nestjs/common';
import { MaturityRating, ModerationStatus, SourceAccess } from '@prisma/client';
import {
  ALLOWED_HOSTS,
  DISCOVERY_QUERIES,
  FEATURED_VIDEOS,
  type DiscoveryQuery,
  type FeaturedVideo,
} from '@videohub/config';
import { Readable } from 'node:stream';
import slugify from 'slugify';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.interface';
import {
  VIDEO_CATALOGUE_PROVIDER,
  type ExternalVideo,
  type VideoCatalogueProvider,
} from './video-catalogue.interface';

export interface MirrorOptions {
  mirror: boolean;
  mirrorMaxMb: number;
}

export interface SyncOptions {
  includeDiscovery?: boolean;
  /**
   * Copy the media into our own storage and serve playback from there.
   *
   * Streaming straight from archive.org is slow for viewers: measured from
   * Kigali it returns its first byte after 4-9s and then sustains only
   * 77-153 KB/s, because its storage nodes sit in the US with no CDN in front
   * of them. Mirroring pays that cost once, on the server, so viewers are
   * served from whatever backend StorageService points at.
   */
  mirror?: boolean;
  /** Skip anything larger than this, so one feature film cannot fill the disk. */
  mirrorMaxMb?: number;
}

export interface SyncReport {
  provider: string;
  created: number;
  updated: number;
  skipped: number;
  published: number;
  queuedForReview: number;
  mirrored: number;
  mirrorFailed: number;
  perCategory: Record<string, number>;
}

/**
 * Fills the catalogue with real, playable video from the configured provider.
 *
 * Two rules hold everywhere in here:
 *
 *   1. Ingestion is idempotent. Every row is keyed on `ia-<identifier>`, so a
 *      re-run updates instead of duplicating. Learned the hard way from the
 *      verification fixtures.
 *   2. Nothing is published to the public catalogue unless the curated list
 *      says so. Query results land PENDING in the same moderation queue user
 *      uploads use — one review surface, not two.
 */
@Injectable()
export class CatalogueSyncService {
  private readonly logger = new Logger(CatalogueSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(VIDEO_CATALOGUE_PROVIDER) private readonly provider: VideoCatalogueProvider,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  /** Slug for an ingested item. Stable, so re-runs upsert rather than insert. */
  static slugFor(externalId: string): string {
    const base = slugify(externalId, { lower: true, strict: true }).slice(0, 90);
    return `ia-${base || 'item'}`;
  }

  async sync({
    includeDiscovery = true,
    mirror = false,
    mirrorMaxMb = 200,
  }: SyncOptions = {}): Promise<SyncReport> {
    const report: SyncReport = {
      provider: this.provider.name,
      created: 0,
      updated: 0,
      skipped: 0,
      published: 0,
      queuedForReview: 0,
      mirrored: 0,
      mirrorFailed: 0,
      perCategory: {},
    };

    if (this.provider.name === 'none') {
      this.logger.warn(
        'VIDEO_CATALOGUE_PROVIDER=none — nothing to sync. Set it to `archive` to pull real video.',
      );
      return report;
    }

    const categories = await this.categoryIdsBySlug();

    const mirroring = { mirror, mirrorMaxMb };

    this.logger.log(`Ingesting ${FEATURED_VIDEOS.length} curated titles…`);
    for (const featured of FEATURED_VIDEOS) {
      await this.ingestFeatured(featured, categories, report, mirroring);
    }

    if (includeDiscovery) {
      for (const query of DISCOVERY_QUERIES) {
        await this.ingestQuery(query, categories, report, mirroring);
      }
    }

    return report;
  }

  private async ingestFeatured(
    featured: FeaturedVideo,
    categories: Map<string, string>,
    report: SyncReport,
    mirroring: MirrorOptions,
  ): Promise<void> {
    const external = await this.provider.getById(featured.identifier);

    if (!external) {
      this.logger.warn(
        `Curated title ${featured.identifier} could not be resolved — it may have been removed upstream.`,
      );
      report.skipped += 1;
      return;
    }

    await this.upsert(external, {
      categorySlug: featured.categorySlug,
      categories,
      maturityRating: featured.maturityRating as MaturityRating,
      tags: featured.tags,
      language: featured.language,
      // Curated: checked by hand, so it goes straight to the shelves.
      moderationStatus: ModerationStatus.APPROVED,
      report,
      mirroring,
    });
  }

  private async ingestQuery(
    query: DiscoveryQuery,
    categories: Map<string, string>,
    report: SyncReport,
    mirroring: MirrorOptions,
  ): Promise<void> {
    this.logger.log(`Discovering: ${query.label}…`);
    const results = await this.provider.search(query.query, query.limit);
    this.logger.log(`  ${results.length} playable results`);

    for (const external of results) {
      await this.upsert(external, {
        categorySlug: query.categorySlug,
        categories,
        maturityRating: query.maturityRating as MaturityRating,
        tags: query.tags,
        language: null,
        moderationStatus:
          query.review === 'publish' ? ModerationStatus.APPROVED : ModerationStatus.PENDING,
        report,
        mirroring,
      });
    }
  }

  private async upsert(
    external: ExternalVideo,
    options: {
      categorySlug: string;
      categories: Map<string, string>;
      maturityRating: MaturityRating;
      tags: string[];
      language: string | null;
      moderationStatus: ModerationStatus;
      report: SyncReport;
      mirroring: MirrorOptions;
    },
  ): Promise<void> {
    const { categories, categorySlug, report } = options;
    const categoryId = categories.get(categorySlug) ?? null;

    if (!categoryId) {
      this.logger.warn(`Unknown category "${categorySlug}" — run db:seed first.`);
      report.skipped += 1;
      return;
    }

    const slug = CatalogueSyncService.slugFor(external.externalId);
    const existing = await this.prisma.video.findUnique({
      where: { slug },
      select: { id: true, moderationStatus: true, storageKey: true },
    });

    const mirrored = options.mirroring.mirror
      ? await this.mirror(external, slug, existing?.storageKey ?? null, options.mirroring, report)
      : null;

    // A moderator's decision outranks the sync. Re-running must never quietly
    // resurrect something a human already rejected, nor reset an approval.
    const moderationStatus = existing ? existing.moderationStatus : options.moderationStatus;

    const data = {
      title: external.title,
      description: external.description,
      thumbnailUrl: external.thumbnailUrl,
      // Our own copy when we have one, the provider's URL otherwise.
      playbackUrl: mirrored?.url ?? external.playbackUrl,
      ...(mirrored ? { storageKey: mirrored.key } : {}),
      durationSeconds: external.durationSeconds,
      language: options.language,
      tags: options.tags,
      maturityRating: options.maturityRating,
      categoryId,
      // Both flags are required downstream before a download is offered. They
      // are set from the stated licence only — never because the file happened
      // to be reachable.
      rightsConfirmed: external.redistributable,
      downloadAllowed: external.redistributable,
    };

    const video = await this.prisma.video.upsert({
      where: { slug },
      update: data,
      create: { slug, ...data, moderationStatus },
    });

    if (existing) {
      report.updated += 1;
    } else {
      report.created += 1;
      if (moderationStatus === ModerationStatus.APPROVED) report.published += 1;
      else report.queuedForReview += 1;
      report.perCategory[categorySlug] = (report.perCategory[categorySlug] ?? 0) + 1;
    }

    await this.upsertSource(video.id, external);
  }

  /**
   * Copies the media into our own storage, once.
   *
   * Streamed, never buffered — the same rule uploads follow. A feature film is
   * hundreds of megabytes and reading one into a Buffer to hand to the storage
   * service would defeat the point.
   *
   * Returns null on any failure, and the caller falls back to the provider's
   * URL. A mirror that did not happen must degrade to "slower playback", never
   * to a catalogue row with no source at all.
   */
  private async mirror(
    external: ExternalVideo,
    slug: string,
    existingKey: string | null,
    options: MirrorOptions,
    report: SyncReport,
  ): Promise<{ key: string; url: string } | null> {
    const key = `catalogue/${slug}.mp4`;

    // Already mirrored on a previous run. Re-downloading hundreds of megabytes
    // to produce identical bytes would make the sync unusable to re-run.
    if (existingKey === key && (await this.storage.exists(key))) {
      return { key, url: await this.storage.getUrl(key) };
    }

    if (!this.isAllowedHost(external.playbackUrl)) {
      this.logger.warn(`Refusing to mirror ${external.playbackUrl} — host is not on the allowlist.`);
      report.mirrorFailed += 1;
      return null;
    }

    const maxBytes = options.mirrorMaxMb * 1024 * 1024;
    if (external.sizeBytes !== null && external.sizeBytes > maxBytes) {
      this.logger.log(
        `  skipping mirror of ${external.title} — ${Math.round(
          external.sizeBytes / 1048576,
        )} MB exceeds the ${options.mirrorMaxMb} MB cap`,
      );
      return null;
    }

    try {
      this.logger.log(
        `  mirroring ${external.title} (${
          external.sizeBytes ? `${Math.round(external.sizeBytes / 1048576)} MB` : 'unknown size'
        })…`,
      );

      const res = await fetch(external.playbackUrl, {
        headers: { 'User-Agent': 'VideoHub/0.1 (catalogue mirror)' },
        // Generous: these transfers are large and the source is slow. The cap
        // is on the whole body, not on time-to-first-byte.
        signal: AbortSignal.timeout(30 * 60_000),
      });

      if (!res.ok || !res.body) {
        this.logger.warn(`  mirror failed: HTTP ${res.status} for ${external.playbackUrl}`);
        report.mirrorFailed += 1;
        return null;
      }

      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > maxBytes) {
        this.logger.log(`  skipping mirror — server reports ${Math.round(declared / 1048576)} MB`);
        return null;
      }

      const stored = await this.storage.upload({
        key,
        body: Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
        contentType: 'video/mp4',
        ...(Number.isFinite(declared) && declared > 0 ? { contentLength: declared } : {}),
        publicRead: true,
      });

      report.mirrored += 1;
      this.logger.log(`  mirrored to ${stored.key} (${Math.round(stored.sizeBytes / 1048576)} MB)`);
      return { key: stored.key, url: stored.url };
    } catch (error: unknown) {
      this.logger.warn(
        `  mirror failed for ${external.title}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      report.mirrorFailed += 1;
      return null;
    }
  }

  /** Same allowlist the downloader uses — we do not fetch from arbitrary hosts. */
  private isAllowedHost(url: string): boolean {
    try {
      const { hostname, protocol } = new URL(url);
      if (protocol !== 'https:' && protocol !== 'http:') return false;
      return ALLOWED_HOSTS.some(
        (rule) => hostname === rule.host || hostname.endsWith(`.${rule.host}`),
      );
    } catch {
      return false;
    }
  }

  /**
   * Records where the item came from, so a viewer (and a moderator) can check
   * provenance on archive.org rather than taking our word for it.
   */
  private async upsertSource(videoId: string, external: ExternalVideo): Promise<void> {
    const existing = await this.prisma.source.findFirst({
      where: { videoId, platform: external.provider },
      select: { id: true },
    });

    const data = {
      platform: external.provider,
      url: external.sourcePageUrl,
      access: external.redistributable ? SourceAccess.PUBLIC_DOMAIN : SourceAccess.FREE_STREAM,
      downloadAllowed: external.redistributable,
      licenseNote: external.licence,
    };

    if (existing) {
      await this.prisma.source.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.source.create({ data: { ...data, videoId } });
    }
  }

  private async categoryIdsBySlug(): Promise<Map<string, string>> {
    const categories = await this.prisma.category.findMany({ select: { id: true, slug: true } });
    return new Map(categories.map((category) => [category.slug, category.id]));
  }
}
