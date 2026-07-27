import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BrandLogo, brandInitials } from './brand-logo';

describe('BrandLogo', () => {
  it('derives stable one- and two-word initials', () => {
    expect(brandInitials('Acme')).toBe('AC');
    expect(brandInitials('Acme Corporation')).toBe('AC');
    expect(brandInitials('')).toBe('?');
  });

  it('renders the cached logo URL and falls back after an image error', () => {
    const { container } = render(
      <BrandLogo name="Acme Corporation" logoUrl="/api/v1/projects/acme/logo" />,
    );
    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toMatch(/\/api\/v1\/projects\/acme\/logo$/);

    fireEvent.error(image!);

    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('AC');
  });

  it('renders initials immediately when no cache entry exists', () => {
    const { container } = render(<BrandLogo name="Globex" logoUrl={null} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('GL');
  });
});
