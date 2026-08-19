import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DownloadStatus, type Download } from '@prisma/client';
import { DOWNLOAD_LIMITS, REFUSAL_MESSAGES } from '@videohub/config';
import {
  DownloadRefusalReason,
  ErrorCode,
  type DownloadAnalysis,
  type DownloadDto,
  type Paginated,
} from '@videohub/types';
import { basename } from 'node:path';
import { paginate, type PaginationDto } from '../common/dto/pagination.dto';
import { AppException } from '../common/exceptions/app.exception';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.interface';
import { DownloadPolicyService, type PolicyDecision } from './download-policy.service';
import type { AnalyzeUrlDto, CreateDownloadDto } from './dto/downloads.dto';

/** How many redirect hops to follow before giving up. */
const MAX_REDIRECTS = 5;

/**
 * Identifies VideoHub to the sources it fetches from.
 *
 * Several of the allowlisted hosts — Wikimedia in particular — require a
 * descriptive User-Agent with a contact URL and rate-limit anonymous clients.
 * Sending one is both their policy and simple good manners for a tool that makes
 * automated requests to someone else's servers.
 */
const USER_AGENT = 'VideoHub/0.1 (+https://github.com/PAZZO123/VideoHub) authorized-download-bot';

@Injectable()
export class DownloadsService {
  private readonly logger = new Logger(DownloadsService.name);
  private readonly maxBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: DownloadPolicyService,
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {
    this.maxBytes = config.get('downloads', { infer: true }).maxMb * 1024 * 1024;
  }

  /**
   * Inspects a URL without fetching its body.
   *
   * A refused URL still gets a full response — reason, message and the original
   * link — so the UI can explain and offer to open the source.
   */
  async analyze(dto: AnalyzeUrlDto): Promise<DownloadAnalysis> {
    const decision = await this.policy.evaluate(dto.url);

    if (!decision.permitted) {
      this.logger.log(`Refused ${decision.host || 'unparseable'}: ${decision.internalNote}`);
      return this.toAnalysis(decision, null);
    }

    // HEAD only: the policy has passed, but we still want the size and type
    // before committing to transferring anything.
    const probe = await this.probe(decision.normalisedUrl);

    if (!probe.ok) {
      return this.toAnalysis(
        {
          ...decision,
          permitted: false,
          refusalReason: DownloadRefusalReason.UNSUPPORTED_URL,
          message: probe.message,
        },
        null,
      );
    }

    if (probe.sizeBytes !== null && probe.sizeBytes > this.maxBytes) {
      return this.toAnalysis(
        {
          ...decision,
          permitted: false,
          refusalReason: DownloadRefusalReason.TOO_LARGE,
          message: REFUSAL_MESSAGES.TOO_LARGE,
        },
        null,
      );
    }

    return this.toAnalysis(decision, probe);
  }

  async create(userId: string, dto: CreateDownloadDto): Promise<DownloadDto> {
    const decision = await this.policy.evaluate(dto.url);

    // Refusals are recorded rather than thrown: the user's downloads list should
    // show what was attempted and why it was declined.
    if (!decision.permitted) {
      const blocked = await this.prisma.download.create({
        data: {
          userId,
          sourceUrl: decision.normalisedUrl,
          host: decision.host,
          status: DownloadStatus.BLOCKED,
          refusalReason: decision.refusalReason,
          message: decision.message,
        },
      });

      this.logger.log(`Blocked download for user ${userId}: ${decision.internalNote}`);
      return this.toDto(blocked);
    }

    const probe = await this.probe(decision.normalisedUrl);
    if (!probe.ok) {
      throw AppException.badRequest(ErrorCode.DOWNLOAD_NOT_PERMITTED, probe.message);
    }

    if (probe.sizeBytes !== null && probe.sizeBytes > this.maxBytes) {
      const tooLarge = await this.prisma.download.create({
        data: {
          userId,
          sourceUrl: decision.normalisedUrl,
          host: decision.host,
          status: DownloadStatus.BLOCKED,
          refusalReason: DownloadRefusalReason.TOO_LARGE,
          message: REFUSAL_MESSAGES.TOO_LARGE,
        },
      });
      return this.toDto(tooLarge);
    }

    const record = await this.prisma.download.create({
      data: {
        userId,
        sourceUrl: decision.normalisedUrl,
        host: decision.host,
        title: probe.title,
        format: probe.contentType,
        status: DownloadStatus.PENDING,
      },
    });

    // Transferring happens outside the request. The client polls GET /downloads.
    void this.transfer(record.id, decision.normalisedUrl, probe.contentType, userId);

    return this.toDto(record);
  }

  async findAll(userId: string, pagination: PaginationDto): Promise<Paginated<DownloadDto>> {
    const where = { userId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.download.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.download.count({ where }),
    ]);

    return paginate(items.map((item) => this.toDto(item)), pagination.page, pagination.take, total);
  }

  async findOne(userId: string, id: string): Promise<DownloadDto> {
    const record = await this.prisma.download.findFirst({ where: { id, userId } });
    if (!record) {
      throw AppException.notFound(ErrorCode.DOWNLOAD_NOT_FOUND, 'That download could not be found.');
    }
    return this.toDto(record);
  }

  async remove(userId: string, id: string): Promise<{ removed: true }> {
    const record = await this.prisma.download.findFirst({ where: { id, userId } });
    if (!record) {
      throw AppException.notFound(ErrorCode.DOWNLOAD_NOT_FOUND, 'That download could not be found.');
    }

    if (record.storageKey) {
      await this.storage.delete(record.storageKey).catch((error: unknown) => {
        // The row still goes; an orphaned object is better than a stuck record.
        this.logger.warn(
          `Could not delete ${record.storageKey}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      });
    }

    await this.prisma.download.delete({ where: { id } });
    return { removed: true };
  }

  /** The hosts this deployment will fetch from, for the UI. */
  supportedSources(): { host: string; label: string; basis: string }[] {
    return this.policy.supportedHosts;
  }

  /**
   * Fetches the file and stores it. Runs detached from the request; every exit
   * path updates the record so nothing is left PENDING forever.
   */
  private async transfer(
    downloadId: string,
    url: string,
    contentType: string,
    userId: string,
  ): Promise<void> {
    try {
      await this.prisma.download.update({
        where: { id: downloadId },
        data: { status: DownloadStatus.RUNNING },
      });

      const response = await this.fetchFollowingPolicy(url);

      const buffer = Buffer.from(await response.arrayBuffer());

      // Servers may omit or understate Content-Length, so the real size is
      // checked again now that the bytes are in hand.
      if (buffer.byteLength > this.maxBytes) {
        await this.prisma.download.update({
          where: { id: downloadId },
          data: {
            status: DownloadStatus.BLOCKED,
            refusalReason: DownloadRefusalReason.TOO_LARGE,
            message: REFUSAL_MESSAGES.TOO_LARGE,
            completedAt: new Date(),
          },
        });
        return;
      }

      const stored = await this.storage.upload({
        key: `downloads/${userId}/${downloadId}${this.extensionFor(url, contentType)}`,
        body: buffer,
        contentType,
        contentLength: buffer.byteLength,
      });

      await this.prisma.download.update({
        where: { id: downloadId },
        data: {
          status: DownloadStatus.COMPLETED,
          storageKey: stored.key,
          fileSizeBytes: BigInt(buffer.byteLength),
          completedAt: new Date(),
        },
      });

      this.logger.log(`Download ${downloadId} completed (${buffer.byteLength} bytes)`);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Download ${downloadId} failed: ${detail}`);

      await this.prisma.download
        .update({
          where: { id: downloadId },
          data: {
            status: DownloadStatus.FAILED,
            // Generic on purpose — the upstream message may expose internals —
            // except for rate limiting, where "try again" is genuinely useful.
            message:
              error instanceof SourceBusyError
                ? 'The source is rate limiting requests right now. Please try again in a few minutes.'
                : 'The download could not be completed. The source may be unavailable.',
            completedAt: new Date(),
          },
        })
        .catch(() => undefined);
    }
  }

  /**
   * Fetches with redirects followed manually, re-running the policy on each hop.
   *
   * `redirect: 'manual'` is essential — letting fetch follow automatically would
   * allow a permitted URL to redirect to a blocked host or a private address
   * without ever being checked.
   */
  private async fetchFollowingPolicy(startUrl: string): Promise<Response> {
    let url = startUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(DOWNLOAD_LIMITS.FETCH_TIMEOUT_MS),
        headers: { Accept: '*/*', 'User-Agent': USER_AGENT },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error('Redirect without a Location header.');

        const decision = await this.policy.evaluateRedirect(location, url);
        if (!decision.permitted) {
          throw new Error(`Redirect target refused: ${decision.internalNote ?? 'policy'}`);
        }

        url = decision.normalisedUrl;
        continue;
      }

      if (response.status === 429) {
        throw new SourceBusyError();
      }

      if (!response.ok) {
        throw new Error(`Source responded ${response.status}.`);
      }

      return response;
    }

    throw new Error('Too many redirects.');
  }

  /** HEAD request for size, type and filename, without transferring the body. */
  private async probe(url: string): Promise<ProbeResult> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(DOWNLOAD_LIMITS.ANALYZE_TIMEOUT_MS),
      });

      if (response.status === 429) {
        return {
          ok: false,
          message:
            'The source is rate limiting requests right now. Please wait a moment and try again.',
          sizeBytes: null,
          contentType: 'application/octet-stream',
          title: null,
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          message: `The source responded with ${response.status}. It may have moved or been removed.`,
          sizeBytes: null,
          contentType: 'application/octet-stream',
          title: null,
        };
      }

      const lengthHeader = response.headers.get('content-length');
      const parsedLength = lengthHeader ? Number.parseInt(lengthHeader, 10) : Number.NaN;

      return {
        ok: true,
        message: '',
        sizeBytes: Number.isFinite(parsedLength) ? parsedLength : null,
        contentType: response.headers.get('content-type')?.split(';')[0]?.trim() ?? 'application/octet-stream',
        title: this.titleFrom(url),
      };
    } catch (error: unknown) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      return {
        ok: false,
        message: timedOut
          ? 'The source took too long to respond. Try again in a moment.'
          : 'The source could not be reached.',
        sizeBytes: null,
        contentType: 'application/octet-stream',
        title: null,
      };
    }
  }

  private titleFrom(url: string): string {
    try {
      const name = decodeURIComponent(basename(new URL(url).pathname));
      return name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ').trim() || 'Untitled';
    } catch {
      return 'Untitled';
    }
  }

  private extensionFor(url: string, contentType: string): string {
    const fromUrl = /\.([a-z0-9]{2,5})(?:$|\?)/i.exec(new URL(url).pathname);
    if (fromUrl?.[1]) return `.${fromUrl[1].toLowerCase()}`;

    const byType: Record<string, string> = {
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/ogg': '.ogv',
      'audio/mpeg': '.mp3',
      'image/jpeg': '.jpg',
      'image/png': '.png',
    };
    return byType[contentType] ?? '';
  }

  private toAnalysis(decision: PolicyDecision, probe: ProbeResult | null): DownloadAnalysis {
    return {
      url: decision.normalisedUrl,
      host: decision.host,
      permitted: decision.permitted,
      refusalReason: decision.refusalReason,
      message: decision.message,
      title: probe?.title ?? null,
      thumbnailUrl: null,
      durationSeconds: null,
      formats:
        decision.permitted && probe
          ? [
              {
                formatId: 'source',
                label: 'Original file',
                container: probe.contentType,
                qualityLabel: null,
                approxSizeBytes: probe.sizeBytes,
              },
            ]
          : [],
      // Always present, so a refusal can still offer "Open original source".
      originalUrl: decision.normalisedUrl,
    };
  }

  private toDto(record: Download): DownloadDto {
    return {
      id: record.id,
      sourceUrl: record.sourceUrl,
      host: record.host,
      title: record.title,
      thumbnailUrl: record.thumbnailUrl,
      status: record.status,
      // BigInt does not survive JSON serialisation.
      fileSizeBytes: record.fileSizeBytes === null ? null : Number(record.fileSizeBytes),
      format: record.format,
      storageKey: record.storageKey,
      refusalReason: record.refusalReason,
      message: record.message,
      createdAt: record.createdAt.toISOString(),
      completedAt: record.completedAt?.toISOString() ?? null,
    };
  }
}

/** The source asked us to back off. Distinct from a genuine failure. */
class SourceBusyError extends Error {
  constructor() {
    super('Source responded 429.');
    this.name = 'SourceBusyError';
  }
}

interface ProbeResult {
  ok: boolean;
  message: string;
  sizeBytes: number | null;
  contentType: string;
  title: string | null;
}
