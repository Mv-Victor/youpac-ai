import { useRef, useCallback, useEffect } from "react";

export function useAudioPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback((url: string) => {
    timerRef.current = setTimeout(() => {
      audioRef.current?.pause();
      audioRef.current = new Audio(url);
      audioRef.current.play().catch(() => {});
    }, 300);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    audioRef.current?.pause();
  }, []);

  return { handleMouseEnter, handleMouseLeave };
}
