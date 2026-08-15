import { Router } from 'express';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import * as vehicleController from '../controllers/vehicle.controller';

export const vehicleRouter = Router();

vehicleRouter.get('/me', verifyJwt, requireRole('driver'), vehicleController.getMyVehicle);
