import { User } from '../models/User';
import { Mutha } from '../models/Mutha';

/** Incremental mean update — avoids re-scanning every prior Rating on every new one. */
export async function applyRatingToUser(userId: string, score: number): Promise<void> {
  const user = await User.findById(userId).select('ratingAvg ratingCount');
  if (!user) return;
  const newCount = user.ratingCount + 1;
  const newAvg = (user.ratingAvg * user.ratingCount + score) / newCount;
  user.ratingAvg = newAvg;
  user.ratingCount = newCount;
  await user.save();
}

export async function applyRatingToMutha(muthaId: string, score: number): Promise<void> {
  const mutha = await Mutha.findById(muthaId).select('ratingAvg ratingCount');
  if (!mutha) return;
  const newCount = mutha.ratingCount + 1;
  const newAvg = (mutha.ratingAvg * mutha.ratingCount + score) / newCount;
  mutha.ratingAvg = newAvg;
  mutha.ratingCount = newCount;
  await mutha.save();
}
