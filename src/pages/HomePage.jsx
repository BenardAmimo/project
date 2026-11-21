function HomePage({ user }) {
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.name || user?.username || user?.email || 'User';

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>School Dashboard</h2>
        </div>
      </div>

      <div className="info-card">
        <h3>Welcome back</h3>
        <p>{fullName}</p>
        <p>Your current role is {user?.role || 'not available'}.</p>
        <p>Use the sidebar to access pages once your backend provides the data.</p>
      </div>
    </div>
  );
}

export default HomePage;