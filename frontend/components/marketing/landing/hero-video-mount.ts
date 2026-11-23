import type { Theme } from '@/lib/theme/theme';

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function mountHeroVideo(figure: HTMLElement): void {
  const clips = [...figure.querySelectorAll<HTMLVideoElement>('video[data-theme-clip]')];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const show = () => {
    for (const clip of clips) {
      if (clip.dataset.themeClip !== currentTheme()) {
        clip.pause();
        continue;
      }
      clip.muted = true;
      if (clip.preload === 'none') {
        clip.preload = 'auto';
        clip.load();
      }
      if (reduceMotion.matches) clip.pause();
      else void clip.play().catch(() => undefined);
    }
  };

  show();
  reduceMotion.addEventListener('change', show);
  new MutationObserver(show).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}
