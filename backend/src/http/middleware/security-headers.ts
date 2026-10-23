import type { RequestHandler } from 'express';
import helmet from 'helmet';

/** CSP và header bảo mật theo ARCHITECTURE §A5.8. HSTS chỉ bật khi có HTTPS (OD-05). */
export function securityHeaders(options: { hstsEnabled: boolean }): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: options.hstsEnabled ? { maxAge: 15_552_000, includeSubDomains: false } : false,
  });
}
