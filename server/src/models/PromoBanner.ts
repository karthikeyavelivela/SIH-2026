import { Schema, model, Types } from 'mongoose';

/**
 * A promotional slide on the customer home screen.
 *
 * This exists so the slot on the home screen can carry something real. The
 * alternative was hardcoded marketing copy in a React component, which is
 * the thing a demo does and a product does not: nobody can change it, it
 * cannot be scheduled, it cannot be targeted, and it silently claims things
 * the platform may not be doing any more.
 *
 * Deliberately NOT a general CMS. Four fields of content, a window, a mode,
 * and a link — anything richer would be a content system nobody asked for.
 *
 * The slot renders nothing at all when no banner is live. An empty
 * promotional rail is the correct look for a platform with nothing to
 * promote; filler would be worse than absence.
 */

/** Which home screen a banner belongs on. `all` shows in every mode. */
export const BANNER_MODES = ['all', 'household', 'labour', 'transport'] as const;
export type BannerMode = (typeof BANNER_MODES)[number];

export interface IPromoBanner {
  _id: Types.ObjectId;
  title: string;
  body?: string;
  /** Optional CTA. Both or neither — a label with nowhere to go is a dead control. */
  ctaLabel?: string;
  ctaHref?: string;
  /** Cloudinary URL. Absent renders the banner as a text card, which is a real design, not a fallback. */
  imageUrl?: string;
  mode: BannerMode;
  /** Region slug, matching FareRule.region. Absent = every region. */
  region?: string;
  startsAt?: Date;
  endsAt?: Date;
  /** Lower sorts first. Ties break on createdAt. */
  order: number;
  active: boolean;
  createdByAdminId: Types.ObjectId;
}

const schema = new Schema<IPromoBanner>(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    body: { type: String, trim: true, maxlength: 200 },
    ctaLabel: { type: String, trim: true, maxlength: 40 },
    ctaHref: { type: String, trim: true, maxlength: 300 },
    imageUrl: { type: String, trim: true },
    mode: { type: String, enum: BANNER_MODES, default: 'all' },
    region: { type: String, trim: true },
    startsAt: { type: Date },
    endsAt: { type: Date },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

schema.index({ active: 1, mode: 1, order: 1 });

export const PromoBanner = model<IPromoBanner>('PromoBanner', schema);
