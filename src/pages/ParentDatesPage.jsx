import { useEffect, useState } from 'react';
import { getExams, getMyChildren, getTerms, getClasses } from '../api';

const toArray = (payload, keys) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return payload.data && typeof payload.data === 'object' ? toArray(payload.data, keys) : [];
};

const studentIdOf = (value) =>
  value?.studentId ?? value?.id ?? value?.student?.studentId ?? value?.student?.id;
const classIdOf = (value) =>
  value?.classesId ?? value?.classId ?? value?.classroomId ?? value?.class_id ??
  value?.class?.classesId ?? value?.class?.classId ?? value?.classes?.classesId ??
  value?.classroom?.id;
const normalizeName = (value) =>
  value == null ? '' : String(value).trim().replace(/\s+/g, ' ').toLowerCase();
const classNameOf = (value) =>
  value?.className ?? value?.classesName ?? value?.class?.name ?? value?.classes?.name ??
  value?.classroom?.name ?? '';
const formatDate = (value, includeWeekday = false) => {
  if (!value) return '—';
  const datePart = String(value).slice(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  if (!year || !month || !day) return datePart;
  return new Date(year, month - 1, day).toLocaleDateString('en-KE', {
    ...(includeWeekday ? { weekday: 'long' } : {}),
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};
const timeOf = (value) => value ? String(value).slice(0, 5) : '';
const examDateOf = (exam) => exam.examDate ?? exam.date;
const examRequestError = (err) => {
  const status = err.response?.status;
  const serverMessage = err.response?.data?.message || err.response?.data?.error;
  if (status === 401) {
    return 'The server rejected the exam timetable request (401). Please sign in again.';
  }
  if (status === 403) {
    return 'The server does not allow parent access to the exam timetable (403). The backend must provide a parent-scoped list of approved exams for linked children.';
  }
  if (status) {
    return `Could not load the exam timetable (${status})${serverMessage ? `: ${serverMessage}` : '.'}`;
  }
  return serverMessage || err.message || 'Could not load the exam timetable. Check the connection to the school server.';
};
const examClassMatchesChild = (exam, child) => {
  const examClassId = classIdOf(exam);
  const childClassId = classIdOf(child);
  if (examClassId != null && childClassId != null) {
    return String(examClassId) === String(childClassId);
  }
  const examClassName = classNameOf(exam);
  const childClassName = classNameOf(child);
  return Boolean(examClassName && childClassName &&
    normalizeName(examClassName) === normalizeName(childClassName));
};

function ParentDatesPage() {
  const [terms, setTerms] = useState([]);
  const [children, setChildren] = useState([]);
  const [exams, setExams] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([getTerms(), getMyChildren(), getExams(), getClasses()])
      .then(([termsResult, childrenResult, examsResult, classesResult]) => {
        if (!mounted) return;
        if (termsResult.status === 'fulfilled') {
          setTerms(toArray(termsResult.value.data, ['terms', 'items', 'results']));
        } else {
          setErrors((current) => ({ ...current, terms: 'Could not load term dates.' }));
        }

        if (childrenResult.status === 'fulfilled') {
          const classes = classesResult.status === 'fulfilled'
            ? toArray(classesResult.value.data, ['classes', 'items', 'results'])
            : [];
          setChildren(toArray(childrenResult.value.data, ['children', 'students']).map((child) => ({
            ...child,
            studentId: studentIdOf(child),
            className: classNameOf(child) ||
              classes.find((item) => String(classIdOf(item)) === String(classIdOf(child)))?.name || '',
          })));
        } else {
          setErrors((current) => ({ ...current, children: 'Could not load your linked children.' }));
        }

        if (examsResult.status === 'fulfilled') {
          setExams(toArray(examsResult.value.data, ['exams', 'items', 'results'])
            .filter((exam) => String(exam.status || '').toUpperCase() === 'APPROVED'));
        } else {
          setErrors((current) => ({ ...current, exams: examRequestError(examsResult.reason) }));
        }
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Family</p>
          <h2>Term & Exam Dates</h2>
        </div>
      </div>

      {loading && <p>Loading dates…</p>}
      <section aria-label="Term dates">
        <h3>Term dates</h3>
        {errors.terms ? <p role="alert">{errors.terms}</p> : terms.length === 0 ? (
          !loading && <p>No term dates are available.</p>
        ) : (
          <div className="grid-3">
            {terms.map((term) => (
              <div className="info-card" key={term.termId ?? term.id}>
                <h4>{[term.name, term.year].filter(Boolean).join(' · ') || 'Term'}</h4>
                <p><strong>Starts:</strong> {formatDate(term.startDate)}</p>
                <p><strong>Ends:</strong> {formatDate(term.endDate)}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Exam dates" style={{ marginTop: '1.5rem' }}>
        <h3>Exam timetable</h3>
        {errors.exams && <p role="alert">{errors.exams}</p>}
        {errors.children && <p role="alert">{errors.children}</p>}
        {!errors.exams && !errors.children && !loading && children.length === 0 && (
          <p>No children are linked to your account.</p>
        )}
        {!errors.exams && !errors.children && children.map((child) => {
          const childExams = exams
            .filter((exam) => examClassMatchesChild(exam, child))
            .sort((a, b) => String(examDateOf(a) || '').localeCompare(String(examDateOf(b) || '')) ||
              timeOf(a.startTime).localeCompare(timeOf(b.startTime)));
          return (
            <section key={child.studentId ?? `${child.firstName || ''}-${child.lastName || ''}`}>
              <h4>
                {`${child.firstName || ''} ${child.lastName || ''}`.trim()}
                {child.className ? ` · ${child.className}` : ''}
              </h4>
              {!child.className && classIdOf(child) == null ? (
                <p>No class is assigned to this child yet.</p>
              ) : childExams.length === 0 ? (
                <p>No published exams are scheduled for this class yet.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                        <th style={{ padding: '8px 4px' }}>Date</th>
                        <th style={{ padding: '8px 4px' }}>Subject</th>
                        <th style={{ padding: '8px 4px' }}>Time</th>
                        <th style={{ padding: '8px 4px' }}>Exam period</th>
                      </tr>
                    </thead>
                    <tbody>
                      {childExams.map((exam) => (
                        <tr key={exam.examId ?? `${examDateOf(exam)}-${exam.subjectName}-${exam.startTime}`}>
                          <td style={{ padding: '8px 4px' }}>{formatDate(examDateOf(exam), true)}</td>
                          <td style={{ padding: '8px 4px' }}>{exam.subjectName || exam.name || '—'}</td>
                          <td style={{ padding: '8px 4px' }}>
                            {timeOf(exam.startTime) || '—'}–{timeOf(exam.endTime) || '—'}
                          </td>
                          <td style={{ padding: '8px 4px' }}>{exam.examPeriodName || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </section>
    </div>
  );
}

export default ParentDatesPage;
