import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as adminController from '../controllers/admin.controller';
import { MANAGER_PERMISSIONS } from '@fyro/shared';

export const adminRouter = Router();

// Every route below is admin-only. Managers must never reach any of these
// (they cannot create/delete other Manager accounts or reassign roles under
// any circumstance per spec) — enforced once here at the router level rather
// than per-route, so a future added route can't accidentally skip the gate.
adminRouter.use(verifyJwt, requireRole('admin'));

function isValidPermission(p: string): boolean {
  return (MANAGER_PERMISSIONS as readonly string[]).includes(p) || p.startsWith('manage_region:');
}

const permissionsRule = body('permissions')
  .isArray()
  .custom((arr: string[]) => arr.every(isValidPermission))
  .withMessage('permissions must be known permission keys or manage_region:<name>');

// name min:2 (not 1) — verified empirically against this route's own test
// fixtures ('Manager One', 'New Mgr'); the shorter single-char names in this
// test file ('C', 'Cust', 'Mgr', 'Root Admin') are all created directly via
// User.create in test setup and never pass through this body validator.
const nameRule = body('name').isString().trim().isLength({ min: 2 });
const phoneRule = body('phone').isString().isLength({ min: 10, max: 15 });
const passwordRule = body('password').isString().isLength({ min: 8 });

adminRouter.get('/managers', adminController.listManagers);
adminRouter.post(
  '/managers',
  [nameRule, phoneRule, passwordRule, permissionsRule],
  validate,
  adminController.createManager
);
adminRouter.patch(
  '/managers/:id/permissions',
  [param('id').isMongoId(), permissionsRule],
  validate,
  adminController.updateManagerPermissions
);

adminRouter.get(
  '/users',
  [
    // Bounds req.query.search/role/page/limit to plain strings within sane
    // limits before the controller touches them — closes both a CastError-
    // triggered 500 (e.g. ?search[$ne]=1 arriving as an object, not a
    // string) and an oversized-pattern DoS vector on the $regex search.
    query('search').optional().isString().isLength({ max: 100 }),
    query('role').optional().isIn(['customer', 'driver', 'hamali_solo', 'mutha_leader', 'mutha_member']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  adminController.listUsers
);
adminRouter.patch(
  '/users/:id/role',
  [
    param('id').isMongoId(),
    body('role').isIn(['customer', 'driver', 'hamali_solo', 'mutha_leader', 'mutha_member']),
  ],
  validate,
  adminController.updateUserRole
);
adminRouter.patch(
  '/users/:id/status',
  [param('id').isMongoId(), body('status').isIn(['active', 'suspended', 'deleted'])],
  validate,
  adminController.updateUserStatus
);
adminRouter.delete(
  '/users/:id',
  [param('id').isMongoId()],
  validate,
  // Soft delete: same handler as status update, forced to 'deleted'.
  (req: Request, _res: Response, next: NextFunction) => {
    req.body.status = 'deleted';
    next();
  },
  adminController.updateUserStatus
);
