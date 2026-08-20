import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { TrainingModule } from '../models/TrainingModule';
import { TrainingProgress } from '../models/TrainingProgress';
import { Certification } from '../models/Certification';
import { writeAuditLog } from '../services/audit.service';
import type { Role } from '@fyro/shared';

const CERT_VALIDITY_DAYS = 365;

function certTitleForRole(role: Role): string {
  const label = role
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return `FYRO Certified Operator — ${label}`;
}

// ---- GET /api/training/progress ----
// Returns every module targeting the caller's role, in curriculum order,
// with a server-computed lock state — sequential unlocking is derived here
// from TrainingProgress rows, never trusted from a client-held "which
// modules have I clicked through" state.
export const getMyTrainingProgress = asyncHandler(async (req: Request, res: Response) => {
  const role = req.user!.role;
  const modules = await TrainingModule.find({ forRoles: role }).sort({ order: 1 }).lean();
  const progressDocs = await TrainingProgress.find({
    userId: req.user!.id,
    moduleId: { $in: modules.map((m) => m._id) },
  }).lean();
  const progressByModule = new Map(progressDocs.map((p) => [p.moduleId.toString(), p]));

  let allPriorCompleted = true;
  const result = modules.map((m) => {
    const progress = progressByModule.get(m._id.toString());
    const completed = progress?.status === 'completed';
    const status: 'locked' | 'in_progress' | 'completed' = completed
      ? 'completed'
      : allPriorCompleted
        ? 'in_progress'
        : 'locked';
    allPriorCompleted = allPriorCompleted && completed;
    return { module: m, status, completedAt: progress?.completedAt ?? null };
  });

  res.status(200).json({ modules: result });
});

// ---- POST /api/training/modules/:moduleId/complete ----
// Server-enforced sequential unlocking: rejects completion of any module
// whose earlier-order siblings (within the caller's role curriculum) aren't
// already completed. Auto-issues a Certification the moment every module
// targeting the caller's role is completed.
export const completeTrainingModule = asyncHandler(async (req: Request, res: Response) => {
  const { moduleId } = req.params;
  const role = req.user!.role;

  const targetModule = await TrainingModule.findById(moduleId);
  if (!targetModule) throw new ApiError(404, 'Training module not found');
  if (!targetModule.forRoles.includes(role)) {
    throw new ApiError(403, 'This module is not part of your curriculum');
  }

  const roleModules = await TrainingModule.find({ forRoles: role }).sort({ order: 1 }).lean();
  const priorModules = roleModules.filter((m) => m.order < targetModule.order);

  if (priorModules.length > 0) {
    const completedPriorCount = await TrainingProgress.countDocuments({
      userId: req.user!.id,
      moduleId: { $in: priorModules.map((m) => m._id) },
      status: 'completed',
    });
    if (completedPriorCount < priorModules.length) {
      throw new ApiError(400, 'Complete the previous modules in order before this one');
    }
  }

  const progress = await TrainingProgress.findOneAndUpdate(
    { userId: req.user!.id, moduleId: targetModule._id },
    { status: 'completed', completedAt: new Date() },
    { upsert: true, new: true }
  );

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: role,
    action: 'training_module_completed',
    targetType: 'TrainingModule',
    targetId: targetModule._id.toString(),
    details: { title: targetModule.title, order: targetModule.order },
  });

  let certification = null;
  if (roleModules.length > 0) {
    const completedCount = await TrainingProgress.countDocuments({
      userId: req.user!.id,
      moduleId: { $in: roleModules.map((m) => m._id) },
      status: 'completed',
    });
    if (completedCount === roleModules.length) {
      const title = certTitleForRole(role);
      certification = await Certification.findOne({ userId: req.user!.id, title });
      if (!certification) {
        const issuedAt = new Date();
        const validUntil = new Date(issuedAt.getTime() + CERT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
        certification = await Certification.create({
          userId: req.user!.id,
          title,
          endorsedSkills: roleModules.map((m) => m.title),
          issuedAt,
          validUntil,
          status: 'active',
          qrPayload: `FYRO-CERT-PENDING`,
        });
        certification.qrPayload = `FYRO-CERT:${certification._id.toString()}`;
        await certification.save();

        await writeAuditLog({
          actorId: req.user!.id,
          actorRole: role,
          action: 'certification_issued',
          targetType: 'Certification',
          targetId: certification._id.toString(),
          details: { title },
        });
      }
    }
  }

  res.status(200).json({ progress, certification });
});

// ---- GET /api/training/certifications ----
export const getMyCertifications = asyncHandler(async (req: Request, res: Response) => {
  const now = new Date();
  const certs = await Certification.find({ userId: req.user!.id }).sort({ issuedAt: -1 }).lean();
  const withComputedStatus = certs.map((c) => ({
    ...c,
    status: c.validUntil.getTime() < now.getTime() ? 'expired' : c.status,
  }));
  res.status(200).json({ certifications: withComputedStatus });
});
