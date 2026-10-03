/**
 * FocusiQ landing screen, in the same style as the other Walter Geering apps
 * (Lead iQ): the WG illustration, the FocusiQ logo and a single way in.
 *
 * This is a welcome screen, not security. Access is decided by Supabase
 * sign-in and focusiq.is_focusiq_user() / focusiq.is_director(); until the app
 * is connected, "Enter" opens the demo.
 */
import { useState, type ReactNode } from 'react';

const BASE = import.meta.env.BASE_URL;
export const LOGO_SRC = `${BASE}brand/focusiq-logo.webp`;
const ILLUSTRATION_SRC = `${BASE}brand/welcome-illustration.webp`;

function readEntered(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/** Shows the landing screen once per browser session, then the app. */
export function LandingGate({ app, subtitle, enterLabel, children }: { app: 'director' | 'employee'; subtitle: string; enterLabel: string; children: ReactNode }) {
  const key = `focusiq.landing.${app}`;
  const [entered, setEntered] = useState(() => readEntered(key));
  if (entered) return <>{children}</>;
  const enter = () => {
    try {
      sessionStorage.setItem(key, '1');
    } catch {
      /* private mode: show the landing screen again next time */
    }
    setEntered(true);
  };
  return (
    <main className="landing">
      <div className="landing-card card">
        <div className="landing-illustration">
          <img src={ILLUSTRATION_SRC} alt="" role="presentation" />
        </div>
        <div className="landing-body">
          <h1 className="landing-logo">
            <img src={LOGO_SRC} alt="FocusiQ" />
          </h1>
          <div className="landing-tagline">{subtitle}</div>
          <button className="btn" onClick={enter} autoFocus>
            {enterLabel} <span aria-hidden="true">→</span>
          </button>
          <p className="landing-note">Demo – sign-in with your Walter Geering account comes when FocusiQ is connected.</p>
          <div className="landing-footer">WALTER GEERING</div>
        </div>
      </div>
    </main>
  );
}
