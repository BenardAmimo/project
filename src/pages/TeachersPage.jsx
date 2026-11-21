import { useMemo, useState, useEffect } from 'react';
import Modal from '../components/Modal';
import CollapsibleSection from '../components/CollapsibleSection';
import { getTeachers, createTeacher, updateTeacher, deleteTeacher, resendInvite } from '../api';
import { isAccountActive } from '../accountStatus';

const emptyForm = {
  firstName: '', lastName: '', email: '',
  teacherNo: '', phoneNumber: '', gender: '', age: '',
};

// Turns the backend list into what the page displays.
const normalizeTeachers = (raw) =>
  (raw || []).map((t) => {
    const genderCandidates = [t?.gender, t?.sex, t?.genderType, t?.gender?.name, t?.gender?.value];
    let gender = '';
    for (const cand of genderCandidates) { if (cand !== undefined && cand !== null && cand !== '') { gender = cand; break; } }
    if (gender && typeof gender !== 'string') gender = String(gender);
    if (gender) { const lower = gender.toLowerCase(); gender = lower[0]?.toUpperCase() + lower.slice(1); }

    let age = null;
    if (t?.age != null) age = Number(t.age);
    else if (t?.birthYear != null) age = new Date().getFullYear() - Number(t.birthYear);
    else if (t?.dob || t?.dateOfBirth) {
      const dob = new Date(t.dob || t.dateOfBirth);
      if (!Number.isNaN(dob.getTime())) {
        const diff = Date.now() - dob.getTime();
        age = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
      }
    }

    const status = isAccountActive(t) ? 'Active' : 'Invited';

    return { ...t, gender: gender || '', age: age != null ? age : null, status };
  });

function TeachersPage() {
  const [teachers, setTeachers] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  // Classes and subjects are NOT set here. They come from Assignments, so the
  // teacher form only holds the person's own details.
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(null);
  const [error, setError] = useState('');
  // Confirmation after an invite is sent or resent. The activation link goes
  // to the teacher's email only; the admin never sees the token.
  const [notice, setNotice] = useState('');
  const [warning, setWarning] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getTeachers()
      .then((res) => {
        if (!mounted) return;
        setTeachers(normalizeTeachers(res.data.teachers || res.data || []));
      })
      .catch(() => {
        setError('Could not load teachers from backend.');
        setTeachers([]);
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const filteredTeachers = useMemo(() => {
    const q = search.toLowerCase();
    return teachers.filter((teacher) => [
      `${teacher.firstName || ''} ${teacher.lastName || ''}`,
      teacher.email,
      teacher.teacherNo,
    ].join(' ').toLowerCase().includes(q));
  }, [search, teachers]);

  const openCreateModal = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError('');
    setNotice('');
    setWarning('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError('');
    setModalOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        teacherNo: form.teacherNo,
        phoneNumber: form.phoneNumber,
        gender: form.gender,
        age: form.age ? Number(form.age) : undefined,
      };

      if (editingId) {
        const res = await updateTeacher(editingId, payload);
        setTeachers((current) => current.map((t) => (t.teacherId === editingId ? { ...t, ...res.data } : t)));
        closeModal();
      } else {
        // Inviting returns only a text message, not the new teacher, so the list is reloaded
        // to get the real record (with its id) from the backend.
        await createTeacher(payload);
        setNotice(`Invite sent to ${payload.email}. The link expires in 3 days.`);
        closeModal();
        try {
          const refreshed = await getTeachers();
          setTeachers(normalizeTeachers(refreshed.data.teachers || refreshed.data || []));
        } catch (refreshError) {
          console.error('Teacher invite was sent, but the roster could not be refreshed', refreshError);
          setWarning(`Invite sent to ${payload.email}. The roster could not be refreshed; do not send another invite. Refresh the page to check the latest status.`);
        }
      }
    } catch (err) {
      if (!editingId && err.inviteStatusUnknown) {
        closeModal();
        setWarning(`Could not confirm whether the invitation was sent to ${form.email}. Check the teacher roster and email before trying again.`);
      } else {
        setError(err.response?.data?.message || 'Could not save teacher');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async (teacher) => {
    if (!teacher.email || resendingEmail) return;
    setResendingEmail(teacher.email);
    setError('');
    setNotice('');
    setWarning('');
    try {
      await resendInvite(teacher.email);
      setNotice(`A new invite was sent to ${teacher.email}. Any earlier link no longer works.`);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not resend invite.');
    } finally {
      setResendingEmail(null);
    }
  };

  const beginEdit = (teacher) => {
    setForm({
      firstName: teacher.firstName || '',
      lastName: teacher.lastName || '',
      email: teacher.email || '',
      teacherNo: teacher.teacherNo || '',
      phoneNumber: teacher.phoneNumber || '',
      gender: teacher.gender || '',
      age: teacher.age ?? '',
    });
    setEditingId(teacher.teacherId);
    setError('');
    setNotice('');
    setWarning('');
    setModalOpen(true);
  };

  const handleDelete = async (teacherId) => {
    if (!window.confirm('Remove this teacher?')) return;
    try {
      await deleteTeacher(teacherId);
      setTeachers((current) => current.filter((t) => t.teacherId !== teacherId));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not remove teacher.');
    }
  };

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Staff</p>
          <h2>Teachers</h2>
        </div>
        <button onClick={openCreateModal}>Add Teacher</button>
      </div>

      <div className="toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teachers" />
      </div>

      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {notice && <p style={{ color: '#1e8449' }}>{notice}</p>}
      {warning && <p role="status" style={{ color: '#92400e', background: '#fef3c7', padding: '0.75rem', borderRadius: 6 }}>{warning}</p>}

      <CollapsibleSection title="Teacher roster" subtitle="Hide or show the teacher list as needed" defaultOpen>
        <div className="grid-3">
          {loading && <p>Loading teachers…</p>}
          {!loading && filteredTeachers.length === 0 ? (
            <div className="info-card">
              <p>No teachers found. Adjust search or invite a new teacher.</p>
            </div>
          ) : filteredTeachers.map((teacher) => (
            <div key={teacher.teacherId} className="info-card">
              <h3>{`${teacher.firstName || ''} ${teacher.lastName || ''}`.trim()}</h3>
              {teacher.teacherNo && <p><strong>Teacher No:</strong> {teacher.teacherNo}</p>}
              {teacher.phoneNumber && (
                <p>
                  <strong>Phone:</strong>{' '}
                  <a href={`tel:${(teacher.phoneNumber || '').replace(/\D/g, '')}`}>
                    {teacher.phoneNumber}
                  </a>
                </p>
              )}
              {teacher.gender && <p><strong>Gender:</strong> {teacher.gender}</p>}
              {teacher.age != null && <p><strong>Age:</strong> {teacher.age}</p>}
              <p><strong>Email:</strong> {teacher.email}</p>
              <p><strong>Status:</strong> {teacher.status}</p>
              <div style={{ marginTop: '0.75rem' }}>
                <button className="secondary" onClick={() => beginEdit(teacher)}>Edit</button>
                {teacher.status === 'Invited' && (
                  <button
                    className="secondary"
                    onClick={() => handleResend(teacher)}
                    disabled={resendingEmail === teacher.email}
                    style={{ marginLeft: '0.5rem' }}
                  >
                    {resendingEmail === teacher.email ? 'Sending…' : 'Resend invite'}
                  </button>
                )}
                <button className="secondary" onClick={() => handleDelete(teacher.teacherId)} style={{ marginLeft: '0.5rem' }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <Modal isOpen={modalOpen} title={editingId ? 'Edit Teacher' : 'Invite New Teacher'} onClose={closeModal}>
        <form className="modal-form" onSubmit={handleSubmit}>
          <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="First name" required />
          <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Last name" required />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email" required />
          <input value={form.teacherNo} onChange={(e) => setForm({ ...form, teacherNo: e.target.value })} placeholder="Teacher No" />
          <input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="Phone number" />
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
            <button type="submit" disabled={submitting}>{submitting ? (editingId ? 'Saving…' : 'Inviting…') : (editingId ? 'Update Teacher' : 'Invite Teacher')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default TeachersPage;