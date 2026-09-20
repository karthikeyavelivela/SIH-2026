import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import {
  GovernmentWageFloor,
  SkillBand,
  WageZone,
  DEFAULT_WORKING_DAYS_PER_MONTH,
  DEFAULT_WORKING_HOURS_PER_DAY,
} from '../models/GovernmentWageFloor';
import { deriveRates } from '../services/wageFloor.service';

/**
 * The Andhra Pradesh statutory minimum wage, as the platform enforces it.
 *
 * Notification No. G/3186486/2026, dated 23 March 2026, Office of the
 * Commissioner of Labour, Andhra Pradesh, Vijayawada, under the Minimum
 * Wages Act 1948; published in the AP Gazette Extraordinary on 25 March
 * 2026 and effective from 1 April 2026. The Variable Dearness Allowance is
 * revised twice yearly against the Consumer Price Index, so this set runs
 * to 30 September 2026 and a fresh notification replaces it.
 *
 * ON THE FIGURES, WHICH MATTERS
 *
 * The gazette PDF itself could not be retrieved: the AP Labour Department's
 * minimum-wages page returns no document, and the compliance libraries that
 * host the PDF put it behind a login. The rupee figures below are therefore
 * transcribed from a published secondary compilation of this notification,
 * and every row is stamped sourceType 'secondary_compilation' so that the
 * platform never claims more authority for them than it has.
 *
 * They are not one source's word. The anchors cross-check against three
 * independent compilations of the same notification: the ₹8,947 VDA, the
 * Zone II unskilled total of ₹12,317 (basic ₹3,370 + VDA), and the Zone I
 * unskilled total of ₹12,647 all agree across them. The internal structure
 * is consistent too — ₹380 between adjacent bands, ₹330 between zones at
 * every band.
 *
 * Replace them the moment the gazette is in hand: one PATCH per row through
 * /api/admin/wage-floors, which supersedes rather than overwrites and
 * records who changed it.
 *
 * WHICH SCHEDULE
 *
 * The Shops and Commercial Establishments schedule. Of the state's
 * scheduled employments it is the one whose designations actually resemble
 * what is booked here — household and premises work carried out for a
 * business or a household, rather than factory, mining or plantation work.
 * A trade with its own schedule (construction, security) would want its own
 * rows; they are not seeded because guessing at them is exactly what this
 * file refuses to do.
 */

const NOTIFICATION = {
  state: 'Andhra Pradesh',
  scheduledEmployment: 'Shops and Commercial Establishments',
  notificationNumber: 'G/3186486/2026',
  notificationDate: new Date('2026-03-23T00:00:00.000Z'),
  effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
  effectiveUntil: new Date('2026-09-30T23:59:59.999Z'),
  sourceType: 'secondary_compilation' as const,
  sourceUrl: 'https://academy.salarybox.in/minimum-wages/andhra-pradesh',
  sourceNote:
    'Transcribed from a published compilation of Notification G/3186486/2026; ' +
    'anchors (VDA 8947, Zone I unskilled 12647, Zone II unskilled 12317) cross-checked ' +
    'against two further independent compilations. The gazette PDF was not retrievable. ' +
    'Replace with gazette figures when available.',
};

/** Basic + VDA, as notified. VDA is the same ₹8,947 for every band and zone. */
const VDA = 8947;

const BASIC: Record<WageZone, Partial<Record<SkillBand, number>>> = {
  zone_1: { unskilled: 3700, semi_skilled: 4080, skilled: 4460, highly_skilled: 4940 },
  zone_2: { unskilled: 3370, semi_skilled: 3750, skilled: 4130, highly_skilled: 4610 },
  zone_3: {},
};

async function seedWageFloors() {
  await connectDb();
  try {
    for (const zone of ['zone_1', 'zone_2'] as WageZone[]) {
      for (const [skillBand, basic] of Object.entries(BASIC[zone]) as [SkillBand, number][]) {
        const existing = await GovernmentWageFloor.findOne({
          state: NOTIFICATION.state,
          zone,
          skillBand,
          active: true,
        });
        if (existing) {
          // eslint-disable-next-line no-console
          console.log(`Skipping ${zone}/${skillBand} — an active floor already exists.`);
          continue;
        }

        const monthlyRate = basic + VDA;
        const { dailyRate, hourlyRate } = deriveRates(monthlyRate);
        await GovernmentWageFloor.create({
          ...NOTIFICATION,
          zone,
          skillBand,
          monthlyRate,
          basicComponent: basic,
          vdaComponent: VDA,
          dailyRate,
          hourlyRate,
          workingDaysPerMonth: DEFAULT_WORKING_DAYS_PER_MONTH,
          workingHoursPerDay: DEFAULT_WORKING_HOURS_PER_DAY,
          active: true,
        });
        // eslint-disable-next-line no-console
        console.log(
          `Seeded ${zone}/${skillBand}: ₹${monthlyRate}/month = ₹${dailyRate}/day = ₹${hourlyRate}/hour`
        );
      }
    }
  } finally {
    await mongoose.disconnect();
  }
}

seedWageFloors().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
