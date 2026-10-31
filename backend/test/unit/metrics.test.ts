import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Metrics } from '../../src/metrics/metrics.js';

/** XM-05 (E3-AC-02): rate, P50/P95 với dữ liệu đã biết, bộ nhớ không tăng theo số request. */
const T0 = Date.UTC(2026, 9, 30, 8, 0, 0); // đầu một ô 10 s

function clock() {
  let now = T0;
  return { now: () => now, set: (ms: number) => { now = T0 + ms; } };
}

describe('Metrics — request/giây và tỉ lệ lỗi (30 ô × 10 s)', () => {
  it('100 request trong 10 giây → ô đó ≈ 10 req/s; perSecond = ô 10 s gần nhất đã đủ', () => {
    const c = clock();
    const m = new Metrics(c.now);
    for (let i = 0; i < 100; i += 1) {
      c.set(i * 99); // 0 … 9 801 ms, cùng một ô
      m.recordResponse(200, 5);
    }
    c.set(10_500);
    const snap = m.snapshot();
    expect(snap.windowSeconds).toBe(300);
    expect(snap.requests.buckets).toHaveLength(30);
    expect(snap.requests.buckets[28]).toMatchObject({ startedAt: new Date(T0).toISOString(), requests: 100, perSecond: 10 });
    expect(snap.requests.perSecond).toBe(10);
    expect(snap.requests.total).toBe(100);
  });

  it('đếm 4xx/5xx và tỉ lệ trong 5 phút; ô quá 5 phút bị loại', () => {
    const c = clock();
    const m = new Metrics(c.now);
    for (const status of [200, 201, 204, 400, 401, 404, 500, 503]) m.recordResponse(status, 1);
    c.set(60_000);
    m.recordResponse(200, 1);
    c.set(60_001);
    expect(m.snapshot().requests).toMatchObject({ total: 9, status4xx: 3, status5xx: 2, errorRate4xx: 0.3333, errorRate5xx: 0.2222 });

    c.set(300_000); // ô T0 đã ra khỏi cửa sổ, ô 60 s còn
    expect(m.snapshot().requests).toMatchObject({ total: 1, status4xx: 0, status5xx: 0 });
    c.set(370_000);
    expect(m.snapshot().requests).toMatchObject({ total: 0, errorRate4xx: 0, errorRate5xx: 0, perSecond: 0 });
  });

  it('ô bị dùng lại sau 5 phút được đặt lại, không cộng dồn số cũ', () => {
    const c = clock();
    const m = new Metrics(c.now);
    m.recordResponse(500, 1);
    c.set(300_000); // cùng slot (index % 30) với T0
    m.recordResponse(200, 1);
    expect(m.snapshot().requests).toMatchObject({ total: 1, status5xx: 0 });
  });
});

describe('Metrics — P50/P95 (mảng vòng 1 000 mẫu)', () => {
  it('thời gian 1…100 ms → P50 = 50, P95 = 95 (nearest-rank), không phụ thuộc thứ tự', () => {
    const m = new Metrics(() => T0);
    const values = Array.from({ length: 100 }, (_, i) => i + 1).reverse();
    for (const ms of values) m.recordResponse(200, ms);
    expect(m.snapshot().latencyMs).toEqual({ p50: 50, p95: 95, samples: 100 });
  });

  it('chưa có mẫu → null', () => {
    expect(new Metrics(() => T0).snapshot().latencyMs).toEqual({ p50: null, p95: null, samples: 0 });
  });

  it('chỉ giữ 1 000 mẫu gần nhất', () => {
    const m = new Metrics(() => T0);
    for (let i = 0; i < 1_000; i += 1) m.recordResponse(200, 1);
    for (let i = 0; i < 1_000; i += 1) m.recordResponse(200, 500);
    expect(m.snapshot().latencyMs).toEqual({ p50: 500, p95: 500, samples: 1_000 });
  });

  it('bộ nhớ không tăng theo số request: 200 000 request vẫn chỉ 30 ô và 1 000 mẫu', () => {
    const c = clock();
    const m = new Metrics(c.now);
    const internals = m as unknown as { latencies: Float64Array; bucketRequests: Uint32Array; bucketIndex: Float64Array };
    const sizes = () => [internals.latencies.length, internals.bucketRequests.length, internals.bucketIndex.length];
    const before = sizes();
    for (let i = 0; i < 200_000; i += 1) {
      c.set(i * 3); // trải qua 600 s → mọi ô đều bị dùng lại
      m.recordResponse(i % 10 === 0 ? 500 : 200, i % 250);
    }
    expect(sizes()).toEqual(before);
    expect(before).toEqual([1_000, 30, 30]);
    const snap = m.snapshot();
    expect(snap.latencyMs.samples).toBe(1_000);
    expect(snap.requests.buckets).toHaveLength(30);
    expect(snap.requests.total).toBeLessThanOrEqual(100_000);
  });
});

describe('Metrics — middleware, lấy mẫu', () => {
  it('đếm request đang xử lý; xong thì giảm; không bao giờ làm hỏng request', async () => {
    const m = new Metrics();
    let release!: () => void;
    const app = express();
    app.use(m.middleware());
    app.get('/slow', (_req, res) => {
      release = () => res.status(201).send('ok');
    });
    app.get('/boom', (_req, res) => res.status(500).send('x'));
    const pending = request(app).get('/slow').then((res) => res.status);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(m.snapshot().requests.inFlight).toBe(1);
    release();
    expect(await pending).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await request(app).get('/boom')).status).toBe(500);
    const snap = m.snapshot();
    expect(snap.requests).toMatchObject({ inFlight: 0, total: 2, status5xx: 1 });
    expect(snap.latencyMs.samples).toBe(2);

    // recordResponse ném lỗi → request vẫn bình thường.
    (m as unknown as { recordResponse: () => void }).recordResponse = () => {
      throw new Error('boom');
    };
    expect((await request(app).get('/boom')).status).toBe(500);
  });

  it('sample(): lần đầu đặt mốc, lần sau có CPU/RAM máy và tiến trình', () => {
    const c = clock();
    const m = new Metrics(c.now);
    m.sample();
    expect(m.snapshot()).toMatchObject({ process: null, system: null, sampledAt: null });
    let x = 0;
    for (let i = 0; i < 1e6; i += 1) x += i; // tạo chút CPU
    expect(x).toBeGreaterThan(0);
    c.set(5_000);
    m.sample();
    const snap = m.snapshot();
    expect(snap.sampledAt).toBe(new Date(T0 + 5_000).toISOString());
    expect(snap.process?.rssBytes).toBeGreaterThan(0);
    expect(snap.process?.cpuPercent).toBeGreaterThanOrEqual(0);
    expect(snap.system?.totalMemBytes).toBeGreaterThan(0);
    expect(snap.system?.cpuCount).toBeGreaterThan(0);
  });

  it('start()/stop(): đo độ trễ event loop, timer không giữ process', async () => {
    const m = new Metrics();
    m.start(20);
    await new Promise((resolve) => setTimeout(resolve, 120));
    m.stop();
    const snap = m.snapshot();
    expect(snap.sampledAt).not.toBeNull();
    expect(snap.eventLoopDelayP99Ms === null || snap.eventLoopDelayP99Ms >= 0).toBe(true);
  });
});
