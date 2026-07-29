import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * Shared hook for auto-advancing product/narrative tour steps with
 * reduced-motion safety and manual play/pause controls.
 */
export function useTourAutoplay(stepCount: number, stepDuration = 6000) {
  const reduceMotion = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(() => !reduceMotion);

  useEffect(() => {
    if (reduceMotion || !isPlaying) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % stepCount);
    }, stepDuration);
    return () => clearInterval(interval);
  }, [reduceMotion, isPlaying, stepCount, stepDuration]);

  const selectStep = (index: number) => {
    setActiveStep(index);
    setIsPlaying(false);
  };

  const togglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  return {
    activeStep,
    setActiveStep,
    isPlaying: !reduceMotion && isPlaying,
    setIsPlaying,
    selectStep,
    togglePlay,
  };
}
