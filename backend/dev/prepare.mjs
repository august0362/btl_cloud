/* global process, fetch, AbortSignal */
import { access, mkdir, copyFile, rename, rm, readFile } from 'node:fs/promises';
import { constants, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join, dirname } from 'node:path';
import { command } from './commands.mjs';
import { root, backendDir, projectId } from './local-config.mjs';

const exists = (file) => access(file).then(() => true, () => false);
export async function copyIfMissing(from, to) {
  try { await copyFile(from, to, constants.COPYFILE_EXCL); } catch (error) { if (error.code !== 'EEXIST') throw error; }
}
export async function prepareDependencies(config, logs) {
  await copyIfMissing(join(backendDir, '.env.example'), join(backendDir, '.env'));
  const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  for (const folder of ['backend', 'frontend']) {
    if (!await exists(join(root, folder, 'node_modules', folder === 'backend' ? 'tsx/dist/cli.mjs' : 'vite/bin/vite.js'))) {
      logs.add('controller', 'INFO', `Đang cài dependency ${folder} bằng npm ci.`);
      await command(process.execPath, [npm, 'ci'], { cwd: join(root, folder), env: config.env, logs, service: folder, timeout: 600_000 });
    }
  }
}
async function download(url, destination, logs) {
  if (await exists(destination)) return;
  logs.add('controller', 'INFO', `Đang tải dịch vụ portable: ${url.split('/').at(-1)}.`);
  const temp = `${destination}.download`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(600_000) });
    if (!response.ok || !response.body) throw new Error(`Tải dịch vụ portable thất bại: HTTP ${response.status}.`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temp));
    await rename(temp, destination);
  } catch (error) { await rm(temp, { force: true }); throw error; }
}
export async function preparePortable(config, logs) {
  await mkdir(config.serviceDir, { recursive: true });
  const tar = join(process.env.SystemRoot, 'System32/tar.exe');
  if (!await exists(join(config.mysqlDir, 'bin/mysqld.exe'))) {
    const archive = join(config.serviceDir, 'mysql-8.4.7-winx64.zip');
    await download('https://cdn.mysql.com//archives/mysql-8.4/mysql-8.4.7-winx64.zip', archive, logs);
    await command(tar, ['-xf', archive, '-C', config.serviceDir], { logs, timeout: 180_000 });
  }
  if (!await exists(config.weedExe)) {
    const archive = join(config.serviceDir, 'seaweedfs.zip');
    await download('https://github.com/seaweedfs/seaweedfs/releases/download/4.48/windows_amd64.zip', archive, logs);
    await mkdir(dirname(config.weedExe), { recursive: true });
    await command(tar, ['-xf', archive, '-C', dirname(config.weedExe)], { logs });
  }
  if (!await exists(config.mysqlData)) {
    logs.add('mysql', 'INFO', 'Khởi tạo thư mục MySQL mới; dữ liệu đã có không bị reset.');
    await command(join(config.mysqlDir, 'bin/mysqld.exe'), ['--initialize-insecure', `--basedir=${config.mysqlDir}`, `--datadir=${config.mysqlData}`], { env: config.env, logs, service: 'mysql', timeout: 180_000 });
  }
  await mkdir(config.weedData, { recursive: true });
  await copyIfMissing(join(root, 'docker/seaweedfs/s3.json'), join(config.serviceDir, 's3.json'));
}
export async function initDatabase(config, logs) {
  const sql = "CREATE DATABASE IF NOT EXISTS btl_cloud CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; CREATE USER IF NOT EXISTS 'btl'@'%' IDENTIFIED BY 'btl_dev_password'; GRANT ALL PRIVILEGES ON btl_cloud.* TO 'btl'@'%';\n" + await readFile(join(root, 'docker/mysql/init/01-init.sql'), 'utf8');
  await command(join(config.mysqlDir, 'bin/mysql.exe'), ['--default-character-set=utf8mb4', '-uroot', '-h127.0.0.1', '-P3306'], { env: config.env, logs, service: 'mysql', input: sql });
}
export async function prepareApplication(config, logs) {
  await command(process.execPath, ['--env-file-if-exists=.env', 'node_modules/prisma/build/index.js', 'migrate', 'deploy'], { cwd: backendDir, env: config.env, logs, service: 'backend' });
  await command(process.execPath, ['--env-file-if-exists=.env', '--import', 'tsx', 'scripts/init-storage.ts'], { cwd: backendDir, env: config.env, logs, service: 'seaweedfs' });
}
export const mysqlArgs = (config) => ['--console', `--basedir=${config.mysqlDir}`, `--datadir=${config.mysqlData}`,
  `--pid-file=${join(config.mysqlData, `btl-${projectId}.pid`)}`, '--port=3306', '--bind-address=127.0.0.1', '--mysqlx=OFF'];
export const weedArgs = (config) => ['server', `-dir=${config.weedData}`, '-ip=127.0.0.1', '-ip.bind=127.0.0.1', '-master.volumeSizeLimitMB=1024', '-volume.max=100', '-master.telemetry=false', '-s3', '-s3.port=9000', `-s3.config=${join(config.serviceDir, 's3.json')}`];
