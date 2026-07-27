import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Dialog } from './dialog';
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from './dropdown';
import { Tooltip, TooltipProvider } from './tooltip';

// jsdom has no ResizeObserver, which Radix's tooltip arrow measurement
// requires once the content actually mounts. A no-op stub is enough — the
// assertions below pin class strings, not geometry.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

describe('Dialog', () => {
  it('renders title/description/children/footer when open', () => {
    render(
      <Dialog
        open
        onOpenChange={() => {}}
        title="Launch audit"
        description="Pick engines"
        footer={<button type="button">Confirm</button>}
      >
        <p>Body content</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Launch audit')).toBeInTheDocument();
    expect(screen.getByText('Pick engines')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(
      <Dialog open={false} onOpenChange={() => {}} title="Hidden">
        <p>Nope</p>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Dropdown', () => {
  it('exposes a trigger with menu semantics (closed by default)', () => {
    render(
      <Dropdown>
        <DropdownTrigger>Menu</DropdownTrigger>
        <DropdownContent>
          <DropdownItem>Edit</DropdownItem>
        </DropdownContent>
      </Dropdown>,
    );
    const trigger = screen.getByRole('button', { name: 'Menu' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // Items are not mounted until opened.
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });
});

describe('Tooltip', () => {
  it('renders its trigger child', () => {
    render(
      <TooltipProvider>
        <Tooltip content="Coming soon">
          <button type="button">Generate</button>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument();
  });

  it('renders the ADS inverse chip when open (never white-on-white)', async () => {
    render(
      <TooltipProvider>
        <Tooltip content="Coming soon" delayDuration={0}>
          <button type="button">Generate</button>
        </Tooltip>
      </TooltipProvider>,
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Generate' }));
    const tip = await screen.findByRole('tooltip');
    expect(tip.className).toContain('bg-surface-inverse');
    expect(tip.className).toContain('text-on-inverse');
  });
});
