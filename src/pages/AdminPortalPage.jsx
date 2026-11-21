import { useMemo, useState, useEffect } from 'react';
import Modal from '../components/Modal';
import CollapsibleSection from '../components/CollapsibleSection';
import { inviteUser, getUsers } from '../api';

function AdminPortalPage() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', role: 'Admin', enabled: false });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [warning, setWarning] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getUsers()
      .then((res) => {
        if (!mounted) return;
        const list = res.data.users || res.data.data || res.data || [];
        const normalized = Array.isArray(list) ? list : [];
        // keep only admin users
        const admins = normalized.filter((u) => {
          const r = (u.role || (Array.isArray(u.roles) ? u.roles[0] : u.roles) || u.roleName || '').toString().toLowerCase();
          return r.includes('admin');
        });
        setUsers(admins);
      })
      .catch(() => {
        setError('Could not load users from backend.');
        setUsers([]);
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((user) => [
      `${user.firstName || ''} ${user.lastName || ''}`,
      user.email,
      user.role,
      user.status,
    ].join(' ').toLowerCase().includes(q));
  }, [search, users]);

  const handleInvite = async (e) => {
    e.preventDefault();
    setSending(true);
    setError('');
    setSuccess('');
    setWarning('');

    try {
      await inviteUser(form);
      setModalOpen(false);
      setForm({ firstName: '', lastName: '', email: '', role: 'Admin' });
      setSuccess('Invitation sent. Setup instructions were emailed to the invitee.');
      try {
        const refreshed = await getUsers();
        const list = refreshed.data.users || refreshed.data.data || refreshed.data || [];
        if (Array.isArray(list)) {
          setUsers(list.filter((user) => {
            const role = (user.role || (Array.isArray(user.roles) ? user.roles[0] : user.roles) || user.roleName || '').toString().toLowerCase();
            return role.includes('admin');
          }));
        }
      } catch (refreshError) {
        console.error('Admin invitation was sent, but the user roster could not be refreshed', refreshError);
        setWarning('Invitation sent. The admin roster could not be refreshed; do not send another invite. Refresh the page to check the latest status.');
      }
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Could not send invite';
      if (err.inviteStatusUnknown) {
        setModalOpen(false);
        setForm({ firstName: '', lastName: '', email: '', role: 'Admin', enabled: false });
        setWarning(`Could not confirm whether the invitation was sent to ${form.email}. Check the admin roster and email before trying again.`);
      } else {
        setError(message);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Admin Portal</p>
          <h2>Manage Admins</h2>
        </div>
        <button onClick={() => { setError(''); setSuccess(''); setWarning(''); setModalOpen(true); }}>Invite Admin</button>
      </div>

      <div className="toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search admins" />
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}
      {warning && <div role="status" style={{ color: '#92400e', background: '#fef3c7', padding: '0.75rem', borderRadius: 6 }}>{warning}</div>}

      <CollapsibleSection title="Admin roster" subtitle="Expand to view all invited admins" defaultOpen>
        <div className="table-card table-collapse">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>{`${user.firstName || ''} ${user.lastName || ''}`.trim()}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td><span className="status-pill">{user.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      <Modal isOpen={modalOpen} title="Invite New Admin" onClose={() => setModalOpen(false)}>
        <form className="modal-form" onSubmit={handleInvite}>
          <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="First name" required />
          <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Last name" required />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email" required />
          <input value={form.role} readOnly />
          <label className="checkbox-field">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Enable account immediately
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" disabled={sending}>{sending ? 'Sending...' : 'Send Invite'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default AdminPortalPage;
