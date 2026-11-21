 import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/home', label: 'Overview', roles: ['Super Admin', 'Admin', 'Teacher', 'Parent', 'Staff'] },
  { to: '/home/admin', label: 'Admin Portal', roles: ['Super Admin'] },
  { to: '/home/students', label: 'Students', roles: ['Super Admin', 'Admin'] },
  { to: '/home/parents', label: 'Parents', roles: ['Super Admin', 'Admin'] },
  { to: '/home/teachers', label: 'Teachers', roles: ['Super Admin', 'Admin'] },
  { to: '/home/classes', label: 'Classes', roles: ['Super Admin', 'Admin'] },
  { to: '/home/subjects', label: 'Subjects', roles: ['Super Admin', 'Admin'] },
  { to: '/home/terms', label: 'Terms', roles: ['Super Admin', 'Admin'] },
  { to: '/home/assignments', label: 'Assignments', roles: ['Super Admin', 'Admin'] },
  { to: '/home/attendance', label: 'Attendance', roles: ['Super Admin', 'Admin', 'Teacher'] },
  { to: '/home/timetable', label: 'Timetable', roles: ['Super Admin', 'Admin', 'Teacher'] },
  { to: '/home/exams', label: 'Exams', roles: ['Super Admin', 'Admin', 'Teacher'] },
  { to: '/home/exam-periods', label: 'Exam Periods', roles: ['Super Admin', 'Admin'] },
  { to: '/home/exam-results', label: 'Exam Results', roles: ['Super Admin', 'Admin', 'Teacher'] },
  { to: '/home/reports', label: 'Reports', roles: ['Super Admin', 'Admin', 'Teacher'] },
  { to: '/home/finance', label: 'Finance', roles: ['Super Admin', 'Admin'] },
  { to: '/home/pay-fees', label: 'Pay Fees', roles: ['Super Admin', 'Admin', 'Parent'] },
  { to: '/home/profile', label: 'Profile', roles: ['Super Admin', 'Admin', 'Teacher', 'Parent', 'Staff'] },
  { to: '/home/my-classes', label: 'My Classes', roles: ['Teacher'] },
  { to: '/home/funds', label: 'Funds', roles: ['Super Admin', 'Admin'] },
  { to: '/home/my-child', label: 'My Child', roles: ['Parent'] },
  { to: '/home/school-dates', label: 'Term & Exam Dates', roles: ['Parent'] },
  { to: '/home/support-staff', label: 'Support Staff', roles: ['Super Admin', 'Admin'] },
  { to: '/home/money', label: 'Money out', roles: ['Super Admin', 'Admin', 'Bursar', 'Teacher', 'Staff', 'Parent'] },
];

const normalizeRole = (value) => {
  if (!value) return '';
  if (Array.isArray(value)) return normalizeRole(value[0]);
  if (typeof value === 'object') {
    if (value.name) return normalizeRole(value.name);
    if (value.role) return normalizeRole(value.role);
    return '';
  }
  let normalized = value.toString().trim().toUpperCase();
  if (normalized.startsWith('ROLE_')) normalized = normalized.slice(5);
  if (normalized === 'SUPERADMIN') normalized = 'SUPER_ADMIN';
  normalized = normalized.replace(/_/g, ' ');
  return normalized
    .split(' ')
    .map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const getUserRole = (user) => {
  if (!user) return '';
  if (user.role) return normalizeRole(user.role);
  if (user.roles) return normalizeRole(user.roles);
  return '';
};

function Layout({ user, onLogout }) {
  const normalizedRole = getUserRole(user);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navLinks = links.filter((link) => link.roles.includes(normalizedRole));

  return (
    <div className="app-shell">
      <button
        type="button"
        className="mobile-menu-toggle"
        onClick={() => setMobileMenuOpen((value) => !value)}
        aria-label="Toggle navigation menu"
      >
        {mobileMenuOpen ? '✕' : '☰'}
      </button>

      <div
        className={`sidebar-backdrop${mobileMenuOpen ? ' visible' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      <aside className={`sidebar${mobileMenuOpen ? ' mobile-open' : ''}`}>
        <div>
          <h2>EduFlow</h2>
          <p className="muted">School Management</p>
        </div>
        <nav>
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={onLogout}>Logout</button>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">{normalizedRole}</p>
            <h1>Welcome back, {`${user?.firstName || user?.name || user?.email || user?.username} ${user?.lastName || ''}`.trim()}</h1>
          </div>
          <div className="topbar-actions">
            <span className="pill">{user?.school || 'Bright Future School'}</span>
          </div>
        </header>

        <div className="content-area">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default Layout;