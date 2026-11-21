import { useMemo, useState, useEffect } from 'react';
import Modal from '../components/Modal';
import CollapsibleSection from '../components/CollapsibleSection';
import { getParents, getUsers, createParent, updateParent, deleteParent, resendInvite } from '../api';
import { isAccountActive } from '../accountStatus';

const emptyForm = { firstName: '', lastName: '', email: '', phoneNumber: '', gender: '', age: '' };

const getList = (data, key) => {
  const candidates = [data?.[key], data?.data?.[key], data?.data, data?.[key]?.data, data];
  return candidates.find(Array.isArray) || [];
};

const normalizeEmail = (email) => (email || '').trim().toLowerCase();
const invitedEmailFromNotice = (message) => {
  const match = message.match(/(?:Invite sent to|A new invite was sent to)\s+([^\s]+)/i);
  return match ? normalizeEmail(match[1].replace(/[.,;!?]+$/, '')) : '';
};

// Turns the backend list into what the page displays.
const normalizeParents = (raw, usersByEmail = new Map()) =>
  (raw || []).map((p) => {
    // gender: handle multiple possible backend field names
    const genderCandidates = [p?.gender, p?.sex, p?.genderType, p?.gender?.name, p?.gender?.value];
    let gender = '';
    for (const cand of genderCandidates) {
      if (cand !== undefined && cand !== null && cand !== '') { gender = cand; break; }
    }
    if (gender && typeof gender !== 'string') gender = String(gender);
    if (gender) { const lower = gender.toLowerCase(); gender = lower[0]?.toUpperCase() + lower.slice(1); }

    // age: prefer explicit age, then birthYear or date-of-birth
    let age = null;
    if (p?.age != null) age = Number(p.age);
    else if (p?.birthYear != null) age = new Date().getFullYear() - Number(p.birthYear);
    else if (p?.dob || p?.dateOfBirth) {
      const dob = new Date(p.dob || p.dateOfBirth);
      if (!Number.isNaN(dob.getTime())) {
        const diff = Date.now() - dob.getTime();
        age = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
      }
    }

    const linkedAccount = usersByEmail.get(normalizeEmail(p?.email));
    const status = [
      linkedAccount,
      p?.user,
      p?.account,
      p?.userAccount,
      p,
    ].some(isAccountActive) ? 'Active' : 'Invited';

    return { ...p, id: p.id ?? p.parentId ?? p.parent_id, gender: gender || '', age: age != null ? age : null, status };
  });

function ParentPage() {
  const [parents, setParents] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [warning, setWarning] = useState('');

  useEffect(() => {
    let mounted = true;
    let refreshing = false;
    const loadParents = async (initial = false) => {
      if (refreshing || (!initial && document.visibilityState === 'hidden')) return;
      refreshing = true;
      if (initial) setLoading(true);
      try {
        const [parentsResult, usersResult] = await Promise.allSettled([getParents(), getUsers()]);
        if (!mounted) return;
        if (parentsResult.status === 'rejected') {
          console.error('Could not refresh parent roster', parentsResult.reason);
          if (initial) {
            setError('Could not load parents from backend.');
            setParents([]);
          }
          return;
        }

        if (usersResult.status === 'rejected') {
          console.error('Could not refresh parent account statuses', usersResult.reason);
          if (initial) {
            setParents(normalizeParents(getList(parentsResult.value.data, 'parents')));
            setError('Could not refresh account statuses. Please try again later.');
          }
          return;
        }

        const users = getList(usersResult.value.data, 'users');
        const usersByEmail = new Map(
          users
            .filter((user) => user?.email)
            .map((user) => [normalizeEmail(user.email), user])
        );
        const updatedParents = normalizeParents(getList(parentsResult.value.data, 'parents'), usersByEmail);
        setParents(updatedParents);
        setNotice((currentNotice) => {
          const invitedEmail = invitedEmailFromNotice(currentNotice);
          const activationConfirmed = invitedEmail && updatedParents.some((parent) =>
            normalizeEmail(parent.email) === invitedEmail && parent.status === 'Active'
          );
          return activationConfirmed ? '' : currentNotice;
        });
        setError('');
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to refresh parent roster', err);
        if (initial) setError('Could not load parents from backend.');
      } finally {
        refreshing = false;
        if (initial && mounted) setLoading(false);
      }
    };

    loadParents(true);
    const refreshVisibleRoster = () => loadParents();
    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') loadParents();
    };
    const intervalId = window.setInterval(refreshVisibleRoster, 15000);
    window.addEventListener('focus', refreshVisibleRoster);
    document.addEventListener('visibilitychange', refreshOnVisibility);
    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshVisibleRoster);
      document.removeEventListener('visibilitychange', refreshOnVisibility);
    };
  }, []);

  const filteredParents = useMemo(() => {
    const q = search.toLowerCase();
    return parents.filter((parent) => {
      const matchesSearch = [
        `${parent.firstName || ''} ${parent.lastName || ''}`,
        parent.phoneNumber,
        parent.email,
      ].join(' ').toLowerCase().includes(q);
      const matchesFilter = filter === 'All' || parent.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [filter, search, parents]);

  const closeModal = () => {
    setForm(emptyForm);
    setEditingId(null);
    setModalOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const isEditing = editingId !== null && editingId !== undefined;
    setSubmitting(true);
    setError('');
    setNotice('');
    setWarning('');
    try {
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phoneNumber: form.phoneNumber,
        gender: form.gender,
        age: form.age ? Number(form.age) : undefined,
      };
      if (isEditing) {
        const res = await updateParent(editingId, payload);
        setParents((current) => current.map((p) => (
          String(p.id) === String(editingId)
            ? normalizeParents([{ ...p, ...res.data, id: res.data?.id ?? res.data?.parentId ?? editingId }])[0]
            : p
        )));
      } else {
        await createParent(payload);
        setNotice(`Invite sent to ${payload.email}. The link expires in 3 days.`);
        closeModal();
        const [parentsResult, usersResult] = await Promise.allSettled([getParents(), getUsers()]);
        if (parentsResult.status === 'fulfilled') {
          const users = usersResult.status === 'fulfilled' ? getList(usersResult.value.data, 'users') : [];
          const usersByEmail = new Map(users.filter((user) => user?.email)
            .map((user) => [normalizeEmail(user.email), user]));
          setParents(normalizeParents(getList(parentsResult.value.data, 'parents'), usersByEmail));
        }
        if (parentsResult.status === 'rejected' || usersResult.status === 'rejected') {
          console.error('Parent invite was sent, but the roster could not be fully refreshed', { parentsResult, usersResult });
          setWarning(`Invite sent to ${payload.email}. The roster could not be fully refreshed; do not send another invite. Refresh the page to check the latest status.`);
        }
      }
    } catch (err) {
      if (!isEditing && err.inviteStatusUnknown) {
        closeModal();
        setWarning(`Could not confirm whether the invitation was sent to ${payload.email}. Check the parent roster and email before trying again.`);
        return;
      }
      const responseData = err.response?.data;
      const responseMessage = typeof responseData === 'string'
        ? responseData
        : responseData?.message || responseData?.error || responseData?.detail;
      setError(responseMessage || (err.response?.status
        ? `Could not save parent (${err.response.status}).`
        : err.message || 'Could not save parent'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async (parent) => {
    if (!parent.email || resendingEmail) return;
    setResendingEmail(parent.email);
    setError('');
    setNotice('');
    setWarning('');
    try {
      await resendInvite(parent.email);
      setNotice(`A new invite was sent to ${parent.email}. Any earlier link no longer works.`);
    } catch (err) {
      const message = typeof err.response?.data === 'string'
        ? err.response.data
        : err.response?.data?.message || err.message || '';
      if (/already active/i.test(message)) {
        setParents((current) => current.map((item) => (
          normalizeEmail(item.email) === normalizeEmail(parent.email)
            ? { ...item, status: 'Active' }
            : item
        )));
        setNotice('This parent account is already active.');
      } else {
        setError(message || 'Could not resend invite.');
      }
    } finally {
      setResendingEmail(null);
    }
  };

  const beginEdit = (parent) => {
    setForm({
      firstName: parent.firstName || '',
      lastName: parent.lastName || '',
      email: parent.email || '',
      phoneNumber: parent.phoneNumber || '',
      gender: parent.gender || '',
      age: parent.age ?? '',
    });
    setEditingId(parent.id);
    setError('');
    setNotice('');
    setWarning('');
    setModalOpen(true);
  };

  const handleDelete = async (parentId) => {
    if (!window.confirm('Remove this parent?')) return;
    try {
      await deleteParent(parentId);
      setParents((current) => current.filter((p) => p.id !== parentId));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not remove parent.');
    }
  };

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Academics</p>
          <h2>Parents</h2>
        </div>
        <button onClick={() => { setForm(emptyForm); setEditingId(null); setError(''); setNotice(''); setWarning(''); setModalOpen(true); }}>Add Parent</button>
      </div>

      <div className="toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search parents" />
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="All">All Status</option>
          <option value="Active">Active</option>
          <option value="Invited">Invited</option>
        </select>
      </div>
      <small>Invitation statuses update automatically while this page is open.</small>

      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {notice && <p style={{ color: '#1e8449' }}>{notice}</p>}
      {warning && <p role="status" style={{ color: '#92400e', background: '#fef3c7', padding: '0.75rem', borderRadius: 6 }}>{warning}</p>}

      <CollapsibleSection title="Parent roster" subtitle="Hide or show the parent list on demand" defaultOpen>
        <div className="grid-3">
          {loading && <p>Loading parents…</p>}
          {!loading && filteredParents.length === 0 ? (
            <div className="info-card">
              <p>No parents found. Adjust search or add a new parent.</p>
            </div>
          ) : filteredParents.map((parent) => (
            <div key={parent.id} className="info-card">
              <h3>{`${parent.firstName || ''} ${parent.lastName || ''}`.trim()}</h3>
              <p><strong>First name:</strong> {parent.firstName}</p>
              <p><strong>Last name:</strong> {parent.lastName}</p>
              {parent.gender && <p><strong>Gender:</strong> {parent.gender}</p>}
              {parent.age != null && <p><strong>Age:</strong> {parent.age}</p>}
              <p>
                <strong>Email:</strong>{' '}
                {parent.email ? (
                  <a href={`mailto:${parent.email}`}>{parent.email}</a>
                ) : 'No email'}
              </p>
              <p>
                <strong>Phone:</strong>{' '}
                {parent.phoneNumber ? (
                  <a href={`tel:${(parent.phoneNumber || '').replace(/\D/g, '')}`}>{parent.phoneNumber}</a>
                ) : 'No phone'}
              </p>
              <p><strong>Status:</strong> {parent.status}</p>
              <div style={{ marginTop: '0.75rem' }}>
                <button className="secondary" onClick={() => beginEdit(parent)}>Edit</button>
                {parent.status === 'Invited' && (
                  <button
                    className="secondary"
                    onClick={() => handleResend(parent)}
                    disabled={resendingEmail === parent.email}
                    style={{ marginLeft: '0.5rem' }}
                  >
                    {resendingEmail === parent.email ? 'Sending…' : 'Resend invite'}
                  </button>
                )}
                <button className="secondary" onClick={() => handleDelete(parent.id)} style={{ marginLeft: '0.5rem' }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <Modal isOpen={modalOpen} title={editingId ? 'Edit Parent' : 'Invite New Parent'} onClose={closeModal}>
        <form className="modal-form" onSubmit={handleSubmit}>
          <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="First name" required />
          <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Last name" required />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email" required />
          <input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="Phone Number" required />
          <label>
            Gender
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <input value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="Age" type="number" min="0" />
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={closeModal}>Cancel</button>
            <button type="submit" disabled={submitting}>{submitting ? (editingId ? 'Saving…' : 'Inviting…') : (editingId ? 'Update Parent' : 'Invite Parent')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default ParentPage;