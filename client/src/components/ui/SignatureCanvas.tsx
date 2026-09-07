'use client';

import { useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { readToken } from '@/lib/token';

export interface SignatureCanvasHandle {
  /** Returns a PNG data URL, or null if nothing was drawn. */
  toDataUrl: () => string | null;
  clear: () => void;
}

interface SignatureCanvasProps {
  width?: number;
  height?: number;
  className?: string;
}

// Draw-to-sign pad for the BOL driver signature ("Confirm & Accept Load").
// Pointer-events based so it works with mouse, touch, and stylus alike.
// Exposes an imperative handle rather than a controlled value — a
// signature is captured once at submit time, not tracked as form state.
export const SignatureCanvas = forwardRef<SignatureCanvasHandle, SignatureCanvasProps>(function SignatureCanvas(
  { width = 400, height = 160, className = '' },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);

  function getCtx() {
    return canvasRef.current?.getContext('2d') ?? null;
  }

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = readToken('--fy-ink', '#1C1C16');
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInk.current = true;
    setEmpty(false);
  }

  function end() {
    drawing.current = false;
  }

  useImperativeHandle(ref, () => ({
    toDataUrl: () => (hasInk.current ? canvasRef.current!.toDataURL('image/png') : null),
    clear: () => {
      const ctx = getCtx();
      ctx?.clearRect(0, 0, width, height);
      hasInk.current = false;
      setEmpty(true);
    },
  }));

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full rounded-control bg-fy-card border border-fy-muted/25 touch-none"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        role="img"
        aria-label="Signature pad"
      />
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-xs text-fy-ink-soft">{empty ? 'Sign above' : 'Signed'}</p>
        <button
          type="button"
          onClick={() => {
            const ctx = getCtx();
            ctx?.clearRect(0, 0, width, height);
            hasInk.current = false;
            setEmpty(true);
          }}
          className="text-xs font-semibold text-fy-brown hover:underline"
        >
          Clear
        </button>
      </div>
    </div>
  );
});
