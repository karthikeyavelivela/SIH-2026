import { Router } from 'express';
import { query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as searchController from '../controllers/search.controller';

export const searchRouter = Router();

// Authenticated only. Search reaches real records — including the public
// service catalogue, which is reachable anyway — and an anonymous search
// endpoint would be a free scan of the database's shape.
searchRouter.get(
  '/',
  verifyJwt,
  [query('q').optional().isString().isLength({ max: 100 })],
  validate,
  searchController.search
);
