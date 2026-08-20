import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Mutha } from '../models/Mutha';
import { User } from '../models/User';
import { HamaliProfile } from '../models/HamaliProfile';
import { Booking } from '../models/Booking';
import { uploadImage } from '../services/cloudinary.service';
import { writeAuditLog } from '../services/audit.service';
import { emitBookingStatus } from '../realtime/emitters';

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
      region: mutha.region,
      photo: mutha.photo,
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

/**
 * GET /api/mutha/my-group — a mutha_member's own read-only view of the
 * group they belong to: group name/rating and their leader's contact
 * details (name + phone, so the "leader contact" surface on the member's
 * home screen has something real to show). Deliberately excludes the
 * invite code (leader-only join secret, see getMyMutha's doc comment) and
 * fellow members' phone numbers — a member has no group-management
 * authority per mutha.routes.ts, so this stays a narrow, privacy-minded
 * read, not a mirror of the leader's /me response.
 */
export const getMyGroupAsMember = asyncHandler(async (req: Request, res: Response) => {
  const mutha = await Mutha.findOne({ memberIds: req.user!.id });
  if (!mutha) throw new ApiError(404, 'You are not a member of any Mutha group');

  const leader = await User.findById(mutha.leaderId).select('name phone profilePhoto').lean();
  if (!leader) throw new ApiError(404, 'Group leader not found');

  res.status(200).json({
    mutha: {
      _id: mutha._id,
      name: mutha.name,
      photo: mutha.photo,
      region: mutha.region,
      ratingAvg: mutha.ratingAvg,
      ratingCount: mutha.ratingCount,
    },
    leader: { name: leader.name, phone: leader.phone, profilePhoto: leader.profilePhoto },
  });
});

const MAX_GROUP_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * PATCH /api/mutha/me — leader edits their EXISTING group's name/region/
 * photo. There is no in-app "create a Mutha group" flow: a leader gets
 * exactly one Mutha, created atomically with their account in
 * signupHamali (joinType: 'leader') — see that controller's doc comment.
 * The Stitch `create_mutha_group` screen (photo + name + region form,
 * shareable invite QR) is repurposed here as this group-SETTINGS screen
 * instead: same fields, same invite/QR display, but editing the one group
 * a leader already has rather than minting a second one their account has
 * no path to actually use (getMyMutha and every matching-service query
 * assume `findOne({ leaderId })` — one leader, one group).
 */
export const updateMyGroup = asyncHandler(async (req: Request, res: Response) => {
  const mutha = await Mutha.findOne({ leaderId: req.user!.id });
  if (!mutha) throw new ApiError(404, 'No Mutha found for this leader');

  const { name, region, imageBase64 } = req.body as { name?: string; region?: string; imageBase64?: string };
  const before = { name: mutha.name, region: mutha.region, photo: mutha.photo };

  if (name !== undefined) mutha.name = name;
  if (region !== undefined) mutha.region = region;

  if (imageBase64) {
    const match = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(imageBase64);
    if (!match) throw new ApiError(400, 'imageBase64 must be a data:image/(png|jpeg|webp);base64,... URL');
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.byteLength > MAX_GROUP_PHOTO_BYTES) throw new ApiError(400, 'Photo too large (max 5MB)');
    const { url } = await uploadImage(buffer, `mutha/${mutha._id}/photo`);
    mutha.photo = url;
  }

  await mutha.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'mutha_update_group',
    targetType: 'Mutha',
    targetId: mutha._id.toString(),
    details: { before, after: { name: mutha.name, region: mutha.region, photo: mutha.photo } },
  });

  res.status(200).json({
    mutha: {
      _id: mutha._id,
      name: mutha.name,
      region: mutha.region,
      photo: mutha.photo,
      inviteCode: mutha.inviteCode,
      ratingAvg: mutha.ratingAvg,
      ratingCount: mutha.ratingCount,
    },
  });
});

/**
 * POST /api/mutha/jobs/:bookingId/assign — leader manages the crew roster
 * on a job their Mutha ALREADY holds (status accepted/in_progress,
 * assignedMuthaId === their group). Distinct from acceptAsMuthaLeader
 * (bookingAssignment.service), which does the initial full-crew assignment
 * at accept time and always fills a booking straight to requiredHamaliCount
 * before it can even reach 'accepted' — so every job this endpoint touches
 * starts out fully staffed. This endpoint's real job is REASSIGNMENT: swap
 * a member who went offline/unavailable for another, or rebalance which
 * specific members are covering which of the leader's concurrently active
 * bookings. `memberIds` is the desired complete roster for this booking —
 * members not in the new list are released back to 'online'; new members
 * are pulled in, but never at the cost of a booking, currently 'accepted'
 * or 'in_progress', that they're actively engaged on elsewhere — that's
 * what makes "split the crew across concurrent sites" safe: two different
 * bookings can each freely draw from the group's online pool, but the same
 * member can never be double-booked onto two live jobs at once.
 */
export const assignJobMembers = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const bookingId = req.params.bookingId;
  const memberIds: string[] = Array.isArray(req.body.memberIds) ? req.body.memberIds : [];

  const mutha = await Mutha.findOne({ leaderId: userId });
  if (!mutha) throw new ApiError(404, 'No Mutha found for this leader');

  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (!booking.assignedMuthaId || booking.assignedMuthaId.toString() !== mutha._id.toString()) {
    throw new ApiError(403, 'This job is not assigned to your Mutha');
  }
  if (!['accepted', 'in_progress'].includes(booking.status)) {
    throw new ApiError(400, `Cannot change crew on a job that is ${booking.status}`);
  }
  if (memberIds.length === 0) throw new ApiError(400, 'At least one member must remain assigned');
  if (memberIds.length > booking.requiredHamaliCount) {
    throw new ApiError(400, `This job only needs ${booking.requiredHamaliCount} worker(s)`);
  }

  const myMemberIds = new Set(mutha.memberIds.map((id) => id.toString()));
  for (const id of memberIds) {
    if (!myMemberIds.has(id)) throw new ApiError(403, `${id} is not a member of your Mutha`);
  }

  const currentIds = booking.assignedHamaliIds.map((id) => id.toString());
  const additions = memberIds.filter((id) => !currentIds.includes(id));
  // Only ever release members who belong to THIS mutha — guards against
  // ever touching another worker's assignment on a combo-type booking.
  const removals = currentIds.filter((id) => myMemberIds.has(id) && !memberIds.includes(id));

  if (additions.length > 0) {
    const profiles = await HamaliProfile.find({
      userId: { $in: additions },
      type: 'mutha_member',
      muthaId: mutha._id,
    });
    if (profiles.length !== additions.length) {
      throw new ApiError(400, 'One or more members do not have a valid Hamali profile in this Mutha');
    }

    // The authoritative "is this member already committed elsewhere"
    // check — per-booking, not the coarser availabilityStatus flag (which
    // would also be 'on_job' for a member already on THIS booking).
    const busyElsewhere = await Booking.find({
      _id: { $ne: booking._id },
      status: { $in: ['accepted', 'in_progress'] },
      assignedHamaliIds: { $in: additions },
    }).select('assignedHamaliIds');
    const busyIds = new Set(busyElsewhere.flatMap((b) => b.assignedHamaliIds.map((id) => id.toString())));
    if (additions.some((id) => busyIds.has(id))) {
      throw new ApiError(400, 'One or more selected members are already working another active job');
    }
  }

  booking.assignedHamaliIds = memberIds.map((id) => new Types.ObjectId(id));
  await booking.save();

  if (additions.length > 0) {
    await HamaliProfile.updateMany({ userId: { $in: additions } }, { availabilityStatus: 'on_job' });
  }
  if (removals.length > 0) {
    await HamaliProfile.updateMany({ userId: { $in: removals } }, { availabilityStatus: 'online' });
  }

  await writeAuditLog({
    actorId: userId,
    actorRole: req.user!.role,
    action: 'mutha_assign_job_members',
    targetType: 'Booking',
    targetId: booking._id.toString(),
    details: { memberIds, additions, removals },
  });

  emitBookingStatus(booking);
  res.status(200).json({ booking });
});
