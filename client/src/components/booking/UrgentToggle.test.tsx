import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { UrgentToggle, UrgentBadge } from './UrgentToggle';

describe('UrgentToggle — P1.4', () => {
  it('says there is no extra charge and reports the choice', () => {
    const onChange = vi.fn();
    renderWithProviders(<UrgentToggle checked={false} onChange={onChange} />);
    expect(screen.getByText(/No extra charge/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Urgent — I need someone now/));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('the worker badge reads Urgent', () => {
    renderWithProviders(<UrgentBadge />);
    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });
});
