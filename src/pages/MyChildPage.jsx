import { useState, useEffect } from 'react';
import CollapsibleSection from '../components/CollapsibleSection';
import {
  getMyChildren, getAssignments, getSubjects, getTeachers, getClasses, getTerms,
  getReportCard,
} from '../api';

const toArray = (payload, keys) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return payload.data && typeof payload.data === 'object' ? toArray(payload.data, keys) : [];
};

const normalizeName = (value) => value == null ? '' : String(value).trim().replace(/\s+/g, ' ').toLowerCase();
const studentIdOf = (value) =>
  value?.studentId ?? value?.id ?? value?.student?.studentId ?? value?.student?.id;
const classIdOf = (value) => value?.classesId ?? value?.classId ?? value?.classroomId ?? value?.class_id ?? value?.class?.classesId ?? value?.class?.classId ?? value?.classes?.classesId ?? value?.classroom?.id;
const subjectIdOf = (value) => value?.subjectId ?? value?.subject?.subjectId ?? value?.subject?.id;
const teacherIdOf = (value) => value?.teacherId ?? value?.teacher?.teacherId ?? value?.teacher?.id;
const cell = (value) => value == null ? '—' : value;
const errorMessage = (err, fallback) =>
  err.response?.data?.message || err.response?.data?.error ||
  (err.response?.status === 401
    ? 'The server rejected authentication for this results request (401). Sign in again; if it continues, the backend must allow authenticated parents to view results for their linked children.'
    : err.response?.status ? `Request failed (${err.response.status}).` : err.message || fallback);

const reportCardFrom = (payload) => {
  let current = payload;
  while (current && typeof current === 'object' && !Array.isArray(current)) {
    if (current.reportCard && typeof current.reportCard === 'object') {
      current = current.reportCard;
      continue;
    }
    if (current.data && typeof current.data === 'object') {
      current = current.data;
      continue;
    }
    return Array.isArray(current.subjects) ? current : null;
  }
  return null;
};

const teacherNameOf = (value) => {
  const teacher = value?.teacher;
  return value?.teacherName || teacher?.fullName || teacher?.name ||
    [teacher?.firstName, teacher?.lastName].filter(Boolean).join(' ') || '';
};

const subjectsForChild = (child, assignments, subjects, teachers, classes) => {
  const childClassId = classIdOf(child);
  const childClass = classes.find((item) => String(classIdOf(item)) === String(childClassId));
  const childClassName = child.className ?? child.classesName ?? child.class?.name ?? childClass?.name ?? '';
  const classAssignments = assignments.filter((assignment) => {
    const assignmentClassId = classIdOf(assignment);
    if (childClassId != null && assignmentClassId != null) {
      return String(assignmentClassId) === String(childClassId);
    }
    const assignmentClassName = assignment.className ?? assignment.classesName ?? assignment.class?.name ?? assignment.classes?.name;
    return !!childClassName && normalizeName(assignmentClassName) === normalizeName(childClassName);
  });

  const assignedSubjects = classAssignments.map((assignment) => {
    const assignmentSubjectId = subjectIdOf(assignment);
    const assignmentSubjectName = assignment.subjectName ?? assignment.subject?.name ?? assignment.subject?.subjectName;
    const subject = subjects.find((item) => {
      const candidateId = item.subjectId ?? item.id;
      return assignmentSubjectId != null && candidateId != null && String(candidateId) === String(assignmentSubjectId);
    }) || subjects.find((item) => normalizeName(item.name ?? item.subjectName) === normalizeName(assignmentSubjectName));
    const assignmentTeacherId = teacherIdOf(assignment);
    const teacher = teachers.find((item) => {
      const candidateId = item.teacherId ?? item.id;
      return assignmentTeacherId != null && candidateId != null && String(candidateId) === String(assignmentTeacherId);
    });
    const resolvedTeacherName = teacherNameOf(assignment) ||
      [teacher?.firstName, teacher?.lastName].filter(Boolean).join(' ') || teacher?.name || teacher?.fullName || '';

    return {
      subjectId: assignmentSubjectId ?? subject?.subjectId ?? subject?.id ?? assignmentSubjectName,
      subjectName: assignmentSubjectName || subject?.name || subject?.subjectName || '',
      teacherName: resolvedTeacherName,
    };
  }).filter((item) => item.subjectName || item.teacherName);

  if (assignedSubjects.length > 0) return assignedSubjects;
  return (Array.isArray(child.subjects) ? child.subjects : []).map((item) => ({
    ...item,
    subjectName: item.subjectName || item.name || item.subject?.name || '',
    teacherName: item.teacherName || teacherNameOf(item),
  }));
};

function MyChildPage() {
  const [children, setChildren] = useState([]);
  const [terms, setTerms] = useState([]);
  const [selectedTerms, setSelectedTerms] = useState({});
  const [reportCards, setReportCards] = useState({});
  const [resultsLoading, setResultsLoading] = useState({});
  const [resultsErrors, setResultsErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignmentsUnavailable, setAssignmentsUnavailable] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.allSettled([
      getMyChildren(), getAssignments(), getSubjects(), getTeachers(), getClasses(),
      getTerms(),
    ])
      .then((results) => {
        if (!mounted) return;
        const [
          childrenResult, assignmentsResult, subjectsResult, teachersResult, classesResult,
          termsResult,
        ] = results;
        if (termsResult.status === 'fulfilled') {
          setTerms(toArray(termsResult.value.data, ['terms', 'items', 'results']));
        }

        if (childrenResult.status === 'rejected') throw childrenResult.reason;

        const childList = toArray(childrenResult.value.data, ['children', 'students']);
        const assignments = assignmentsResult.status === 'fulfilled'
          ? toArray(assignmentsResult.value.data, ['assignments', 'items', 'results'])
          : [];
        const subjects = subjectsResult.status === 'fulfilled'
          ? toArray(subjectsResult.value.data, ['subjects', 'items', 'results'])
          : [];
        const teachers = teachersResult.status === 'fulfilled'
          ? toArray(teachersResult.value.data, ['teachers', 'items', 'results'])
          : [];
        const classes = classesResult.status === 'fulfilled'
          ? toArray(classesResult.value.data, ['classes', 'items', 'results'])
          : [];
        setAssignmentsUnavailable(assignmentsResult.status === 'rejected');
        setChildren(childList.map((child) => ({
          ...child,
          studentId: studentIdOf(child),
          className: child.className || child.classesName || child.class?.name || classes.find((item) => String(classIdOf(item)) === String(classIdOf(child)))?.name,
          subjects: subjectsForChild(child, assignments, subjects, teachers, classes),
        })));
      })
      .catch(() => {
        if (!mounted) return;
        setError('Could not load your child\'s details.');
        setChildren([]);
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const showResults = async (child) => {
    const studentId = studentIdOf(child);
    const termId = selectedTerms[studentId];
    if (studentId == null || studentId === '') {
      setResultsErrors((current) => ({ ...current, [studentId]: 'This child record has no student ID, so results cannot be requested. Contact the school administrator.' }));
      return;
    }
    if (!termId) {
      setResultsErrors((current) => ({ ...current, [studentId]: 'Select a term to view results.' }));
      return;
    }
    setResultsLoading((current) => ({ ...current, [studentId]: true }));
    setResultsErrors((current) => ({ ...current, [studentId]: '' }));
    try {
      const response = await getReportCard(studentId, termId);
      const data = reportCardFrom(response.data);
      if (!data) throw new Error('The report-card response did not contain subject results.');
      setReportCards((current) => ({ ...current, [studentId]: data }));
    } catch (err) {
      setReportCards((current) => ({ ...current, [studentId]: null }));
      setResultsErrors((current) => ({
        ...current,
        [studentId]: errorMessage(err, 'Could not load this child’s results.'),
      }));
    } finally {
      setResultsLoading((current) => ({ ...current, [studentId]: false }));
    }
  };

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Family</p>
          <h2>My Child</h2>
        </div>
      </div>

      {loading && <p>Loading…</p>}
      {!loading && error && <p style={{ color: '#c0392b' }}>{error}</p>}

      {!loading && !error && children.length === 0 && (
        <div className="info-card">
          <p>No children are linked to your account yet. Contact the school administrator.</p>
        </div>
      )}

      {!loading && !error && children.map((child) => (
        <CollapsibleSection
          key={child.studentId ?? `${child.firstName || ''}-${child.lastName || ''}`}
          title={`${child.firstName || ''} ${child.lastName || ''}`.trim()}
          subtitle={`${child.className || 'No class assigned'}${child.classLocation ? ` · ${child.classLocation}` : ''}`}
          defaultOpen
        >
          <div className="info-card" style={{ marginBottom: '1rem' }}>
            <h3>Subjects & Teachers</h3>
            {!child.subjects?.length ? (
              <p>{assignmentsUnavailable ? 'Could not load class subject assignments.' : 'No subjects assigned yet.'}</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                    <th style={{ padding: '8px 4px' }}>Subject</th>
                    <th style={{ padding: '8px 4px' }}>Teacher</th>
                  </tr>
                </thead>
                <tbody>
                  {child.subjects?.map((s) => (
                    <tr key={s.subjectId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 4px' }}>{s.subjectName}</td>
                      <td style={{ padding: '8px 4px' }}>{s.teacherName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="info-card">
            <h3>Results</h3>
            {terms.length === 0 ? (
              <p>No terms are available to show results for.</p>
            ) : (
              <>
                <div className="toolbar">
                  <label>
                    Term
                    <select
                      value={selectedTerms[child.studentId] || ''}
                      onChange={(e) => {
                        setSelectedTerms((current) => ({ ...current, [child.studentId]: e.target.value }));
                        setReportCards((current) => ({ ...current, [child.studentId]: null }));
                        setResultsErrors((current) => ({ ...current, [child.studentId]: '' }));
                      }}
                    >
                      <option value="">Select a term</option>
                      {terms.map((term) => (
                        <option key={term.termId ?? term.id} value={term.termId ?? term.id}>
                          {[term.name, term.year].filter(Boolean).join(' · ')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => showResults(child)}
                    disabled={!selectedTerms[child.studentId] || resultsLoading[child.studentId]}
                  >
                    {resultsLoading[child.studentId] ? 'Loading results…' : 'View results'}
                  </button>
                </div>
                {resultsErrors[child.studentId] && (
                  <p role="alert" style={{ color: '#c0392b' }}>{resultsErrors[child.studentId]}</p>
                )}
                {reportCards[child.studentId] && (
                  <div>
                    <h4>Report card · {reportCards[child.studentId].studentName}</h4>
                    <p>{reportCards[child.studentId].className} · {reportCards[child.studentId].termName}</p>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '8px 4px' }}>Subject</th>
                            <th style={{ textAlign: 'left', padding: '8px 4px' }}>Mid-term %</th>
                            <th style={{ textAlign: 'left', padding: '8px 4px' }}>End-term %</th>
                            <th style={{ textAlign: 'left', padding: '8px 4px' }}>Final %</th>
                            <th style={{ textAlign: 'left', padding: '8px 4px' }}>Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(reportCards[child.studentId].subjects || []).map((subject) => (
                            <tr key={subject.subjectName} style={{ borderTop: '1px solid rgba(128,128,128,0.25)' }}>
                              <td style={{ padding: '8px 4px' }}>{subject.subjectName}</td>
                              <td style={{ padding: '8px 4px' }}>{cell(subject.midPercent)}</td>
                              <td style={{ padding: '8px 4px' }}>{cell(subject.endPercent)}</td>
                              <td style={{ padding: '8px 4px' }}>{cell(subject.finalPercent)}</td>
                              <td style={{ padding: '8px 4px' }}>{cell(subject.grade)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p>
                      <strong>Total:</strong> {cell(reportCards[child.studentId].totalPercent)}
                      {' · '}<strong>Average:</strong> {cell(reportCards[child.studentId].averagePercent)}%
                      {' · '}<strong>Grade:</strong> {cell(reportCards[child.studentId].grade)}
                    </p>
                    <p>
                      <strong>Position:</strong> {cell(reportCards[child.studentId].position)}
                      {' '}out of {cell(reportCards[child.studentId].classSize)}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </CollapsibleSection>
      ))}
    </div>
  );
}

export default MyChildPage;