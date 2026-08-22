import { IncentiveRule } from '../models/IncentiveRule';
import { User } from '../models/User';
import { runIncentiveRule } from './incentive.service';
import { writeAuditLog } from './audit.service';
import { env } from '../config/env';

/**
 * Phase 6.5 — the automatic half of admin/incentives's "Run all active
 * rules now" button. Before this, the ONLY way an incentive rule ever
 * actually granted a bonus was an admin manually clicking that button
 * (incentive.controller.ts's runIncentives) — a real rule sitting active
 * with nobody remembering to click it granted nothing, forever. Reuses
 * the exact same runIncentiveRule() service function the manual button
 * calls, so a scheduled run and a manual run are provably the same
 * disbursement logic, not a parallel/lesser implementation.
 *
 * Attributed to the platform's own seeded admin account (looked up by
 * env.ADMIN_PHONE at run time, not hardcoded, so it resolves correctly
 * per environment) since AuditLog.actorId is a required real ObjectId —
 * there's no separate "system" actor concept in this codebase, and
 * attributing background jobs to a designated admin account is the
 * same honest pattern most platforms use rather than inventing a
 * synthetic non-existent actor.
 */
export async function runAllActiveIncentiveRulesScheduled(): Promise<{ rulesRun: number; totalGranted: number }> {
  const admin = await User.findOne({ phone: env.ADMIN_PHONE, role: 'admin' }).select('_id role').lean();
  if (!admin) {
    // No seeded admin yet (fresh environment before `npm run seed:admin`)
    // — nothing to attribute the audit trail to, skip this cycle rather
    // than writing a broken record.
    return { rulesRun: 0, totalGranted: 0 };
  }

  const rules = await IncentiveRule.find({ active: true });
  let totalGranted = 0;

  for (const rule of rules) {
    const granted = await runIncentiveRule(rule, admin._id.toString());
    totalGranted += granted.length;
    await writeAuditLog({
      actorId: admin._id.toString(),
      actorRole: admin.role,
      action: 'incentives_run_scheduled',
      targetType: 'IncentiveRule',
      targetId: rule._id.toString(),
      details: { grantedCount: granted.length, triggeredBy: 'scheduler' },
    });
  }

  return { rulesRun: rules.length, totalGranted };
}

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily — matches the real business cadence incentive periods run on
let intervalHandle: ReturnType<typeof setInterval> | null = null;

/** Called once from server.ts's bootstrap, same convention as startScheduledBookingReleaser — never from app.ts, so importing app.ts in tests never starts a real timer. */
export function startScheduledIncentiveRunner(): void {
  if (intervalHandle) return;

  // Runs once immediately at boot (so the effect is provably real without
  // waiting a full day) and then every RUN_INTERVAL_MS after that.
  runAllActiveIncentiveRulesScheduled().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('runAllActiveIncentiveRulesScheduled (initial run) failed:', err);
  });

  intervalHandle = setInterval(() => {
    runAllActiveIncentiveRulesScheduled().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('runAllActiveIncentiveRulesScheduled failed:', err);
    });
  }, RUN_INTERVAL_MS);
  intervalHandle.unref();
}

export function stopScheduledIncentiveRunner(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
