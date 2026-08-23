import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { OfferCard } from './OfferCard';
import type { IncomingOffer } from '@/lib/useIncomingOffer';

const baseOffer: IncomingOffer = {
  bookingId: 'b1',
  type: 'truck',
  pickupAddress: '123 Pickup Street',
  dropAddress: '456 Drop Avenue',
  distanceKm: 8.4,
  total: 350,
  expiresAt: Date.now() + 20_000,
};

describe('OfferCard — Phase 7.1, offer accept/reject flow', () => {
  it('renders the real fare, pickup, and drop addresses from the offer', () => {
    renderWithProviders(<OfferCard offer={baseOffer} responding={false} onAccept={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByText('123 Pickup Street')).toBeInTheDocument();
    expect(screen.getByText('456 Drop Avenue')).toBeInTheDocument();
    expect(screen.getByText('₹350')).toBeInTheDocument();
  });

  it('calls onAccept exactly once when the accept button is clicked', () => {
    const onAccept = vi.fn();
    renderWithProviders(<OfferCard offer={baseOffer} responding={false} onAccept={onAccept} onReject={vi.fn()} />);
    fireEvent.click(screen.getByText('Accept'));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('calls onReject exactly once when the decline button is clicked', () => {
    const onReject = vi.fn();
    renderWithProviders(<OfferCard offer={baseOffer} responding={false} onAccept={vi.fn()} onReject={onReject} />);
    fireEvent.click(screen.getByText('Decline'));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while a response is in flight, so a slow network can never produce a double-submit', () => {
    renderWithProviders(<OfferCard offer={baseOffer} responding={true} onAccept={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByText('Decline').closest('button')).toBeDisabled();
    // The accept button's label itself changes to "Sending…" while responding.
    expect(screen.getByText('Sending…').closest('button')).toBeDisabled();
  });

  it('honours a custom acceptLabel override (the Mutha-leader "Accept & assign" flow)', () => {
    renderWithProviders(
      <OfferCard offer={baseOffer} responding={false} onAccept={vi.fn()} onReject={vi.fn()} acceptLabel="Accept & assign" />
    );
    expect(screen.getByText('Accept & assign')).toBeInTheDocument();
  });
});
