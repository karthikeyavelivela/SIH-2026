// The rate card is the same screen for every service-providing role, so the
// component lives once in components/pricing. This route exists so it renders
// inside mutha-member's own layout — role guard, nav and back behaviour included —
// rather than outside it.
export { default } from '@/components/pricing/WorkerPricingScreen';
