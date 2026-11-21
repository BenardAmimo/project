import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal';
import CollapsibleSection from '../components/CollapsibleSection';
import { getClasses, getSubjects, getAssignments, getTeachers, getStudents, createClass, updateClass, deleteClass } from '../api';

const pickArray = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const candidateKeys = [
    'classes', 'subjects', 'assignments', 'teachers', 'students',
    'classList', 'subjectList', 'assignmentList', 'teacherList', 'studentList',
    'data', 'items', 'results', 'records'
  ];

  for (const key of candidateKeys) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }

  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) return value;
  }

  return [];
};

const normalizeId = (value) => value == null ? '' : String(value);

const teacherLabel = (teacher) => {
  if (!teacher) return 'Unknown teacher';
  const name = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
  return name || teacher.teacherNo || teacher.email || `Teacher #${teacher.teacherId || 'unknown'}`;
};

function ClassesPage() {
  const [classes, setClasses] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', location: '', year: '' });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.allSettled([getClasses(), getSubjects(), getAssignments(), getTeachers(), getStudents()])
      .then((results) => {
        if (!mounted) return;

        const classRes = results[0]?.status === 'fulfilled' ? results[0].value : { data: [] };
        const subjectRes = results[1]?.status === 'fulfilled' ? results[1].value : { data: [] };
        const assignmentRes = results[2]?.status === 'fulfilled' ? results[2].value : { data: [] };
        const teacherRes = results[3]?.status === 'fulfilled' ? results[3].value : { data: [] };
        const studentRes = results[4]?.status === 'fulfilled' ? results[4].value : { data: [] };

        const classList = pickArray(classRes.data);
        const subjectList = pickArray(subjectRes.data);
        const assignmentList = pickArray(assignmentRes.data);
        const teacherList = pickArray(teacherRes.data);
        const studentList = pickArray(studentRes.data);

        const teacherById = new Map(teacherList.map((teacher) => [String(teacher.teacherId), teacher]));
        const teachersBySubjectName = new Map();

        assignmentList.forEach((assignment) => {
          const subjectMatchName = assignment.subjectName || assignment.subject?.name || assignment.subjectName?.trim();
          const teacherName = assignment.teacherName || assignment.teacher?.fullName || assignment.teacher?.name || (assignment.teacher?.firstName && assignment.teacher?.lastName ? `${assignment.teacher.firstName} ${assignment.teacher.lastName}`.trim() : '');

          if (!subjectMatchName || !teacherName) return;

          if (!teachersBySubjectName.has(subjectMatchName)) {
            teachersBySubjectName.set(subjectMatchName, []);
          }

          const list = teachersBySubjectName.get(subjectMatchName);
          const teacherId = assignment.teacherId ?? assignment.teacher?.teacherId ?? assignment.teacher?.id;
          const teacher = teacherById.get(String(teacherId)) || assignment.teacher || {
            teacherId,
            firstName: teacherName.split(' ')[0] || '',
            lastName: teacherName.split(' ').slice(1).join(' ') || '',
            teacherName,
          };

          if (!list.some((item) => {
            const itemKey = normalizeId(item.teacherId ?? item.id ?? item.teacher?.teacherId ?? item.teacherName ?? item.name ?? item.email);
            const candidateKey = normalizeId(teacherId ?? teacherName);
            return itemKey && candidateKey && itemKey === candidateKey;
          })) {
            list.push({ ...teacher, teacherName });
          }
        });

        const enrichedClasses = classList.map((classItem) => {
          const classId = normalizeId(classItem.classesId ?? classItem.classId ?? classItem.id ?? classItem.classroomId ?? classItem.class_id ?? classItem.class?.classesId ?? classItem.class?.classId);
          const className = classItem.name ?? classItem.className ?? classItem.class_name ?? classItem.grade ?? '';
          const embeddedStudents = classItem.students ?? classItem.student ?? classItem.studentList ?? classItem.student_list;
          const embeddedStudentList = Array.isArray(embeddedStudents)
            ? embeddedStudents
            : embeddedStudents ? [embeddedStudents] : [];
          const classStudents = embeddedStudentList.length > 0
            ? embeddedStudentList
            : studentList.filter((student) => {
              const studentClassId = normalizeId(student.classesId ?? student.classId ?? student.classroomId ?? student.class_id ?? student.class?.classesId ?? student.class?.classId ?? student.classroom?.classesId ?? student.classroom?.id);
              const studentClassName = normalizeId(student.className ?? student.classesName ?? student.class?.name ?? student.classroom?.name);
              return classId && studentClassId
                ? studentClassId === classId
                : !studentClassId && className && studentClassName === normalizeId(className);
            });

          const subjectMatches = (() => {
            const direct = Array.isArray(classItem.subjects) ? classItem.subjects :
              Array.isArray(classItem.subject) ? classItem.subject :
              Array.isArray(classItem.subjectList) ? classItem.subjectList : [];

            if (direct.length > 0) return direct;

            return subjectList.filter((subject) => {
              const directClassName = normalizeId(subject.classesName ?? subject.className ?? subject.class?.name ?? subject.class_name ?? subject.grade ?? '');
              const directClassId = normalizeId(subject.classesId ?? subject.classId ?? subject.class_id ?? subject.class?.classesId ?? subject.class?.classId ?? '');
              const nameMatch = className && (directClassName === normalizeId(className) || normalizeId(subject.class?.name) === normalizeId(className));
              const idMatch = !!classId && directClassId && directClassId === classId;
              const assignmentMatch = assignmentList.some((assignment) => {
                const assignedSubjectId = normalizeId(assignment.subjectId ?? assignment.subject?.subjectId ?? assignment.subject?.id);
                const assignedClassId = normalizeId(assignment.classesId ?? assignment.classId ?? assignment.class?.classesId ?? assignment.classes?.classesId);
                const assignedClassName = normalizeId(assignment.className ?? assignment.classesName ?? assignment.class?.name ?? assignment.classes?.name);
                const subjectId = normalizeId(subject.subjectId ?? subject.id);
                return assignedSubjectId === subjectId && (
                  (classId && assignedClassId === classId) ||
                  (!assignedClassId && className && assignedClassName === normalizeId(className))
                );
              });
              return assignmentMatch || idMatch || nameMatch;
            });
          })();

          const mappedSubjects = subjectMatches.map((subject) => {
            const subjectName = subject.name || subject.subjectName || '';
            const teachers = teachersBySubjectName.get(subjectName) || teachersBySubjectName.get(subject.name || subject.subjectName || subject.classesName || '') || [];

            return {
              ...subject,
              teachers: (teachers || []).map((teacher) => ({
                ...teacher,
                teacherName: teacher.teacherName || `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || teacher.name || teacher.fullName || '',
              })),
            };
          });

          const classTeacherIds = new Map();
          mappedSubjects.forEach((subject) => {
            (subject.teachers || []).forEach((teacher) => {
              const key = normalizeId(teacher.teacherId ?? teacher.id ?? teacher.teacher?.teacherId ?? teacher.userId ?? teacher.teacherName ?? teacher.name ?? teacher.fullName ?? '');
              if (!key) return;
              classTeacherIds.set(key, teacher);
            });
          });

          const directTeachers = Array.isArray(classItem.teachers) ? classItem.teachers :
            Array.isArray(classItem.teacher) ? classItem.teacher :
            Array.isArray(classItem.teacherList) ? classItem.teacherList : [];

          const mergedTeachers = directTeachers.length > 0 ? directTeachers : Array.from(classTeacherIds.values());

          return {
            ...classItem,
            students: classStudents,
            subjects: mappedSubjects,
            teachers: mergedTeachers,
          };
        });

        const failedResources = results
          .map((result, index) => ({ result, name: ['classes', 'subjects', 'assignments', 'teachers', 'students'][index] }))
          .filter(({ result }) => result.status === 'rejected');
        if (results[0]?.status === 'rejected') {
          const status = results[0].reason?.response?.status;
          setError(`Could not load classes from backend${status ? ` (${status})` : ''}.`);
        } else if (failedResources.length) {
          const details = failedResources.map(({ result, name }) => {
            const status = result.reason?.response?.status;
            return `${name}${status ? ` (${status})` : ''}`;
          });
          setError(`Some related class data could not load: ${details.join(', ')}.`);
        } else {
          setError('');
        }

        setClasses(enrichedClasses.length ? enrichedClasses : classList);
      })
      .catch((err) => {
        console.error('Failed to load classes data', err);
        setError('Could not load classes from backend.');
        setClasses([]);
      })
      .finally(() => mounted && setLoading(false));

    return () => { mounted = false; };
  }, []);

  const filteredClasses = useMemo(() => {
    const q = search.toLowerCase();
    return classes.filter((c) =>
      [c.name, c.location, c.year].join(' ').toLowerCase().includes(q)
    );
  }, [search, classes]);

  const openCreateModal = () => {
    setForm({ name: '', location: '', year: '' });
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
    try {
      if (editingId) {
        const res = await updateClass(editingId, form);
        setClasses((current) => current.map((c) => (c.classesId === editingId ? res.data : c)));
        setEditingId(null);
      } else {
        await createClass(form);
        setClasses((current) => [{ classesId: Date.now(), ...form, students: [], subjects: [], teachers: [] }, ...current]);
      }
      setForm({ name: '', location: '', year: '' });
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create class');
    }
  };

  const beginEdit = (c) => {
    setForm({ name: c.name || '', location: c.location || '', year: c.year || '' });
    setEditingId(c.classesId);
    setModalOpen(true);
  };

  const handleDelete = async (classId) => {
    if (!window.confirm('Delete this class?')) return;
    try {
      await deleteClass(classId);
      setClasses((current) => current.filter((c) => c.classesId !== classId));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete class');
    }
  };

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Academics</p>
          <h2>Classes</h2>
        </div>
        <button onClick={openCreateModal}>Add Class</button>
      </div>

      <div className="toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search classes" />
      </div>

      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {loading && <p>Loading classes…</p>}

      {!loading && filteredClasses.length === 0 ? (
        <div className="info-card">
          <p>No classes found. Add a new class to get started.</p>
        </div>
      ) : (
        filteredClasses.map((c) => (
          <CollapsibleSection
            key={c.classesId}
            title={c.name}
            subtitle={`${c.location || 'No location set'} · ${c.year || ''} · ${c.students?.length ?? 0} student(s) · ${c.subjects?.length ?? 0} subject(s) · ${c.teachers?.length ?? 0} teacher(s)`}
          >
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Link className="button-link" to={`/home/timetable?classId=${encodeURIComponent(c.classesId)}`}>
                  View timetable
                </Link>
                <button className="secondary" onClick={() => beginEdit(c)}>Edit</button>
                <button className="secondary" onClick={() => handleDelete(c.classesId)}>Delete</button>
              </div>
              <h4 style={{ marginBottom: '0.6rem' }}>Students</h4>
              <div className="grid-3">
                {!c.students || c.students.length === 0 ? (
                  <div className="info-card">
                    <p>No students in this class yet.</p>
                  </div>
                ) : c.students.map((student) => (
                  <div key={student.studentId} className="info-card">
                    <h3>{`${student.firstName || ''} ${student.lastName || ''}`.trim()}</h3>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ marginBottom: '0.6rem' }}>Subjects</h4>
              <div className="grid-3">
                {!c.subjects || c.subjects.length === 0 ? (
                  <div className="info-card">
                    <p>No subjects assigned to this class yet.</p>
                  </div>
                ) : c.subjects.map((subject) => (
                  <div key={subject.subjectId || subject.id} className="info-card">
                    <h3>{subject.name}</h3>
                    <div style={{ marginTop: '0.75rem' }}>
                      {(!subject.teachers || subject.teachers.length === 0) ? (
                        <p>No teacher assigned to this subject yet.</p>
                      ) : (
                        <div>
                          <strong>Teachers:</strong>
                          <ul style={{ margin: '0.5rem 0 0 1.2rem', padding: 0 }}>
                            {subject.teachers.map((teacher) => (
                              <li key={teacher.teacherId || teacher.id || teacher.email || teacherLabel(teacher)}>
                                {teacherLabel(teacher)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 style={{ marginBottom: '0.6rem' }}>Teachers</h4>
              <div className="grid-3">
                {!c.teachers || c.teachers.length === 0 ? (
                  <div className="info-card">
                    <p>No teachers assigned to this class yet.</p>
                  </div>
                ) : c.teachers.map((teacher) => (
                  <div key={teacher.teacherId || teacher.id} className="info-card">
                    <h3>{teacherLabel(teacher)}</h3>
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleSection>
        ))
      )}

      <Modal isOpen={modalOpen} title={editingId ? 'Edit Class' : 'Add New Class'} onClose={closeModal}>
        <form className="modal-form" onSubmit={handleSubmit}>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Class name (e.g. Grade 4 Blue)" required />
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location (e.g. Room 12)" required />
          <input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="Year (e.g. 2026)" required />
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={closeModal}>Cancel</button>
            <button type="submit">{editingId ? 'Update Class' : 'Add Class'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default ClassesPage;