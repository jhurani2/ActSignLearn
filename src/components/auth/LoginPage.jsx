import { useMemo, useState } from 'react';
import { LAUNCH_BRAND } from '../../data/decks';

export default function LoginPage({ onSubmit, loading }) {
  const [mode, setMode] = useState('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const title = useMemo(() => (mode === 'signin' ? 'Welcome Back' : 'Join The Reef'), [mode]);
  const eyebrow = useMemo(
    () => (mode === 'signin' ? `${LAUNCH_BRAND} | Underwater Academy` : `${LAUNCH_BRAND} | Join the Reef`),
    [mode]
  );
  const subtitle = useMemo(
    () => (
      mode === 'signin'
        ? 'Sign in to continue your ASL journey with playful practice and progress tracking.'
        : 'Create a learner profile so ASL can remember your academy progress.'
    ),
    [mode]
  );

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    const cleanUser = username.trim();
    if (cleanUser.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords must match.');
      return;
    }

    try {
      await onSubmit({
        mode,
        username: cleanUser,
        password,
        avatar: 'otter',
      });
    } catch (submitError) {
      setError(submitError.message || 'Unable to continue right now.');
    }
  };

  return (
    <main className="screen-wrap">
      <section className="auth-card card-shell" aria-labelledby="auth-title">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="auth-title" className="page-title">{title}</h1>
        <p className="page-subtitle">{subtitle}</p>

        <div className="auth-mode" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className={`tab-btn ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => setMode('signin')}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={`tab-btn ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => setMode('signup')}
          >
            Create Account
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="username" className="input-label">Username</label>
          <input
            id="username"
            className="text-input"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="asl_learner"
            required
          />

          <label htmlFor="password" className="input-label">Password</label>
          <input
            id="password"
            className="text-input"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 6 characters"
            required
          />

          {mode === 'signup' ? (
            <>
              <label htmlFor="confirm-password" className="input-label">Re-enter Password</label>
              <input
                id="confirm-password"
                className="text-input"
                autoComplete="new-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Type it once more"
                required
              />
            </>
          ) : null}

          {error ? (
            <p className="form-error" role="status" aria-live="polite">{error}</p>
          ) : null}

          <button className="primary-btn form-submit" type="submit" disabled={loading}>
            {loading ? 'Loading...' : mode === 'signin' ? 'Dive In' : 'Create & Dive In'}
          </button>
        </form>
      </section>
    </main>
  );
}
