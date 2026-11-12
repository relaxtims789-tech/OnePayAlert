'use client';

import { paymentAlertMessage, RealtimeEvent, type DeviceDto, type Locale, type TransactionDto } from '@onepay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { session } from './api';
import { useI18n } from './i18n';

export type RealtimeStatus = 'connecting' | 'live' | 'offline';
type Listener = (t: TransactionDto, kind: 'created' | 'updated') => void;

interface RealtimeValue {
  status: RealtimeStatus;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  subscribe: (fn: Listener) => () => void;
}
const RealtimeContext = createContext<RealtimeValue | null>(null);
const SOUND_KEY = 'op_sound';

/** Short two-tone chime via Web Audio (no asset download). */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      const start = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
    setTimeout(() => void ctx.close(), 1000);
  } catch {
    /* audio unavailable */
  }
}

function speak(text: string, locale: Locale) {
  if (!('speechSynthesis' in window)) return;
  const tag = { km: 'km', en: 'en', zh: 'zh' }[locale];
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(tag));
  if (!voice) return; // No voice for this language on this device: the chime alone plays.
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  window.speechSynthesis.speak(u);
}

/**
 * One Socket.IO connection per signed-in tab. The token is fetched from the BFF on every
 * (re)connect, so expired tokens are replaced automatically.
 */
export function RealtimeProvider({ companyId, children }: { companyId: string | null; children: ReactNode }) {
  const qc = useQueryClient();
  const { locale } = useI18n();
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const [soundEnabled, setSound] = useState(false);
  const listeners = useRef(new Set<Listener>());
  const localeRef = useRef(locale);
  const soundRef = useRef(soundEnabled);
  localeRef.current = locale;
  soundRef.current = soundEnabled;

  useEffect(() => {
    try {
      setSound(localStorage.getItem(SOUND_KEY) === '1');
    } catch {
      /* storage blocked */
    }
  }, []);

  const setSoundEnabled = useCallback((v: boolean) => {
    setSound(v);
    try {
      localStorage.setItem(SOUND_KEY, v ? '1' : '0');
    } catch {
      /* storage blocked */
    }
    if (v) chime();
  }, []);

  useEffect(() => {
    if (!companyId) return;
    let socket: Socket | null = null;
    let cancelled = false;
    setStatus('connecting');

    (async () => {
      let url: string;
      try {
        url = (await session.socketToken()).realtimeUrl;
      } catch {
        setStatus('offline');
        return;
      }
      if (cancelled) return;
      socket = io(`${url}/realtime`, {
        transports: ['websocket'],
        auth: (cb) => {
          session
            .socketToken()
            .then((r) => cb({ token: r.accessToken }))
            .catch(() => cb({}));
        },
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10_000,
      });
      socket.on('ready', () => setStatus('live'));
      socket.on('disconnect', () => setStatus('connecting'));
      socket.on('connect_error', () => setStatus('offline'));
      socket.on('session.expired', () => socket?.connect());
      // The server drops unauthorised sockets; reconnect with a fresh token.
      socket.io.on('reconnect_attempt', () => setStatus('connecting'));

      const handle = (kind: 'created' | 'updated') => (t: TransactionDto) => {
        void qc.invalidateQueries({ queryKey: ['transactions'] });
        void qc.invalidateQueries({ queryKey: ['transactions-summary'] });
        listeners.current.forEach((fn) => fn(t, kind));
        if (kind === 'created' && t.status === 'SUCCESS' && soundRef.current) {
          chime();
          speak(paymentAlertMessage(localeRef.current, { amountMinor: t.amountMinor, currency: t.currency, payerName: t.payerName }).body, localeRef.current);
        }
      };
      socket.on(RealtimeEvent.TRANSACTION_CREATED, handle('created'));
      socket.on(RealtimeEvent.TRANSACTION_UPDATED, handle('updated'));
      // Soundbox online/offline and telemetry: patch the device list in place.
      socket.on(RealtimeEvent.DEVICE_UPDATED, (d: DeviceDto) => {
        qc.setQueryData<DeviceDto[]>(['devices'], (list) => list?.map((x) => (x.id === d.id ? d : x)));
      });
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [companyId, qc]);

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);

  const value = useMemo(() => ({ status, soundEnabled, setSoundEnabled, subscribe }), [status, soundEnabled, setSoundEnabled, subscribe]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return ctx;
}
