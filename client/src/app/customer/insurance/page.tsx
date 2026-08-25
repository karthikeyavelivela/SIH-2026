import { InsuranceDashboard } from '@/components/worker/InsuranceDashboard';

// SIH26089 — cargo/stock protection for the customer's own goods, not just
// worker welfare insurance. InsuranceDashboard/insurance.controller.ts were
// already fully role-agnostic (listAvailablePlans filters by req.user.role
// server-side); this page — and a real seeded cargo_transit plan for
// 'customer' — were the only two things actually missing.
export default function CustomerInsurancePage() {
  return <InsuranceDashboard dashboardHref="/customer/dashboard" />;
}
