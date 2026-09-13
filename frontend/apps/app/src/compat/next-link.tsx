import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { viteOwnedDestination } from './route-ownership';

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
};

/**
 * Browser-only replacement for the subset of Next Link used during the Vite
 * migration. Vite-owned primary clicks stay in React Router; native link
 * behavior hands every other route to the coexisting production ingress.
 */
const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  {
    children,
    href,
    onClick,
    prefetch: _prefetch,
    replace = false,
    scroll,
    target,
    download,
    ...props
  },
  ref,
) {
  const navigate = useNavigate();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    const destination = viteOwnedDestination(href);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey ||
      target ||
      download !== undefined ||
      destination === null
    ) {
      return;
    }

    event.preventDefault();
    navigate(destination, {
      preventScrollReset: scroll === false,
      replace,
    });
  }

  return (
    <a {...props} ref={ref} href={href} target={target} download={download} onClick={handleClick}>
      {children}
    </a>
  );
});

export default Link;
