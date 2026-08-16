// Mirrors server/src/services/matching.service.ts's DRIVER_WILLING_RADIUS_KM /
// HAMALI_WILLING_RADIUS_KM — duplicated here only for display purposes (the
// "200 km radius" badge on ServiceAreaCard), never used for any actual
// matching logic, which is entirely server-side. Keep in sync by hand if
// those ever change.
export const DRIVER_WILLING_RADIUS_KM = 200;
export const HAMALI_WILLING_RADIUS_KM = 20;
