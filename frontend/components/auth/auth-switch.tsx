import { type MouseEvent, type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { Link, type LinkProps, useLocation, useNavigate } from 'react-router-dom';

import { useReducedMotion } from '@/lib/accessibility/use-reduced-motion';

const SWITCHED = { authSwitch: true } as const;
const ONLY = 'data-auth-switch-only';

function arrivedBySwitch(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'authSwitch' in state;
}

function extent(element: HTMLElement) {
  const style = getComputedStyle(element);
  const gap = Number.parseFloat(getComputedStyle(element.parentElement ?? element).rowGap) || 0;
  return {
    open: { height: `${element.offsetHeight}px`, marginTop: '0px', opacity: 1 },
    shut: { height: '0px', marginTop: `${-gap}px`, opacity: 0 },
    opening: Number.parseFloat(style.getPropertyValue('--transition-duration-open')) || 0,
    closing: Number.parseFloat(style.getPropertyValue('--transition-duration-close')) || 0,
    enter: style.getPropertyValue('--ease-standard').trim(),
    exit: style.getPropertyValue('--ease-standard').trim(),
  };
}

function resize(element: HTMLElement, grow: boolean, fill: FillMode): Animation {
  const { open, shut, opening, closing, enter, exit } = extent(element);
  element.style.overflow = 'hidden';
  const animation = element.animate(grow ? [shut, open] : [open, shut], {
    duration: grow ? opening : closing,
    easing: (grow ? enter : exit) || undefined,
    fill,
  });
  if (grow)
    animation.onfinish = animation.oncancel = () => element.style.removeProperty('overflow');
  return animation;
}

const animatable = (element: HTMLElement) => typeof element.animate === 'function';

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

export function AuthSwitchLink({
  to,
  ...props
}: Readonly<Omit<LinkProps, 'to' | 'state' | 'onClick'> & { to: string }>) {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const leaving = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
    const go = () => {
      if (mounted.current) void navigate(to, { state: SWITCHED });
    };
    Promise.all(own.map((element) => resize(element, false, 'forwards').finished)).then(go, go);
  }

  return <Link {...props} to={to} state={SWITCHED} onClick={leave} />;
}
