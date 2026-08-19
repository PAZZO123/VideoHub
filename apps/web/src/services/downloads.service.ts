import type { DownloadAnalysis, DownloadDto, Paginated } from '@videohub/types';
import { api, unwrap } from '@/lib/api-client';

export interface SupportedSource {
  host: string;
  label: string;
  basis: string;
}

export const downloadsService = {
  /** The allowlist this deployment runs with. */
  sources(): Promise<SupportedSource[]> {
    return unwrap(api.get('/downloads/sources'));
  },

  /**
   * Inspects a URL. A refusal comes back as a normal 200 with
   * `permitted: false` and an explanation — not an error.
   */
  analyze(url: string): Promise<DownloadAnalysis> {
    return unwrap(api.post('/downloads/analyze', { url }));
  },

  create(url: string, formatId?: string): Promise<DownloadDto> {
    return unwrap(api.post('/downloads', { url, ...(formatId ? { formatId } : {}) }));
  },

  list(page = 1, limit = 24): Promise<Paginated<DownloadDto>> {
    return unwrap(api.get('/downloads', { params: { page, limit } }));
  },

  get(id: string): Promise<DownloadDto> {
    return unwrap(api.get(`/downloads/${encodeURIComponent(id)}`));
  },

  remove(id: string): Promise<{ removed: true }> {
    return unwrap(api.delete(`/downloads/${encodeURIComponent(id)}`));
  },
};

export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
