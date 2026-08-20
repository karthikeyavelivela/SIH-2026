import { LedgerEntry, ILedgerEntry } from '../models/LedgerEntry';

interface WriteLedgerEntryInput {
  type: ILedgerEntry['type'];
  entityType: string;
  entityId: string;
  amount: number;
  description: string;
  status?: ILedgerEntry['status'];
  region?: string;
}

/**
 * Append a single ledger entry. This is the ONLY way anything should ever
 * write to LedgerEntry — there is deliberately no update/delete path
 * anywhere in the codebase (see models/LedgerEntry.ts). Not yet wired into
 * real booking/payment/payout flows (that's a follow-up once this ships);
 * callers can invoke it directly once those flows exist.
 */
export async function writeLedgerEntry(input: WriteLedgerEntryInput): Promise<ILedgerEntry> {
  const entry = await LedgerEntry.create({
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId,
    amount: input.amount,
    description: input.description,
    status: input.status ?? 'posted',
    region: input.region,
    timestamp: new Date(),
  });
  return entry.toObject();
}
