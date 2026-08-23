import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { rethrowAsConflict } from '../utils/mongoErrors';
import { ServiceCategory } from '../models/ServiceCategory';
import { writeAuditLog } from '../services/audit.service';

/** GET /api/service-categories — public (any authenticated role), every active category, for the booking-creation category picker. */
export const listServiceCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await ServiceCategory.find({ active: true }).sort({ name: 1 });
  res.status(200).json({ categories });
});

/** GET /api/admin/service-categories — admin sees every category including inactive ones, for management. */
export const listAllServiceCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await ServiceCategory.find().sort({ name: 1 });
  res.status(200).json({ categories });
});

export const createServiceCategory = asyncHandler(async (req: Request, res: Response) => {
  const { name, slug, icon, accentColor, pricingUnit, requiredSkills, requiresVehicle, requiresMaterials, defaultDurationMinutes, minWorkers, dispatchType } = req.body;

  let category;
  try {
    category = await ServiceCategory.create({
      name, slug, icon, accentColor, pricingUnit,
      requiredSkills: requiredSkills ?? [],
      requiresVehicle: !!requiresVehicle,
      requiresMaterials: !!requiresMaterials,
      defaultDurationMinutes,
      minWorkers: minWorkers ?? 1,
      dispatchType,
    });
  } catch (err) {
    rethrowAsConflict(err, `Service category slug "${slug}"`);
  }

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'service_category_created',
    targetType: 'ServiceCategory',
    targetId: category._id.toString(),
    details: { name, slug, dispatchType },
  });

  res.status(201).json({ category });
});

export const setServiceCategoryActive = asyncHandler(async (req: Request, res: Response) => {
  const { active } = req.body as { active: boolean };
  const category = await ServiceCategory.findByIdAndUpdate(req.params.id, { active }, { new: true });
  if (!category) throw new ApiError(404, 'Service category not found');

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: active ? 'service_category_activated' : 'service_category_deactivated',
    targetType: 'ServiceCategory',
    targetId: category._id.toString(),
  });

  res.status(200).json({ category });
});
