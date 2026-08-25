import { describe, it, expect } from 'vitest';
import { fireEvent, screen, render } from '@testing-library/react';
import { useState } from 'react';
import { Modal } from './Modal';

// Regression test for a real production bug: typing into any input inside
// a Modal lost focus after the first character. Root cause was
// Modal's own effect depending on `onClose` — a caller passing an inline
// arrow (`onClose={() => {}}`, RatingModal's own pattern) gets a new
// function identity every render, and a parent with its own state (the
// input below) re-renders on every keystroke, re-running the effect and
// re-focusing the × close button each time. See Modal.tsx's own doc
// comment on the fix.
function ModalWithTextInput() {
  const [value, setValue] = useState('');
  return (
    <Modal open onClose={() => {}} title="Test modal">
      <textarea aria-label="comment" value={value} onChange={(e) => setValue(e.target.value)} />
    </Modal>
  );
}

describe('Modal — focus-steal regression', () => {
  it('typing multiple characters into a child input keeps focus on that input the whole time', () => {
    render(<ModalWithTextInput />);
    const textarea = screen.getByLabelText('comment') as HTMLTextAreaElement;

    textarea.focus();
    fireEvent.change(textarea, { target: { value: 'h' } });
    expect(document.activeElement).toBe(textarea);

    fireEvent.change(textarea, { target: { value: 'he' } });
    expect(document.activeElement).toBe(textarea);

    fireEvent.change(textarea, { target: { value: 'hello' } });
    expect(document.activeElement).toBe(textarea);
    expect(textarea.value).toBe('hello');
  });

  it('still focuses the close button once, right when the modal opens', () => {
    render(<ModalWithTextInput />);
    expect(document.activeElement).toHaveAttribute('aria-label', 'Close');
  });

  it('Escape still calls the latest onClose even after re-renders changed its identity', () => {
    let closeCount = 0;
    function Wrapper() {
      const [, setTick] = useState(0);
      return (
        <Modal open onClose={() => { closeCount += 1; }} title="Test modal">
          <button type="button" onClick={() => setTick((t) => t + 1)}>
            re-render
          </button>
        </Modal>
      );
    }
    render(<Wrapper />);
    fireEvent.click(screen.getByText('re-render')); // forces a new onClose identity
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeCount).toBe(1);
  });
});
