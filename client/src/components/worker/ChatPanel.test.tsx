import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { api } from '@/lib/api';
import { ChatPanel } from './ChatPanel';
import { encodeWav } from '@/lib/voice';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

const messages = [{ id: 'm1', senderId: 'other', senderRole: 'customer', senderName: 'Asha', text: 'When will you arrive?', createdAt: '2026-10-01T00:00:00Z' }];

describe('ChatPanel translation — P4.2', () => {
  beforeEach(() => {
    // jsdom does not implement Element.scrollTo, which the panel uses to follow new messages.
    Element.prototype.scrollTo = vi.fn() as never;
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('shows no Translate link when the server has translation off', async () => {
    vi.mocked(api.get).mockResolvedValue({ enabled: false, ready: false });
    renderWithProviders(<ChatPanel messages={messages as never} currentUserId="me" onSend={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/chat/translate-status'));
    expect(screen.queryByRole('button', { name: 'Translate' })).not.toBeInTheDocument();
    expect(screen.getByText('When will you arrive?')).toBeInTheDocument();
  });

  it('translates on tap, then toggles back to the original without asking again', async () => {
    vi.mocked(api.get).mockResolvedValue({ enabled: true, ready: true });
    vi.mocked(api.post).mockResolvedValue({ text: 'మీరు ఎప్పుడు వస్తారు' });
    renderWithProviders(<ChatPanel messages={messages as never} currentUserId="me" onSend={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Translate' }));
    expect(await screen.findByText('మీరు ఎప్పుడు వస్తారు')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/api/chat/m1/translate', { target: 'en' });
    fireEvent.click(screen.getByRole('button', { name: 'Show original' }));
    expect(screen.getByText('When will you arrive?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }));
    expect(screen.getByText('మీరు ఎప్పుడు వస్తారు')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('says so, and keeps the original, when translation fails', async () => {
    vi.mocked(api.get).mockResolvedValue({ enabled: true, ready: true });
    vi.mocked(api.post).mockRejectedValueOnce(new Error('down'));
    renderWithProviders(<ChatPanel messages={messages as never} currentUserId="me" onSend={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Translate' }));
    expect(await screen.findByText('Could not translate')).toBeInTheDocument();
    expect(screen.getByText('When will you arrive?')).toBeInTheDocument();
  });
});

describe('WAV encoding for voice — P4.2', () => {
  it('writes a valid 16 kHz mono PCM16 header and clamps samples', () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 2, -2]), 16000);
    const v = new DataView(wav);
    const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(10);
    expect(wav.byteLength).toBe(44 + 10);
    expect(v.getInt16(44 + 6, true)).toBe(32767);
    expect(v.getInt16(44 + 8, true)).toBe(-32767);
  });
});
