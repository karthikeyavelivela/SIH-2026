import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Mutha } from '../models/Mutha';
import { User } from '../models/User';
import { HamaliProfile } from '../models/HamaliProfile';

/**
 * GET /api/mutha/me — the calling leader's own group: roster (with each
 * member's live availability) and the invite code (only ever shown to the
 * leader, never to a member or anyone else — it's the sole join secret).
 */
export const getMyMutha = asyncHandler(async (req: Request, res: Response) => {
  const mutha = await Mutha.findOne({ leaderId: req.user!.id });
  if (!mutha) throw new ApiError(404, 'No Mutha found for this leader');

  const members = await User.find({ _id: { $in: mutha.memberIds } })
    .select('name phone accountStatus profilePhoto')
    .lean();
  const profiles = await HamaliProfile.find({ userId: { $in: mutha.memberIds } })
    .select('userId availabilityStatus')
    .lean();
  const statusByUserId = new Map(profiles.map((p) => [p.userId.toString(), p.availabilityStatus]));

  res.status(200).json({
    mutha: {
      _id: mutha._id,
      name: mutha.name,
      inviteCode: mutha.inviteCode,
      ratingAvg: mutha.ratingAvg,
      ratingCount: mutha.ratingCount,
      activeJobsCount: mutha.activeJobsCount,
    },
    members: members.map((m) => ({
      ...m,
      availabilityStatus: statusByUserId.get(m._id.toString()) ?? 'offline',
    })),
  });
});

/**
 * DELETE /api/mutha/members/:userId — leader removes a member from their
 * own group. The member's User account and role are left untouched (an
 * admin can reassign it) — this only detaches them from group matching:
 * removed from Mutha.memberIds and their mutha_member HamaliProfile is
 * deleted so findCandidateMuthas can never surface them for this group
 * again. A member currently assigned to an in-progress job is left
 * assigned (removal doesn't retroactively pull them off a live job) —
 * only their forward matchability changes.
 */
export const removeMember = asyncHandler(async (req: Request, res: Response) => {
  const mutha = await Mutha.findOne({ leaderId: req.user!.id });
  if (!mutha) throw new ApiError(404, 'No Mutha found for this leader');

  const memberId = req.params.userId;
  if (!mutha.memberIds.some((id) => id.toString() === memberId)) {
    throw new ApiError(404, 'That user is not a member of your Mutha');
  }

  mutha.memberIds = mutha.memberIds.filter((id) => id.toString() !== memberId);
  await mutha.save();
  await HamaliProfile.deleteOne({ userId: memberId, muthaId: mutha._id, type: 'mutha_member' });

  res.status(200).json({ ok: true });
});
