import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Keeps an illustrative product screen at one layout width while fitting its frame. */
export function ScaledPreview({
  width,
  children,
  className,
}: Readonly<{ width: number; children: ReactNode; className?: string }>) {
  const frameRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ available: width, height: width * 0.75 });

  useLayoutEffect(() => {
    const outer = frameRef.current;
    const screen = screenRef.current;
    if (!outer || !screen) return;
    const measure = () => {
      const next = { available: outer.clientWidth, height: screen.offsetHeight };
      setFrame((previous) =>
        previous.available === next.available && previous.height === next.height ? previous : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(screen);
    measure();
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(1, frame.available / width);
  return (
    <div
      ref={frameRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: frame.height * scale,
        overflow: 'hidden',
      }}
    >
      <div
        ref={screenRef}
        style={{
          width: `max(100%, ${width}px)`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
}
