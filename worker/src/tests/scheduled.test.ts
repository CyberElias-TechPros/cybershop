import { afterEach, describe, it, expect, vi } from 'vitest';
import { runHourlyJobs } from '../jobs/cron';
import worker from '../index';
import { dispatchMail } from '../lib/outbox';
import { productionEnv } from './fixtures/env';

vi.mock('../lib/payments', () => ({ flushPaymentActivations: vi.fn(), flushPaymentSettlements: vi.fn() }));
vi.mock('../lib/outbox', () => ({ dispatchMail: vi.fn() }));
vi.mock('../jobs/cron', () => ({ runHourlyJobs: vi.fn() }));
const controller = {} as ScheduledController;
const context = {} as ExecutionContext;
afterEach(() => vi.restoreAllMocks());

describe('Cloudflare scheduled entrypoint', () => {
  it('runs mail-only dispatch on the two-minute trigger', async () => {
    vi.mocked(runHourlyJobs).mockClear();
    vi.mocked(dispatchMail).mockResolvedValue({ sent: 1, failed: 0, cancelled: 0 });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const env = productionEnv();
    await worker.scheduled({ cron: '*/2 * * * *' } as ScheduledController, env, context);
    expect(dispatchMail).toHaveBeenCalledWith(env);
    expect(runHourlyJobs).not.toHaveBeenCalled();
  });
  it('awaits hourly maintenance and records completion', async () => {
    vi.mocked(runHourlyJobs).mockResolvedValue({ summary: { expired_subs: 1 } });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const env = productionEnv();
    await worker.scheduled(controller, env, context);
    expect(runHourlyJobs).toHaveBeenCalledWith(env);
    expect(log).toHaveBeenCalledWith('[cron] completed', expect.objectContaining({ summary: { expired_subs: 1 } }));
  });
  it('rejects failures for platform monitoring without exposing provider errors', async () => {
    vi.mocked(runHourlyJobs).mockRejectedValue(new Error('sensitive provider data'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(worker.scheduled(controller, productionEnv(), context)).rejects.toThrow('Scheduled maintenance failed');
    expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive');
  });
  it('does not run maintenance against unsafe production config', async () => {
    vi.mocked(runHourlyJobs).mockClear();
    await expect(worker.scheduled(controller, productionEnv({ PAYSTACK_MOCK: '1' }), context)).rejects.toThrow('unsafe configuration');
    expect(runHourlyJobs).not.toHaveBeenCalled();
  });
});
