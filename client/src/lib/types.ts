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
  createdAt: string;
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
  availabilityStatus: 'online' | 'offline' | 'on_job';
}

export interface MuthaResponse {
  mutha: {
    _id: string;
    name: string;
    inviteCode: string;
    ratingAvg: number;
    ratingCount: number;
    activeJobsCount: number;
  };
  members: MuthaMember[];
}

export interface EarningsResponse {
  total: number;
  jobCount: number;
  lines: EarningLine[];
  perMember?: { userId: string; name: string; phone: string; total: number }[];
}
