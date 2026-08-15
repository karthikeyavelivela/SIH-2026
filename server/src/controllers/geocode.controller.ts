import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { geocodeAddress } from '../services/geocode.service';

export const geocode = asyncHandler(async (req: Request, res: Response) => {
  const q = (req.query.q as string) ?? '';
  const results = await geocodeAddress(q);
  res.status(200).json({ results });
});
