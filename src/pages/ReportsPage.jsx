import { useEffect, useState } from 'react';
import { getTerms, getClasses, getClassRanking, getBestStudents, getReportCard } from '../api';

const asList = (data, keys) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key];
  }
  return data.data && typeof data.data === 'object' ? asList(data.data, keys) : [];
};
const cell = (v) => (v == null ? '—' : v);
const classIdOf = (item) => item.classesId ?? item.classId ?? item.id;
const classNameOf = (item) => item.name ?? item.className ?? `Class #${classIdOf(item)}`;
const scoreOf = (value) => Number.parseFloat(value) || 0;
const studentsOf = (value) => Array.isArray(value) ? value : value ? [value] : [];
const studentNamesOf = (value) => studentsOf(value)
  .map((student) => typeof student === 'string' ? student : student?.studentName ?? student?.name)
  .filter(Boolean);

export default function ReportsPage() {
  const [terms, setTerms] = useState([]);
  const [classes, setClasses] = useState([]);
  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('');
  const [basis, setBasis] = useState('');                 // '' = combined
  const [ranking, setRanking] = useState([]);
  const [best, setBest] = useState([]);
  const [card, setCard] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([getTerms(), getClasses()])
      .then(([t, c]) => {
        setTerms(asList(t.data, ['terms', 'items', 'results']));
        setClasses(asList(c.data, ['classes', 'items', 'results']));
      })
      .catch(() => setError('Could not load terms and classes.'));
  }, []);

  const run = async () => {
    setError('');
    setCard(null);
    setRanking([]);
    setBest([]);
    setLoading(true);
    try {
      const selectedClasses = classId
        ? classes.filter((item) => String(classIdOf(item)) === String(classId))
        : classes;
      const reports = await Promise.all(selectedClasses.map(async (classItem) => {
        const id = classIdOf(classItem);
        const [rankingResponse, bestResponse] = await Promise.all([
          getClassRanking(id, termId),
          getBestStudents(id, termId, basis),
        ]);
        return {
          className: classNameOf(classItem),
          ranking: asList(rankingResponse.data, ['ranking', 'students', 'results', 'items']),
          best: asList(bestResponse.data, ['bestStudents', 'subjects', 'results', 'items']),
        };
      }));

      const rankingByStudent = new Map();
      reports.flatMap((report) => report.ranking.map((item) => ({ ...item, className: item.className || report.className })))
        .forEach((item) => {
          const key = item.studentId ?? `${item.className}:${item.studentName}`;
          if (!rankingByStudent.has(key)) rankingByStudent.set(key, item);
        });
      const schoolRanking = [...rankingByStudent.values()]
        .sort((a, b) => scoreOf(b.averagePercent) - scoreOf(a.averagePercent) ||
          String(a.studentName || '').localeCompare(String(b.studentName || '')))
        .map((item, index) => ({ ...item, position: index + 1 }));

      const bestBySubject = new Map();
      reports.flatMap((report) => report.best).forEach((item) => {
        const subjectName = item.subjectName ?? item.subject?.name ?? 'Unknown subject';
        const percent = scoreOf(item.percent);
        const current = bestBySubject.get(subjectName);
        const students = studentNamesOf(item.students ?? item.studentName);
        if (!current || percent > current.percent) {
          bestBySubject.set(subjectName, { subjectName, percent: item.percent, score: percent, students });
        } else if (percent === current.score) {
          current.students = [...new Set([...current.students, ...students])];
        }
      });

      setRanking(classId
        ? (reports[0]?.ranking || [])
        : schoolRanking);
      setBest([...bestBySubject.values()].map(({ score, ...item }) => item));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load the reports.');
    } finally {
      setLoading(false);
    }
  };

  const openCard = async (studentId) => {
    try { setCard((await getReportCard(studentId, termId)).data); }
    catch (err) { setError(err.response?.data?.message || 'Could not load the report card.'); }
  };

  return (
    <div className="page-card">
      <div className="section-heading"><div><p className="eyebrow">Assessment</p><h2>Reports</h2></div></div>

      <div className="toolbar">
        <select value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">Term</option>
          {terms.map((t) => <option key={t.termId ?? t.id} value={t.termId ?? t.id}>{[t.name, t.year].filter(Boolean).join(' · ')}</option>)}
        </select>
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All classes · school-wide</option>
          {classes.map((c) => <option key={classIdOf(c)} value={classIdOf(c)}>{classNameOf(c)}</option>)}
        </select>
        <select value={basis} onChange={(e) => setBasis(e.target.value)}>
          <option value="">Best student: combined</option>
          <option value="MID_TERM">Mid-term only</option>
          <option value="END_TERM">End-term only</option>
        </select>
        <button disabled={!termId || loading || (!classId && classes.length === 0)} onClick={run}>
          {loading ? 'Loading…' : 'Show'}
        </button>
      </div>

      {error && <p style={{ color: '#c0392b' }}>{error}</p>}

      {ranking.length > 0 && (
        <>
          <h3>{classId ? 'Class ranking' : 'School-wide overall ranking'}</h3>
          <table>
            <thead><tr><th>Pos</th><th>Student</th>{!classId && <th>Class</th>}<th>Average %</th><th>Grade</th><th></th></tr></thead>
            <tbody>{ranking.map((r) => (
              <tr key={r.studentId}>
                <td>{r.position}</td><td>{r.studentName}</td>{!classId && <td>{r.className}</td>}
                <td>{r.averagePercent}</td><td>{r.grade}</td>
                <td><button className="secondary" onClick={() => openCard(r.studentId)}>Report card</button></td>
              </tr>
            ))}</tbody>
          </table>
        </>
      )}

      {best.length > 0 && (
        <>
          <h3>Best student per subject</h3>
          <table>
            <thead><tr><th>Subject</th><th>Student(s)</th><th>Score %</th></tr></thead>
            <tbody>{best.map((b) => (
              <tr key={b.subjectName}><td>{b.subjectName}</td><td>{studentNamesOf(b.students).join(', ')}</td><td>{b.percent}</td></tr>
            ))}</tbody>
          </table>
        </>
      )}

      {!loading && !error && (ranking.length > 0 || best.length > 0) === false && termId && (
        <p className="info-card">No overall results are available for this term and selection yet.</p>
      )}

      {card && (
        <div className="info-card" style={{ marginTop: '1.5rem' }}>
          <h3>Report card · {card.studentName}</h3>
          <p>{card.className} · {card.termName}</p>
          <table>
            <thead><tr><th>Subject</th><th>Mid-term %</th><th>End-term %</th><th>Final %</th><th>Grade</th></tr></thead>
            <tbody>{card.subjects.map((s) => (
              <tr key={s.subjectName}>
                <td>{s.subjectName}</td><td>{cell(s.midPercent)}</td><td>{cell(s.endPercent)}</td>
                <td>{cell(s.finalPercent)}</td><td>{cell(s.grade)}</td>
              </tr>
            ))}</tbody>
          </table>
          <p><strong>Total:</strong> {card.totalPercent} · <strong>Average:</strong> {cell(card.averagePercent)}% ·
            <strong> Grade:</strong> {cell(card.grade)}</p>
          <p><strong>Position:</strong> {cell(card.position)} out of {card.classSize}</p>
          <button className="secondary" onClick={() => window.print()}>Print</button>
        </div>
      )}
    </div>
  );
}