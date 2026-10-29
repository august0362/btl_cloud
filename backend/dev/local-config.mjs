/* global process */
import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath, URL } from 'node:url';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';

export const root = fileURLToPath(new URL('../..', import.meta.url));
export const backendDir = join(root, 'backend');
export const runtimeDir = join(backendDir, 'tmp');
export const runtimeFile = join(runtimeDir, 'local-controller.json');
export const diagnosticFile = join(runtimeDir, 'local-services.ndjson');
export const projectId = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 12);
export function localConfig() {
  const file = join(backendDir, existsSync(join(backendDir, '.env')) ? '.env' : '.env.example');
  const values = { ...parseEnv(readFileSync(file, 'utf8')), ...process.env };
  for (const field of ['DATABASE_URL', 'S3_ENDPOINT']) {
    const url = new URL(values[field]);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error(`${field} phải trỏ tới loopback khi dùng launcher local. Không kết nối AWS.`);
  }
  if (values.NODE_ENV === 'production') throw new Error('Launcher chỉ dùng cho development, không dùng NODE_ENV=production.');
  const serviceDir = join(process.env.LOCALAPPDATA ?? runtimeDir, 'btl-cloud-services');
  return {
    env: { ...values, NODE_ENV: 'development', DEBUG: '' }, serviceDir,
    mysqlDir: join(serviceDir, 'mysql-8.4.7-winx64'),
    mysqlData: join(serviceDir, 'mysql-data'), weedData: join(serviceDir, 'seaweedfs-data'),
    weedExe: join(serviceDir, 'seaweedfs', 'weed.exe'),
    composeProject: basename(root).toLowerCase().replace(/[^a-z0-9_-]/g, '').replace(/^[_-]+/, ''),
    secrets: [...Object.entries(values).filter(([key]) => /PASSWORD|SECRET|TOKEN|ACCESS_KEY|DATABASE_URL/.test(key)).map(([, value]) => value), decodeURIComponent(new URL(values.DATABASE_URL).password)],
  };
}
