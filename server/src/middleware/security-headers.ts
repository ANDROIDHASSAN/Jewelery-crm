// server/src/middleware/security-headers.ts — defence-in-depth response headers.
//
// Why we ship our own instead of `helmet`: helmet brings 20+ tiny modules into
// the dep tree for what is ~30 lines of header-setting. Same defaults, fewer
// supply-chain links to audit, easier to tune the CSP per-route below.
//
// Coverage:
//  - Content-Security-Policy: locks scripts/styles to self + the live storefront
//    image CDNs (Unsplash) the catalogue uses. blocks inline JS so an XSS that
//    smuggles a <script> through CMS content cannot execute.
//  - Strict-Transport-Security: forces HTTPS for 6 months, includeSubDomains.
//    Only emitted when the request comes in over HTTPS so dev HTTP isn't pinned.
//  - X-Content-Type-Options: nosniff — prevents MIME confusion (e.g. an attacker
//    uploading an HTML file as image/png and the browser executing it as HTML).
//  - X-Frame-Options: DENY — full clickjacking block. The admin panel is never
//    embedded in iframes; the storefront isn't either.
//  - Referrer-Policy: strict-origin-when-cross-origin — don't leak full URLs
//    (which may contain order ids, search terms) to third parties.
//  - Permissions-Policy: aggressively deny capabilities we never need.
//  - Cross-Origin-Opener-Policy / Cross-Origin-Resource-Policy: hardening
//    against Spectre-style cross-origin reads.

import type { NextFunction, Request, Response } from 'express';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const CSP_DIRECTIVES = [
  // No fallback — every directive declared explicitly.
  "default-src 'self'",
  // Vite/React build inlines its bootstrap; we need 'self' + the bundled hashes.
  // No 'unsafe-inline' in prod; tailwind's runtime styles are statically built.
  "script-src 'self'",
  // shadcn + Radix inject inline styles for animations; permit 'unsafe-inline'
  // for styles only (not script) since CSS injection isn't an exec primitive.
  "style-src 'self' 'unsafe-inline'",
  // Catalogue + CMS imagery comes from Unsplash + a couple of CDN hosts. Add
  // the live storefront image hosts here as the merchant adds them.
  "img-src 'self' data: blob: https://images.unsplash.com https://*.unsplash.com",
  // Connect-src: same-origin API + analytics beacons (none today).
  "connect-src 'self' https://api.goldapi.io",
  // Fonts: self only — no Google Fonts side-loading.
  "font-src 'self' data:",
  // Disallow plugins entirely.
  "object-src 'none'",
  // Lock down where iframes can be loaded into our origin (we don't use any).
  "frame-ancestors 'none'",
  "frame-src 'none'",
  // Force HTTPS for any subresource at runtime.
  'upgrade-insecure-requests',
  // base-uri locked down so an XSS can't <base href> elsewhere.
  "base-uri 'self'",
  // form-action: only post forms back to our own origin (defends against XSS
  // exfil via <form action="evil.com">).
  "form-action 'self'",
].join('; ');

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // HSTS — only over HTTPS, otherwise a dev HTTP visit could pin localhost.
  const proto = req.headers['x-forwarded-proto'] ?? (req.secure ? 'https' : 'http');
  if (proto === 'https') {
    res.setHeader('Strict-Transport-Security', `max-age=${ONE_YEAR_SECONDS}; includeSubDomains; preload`);
  }

  res.setHeader('Content-Security-Policy', CSP_DIRECTIVES);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Origin-Agent-Cluster', '?1');

  // Disable every browser capability we don't use. Each entry is a feature
  // policy directive — empty allowlist () means deny for all origins.
  res.setHeader(
    'Permissions-Policy',
    [
      'accelerometer=()',
      'autoplay=()',
      'camera=()',
      'display-capture=()',
      'encrypted-media=()',
      'fullscreen=(self)',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'payment=()',
      'picture-in-picture=()',
      'publickey-credentials-get=()',
      'screen-wake-lock=()',
      'sync-xhr=()',
      'usb=()',
      'xr-spatial-tracking=()',
    ].join(', '),
  );

  // Cross-origin isolation — defence against Spectre + cross-origin reads of
  // sensitive endpoints. Same-origin opens / fetches only.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');

  // Strip the Express fingerprint header.
  res.removeHeader('X-Powered-By');

  next();
}
