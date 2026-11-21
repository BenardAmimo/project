import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Modal from '../components/Modal';
import {
  getExams, getExamPeriods, getAssignments, createExam, updateExam,
  deleteExam, submitExam, reviewExam,
} from '../api';
import { isFutureDateTime, localDateString, localTimeString } from '../examDateTime';
import { explainExamConflict, getClassDailyLimit, listExamConflicts } from '../examSchedule';

const asList = (data, key) => {
  const candidates = [
    data?.[key],
    data?.data?.[key],
    data?.content,
    data?.items,
    data?.results,
    data?.data,
    data,
  ];
  return candidates.find(Array.isArray) || [];
};
const idOfAssignment = (a) => a.assignmentId ?? a.assignId ?? a.id;
const hm = (t) => (t ? t.slice(0, 5) : '—');
const errorMessage = (err, fallback) =>
  err.response?.data?.message || err.response?.data?.error || err.message || fallback;
const emptyForm = {
  version: null, name: '', assignmentId: '', examPeriodId: '',
  examDate: '', startTime: '', endTime: '', totalMarks: 100,
};

const ExamsPage = ({ user }) => {
  const [searchParams] = useSearchParams();
  const [allExams, setAllExams] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [periodId, setPeriodId] = useState(() => searchParams.get('examPeriodId') || '');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const role = String(user?.role ?? user?.roleName ?? '').trim().toUpperCase()
    .replace(/^ROLE_/, '').replace(/[\s-]+/g, '_');
  const canReschedule = role === 'ADMIN' || role === 'SUPER_ADMIN';

  const loadExams = async () => {
    // Always load every period so clashes with papers in other periods are caught too.
    const r = await getExams();
    setAllExams(asList(r.data, 'exams'));
  };

  useEffect(() => {
    Promise.allSettled([getExamPeriods(), getAssignments()]).then(([periodResult, assignmentResult]) => {
      if (periodResult.status === 'fulfilled') {
        setPeriods(asList(periodResult.value.data, 'examPeriods'));
      } else {
        setError((current) => [current, errorMessage(periodResult.reason, 'Could not load exam periods.')].filter(Boolean).join(' '));
      }
      if (assignmentResult.status === 'fulfilled') {
        setAssignments(asList(assignmentResult.value.data, 'assignments'));
      } else {
        setError((current) => [current, errorMessage(assignmentResult.reason, 'Could not load teaching assignments.')].filter(Boolean).join(' '));
      }
    });
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadExams()
      .catch((err) => active && setError(errorMessage(err, 'Could not load exams.')))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const exams = useMemo(() => (periodId
    ? allExams.filter((e) => String(e.examPeriodId ?? e.examPeriod?.examPeriodId) === String(periodId))
    : allExams), [allExams, periodId]);

  const clashes = useMemo(() => {
    const map = new Map();
    listExamConflicts(allExams).forEach(({ first, second, reasons }) => {
      if (!map.has(String(first.examId))) map.set(String(first.examId), { other: second, reasons });
      if (!map.has(String(second.examId))) map.set(String(second.examId), { other: first, reasons });
    });
    return map;
  }, [allExams]);

  const byDate = useMemo(() => {
    const q = search.trim().toLowerCase();
    const shown = exams.filter((e) => !q ||
      [e.name, e.className, e.subjectName, e.teacherName, e.status].filter(Boolean).join(' ').toLowerCase().includes(q));
    const groups = {};
    shown.forEach((e) => { (groups[e.examDate || 'Unscheduled'] ||= []).push(e); });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [exams, search]);

  const openCreate = () => {
    setForm({ ...emptyForm, examPeriodId: periodId }); setEditingId(null); setError(''); setOpen(true);
  };
  const openEdit = (e) => {
    if (!canReschedule) return;
    setForm({
      version: e.version, name: e.name, assignmentId: String(e.assignmentId),
      examPeriodId: String(e.examPeriodId), examDate: e.examDate,
      startTime: hm(e.startTime), endTime: hm(e.endTime), totalMarks: e.totalMarks,
    });
    setEditingId(e.examId); setError(''); setOpen(true);
  };

  const save = async (ev) => {
    ev.preventDefault();
    setError('');
    if (editingId != null && !canReschedule) {
      setError('Only an administrator can change an exam schedule.');
      return;
    }
    const now = new Date();
    if (!isFutureDateTime(form.examDate, form.startTime, now)) {
      setError('The exam date and start time must be in the future.');
      return;
    }
    if (form.endTime <= form.startTime) {
      setError('The end time must be later than the start time.');
      return;
    }
    const assignment = assignments.find((item) => String(idOfAssignment(item)) === String(form.assignmentId));
    const currentExam = exams.find((exam) => String(exam.examId) === String(editingId));
    const draft = {
      examId: editingId,
      examPeriodId: Number(form.examPeriodId) || currentExam?.examPeriodId,
      examDate: form.examDate,
      startTime: form.startTime,
      endTime: form.endTime,
      assignmentId: Number(form.assignmentId),
      assignment: assignment || currentExam?.assignment,
      classId: currentExam?.classId ?? assignment?.classId ?? assignment?.classesId,
      className: currentExam?.className ?? assignment?.className,
      teacherId: currentExam?.teacherId ?? assignment?.teacherId,
      teacherName: currentExam?.teacherName ?? assignment?.teacherName,
      teacher: currentExam?.teacher ?? assignment?.teacher,
    };
    const explained = explainExamConflict(draft, allExams);
    if (explained) {
      const { conflict } = explained;
      const reasons = explained.reasons.join(' and ');
      setError(`This schedule clashes with ${conflict.subjectName || conflict.name || 'another paper'} for ${conflict.className || 'another class'} (${reasons}). Choose a different date or time.`);
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      assignmentId: Number(form.assignmentId),
      examPeriodId: Number(form.examPeriodId),
      totalMarks: Number(form.totalMarks),
    };
    try {
      editingId != null ? await updateExam(editingId, payload) : await createExam(payload);
      setOpen(false);
      await loadExams();
    } catch (err) {
      setError(errorMessage(err, 'Could not save the exam.'));
    } finally {
      setSaving(false);
    }
  };

  const run = async (fn) => {
    setError('');
    try { await fn(); await loadExams(); }
    catch (err) { setError(errorMessage(err, 'Action failed.')); }
  };

  const review = (e, approve) => {
    const explained = approve ? explainExamConflict(e, allExams) : null;
    if (explained) {
      const { conflict } = explained;
      const reasons = explained.reasons.join(' and ');
      setError(`Cannot approve this paper: ${reasons} also has ${conflict.subjectName || conflict.name || 'another paper'} (${conflict.className || 'another class'}) at an overlapping time.`);
      return;
    }
    const comment = window.prompt(approve ? 'Comment (optional)' : 'Reason for rejection (required)');
    if (comment === null) return;
    run(() => reviewExam(e.examId, { version: e.version, approve, comment }));
  };

  const submit = (exam) => {
    const explained = explainExamConflict(exam, allExams);
    if (explained) {
      const { conflict } = explained;
      const reasons = explained.reasons.join(' and ');
      setError(`Cannot submit this paper: ${reasons} also has ${conflict.subjectName || conflict.name || 'another paper'} (${conflict.className || 'another class'}) at an overlapping time.`);
      return;
    }
    run(() => submitExam(exam.examId, exam.version));
  };

  const locked = (e) => e.status === 'APPROVED';
  const editingApprovedExam = exams.some((exam) =>
    String(exam.examId) === String(editingId) && locked(exam)
  );

  return (
    <div className="page-card">
      <div className="section-heading">
        <div><p className="eyebrow">Assessment</p><h2>Exam timetable</h2></div>
        <button onClick={openCreate}>Add single paper</button>
      </div>

      <div className="toolbar">
        <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
          <option value="">All exam periods</option>
          {periods.map((p) => <option key={p.examPeriodId} value={p.examPeriodId}>{p.name}</option>)}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search class, subject, teacher" />
      </div>

      <p className="info-card">
        Review each paper’s date and time here. A class sits at most {getClassDailyLimit()} papers per day (never two at the same time), a teacher cannot be assigned two papers at the same time, and each class and subject has one paper per period. Only administrators can change exam times.
      </p>
      {error && <p role="alert" style={{ color: '#c0392b' }}>{error}</p>}
      {loading && <p>Loading exams…</p>}
      {!loading && byDate.length === 0 && <div className="info-card"><p>No exams found. Create an exam period and generate its timetable, or add a paper manually.</p></div>}

      {!loading && byDate.map(([date, list]) => (
        <section key={date}>
          <h3>{date === 'Unscheduled' ? date : new Date(`${date}T00:00:00`).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</h3>
          <div className="grid-3">
            {list.map((e) => {
              const clash = clashes.get(String(e.examId));
              const scheduleConflict = clash?.other || null;
              const conflictReasons = clash?.reasons || [];
              return (
                <div key={e.examId} className="info-card">
                  <h4>{hm(e.startTime)} – {hm(e.endTime)} · {e.subjectName}</h4>
                  <p><strong>Class:</strong> {e.className}</p>
                  <p><strong>Teacher:</strong> {e.teacherName}</p>
                  {scheduleConflict && (
                    <p role="alert" style={{ color: '#b91c1c' }}>
                      Timetable clash ({conflictReasons.join(' and ')}): {scheduleConflict.subjectName || scheduleConflict.name || 'another paper'} for {scheduleConflict.className || 'another class'} is scheduled at {hm(scheduleConflict.startTime)}–{hm(scheduleConflict.endTime)}.
                    </p>
                  )}
                <p><strong>Period:</strong> {e.examPeriodName || '—'} ({e.examType?.replaceAll('_', ' ') || '—'})</p>
                <p><strong>Total marks:</strong> {e.totalMarks ?? '—'}</p>
                <p><strong>Status:</strong> {e.status || '—'}</p>
                {e.reviewComment && <p><strong>Comment:</strong> {e.reviewComment}</p>}
                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {(e.status === 'DRAFT' || e.status === 'REJECTED') &&
                    <button onClick={() => submit(e)}>Submit</button>}
                  {(e.status === 'DRAFT' || e.status === 'SUBMITTED') && <>
                    <button onClick={() => review(e, true)}>Approve</button>
                    <button className="secondary" onClick={() => review(e, false)}>Reject</button>
                  </>}
                  {canReschedule && (
                    <button className="secondary" onClick={() => openEdit(e)}>
                      {locked(e) ? 'Reschedule' : 'Edit'}
                    </button>
                  )}
                  {!locked(e) && <>
                    <button className="secondary"
                      onClick={() => window.confirm(`Delete "${e.name}"?`) && run(() => deleteExam(e.examId))}>Delete</button>
                  </>}
                </div>
              </div>
            );
          })}
          </div>
        </section>
      ))}

      <Modal isOpen={open} title={editingId != null ? 'Edit paper' : 'Add paper'} onClose={() => setOpen(false)}>
        <form className="modal-form" onSubmit={save}>
          <label>Exam period
            <select value={form.examPeriodId} disabled={editingId != null}
              onChange={(e) => setForm({ ...form, examPeriodId: e.target.value })} required>
              <option value="">Select period</option>
              {periods.map((p) => <option key={p.examPeriodId} value={p.examPeriodId}>{p.name}</option>)}
            </select>
            {!periods.length && <small>No exam periods are available. Create an exam period first.</small>}
          </label>
          <label>Class · subject · teacher
            <select value={form.assignmentId} disabled={editingId != null}
              onChange={(e) => setForm({ ...form, assignmentId: e.target.value })} required>
              <option value="">Select assignment</option>
              {assignments.map((a) => (
                <option key={idOfAssignment(a)} value={idOfAssignment(a)}>
                  {[a.className, a.subjectName, a.teacherName].filter(Boolean).join(' · ') || `Assignment ${idOfAssignment(a)}`}
                </option>
              ))}
            </select>
            {!assignments.length && <small>No teaching assignments are available to schedule.</small>}
          </label>
          <label>Name (optional) <input value={form.name} disabled={editingApprovedExam}
            onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Date <input type="date" min={localDateString()} value={form.examDate}
            onChange={(e) => setForm({ ...form, examDate: e.target.value })} required /></label>
          <label>Start time <input type="time"
            min={form.examDate === localDateString() ? localTimeString() : undefined}
            value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required /></label>
          <label>End time <input type="time" min={form.startTime || undefined}
            value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required /></label>
          <label>Total marks <input type="number" min="1" value={form.totalMarks} disabled={editingApprovedExam}
            onChange={(e) => setForm({ ...form, totalMarks: e.target.value })} required /></label>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" disabled={saving || !periods.length || !assignments.length}>
              {saving ? 'Saving…' : editingId != null ? 'Update' : 'Add'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default ExamsPage;