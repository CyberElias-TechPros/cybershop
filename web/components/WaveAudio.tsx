'use client';

import { useEffect, useRef, useState } from 'react';
import { haptic } from '@/lib/haptics';

/**
 * Liquid waveform audio player (vendor voice notes).
 *
 * Decodes the audio once and draws its real peaks as a bar wave. Playback
 * fills the wave left→right with a gold→emerald gradient (the "water filling
 * a glass" effect) with a gold playhead line. If the browser can't decode the
 * file, it falls back to a deterministic pseudo-wave — playback still works.
 */
export default function WaveAudio({ src, label }: { src: string; label?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const progressRef = useRef(0);
  const rafRef = useRef(0);

  // decode → real peaks
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(src, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(String(res.status));
        const buf = await res.arrayBuffer();
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctor();
        const decoded = await ctx.decodeAudioData(buf);
        ctx.close();
        if (cancelled) return;
        const ch = decoded.getChannelData(0);
        const N = 64;
        const size = Math.floor(ch.length / N) || 1;
        const out: number[] = [];
        for (let i = 0; i < N; i++) {
          let max = 0;
          const start = i * size;
          const step = Math.max(1, Math.floor(size / 50)); // sample every 50th for speed
          for (let j = start; j < start + size && j < ch.length; j += step) {
            const v = Math.abs(ch[j] ?? 0);
            if (v > max) max = v;
          }
          out.push(max);
        }
        const top = Math.max(0.001, ...out);
        setPeaks(out.map((v) => Math.min(1, Math.max(0.06, v / top))));
      } catch {
        if (!cancelled) setPeaks(null); // fallback wave
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  // draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const N = 64;
      const gap = 2;
      const bw = (W - gap * (N - 1)) / N;
      const p = progressRef.current;
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, '#f2c879');
      grad.addColorStop(0.55, '#d8e6a0');
      grad.addColorStop(1, '#2ce58e');

      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        // real peaks, or a deterministic pseudo-wave fallback
        const v = peaks ? peaks[i] ?? 0.3 : 0.28 + 0.5 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21));
        const bh = Math.max(3, v * (H - 4));
        const x = i * (bw + gap);
        const y = (H - bh) / 2;
        ctx.fillStyle = t <= p ? grad : 'rgba(237, 245, 241, 0.13)';
        const r = Math.min(bw / 2, 2.5);
        ctx.beginPath();
        ctx.roundRect(x, y, bw, bh, r);
        ctx.fill();
      }
      // playhead
      if (p > 0 && p < 1) {
        const px = p * W;
        ctx.fillStyle = 'rgba(247, 220, 168, 0.9)';
        ctx.fillRect(px - 0.75, 2, 1.5, H - 4);
      }
    };

    draw();
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [peaks, progress]);

  // smooth progress while playing
  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const a = audioRef.current;
      if (a && a.duration > 0) {
        progressRef.current = a.currentTime / a.duration;
        setProgress(progressRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      void a.play();
      haptic('pop');
    } else {
      a.pause();
    }
  };

  const fmt = (s: number) => {
    if (!Number.isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${ss}`;
  };

  return (
    <div className="wave-audio">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          progressRef.current = 0;
          setProgress(0);
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
      <button
        type="button"
        className={`wave-play${playing ? ' is-playing' : ''}`}
        onClick={toggle}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <rect x="2.5" y="2" width="4" height="12" rx="1" />
            <rect x="9.5" y="2" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M4 2.8c0-.8.9-1.3 1.6-.9l8 5.2c.6.4.6 1.4 0 1.8l-8 5.2c-.7.4-1.6-.1-1.6-.9V2.8z" />
          </svg>
        )}
      </button>
      <canvas ref={canvasRef} className="wave-canvas" aria-hidden="true" />
      <span className="wave-time" aria-hidden="true">
        {fmt(progress * duration)} / {fmt(duration)}
      </span>
      {label && <span className="wave-label">{label}</span>}
    </div>
  );
}
