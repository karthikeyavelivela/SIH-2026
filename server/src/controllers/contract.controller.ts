import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Contract, IContract } from '../models/Contract';
import { Federation } from '../models/Federation';
import { Mutha } from '../models/Mutha';
import { User } from '../models/User';
import { Booking } from '../models/Booking';
import { writeAuditLog } from '../services/audit.service';
import {
  proposeContract,
  leaderDecides,
  institutionDecides,
  monthlyStatement,
  floorProblem,
  type ProposalInput,
} from '../services/contract.service';
import { generateContractInvoicePdf } from '../services/contractInvoice.service';

/** PUT /api/contracts/institution-profile — a customer becomes (or stops being) an institution. */
export const setInstitutionProfile = asyncHandler(async (req: Request, res: Response) => {
  const { accountType, institutionType, orgName, gstin } = req.body as {
    accountType: 'household' | 'institution';
    institutionType?: string;
    orgName?: string;
    gstin?: string;
  };
  const update =
    accountType === 'institution'
      ? { accountType, institutionProfile: { institutionType, orgName, gstin: gstin || undefined } }
      : { accountType, $unset: { institutionProfile: 1 } };
  const user = await User.findByIdAndUpdate(req.user!.id, update, { new: true }).select('accountType institutionProfile').lean();
  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'account_type_changed',
    targetType: 'User',
    targetId: req.user!.id,
    details: { accountType, institutionType },
  });
  res.status(200).json({ accountType: user?.accountType, institutionProfile: user?.institutionProfile ?? null });
});

/** GET /api/contracts/societies?region= — societies an institution can propose to. */
export const listSocieties = asyncHandler(async (req: Request, res: Response) => {
  const region = String(req.query.region ?? '').trim();
  const filter: Record<string, unknown> = {};
  if (region) {
    const district = await Federation.findOne({ type: 'district', region }).select('_id').lean();
    if (district) filter.districtFederationId = district._id;
  }
  const societies = await Mutha.find(filter).select('name memberIds affiliationStatus').limit(50).lean();
  res.status(200).json({
    societies: societies.map((m) => ({ _id: m._id, name: m.name, members: m.memberIds.length, affiliated: m.affiliationStatus === 'affiliated' })),
  });
});

/** POST /api/contracts/check-rate — the floor check, before proposing, so the form can say it plainly. */
export const checkRate = asyncHandler(async (req: Request, res: Response) => {
  const problem = await floorProblem(req.body);
  res.status(200).json({ ok: !problem, problem });
});

export const propose = asyncHandler(async (req: Request, res: Response) => {
  const contract = await proposeContract(req.user!.id, req.body as ProposalInput);
  res.status(201).json({ contract });
});

/** GET /api/contracts/mine — the institution's own, or the leader's society's. */
export const listMine = asyncHandler(async (req: Request, res: Response) => {
  let filter: Record<string, unknown>;
  if (req.user!.role === 'mutha_leader') {
    const mutha = await Mutha.findOne({ leaderId: req.user!.id }).select('_id').lean();
    if (!mutha) {
      res.status(200).json({ contracts: [] });
      return;
    }
    filter = { muthaId: mutha._id };
  } else {
    filter = { institutionId: req.user!.id };
  }
  const contracts = await Contract.find(filter)
    .sort({ updatedAt: -1 })
    .populate('institutionId', 'name institutionProfile')
    .populate('muthaId', 'name')
    .lean();
  res.status(200).json({ contracts });
});

/** Who may read a contract: its two parties, the federations above the society, and admins. */
async function canRead(user: { id: string; role: string }, c: IContract): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (String(c.institutionId) === user.id) return true;
  const mutha = await Mutha.findById(c.muthaId).select('leaderId districtFederationId').lean();
  if (!mutha) return false;
  if (user.role === 'mutha_leader') return String(mutha.leaderId) === user.id;
  if (user.role === 'federation_district_admin' || user.role === 'federation_state_admin') {
    const me = await User.findById(user.id).select('federationId').lean();
    if (!me?.federationId || !mutha.districtFederationId) return false;
    if (user.role === 'federation_district_admin') return String(mutha.districtFederationId) === String(me.federationId);
    const district = await Federation.findById(mutha.districtFederationId).select('parentFederationId').lean();
    return String(district?.parentFederationId) === String(me.federationId);
  }
  return false;
}

async function readable(req: Request) {
  const contract = await Contract.findById(req.params.id).populate('muthaId', 'name').lean();
  if (!contract) throw new ApiError(404, 'Contract not found');
  const raw = { ...contract, muthaId: (contract.muthaId as unknown as { _id: IContract['muthaId'] })._id ?? contract.muthaId } as IContract;
  if (!(await canRead({ id: req.user!.id, role: req.user!.role }, raw))) throw new ApiError(404, 'Contract not found');
  return { contract, raw };
}

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const { contract, raw } = await readable(req);
  const visits = await Booking.find({ contractId: raw._id })
    .sort({ contractVisitDate: -1 })
    .limit(30)
    .select('contractVisitDate status assignedHamaliIds requiredHamaliCount fareBreakdown scheduledFor')
    .lean();
  res.status(200).json({ contract, visits });
});

export const leaderAction = asyncHandler(async (req: Request, res: Response) => {
  const { action, ratePerWorkerPerVisit, workersPerVisit, note } = req.body as {
    action: 'accept' | 'counter' | 'reject' | 'cancel';
    ratePerWorkerPerVisit?: number;
    workersPerVisit?: number;
    note?: string;
  };
  const contract = await leaderDecides(req.user!.id, req.params.id, action, { ratePerWorkerPerVisit, workersPerVisit, note });
  res.status(200).json({ contract });
});

export const institutionAction = asyncHandler(async (req: Request, res: Response) => {
  const { action, note } = req.body as { action: 'accept_counter' | 'reject_counter' | 'pause' | 'resume' | 'cancel'; note?: string };
  const contract = await institutionDecides(req.user!.id, req.params.id, action, note);
  res.status(200).json({ contract });
});

function monthOf(req: Request): string {
  const month = String(req.query.month ?? new Date().toISOString().slice(0, 7));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ApiError(400, 'month must be YYYY-MM');
  return month;
}

export const statement = asyncHandler(async (req: Request, res: Response) => {
  const { raw } = await readable(req);
  res.status(200).json(await monthlyStatement(raw, monthOf(req)));
});

export const invoice = asyncHandler(async (req: Request, res: Response) => {
  const { raw, contract } = await readable(req);
  const month = monthOf(req);
  const institution = await User.findById(raw.institutionId).select('name institutionProfile').lean();
  const societyName = (contract.muthaId as unknown as { name?: string }).name ?? 'Society';
  const pdf = await generateContractInvoicePdf(raw, institution ?? { name: 'Institution' }, societyName, month);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="contract-${raw._id.toString().slice(-6)}-${month}.pdf"`);
  res.status(200).send(pdf);
});

/** GET /api/contracts/federation — contracts of the societies under the caller's federation (or all, for admin). */
export const listForFederation = asyncHandler(async (req: Request, res: Response) => {
  let muthaFilter: Record<string, unknown> = {};
  if (req.user!.role !== 'admin') {
    const me = await User.findById(req.user!.id).select('federationId').lean();
    if (!me?.federationId) throw new ApiError(404, 'No federation assigned to this account');
    const districtIds =
      req.user!.role === 'federation_state_admin'
        ? (await Federation.find({ type: 'district', parentFederationId: me.federationId }).select('_id').lean()).map((d) => d._id)
        : [me.federationId];
    muthaFilter = { districtFederationId: { $in: districtIds } };
  }
  const muthaIds = (await Mutha.find(muthaFilter).select('_id').lean()).map((m) => m._id);
  const contracts = await Contract.find({ muthaId: { $in: muthaIds } })
    .sort({ updatedAt: -1 })
    .limit(200)
    .populate('institutionId', 'name institutionProfile')
    .populate('muthaId', 'name')
    .lean();
  res.status(200).json({ contracts });
});
