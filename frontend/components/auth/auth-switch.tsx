import { type MouseEvent, type ReactNode, useLayoutEffect, useRef } from 'react';
import { Link, type LinkProps, useLocation, useNavigate } from 'react-router-dom';

import { useReducedMotion } from '@/lib/accessibility/use-reduced-motion';

/*
 * The motion between sign-in and sign-up. They are two routes, so the fields
 * only one form has (`AuthSwitchOnly`) shrink away before the switch link
 * leaves, and the arriving form grows its own in, each over the shared
 * open/close duration; the fields both share sit in the same place on both.
 * Under reduced motion the switch is instant.
 */

/** History state the switch link leaves, so the arriving form grows its own fields in. */
const SWITCHED = { authSwitch: true } as const;
const ONLY = 'data-auth-switch-only';

function arrivedBySwitch(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'authSwitch' in state;
}

/** The height a field takes, and the gap its column puts above it. */
function extent(element: HTMLElement) {
  const style = getComputedStyle(element);
  const gap = Number.parseFloat(getComputedStyle(element.parentElement ?? element).rowGap) || 0;
  return {
    open: { height: `${element.offsetHeight}px`, marginTop: '0px', opacity: 1 },
    shut: { height: '0px', marginTop: `${-gap}px`, opacity: 0 },
    duration: Number.parseFloat(style.getPropertyValue('--motion-open')) || 0,
    enter: style.getPropertyValue('--ease-standard').trim(),
    exit: style.getPropertyValue('--ease-exit').trim(),
  };
}

/** Grow or shrink the field, clipped, as its column opens or closes around it. */
function resize(element: HTMLElement, grow: boolean, fill: FillMode): Animation {
  const { open, shut, duration, enter, exit } = extent(element);
  element.style.overflow = 'hidden';
  const animation = element.animate(grow ? [shut, open] : [open, shut], {
    duration,
    easing: (grow ? enter : exit) || undefined,
    fill,
  });
  if (grow)
    animation.onfinish = animation.oncancel = () => element.style.removeProperty('overflow');
  return animation;
}

const animatable = (element: HTMLElement) => typeof element.animate === 'function';

/** A field only this form of the two has: it grows in when the switch link brought the reader here. */
export function AuthSwitchOnly({ children }: Readonly<{ children: ReactNode }>) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const grow = arrivedBySwitch(useLocation().state) && !reducedMotion;

  useLayoutEffect(() => {
    const element = ref.current;
    if (!grow || !element || !animatable(element)) return;
    const animation = resize(element, true, 'none');
    return () => animation.cancel();
  }, [grow]);

  return (
    <div ref={ref} {...{ [ONLY]: '' }}>
      {children}
    </div>
  );
}

/**
 * The link to the other form. A plain primary click first shrinks away this
 * form's own fields, then navigates; any other click is the browser's.
 */
export function AuthSwitchLink({
  to,
  ...props
}: Readonly<Omit<LinkProps, 'to' | 'state' | 'onClick'> & { to: string }>) {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const leaving = useRef(false);

  function leave(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
      return;
    if (reducedMotion) return;
    const form = event.currentTarget.closest('main');
    const own = form ? [...form.querySelectorAll<HTMLElement>(`[${ONLY}]`)] : [];
    if (own.length === 0 || !own.every(animatable)) return;
    event.preventDefault();
    if (leaving.current) return;
    leaving.current = true;
    const go = () => navigate(to, { state: SWITCHED });
    Promise.all(own.map((element) => resize(element, false, 'forwards').finished)).then(go, go);
  }

  return <Link {...props} to={to} state={SWITCHED} onClick={leave} />;
}
