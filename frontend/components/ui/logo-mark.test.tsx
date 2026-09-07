import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BRAND_LOGO_SIZES, LogoMark } from './logo-mark';

describe('LogoMark', () => {
  it('renders canonical brand size by default with official citeladder-logo image asset', () => {
    const { container } = render(<LogoMark />);

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toContain('citeladder-logo');
    expect(img?.getAttribute('height')).toBe(String(BRAND_LOGO_SIZES.brand));
    expect(img?.getAttribute('width')).toBe('119');
  });

  it('supports semantic variants from central sizing ladder', () => {
    const { container: sidebarContainer } = render(<LogoMark variant="sidebar" />);
    const sidebarImg = sidebarContainer.querySelector('img');
    expect(sidebarImg?.getAttribute('height')).toBe(String(BRAND_LOGO_SIZES.sidebar));

    const { container: compactContainer } = render(<LogoMark variant="compact" />);
    const compactImg = compactContainer.querySelector('img');
    expect(compactImg?.getAttribute('height')).toBe(String(BRAND_LOGO_SIZES.compact));
  });

  it('allows explicit size override when required', () => {
    const { container } = render(<LogoMark size={40} />);

    const img = container.querySelector('img');
    expect(img?.getAttribute('height')).toBe('40');
  });

  it('renders mark-only vector SVG when wordmark is false', () => {
    const { container } = render(<LogoMark variant="mini" wordmark={false} />);

    expect(container.querySelector('img')).toBeNull();
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute('height')).toBe(String(BRAND_LOGO_SIZES.mini));
  });

  it('sets aria-hidden on decorative container when alt is empty', () => {
    const { container } = render(<LogoMark />);

    const wrapper = container.querySelector('span');
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
  });

  it('allows specifying an accessible alt name when needed', () => {
    const { container } = render(<LogoMark alt="CiteLadder" />);

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('alt', 'CiteLadder');
    const wrapper = container.querySelector('span');
    expect(wrapper).not.toHaveAttribute('aria-hidden');
  });

  it('names a mark-only logo when accessible alt text is supplied', () => {
    const { getByRole } = render(<LogoMark wordmark={false} alt="CiteLadder" />);

    expect(getByRole('img', { name: 'CiteLadder' })).toBeInTheDocument();
  });
});
