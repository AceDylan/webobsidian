import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { config } from '../config.js';
import { verifyToken } from '../services/auth.js';

export const COOKIE_NAME = 'webobsidian_token';

/** Require a valid session cookie for web/session routes. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (
    isTrustedProxyAuth(
      req.headers['x-webobsidian-proxy-auth'],
      req.socket.remoteAddress,
      config.trustedProxySecret,
      config.trustedProxyAddress,
    )
  ) {
    next();
    return;
  }

  const token = req.cookies?.[COOKIE_NAME] || bearer(req);
  if (token && (await verifyToken(token))) {
    next();
    return;
  }
  res.status(401).json({ error: 'Unauthorized' });
}

/** Require both the shared secret and an exact, non-forwarded socket peer. */
export function isTrustedProxyAuth(
  proxyHeader: string | string[] | undefined,
  remoteAddress: string | undefined,
  trustedSecret: string | undefined,
  trustedAddress: string | undefined,
): boolean {
  if (!trustedSecret || typeof proxyHeader !== 'string') return false;
  const actualPeer = normalizeSocketAddress(remoteAddress);
  const expectedPeer = normalizeSocketAddress(trustedAddress);
  return Boolean(
    actualPeer &&
    expectedPeer &&
    actualPeer === expectedPeer &&
    safeEqual(proxyHeader, trustedSecret),
  );
}

function normalizeSocketAddress(address: string | undefined): string | undefined {
  const value = address?.trim();
  if (!value) return undefined;
  if (isIP(value) === 4) return value;

  // Node may report an IPv4 peer on a dual-stack socket as an IPv4-mapped IPv6
  // address. Treat only that exact representation as equivalent; CIDRs and
  // hostnames are deliberately unsupported.
  const mappedPrefix = '::ffff:';
  if (value.toLowerCase().startsWith(mappedPrefix)) {
    const ipv4 = value.slice(mappedPrefix.length);
    if (isIP(ipv4) === 4) return ipv4;
  }

  return isIP(value) === 6 ? value.toLowerCase() : undefined;
}

function safeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function bearer(req: Request): string | undefined {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7);
  return undefined;
}
