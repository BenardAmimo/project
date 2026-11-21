import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api';

function LoginPage({ onLoginSuccess }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();

  const extractUserFromPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.user || payload.profile || payload.data?.user || payload.data?.profile) {
      return payload.user || payload.profile || payload.data?.user || payload.data?.profile;
    }
    if (payload.data && typeof payload.data === 'object') {
      const nested = extractUserFromPayload(payload.data);
      if (nested) return nested;
    }
    const { email, username, userName, name, firstName, lastName, role, roles } = payload;
    if (email || username || name || firstName || lastName || role || roles) {
      return {
        email,
        username: username || userName,
        name,
        firstName,
        lastName,
        role,
        roles,
      };
    }
    return null;
  };

  const getLandingPage = (role) => {
    const normalized = role?.toString().trim().toUpperCase().replace(/^ROLE_/, '').replace(/\s+/g, '_');
    if (['SUPER_ADMIN', 'ADMIN'].includes(normalized)) return '/home/admin';
    if (normalized === 'TEACHER') return '/home/my-classes';
    if (normalized === 'STUDENT') return '/home/exams';
    return '/home';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await login(form);
      const payload = res?.data || {};
      const userData = extractUserFromPayload(payload) || { email: form.email };
      const token = payload.token || payload.accessToken || payload.jwt || payload.data?.token || payload.data?.accessToken || payload.data?.jwt || null;

      if (!token) {
        setError('Login succeeded but no token was returned by the backend.');
        setLoading(false);
        return;
      }

      onLoginSuccess({ token, user: userData });
      navigate(getLandingPage(userData.role || userData.roles?.[0] || ''));
    } catch (err) {
      const isNetworkError = !err.response;
      const backendUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8084';
      setError(
        isNetworkError
          ? `Cannot reach backend at ${backendUrl}/login. Is your backend server running?`
          : err.response?.data?.message || err.message || 'Login failed'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-grid">
        <section className="auth-panel">
          <div>
            <h1>Welcome back</h1>
            <p>Secure login for your school portal — fast, clean, and ready for your backend.</p>
          </div>
          <div>
            <ul>
              <li>Access dashboards for admin, teachers, and students</li>
              <li>Built for invite-based registration</li>
              <li>Responsive, modern UI with smooth hover interactions</li>
            </ul>
          </div>
          <div>
            <p className="muted">Need help? Use your invited email and password, or join with your invite code.</p>
          </div>
        </section>

        <div className="auth-card">
          <h2>Login</h2>
          <p>Sign in with your backend email and password.</p>
          <form onSubmit={handleSubmit}>
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Email"
              required
            />
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Password"
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
            {error && <div className="error">{error}</div>}
            <button className="primary-button" disabled={loading}>{loading ? 'Signing in...' : 'Login'}</button>
          </form>
          <div className="form-footer">
            <p>
              Invited but don’t have a password yet? <a href="/join">Join with your invite code</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;