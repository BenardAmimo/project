import { useMemo, useState, useEffect } from 'react';
import Modal from '../components/Modal';
import CollapsibleSection from '../components/CollapsibleSection';
import {
  getAssignments, createAssignment, updateAssignment, deleteAssignment,
  getTeachers, getSubjects, getClasses, getUsers,
} from '../api';
import { isAccountActive } from '../accountStatus';

// One assignment = "this teacher teaches this subject in this class".
const emptyForm = { teacherId: '', subjectId: '', classesId: '' };

const assignmentId = (a) => a.assignmentId ?? a.assignId ?? a.id;
const getList = (data, key) => {
  const candidates = [data?.[key], data?.data?.[key], data?.data, data];
  return candidates.find(Array.isArray) || [];
};
const normalizeEmail = (email) => (email || '').trim().toLowerCase();

function AssignmentPage() {
  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [activeTeacherIds, setActiveTeacherIds] = useState(new Set());
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadAssignments = async () => {
    const res = await getAssignments();
    setAssignments(res.data.assignments || res.data || []);
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([getAssignments(), getTeachers(), getSubjects(), getClasses(), getUsers()])
      .then(([aRes, tRes, sRes, cRes, usersRes]) => {
        if (!mounted) return;
        const teacherList = getList(tRes.data, 'teachers');
        const usersByEmail = new Map(
          getList(usersRes.data, 'users')
            .filter((user) => user?.email)
            .map((user) => [normalizeEmail(user.email), user])
        );
        setAssignments(getList(aRes.data, 'assignments'));
        setTeachers(teacherList);
        setActiveTeacherIds(new Set(teacherList
          .filter((teacher) => {
            const account = usersByEmail.get(normalizeEmail(teacher.email));
            return [account, teacher.user, teacher.account, teacher.userAccount, teacher]
              .some((candidate) => isAccountActive(candidate));
          })
          .map((teacher) => String(teacher.teacherId ?? teacher.id))));
        setSubjects(getList(sRes.data, 'subjects'));
        setClasses(getList(cRes.data, 'classes'));
      })
      .catch(() => setError('Could not load assignments from backend.'))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const activeTeachers = teachers.filter((teacher) =>
    activeTeacherIds.has(String(teacher.teacherId ?? teacher.id))
  );

  // Names are looked up from the id lists, with the backend's own names as a fallback.
  const teacherName = (a) => {
    const t = teachers.find((x) => x.teacherId === a.teacherId);
    if (t) return `${t.firstName || ''} ${t.lastName || ''}`.trim();
    return a.teacherName || '';
  };
  const subjectName = (a) => subjects.find((x) => x.subjectId === a.subjectId)?.name || a.subjectName || '';
  const className = (a) => classes.find((x) => x.classesId === a.classesId)?.name || a.className || a.classesName || '';

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return assignments.filter((a) =>
      [teacherName(a), subjectName(a), className(a)].join(' ').toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, assignments, teachers, subjects, classes]);

  const openCreateModal = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setForm(emptyForm);
    setEditingId(null);
    setModalOpen(false);
  };

  const beginEdit = (a) => {
    setForm({
      teacherId: a.teacherId ?? '',
      subjectId: a.subjectId ?? '',
      classesId: a.classesId ?? '',
    });
    setEditingId(assignmentId(a));
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.teacherId || !form.subjectId || !form.classesId) {
      setError('Choose a class, a subject and a teacher.');
      return;
    }
    if (!activeTeacherIds.has(String(form.teacherId))) {
      setError('Only teachers with activated accounts can be assigned to classes or subjects.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        teacherId: Number(form.teacherId),
        subjectId: Number(form.subjectId),
        classesId: Number(form.classesId),
      };
      if (editingId) {
        await updateAssignment(editingId, payload);
      } else {
        await createAssignment(payload);
      }
      // Reload so the list always matches what the backend stored.
      await loadAssignments();
      closeModal();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save assignment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (a) => {
    if (!window.confirm('Remove this assignment?')) return;
    try {
      await deleteAssignment(assignmentId(a));
      setAssignments((current) => current.filter((x) => assignmentId(x) !== assignmentId(a)));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not remove assignment.');
    }
  };

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Academics</p>
          <h2>Assignments</h2>
        </div>
        <button onClick={openCreateModal}>Assign Teacher</button>
      </div>

      <div className="toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by class, subject or teacher" />
      </div>

      {error && !modalOpen && <p style={{ color: '#c0392b' }}>{error}</p>}

      <CollapsibleSection title="Teaching assignments" subtitle="Who teaches which subject in which class" defaultOpen>
        <div className="grid-3">
          {loading && <p>Loading assignments…</p>}
          {!loading && filtered.length === 0 ? (
            <div className="info-card">
              <p>No assignments yet. Assign a teacher to a subject in a class.</p>
            </div>
          ) : filtered.map((a) => (
            <div key={assignmentId(a)} className="info-card">
              <h3>{className(a) || 'Class'}</h3>
              <p><strong>Subject:</strong> {subjectName(a) || '-'}</p>
              <p><strong>Teacher:</strong> {teacherName(a) || '-'}</p>
              <div style={{ marginTop: '0.75rem' }}>
                <button className="secondary" onClick={() => beginEdit(a)}>Edit</button>
                <button className="secondary" onClick={() => handleDelete(a)} style={{ marginLeft: '0.5rem' }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <Modal isOpen={modalOpen} title={editingId ? 'Edit Assignment' : 'Assign Teacher'} onClose={closeModal}>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label>
            Class
            <select value={form.classesId} onChange={(e) => setForm({ ...form, classesId: e.target.value })} required>
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.classesId} value={c.classesId}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Subject
            <select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} required>
              <option value="">Select subject</option>
              {subjects.map((s) => (
                <option key={s.subjectId} value={s.subjectId}>{s.name}</option>
              ))}
            </select>
          </label>
          <label>
            Teacher
            <select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} required>
              <option value="">Select teacher</option>
              {activeTeachers.map((t) => (
                <option key={t.teacherId} value={t.teacherId}>
                  {`${t.firstName || ''} ${t.lastName || ''}`.trim()}{t.teacherNo ? ` (${t.teacherNo})` : ''}
                </option>
              ))}
            </select>
            {activeTeachers.length === 0 && <small>No active teachers are available for assignment.</small>}
          </label>
          {error && <p style={{ color: '#c0392b' }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={closeModal}>Cancel</button>
            <button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : (editingId ? 'Update Assignment' : 'Assign Teacher')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default AssignmentPage;