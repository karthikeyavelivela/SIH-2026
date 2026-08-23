import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { HamaliProfile } from '../models/HamaliProfile';

// SIH26089 Phase C — the original 7 are cargo-handling skills (what
// "Hamali" meant before this phase). The 8 added below match
// ServiceCategory's seeded requiredSkills exactly (seedServiceCategories.ts)
// so a worker's own skill picker and a category's stated requirement are
// the same vocabulary, not two independently-maintained lists.
const KNOWN_SKILLS = [
  'cement',
  'steel',
  'fragile',
  'furniture',
  'appliances',
  'agricultural',
  'construction_material',
  'electrical',
  'plumbing',
  'carpentry',
  'painting',
  'domestic_help',
  'caregiving',
  'gardening',
  'cleaning',
  'technician',
];

/** GET /api/hamali-profile/me — the caller's own skills/capacity, for the profile page. */
export const getMyHamaliProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await HamaliProfile.findOne({ userId: req.user!.id });
  if (!profile) throw new ApiError(404, 'No hamali profile found for this user');
  res.status(200).json({ skills: profile.skills, physicalCapacityKg: profile.physicalCapacityKg ?? null });
});

/**
 * PATCH /api/hamali-profile/me — skills is a full replace (a client sends
 * the whole selected set, not a single add/remove — simpler both ends for
 * a small fixed tag list). Existed on the model with no endpoint at all
 * before this (see HamaliProfile.ts's doc comment).
 */
export const updateMyHamaliProfile = asyncHandler(async (req: Request, res: Response) => {
  const { skills, physicalCapacityKg } = req.body as { skills?: string[]; physicalCapacityKg?: number | null };

  if (skills !== undefined && !skills.every((s) => KNOWN_SKILLS.includes(s))) {
    throw new ApiError(400, `skills must be a subset of: ${KNOWN_SKILLS.join(', ')}`);
  }

  const update: Record<string, unknown> = {};
  if (skills !== undefined) update.skills = skills;
  if (physicalCapacityKg !== undefined) update.physicalCapacityKg = physicalCapacityKg;

  const profile = await HamaliProfile.findOneAndUpdate({ userId: req.user!.id }, update, { new: true });
  if (!profile) throw new ApiError(404, 'No hamali profile found for this user');
  res.status(200).json({ skills: profile.skills, physicalCapacityKg: profile.physicalCapacityKg ?? null });
});

export { KNOWN_SKILLS };
