import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setupPassword, checkInvite } from '../api';

const USERNAME_RE = /^[A-Za-z0-9._-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

// Invite links look like /setup-password#code=<token>. The fragment is never sent to a
// server or written to access logs. ?code= is accepted only so older links keep working.
function readCodeFromUrl() {
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('code');
  if (fromHash) return fromHash;
  const query = new URLSearchParams(window.location.search);
  return query.get('code') || query.get('token') || '';
}

function SetupPasswordPage() {
  const navigate = useNavigate();
  // Read once during the first render, so React StrictMode's double effect cannot lose it.
  const [code] = useState(readCodeFromUrl);
  const [status, setStatus] = useState(code ? 'checking' : 'invalid'); // checking | valid | invalid
  const [form, setForm] = useState({ username: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Remove the token from the address bar and browser history.
  useEffect(() => {
    if (window.location.hash || window.location.search) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // Ask the server whether the link is still usable (read-only, does not consume it).
  useEffect(() => {
    if (!code) return undefined;
    let cancelled = false;
    checkInvite(code)
      .then((res) => {
        if (!cancelled) setStatus(res.data?.valid ? 'valid' : 'invalid');
      })
      .catch(() => {
        // Network or server problem: show the form and let the real submit report errors.
        if (!cancelled) setStatus('valid');
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const username = form.username.trim();

    const validUsername = USERNAME_RE.test(username) || (username.length <= 254 && EMAIL_RE.test(username));
    if (!validUsername) {
      setError('Enter a username with 3-30 letters, digits, dots, dashes or underscores, or a valid email address.');
      return;
    }
    if (form.password.length < PASSWORD_MIN || form.password.length > PASSWORD_MAX) {
      setError(`Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters.`);
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await setupPassword({ code, username, password: form.password });
      setSuccess('Account setup complete. Redirecting to login...');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Could not complete setup.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-grid">
        <section className="auth-panel">
          <div>
            <h1>Join Your School</h1>
            <p>Complete your invite with a secure password and start using the portal.</p>
          </div>
          <div>
            <ul>
              <li>Pick a username that’s easy to remember</li>
              <li>Choose a secure password</li>
              <li>Log in straight away</li>
            </ul>
          </div>
          <div>
            <p className="muted">If you already have access, use the login page instead.</p>
          </div>
        </section>

        <div className="auth-card">
          {status === 'checking' && (
            <>
              <h2>Checking your invite...</h2>
              <p>One moment.</p>
            </>
          )}

          {status === 'invalid' && (
            <>
              <h2>Invite link not valid</h2>
              <p>
                This invite link is invalid, has already been used, or has expired. Ask your
                administrator to send you a new one.
              </p>
              <div className="form-footer">
                <p>
                  Already set up? <a href="/login">Log in here</a>
                </p>
              </div>
            </>
          )}

          {status === 'valid' && (
            <>
              <h2>Join Account</h2>
              <p>Choose your username and password to activate your account.</p>
              <form onSubmit={handleSubmit}>
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="Username or email"
                  autoComplete="username"
                  maxLength={254}
                  required
                />
                <div className="password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Password"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="password-field">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    placeholder="Confirm Password"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                    aria-pressed={showConfirmPassword}
                    onClick={() => setShowConfirmPassword((value) => !value)}
                  >
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {error && <div className="error">{error}</div>}
                {success && <div className="success">{success}</div>}
                <button className="primary-button" disabled={loading || !!success}>
                  {loading ? 'Saving...' : 'Join Account'}
                </button>
              </form>
              <div className="form-footer">
                <p>
                  Already have an account? <a href="/login">Log in here</a>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default SetupPasswordPage;