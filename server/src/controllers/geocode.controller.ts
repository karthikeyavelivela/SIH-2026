import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { geocodeAddress, reverseGeocode } from '../services/geocode.service';

/* A lookup that could not run is NOT an empty result.
 *
 * The old handlers returned `{results: []}` whether the address genuinely
 * did not exist or every upstream provider was rate-limiting us. The client
 * cannot tell those apart, so a total outage looked to every customer like
 * "your address does not exist" — with a permanently disabled booking
 * button and no error text anywhere. That is the failure this endpoint is
 * now shaped to make impossible.
 *
 * 200 + results (possibly empty) = we searched, this is the answer.
 * 503                            = we could not search. Say so.
 */

export const geocode = asyncHandler(async (req: Request, res: Response) => {
  const q = (req.query.q as string) ?? '';
  const outcome = await geocodeAddress(q);

  if (outcome.status === 'unavailable') {
    throw new ApiError(503, 'Address lookup is temporarily unavailable', {
      reason: 'geocoder_unavailable',
      detail: outcome.detail,
    });
  }

  res.status(200).json({ results: outcome.results, provider: outcome.provider });
});

export const reverseGeocodeHandler = asyncHandler(async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const outcome = await reverseGeocode(lat, lng);

  if (outcome.status === 'unavailable') {
    throw new ApiError(503, 'Address lookup is temporarily unavailable', {
      reason: 'geocoder_unavailable',
      detail: outcome.detail,
    });
  }

  res.status(200).json({ result: outcome.result, provider: outcome.provider });
});
