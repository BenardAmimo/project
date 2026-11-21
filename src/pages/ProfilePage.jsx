import { useEffect, useState } from 'react';

const readStoredUser = () => {
  try {
    const raw = sessionStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

// Merge two objects, but only let `override` values replace `base` values
// when they are actually defined (not null/undefined). This stops a
// propUser that hasn't loaded a field yet (e.g. email: null) from
// wiping out a good value that was already stored in this tab.
const mergeDefined = (base, override) => {
  const result = { ...(base || {}) };
  for (const key of Object.keys(override || {})) {
    const val = override[key];
    if (val !== undefined && val !== null) {
      result[key] = val;
    }
  }
  return result;
};

const normalizeRole = (value) => {
  if (!value) return '';
  if (Array.isArray(value)) return normalizeRole(value[0]);
  if (typeof value === 'object') {
    if (value.name) return normalizeRole(value.name);
    if (value.role) return normalizeRole(value.role);
    return '';
  }
  let v = value.toString().trim().toUpperCase();
  if (v.startsWith('ROLE_')) v = v.slice(5);
  v = v.replace(/_/g, ' ');
  return v
    .split(' ')
    .map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

function ProfilePage({ user: propUser }) {
  const [user, setUser] = useState(() => mergeDefined(readStoredUser(), propUser));

  useEffect(() => {
    const stored = readStoredUser();
    setUser(mergeDefined(stored, propUser));
  }, [propUser]);

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.name || user?.username || 'User';

  const findEmail = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    // check common fields first
    const candidates = ['email', 'emailAddress', 'contactEmail', 'username', 'userName', 'contact'];
    for (const key of candidates) {
      if (key in obj && obj[key]) {
        const val = obj[key];
        if (typeof val === 'string' && emailRegex.test(val)) return val;
        if (typeof val === 'object') {
          const nested = findEmail(val);
          if (nested) return nested;
        }
      }
    }
    // shallow search other string fields
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === 'string' && emailRegex.test(v)) return v;
    }
    // deep search
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === 'object') {
        const nested = findEmail(v);
        if (nested) return nested;
      }
    }
    return null;
  };

  const email = findEmail(user) || findEmail(propUser) || 'No email provided';
  const role = normalizeRole(user?.role || user?.roles || user?.roleName) || 'No role assigned';

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h2>Profile</h2>
        </div>
      </div>
      <div className="info-card">
        <h3>Personal Information</h3>
        <p>Name: {fullName}</p>
        <p>Email: {email}</p>
        <p>Role: {role}</p>
        {user?.username && <p>Username: {user.username}</p>}
        {user?.school && <p>School: {user.school}</p>}
        {user?.phone && (
          <p>
            <strong>Phone:</strong>{' '}
            <a href={`tel:${(user.phone || '').replace(/\D/g, '')}`}>
              {user.phone}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

export default ProfilePage;