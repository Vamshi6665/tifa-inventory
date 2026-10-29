import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { IconBrandGoogleFilled, IconShieldCheck, IconUser, IconEye } from '@tabler/icons-react';
import { Button, TextField } from '@/design-system';
import { useData } from '@/data/DataProvider';
import { DataError } from '@/data/source';
import { DEMO_PEOPLE } from '@/data/demo/seed';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/domain/permissions';
import { useAuth } from './AuthProvider';
import { Logo } from '@/app/shell/Logo';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  const data = useData();
  const { status } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const isDemo = data.kind === 'demo';

  if (status === 'signed-in') return <Navigate to={from} replace />;

  async function attempt(kind: string, fn: () => Promise<void>) {
    setError(null);
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof DataError ? e.message : 'Couldn’t sign in. Try again.');
    } finally {
      setBusy(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    void attempt('password', () => data.signInWithPassword(email, password));
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <Logo size={40} />
        <h1 className={styles.title}>Sign in to Tifa Inventory</h1>
        <p className={styles.lead}>{isDemo ? 'This is a demo with sample data. Choose a role to see what each person can do.' : 'Counts, reorders and deliveries for the shop.'}</p>

        {isDemo ? (
          <ul role="list" className={styles.roles}>
            {DEMO_PEOPLE.filter((p) => !p.pending).filter((p, i, arr) => arr.findIndex((q) => q.role === p.role) === i).map((p) => (
              <li key={p.user_id}>
                <button type="button" className={styles.role} onClick={() => void attempt(p.user_id, () => data.signInWithPassword(p.email, 'demo'))} disabled={!!busy} aria-busy={busy === p.user_id || undefined}>
                  <span className={styles.roleIcon} aria-hidden="true">
                    {p.role === 'admin' ? <IconShieldCheck /> : p.role === 'staff' ? <IconUser /> : <IconEye />}
                  </span>
                  <span className={styles.roleText}>
                    <span className={styles.roleName}>
                      Continue as {ROLE_LABEL[p.role]} <span className={styles.roleWho}>({p.display_name})</span>
                    </span>
                    <span className={styles.roleDesc}>{ROLE_DESCRIPTION[p.role]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <Button variant="secondary" size="lg" block icon={<IconBrandGoogleFilled />} loading={busy === 'google'} onClick={() => void attempt('google', () => data.signInWithGoogle())}>
              Continue with Google
            </Button>
            <div className={styles.divider}>
              <span>or use email</span>
            </div>
            <form onSubmit={onSubmit} className={styles.form} noValidate>
              <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <Button type="submit" variant="primary" size="lg" block loading={busy === 'password'}>
                Sign in
              </Button>
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  if (!email.trim()) return setError('Enter your email first, then choose “Forgot password”.');
                  void attempt('reset', async () => {
                    await data.sendPasswordReset(email);
                    setResetSent(true);
                  });
                }}
              >
                Forgot password?
              </button>
            </form>
          </>
        )}

        <div aria-live="polite" className={styles.live}>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {resetSent && !error && <p className={styles.notice}>If that email has an account, a reset link is on its way.</p>}
        </div>
      </div>
      <p className={styles.footer}>Tifa Chocolate &amp; Gelato</p>
    </main>
  );
}
