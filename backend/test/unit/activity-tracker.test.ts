import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../src/lib/logger.js';
import { ActivityTracker } from '../../src/modules/users/activity-tracker.js';

/** XM-01: tối đa 1 lần ghi / 5 phút / user; lỗi ghi chỉ log. */
function setup(touchLastActive = vi.fn().mockResolvedValue(undefined)) {
  let now = new Date('2026-10-30T08:00:00.000Z');
  const logs: string[] = [];
  const logger = createLogger({ level: 'warn', instanceId: 'test' }, new Writable({
    write(chunk, _encoding, callback) {
      logs.push(String(chunk));
      callback();
    },
  }));
  const tracker = new ActivityTracker({ touchLastActive }, { now: () => now }, logger);
  return { tracker, touchLastActive, logs, advance: (ms: number) => { now = new Date(now.getTime() + ms); } };
}

describe('ActivityTracker (XM-01)', () => {
  it('2 request trong 5 phút → 1 lần ghi; sau 5 phút → ghi lần nữa', () => {
    const { tracker, touchLastActive, advance } = setup();
    tracker.touch('u1');
    advance(4 * 60 * 1000);
    tracker.touch('u1');
    expect(touchLastActive).toHaveBeenCalledTimes(1);
    advance(60 * 1000);
    tracker.touch('u1');
    expect(touchLastActive).toHaveBeenCalledTimes(2);
    expect(touchLastActive).toHaveBeenLastCalledWith('u1', new Date('2026-10-30T08:05:00.000Z'));
  });

  it('mỗi user được đếm riêng', () => {
    const { tracker, touchLastActive } = setup();
    tracker.touch('u1');
    tracker.touch('u2');
    tracker.touch('u1');
    expect(touchLastActive.mock.calls.map(([id]) => id)).toEqual(['u1', 'u2']);
  });

  it('ghi lỗi (bất đồng bộ hoặc đồng bộ) → không ném, log WARN, request sau thử lại', async () => {
    const failing = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(undefined);
    const { tracker, logs } = setup(failing);
    expect(() => tracker.touch('u1')).not.toThrow();
    await vi.waitFor(() => expect(logs.join('')).toContain('users.activity_write_failed'));
    tracker.touch('u1');
    expect(failing).toHaveBeenCalledTimes(2);

    const throwing = vi.fn(() => {
      throw new Error('sync');
    });
    const sync = setup(throwing);
    expect(() => sync.tracker.touch('u1')).not.toThrow();
    expect(sync.logs.join('')).toContain('users.activity_write_failed');
  });

  it('bộ nhớ có giới hạn: quá 10 000 user thì xoá sạch Map', () => {
    const { tracker, touchLastActive } = setup();
    for (let i = 0; i < 10_001; i += 1) tracker.touch(`u${i}`);
    expect((tracker as unknown as { lastWrites: Map<string, number> }).lastWrites.size).toBeLessThanOrEqual(10_000);
    // u0 đã bị xoá khỏi Map → ghi lại được.
    tracker.touch('u0');
    expect(touchLastActive).toHaveBeenCalledTimes(10_002);
  });
});
