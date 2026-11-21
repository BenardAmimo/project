import { useMemo, useState, useEffect } from 'react';
import Modal from '../components/Modal';
import CollapsibleSection from '../components/CollapsibleSection';
import { getSubjects, createSubject, getClasses, getAssignments, updateSubject, deleteSubject } from '../api';

const normalizeName = (value) => value == null ? '' : String(value).trim().replace(/\s+/g, ' ').toLowerCase();

const classNamesForSubject = (subject, assignments, classes) => {
  const subjectId = subject.subjectId ?? subject.id;
  const subjectName = normalizeName(subject.name ?? subject.subjectName);

  return [...new Set(assignments
    .filter((assignment) => {
      const assignmentSubjectId = assignment.subjectId ?? assignment.subject?.subjectId ?? assignment.subject?.id;
      if (subjectId != null && assignmentSubjectId != null) {
        return String(assignmentSubjectId) === String(subjectId);
      }
      const assignmentSubjectName = normalizeName(assignment.subjectName ?? assignment.subject?.name ?? assignment.subject?.subjectName);
      return !!subjectName && assignmentSubjectName === subjectName;
    })
    .map((assignment) => {
      const classId = assignment.classesId ?? assignment.classId ?? assignment.classroomId ?? assignment.class_id ?? assignment.class?.classesId ?? assignment.class?.classId ?? assignment.classes?.classesId ?? assignment.classes?.classId;
      const linkedClass = classId == null ? null : classes.find((item) => String(item.classesId ?? item.classId ?? item.id ?? item.classroomId) === String(classId));
      return linkedClass?.name || assignment.className || assignment.classesName || assignment.class?.name || assignment.classes?.name || '';
    })
    .filter(Boolean))];
};

function SubjectPage() {
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([getSubjects(), getClasses()])
      .then(([subjectRes, classRes]) => {
        if (!mounted) return;
        setSubjects(subjectRes.data.subjects || subjectRes.data || []);
        setClasses(classRes.data.classes || classRes.data || []);
      })
      .catch(() => {
        setError('Could not load subjects from backend.');
        setSubjects([]);
      })
      .finally(() => mounted && setLoading(false));

    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    getAssignments()
      .then((res) => {
        if (mounted) setAssignments(res.data.assignments || res.data || []);
      })
      .catch(() => {
        if (mounted) setAssignments([]);
      })
      .finally(() => mounted && setAssignmentsLoaded(true));
    return () => { mounted = false; };
  }, []);

  const filteredSubjects = useMemo(() => {
    const q = search.toLowerCase();
    return subjects.filter((s) =>
      [s.name, s.description, classNamesForSubject(s, assignments, classes).join(' ')].join(' ').toLowerCase().includes(q)
    );
  }, [search, subjects, assignments, classes]);

  const resetForm = () => setForm({ name: '', description: '' });

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');

    try {
      if (editingId) {
        const res = await updateSubject(editingId, form);
        setSubjects((current) => current.map((s) => (s.subjectId === editingId ? res.data : s)));
        setEditingId(null);
      } else {
        const res = await createSubject(form);
        setSubjects((current) => [res.data, ...current]);
      }
      resetForm();
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create subject');
    } finally {
      setSubmitting(false);
    }
  };

  const beginEdit = (s) => {
    setForm({ name: s.name || '', description: s.description || '' });
    setEditingId(s.subjectId);
    setModalOpen(true);
  };

  const handleDelete = async (subjectId) => {
    if (!window.confirm('Delete this subject?')) return;
    try {
      await deleteSubject(subjectId);
      setSubjects((current) => current.filter((s) => s.subjectId !== subjectId));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete subject');
    }
  };

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Academics</p>
          <h2>Subjects</h2>
        </div>
        <button onClick={openCreateModal}>Add Subject</button>
      </div>

      <div className="toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search subjects" />
      </div>

      {error && !modalOpen && <p style={{ color: '#c0392b' }}>{error}</p>}

      <CollapsibleSection title="Subject list" subtitle="Hide or show the subject list on demand" defaultOpen>
        <div className="grid-3">
          {loading && <p>Loading subjects…</p>}
          {!loading && filteredSubjects.length === 0 ? (
            <div className="info-card">
              <p>No subjects found. Add a new subject to get started.</p>
            </div>
          ) : filteredSubjects.map((s) => (
            <div key={s.subjectId} className="info-card">
              <h3>{s.name}</h3>
              {s.description && <p>{s.description}</p>}
              <p><strong>Classes:</strong> {assignmentsLoaded ? classNamesForSubject(s, assignments, classes).join(', ') || 'Not assigned' : 'Loading…'}</p>
              <p><strong>Teachers assigned:</strong> {s.assignmentCount ?? 0}</p>
              <div style={{ marginTop: '0.75rem' }}>
                <button className="secondary" onClick={() => beginEdit(s)}>Edit</button>
                <button className="secondary" onClick={() => handleDelete(s.subjectId)} style={{ marginLeft: '0.5rem' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <Modal isOpen={modalOpen} title={editingId ? 'Edit Subject' : 'Add New Subject'} onClose={() => !submitting && closeModal()}>
        <form className="modal-form" onSubmit={handleSubmit}>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Subject name (e.g. Mathematics)" required />
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" />
          {error && <p style={{ color: '#c0392b' }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={closeModal} disabled={submitting}>Cancel</button>
            <button type="submit" disabled={submitting}>{submitting ? (editingId ? 'Saving…' : 'Adding…') : (editingId ? 'Update Subject' : 'Add Subject')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default SubjectPage;