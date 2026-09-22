import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { config } from '../config.js';

/**
 * Bookmark Hub embed: the Hub (a separate site of the same owner) shows this app in
 * an iframe on its "笔记" tab and signs its unlocked administrator in, so the vault
 * never asks for a second login once the Hub is unlocked.
 *
 * 1. Framing. With WEBOBSIDIAN_HUB_URL set, every response carries
 *    `frame-ancestors <hub origin>` (exactly one origin, never a wildcard). Unset:
 *    `frame-ancestors 'none'` as before.
 *
 * 2. Sign-in bridge, Hub -> WebObsidian (one way). The two sites are different
 *    hosts and cannot read each other's cookies, so the Hub's backend signs a
 *    short-lived, single-use ticket for its unlocked administrator:
 *
 *        v2.vault.<expiry>.<nonce>.<b64 issuer>.<b64 audience>.<HMAC-SHA256 hex>
 *
 *    The key is sha256("hub-vault-admin|" + WEBOBSIDIAN_HUB_EMBED_SECRET), a random
 *    value the operator generates once and puts in both deployments' environment
 *    (Hub: HUB_VAULT_EMBED_SECRET). It never enters a repository, a URL, a log
 *    line or a browser.
 *
 *    The ticket never travels in a URL either: the Hub renders a page of its own
 *    (GET /vault/open, framed by the Hub itself) holding a form that posts the
 *    ticket to POST /auth/hub/sso. That endpoint checks, in order: the request's
 *    Origin is the Hub (only a page served by the Hub can submit it), the
 *    signature, the purpose, the expiry (and that the lifetime is short), issuer ==
 *    the Hub, audience == this site, and that the nonce is unused. Only then does
 *    it set the ordinary httpOnly session cookie — carrying `amr: 'hub'` and a
 *    shorter lifetime than a password sign-in — and redirect to the page asked for.
 *
 *    Sessions opened this way stop working as soon as the bridge changes: turning
 *    it off, pointing it at another Hub or rotating the secret revokes them all
 *    (see hubSessionStillValid). Locking the Hub ends the session in this browser
 *    through POST /auth/hub/logout.
 *
 * Nonces live in process memory until the ticket expires, which is exact for this
 * single-process server.
 */

export const HUB_TICKET_VERSION = 'v2';
export const HUB_TICKET_PURPOSE = 'vault';
/** The Hub signs 60 seconds; a ticket that claims to live longer than this is refused. */
export const HUB_TICKET_MAX_TTL_SECONDS = 120;
export const HUB_SECRET_MIN_LENGTH = 32;
/** `amr` claim of a session cookie opened with a Hub ticket. */
export const HUB_SESSION_AMR = 'hub';

const DEFAULT_SESSION_TTL_SECONDS = 12 * 3600;
const MIN_SESSION_TTL_SECONDS = 300;
const MAX_SESSION_TTL_SECONDS = 30 * 24 * 3600;

const TICKET_MAX_LENGTH = 1024;
const MAX_NONCES = 4096;
const RETURN_PATH_MAX_LENGTH = 2048;

// https anywhere; http only on loopback, for local development. No wildcards, no
// paths, no credentials: a mistyped value must mean "cannot be framed".
const ORIGIN_RE =
  /^(?:https:\/\/(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|http:\/\/(?:localhost|127\.0\.0\.1))(?::[0-9]{1,5})?$/;
const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;
const B64_ORIGIN_RE = /^[A-Za-z0-9_-]{8,400}$/;
const TAG_RE = /^[0-9a-f]{64}$/;

export type HubTicketFailure =
  | 'disabled'
  | 'missing'
  | 'malformed'
  | 'signature'
  | 'purpose'
  | 'expired'
  | 'ttl'
  | 'issuer'
  | 'audience'
  | 'replayed'
  | 'busy';

export type HubTicketResult = { ok: true } | { ok: false; reason: HubTicketFailure };

const nonces = new Map<string, number>(); // nonce -> expiry (unix seconds); only tickets with a valid signature
const warned = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

/** `scheme://host[:port]` in lower case, or undefined when it is anything else. */
export function normalizeOrigin(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const origin = value.trim().replace(/\/+$/, '').toLowerCase();
  if (!origin || origin.length > 300 || !ORIGIN_RE.test(origin)) return undefined;
  return origin;
}

/** Origin of the Hub allowed to frame this app, or undefined when the feature is off. */
export function hubOrigin(): string | undefined {
  const raw = config.hubUrl?.trim();
  if (!raw) return undefined;
  const origin = normalizeOrigin(raw);
  if (!origin) {
    warnOnce(
      `url:${raw}`,
      '[hub] WEBOBSIDIAN_HUB_URL is not a plain origin (https://host[:port], no path, no wildcard); ' +
        'Bookmark Hub embedding is disabled',
    );
  }
  return origin;
}

function hubSecret(): string {
  const value = config.hubEmbedSecret?.trim() ?? '';
  if (value && value.length < HUB_SECRET_MIN_LENGTH) {
    warnOnce(
      'secret-short',
      `[hub] WEBOBSIDIAN_HUB_EMBED_SECRET is shorter than ${HUB_SECRET_MIN_LENGTH} characters and is ignored; ` +
        'generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
    return '';
  }
  return value;
}

/** True when a Hub ticket can be traded for a session here. */
export function hubSsoEnabled(): boolean {
  return Boolean(hubOrigin() && hubSecret());
}

export function hubSessionTtlSeconds(): number {
  const ttl = config.hubSessionTtlSeconds;
  if (!ttl || !Number.isFinite(ttl)) return DEFAULT_SESSION_TTL_SECONDS;
  return Math.max(MIN_SESSION_TTL_SECONDS, Math.min(Math.floor(ttl), MAX_SESSION_TTL_SECONDS));
}

function ticketKey(secret: string): Buffer {
  // Domain-separated from the Hub's other bridge (HaloWebUI uses "hub-chat-admin|"):
  // even if an operator reused one secret, a chat ticket never verifies here.
  return createHash('sha256').update(`hub-vault-admin|${secret}`).digest();
}

/**
 * Short fingerprint of the current bridge key, stamped into Hub sessions. Not
 * reversible to the secret; rotating the secret changes it and so revokes every
 * session the old one opened.
 */
export function hubKeyFingerprint(): string | undefined {
  const secret = hubSecret();
  if (!secret) return undefined;
  return createHash('sha256').update('hub-vault-session|').update(ticketKey(secret)).digest('hex').slice(0, 16);
}

/** Does this decoded session (already signature-checked) still match the configured bridge? */
export function hubSessionStillValid(payload: Record<string, unknown>): boolean {
  const origin = hubOrigin();
  const fingerprint = hubKeyFingerprint();
  return Boolean(origin && fingerprint && payload.hub === origin && payload.hk === fingerprint);
}

function b64Origin(origin: string): string {
  return Buffer.from(origin, 'utf8').toString('base64url');
}

function unb64Origin(value: string): string | undefined {
  if (!B64_ORIGIN_RE.test(value)) return undefined;
  let decoded: string;
  try {
    decoded = Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return undefined;
  }
  // Must already be canonical, so one origin has exactly one spelling.
  return normalizeOrigin(decoded) === decoded ? decoded : undefined;
}

function hmacHex(key: Buffer, message: string): string {
  return createHmac('sha256', key).update(message, 'utf8').digest('hex');
}

/**
 * Sign a ticket the way the Hub does. Production tickets come from the Hub; this
 * exists for the tests and for trying the flow out locally.
 */
export function signHubTicket(opts: {
  issuer: string;
  audience: string;
  purpose?: string;
  ttlSeconds?: number;
  nowMs?: number;
  nonce?: string;
  secret?: string;
}): string {
  const secret = opts.secret ?? hubSecret();
  if (!secret) throw new Error('WEBOBSIDIAN_HUB_EMBED_SECRET is not configured');
  const expires = Math.floor((opts.nowMs ?? Date.now()) / 1000) + (opts.ttlSeconds ?? 60);
  const message = [
    HUB_TICKET_VERSION,
    opts.purpose ?? HUB_TICKET_PURPOSE,
    String(expires),
    opts.nonce ?? randomBytes(18).toString('base64url'),
    b64Origin(opts.issuer),
    b64Origin(opts.audience),
  ].join('.');
  return `${message}.${hmacHex(ticketKey(secret), message)}`;
}

/**
 * Verify a ticket and burn its nonce. `audience` is this site's origin as the
 * browser reached it (see requestOrigin). The reason is a bare word for logs and
 * the error page, never anything sensitive.
 */
export function consumeHubTicket(ticket: unknown, audience: string | undefined, nowMs = Date.now()): HubTicketResult {
  const secret = hubSecret();
  const expectedIssuer = hubOrigin();
  if (!secret || !expectedIssuer) return { ok: false, reason: 'disabled' };
  if (typeof ticket !== 'string' || !ticket) return { ok: false, reason: 'missing' };
  const parts = ticket.split('.');
  if (ticket.length > TICKET_MAX_LENGTH || parts.length !== 7) return { ok: false, reason: 'malformed' };
  const [version, purpose, expires, nonce, issuerB64, audienceB64, tag] = parts;
  if (
    version !== HUB_TICKET_VERSION ||
    !/^[a-z]{1,16}$/.test(purpose) ||
    !/^[0-9]{1,12}$/.test(expires) ||
    !NONCE_RE.test(nonce) ||
    !TAG_RE.test(tag)
  ) {
    return { ok: false, reason: 'malformed' };
  }
  const issuer = unb64Origin(issuerB64);
  const ticketAudience = unb64Origin(audienceB64);
  if (!issuer || !ticketAudience) return { ok: false, reason: 'malformed' };

  // Signature before anything else: without the secret every attempt gets the same answer.
  const expected = Buffer.from(hmacHex(ticketKey(secret), ticket.slice(0, -(tag.length + 1))), 'ascii');
  if (!timingSafeEqual(Buffer.from(tag, 'ascii'), expected)) return { ok: false, reason: 'signature' };
  if (purpose !== HUB_TICKET_PURPOSE) return { ok: false, reason: 'purpose' };

  const now = nowMs / 1000;
  const expiresAt = Number(expires);
  if (expiresAt <= now) return { ok: false, reason: 'expired' };
  if (expiresAt > now + HUB_TICKET_MAX_TTL_SECONDS) return { ok: false, reason: 'ttl' };
  if (issuer !== expectedIssuer) return { ok: false, reason: 'issuer' };
  if (!audience || ticketAudience !== audience) return { ok: false, reason: 'audience' };

  for (const [seen, until] of nonces) {
    if (until <= now) nonces.delete(seen);
  }
  if (nonces.has(nonce)) return { ok: false, reason: 'replayed' };
  // Only a holder of the secret can fill this table. Refuse rather than evict:
  // evicting would let an old ticket through again.
  if (nonces.size >= MAX_NONCES) return { ok: false, reason: 'busy' };
  nonces.set(nonce, expiresAt);
  return { ok: true };
}

/**
 * This site's origin as the browser reached it: the protocol honours
 * X-Forwarded-Proto through `trust proxy`, the host is the Host header the reverse
 * proxy passed on. A forged Host only makes a genuine ticket fail to match.
 */
export function requestOrigin(req: Request): string | undefined {
  return normalizeOrigin(`${req.protocol}://${req.get('host') ?? ''}`);
}

/**
 * Where to land after signing in: a path on this site, nothing else. Anything odd
 * (another origin, scheme-relative, backslashes, control characters, the API)
 * falls back to the home page instead of being rejected.
 */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string') return '/';
  const path = value.trim();
  if (!path || path.length > RETURN_PATH_MAX_LENGTH) return '/';
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '/';
  if (/[\u0000-\u001f\u007f]/.test(path)) return '/';
  if (/^\/(?:api|auth|public|ws)(?:[/?#]|$)/i.test(path)) return '/';
  try {
    if (new URL(path, 'http://webobsidian.invalid').origin !== 'http://webobsidian.invalid') return '/';
  } catch {
    return '/';
  }
  return path;
}

/** One line at start-up saying what this deployment will do. No secret material. */
export function logHubState(): void {
  const origin = hubOrigin();
  if (!origin) return;
  console.log(
    `[hub] ${origin} may frame this app; sign-in through the Hub is ${
      hubSsoEnabled() ? 'on' : 'off (WEBOBSIDIAN_HUB_EMBED_SECRET not set)'
    }`,
  );
}

/** Forget nonces and warnings. For tests. */
export function resetHubState(): void {
  nonces.clear();
  warned.clear();
}
