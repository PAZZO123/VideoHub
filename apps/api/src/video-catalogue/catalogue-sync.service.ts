import { Inject, Injectable, Logger } from '@nestjs/common';
import { MaturityRating, ModerationStatus, SourceAccess } from '@prisma/client';
import {
  DISCOVERY_QUERIES,
  FEATURED_VIDEOS,
  type DiscoveryQuery,
  type FeaturedVideo,
} from '@videohub/config';
import slugify from 'slugify';
import { PrismaService } from '../prisma/prisma.service';
import {
  VIDEO_CATALOGUE_PROVIDER,
  type ExternalVideo,
  type VideoCatalogueProvider,
} from './video-catalogue.interface';

export interface SyncReport {
  provider: string;
  created: number;
  updated: number;
  skipped: number;
  published: number;
  queuedForReview: number;
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
  ) {}

  /** Slug for an ingested item. Stable, so re-runs upsert rather than insert. */
  static slugFor(externalId: string): string {
    const base = slugify(externalId, { lower: true, strict: true }).slice(0, 90);
    return `ia-${base || 'item'}`;
  }

  async sync({ includeDiscovery = true }: { includeDiscovery?: boolean } = {}): Promise<SyncReport> {
    const report: SyncReport = {
      provider: this.provider.name,
      created: 0,
      updated: 0,
      skipped: 0,
      published: 0,
      queuedForReview: 0,
      perCategory: {},
    };

    if (this.provider.name === 'none') {
      this.logger.warn(
        'VIDEO_CATALOGUE_PROVIDER=none — nothing to sync. Set it to `archive` to pull real video.',
      );
      return report;
    }

    const categories = await this.categoryIdsBySlug();

    this.logger.log(`Ingesting ${FEATURED_VIDEOS.length} curated titles…`);
    for (const featured of FEATURED_VIDEOS) {
      await this.ingestFeatured(featured, categories, report);
    }

    if (includeDiscovery) {
      for (const query of DISCOVERY_QUERIES) {
        await this.ingestQuery(query, categories, report);
      }
    }

    return report;
  }

  private async ingestFeatured(
    featured: FeaturedVideo,
    categories: Map<string, string>,
    report: SyncReport,
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
    });
  }

  private async ingestQuery(
    query: DiscoveryQuery,
    categories: Map<string, string>,
    report: SyncReport,
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
      select: { id: true, moderationStatus: true },
    });

    // A moderator's decision outranks the sync. Re-running must never quietly
    // resurrect something a human already rejected, nor reset an approval.
    const moderationStatus = existing ? existing.moderationStatus : options.moderationStatus;

    const data = {
      title: external.title,
      description: external.description,
      thumbnailUrl: external.thumbnailUrl,
      playbackUrl: external.playbackUrl,
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
