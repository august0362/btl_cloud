import { parentPort, workerData } from 'node:worker_threads';
import { extractFingerprint } from './text-extractor.js';
const { path, fileType, sizeBytes } = workerData as {
    path: string;
    fileType: string;
    sizeBytes: number;
};
parentPort?.postMessage(await extractFingerprint(path, fileType, sizeBytes));
