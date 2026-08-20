import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';

/**
 * An HTTP GET that tolerates a very slow origin.
 *
 * Node's global `fetch` gives up on a connection after about ten seconds and
 * that limit is not reachable through the fetch options — no `dispatcher` is
 * available here because undici is not a dependency. The Internet Archive's
 * storage nodes routinely take longer than that from a distant network:
 * measured from Kigali, one node answered a 1 KB range request in 29.6s, well
 * inside what a background mirror should tolerate and far outside what `fetch`
 * allows. Every "fetch failed" in the mirror logs was this, not a dead file.
 *
 * `node:https` lets the caller pick the deadline, and hands back the response
 * as a stream so a feature film is never materialised in memory.
 */
export interface SlowSourceResponse {
  ok: boolean;
  status: number;
  contentLength: number | null;
  contentType: string | null;
  stream: IncomingMessage;
  finalUrl: string;
}

export interface SlowSourceOptions {
  /** Milliseconds of silence before giving up. Applies to connect and to idle. */
  timeoutMs?: number;
  /** Redirects to follow. archive.org uses one hop to reach a storage node. */
  maxRedirects?: number;
  userAgent?: string;
  /** Passed straight through, e.g. a Range header. */
  headers?: Record<string, string>;
}

export async function getSlowSource(
  url: string,
  {
    timeoutMs = 120_000,
    maxRedirects = 5,
    userAgent = 'VideoHub/0.1',
    headers = {},
  }: SlowSourceOptions = {},
): Promise<SlowSourceResponse> {
  let current = url;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const response = await once(current, timeoutMs, userAgent, headers);
    const status = response.statusCode ?? 0;
    const location = response.headers.location;

    if (status >= 300 && status < 400 && location) {
      // The body of a redirect is never wanted; leaving it unread keeps the
      // socket alive and the agent's pool occupied.
      response.resume();
      current = new URL(location, current).toString();
      continue;
    }

    return {
      ok: status >= 200 && status < 300,
      status,
      contentLength: toInt(response.headers['content-length']),
      contentType: (response.headers['content-type'] as string | undefined) ?? null,
      stream: response,
      finalUrl: current,
    };
  }

  throw new Error(`Too many redirects fetching ${url}`);
}

function once(
  url: string,
  timeoutMs: number,
  userAgent: string,
  headers: Record<string, string>,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const send = target.protocol === 'http:' ? httpRequest : httpsRequest;

    const req = send(
      target,
      { method: 'GET', headers: { 'User-Agent': userAgent, ...headers } },
      resolve,
    );

    // Covers both the connect phase and any later stall.
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s: ${url}`));
    });

    req.on('error', reject);
    req.end();
  });
}

function toInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
