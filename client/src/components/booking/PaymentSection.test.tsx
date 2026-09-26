import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { PaymentSection } from './PaymentSection';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockLoadCheckout = vi.fn();
const mockOpenCheckout = vi.fn();
vi.mock('@/lib/razorpay', () => ({
  loadCheckout: (...a: unknown[]) => mockLoadCheckout(...a),
  openCheckout: (...a: unknown[]) => mockOpenCheckout(...a),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    api: { get: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args) },
    API_BASE: 'http://localhost:4000',
  };
});

describe('PaymentSection — Phase 7.1, payment flow', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockLoadCheckout.mockReset();
    mockOpenCheckout.mockReset();
  });

  it('fetches the real payment status for this booking on mount', async () => {
    mockGet.mockResolvedValueOnce({ payment: null });
    renderWithProviders(<PaymentSection bookingId="booking123" />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/payments/booking123'));
  });

  it('no payment yet — shows a Pay now button', async () => {
    mockGet.mockResolvedValueOnce({ payment: null });
    renderWithProviders(<PaymentSection bookingId="booking123" />);
    expect(await screen.findByText('Pay now')).toBeInTheDocument();
  });

  it('mock payments: creates the order then mock-captures it, never opening Checkout', async () => {
    mockGet.mockResolvedValueOnce({ payment: null });
    mockPost
      .mockResolvedValueOnce({
        payment: { _id: 'p1', bookingId: 'booking123', amount: 350, status: 'pending', method: 'razorpay', createdAt: '2026-01-01' },
        order: { id: 'order_mock_1', amount: 35000 },
        mock: true,
        keyId: null,
      })
      .mockResolvedValueOnce({ payment: { _id: 'p1', bookingId: 'booking123', amount: 350, status: 'success', method: 'razorpay', createdAt: '2026-01-01' } });

    renderWithProviders(<PaymentSection bookingId="booking123" />);
    fireEvent.click(await screen.findByText('Pay now'));

    await waitFor(() => expect(mockPost).toHaveBeenNthCalledWith(1, '/api/payments/order/booking123'));
    await waitFor(() => expect(mockPost).toHaveBeenNthCalledWith(2, '/api/payments/booking123/mock-capture'));
    expect(await screen.findByText('Paid ₹350.')).toBeInTheDocument();
    expect(mockOpenCheckout).not.toHaveBeenCalled();
  });

  const realOrder = {
    payment: { _id: 'p2', bookingId: 'booking123', amount: 350, status: 'pending', method: 'razorpay', createdAt: '2026-01-01' },
    order: { id: 'order_live_1', amount: 35000 },
    mock: false,
    keyId: 'rzp_test_public',
  };

  it('real payments: opens Checkout with the public key, then has the server verify the signature', async () => {
    mockGet.mockResolvedValueOnce({ payment: null });
    mockLoadCheckout.mockResolvedValueOnce(undefined);
    const response = { razorpay_order_id: 'order_live_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'sig' };
    mockOpenCheckout.mockResolvedValueOnce({ kind: 'paid', response });
    mockPost.mockResolvedValueOnce(realOrder).mockResolvedValueOnce({ payment: { ...realOrder.payment, status: 'success' } });

    renderWithProviders(<PaymentSection bookingId="booking123" />);
    fireEvent.click(await screen.findByText('Pay now'));

    await waitFor(() => expect(mockOpenCheckout).toHaveBeenCalledWith(expect.objectContaining({ keyId: 'rzp_test_public', orderId: 'order_live_1', amountPaise: 35000 })));
    await waitFor(() => expect(mockPost).toHaveBeenNthCalledWith(2, '/api/payments/booking123/verify', response));
    expect(await screen.findByText('Paid ₹350.')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalledWith('/api/payments/booking123/mock-capture');
  });

  it('real payments: closing Checkout says nothing was charged and records nothing', async () => {
    mockGet.mockResolvedValueOnce({ payment: null });
    mockLoadCheckout.mockResolvedValueOnce(undefined);
    mockOpenCheckout.mockResolvedValueOnce({ kind: 'dismissed' });
    mockPost.mockResolvedValueOnce(realOrder);

    renderWithProviders(<PaymentSection bookingId="booking123" />);
    fireEvent.click(await screen.findByText('Pay now'));

    expect(await screen.findByText('Payment was cancelled. Nothing was charged.')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('real payments: a Checkout script that will not load is explained, not swallowed', async () => {
    mockGet.mockResolvedValueOnce({ payment: null });
    mockLoadCheckout.mockRejectedValueOnce(new Error('blocked'));
    mockPost.mockResolvedValueOnce(realOrder);

    renderWithProviders(<PaymentSection bookingId="booking123" />);
    fireEvent.click(await screen.findByText('Pay now'));

    expect(await screen.findByText(/Could not open the payment window/)).toBeInTheDocument();
    expect(mockOpenCheckout).not.toHaveBeenCalled();
  });

  it('a successful payment shows the real paid amount and a tax invoice download link, never a Pay button again', async () => {
    mockGet.mockResolvedValueOnce({
      payment: { _id: 'p1', bookingId: 'booking123', amount: 350.36, status: 'success', method: 'razorpay', createdAt: '2026-01-01' },
    });
    renderWithProviders(<PaymentSection bookingId="booking123" />);

    expect(await screen.findByText('Paid ₹350.36.')).toBeInTheDocument();
    expect(screen.queryByText('Pay now')).not.toBeInTheDocument();
    const invoiceLink = screen.getByText('Download tax invoice (PDF)').closest('a');
    expect(invoiceLink).toHaveAttribute('href', 'http://localhost:4000/api/bookings/booking123/tax-invoice');
  });

  it('a failed order creation surfaces a real error rather than a silent no-op', async () => {
    mockGet.mockResolvedValueOnce({ payment: null });
    mockPost.mockRejectedValueOnce(new Error('gateway down'));
    renderWithProviders(<PaymentSection bookingId="booking123" />);
    fireEvent.click(await screen.findByText('Pay now'));

    expect(await screen.findByText('Payment failed — try again.')).toBeInTheDocument();
  });

  it('clicking Pay cash on delivery creates a pending COD payment, not an online order', async () => {
    mockGet.mockResolvedValueOnce({ payment: null });
    mockPost.mockResolvedValueOnce({
      payment: { _id: 'p1', bookingId: 'booking123', amount: 300, status: 'pending', method: 'cod', createdAt: '2026-01-01' },
    });

    renderWithProviders(<PaymentSection bookingId="booking123" />);
    fireEvent.click(await screen.findByText('Pay cash on delivery'));

    expect(mockPost).toHaveBeenCalledWith('/api/payments/booking123/cod');
    expect(await screen.findByText(/Cash on delivery selected/)).toBeInTheDocument();
  });

  it('a pending COD payment shows the awaiting-worker state, not a Pay button', async () => {
    mockGet.mockResolvedValueOnce({
      payment: { _id: 'p1', bookingId: 'booking123', amount: 300, status: 'pending', method: 'cod', createdAt: '2026-01-01' },
    });
    renderWithProviders(<PaymentSection bookingId="booking123" />);

    expect(await screen.findByText(/Cash on delivery selected/)).toBeInTheDocument();
    expect(screen.queryByText('Pay now')).not.toBeInTheDocument();
    expect(screen.queryByText('Pay cash on delivery')).not.toBeInTheDocument();
  });
});
