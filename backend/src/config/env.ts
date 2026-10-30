import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Biến môi trường theo ARCHITECTURE §A10.2. Sai/thiếu → dừng ngay khi khởi động (D-17). */
const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  HOST: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: booleanString.default('false'),
  ALLOWED_ORIGINS: z.string().default(''),
  SESSION_COOKIE_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, 'chỉ được chứa chữ, số, "_" và "-"')
    .default('sid'),
  COOKIE_SECURE: booleanString.default('false'),
  HSTS_ENABLED: booleanString.default('false'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
  TRUST_PROXY: z.string().default('false'),
  UPLOAD_TMP_DIR: z.string().min(1).default('./tmp/uploads'),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  SERVE_FRONTEND: booleanString.default('false'),
  FRONTEND_DIST_DIR: z.string().min(1).default('../frontend/dist'),
  INSTANCE_ID: z.string().min(1).optional(),
});

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string | undefined;
  databaseUrl: string;
  s3: { bucket: string; region: string; endpoint: string | undefined; forcePathStyle: boolean };
  allowedOrigins: string[];
  session: { cookieName: string; ttlHours: number };
  cookieSecure: boolean;
  hstsEnabled: boolean;
  trustProxy: boolean | number | string;
  upload: { tmpDir: string };
  authRateLimitMax: number;
  logLevel: LogLevel;
  serveFrontend: boolean;
  frontendDistDir: string;
  instanceId: string;
  version: string;
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Cấu hình môi trường không hợp lệ: ${problems.join('; ')}`);
    this.name = 'ConfigError';
  }
}

function parseTrustProxy(raw: string): boolean | number | string {
  if (raw === 'false') return false;
  if (raw === 'true') return true;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

function readAppVersion(): string {
  try {
    const pkgPath = fileURLToPath(new URL('../../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Biến rỗng được coi như không đặt, để mặc định áp dụng.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ''));
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  const e = result.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    databaseUrl: e.DATABASE_URL,
    s3: { bucket: e.S3_BUCKET, region: e.S3_REGION, endpoint: e.S3_ENDPOINT, forcePathStyle: e.S3_FORCE_PATH_STYLE },
    allowedOrigins: e.ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    session: { cookieName: e.SESSION_COOKIE_NAME, ttlHours: e.SESSION_TTL_HOURS },
    cookieSecure: e.COOKIE_SECURE,
    hstsEnabled: e.HSTS_ENABLED,
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    upload: { tmpDir: e.UPLOAD_TMP_DIR },
    authRateLimitMax: e.AUTH_RATE_LIMIT_MAX,
    logLevel: e.LOG_LEVEL,
    serveFrontend: e.SERVE_FRONTEND,
    frontendDistDir: e.FRONTEND_DIST_DIR,
    instanceId: e.INSTANCE_ID ?? hostname(),
    version: readAppVersion(),
  };
}
