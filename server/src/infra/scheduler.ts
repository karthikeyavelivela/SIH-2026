import { Queue, Worker, type Job } from 'bullmq';
import { newRedis, redisEnabled } from './redis';
import { releaseDueScheduledBookings, startScheduledBookingReleaser } from '../services/scheduledBooking.service';
import { runAllActiveIncentiveRulesScheduled, startScheduledIncentiveRunner } from '../services/scheduledIncentiveRunner.service';
import { runWelfareChecks, startWelfareRunner } from '../services/welfarePool.service';
import { generateVisits, startContractRunner } from '../services/contract.service';
import { runPoliceVerificationReminders } from '../services/policeVerification.service';

/**
 * The four recurring jobs that must not run twice:
 *
 *   release-scheduled-bookings  every minute  scheduled bookings that have come due
 *   run-incentives              daily         incentive rules
 *   welfare-weekly-check        every 6 h     last week's welfare check (idempotent per week)
 *   contract-occurrences        hourly        the next week of contract visits
 *   police-verification-reminders daily       30 and 7 days before a police verification ends, and once after
 *
 * With REDIS_URL set they are BullMQ repeatable jobs: every tick is one job
 * and exactly one worker, on whichever instance, takes it. Without Redis each
 * keeps its own in-process timer, which is right for a single instance.
 *
 * The other background runners (auto-confirm, dispute SLA, wage-floor alerts)
 * are idempotent sweeps and keep their own timers on every instance.
 */
export interface RecurringJob {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

export const RECURRING_JOBS: RecurringJob[] = [
  { name: 'release-scheduled-bookings', everyMs: 60_000, run: () => releaseDueScheduledBookings() },
  { name: 'run-incentives', everyMs: 24 * 60 * 60 * 1000, run: () => runAllActiveIncentiveRulesScheduled() },
  { name: 'welfare-weekly-check', everyMs: 6 * 60 * 60 * 1000, run: () => runWelfareChecks() },
  { name: 'contract-occurrences', everyMs: 60 * 60 * 1000, run: () => generateVisits() },
  { name: 'police-verification-reminders', everyMs: 24 * 60 * 60 * 1000, run: () => runPoliceVerificationReminders() },
];

export const QUEUE_NAME = 'fyro-recurring';

let queue: Queue | null = null;
let worker: Worker | null = null;

/** Runs one named job. Exported so it can be tested without a queue. */
export async function processJob(job: Pick<Job, 'name'>): Promise<void> {
  const def = RECURRING_JOBS.find((j) => j.name === job.name);
  if (!def) throw new Error(`unknown recurring job: ${job.name}`);
  await def.run();
}

/**
 * Starts the recurring jobs. Returns which mechanism is in use. Called once
 * from server.ts, never from app.ts, so importing the app in a test starts
 * nothing.
 */
export async function startRecurringJobs(): Promise<'bullmq' | 'intervals'> {
  if (!redisEnabled()) {
    startScheduledBookingReleaser();
    startScheduledIncentiveRunner();
    startWelfareRunner();
    startContractRunner();
    // Daily; once at boot as well, since each reminder goes out only once however often this runs.
    setTimeout(() => void runPoliceVerificationReminders().catch(() => undefined), 120_000).unref();
    setInterval(() => void runPoliceVerificationReminders().catch(() => undefined), 24 * 60 * 60 * 1000).unref();
    return 'intervals';
  }
  queue = new Queue(QUEUE_NAME, { connection: newRedis('bullmq-queue', { maxRetriesPerRequest: null }) });
  for (const j of RECURRING_JOBS) {
    // Same scheduler id on every instance, so starting N instances still
    // leaves exactly one repeating schedule per job.
    await queue.upsertJobScheduler(j.name, { every: j.everyMs }, { name: j.name, opts: { removeOnComplete: 50, removeOnFail: 100, attempts: 1 } });
  }
  worker = new Worker(QUEUE_NAME, (job) => processJob(job), {
    connection: newRedis('bullmq-worker', { maxRetriesPerRequest: null }),
    concurrency: 1,
  });
  worker.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`recurring job ${job?.name} failed:`, err.message);
  });
  return 'bullmq';
}

export async function stopRecurringJobs(): Promise<void> {
  await worker?.close().catch(() => undefined);
  await queue?.close().catch(() => undefined);
  worker = null;
  queue = null;
}
