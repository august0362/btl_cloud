import os from 'node:os';
import { monitorEventLoopDelay, performance, type ELDHistogram } from 'node:perf_hooks';
import type { RequestHandler } from 'express';

/**
 * XM-05 (E3, §A12.6): số liệu hiệu năng của MỘT tiến trình backend, chỉ trong bộ nhớ, kích thước cố định,
 * mất khi khởi động lại. Không endpoint HTTP; `express-child.mjs` (chỉ dev) ghi snapshot ra file.
 * Không phụ thuộc logger hay audit (XD-15). Không bao giờ ném lỗi vào request.
 */
const BUCKET_MS = 10_000;
const BUCKET_COUNT = 30; // 30 ô × 10 s = 5 phút
const LATENCY_SAMPLES = 1_000;
const SAMPLE_INTERVAL_MS = 5_000;

export interface MetricsBucket {
  startedAt: string;
  requests: number;
  status4xx: number;
  status5xx: number;
  perSecond: number;
}

export interface MetricsSnapshot {
  at: string;
  windowSeconds: number;
  requests: {
    /** 30 ô 10 giây của 5 phút gần nhất, cũ → mới; ô cuối là ô đang chạy. */
    buckets: MetricsBucket[];
    total: number;
    status4xx: number;
    status5xx: number;
    errorRate4xx: number;
    errorRate5xx: number;
    /** Request/giây của ô 10 giây gần nhất đã đủ. */
    perSecond: number;
    inFlight: number;
  };
  /** Nearest-rank trên tối đa 1 000 thời gian phản hồi gần nhất. */
  latencyMs: { p50: number | null; p95: number | null; samples: number };
  /** Mẫu lấy mỗi 5 s; null trước lần lấy mẫu đầu. CPU là % tổng năng lực máy (mọi lõi). */
  process: { cpuPercent: number; rssBytes: number; heapUsedBytes: number; heapTotalBytes: number } | null;
  system: { cpuPercent: number; cpuCount: number; freeMemBytes: number; totalMemBytes: number } | null;
  eventLoopDelayP99Ms: number | null;
  sampledAt: string | null;
}

interface CpuTotals {
  idle: number;
  total: number;
}

function systemCpuTotals(): CpuTotals {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    const { user, nice, sys, idle: cpuIdle, irq } = cpu.times;
    idle += cpuIdle;
    total += user + nice + sys + cpuIdle + irq;
  }
  return { idle, total };
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export class Metrics {
  private readonly bucketIndex = new Float64Array(BUCKET_COUNT).fill(-1);
  private readonly bucketRequests = new Uint32Array(BUCKET_COUNT);
  private readonly bucket4xx = new Uint32Array(BUCKET_COUNT);
  private readonly bucket5xx = new Uint32Array(BUCKET_COUNT);
  private readonly latencies = new Float64Array(LATENCY_SAMPLES);
  private latencyNext = 0;
  private latencyCount = 0;
  private inFlight = 0;

  private timer: NodeJS.Timeout | undefined;
  private histogram: ELDHistogram | undefined;
  private lastCpu: { at: number; usage: NodeJS.CpuUsage; system: CpuTotals } | undefined;
  private lastSample: Pick<MetricsSnapshot, 'process' | 'system' | 'eventLoopDelayP99Ms' | 'sampledAt'> = {
    process: null,
    system: null,
    eventLoopDelayP99Ms: null,
    sampledAt: null,
  };

  constructor(private readonly now: () => number = Date.now) {}

  /** Đặt ngay sau `requestId` (§A3.8). +1 khi vào, −1 khi xong hoặc bị huỷ. */
  middleware(): RequestHandler {
    return (_req, res, next) => {
      try {
        const startedAt = performance.now();
        this.inFlight += 1;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          try {
            this.inFlight -= 1;
            this.recordResponse(res.statusCode, performance.now() - startedAt);
          } catch {
            // Số liệu không bao giờ được làm hỏng request.
          }
        };
        res.once('finish', finish);
        res.once('close', finish);
      } catch {
        // như trên
      }
      next();
    };
  }

  recordResponse(statusCode: number, durationMs: number): void {
    const index = Math.floor(this.now() / BUCKET_MS);
    const slot = index % BUCKET_COUNT;
    if (this.bucketIndex[slot] !== index) {
      this.bucketIndex[slot] = index;
      this.bucketRequests[slot] = 0;
      this.bucket4xx[slot] = 0;
      this.bucket5xx[slot] = 0;
    }
    this.bucketRequests[slot] = (this.bucketRequests[slot] ?? 0) + 1;
    if (statusCode >= 500) this.bucket5xx[slot] = (this.bucket5xx[slot] ?? 0) + 1;
    else if (statusCode >= 400) this.bucket4xx[slot] = (this.bucket4xx[slot] ?? 0) + 1;

    this.latencies[this.latencyNext] = durationMs;
    this.latencyNext = (this.latencyNext + 1) % LATENCY_SAMPLES;
    this.latencyCount = Math.min(this.latencyCount + 1, LATENCY_SAMPLES);
  }

  /** Lấy mẫu CPU/RAM/event loop; lần đầu chỉ đặt mốc CPU. */
  sample(): void {
    const at = this.now();
    const usage = process.cpuUsage();
    const system = systemCpuTotals();
    const cpuCount = Math.max(1, os.cpus().length);
    const memory = process.memoryUsage();
    const previous = this.lastCpu;
    this.lastCpu = { at, usage, system };
    if (!previous || at <= previous.at) return;

    const elapsedMicros = (at - previous.at) * 1000;
    const processMicros = usage.user - previous.usage.user + (usage.system - previous.usage.system);
    const systemTotal = system.total - previous.system.total;
    const systemIdle = system.idle - previous.system.idle;
    const p99 = this.histogram ? this.histogram.percentile(99) / 1e6 : null;
    this.histogram?.reset();
    this.lastSample = {
      process: {
        cpuPercent: round(Math.min(100, (processMicros / (elapsedMicros * cpuCount)) * 100)),
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
      },
      system: {
        cpuPercent: systemTotal > 0 ? round(((systemTotal - systemIdle) / systemTotal) * 100) : 0,
        cpuCount,
        freeMemBytes: os.freemem(),
        totalMemBytes: os.totalmem(),
      },
      eventLoopDelayP99Ms: p99 === null || Number.isNaN(p99) ? null : round(p99),
      sampledAt: new Date(at).toISOString(),
    };
  }

  /** Bật lấy mẫu mỗi 5 s (server.ts). Timer `unref` → không giữ process sống. */
  start(intervalMs = SAMPLE_INTERVAL_MS): void {
    if (this.timer) return;
    this.histogram = monitorEventLoopDelay({ resolution: 20 });
    this.histogram.enable();
    this.sample();
    this.timer = setInterval(() => {
      try {
        this.sample();
      } catch {
        // bỏ qua lượt lấy mẫu lỗi
      }
    }, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.histogram?.disable();
    this.histogram = undefined;
  }

  snapshot(): MetricsSnapshot {
    const at = this.now();
    const current = Math.floor(at / BUCKET_MS);
    const buckets: MetricsBucket[] = [];
    let total = 0;
    let status4xx = 0;
    let status5xx = 0;
    for (let index = current - BUCKET_COUNT + 1; index <= current; index += 1) {
      const slot = index % BUCKET_COUNT;
      const live = this.bucketIndex[slot] === index;
      const requests = live ? (this.bucketRequests[slot] ?? 0) : 0;
      const c4xx = live ? (this.bucket4xx[slot] ?? 0) : 0;
      const c5xx = live ? (this.bucket5xx[slot] ?? 0) : 0;
      total += requests;
      status4xx += c4xx;
      status5xx += c5xx;
      buckets.push({ startedAt: new Date(index * BUCKET_MS).toISOString(), requests, status4xx: c4xx, status5xx: c5xx, perSecond: requests / (BUCKET_MS / 1000) });
    }

    const sorted = Array.from(this.latencies.subarray(0, this.latencyCount)).sort((a, b) => a - b);
    const percentile = (q: number) => (sorted.length === 0 ? null : round(sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] ?? 0));

    return {
      at: new Date(at).toISOString(),
      windowSeconds: (BUCKET_COUNT * BUCKET_MS) / 1000,
      requests: {
        buckets,
        total,
        status4xx,
        status5xx,
        errorRate4xx: total === 0 ? 0 : round(status4xx / total, 4),
        errorRate5xx: total === 0 ? 0 : round(status5xx / total, 4),
        perSecond: buckets[buckets.length - 2]?.perSecond ?? 0,
        inFlight: this.inFlight,
      },
      latencyMs: { p50: percentile(0.5), p95: percentile(0.95), samples: sorted.length },
      ...this.lastSample,
    };
  }
}

/** Một bộ đếm cho cả tiến trình: app.ts, server.ts và express-child.mjs dùng chung instance này. */
export const metrics = new Metrics();

export function metricsMiddleware(): RequestHandler {
  return metrics.middleware();
}

export function getMetricsSnapshot(): MetricsSnapshot {
  return metrics.snapshot();
}
