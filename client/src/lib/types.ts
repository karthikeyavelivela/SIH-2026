// Shapes mirrored from the server's Mongoose models (server/src/models/*)
// for the subset of fields the client actually reads. Not auto-generated —
// keep in sync by hand if a model field these views use changes shape.

export type BookingType = 'truck' | 'hamali' | 'combo';
export type BookingStatus =
  | 'requested'
  | 'searching'
  | 'matched'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface GeoPoint {
  coordinates: [number, number];
  address: string;
}

export interface FareBreakdown {
  baseFare: number;
  distanceFare: number;
  surgeMultiplier: number;
  hamaliFare: number;
  total: number;
}

export interface Booking {
  _id: string;
  customerId: string;
  type: BookingType;
  cargoDetails: { weightKg: number; description?: string };
  pickupLocation: GeoPoint;
  dropLocation: GeoPoint;
  requiredVehicles: { capacityKg: number; count: number }[];
  requiredHamaliCount: number;
  assignedDriverIds: string[];
  assignedHamaliIds: string[];
  assignedMuthaId?: string;
  status: BookingStatus;
  fareBreakdown: FareBreakdown;
  distanceKm: number;
  statusHistory: { status: BookingStatus; timestamp: string }[];
  proofPhotos?: { pickup?: string; delivery?: string };
  createdAt: string;
  // Only present on /api/requests/mine (a worker's own assigned-bookings
  // view) — who they're actually meeting, mirroring the AssignedRow the
  // customer side already sees for the driver/hamali.
  customer?: { id: string; name: string; profilePhoto?: string; ratingAvg: number; ratingCount: number };
}

export interface LoadManifestLineItem {
  sku: string;
  description: string;
  weightKg: number;
  quantity: number;
}

export interface LoadManifestConsignorDetails {
  name: string;
  address: string;
  phone: string;
}

export interface LoadManifest {
  _id: string;
  bookingId: string;
  lineItems: LoadManifestLineItem[];
  consignorDetails: LoadManifestConsignorDetails;
  signatureImageUrl?: string;
  signedAt?: string;
  status: 'pending' | 'signed';
  createdAt: string;
  updatedAt: string;
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  requested: 'Requested',
  searching: 'Finding a match…',
  matched: 'Matched',
  accepted: 'Accepted',
  in_progress: 'On the way',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export interface EarningLine {
  bookingId: string;
  completedAt?: string;
  pickupAddress: string;
  dropAddress: string;
  amount: number;
}

export interface MuthaMember {
  _id: string;
  name: string;
  phone: string;
  accountStatus: string;
  profilePhoto?: string;
  availabilityStatus: 'online' | 'offline' | 'on_job';
}

export interface MuthaResponse {
  mutha: {
    _id: string;
    name: string;
    region?: string;
    photo?: string;
    inviteCode: string;
    ratingAvg: number;
    ratingCount: number;
    activeJobsCount: number;
  };
  members: MuthaMember[];
}

// GET /api/mutha/my-group — a mutha_member's narrow, read-only view of
// their own group + leader contact (no invite code, no other members'
// phone numbers).
export interface MuthaMemberGroupInfo {
  mutha: { _id: string; name: string; photo?: string; region?: string; ratingAvg: number; ratingCount: number };
  leader: { name: string; phone: string; profilePhoto?: string };
}

export interface EarningsResponse {
  total: number;
  jobCount: number;
  lines: EarningLine[];
  perMember?: { userId: string; name: string; phone: string; total: number }[];
  incentiveTotal: number;
}

export interface Payment {
  _id: string;
  bookingId: string;
  amount: number;
  status: 'pending' | 'success' | 'failed' | 'refunded';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
}

export const COMPLAINT_CATEGORIES = ['no_show', 'damage', 'payment', 'misconduct', 'other'] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export interface Complaint {
  _id: string;
  bookingId: string;
  raisedByUserId: string;
  category: ComplaintCategory;
  description: string;
  status: 'open' | 'in_review' | 'resolved';
  resolutionNote?: string;
  createdAt: string;
  resolvedAt?: string;
}

// ---- Insurance (mirrors server/src/models/Insurance*.ts + ParametricTrigger.ts) ----

export type InsurancePlanType = 'standard' | 'parametric';
export type InsurancePlanCategory = 'commercial_auto' | 'work_compensation' | 'cargo_transit';
export type InsurancePolicyStatus = 'active' | 'expired' | 'cancelled';
export type InsuranceClaimStatus = 'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid';
export type ParametricCondition = 'earnings_below_threshold' | 'days_unable_to_work';

export interface InsurancePlan {
  _id: string;
  name: string;
  type: InsurancePlanType;
  category: InsurancePlanCategory;
  coverageAmount: number;
  description: string;
  forRoles: string[];
  active: boolean;
}

export interface InsurancePolicyWithPlan {
  _id: string;
  userId: string;
  planId: string;
  status: InsurancePolicyStatus;
  startDate: string;
  endDate: string;
  plan: InsurancePlan | null;
}

export interface InsuranceClaim {
  _id: string;
  userId: string;
  policyId: string;
  incidentDescription: string;
  incidentDate: string;
  status: InsuranceClaimStatus;
  payoutAmount: number;
  photos: string[];
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

/** Current-period result from GET /api/insurance/me — see parametricInsurance.service.ts. */
export interface ParametricTriggerStatus {
  triggerId: string;
  policyId: string;
  condition: ParametricCondition;
  thresholdValue: number;
  periodDays: number;
  payoutAmount: number;
  actualValue: number;
  triggered: boolean;
  periodStart: string;
  periodEnd: string;
  paidAt?: string;
  fromExistingEvent: boolean;
}

export interface ParametricTriggerEvent {
  checkedAt: string;
  periodIndex: number;
  periodStart: string;
  periodEnd: string;
  actualValue: number;
  triggered: boolean;
  paidAt?: string;
}

export interface ParametricTriggerHistory {
  _id: string;
  policyId: string;
  condition: ParametricCondition;
  thresholdValue: number;
  periodDays: number;
  payoutAmount: number;
  events: ParametricTriggerEvent[];
}

export interface InsuranceMeResponse {
  policies: InsurancePolicyWithPlan[];
  parametricTriggers: ParametricTriggerStatus[];
  parametricTriggerHistory: ParametricTriggerHistory[];
  claims: InsuranceClaim[];
}
