import { useMemo, useState, useEffect } from 'react';
import Modal from '../components/Modal';
import CollapsibleSection from '../components/CollapsibleSection';
import { getSupportStaff, getUsers, createSupportStaff, createSupportStaffProfile, deleteSupportStaff, updateSupportStaff, resendInvite } from '../api';
import { isAccountActive } from '../accountStatus';

const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  workDone: '',
  gender: '',
  age: '',
  phoneNumber: '',
  userId: undefined,
};

const getList = (data, key) => {
  const collectionKeys = [key, 'staffs', 'supportStaff', 'users', 'content', 'items', 'data'];
  const pending = [data];
  const visited = new Set();

  while (pending.length) {
    const value = pending.shift();
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);
    collectionKeys.forEach((collectionKey) => {
      if (value[collectionKey] !== undefined) pending.push(value[collectionKey]);
    });
  }

  return [];
};

const normalizeEmail = (email) => (email || '').trim().toLowerCase();
const normalizeName = (person) =>
  `${person?.firstName || ''} ${person?.lastName || ''}`.trim().toLowerCase();

const roleNameOf = (user) => {
  const roles = [];
  const pending = [user];
  const visited = new Set();
  const roleKeys = ['role', 'roles', 'roleName', 'authorities', 'user', 'userReg', 'account', 'userAccount'];

  while (pending.length) {
    const value = pending.shift();
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    if (typeof value === 'string') {
      roles.push(value.trim().toUpperCase());
      continue;
    }
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);

    const roleValue = value.name ?? value.authority ?? value.role;
    if (typeof roleValue === 'string') roles.push(roleValue.trim().toUpperCase());
    roleKeys.forEach((key) => {
      if (value[key] !== undefined && value[key] !== value) pending.push(value[key]);
    });
  }

  return [...new Set(roles)];
};

const responseError = (error, fallback) => {
  const body = error?.response?.data;
  const message = typeof body === 'string'
    ? body
    : body?.message || body?.error || body?.detail;
  const status = error?.response?.status;
  return message || (status ? `${fallback} (HTTP ${status}).` : error?.message || fallback);
};

const normalizeStaff = (raw, usersByEmail = new Map()) =>
  raw.map((member) => {
    const linkedAccount = usersByEmail.get(normalizeEmail(member.email));
    const status = [
      linkedAccount,
      member.user,
      member.account,
      member.userAccount,
      member,
    ].some(isAccountActive) ? 'Active' : 'Invited';
    return { ...member, status };
  });

const linkStaffAccounts = (staffRecords, users) => {
  const staffUsers = users.filter((user) =>
    roleNameOf(user).some((role) => ['STAFF', 'SUPPORT_STAFF', 'ROLE_STAFF', 'ROLE_SUPPORT_STAFF'].includes(role))
  );

  return staffRecords.map((member) => {
    const byId = staffUsers.filter((user) =>
      member.userId != null
      && String(user.userId ?? user.id) === String(member.userId)
    );
    const byEmail = staffUsers.filter((user) =>
      member.email && normalizeEmail(user.email) === normalizeEmail(member.email)
    );
    const byName = staffUsers.filter((user) =>
      normalizeName(user) && normalizeName(user) === normalizeName(member)
    );
    const linkedAccount = byId[0] || byEmail[0] || (byName.length === 1 ? byName[0] : null);

    return linkedAccount
      ? { ...member, email: member.email || linkedAccount.email, user: linkedAccount }
      : member;
  });
};

const mergeStaffAndInvitedAccounts = (staffRecords, users) => {
  const linkedStaff = linkStaffAccounts(staffRecords, users);
  const matchedAccounts = new Set(
    linkedStaff.map((member) => member.user).filter(Boolean)
  );
  const invitedAccounts = users
    .filter((user) => roleNameOf(user).some((role) =>
      ['STAFF', 'SUPPORT_STAFF', 'ROLE_STAFF', 'ROLE_SUPPORT_STAFF'].includes(role)
    ))
    .filter((user) => !matchedAccounts.has(user))
    .map((user) => ({
      ...user,
      staffId: user.staffId ?? user.userId ?? user.id ?? user.email,
      email: user.email,
      user,
      inviteOnly: true,
    }));

  return [...linkedStaff, ...invitedAccounts];
};

function SupportStaffPage() {
  const [staff, setStaff] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [profileUserId, setProfileUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [warning, setWarning] = useState('');

  useEffect(() => {
    let mounted = true;
    const loadStaff = () => {
      setLoading(true);
      Promise.allSettled([getSupportStaff(), getUsers()])
        .then(([staffResult, usersResult]) => {
          if (!mounted) return;
          const users = usersResult.status === 'fulfilled' ? getList(usersResult.value.data, 'users') : [];
          const usersByEmail = new Map(
            users.filter((user) => user?.email)
              .map((user) => [normalizeEmail(user.email), user])
          );
          const staffRecords = staffResult.status === 'fulfilled'
            ? getList(staffResult.value.data, 'staff')
            : [];
          setStaff(normalizeStaff(mergeStaffAndInvitedAccounts(staffRecords, users), usersByEmail));
          if (staffResult.status === 'rejected') {
            console.error('Could not load staff records', staffResult.reason);
            setError(usersResult.status === 'fulfilled'
              ? responseError(staffResult.reason, 'Could not load staff profiles. Showing STAFF accounts only')
              : `${responseError(staffResult.reason, 'Could not load staff profiles')} ${responseError(usersResult.reason, 'Could not load STAFF accounts')}`);
          } else if (usersResult.status === 'rejected') {
            console.error('Could not refresh support staff account statuses', usersResult.reason);
            setError(responseError(usersResult.reason, 'Could not refresh account statuses. Showing staff profiles with available status information'));
          } else {
            setError('');
          }
        })
        .catch((err) => {
          if (!mounted) return;
          console.error('Failed to load support staff roster', err);
          setError(responseError(err, 'Could not process support staff response'));
        })
        .finally(() => mounted && setLoading(false));
    };

    loadStaff();
    window.addEventListener('focus', loadStaff);
    return () => {
      mounted = false;
      window.removeEventListener('focus', loadStaff);
    };
  }, []);

  const filteredStaff = useMemo(() => {
    const q = search.toLowerCase();
    return staff.filter((member) =>
      [
        `${member.firstName || ''} ${member.lastName || ''}`,
        member.email,
        member.workDone,
        member.phoneNumber,
      ]
        .join(' ').toLowerCase().includes(q)
    );
  }, [search, staff]);

  const resetForm = () => setForm(emptyForm);

  const refreshRoster = async () => {
    const [staffResult, usersResult] = await Promise.allSettled([getSupportStaff(), getUsers()]);
    const users = usersResult.status === 'fulfilled' ? getList(usersResult.value.data, 'users') : [];
    const usersByEmail = new Map(users.filter((user) => user?.email)
      .map((user) => [normalizeEmail(user.email), user]));
    const staffRecords = staffResult.status === 'fulfilled' ? getList(staffResult.value.data, 'staff') : [];
    setStaff(normalizeStaff(mergeStaffAndInvitedAccounts(staffRecords, users), usersByEmail));
    return { staffResult, usersResult };
  };

  const openCreateModal = () => {
    resetForm();
    setEditingId(null);
    setProfileUserId(null);
    setError('');
    setNotice('');
    setWarning('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setProfileUserId(null);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setNotice('');
    setWarning('');

    const payload = {
      ...form,
      email: form.email.trim(),
      workDone: form.workDone.trim(),
      age: form.age === '' ? undefined : Number(form.age),
    };

    if (!payload.workDone) {
      setError('Enter a job title before saving support staff.');
      setSubmitting(false);
      return;
    }

    try {
      if (editingId !== null) {
        const res = await updateSupportStaff(editingId, payload);
        setStaff((current) => current.map((member) => (
          String(member.staffId) === String(editingId)
            ? normalizeStaff([{ ...member, ...res.data }])[0]
            : member
        )));
      } else if (profileUserId !== null) {
        await createSupportStaffProfile(payload, profileUserId);
        const { staffResult, usersResult } = await refreshRoster();
        setNotice(`Staff profile saved for ${payload.email}.`);
        if (staffResult.status === 'rejected') {
          setError('Staff profile was saved, but the roster could not be refreshed.');
        } else if (usersResult.status === 'rejected') {
          setError('Staff profile was saved, but account activation could not be verified.');
        }
      } else {
        await createSupportStaff(payload);
        setNotice(`Invite sent to ${payload.email}. The link expires in 3 days.`);
        const { staffResult, usersResult } = await refreshRoster();
        setNotice(`Invite sent and staff profile saved for ${payload.email}.`);
        if (staffResult.status === 'rejected') {
          console.error('Invite was sent, but staff records could not be refreshed', staffResult.reason);
          setError('Invite was sent and the profile was saved, but the roster could not be refreshed.');
        } else if (usersResult.status === 'rejected') {
          console.error('Invite was sent, but account status could not be refreshed', usersResult.reason);
          setError('Invite was sent and the profile was saved, but account activation could not be verified.');
        }
      }
      resetForm();
      setModalOpen(false);
      setEditingId(null);
      setProfileUserId(null);
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Could not save support staff.';
      if (err.inviteSent) {
        const { staffResult, usersResult } = await refreshRoster();
        console.error('Invite was sent, but the support staff profile could not be completed', err);
        if (staffResult.status === 'rejected' || usersResult.status === 'rejected') {
          console.error('Could not refresh the roster after sending the invite', { staffResult, usersResult });
        }
        setWarning(`Invitation sent to ${payload.email}. The staff profile still needs attention; do not send another invite. Refresh the roster and choose “Complete profile” when this account appears.`);
        resetForm();
        setModalOpen(false);
        setEditingId(null);
        setProfileUserId(null);
      } else if (err.inviteStatusUnknown) {
        await refreshRoster();
        setWarning(`Could not confirm whether the invitation was sent to ${payload.email}. Check the staff roster and email before trying again.`);
        resetForm();
        setModalOpen(false);
        setEditingId(null);
        setProfileUserId(null);
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async (member) => {
    if (!member.email || resendingEmail) return;
    setResendingEmail(member.email);
    setError('');
    setNotice('');
    setWarning('');
    try {
      await resendInvite(member.email);
      setNotice(`A new invite was sent to ${member.email}.`);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not resend invite.');
    } finally {
      setResendingEmail(null);
    }
  };

  const beginEdit = (member) => {
    setForm({
      firstName: member.firstName || '',
      lastName: member.lastName || '',
      email: member.email || '',
      workDone: member.workDone || '',
      gender: member.gender || '',
      age: member.age ?? '',
      phoneNumber: member.phoneNumber || '',
      userId: member.user?.userId ?? member.user?.id ?? member.userId,
    });
    setEditingId(member.staffId);
    setProfileUserId(null);
    setError('');
    setNotice('');
    setWarning('');
    setModalOpen(true);
  };

  const beginCompleteProfile = (member) => {
    const userId = member.user?.userId ?? member.user?.id ?? member.userId;
    if (userId == null) {
      setWarning('This invited account does not have an available account ID yet. Refresh the roster before completing its profile.');
      return;
    }

    setForm({
      firstName: member.firstName || '',
      lastName: member.lastName || '',
      email: member.email || '',
      workDone: member.workDone || '',
      gender: member.gender || '',
      age: member.age ?? '',
      phoneNumber: member.phoneNumber || '',
      userId,
    });
    setEditingId(null);
    setProfileUserId(userId);
    setError('');
    setNotice('');
    setWarning('');
    setModalOpen(true);
  };

  const handleDelete = async (staffId) => {
    if (!window.confirm('Remove this support staff member?')) return;
    try {
      await deleteSupportStaff(staffId);
      setStaff((current) => current.filter((member) => member.staffId !== staffId));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not remove support staff.');
    }
  };

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Staff</p>
          <h2>Support Staff</h2>
        </div>
        <button onClick={openCreateModal}>Invite Support Staff</button>
      </div>

      <div className="toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search support staff" />
      </div>

      {error && !modalOpen && <p style={{ color: '#c0392b' }}>{error}</p>}
      {notice && <p style={{ color: '#1e8449' }}>{notice}</p>}
      {warning && <p role="status" style={{ color: '#92400e', background: '#fef3c7', padding: '0.75rem', borderRadius: 6 }}>{warning}</p>}

      <CollapsibleSection title="Support staff roster" subtitle="Non-teaching staff working at the school" defaultOpen>
        <div className="grid-3">
          {loading ? (
            <p>Loading support staff…</p>
          ) : filteredStaff.length === 0 ? (
            <div className="info-card">
              <p>No support staff or STAFF accounts found. Invite a new member to get started.</p>
            </div>
          ) : filteredStaff.map((member) => (
            <div key={member.staffId} className="info-card">
              <h3>{`${member.firstName || ''} ${member.lastName || ''}`.trim()}</h3>
              <p>
                <strong>Email:</strong>{' '}
                {member.email ? <a href={`mailto:${member.email}`}>{member.email}</a> : 'No email'}
              </p>
              <p><strong>Account role:</strong> STAFF</p>
              <p>
                <strong>Job title:</strong>{' '}
                {member.workDone || <span style={{ color: '#c0392b' }}>Not set — edit to add</span>}
              </p>
              {member.phoneNumber && (
                <p>
                  <strong>Phone:</strong>{' '}
                  <a href={`tel:${member.phoneNumber.replace(/\D/g, '')}`}>{member.phoneNumber}</a>
                </p>
              )}
              {member.gender && <p><strong>Gender:</strong> {member.gender}</p>}
              {member.age != null && <p><strong>Age:</strong> {member.age}</p>}
              <div style={{ marginTop: '0.75rem' }}>
                {!member.inviteOnly && <button className="secondary" onClick={() => beginEdit(member)}>Edit</button>}
                {member.inviteOnly && <button className="secondary" onClick={() => beginCompleteProfile(member)}>Complete profile</button>}
                {member.status === 'Invited' && (
                  <button
                    className="secondary"
                    onClick={() => handleResend(member)}
                    disabled={resendingEmail === member.email}
                    style={{ marginLeft: '0.5rem' }}
                  >
                    {resendingEmail === member.email ? 'Sending…' : 'Resend invite'}
                  </button>
                )}
                {!member.inviteOnly && (
                  <button className="secondary" onClick={() => handleDelete(member.staffId)} style={{ marginLeft: '0.5rem' }}>Remove</button>
                )}
              </div>
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                <strong>Status:</strong>{' '}
                <span
                  className="status-pill"
                  style={member.status === 'Active'
                    ? undefined
                    : { background: '#fef3c7', color: '#92400e' }}
                >
                  {member.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <Modal isOpen={modalOpen} title={profileUserId !== null ? 'Complete Support Staff Profile' : editingId !== null ? 'Edit Support Staff' : 'Invite Support Staff'} onClose={() => !submitting && closeModal()}>
        <form className="modal-form" onSubmit={handleSubmit}>
          <input
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            placeholder="First name"
            required
          />
          <input
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            placeholder="Last name"
            required
          />
          <input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email"
            type="email"
            required
            readOnly={editingId !== null || profileUserId !== null}
          />
          <input
            value={form.workDone}
            onChange={(e) => setForm({ ...form, workDone: e.target.value })}
            placeholder="Job title (e.g. Groundskeeper, Cook, Security)"
            required
          />
          <label>
            Gender
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">Select gender</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <input
            value={form.age}
            onChange={(e) => setForm({ ...form, age: e.target.value })}
            placeholder="Age"
            type="number"
            min="0"
          />
          <input
            value={form.phoneNumber}
            onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
            placeholder="Phone number"
            type="tel"
          />

          {error && <p style={{ color: '#c0392b' }}>{error}</p>}

          <div className="modal-actions">
            <button type="button" className="secondary" onClick={closeModal} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" disabled={submitting}>
              {submitting
                ? (profileUserId !== null || editingId !== null ? 'Saving…' : 'Sending invite…')
                : profileUserId !== null
                  ? 'Save Staff Profile'
                  : editingId !== null
                    ? 'Update Support Staff'
                    : 'Send Invite'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default SupportStaffPage;
