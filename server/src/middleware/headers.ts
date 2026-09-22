import type { Response } from 'express';
import helmet from 'helmet';
import { hubOrigin } from '../services/hubsso.js';

/**
 * Security headers. The CSP intentionally does NOT emit `upgrade-insecure-requests`
 * (it would break plain-HTTP self-hosting). `script-src` is 'self' + per-request
 * nonce (res.locals.cspNonce); `style-src` allows inline styles (React inline styles
 * + the SSR page's <style>). Note: inline <script> inside ```html render-blocks won't
 * execute under this policy — acceptable for the marginal XSS hardening it buys.
 *
 * Framing: nobody, unless WEBOBSIDIAN_HUB_URL names the Bookmark Hub — then that one
 * origin and nothing else (services/hubsso.ts). X-Frame-Options cannot express "one
 * other origin", so it is dropped in that case; frame-ancestors is what browsers obey.
 */
export function securityHeaders() {
  const hub = hubOrigin();
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", (_req, res) => `'nonce-${(res as Response).locals.cspNonce}'`],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        frameSrc: ["'self'", 'blob:'],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: hub ? [hub] : ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    ...(hub ? { xFrameOptions: false } : {}),
    // Allow social crawlers / other sites to load public share og:images.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
}
