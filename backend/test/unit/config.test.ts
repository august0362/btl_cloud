import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config/env.js';

const minimal = { DATABASE_URL: 'mysql://u:p@localhost:3306/db', S3_BUCKET: 'bucket-a' };

describe('loadConfig (M1-04, §A10.2)', () => {
  it('báo lỗi nêu rõ tên biến khi thiếu DATABASE_URL', () => {
    expect(() => loadConfig({ S3_BUCKET: 'bucket-a' })).toThrow(ConfigError);
    try {
      loadConfig({ S3_BUCKET: 'bucket-a' });
    } catch (error) {
      expect((error as ConfigError).problems.join(' ')).toContain('DATABASE_URL');
    }
  });

  it('áp dụng giá trị mặc định đúng bảng §A10.2', () => {
    const config = loadConfig(minimal);
    expect(config).toMatchObject({
      nodeEnv: 'development',
      port: 3000,
      session: { cookieName: 'sid', ttlHours: 168 },
      cookieSecure: false,
      hstsEnabled: false,
      trustProxy: false,
      upload: { tmpDir: './tmp/uploads' },
      authRateLimitMax: 20,
      serveFrontend: false,
      s3: { bucket: 'bucket-a', region: 'us-east-1', endpoint: undefined, forcePathStyle: false },
    });
    expect(config.instanceId.length).toBeGreaterThan(0);
    expect(config.version).toBe('1.0.0');
  });

  it('parse boolean, số, danh sách origin và TRUST_PROXY', () => {
    const config = loadConfig({
      ...minimal,
      COOKIE_SECURE: 'true',
      PORT: '3001',
      HOST: '127.0.0.1',
      ALLOWED_ORIGINS: 'http://a.test, http://b.test ,',
      TRUST_PROXY: '1',
      SESSION_COOKIE_NAME: '__Host-sid',
      S3_ENDPOINT: '',
    });
    expect(config.cookieSecure).toBe(true);
    expect(config.port).toBe(3001);
    expect(config.host).toBe('127.0.0.1');
    expect(config.allowedOrigins).toEqual(['http://a.test', 'http://b.test']);
    expect(config.trustProxy).toBe(1);
    expect(config.session.cookieName).toBe('__Host-sid');
    expect(config.s3.endpoint).toBeUndefined();
  });

  it('từ chối giá trị sai kiểu', () => {
    expect(() => loadConfig({ ...minimal, COOKIE_SECURE: 'yes' })).toThrow(/COOKIE_SECURE/);
    expect(() => loadConfig({ ...minimal, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ ...minimal, S3_ENDPOINT: 'not a url' })).toThrow(/S3_ENDPOINT/);
  });

  it('AUDIT_RETENTION_DAYS: mặc định 90, cho phép 1–3650 (§A12.7)', () => {
    expect(loadConfig(minimal).audit.retentionDays).toBe(90);
    expect(loadConfig({ ...minimal, AUDIT_RETENTION_DAYS: '1' }).audit.retentionDays).toBe(1);
    expect(loadConfig({ ...minimal, AUDIT_RETENTION_DAYS: '3650' }).audit.retentionDays).toBe(3650);
    for (const value of ['0', '3651', '1.5', 'abc']) {
      expect(() => loadConfig({ ...minimal, AUDIT_RETENTION_DAYS: value })).toThrow(/AUDIT_RETENTION_DAYS/);
    }
  });
});
