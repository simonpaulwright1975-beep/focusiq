/**
 * FocusiQ landing screen, in the same style as the other Walter Geering apps
 * (Lead iQ): the WG illustration, the FocusiQ logo and a single way in.
 *
 * The screen itself is not security. In live mode it hosts the sign-in form,
 * and access is decided by the person's FocusiQ role (auth.tsx) and the
 * database's row-level security. In the demo, "Enter" opens the demo.
 */
import { useState, type ReactNode } from 'react';
import { AuthGate } from './auth.js';
import { LIVE } from './supabase.js';

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

/** The WG landing card: illustration, logo, app name, then `body`. */
function LandingCard({ subtitle, children }: { subtitle: string; children: ReactNode }) {
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
          {children}
          <div className="landing-footer">WALTER GEERING</div>
        </div>
      </div>
    </main>
  );
}

/**
 * Live: the landing screen is the sign-in screen, and the app opens only for
 * someone with the right FocusiQ role (AuthGate). Demo: the landing screen
 * shows once per browser session, then the demo.
 */
export function LandingGate({ app, subtitle, enterLabel, children }: { app: 'director' | 'employee'; subtitle: string; enterLabel: string; children: ReactNode }) {
  if (LIVE) {
    return (
      <AuthGate app={app} frame={(body) => <LandingCard subtitle={subtitle}>{body}</LandingCard>}>
        {children}
      </AuthGate>
    );
  }
  return <WelcomeGate app={app} subtitle={subtitle} enterLabel={enterLabel}>{children}</WelcomeGate>;
}

/**
 * Directors' preview of the employee app (employee.html?preview): live, only a
 * signed-in Director gets in; then the welcome screen exactly as staff see it.
 */
export function PreviewGate({ children }: { children: ReactNode }) {
  const welcome = (
    <WelcomeGate app="preview" remember={false} subtitle="Your FocusiQ assessment" enterLabel="Get started" note="Preview – staff sign in here with their Walter Geering account.">
      {children}
    </WelcomeGate>
  );
  if (!LIVE) return welcome;
  return (
    <AuthGate app="director" frame={(body) => <LandingCard subtitle="Preview of the staff view – Directors only">{body}</LandingCard>}>
      {welcome}
    </AuthGate>
  );
}

function WelcomeGate({ app, subtitle, enterLabel, note, remember = true, children }: { app: string; subtitle: string; enterLabel: string; note?: string; remember?: boolean; children: ReactNode }) {
  const key = `focusiq.landing.${app}`;
  const [entered, setEntered] = useState(() => remember && readEntered(key));
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
    <LandingCard subtitle={subtitle}>
      <button className="btn" onClick={enter} autoFocus>
        {enterLabel} <span aria-hidden="true">→</span>
      </button>
      <p className="landing-note">{note ?? 'Demo – sign-in with your Walter Geering account comes when FocusiQ is connected.'}</p>
    </LandingCard>
  );
}
