import type { ReactNode } from 'react';
import { ChatStage } from './Cinema';

/**
 * Cinematic auth shell — the threshold of the market.
 *
 * Left: the living night-market stage (editorial headline + the WhatsApp
 * conversation stage, pure CSS motion). Right: the form, staggered in.
 * Mobile: the form leads, the stage becomes a compact brand band.
 */
export default function AuthShell({
  kicker,
  title,
  lede,
  head,
  children,
}: {
  /** Stage copy (left panel). */
  kicker: string;
  title: ReactNode;
  lede: string;
  /** Form heading (right pane). Provide kicker+h1+sub. */
  head: { kicker: string; title: ReactNode; sub: string };
  children: ReactNode;
}) {
  return (
    <div className="auth-split">
      <div className="auth-stage" aria-hidden="true">
        <p className="cine-kicker">
          <span className="pulse-dot" aria-hidden />
          {kicker}
        </p>
        <h1>{title}</h1>
        <p className="auth-lede">{lede}</p>
        <ChatStage categories={[]} />
        <div className="auth-proof">
          <span>
            <i aria-hidden /> No carts
          </span>
          <span>
            <i aria-hidden /> No checkout
          </span>
          <span>
            <i aria-hidden /> Just conversation
          </span>
        </div>
      </div>
      <div className="auth-form-pane">
        <div className="auth-pane-inner auth-pane">
          <div className="auth-head" style={{ ['--i' as string]: 0 }}>
            <p className="cine-kicker">{head.kicker}</p>
            <h1>{head.title}</h1>
            <p className="sub">{head.sub}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
