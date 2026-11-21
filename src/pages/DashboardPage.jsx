function DashboardPage({ user, onLogout }) {
  return (
    <div className="page">
      <div className="card">
        <div className="topbar">
          <h1>Dashboard</h1>
          <button onClick={onLogout}>Logout</button>
        </div>
        <p>Welcome, {`${user?.username || user?.firstName || user?.name || user?.email} ${user?.lastName || ''}`.trim() || 'User'}.</p>
        <p>Role: {user?.role || 'No role assigned'}</p>
        <p>This is your school system landing page.</p>
      </div>
    </div>
  );
}

export default DashboardPage;