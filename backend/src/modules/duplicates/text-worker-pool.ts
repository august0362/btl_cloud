import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { DUPLICATE_POLICY as P, skipped, type TextFingerprint } from './duplicate.policy.js';
interface Job {
    path: string;
    fileType: string;
    sizeBytes: number;
    resolve(result: TextFingerprint): void;
    timer: NodeJS.Timeout;
    worker?: Worker;
    done: boolean;
}
/** One new worker per job. Deadlines include time spent waiting in the bounded queue. */
export class TextWorkerPool {
    private active: Job | null = null;
    private queue: Job[] = [];
    constructor(private readonly testHooks: {
        deadlineMs?: number;
        createWorker?: (data: {
            path: string;
            fileType: string;
            sizeBytes: number;
        }) => Worker;
    } = {}) { }
    analyze(path: string, fileType: string, sizeBytes: number): Promise<TextFingerprint> {
        if (this.active && this.queue.length >= P.queueSize)
            return Promise.resolve(skipped('BUSY'));
        return new Promise((resolve) => {
            const job: Job = {
                path, fileType, sizeBytes, resolve, done: false,
                timer: setTimeout(() => { void this.finish(job, skipped('TIMEOUT')); }, this.testHooks.deadlineMs ?? P.deadlineMs),
            };
            if (this.active)
                this.queue.push(job);
            else
                this.start(job);
        });
    }
    private start(job: Job): void {
        this.active = job;
        try {
            const compiled = new URL('./text.worker.js', import.meta.url);
            let entry: URL | string = compiled;
            let evaluate = false;
            // Production only needs compiled JavaScript, never the development tsx dependency.
            if (!existsSync(compiled)) {
                const source = new URL('./text.worker.ts', import.meta.url);
                const tsxApi = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm/api')).href;
                entry = `import(${JSON.stringify(tsxApi)}).then(({tsImport})=>tsImport(${JSON.stringify(source.href)},${JSON.stringify(import.meta.url)}))`;
                evaluate = true;
            }
            job.worker = this.testHooks.createWorker?.({ path: job.path, fileType: job.fileType, sizeBytes: job.sizeBytes }) ?? new Worker(entry, {
                eval: evaluate,
                workerData: { path: job.path, fileType: job.fileType, sizeBytes: job.sizeBytes },
                resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32 },
                stdout: true, stderr: true,
            });
            // Parser diagnostics can include document data. Only structured, content-free events leave the worker.
            job.worker.stdout?.resume();
            job.worker.stderr?.resume();
            job.worker.once('message', (result: TextFingerprint) => { void this.finish(job, result); });
            job.worker.once('error', () => { void this.finish(job, skipped('ERROR')); });
            job.worker.once('exit', () => { if (!job.done)
                void this.finish(job, skipped('ERROR')); });
        }
        catch {
            void this.finish(job, skipped('ERROR'));
        }
    }
    private async finish(job: Job, result: TextFingerprint): Promise<void> {
        if (job.done)
            return;
        job.done = true;
        clearTimeout(job.timer);
        if (job.worker)
            await job.worker.terminate();
        this.queue = this.queue.filter((candidate) => candidate !== job);
        if (this.active === job) {
            this.active = null;
            const next = this.queue.shift();
            if (next)
                this.start(next);
        }
        job.resolve(result);
    }
}
