import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal';
import {
  getExamPeriods, createExamPeriod, updateExamPeriod, deleteExamPeriod,
  generateExamTimetable, getTerms, getExams, updateExam, deleteExam,
} from '../api';
import { isDateWithinTerm, termDateRange } from '../termDates';
import { isFutureDateTime, localDateString, localTimeString } from '../examDateTime';
import {
  explainExamConflict, getClassDailyLimit, setClassDailyLimit, listExamConflicts, placeExamInWindows,
} from '../examSchedule';

const emptyForm = {
  version: null, name: '', examType: 'MID_TERM', termId: '',
  startDate: '', endDate: '', windows: [],
};
const emptyWindow = { date: '', startTime: '14:00', endTime: '17:00' };
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
const errorMessage = (err, fallback) =>
  err.response?.data?.message || err.response?.data?.error || err.message || fallback;
const examPeriodIdOf = (exam) => exam.examPeriodId ?? exam.examPeriod?.examPeriodId;
const examIdOf = (exam) => exam?.examId ?? exam?.id;
const displayExam = (exam) => `${exam.className || 'Class'} · ${exam.subjectName || exam.name || 'Paper'}`;
const isMovable = (exam) => ['DRAFT', 'REJECTED'].includes(String(exam.status || '').trim().toUpperCase());

const ExamPeriodsPage = () => {
  const [periods, setPeriods] = useState([]);
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [generatedPeriodId, setGeneratedPeriodId] = useState('');
  const [gen, setGen] = useState({ defaultDurationMinutes: 60, breakMinutes: 15, maxPapersPerDay: getClassDailyLimit(), totalMarks: 100 });

  const load = async () => {
    const [p, t] = await Promise.all([getExamPeriods(), getTerms()]);
    setPeriods(asList(p.data, 'examPeriods'));
    setTerms(asList(t.data, 'terms'));
  };
  useEffect(() => {
    load()
      .catch((err) => setError(errorMessage(err, 'Could not load exam periods and terms.')))
      .finally(() => setLoading(false));
  }, []);

  const openCreate = () => { setForm(emptyForm); setEditingId(null); setError(''); setOpen(true); };
  const openEdit = (p) => {
    setForm({
      version: p.version, name: p.name, examType: p.examType, termId: String(p.termId),
      startDate: p.startDate, endDate: p.endDate,
      windows: (Array.isArray(p.windows) ? p.windows : []).map((w) => ({
        ...w,
        startTime: w.startTime?.slice(0, 5) || '',
        endTime: w.endTime?.slice(0, 5) || '',
      })),
    });
    setEditingId(p.examPeriodId); setError(''); setOpen(true);
  };

  const setWindow = (i, patch) =>
    setForm({ ...form, windows: form.windows.map((w, idx) => (idx === i ? { ...w, ...patch } : w)) });

  const selectedTerm = terms.find((term) =>
    String(term.termId ?? term.id) === String(form.termId)
  );
  const termDates = termDateRange(selectedTerm);

  const setPeriodDate = (field, value) => {
    if (value && !isDateWithinTerm(value, selectedTerm)) {
      setError('Exam period dates must be within the selected term dates.');
      return;
    }
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
  };

  const setExamWindowDate = (index, value) => {
    if (value && (value < form.startDate || value > form.endDate ||
        !isDateWithinTerm(value, selectedTerm))) {
      setError('Exam window dates must be within the exam period and selected term.');
      return;
    }
    setWindow(index, { date: value });
    setError('');
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (!selectedTerm ||
        !isDateWithinTerm(form.startDate, selectedTerm) ||
        !isDateWithinTerm(form.endDate, selectedTerm)) {
      setError('Exam period dates must be within the selected term dates.');
      return;
    }
    if (form.endDate < form.startDate) {
      setError('The end date must be on or after the start date.');
      return;
    }
    if (form.windows.some((window) => window.date < form.startDate || window.date > form.endDate)) {
      setError('Every exam window date must be within the exam period.');
      return;
    }
    if (form.windows.some((window) =>
      !isFutureDateTime(window.date, window.startTime) || window.endTime <= window.startTime
    )) {
      setError('Every exam window must start in the future and end after it starts.');
      return;
    }
    setSaving(true);
    const payload = { ...form, termId: Number(form.termId) };
    try {
      editingId != null ? await updateExamPeriod(editingId, payload) : await createExamPeriod(payload);
      setOpen(false);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not save the exam period.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    try { await deleteExamPeriod(p.examPeriodId); await load(); }
    catch (err) { setError(errorMessage(err, 'Could not delete the exam period.')); }
  };

  const generate = async (p) => {
    setNotice(''); setError(''); setGeneratedPeriodId('');
    const windows = Array.isArray(p.windows) ? p.windows : [];
    if (!windows.length) {
      setError('Add at least one exam window to this period (Edit → + Add window) before generating a timetable.');
      return;
    }
    // Hard rules: a class sits at most `maxPapersPerClassPerDay` papers a day (never two at once),
    // a teacher is never double-booked, and `breakMinutes` is kept between papers.
    const rules = {
      breakMinutes: Math.max(0, Number(gen.breakMinutes) || 0),
      maxPapersPerClassPerDay: Math.max(1, Math.floor(Number(gen.maxPapersPerDay)) || 1),
    };
    const periodKey = String(p.examPeriodId);
    const inPeriod = (exam) => String(examPeriodIdOf(exam)) === periodKey;
    const byTime = (a, b) =>
      String(a.examDate || '').localeCompare(String(b.examDate || '')) ||
      String(a.startTime || '').localeCompare(String(b.startTime || '')) ||
      String(a.examId || '').localeCompare(String(b.examId || ''));

    try {
      const { data: beforeData } = await getExams();
      const existingExamIds = new Set(asList(beforeData, 'exams').map((exam) => String(examIdOf(exam))));
      const { data } = await generateExamTimetable(p.examPeriodId, gen);
      const created = Array.isArray(data?.created) ? data.created : [];
      const { data: examsData } = await getExams();
      const allExams = asList(examsData, 'exams');
      const createdExamIds = new Set([
        ...created.map(examIdOf),
        ...allExams
          .filter((exam) => !existingExamIds.has(String(examIdOf(exam))))
          .map(examIdOf),
      ].filter((id) => id != null).map(String));
      const isNew = (exam) => createdExamIds.has(String(examIdOf(exam)));
      const createdCount = Math.max(Number(data?.createdCount ?? created.length) || 0, createdExamIds.size);

      const periodExams = allExams.filter(inPeriod);
      const generatedExams = periodExams.length ? periodExams : created;
      const fixedExams = allExams.filter((exam) => !inPeriod(exam) || !isMovable(exam));
      const occupied = [...fixedExams];

      // 1. Drop newly generated papers that duplicate a class+subject already in this period.
      const assignmentKey = (exam) => {
        const id = exam.assignmentId ?? exam.assignment?.assignmentId ?? exam.assignment?.assignId;
        return id == null ? '' : `${id}|${examPeriodIdOf(exam) ?? periodKey}`;
      };
      const seenAssignments = new Set(fixedExams.map(assignmentKey).filter(Boolean));
      const duplicates = [];
      const movableExams = [];
      generatedExams
        .filter(isMovable)
        .sort((a, b) => Number(isNew(a)) - Number(isNew(b)) || byTime(a, b)) // keep older papers first
        .forEach((exam) => {
          const key = assignmentKey(exam);
          if (key && seenAssignments.has(key) && isNew(exam)) { duplicates.push(exam); return; }
          if (key) seenAssignments.add(key);
          movableExams.push(exam);
        });
      movableExams.sort(byTime);

      const unplaced = Array.isArray(data?.unplaced) ? [...data.unplaced] : [];
      const rescheduleFailures = [];
      const removalFailures = [];
      let movedCount = 0;
      let droppedCount = 0;
      let duplicateCount = 0;

      for (const exam of duplicates) {
        try {
          await deleteExam(examIdOf(exam));
          duplicateCount += 1;
        } catch (err) {
          removalFailures.push(`${displayExam(exam)} (duplicate: ${errorMessage(err, 'could not remove')})`);
          occupied.push(exam);
        }
      }

      // 2. Place every remaining draft so that no rule is broken.
      for (const exam of movableExams) {
        const placement = placeExamInWindows(exam, windows, occupied, gen.defaultDurationMinutes, rules);
        if (!placement) {
          const explained = explainExamConflict(exam, occupied, rules);
          if (explained) {
            const reasons = explained.reasons.join(' and ');
            const description = `${displayExam(exam)} (${reasons})`;
            if (isNew(exam)) {
              try {
                await deleteExam(examIdOf(exam));
                droppedCount += 1;
                unplaced.push(`${description} — not added because no conflict-free slot was available`);
              } catch (err) {
                removalFailures.push(`${description} (${errorMessage(err, 'could not remove newly generated draft')})`);
                unplaced.push(`${description} — still conflicts`);
                occupied.push(exam);
              }
            } else {
              unplaced.push(`${description} — no conflict-free slot is available; existing exam was kept`);
              occupied.push(exam);
            }
          } else {
            unplaced.push(displayExam(exam));
            occupied.push(exam);
          }
          continue;
        }

        const moved = placement.examDate !== exam.examDate ||
          placement.startTime.slice(0, 5) !== String(exam.startTime || '').slice(0, 5) ||
          placement.endTime.slice(0, 5) !== String(exam.endTime || '').slice(0, 5);
        const scheduledExam = { ...exam, ...placement };
        if (moved) {
          const assignmentId = exam.assignmentId ?? exam.assignment?.assignmentId ?? exam.assignment?.assignId;
          const periodId = examPeriodIdOf(exam) ?? p.examPeriodId;
          try {
            if (exam.examId == null || assignmentId == null) throw new Error('missing exam or assignment ID');
            await updateExam(exam.examId, {
              version: exam.version,
              name: exam.name || '',
              assignmentId: Number(assignmentId),
              examPeriodId: Number(periodId),
              examDate: placement.examDate,
              startTime: placement.startTime,
              endTime: placement.endTime,
              totalMarks: Number(exam.totalMarks ?? gen.totalMarks),
            });
            movedCount += 1;
            occupied.push(scheduledExam);
          } catch (err) {
            rescheduleFailures.push(`${displayExam(exam)} (${errorMessage(err, 'update failed')})`);
            occupied.push(exam);
          }
        } else {
          occupied.push(scheduledExam);
        }
      }

      // 3. Re-read everything and report anything that still breaks a rule.
      const { data: refreshedData } = await getExams();
      const remainingConflicts = listExamConflicts(asList(refreshedData, 'exams'), rules)
        .filter(({ first, second }) => inPeriod(first) || inPeriod(second))
        .map(({ first, second, reasons }) =>
          `${displayExam(first)} vs ${displayExam(second)} (${reasons.join(' and ')})`);

      const scheduled = Math.max(0, createdCount - droppedCount - duplicateCount);
      const parts = [`${scheduled} paper${scheduled === 1 ? '' : 's'} scheduled.`];
      if (movedCount) parts.push(`${movedCount} paper${movedCount === 1 ? ' was' : 's were'} moved to avoid class or teacher clashes.`);
      if (duplicateCount) parts.push(`${duplicateCount} duplicate paper${duplicateCount === 1 ? ' was' : 's were'} removed (each class and subject gets one paper per period).`);
      if (unplaced.length) parts.push(`Could not place: ${unplaced.join('; ')}. Add more exam windows or raise the max papers per class per day.`);
      if (rescheduleFailures.length) parts.push(`Could not automatically reschedule: ${rescheduleFailures.join('; ')}. An administrator must change those times.`);
      if (removalFailures.length) parts.push(`Could not remove conflicting drafts: ${removalFailures.join('; ')}.`);
      if (remainingConflicts.length) {
        const shown = remainingConflicts.slice(0, 10).join('; ');
        const more = remainingConflicts.length > 10 ? ` (+${remainingConflicts.length - 10} more)` : '';
        parts.push(`Timetable clashes still exist: ${shown}${more}.`);
      } else if (!removalFailures.length) {
        parts.push('No class or teacher clashes remain.');
      }
      setGeneratedPeriodId(periodKey);
      setNotice(parts.join(' '));
    } catch (err) {
      setError(errorMessage(err, 'The timetable may have been generated, but could not be verified and rescheduled. Refresh the exam timetable and resolve any remaining clashes.'));
    }
  };

  return (
    <div className="page-card">
      <div className="section-heading">
        <div><p className="eyebrow">Assessment</p><h2>Exam periods</h2></div>
        <button onClick={openCreate}>New exam period</button>
      </div>

      <div className="toolbar">
        <label>Paper length (min) <input type="number" min="15" value={gen.defaultDurationMinutes}
          onChange={(e) => setGen({ ...gen, defaultDurationMinutes: Number(e.target.value) })} /></label>
        <label>Break (min) <input type="number" min="0" value={gen.breakMinutes}
          onChange={(e) => setGen({ ...gen, breakMinutes: Number(e.target.value) })} /></label>
        <label>Max papers per class/day <input type="number" min="1" value={gen.maxPapersPerDay}
          onChange={(e) => {
            const value = Math.max(1, Math.floor(Number(e.target.value)) || 1);
            setClassDailyLimit(value);
            setGen({ ...gen, maxPapersPerDay: value });
          }} /></label>
        <label>Total marks <input type="number" min="1" value={gen.totalMarks}
          onChange={(e) => setGen({ ...gen, totalMarks: Number(e.target.value) })} /></label>
      </div>

      <p className="info-card">
        Rules applied when generating: a class sits at most the max papers per class/day above (never two at the same time), a teacher is never in two papers at the same time, the break above is kept between papers, and each class and subject gets one paper per period.
      </p>
      {error && <p role="alert" style={{ color: '#c0392b' }}>{error}</p>}
      {notice && (
        <p className="info-card">
          {notice}{' '}
          {generatedPeriodId && (
            <Link to={`/home/exams?examPeriodId=${encodeURIComponent(generatedPeriodId)}`}>
              Review paper times and teacher conflicts
            </Link>
          )}
        </p>
      )}

      <div className="grid-3">
        {loading && <p>Loading exam periods…</p>}
        {!loading && periods.length === 0 && (
          <div className="info-card"><p>No exam periods found. Create a period to start scheduling exams.</p></div>
        )}
        {!loading && periods.map((p) => (
          <div key={p.examPeriodId} className="info-card">
            <h3>{p.name}</h3>
            <p><strong>Type:</strong> {p.examType?.replaceAll('_', ' ') || '—'}</p>
            <p><strong>Term:</strong> {p.termName || terms.find((term) => String(term.termId ?? term.id) === String(p.termId))?.name || '—'}</p>
            <p><strong>Dates:</strong> {p.startDate || '—'} – {p.endDate || '—'}</p>
            <p><strong>Windows:</strong></p>
            <ul>{(Array.isArray(p.windows) ? p.windows : []).map((w, i) => (
              <li key={i}>{w.date || '—'} · {w.startTime?.slice(0, 5) || '—'}–{w.endTime?.slice(0, 5) || '—'}</li>
            ))}</ul>
            <button onClick={() => generate(p)}>Generate timetable</button>
            <button className="secondary" onClick={() => openEdit(p)} style={{ marginLeft: '0.5rem' }}>Edit</button>
            <button className="secondary" onClick={() => remove(p)} style={{ marginLeft: '0.5rem' }}>Delete</button>
          </div>
        ))}
      </div>

      <Modal isOpen={open} title={editingId != null ? 'Edit exam period' : 'New exam period'} onClose={() => setOpen(false)}>
        <form className="modal-form" onSubmit={save}>
          <label>Name <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Term
            <select value={form.termId} disabled={editingId != null}
              onChange={(e) => {
                setForm({ ...form, termId: e.target.value, startDate: '', endDate: '', windows: [] });
                setError('');
              }} required>
              <option value="">Select term</option>
              {terms.map((t) => (
                <option key={t.termId ?? t.id} value={t.termId ?? t.id}>
                  {[t.name, t.year].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
            {!terms.length && <small>No terms are available. Create a term before adding an exam period.</small>}
          </label>
          <label>Type
            <select value={form.examType} onChange={(e) => setForm({ ...form, examType: e.target.value })}>
              <option value="MID_TERM">MID TERM</option>
              <option value="END_TERM">END TERM</option>
            </select>
          </label>
          <label>Start date <input type="date" min={termDates.startDate || undefined}
            max={termDates.endDate || undefined} value={form.startDate}
            onChange={(e) => setPeriodDate('startDate', e.target.value)} required disabled={!selectedTerm} /></label>
          <label>End date <input type="date" min={form.startDate || termDates.startDate || undefined}
            max={termDates.endDate || undefined} value={form.endDate}
            onChange={(e) => setPeriodDate('endDate', e.target.value)} required disabled={!selectedTerm} /></label>

          <p><strong>Exam windows</strong> (available date and time ranges; the generator places papers within these windows)</p>
          {form.windows.map((w, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input type="date" value={w.date}
                min={[localDateString(), form.startDate, termDates.startDate].filter(Boolean).sort().pop()}
                max={form.endDate || termDates.endDate || undefined}
                onChange={(e) => setExamWindowDate(i, e.target.value)} required
                disabled={!selectedTerm || !form.startDate || !form.endDate} />
              <input type="time" value={w.startTime}
                min={w.date === localDateString() ? localTimeString() : undefined}
                onChange={(e) => setWindow(i, { startTime: e.target.value })} required />
              <input type="time" value={w.endTime} min={w.startTime || undefined}
                onChange={(e) => setWindow(i, { endTime: e.target.value })} required />
              <button type="button" className="secondary"
                onClick={() => setForm({ ...form, windows: form.windows.filter((_, idx) => idx !== i) })}>✕</button>
            </div>
          ))}
          <button type="button" className="secondary"
            onClick={() => setForm({ ...form, windows: [...form.windows, { ...emptyWindow }] })}>+ Add window</button>

          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" disabled={saving || !selectedTerm}>{saving ? 'Saving…' : editingId != null ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default ExamPeriodsPage;