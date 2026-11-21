import { useMemo, useState, useEffect } from 'react';
import Modal from '../components/Modal';
import CollapsibleSection from '../components/CollapsibleSection';
import { getStudents, createStudent, getParents, getClasses, getUsers, updateStudent, deleteStudent } from '../api';
import { isAccountActive } from '../accountStatus';

const normalizeEmail = (email) => (email || '').trim().toLowerCase();
const getList = (data, key) => {
  const candidates = [data?.[key], data?.data?.[key], data?.data, data];
  return candidates.find(Array.isArray) || [];
};

function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [parents, setParents] = useState([]);
  const [activeParentIds, setActiveParentIds] = useState(new Set());
  const [classes, setClasses] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', parentId: '', classesId: '', gender: '', age: '' });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([getStudents(), getParents(), getClasses(), getUsers()])
      .then(([studentsRes, parentsRes, classesRes, usersRes]) => {
        if (!mounted) return;
        setStudents(getList(studentsRes.data, 'students'));
        const parentList = getList(parentsRes.data, 'parents');
        const usersByEmail = new Map(
          getList(usersRes.data, 'users')
            .filter((user) => user?.email)
            .map((user) => [normalizeEmail(user.email), user])
        );
        setParents(parentList);
        setActiveParentIds(new Set(parentList
          .filter((parent) => {
            const linkedUser = usersByEmail.get(normalizeEmail(parent.email));
            return [
              linkedUser,
              parent.user,
              parent.account,
              parent.userAccount,
              parent,
            ].some((account) => isAccountActive(account));
          })
          .map((parent) => String(parent.parentId ?? parent.id))));
        setClasses(getList(classesRes.data, 'classes'));
      })
      .catch(() => {
        setError('Could not load students, parents, or classes.');
        setActiveParentIds(new Set());
      })
      .finally(() => mounted && setLoading(false));

    return () => { mounted = false; };
  }, []);

  const activeParents = parents.filter((parent) =>
    activeParentIds.has(String(parent.parentId ?? parent.id))
  );

  const filteredStudents = useMemo(() => {
    const q = search.toLowerCase();
    return students.filter((s) => [
      `${s.firstName || ''} ${s.lastName || ''}`,
      s.className,
      s.parentFirstName,
    ].join(' ').toLowerCase().includes(q));
  }, [search, students]);

  const resetForm = () => setForm({ firstName: '', lastName: '', parentId: '', classesId: '', gender: '', age: '' });

  const openCreateModal = () => {
    resetForm();
    setEditingId(null);
    setError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setError('');
  };

  const beginEdit = (student) => {
    setForm({
      firstName: student.firstName || '',
      lastName: student.lastName || '',
      parentId: student.parentId || student.parentId === 0 ? String(student.parentId) : '',
      classesId: student.classesId || student.classesId === 0 ? String(student.classesId) : '',
      gender: student.gender || '',
      age: student.age ?? '',
    });
    setEditingId(student.studentId);
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (!form.parentId) {
      setError('Select a parent.');
      return;
    }
    if (!activeParentIds.has(String(form.parentId))) {
      setError('Only parents with activated accounts can be assigned to a student.');
      return;
    }
    if (!form.classesId) {
      setError('Select a class.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      if (editingId) {
        const res = await updateStudent(editingId, {
          firstName: form.firstName,
          lastName: form.lastName,
          parentId: Number(form.parentId),
          classesId: Number(form.classesId),
          gender: form.gender,
          age: form.age ? Number(form.age) : undefined,
        });
        setStudents((current) => current.map((s) => (s.studentId === editingId ? res.data : s)));
        setEditingId(null);
      } else {
        const res = await createStudent({
          firstName: form.firstName,
          lastName: form.lastName,
          parentId: Number(form.parentId),
          classesId: Number(form.classesId),
          gender: form.gender,
          age: form.age ? Number(form.age) : undefined,
        });
        setStudents((current) => [res.data, ...current]);
      }
      resetForm();
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create student');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (studentId) => {
    if (!window.confirm('Delete this student?')) return;
    try {
      await deleteStudent(studentId);
      setStudents((current) => current.filter((s) => s.studentId !== studentId));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete student');
    }
  };

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Academics</p>
          <h2>Students</h2>
        </div>
        <button onClick={openCreateModal}>Add Student</button>
      </div>

      <div className="toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students" />
      </div>

      {error && !modalOpen && <p style={{ color: '#c0392b' }}>{error}</p>}

      <CollapsibleSection title="Student roster" subtitle="Hide or show the student list as needed" defaultOpen>
        <div className="grid-3">
          {loading ? (
            <p>Loading students…</p>
          ) : filteredStudents.length === 0 ? (
            <div className="info-card">
              <p>No students found. Adjust search or add a new student.</p>
            </div>
          ) : filteredStudents.map((s) => (
            <div key={s.studentId} className="info-card">
              <h3>{`${s.firstName || ''} ${s.lastName || ''}`.trim()}</h3>
              <p><strong>Class:</strong> {s.className}</p>
                  {s.gender && <p><strong>Gender:</strong> {s.gender}</p>}
                  {s.age != null && <p><strong>Age:</strong> {s.age}</p>}
              <p><strong>Parent:</strong> {`${s.parentFirstName || ''} ${s.parentLastName || ''}`.trim()}</p>
              <div style={{ marginTop: '0.75rem' }}>
                <button className="secondary" onClick={() => beginEdit(s)}>Edit</button>
                <button className="secondary" onClick={() => handleDelete(s.studentId)} style={{ marginLeft: '0.5rem' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <Modal isOpen={modalOpen} title={editingId ? 'Edit Student' : 'Add New Student'} onClose={() => !submitting && closeModal()}>
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
          <label>
            Gender
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <input
            value={form.age}
            onChange={(e) => setForm({ ...form, age: e.target.value })}
            placeholder="Age"
            type="number"
            min="0"
          />

          <label>
            Parent
            <select
              value={form.parentId}
              onChange={(e) => setForm({ ...form, parentId: e.target.value })}
              required
            >
              <option value="">Select a parent</option>
              {activeParents.map((p) => (
                <option key={p.parentId ?? p.id} value={p.parentId ?? p.id}>
                  {p.firstName} {p.lastName}
                </option>
              ))}
            </select>
            {activeParents.length === 0 && (
              <small>No active parent accounts are available to assign.</small>
            )}
          </label>

          <label>
            Class
            <select
              value={form.classesId}
              onChange={(e) => setForm({ ...form, classesId: e.target.value })}
              required
            >
              <option value="">Select a class</option>
              {classes.map((c) => (
                <option key={c.classesId} value={c.classesId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {error && <p style={{ color: '#c0392b' }}>{error}</p>}

          <div className="modal-actions">
            <button type="button" className="secondary" onClick={closeModal} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" disabled={submitting}>
              {submitting ? (editingId ? 'Saving…' : 'Adding…') : (editingId ? 'Update Student' : 'Add Student')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default StudentsPage;