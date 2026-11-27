import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';

import { Calendar } from './calendar';
import { DateField } from './date-field';
import { Field } from './field';

describe('Calendar', () => {
  it('selects the exact ISO day that was clicked', () => {
    const onSelect = vi.fn();
    render(<Calendar value="2026-09-05" onSelect={onSelect} labelledBy="start" />);
    fireEvent.click(screen.getByRole('button', { name: '2026-09-01' }));
    expect(onSelect).toHaveBeenCalledWith('2026-09-01');
  });

  it('marks the selected day and no other', () => {
    render(<Calendar value="2026-09-05" onSelect={vi.fn()} labelledBy="start" />);
    const pressed = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveAccessibleName('2026-09-05');
  });

  it('disables days outside the imported coverage', () => {
    render(
      <Calendar
        value="2026-09-05"
        onSelect={vi.fn()}
        min="2026-09-03"
        max="2026-09-20"
        labelledBy="start"
      />,
    );
    expect(screen.getByRole('button', { name: '2026-09-02' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '2026-09-03' })).toBeEnabled();
  });

  it('ignores a date that only looks valid', () => {
    render(<Calendar value="2026-02-31" onSelect={vi.fn()} labelledBy="start" />);
    const pressed = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(0);
  });

  it('moves between months without changing the selection', () => {
    const onSelect = vi.fn();
    render(<Calendar value="2026-09-05" onSelect={onSelect} labelledBy="start" />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText(/August 2026/)).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('DateField', () => {
  it('takes its name from the visible label and accepts a typed date without opening the calendar', () => {
    const onChange = vi.fn();
    render(
      <Field label="When did it go live?">
        {(props) => <DateField {...props} value="" onChange={onChange} />}
      </Field>,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'When did it go live?' }), {
      target: { value: '2026-09-05' },
    });
    expect(onChange).toHaveBeenCalledWith('2026-09-05');
    expect(screen.getByRole('button')).toHaveAccessibleName('When did it go live? open calendar');
  });
});
