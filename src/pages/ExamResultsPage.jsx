import { useEffect, useState } from 'react';
import { getExams, getResultSheet, saveResults, submitResults, reviewResults } from '../api';

const asList = (d, k) => [d?.[k], d?.data, d].find(Array.isArray) || [];
const today = new Date().toLocaleDateString('en-CA');          // YYYY-MM-DD, local time
const editable = (r) => ['NOT_STARTED', 'DRAFT', 'REJECTED'].includes(String(r.status || '').trim().toUpperCase());

export default function ExamResultsPage() {
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState('');
  const [sheet, setSheet] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    getExams()
      .then((r) => setExams(asList(r.data, 'exams').filter((e) => e.status === 'APPROVED' && e.examDate <= today)))
      .catch(() => setError('Could not load exams.'));
  }, []);

  const show = (data) => {
    setSheet(data);
    setRows(data.rows.map((r) => ({ ...r, marksObtained: r.marksObtained ?? '' })));
  };

  const open = async (id) => {
    setExamId(id); setSheet(null); setError(''); setNotice('');
    if (!id) return;
    try { show((await getResultSheet(id)).data); }
    catch (err) { setError(err.response?.data?.message || 'Could not load the mark sheet.'); }
  };

  const patch = (studentId, change) =>
    setRows(rows.map((r) => (r.studentId === studentId ? { ...r, ...change } : r)));

  const act = async (fn, okMessage) => {
    setError(''); setNotice('');
    try { show((await fn()).data); setNotice(okMessage); }
    catch (err) { setError(err.response?.data?.message || 'Action failed.'); }
  };

  const save = () => {
    const results = rows
      .filter((r) => editable(r) && (r.resultId || r.absent || r.marksObtained !== ''))
      .map((r) => ({
        studentId: r.studentId,
        version: r.version,
        marksObtained: r.absent || r.marksObtained === '' ? null : Number(r.marksObtained),
        absent: r.absent,
        remarks: r.remarks || '',
      }));
    if (results.length === 0) {
      setError('Enter marks or mark a student absent before saving.');
      setNotice('');
      return;
    }
    return act(() => saveResults(examId, { results }), 'Marks saved.');
  };

  const review = (approve) => {
    const comment = window.prompt(approve ? 'Comment (optional)' : 'Reason for rejection (required)');
    if (comment === null) return;
    act(() => reviewResults(examId, { approve, comment }), approve ? 'Results approved.' : 'Results rejected.');
  };

  const anyEditable = rows.some(editable);
  const anySubmitted = rows.some((r) => r.status === 'SUBMITTED');

  return (
    <div className="page-card">
      <div className="section-heading">
        <div><p className="eyebrow">Assessment</p><h2>Exam results</h2></div>
      </div>

      <div className="toolbar">
        <select value={examId} onChange={(e) => open(e.target.value)}>
          <option value="">Select an exam that has been sat</option>
          {exams.map((e) => (
            <option key={e.examId} value={e.examId}>
              {e.examDate} · {e.className} · {e.subjectName} ({e.examType.replace('_', ' ')})
            </option>
          ))}
        </select>
      </div>

      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {notice && <p className="info-card">{notice}</p>}

      {sheet && (
        <>
          <h3>{sheet.examName} <small>· Status: {sheet.resultsStatus} · Out of {sheet.totalMarks}</small></h3>
          <table>
            <thead>
              <tr><th>Student</th><th>Marks</th><th>Absent</th><th>%</th><th>Grade</th><th>Remarks</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.studentId}>
                  <td>{r.studentName}</td>
                  <td>
                    <input type="number" min="0" max={sheet.totalMarks} step="0.5" style={{ width: '5rem' }}
                      disabled={!editable(r) || r.absent} value={r.marksObtained}
                      onChange={(e) => patch(r.studentId, { marksObtained: e.target.value })} />
                  </td>
                  <td>
                    <input type="checkbox" disabled={!editable(r)} checked={r.absent}
                      onChange={(e) => patch(r.studentId, { absent: e.target.checked, marksObtained: '' })} />
                  </td>
                  <td>{r.percentage ?? '—'}</td>
                  <td>{r.grade ?? '—'}</td>
                  <td>
                    <input disabled={!editable(r)} value={r.remarks ?? r.reviewComment ?? ''}
                      onChange={(e) => patch(r.studentId, { remarks: e.target.value })} />
                  </td>
                  <td>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            {anyEditable && <button onClick={save}>Save marks</button>}
            {anyEditable && <button onClick={() => act(() => submitResults(examId), 'Submitted for approval.')}>Submit for approval</button>}
            {anySubmitted && <>
              <button onClick={() => review(true)}>Approve</button>
              <button className="secondary" onClick={() => review(false)}>Reject</button>
            </>}
          </div>
        </>
      )}
    </div>
  );
}