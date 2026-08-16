import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { geocodeAddress, reverseGeocode } from '../services/geocode.service';

export const geocode = asyncHandler(async (req: Request, res: Response) => {
  const q = (req.query.q as string) ?? '';
  const results = await geocodeAddress(q);
  res.status(200).json({ results });
});

export const reverseGeocodeHandler = asyncHandler(async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const result = await reverseGeocode(lat, lng);
  res.status(200).json({ result });
});
