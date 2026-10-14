'use client';

import { useEffect, useState } from 'react';

/**
 * Language experiment: the buyer hero in English or Nigerian Pidgin.
 * Persisted per device (`pcm` = Pidgin). This is a measured experiment
 * scaffold — full i18n waits on the results, and legal/account copy
 * stays English regardless.
 */
const COPY = {
  en: {
    titleA: 'Shop real businesses.',
    titleB: 'Chat on WhatsApp.',
    sub: 'Prices up front, sellers you can check — then one tap into a WhatsApp conversation. No checkout, and CyberShop never takes your money.',
    ang: 'English',
    pcm: 'Pidgin',
  },
  pcm: {
    titleA: 'Shop from real business.',
    titleB: 'Chat for WhatsApp.',
    sub: 'Price dey show face, seller wey you fit check — den one tap enta WhatsApp gist. No checkout, and CyberShop no dey hold your money.',
    ang: 'English',
    pcm: 'Pidgin',
  },
} as const;

type Lang = keyof typeof COPY;

export default function HeroLang() {
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('cybershop-lang');
      if (saved === 'pcm' || saved === 'en') setLang(saved);
    } catch { /* private mode */ }
  }, []);

  const c = COPY[lang];
  return (
    <>
      <div className="lang-toggle" role="group" aria-label="Language">
        <button type="button" aria-pressed={lang === 'en'} className={lang === 'en' ? 'is-on' : ''} onClick={() => { setLang('en'); try { window.localStorage.setItem('cybershop-lang', 'en'); } catch { /* ignore */ } }}>{c.ang}</button>
        <button type="button" aria-pressed={lang === 'pcm'} className={lang === 'pcm' ? 'is-on' : ''} onClick={() => { setLang('pcm'); try { window.localStorage.setItem('cybershop-lang', 'pcm'); } catch { /* ignore */ } }}>{c.pcm}</button>
      </div>
      <h1 className="shop-title">{c.titleA} <em>{c.titleB}</em></h1>
      <p className="shop-sub">{c.sub}</p>
    </>
  );
}
