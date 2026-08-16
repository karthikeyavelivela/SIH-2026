import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as savedAddressController from '../controllers/savedAddress.controller';

export const savedAddressRouter = Router();

savedAddressRouter.use(verifyJwt);

savedAddressRouter.get('/', savedAddressController.listMyAddresses);

savedAddressRouter.post(
  '/',
  [
    body('label').isString().trim().isLength({ min: 1, max: 40 }),
    body('address').isString().trim().isLength({ min: 1 }),
    body('lat').isFloat({ min: -90, max: 90 }),
    body('lng').isFloat({ min: -180, max: 180 }),
  ],
  validate,
  savedAddressController.createMyAddress
);

savedAddressRouter.delete('/:id', [param('id').isMongoId()], validate, savedAddressController.deleteMyAddress);
