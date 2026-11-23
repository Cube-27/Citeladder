import './hero-video.css';

const VIDEOS = [
  { theme: 'light', src: '/marketing/hero-light.mp4' },
  { theme: 'dark', src: '/marketing/hero-dark.mp4' },
] as const;

export function HeroVideo() {
  return (
    <div className="cl-hero-video" data-hero-video>
      {VIDEOS.map((video) => (
        <video
          key={video.theme}
          className="cl-hero-video-clip"
          data-theme-clip={video.theme}
          src={video.src}
          width={1440}
          height={720}
          muted
          loop
          playsInline
          preload="none"
          aria-label="The CiteLadder app"
        />
      ))}
    </div>
  );
}
