import { inspectAddress, inspectIpv4, inspectIpv6, resolveHostSafely } from './network-guard';

describe('network guard (SSRF)', () => {
  describe('IPv4', () => {
    it.each([
      ['127.0.0.1', 'loopback'],
      ['127.255.255.254', 'loopback range, not just .1'],
      ['10.0.0.1', 'private class A'],
      ['10.255.255.255', 'private class A upper bound'],
      ['172.16.0.1', 'private class B lower bound'],
      ['172.31.255.255', 'private class B upper bound'],
      ['192.168.1.1', 'private class C'],
      ['169.254.169.254', 'cloud metadata endpoint'],
      ['169.254.0.1', 'link-local'],
      ['0.0.0.0', 'this-network'],
      ['100.64.0.1', 'carrier-grade NAT'],
      ['224.0.0.1', 'multicast'],
      ['255.255.255.255', 'broadcast/reserved'],
    ])('blocks %s (%s)', (address) => {
      expect(inspectIpv4(address).blocked).toBe(true);
    });

    it.each([
      ['8.8.8.8'],
      ['1.1.1.1'],
      ['172.15.0.1'], // just below the private class B range
      ['172.32.0.1'], // just above it
      ['192.167.0.1'], // just below 192.168/16
      ['100.63.255.255'], // just below CGNAT
      ['100.128.0.1'], // just above CGNAT
    ])('allows public address %s', (address) => {
      expect(inspectIpv4(address).blocked).toBe(false);
    });

    it('rejects a malformed address rather than allowing it', () => {
      expect(inspectIpv4('999.1.1.1').blocked).toBe(true);
      expect(inspectIpv4('1.2.3').blocked).toBe(true);
      expect(inspectIpv4('not-an-ip').blocked).toBe(true);
    });
  });

  describe('IPv6', () => {
    it.each([
      ['::1', 'loopback'],
      ['::', 'unspecified'],
      ['fc00::1', 'unique local'],
      ['fd12:3456::1', 'unique local'],
      ['fe80::1', 'link-local'],
      ['ff02::1', 'multicast'],
    ])('blocks %s (%s)', (address) => {
      expect(inspectIpv6(address).blocked).toBe(true);
    });

    it('blocks IPv4-mapped addresses that hide a private target', () => {
      // ::ffff:127.0.0.1 is loopback wearing an IPv6 costume.
      expect(inspectIpv6('::ffff:127.0.0.1').blocked).toBe(true);
      expect(inspectIpv6('::ffff:169.254.169.254').blocked).toBe(true);
      expect(inspectIpv6('::ffff:10.0.0.1').blocked).toBe(true);
    });

    it('allows an IPv4-mapped public address', () => {
      expect(inspectIpv6('::ffff:8.8.8.8').blocked).toBe(false);
    });

    it('allows a public IPv6 address', () => {
      expect(inspectIpv6('2606:4700:4700::1111').blocked).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(inspectIpv6('FE80::1').blocked).toBe(true);
      expect(inspectIpv6('FC00::1').blocked).toBe(true);
    });
  });

  describe('inspectAddress', () => {
    it('rejects anything that is not an IP at all', () => {
      expect(inspectAddress('example.com').blocked).toBe(true);
    });
  });

  describe('resolveHostSafely', () => {
    it('blocks localhost by name without a DNS lookup', async () => {
      await expect(resolveHostSafely('localhost')).resolves.toMatchObject({ safe: false });
    });

    it('blocks subdomains of localhost', async () => {
      await expect(resolveHostSafely('api.localhost')).resolves.toMatchObject({ safe: false });
    });

    it('blocks a literal private IP used as the host', async () => {
      await expect(resolveHostSafely('127.0.0.1')).resolves.toMatchObject({ safe: false });
      await expect(resolveHostSafely('169.254.169.254')).resolves.toMatchObject({ safe: false });
    });

    it('allows a literal public IP without resolving', async () => {
      await expect(resolveHostSafely('8.8.8.8')).resolves.toMatchObject({
        safe: true,
        addresses: ['8.8.8.8'],
      });
    });

    it('reports unresolvable hostnames as unsafe rather than throwing', async () => {
      const result = await resolveHostSafely('this-host-does-not-exist.invalid');
      expect(result.safe).toBe(false);
    });
  });
});
