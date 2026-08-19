import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

/**
 * Server-Side Request Forgery guard.
 *
 * The downloader fetches URLs supplied by users, which makes it an SSRF vector:
 * without this, a caller could point it at `http://169.254.169.254/` and have
 * the server read its own cloud metadata (including credentials), or reach
 * services bound to localhost and the private network.
 *
 * The host allowlist is the first line of defence, but it is not sufficient on
 * its own — an allowlisted domain could resolve to a private address, either
 * through a compromised DNS record or a deliberate rebinding attack. So every
 * resolved address is checked too, and the address that passed the check is what
 * gets connected to.
 */

/** IPv4 ranges that must never be reachable from a user-supplied URL. */
const BLOCKED_IPV4_RANGES: { label: string; test: (octets: number[]) => boolean }[] = [
  { label: 'this-network (0.0.0.0/8)', test: ([a]) => a === 0 },
  { label: 'loopback (127.0.0.0/8)', test: ([a]) => a === 127 },
  { label: 'private (10.0.0.0/8)', test: ([a]) => a === 10 },
  {
    label: 'private (172.16.0.0/12)',
    test: ([a, b]) => a === 172 && b !== undefined && b >= 16 && b <= 31,
  },
  { label: 'private (192.168.0.0/16)', test: ([a, b]) => a === 192 && b === 168 },
  // Covers the cloud metadata endpoint 169.254.169.254.
  { label: 'link-local (169.254.0.0/16)', test: ([a, b]) => a === 169 && b === 254 },
  {
    label: 'carrier-grade NAT (100.64.0.0/10)',
    test: ([a, b]) => a === 100 && b !== undefined && b >= 64 && b <= 127,
  },
  { label: 'benchmarking (198.18.0.0/15)', test: ([a, b]) => a === 198 && (b === 18 || b === 19) },
  { label: 'multicast (224.0.0.0/4)', test: ([a]) => a !== undefined && a >= 224 && a <= 239 },
  { label: 'reserved (240.0.0.0/4)', test: ([a]) => a !== undefined && a >= 240 },
];

export interface AddressVerdict {
  blocked: boolean;
  /** Populated when blocked — names the range, for logs not for users. */
  reason?: string;
}

export function inspectIpv4(address: string): AddressVerdict {
  const octets = address.split('.').map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return { blocked: true, reason: 'malformed IPv4 address' };
  }

  const match = BLOCKED_IPV4_RANGES.find((range) => range.test(octets));
  return match ? { blocked: true, reason: match.label } : { blocked: false };
}

export function inspectIpv6(address: string): AddressVerdict {
  const normalised = address.toLowerCase().replace(/^\[|\]$/g, '');

  // IPv4-mapped (::ffff:127.0.0.1) would otherwise slip past the IPv6 checks.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalised);
  if (mapped?.[1]) return inspectIpv4(mapped[1]);

  if (normalised === '::' || normalised === '::1') {
    return { blocked: true, reason: 'IPv6 loopback/unspecified' };
  }
  // Unique local addresses.
  if (/^f[cd][0-9a-f]{2}:/.test(normalised)) {
    return { blocked: true, reason: 'IPv6 unique-local (fc00::/7)' };
  }
  // Link-local.
  if (/^fe[89ab][0-9a-f]:/.test(normalised)) {
    return { blocked: true, reason: 'IPv6 link-local (fe80::/10)' };
  }
  if (normalised.startsWith('ff')) {
    return { blocked: true, reason: 'IPv6 multicast' };
  }

  return { blocked: false };
}

/** Checks a literal IP address of either family. */
export function inspectAddress(address: string): AddressVerdict {
  const family = isIP(address);
  if (family === 4) return inspectIpv4(address);
  if (family === 6) return inspectIpv6(address);
  return { blocked: true, reason: 'not an IP address' };
}

export interface ResolvedHost {
  safe: boolean;
  reason?: string;
  /** Addresses the hostname resolved to, all of which passed the check. */
  addresses: string[];
}

/**
 * Resolves a hostname and rejects it if any address is in a blocked range.
 *
 * Rejecting when *any* address is private (rather than picking a public one) is
 * deliberate: a host that resolves to both is far more likely to be an attack
 * than a legitimate source.
 */
export async function resolveHostSafely(hostname: string): Promise<ResolvedHost> {
  // A literal IP needs no DNS round trip.
  if (isIP(hostname) !== 0) {
    const verdict = inspectAddress(hostname);
    return verdict.blocked
      ? { safe: false, reason: verdict.reason, addresses: [] }
      : { safe: true, addresses: [hostname] };
  }

  if (hostname.toLowerCase() === 'localhost' || hostname.toLowerCase().endsWith('.localhost')) {
    return { safe: false, reason: 'localhost', addresses: [] };
  }

  try {
    const records = await lookup(hostname, { all: true });
    if (records.length === 0) {
      return { safe: false, reason: 'hostname did not resolve', addresses: [] };
    }

    for (const record of records) {
      const verdict = inspectAddress(record.address);
      if (verdict.blocked) {
        return { safe: false, reason: verdict.reason, addresses: [] };
      }
    }

    return { safe: true, addresses: records.map((r) => r.address) };
  } catch {
    return { safe: false, reason: 'hostname could not be resolved', addresses: [] };
  }
}
