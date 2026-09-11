'use client';

import { useEffect, useRef, useState } from 'react';
import { haptic } from '@/lib/haptics';
import WaveAudio from '@/components/WaveAudio';

/**
 * Vendor voice-note recorder (neomorphic button + amplitude ring).
 *
 * MediaRecorder → blob → XHR upload to /api/vendor/media/upload-audio
 * (XHR so we get a real progress stream for the liquid bar). The worker
 * validates MIME + magic bytes + size; this component validates duration.
 */

const MAX_SECONDS = 60;
const MAX_BYTES = 8 * 1024 * 1024;

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

const EXT: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' };

function xhrUpload(file: File, mime: string, onProgress: (p: number) => void): Promise<{ media: { id: number; url: string } }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, `voice-note.${EXT[mime] ?? 'webm'}`);
    const x = new XMLHttpRequest();
    x.open('POST', '/api/vendor/media/upload-audio');
    x.responseType = 'json';
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    x.onload = () => {
      const j = (x.response ?? {}) as { ok?: boolean; media?: { id: number; url: string }; error?: { message?: string } };
      if (x.status === 200 && j?.media) resolve({ media: j.media });
      else reject(new Error(j?.error?.message || `Upload failed (${x.status})`));
    };
    x.onerror = () => reject(new Error('Network error during upload.'));
    x.send(form);
  });
}

export default function VoiceRecorder({
  value, onAttach, onDetach,
}: {
  value: { id: number; url: string } | null;
  onAttach: (id: number, url: string) => void;
  onDetach: () => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'uploading'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const timerRef = useRef(0);
  const secondsRef = useRef(0);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void ctxRef.current?.close().catch(() => {});
  }, []);

  /** Single finish path — runs exactly once, from MediaRecorder's onstop,
   *  after the final dataavailable chunk has landed. */
  const finishRecording = () => {
    window.clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    if (btnRef.current) btnRef.current.style.setProperty('--amp', '0');
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void ctxRef.current?.close().catch(() => {});
    streamRef.current = null;
    ctxRef.current = null;

    const mime = pickMime();
    const blob = new Blob(chunksRef.current, { type: mime });
    const dur = secondsRef.current;
    if (dur < 1 || blob.size === 0) {
      setErr('That was too short — record at least a second.');
      setPhase('idle');
      setSeconds(0);
      return;
    }
    if (blob.size > MAX_BYTES) {
      setErr('That recording is over 8 MB — keep it under a minute.');
      setPhase('idle');
      return;
    }
    void (async () => {
      setPhase('uploading');
      setProgress(0);
      try {
        const file = new File([blob], `voice-note.${EXT[mime] ?? 'webm'}`, { type: mime });
        const j = await xhrUpload(file, mime, setProgress);
        haptic('double');
        setErr('');
        setPhase('idle');
        setSeconds(0);
        onAttach(j.media.id, j.media.url);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Upload failed.');
        setPhase('idle');
      }
    })();
  };

  /** User intent to stop: ask MediaRecorder to stop; finishRecording runs
   *  from onstop. (Never call finishRecording here too — double upload.) */
  const requestStop = () => {
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    else finishRecording();
  };

  const startRecording = async () => {
    setErr('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErr('This browser doesn’t support the microphone (try Chrome or Firefox).');
      return;
    }
    const mime = pickMime();
    if (!mime) {
      setErr('Audio recording isn’t supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = finishRecording;

      // amplitude: analyser drives the ring + live wave
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      ctxRef.current = ctx;
      const srcNode = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      srcNode.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const waveData: number[] = [];

      secondsRef.current = 0;
      setSeconds(0);
      setPhase('recording');
      haptic('pop');
      timerRef.current = window.setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
        if (secondsRef.current >= MAX_SECONDS) requestStop();
      }, 1000);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const amp = Math.min(1, Math.sqrt(sum / data.length) * 3);
        if (btnRef.current) btnRef.current.style.setProperty('--amp', amp.toFixed(3));
        waveData.push(amp);
        if (waveData.length > 90) waveData.shift();
        const cv = waveRef.current;
        if (cv) {
          const c = cv.getContext('2d');
          if (c) {
            const dpr = window.devicePixelRatio || 1;
            if (cv.width !== cv.clientWidth * dpr) {
              cv.width = cv.clientWidth * dpr;
              cv.height = cv.clientHeight * dpr;
            }
            c.setTransform(dpr, 0, 0, dpr, 0, 0);
            c.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
            const bw = cv.clientWidth / 90;
            for (let i = 0; i < waveData.length; i++) {
              const h = Math.max(2, waveData[i] * (cv.clientHeight - 4));
              c.fillStyle = i === waveData.length - 1 ? '#f2c879' : 'rgba(242, 200, 121, 0.45)';
              c.fillRect(i * bw, (cv.clientHeight - h) / 2, Math.max(1, bw - 1), h);
            }
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      rec.start(250);
    } catch {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setErr('Microphone access was denied — allow it in your browser and try again.');
      setPhase('idle');
    }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="voice-rec">
      {value ? (
        <div className="voice-attached">
          <span className="voice-attached-tag" role="img" aria-label="Audio attached">🎙️</span>
          <span className="voice-attached-name">Voice note attached</span>
          <button type="button" className="voice-remove" onClick={() => { haptic('pop'); onDetach(); }}>
            Remove
          </button>
        </div>
      ) : phase === 'uploading' ? (
        <div className="voice-upload">
          <div className="voice-upload-bar">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className="voice-upload-label">Uploading… {Math.round(progress * 100)}%</span>
        </div>
      ) : (
        <div className="voice-idle">
          <button
            ref={btnRef}
            type="button"
            className={`voice-btn${phase === 'recording' ? ' is-rec' : ''}`}
            onClick={phase === 'recording' ? requestStop : startRecording}
            aria-label={phase === 'recording' ? 'Stop recording' : 'Record a voice note'}
          >
            {phase === 'recording' ? (
              <span className="voice-stop" aria-hidden="true" />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
              </svg>
            )}
          </button>
          <div className="voice-meta">
            <canvas ref={waveRef} className="voice-wave" aria-hidden="true" />
            <span className="voice-time">{phase === 'recording' ? `● ${fmt(seconds)}` : 'Record a voice note'}</span>
            <span className="voice-hint">Up to {MAX_SECONDS}s — plays on your item page like a WhatsApp voice message.</span>
          </div>
        </div>
      )}
      {err && <p className="voice-err" role="alert">{err}</p>}
      {value && (
        <div className="voice-preview">
          <WaveAudio src={value.url} label="Preview" />
        </div>
      )}
    </div>
  );
}
