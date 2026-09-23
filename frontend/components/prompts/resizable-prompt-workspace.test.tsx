import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { ResizablePromptWorkspace } from './resizable-prompt-workspace';

function renderWorkspace() {
  const result = render(
    <ResizablePromptWorkspace railId="topics" rail={<nav id="topics">Topics</nav>}>
      <div>Prompts</div>
    </ResizablePromptWorkspace>,
  );
  const container = result.container.firstElementChild as HTMLDivElement;
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    width: 1000,
    height: 600,
    top: 0,
    right: 1000,
    bottom: 600,
    left: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return result;
}

describe('ResizablePromptWorkspace', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps one resize observer while the rail width changes', () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    const createObserver = vi.fn();
    class MockResizeObserver {
      constructor() {
        createObserver();
      }
      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    const rendered = renderWorkspace();
    expect(createObserver).toHaveBeenCalledOnce();
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize topics panel' }), {
      key: 'ArrowRight',
    });
    expect(createObserver).toHaveBeenCalledOnce();
    rendered.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
  it('exposes an accessible bounded separator', () => {
    renderWorkspace();
    const separator = screen.getByRole('separator', { name: 'Resize topics panel' });
    separator.focus();
    expect(separator).toHaveFocus();
    expect(separator).toHaveAttribute('aria-controls', 'topics');
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute('aria-valuemin', '208');
    expect(separator).toHaveAttribute('aria-valuemax', '400');
    expect(separator).toHaveAttribute('aria-valuenow', '240');
  });

  it('supports keyboard resizing and clamps to both bounds', () => {
    renderWorkspace();
    const separator = screen.getByRole('separator', { name: 'Resize topics panel' });

    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator).toHaveAttribute('aria-valuenow', '256');
    fireEvent.keyDown(separator, { key: 'ArrowLeft', shiftKey: true });
    expect(separator).toHaveAttribute('aria-valuenow', '208');
    fireEvent.keyDown(separator, { key: 'End' });
    expect(separator).toHaveAttribute('aria-valuenow', '400');
    fireEvent.keyDown(separator, { key: 'Home' });
    expect(separator).toHaveAttribute('aria-valuenow', '208');
  });

  it('synchronizes the accessible maximum with the live container bound', () => {
    const result = renderWorkspace();
    const container = result.container.firstElementChild as HTMLDivElement;
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      width: 800,
      height: 600,
      top: 0,
      right: 800,
      bottom: 600,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const separator = screen.getByRole('separator', { name: 'Resize topics panel' });

    fireEvent.keyDown(separator, { key: 'End' });

    expect(separator).toHaveAttribute('aria-valuemax', '228');
    expect(separator).toHaveAttribute('aria-valuenow', '228');
  });

  it('tracks a captured pointer one-to-one and restores document interaction', () => {
    renderWorkspace();
    const separator = screen.getByRole('separator', {
      name: 'Resize topics panel',
    }) as HTMLDivElement;
    separator.setPointerCapture = vi.fn();
    separator.hasPointerCapture = vi.fn(() => true);
    separator.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(separator, { button: 0, pointerId: 7, clientX: 300 });
    expect(separator.setPointerCapture).toHaveBeenCalledWith(7);
    expect(document.body.style.cursor).toBe('col-resize');
    fireEvent.pointerMove(separator, { pointerId: 7, clientX: 380 });
    expect(separator).toHaveAttribute('aria-valuenow', '320');

    fireEvent.pointerUp(separator, { pointerId: 7 });
    expect(separator.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });

  it('resets to the default width on double click', () => {
    renderWorkspace();
    const separator = screen.getByRole('separator', { name: 'Resize topics panel' });
    fireEvent.keyDown(separator, { key: 'End' });
    fireEvent.doubleClick(separator);
    expect(separator).toHaveAttribute('aria-valuenow', '240');
  });

  it('ends a cancelled drag and does not persist the prompt width', () => {
    const rendered = renderWorkspace();
    const separator = screen.getByRole('separator', {
      name: 'Resize topics panel',
    }) as HTMLButtonElement;
    separator.setPointerCapture = vi.fn();
    separator.hasPointerCapture = vi.fn(() => true);
    separator.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(separator, { button: 0, pointerId: 9, clientX: 300 });
    fireEvent.pointerMove(separator, { pointerId: 9, clientX: 348 });
    fireEvent.pointerCancel(separator, { pointerId: 9 });
    expect(separator).toHaveAttribute('aria-valuenow', '240');
    expect(document.body.style.cursor).toBe('');
    expect(separator.releasePointerCapture).toHaveBeenCalledWith(9);
    rendered.unmount();
    renderWorkspace();
    expect(screen.getByRole('separator', { name: 'Resize topics panel' })).toHaveAttribute(
      'aria-valuenow',
      '240',
    );
  });
});
