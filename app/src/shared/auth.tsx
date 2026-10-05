/**
 * Live sign-in with the shared Walter Geering logins (Supabase Auth in WG Main).
 *
 * * Logins are created in the Hub, never here: no sign-up, and the emailed
 *   sign-in link is sent only to existing accounts (shouldCreateUser: false).
 * * Signed in is not enough: the person needs a FocusiQ role
 *   (focusiq.user_roles; Directors are 'director' or 'super_admin'). The
 *   database enforces the same rules with row-level security.
 * * Error messages never echo the email address.
 */
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { db } from './supabase.js';

export type FocusiqRole = 'employee' | 'director' | 'super_admin';

export interface SignedIn {
  userId: string;
  email: string;
  role: FocusiqRole;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<SignedIn | null>(null);

/** The signed-in person in live mode; null in the demo. */
export const useSignedIn = () => useContext(AuthContext);

type State =
  | { kind: 'loading' }
  | { kind: 'signed_out'; notice?: string }
  | { kind: 'recovery' }
  | { kind: 'no_access'; email: string; reason: 'not_focusiq' | 'not_director' }
  | { kind: 'signed_in'; who: SignedIn };

const signOut = async () => {
  await db().auth.signOut();
};

async function resolve(userId: string, email: string, app: 'director' | 'employee'): Promise<State> {
  const { data, error } = await db().from('user_roles').select('role').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  const role = (data?.role ?? null) as FocusiqRole | null;
  if (!role) return { kind: 'no_access', email, reason: 'not_focusiq' };
  if (app === 'director' && role !== 'director' && role !== 'super_admin') return { kind: 'no_access', email, reason: 'not_director' };
  return { kind: 'signed_in', who: { userId, email, role, signOut } };
}

/**
 * Renders `children` only for someone signed in with the right FocusiQ role;
 * otherwise renders `frame` around the sign-in form or an explanation.
 */
export function AuthGate({
  app,
  frame,
  children,
}: {
  app: 'director' | 'employee';
  frame: (body: ReactNode) => ReactNode;
  children: ReactNode;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const apply = (session: { user: { id: string; email?: string } } | null) => {
      if (!session) {
        if (alive) setState((s) => (s.kind === 'recovery' ? s : { kind: 'signed_out' }));
        return;
      }
      resolve(session.user.id, session.user.email ?? '', app).then(
        (s) => alive && setState((prev) => (prev.kind === 'recovery' ? prev : s)),
        () => alive && setFailure('FocusiQ could not check your access. Please try again in a moment.'),
      );
    };
    db().auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = db().auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setState({ kind: 'recovery' });
      else apply(session);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [app]);

  if (state.kind === 'signed_in') return <AuthContext.Provider value={state.who}>{children}</AuthContext.Provider>;
  if (failure) return <>{frame(<p className="field-error" role="alert">{failure}</p>)}</>;
  if (state.kind === 'loading') return <>{frame(<p className="landing-note" aria-busy="true">Checking your sign-in…</p>)}</>;
  if (state.kind === 'recovery') return <>{frame(<NewPassword onDone={() => setState({ kind: 'loading' })} />)}</>;
  if (state.kind === 'no_access') {
    return (
      <>
        {frame(
          <div className="auth-message">
            <p>
              {state.reason === 'not_director'
                ? 'This is the FocusiQ Director dashboard. Your account does not have Director access.'
                : 'Your Walter Geering account has not been added to FocusiQ yet.'}
            </p>
            <p className="small muted">
              {state.reason === 'not_director'
                ? 'To take your own assessment, use the FocusiQ link in your invitation email.'
                : 'If you were expecting to take part, please speak to a Director.'}
            </p>
            <button className="btn secondary" onClick={signOut}>Sign out</button>
          </div>,
        )}
      </>
    );
  }
  return <>{frame(<SignInForm notice={state.notice} />)}</>;
}

function SignInForm({ notice }: { notice?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'link' | 'reset'>('password');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(notice ?? null);
  const here = window.location.origin + window.location.pathname;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return setError('Enter your work email address.');
    setBusy(true);
    try {
      if (mode === 'password') {
        if (!password) return setError('Enter your password.');
        const { error: err } = await db().auth.signInWithPassword({ email: email.trim(), password });
        if (err) setError('That email address and password were not recognised. Use the same details as for the Hub.');
      } else if (mode === 'link') {
        const { error: err } = await db().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: here } });
        // Same message either way, so the form does not reveal who has an account.
        if (err && !/signups not allowed|not found/i.test(err.message)) setError('The sign-in link could not be sent. Please try again in a moment.');
        else setSent('If that address has a Walter Geering account, a sign-in link is on its way. Open it on this device.');
      } else {
        const { error: err } = await db().auth.resetPasswordForEmail(email.trim(), { redirectTo: here });
        if (err) setError('The reset email could not be sent. Please try again in a moment.');
        else setSent('If that address has a Walter Geering account, an email to reset your password is on its way.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      {sent && <p className="tag-green auth-sent" role="status">{sent}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="field">
        <label htmlFor="auth-email">Work email</label>
        <input id="auth-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {mode === 'password' && (
        <div className="field">
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      )}
      <button className="btn" type="submit" disabled={busy}>
        {mode === 'password' ? 'Sign in' : mode === 'link' ? 'Email me a sign-in link' : 'Email me a reset link'} <span aria-hidden="true">→</span>
      </button>
      <p className="small muted auth-hint">Use the same email and password as for the Walter Geering Hub.</p>
      <div className="auth-links">
        {mode !== 'password' && <button type="button" className="btn link" onClick={() => { setMode('password'); setSent(null); }}>Sign in with a password</button>}
        {mode !== 'link' && <button type="button" className="btn link" onClick={() => { setMode('link'); setSent(null); }}>Email me a sign-in link instead</button>}
        {mode !== 'reset' && <button type="button" className="btn link" onClick={() => { setMode('reset'); setSent(null); }}>Forgotten your password?</button>}
      </div>
    </form>
  );
}

function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== again) return setError('The two passwords do not match.');
    setBusy(true);
    const { error: err } = await db().auth.updateUser({ password });
    setBusy(false);
    if (err) return setError('Your password could not be changed. Please request a new reset email.');
    onDone();
  };
  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <p>Choose a new password. It is also your password for the Hub and the other Walter Geering apps.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="field">
        <label htmlFor="new-password">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="new-password-2">New password again</label>
        <input id="new-password-2" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={busy}>Save password</button>
    </form>
  );
}
