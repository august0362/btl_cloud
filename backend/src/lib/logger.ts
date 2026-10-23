import { pino, type DestinationStream, type Logger } from 'pino';

export type { Logger };

/** ARCHITECTURE §A5.8: không bao giờ ghi mật khẩu, cookie, token ra log. */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'req.body.password',
  'password',
  '*.password',
  'token',
  '*.token',
];

export function createLogger(options: { level: string; instanceId: string }, destination?: DestinationStream): Logger {
  const loggerOptions = {
    level: options.level,
    base: { instanceId: options.instanceId },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  };
  return destination ? pino(loggerOptions, destination) : pino(loggerOptions);
}
