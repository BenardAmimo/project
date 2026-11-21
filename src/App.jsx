import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import LoginPage from './pages/LoginPage';
import SetupPasswordPage from './pages/SetupPasswordPage';
import Layout from './components/Layout';
import { setAuthToken } from './api';
import HomePage from './pages/HomePage';
import StudentsPage from './pages/StudentsPage';
import ParentsPage from './pages/ParentsPage';
import TeachersPage from './pages/TeachersPage';
import ClassesPage from './pages/ClassesPage';
import SubjectPage from './pages/SubjectPage';
import TermPage from './pages/TermPage';
import AssignmentPage from './pages/AssignmentPage';
import AttendancePage from './pages/AttendancePage';
import ExamsPage from './pages/ExamsPage';
import FinancePage from './pages/FinancePage';
import ProfilePage from './pages/ProfilePage';
import AdminPortalPage from './pages/AdminPortalPage';
import PayFeesPage from './pages/PayFeesPage';
import MyClassesPage from './pages/MyClassesPage';
import FundsPage from './pages/FundsPage';
import MyChildPage from './pages/MyChildPage';
import ParentDatesPage from './pages/ParentDatesPage';
import SupportStaffPage from './pages/SupportStaffPage';
import TimeTablePage from './pages/TimeTablePage';
import ExamPeriodsPage from './pages/ExamPeriodsPage';
import ReportsPage from './pages/ReportsPage';
import ExamResultsPage from './pages/ExamResultsPage';
import MoneyOutRoute from './pages/MoneyOutRoute';

setAuthToken(sessionStorage.getItem('token'));

function ProtectedRoute({ children }) {
  const token = sessionStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
}

const normalizeRoleFromBackend = (role) => {
  if (!role) return role;
  if (Array.isArray(role)) return normalizeRoleFromBackend(role[0]);
  if (typeof role === 'object') {
    if (role.name) return normalizeRoleFromBackend(role.name);
    if (role.role) return normalizeRoleFromBackend(role.role);
    return '';
  }

  let value = role.toString().trim().toUpperCase();
  if (value.startsWith('ROLE_')) value = value.slice(5);
  if (['SUPER_ADMIN', 'SUPER ADMIN', 'SUPERADMIN'].includes(value)) return 'Super Admin';
  if (['ADMIN'].includes(value)) return 'Admin';
  if (['TEACHER'].includes(value)) return 'Teacher';
  if (['PARENT'].includes(value)) return 'Parent';
  if (['STAFF', 'SUPPORT_STAFF'].includes(value)) return 'Staff';

  return value
    .replace(/ROLE_/g, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const normalizeUserRole = (user) => {
  if (!user) return user;
  const normalizedRole = normalizeRoleFromBackend(user.role || user.roles || user.roleName);
  return { ...user, role: normalizedRole || user.role || (Array.isArray(user.roles) ? user.roles[0] : user.roles) };
};

const extractUserFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;

  if (payload.user || payload.profile || payload.data?.user || payload.data?.profile) {
    const candidate = payload.user || payload.profile || payload.data?.user || payload.data?.profile;
    return { ...candidate };
  }

  if (payload.data && typeof payload.data === 'object') {
    const nested = extractUserFromPayload(payload.data);
    if (nested) return nested;
  }

  // Use root-level fields if response is already a user record
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

function RoleRoute({ allowedRoles = [], user, children }) {
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles.length === 0) return children;
  const normalizedRole = normalizeRoleFromBackend(user.role || user.roles || user.roleName);
  const allowed = allowedRoles.some((role) => normalizeRoleFromBackend(role) === normalizedRole);
  // FIX: send unauthorized users to /home, not "/" (which bounced them to the login page)
  return allowed ? children : <Navigate to="/home" replace />;
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    const token = sessionStorage.getItem('token');
    const storedUser = sessionStorage.getItem('user');

    if (token && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser && typeof parsedUser === 'object') {
          setUser(normalizeUserRole(parsedUser));
          setLoading(false);
          return;
        }
      } catch {
        // Clear invalid persisted auth data below.
      }
    }

    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setAuthToken(null);
    setLoading(false);
  }, []);

  const handleLoginSuccess = (data) => {
    sessionStorage.setItem('token', data.token);
    setAuthToken(data.token);
    const userData = data.user || data;
    const fallbackUser = extractUserFromPayload(userData) || { email: data.email || data.user?.email || '' };
    const normalizedUser = normalizeUserRole(fallbackUser);
    sessionStorage.setItem('user', JSON.stringify(normalizedUser));
    setUser(normalizedUser);
  };

  if (loading) return <div className="page">Loading...</div>;

  return (
    <BrowserRouter>
      <Routes>
        {/* FIX: logged-in users go to /home, everyone else to /login */}
        <Route path="/" element={<Navigate to={user ? '/home' : '/login'} replace />} />
        {/* FIX: a logged-in user visiting /login is sent to /home */}
        <Route
          path="/login"
          element={user ? <Navigate to="/home" replace /> : <LoginPage onLoginSuccess={handleLoginSuccess} />}
        />
        {/* Invite links from email land here: /setup-password#code=<token> */}
        <Route path="/setup-password" element={<SetupPasswordPage />} />
        <Route path="/join" element={<SetupPasswordPage />} />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <Layout
                user={user}
                onLogout={() => {
                  sessionStorage.removeItem('token');
                  sessionStorage.removeItem('user');
                  setAuthToken(null);
                  setUser(null);
                }}
              />
            </ProtectedRoute>
          }
        >
          <Route index element={<HomePage user={user} />} />
          <Route path="admin" element={<RoleRoute allowedRoles={['Super Admin']} user={user}><AdminPortalPage /></RoleRoute>} />
          <Route path="students" element={<RoleRoute allowedRoles={['Super Admin', 'Admin', 'Teacher']} user={user}><StudentsPage /></RoleRoute>} />
          <Route path="parents" element={<RoleRoute allowedRoles={['Super Admin', 'Admin']} user={user}><ParentsPage /></RoleRoute>} />
          <Route path="teachers" element={<RoleRoute allowedRoles={['Super Admin', 'Admin']} user={user}><TeachersPage /></RoleRoute>} />
          <Route path="classes" element={<RoleRoute allowedRoles={['Super Admin', 'Admin', 'Teacher']} user={user}><ClassesPage /></RoleRoute>} />
          <Route path="subjects" element={<RoleRoute allowedRoles={['Super Admin', 'Admin']} user={user}><SubjectPage /></RoleRoute>} />
          <Route path="terms" element={<RoleRoute allowedRoles={['Super Admin', 'Admin']} user={user}><TermPage /></RoleRoute>} />
          <Route path="assignments" element={<RoleRoute allowedRoles={['Super Admin', 'Admin']} user={user}><AssignmentPage /></RoleRoute>} />
          <Route path="attendance" element={<RoleRoute allowedRoles={['Super Admin', 'Admin', 'Teacher']} user={user}><AttendancePage /></RoleRoute>} />
          <Route path="timetable" element={<RoleRoute allowedRoles={['Super Admin', 'Admin', 'Teacher']} user={user}><TimeTablePage /></RoleRoute>} />
          <Route path="exams" element={<RoleRoute allowedRoles={['Super Admin', 'Admin', 'Teacher']} user={user}><ExamsPage user={user} /></RoleRoute>} />
          <Route path="exam-periods" element={<RoleRoute allowedRoles={['Super Admin', 'Admin']} user={user}><ExamPeriodsPage /></RoleRoute>} />
          <Route path="exam-results" element={<RoleRoute allowedRoles={['Super Admin', 'Admin', 'Teacher']} user={user}><ExamResultsPage /></RoleRoute>} />
          <Route path="reports" element={<RoleRoute allowedRoles={['Super Admin', 'Admin', 'Teacher']} user={user}><ReportsPage /></RoleRoute>} />
          <Route path="finance" element={<RoleRoute allowedRoles={['Super Admin', 'Admin']} user={user}><FinancePage /></RoleRoute>} />
          <Route path="profile" element={<RoleRoute user={user}><ProfilePage user={user} /></RoleRoute>} />
          <Route path="pay-fees" element={<RoleRoute allowedRoles={['Super Admin', 'Admin', 'Parent']} user={user}><PayFeesPage user={user} /></RoleRoute>} />
          <Route path="my-classes" element={<RoleRoute allowedRoles={['Teacher']} user={user}><MyClassesPage /></RoleRoute>} />
          <Route path="my-child" element={<RoleRoute allowedRoles={['Parent']} user={user}><MyChildPage /></RoleRoute>} />
          <Route path="school-dates" element={<RoleRoute allowedRoles={['Parent']} user={user}><ParentDatesPage /></RoleRoute>} />
          <Route path="funds" element={<RoleRoute allowedRoles={['Super Admin', 'Admin']} user={user}><FundsPage /></RoleRoute>} />
          <Route path="support-staff" element={<RoleRoute allowedRoles={['Super Admin', 'Admin']} user={user}><SupportStaffPage /></RoleRoute>} />
          <Route path="money" element={<MoneyOutRoute />} />
        </Route>
        <Route path="*" element={<Navigate to={user ? '/home' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;