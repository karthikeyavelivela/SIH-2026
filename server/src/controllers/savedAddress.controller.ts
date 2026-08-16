import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { SavedAddress } from '../models/SavedAddress';

export const listMyAddresses = asyncHandler(async (req: Request, res: Response) => {
  const addresses = await SavedAddress.find({ userId: req.user!.id }).sort({ createdAt: -1 });
  res.status(200).json({ addresses });
});

export const createMyAddress = asyncHandler(async (req: Request, res: Response) => {
  const { label, address, lat, lng } = req.body;
  const saved = await SavedAddress.create({
    userId: req.user!.id,
    label,
    address,
    coordinates: [lng, lat],
  });
  res.status(201).json({ address: saved });
});

export const deleteMyAddress = asyncHandler(async (req: Request, res: Response) => {
  const deleted = await SavedAddress.findOneAndDelete({ _id: req.params.id, userId: req.user!.id });
  if (!deleted) throw new ApiError(404, 'Saved address not found');
  res.status(204).send();
});
