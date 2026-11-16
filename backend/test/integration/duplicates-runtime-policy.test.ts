import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { createServices } from '../../src/container.js';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/lib/logger.js';
import { TEST_ENV } from '../helpers/config.js';
import { createTestContext, registerUser, resetDatabase, uploadRequest, type TestContext } from './context.js';

let resources: TestContext;
beforeAll(async () => { resources = await createTestContext(); });
afterAll(async () => { await resources.close(); });
beforeEach(async () => { await resetDatabase(resources.prisma); resources.storage.reset(); });

// Boot the real config -> services -> HTTP app pipeline. Do not use the fixture
// helper's maintenance-mode override for the application under test.
it.each(['unset', 'warn', 'off', 'block'])('rejects duplicates with deployed DUPLICATE_MODE=%s', async (legacyMode) => {
  const config = loadConfig({
    NODE_ENV: 'test', ...TEST_ENV, AUTH_RATE_LIMIT_MAX: '1000', LOG_LEVEL: 'silent',
    UPLOAD_TMP_DIR: resources.config.upload.tmpDir,
    ...(legacyMode === 'unset' ? {} : { DUPLICATE_MODE: legacyMode }),
  });
  const logger = createLogger({ level: 'silent', instanceId: 'runtime-policy-test' });
  const deps = { config, logger, prisma: resources.prisma, storage: resources.storage };
  const app = createApp({ ...deps, services: createServices(deps) });
  expect(config.duplicates.mode).toBe('block');
  const a = await registerUser(app), b = await registerUser(app);
  const bytes = Buffer.from('%PDF-1.7\nruntime configuration\n%%EOF');
  const existing = await uploadRequest(a, { title: 'public original', visibility: 'PUBLIC', file: bytes });
  expect(existing.status, JSON.stringify(existing.body)).toBe(201);
  const denied = await uploadRequest(b, { title: 'private copy', visibility: 'PRIVATE', file: bytes });
  expect(denied.status).toBe(409);
  expect(denied.body.error.code).toBe('DUPLICATE_DOCUMENT');
  expect(await resources.prisma.document.count()).toBe(1);
  expect(resources.storage.putKeys).toHaveLength(1);
});
