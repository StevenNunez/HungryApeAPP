import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { rejectUnlessCron } from '@/lib/cron-auth';
import { rateLimit } from '@/lib/rate-limit';

const req = (auth?: string) =>
  new NextRequest('http://localhost/api/cron/x', { headers: auth ? { authorization: auth } : {} });

describe('rejectUnlessCron (falla cerrado)', () => {
  afterEach(() => { delete process.env.CRON_SECRET; });

  it('sin CRON_SECRET configurado → 500 (nunca queda público)', () => {
    expect(rejectUnlessCron(req('Bearer lo-que-sea'))?.status).toBe(500);
  });
  it('secret incorrecto o ausente → 401', () => {
    process.env.CRON_SECRET = 'secreto';
    expect(rejectUnlessCron(req('Bearer otro'))?.status).toBe(401);
    expect(rejectUnlessCron(req())?.status).toBe(401);
  });
  it('secret correcto → null (pasa)', () => {
    process.env.CRON_SECRET = 'secreto';
    expect(rejectUnlessCron(req('Bearer secreto'))).toBeNull();
  });
});

describe('rateLimit', () => {
  it('permite hasta el límite y bloquea el siguiente', () => {
    const key = 'k-' + Math.random();
    expect(rateLimit(key, 2, 1000)).toBe(true);
    expect(rateLimit(key, 2, 1000)).toBe(true);
    expect(rateLimit(key, 2, 1000)).toBe(false);
  });
  it('libera cuando pasa la ventana', () => {
    vi.useFakeTimers();
    const key = 'w-' + Math.random();
    expect(rateLimit(key, 1, 1000)).toBe(true);
    expect(rateLimit(key, 1, 1000)).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(rateLimit(key, 1, 1000)).toBe(true);
    vi.useRealTimers();
  });
});
