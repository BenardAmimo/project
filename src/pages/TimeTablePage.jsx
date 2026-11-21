import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Modal from '../components/Modal';
import CollapsibleSection from '../components/CollapsibleSection';
import {
  getClasses, getTeachers, getSubjects, getUsers,
  getTimetableSlots, createTimetableSlot, deleteTimetableSlot, generateLessons, getTerms,
} from '../api';
import { isAccountActive } from '../accountStatus';
import { isDateWithinTerm, termDateRange } from '../termDates';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const DAY_LABEL = { MONDAY: 'Monday', TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday', THURSDAY: 'Thursday', FRIDAY: 'Friday' };

const hhmm = (t) => (t || '').slice(0, 5);
const timeOverlaps = (start, end, otherStart, otherEnd) =>
  hhmm(start) < hhmm(otherEnd) && hhmm(end) > hhmm(otherStart);
const slotClassId = (slot) => slot.classesId ?? slot.classId ?? slot.classes?.classesId ?? slot.class?.classesId;
const slotTeacherId = (slot) => slot.teacherId ?? slot.teacher?.teacherId;
const classIdOf = (classItem) => classItem.classesId ?? classItem.classId ?? classItem.id ?? classItem.classroomId;
const classNameOf = (classItem) => classItem.name ?? classItem.className ?? classItem.grade ?? 'Unnamed class';
const findSlotConflict = (slot, slots) => slots.find((other) => {
  if (other === slot || (slot.timeTableSlotId != null && String(other.timeTableSlotId) === String(slot.timeTableSlotId))) return false;
  if (String(other.dayOfWeek).toUpperCase() !== String(slot.dayOfWeek).toUpperCase()) return false;
  if (!timeOverlaps(slot.startTime, slot.endTime, other.startTime, other.endTime)) return false;
  const sameClass = slotClassId(slot) != null && slotClassId(other) != null && String(slotClassId(slot)) === String(slotClassId(other));
  const sameTeacher = slotTeacherId(slot) != null && slotTeacherId(other) != null && String(slotTeacherId(slot)) === String(slotTeacherId(other));
  return sameClass || sameTeacher;
});
const getScheduleConflicts = (slots) => {
  const conflicts = [];
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      const first = slots[i];
      const second = slots[j];
      if (String(first.dayOfWeek).toUpperCase() !== String(second.dayOfWeek).toUpperCase()) continue;
      if (!timeOverlaps(first.startTime, first.endTime, second.startTime, second.endTime)) continue;
      const sameClass = slotClassId(first) != null && String(slotClassId(first)) === String(slotClassId(second));
      const sameTeacher = slotTeacherId(first) != null && String(slotTeacherId(first)) === String(slotTeacherId(second));
      if (sameClass || sameTeacher) conflicts.push({ first, second, sameClass, sameTeacher });
    }
  }
  return conflicts;
};
const apiErrorMessage = (err, fallback) =>
  err.response?.data?.message || err.response?.data?.error ||
  (err.response?.status === 403 ? 'The server denied this request (403 Forbidden).' :
    err.response?.status ? `Request failed (${err.response.status}).` : fallback);
const teacherLabel = (t) =>
  `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.teacherNo || `Teacher #${t.teacherId}`;
const normalizeEmail = (email) => (email || '').trim().toLowerCase();
const getList = (data, key) => {
  const candidates = [data?.[key], data?.data?.[key], data?.data, data];
  return candidates.find(Array.isArray) || [];
};
const isoDate = (d) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

const emptySlot = { classesId: '', subjectId: '', teacherId: '', days: ['MONDAY'], startTime: '08:00', endTime: '08:40' };

function TimetablePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [slots, setSlots] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [activeTeacherIds, setActiveTeacherIds] = useState(new Set());
  const [subjects, setSubjects] = useState([]);
  const [terms, setTerms] = useState([]);
  const [termsFailed, setTermsFailed] = useState(false);
  const [classFilter, setClassFilter] = useState(() => searchParams.get('classId') || '');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [slotOpen, setSlotOpen] = useState(false);
  const [form, setForm] = useState(emptySlot);
  const [saving, setSaving] = useState(false);
  const [slotError, setSlotError] = useState('');

  const [genOpen, setGenOpen] = useState(false);
  const [genForm, setGenForm] = useState({ termId: '', startDate: '', endDate: '' });
  const [genBusy, setGenBusy] = useState(false);
  const [genMessage, setGenMessage] = useState('');

  useEffect(() => {
    setClassFilter(searchParams.get('classId') || '');
    setTeacherFilter('');
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([getTimetableSlots(), getClasses(), getTeachers(), getSubjects(), getUsers(), getTerms()])
      .then(([s, c, t, sub, u, termResult]) => {
        if (!mounted) return;
        if (termResult.status === 'rejected') setTermsFailed(true);
        const responses = [s, c, t, sub, termResult];
        const setters = [setSlots, setClasses, setTeachers, setSubjects, setTerms];
        const keys = ['slots', 'classes', 'teachers', 'subjects', 'terms'];
        responses.forEach((result, index) => {
          if (result.status === 'fulfilled') setters[index](getList(result.value.data, keys[index]));
        });
        if (t.status === 'fulfilled') {
          const teacherList = getList(t.value.data, 'teachers');
          const users = u.status === 'fulfilled' ? getList(u.value.data, 'users') : [];
          const usersByEmail = new Map(users
            .filter((user) => user?.email)
            .map((user) => [normalizeEmail(user.email), user]));
          setActiveTeacherIds(new Set(teacherList
            .filter((teacher) => {
              const account = usersByEmail.get(normalizeEmail(teacher.email));
              return [account, teacher.user, teacher.account, teacher.userAccount, teacher]
                .some((candidate) => isAccountActive(candidate));
            })
            .map((teacher) => String(teacher.teacherId ?? teacher.id))));
        }
        const failed = [...responses, u]
          .map((result, index) => ({ result, name: ['lesson slots', 'classes', 'teachers', 'subjects', 'terms', 'teacher account statuses'][index] }))
          .filter(({ result }) => result.status === 'rejected');
        if (failed.length) {
          const failures = failed.map(({ result, name }) => {
            const status = result.reason?.response?.status;
            return `${name}${status ? ` (${status})` : ''}`;
          });
          const forbidden = failed.some(({ result }) => result.reason?.response?.status === 403);
          setError(forbidden
            ? `You do not have permission to load ${failures.join(', ')}. Please contact your administrator.`
            : `Could not load ${failures.join(', ')}.`);
        }
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const activeTeachers = teachers.filter((teacher) =>
    activeTeacherIds.has(String(teacher.teacherId ?? teacher.id))
  );

  const scheduleConflicts = useMemo(() => getScheduleConflicts(slots), [slots]);

  const teacherNameFor = (slot) => {
    const slotTeacherId = slot.teacherId ?? slot.teacher?.teacherId;
    const savedTeacher = teachers.find((item) => String(item.teacherId) === String(slotTeacherId));
    const teacher = slot.teacher || savedTeacher;
    return slot.teacherName || (teacher ? teacherLabel(teacher) : slotTeacherId != null ? `Teacher #${slotTeacherId}` : undefined);
  };

  const classNameFor = (slot) => {
    const classId = slotClassId(slot);
    const classItem = classes.find((item) => String(classIdOf(item)) === String(classId));
    return slot.className || slot.classes?.name || slot.class?.name || (classItem ? classNameOf(classItem) : `Class #${classId}`);
  };

  const byDay = useMemo(() => {
    const visible = slots.filter((s) =>
      String(slotClassId(s)) === classFilter &&
      (!teacherFilter || String(s.teacherId ?? s.teacher?.teacherId) === teacherFilter));
    const grouped = Object.fromEntries(DAYS.map((d) => [d, []]));
    visible.forEach((s) => grouped[s.dayOfWeek]?.push(s));
    DAYS.forEach((d) => grouped[d].sort((a, b) => hhmm(a.startTime).localeCompare(hhmm(b.startTime))));
    return grouped;
  }, [slots, classFilter, teacherFilter]);

  const openSlotModal = () => {
    setForm({ ...emptySlot, classesId: classFilter, teacherId: teacherFilter });
    setSlotError('');
    setSlotOpen(true);
  };

  const toggleDay = (day) =>
    setForm((f) => ({ ...f, days: f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day] }));

  // One submit can create the same lesson slot on several days (e.g. Mon/Wed/Fri).
  const handleSlotSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (form.days.length === 0) { setSlotError('Pick at least one day.'); return; }
    if (!form.classesId || !subjects.some((subject) => String(subject.subjectId ?? subject.id) === String(form.subjectId))) {
      setSlotError('Select a valid class and subject.');
      return;
    }
    if (!activeTeacherIds.has(String(form.teacherId))) {
      setSlotError('Only teachers with activated accounts can be assigned to lesson slots.');
      return;
    }
    if (hhmm(form.startTime) >= hhmm(form.endTime)) {
      setSlotError('The end time must be later than the start time.');
      return;
    }
    const conflicts = form.days.flatMap((day) => {
      const draft = { ...form, dayOfWeek: day };
      const conflict = findSlotConflict(draft, slots);
      if (!conflict) return [];
      const sameTeacher = slotTeacherId(draft) != null && String(slotTeacherId(draft)) === String(slotTeacherId(conflict));
      const reason = sameTeacher ? 'Teacher already has an overlapping lesson' : 'Class already has an overlapping lesson';
      return [`${DAY_LABEL[day]}: ${reason} (${hhmm(conflict.startTime)}–${hhmm(conflict.endTime)}).`];
    });
    if (conflicts.length) { setSlotError(conflicts.join('\n')); return; }
    setSaving(true);
    setSlotError('');
    const created = [];
    const failed = [];
    for (const day of form.days) {
      try {
        const res = await createTimetableSlot({
          classesId: Number(form.classesId),
          subjectId: Number(form.subjectId),
          teacherId: Number(form.teacherId),
          dayOfWeek: day,
          startTime: form.startTime,
          endTime: form.endTime,
        });
        created.push(res.data);
      } catch (err) {
        failed.push({ day, message: apiErrorMessage(err, 'Could not save.') });
      }
    }
    if (created.length) setSlots((cur) => [...cur, ...created]);
    if (failed.length === 0) {
      setSlotOpen(false);
    } else {
      // keep only the days that failed selected so the admin can fix and retry
      setForm((f) => ({ ...f, days: failed.map((x) => x.day) }));
      setSlotError(failed.map((x) => `${DAY_LABEL[x.day]}: ${x.message}`).join('\n'));
    }
    setSaving(false);
  };

  const handleDelete = async (slot) => {
    const ok = window.confirm(
      `Remove ${slot.subjectName} (${DAY_LABEL[slot.dayOfWeek]} ${hhmm(slot.startTime)})?\n\n` +
      'Upcoming lessons nobody has marked are removed. Past lessons and their attendance are kept.');
    if (!ok) return;
    try {
      await deleteTimetableSlot(slot.timeTableSlotId);
      setSlots((cur) => cur.filter((s) => s.timeTableSlotId !== slot.timeTableSlotId));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not remove the slot.');
    }
  };

  const openGenerate = () => {
    const today = isoDate(new Date());
    const availableTerms = terms.filter((term) => {
      const { startDate, endDate } = termDateRange(term);
      return startDate && endDate && startDate <= endDate;
    });
    const term = availableTerms.find((candidate) => isDateWithinTerm(today, candidate)) ||
      availableTerms.find((candidate) => termDateRange(candidate).startDate > today) ||
      availableTerms[0];
    if (!term) {
      setGenForm({ termId: '', startDate: '', endDate: '' });
      setGenMessage(termsFailed
        ? 'Could not load term dates. Refresh the page before generating lessons.'
        : 'Add a term with valid start and end dates before generating lessons.');
      setGenOpen(true);
      return;
    }
    const { startDate, endDate } = termDateRange(term);
    setGenForm({ termId: String(term.termId), startDate, endDate });
    setGenMessage('');
    setGenOpen(true);
  };

  const selectedTerm = terms.find((term) => String(term.termId) === genForm.termId);

  const selectGenerationTerm = (termId) => {
    const term = terms.find((candidate) => String(candidate.termId) === termId);
    const { startDate, endDate } = termDateRange(term);
    setGenForm({ termId, startDate, endDate });
    setGenMessage('');
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (genBusy) return;
    if (scheduleConflicts.length) {
      setGenMessage('Resolve all timetable scheduling conflicts before generating lessons.');
      return;
    }
    if (genForm.endDate < genForm.startDate) { setGenMessage('The end date must be on or after the start date.'); return; }
    if (!selectedTerm ||
        !isDateWithinTerm(genForm.startDate, selectedTerm) ||
        !isDateWithinTerm(genForm.endDate, selectedTerm)) {
      setGenMessage('Choose dates within the selected term.');
      return;
    }
    setGenBusy(true);
    setGenMessage('');
    try {
      const res = await generateLessons({ startDate: genForm.startDate, endDate: genForm.endDate });
      const n = res.data?.lessonsCreated ?? 0;
      setGenMessage(n === 0
        ? 'Nothing new to create — every lesson in that range already exists.'
        : `Created ${n} lesson${n === 1 ? '' : 's'}. Teachers can now take registers for them.`);
    } catch (err) {
      setGenMessage(err.response?.data?.message || 'Could not generate lessons.');
    } finally {
      setGenBusy(false);
    }
  };

  const selectedClass = classes.find((item) => String(classIdOf(item)) === classFilter);

  const selectClass = (classId) => {
    setClassFilter(classId);
    setTeacherFilter('');
    setSearchParams(classId ? { classId } : {});
  };

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Academics</p>
          <h2>Timetable</h2>
        </div>
        <div>
          <button className="secondary" onClick={openGenerate} disabled={loading}>Generate lessons</button>
          <button type="button" onClick={openSlotModal} style={{ marginLeft: '0.5rem' }} disabled={loading}>
            Add lesson slot
          </button>
        </div>
      </div>

      <div className="toolbar">
        <label className="timetable-class-select">
          <span>Select a class</span>
          <select value={classFilter} onChange={(e) => selectClass(e.target.value)} disabled={loading}>
            <option value="">Choose a class to view its timetable</option>
            {classes.map((c) => (
              <option key={classIdOf(c)} value={classIdOf(c)}>{classNameOf(c)}</option>
            ))}
          </select>
        </label>
        {classFilter && (
          <label className="timetable-teacher-select">
            <span>Filter by teacher</span>
            <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}>
              <option value="">All teachers</option>
              {teachers.map((t) => <option key={t.teacherId} value={t.teacherId}>{teacherLabel(t)}</option>)}
            </select>
          </label>
        )}
      </div>

      {error && <p style={{ color: '#c0392b' }}>{error}</p>}

      {!classFilter ? (
        <div className="info-card timetable-select-prompt">
          <h3>Choose a class to view its timetable</h3>
          <p>Select a class above to see its weekly lessons, subjects, and teachers.</p>
        </div>
      ) : (
        <CollapsibleSection
          title={`${selectedClass?.name || 'Class'} timetable`}
          subtitle="Weekly schedule for this class. Generate lessons to turn it into dated lessons."
          defaultOpen
        >
          {loading ? <p>Loading timetable…</p> : DAYS.every((day) => byDay[day].length === 0) ? (
            <div className="info-card">
              <p>No lesson slots for this class yet. Choose “Add lesson slot” to build its weekly schedule, then “Generate lessons” for the term.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
              {DAYS.map((day) => (
                <div key={day}>
                  <h3 style={{ marginBottom: '0.5rem' }}>{DAY_LABEL[day]}</h3>
                  {byDay[day].length === 0 ? (
                    <p style={{ opacity: 0.6 }}>Free</p>
                  ) : byDay[day].map((s) => (
                    <div key={s.timeTableSlotId} className="info-card" style={{ marginBottom: '0.5rem', border: findSlotConflict(s, slots) ? '1px solid #dc2626' : undefined }}>
                      <p><strong>{hhmm(s.startTime)}–{hhmm(s.endTime)}</strong></p>
                      <p>{s.subjectName || 'Subject not specified'}</p>
                      <p style={{ opacity: 0.75 }}>{teacherNameFor(s) || 'Teacher not specified'}</p>
                      {findSlotConflict(s, slots) && <p style={{ color: '#b91c1c' }}>Scheduling conflict: this teacher or class has another lesson at the same time.</p>}
                      <button className="secondary" onClick={() => handleDelete(s)}>Remove</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}

      <Modal isOpen={slotOpen} title="Add lesson slot" onClose={() => setSlotOpen(false)}>
        <form className="modal-form" onSubmit={handleSlotSubmit}>
          <label>
            Class
            <select value={form.classesId} onChange={(e) => setForm({ ...form, classesId: e.target.value })} required>
              <option value="">Select a class</option>
              {classes.map((c) => (
                <option key={classIdOf(c)} value={classIdOf(c)}>{classNameOf(c)}</option>
              ))}
            </select>
            {classes.length === 0 && <small>No classes are available. Create a class before adding a lesson slot.</small>}
          </label>
          <label>
            Subject
            <select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} required>
              <option value="">Select a subject</option>
              {subjects.map((s) => (
                <option key={s.subjectId ?? s.id} value={s.subjectId ?? s.id}>{s.name || s.subjectName}</option>
              ))}
            </select>
          </label>
          <label>
            Teacher
            <select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} required>
              <option value="">Select a teacher</option>
              {activeTeachers.map((t) => <option key={t.teacherId} value={t.teacherId}>{teacherLabel(t)}</option>)}
            </select>
            {activeTeachers.length === 0 && <small>No active teachers are available for lesson slots.</small>}
          </label>
          <fieldset style={{ border: 'none', padding: 0 }}>
            <legend>Repeat on</legend>
            {DAYS.map((d) => (
              <label key={d} className="checkbox-field" style={{ display: 'inline-flex', marginRight: '0.75rem' }}>
                <input type="checkbox" checked={form.days.includes(d)} onChange={() => toggleDay(d)} />
                {DAY_LABEL[d].slice(0, 3)}
              </label>
            ))}
          </fieldset>
          <label>
            Starts
            <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
          </label>
          <label>
            Ends
            <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
          </label>
          {slotError && <p style={{ color: '#c0392b', whiteSpace: 'pre-line' }}>{slotError}</p>}
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setSlotOpen(false)}>Cancel</button>
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save slot'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={genOpen} title="Generate lessons" onClose={() => setGenOpen(false)}>
        <form className="modal-form" onSubmit={handleGenerate}>
          <p>Creates a dated lesson for every weekly slot within the selected term (weekends skipped). Running it again only adds what’s missing. Teachers and classes cannot have overlapping lessons.</p>
          {scheduleConflicts.length > 0 && (
            <div role="alert" className="info-card" style={{ border: '1px solid #dc2626', color: '#b91c1c' }}>
              <strong>Fix {scheduleConflicts.length} timetable scheduling conflict{scheduleConflicts.length === 1 ? '' : 's'} before generating lessons:</strong>
              <ul>
                {scheduleConflicts.map(({ first, second, sameClass, sameTeacher }, index) => (
                  <li key={`${first.timeTableSlotId ?? index}-${second.timeTableSlotId ?? index}`}>
                    {DAY_LABEL[String(first.dayOfWeek).toUpperCase()] || first.dayOfWeek} {hhmm(first.startTime)}–{hhmm(first.endTime)}: {[
                      sameClass && `two lessons for ${classNameFor(first)}`,
                      sameTeacher && `teacher ${teacherNameFor(first) || `#${slotTeacherId(first)}`} assigned to both ${classNameFor(first)} and ${classNameFor(second)}`,
                    ].filter(Boolean).join('; ')}.
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label>
            Term
            <select value={genForm.termId} onChange={(e) => selectGenerationTerm(e.target.value)} required>
              <option value="">Select a term</option>
              {terms.filter((term) => {
                const { startDate, endDate } = termDateRange(term);
                return startDate && endDate && startDate <= endDate;
              }).map((term) => (
                <option key={term.termId} value={String(term.termId)}>{term.name} — {term.year}</option>
              ))}
            </select>
          </label>
          <label>
            From
            <input type="date" min={selectedTerm ? termDateRange(selectedTerm).startDate : undefined}
              max={selectedTerm ? termDateRange(selectedTerm).endDate : undefined}
              value={genForm.startDate}
              onChange={(e) => setGenForm({ ...genForm, startDate: e.target.value })} required disabled={!selectedTerm} />
          </label>
          <label>
            To
            <input type="date" min={selectedTerm ? termDateRange(selectedTerm).startDate : undefined}
              max={selectedTerm ? termDateRange(selectedTerm).endDate : undefined}
              value={genForm.endDate}
              onChange={(e) => setGenForm({ ...genForm, endDate: e.target.value })} required disabled={!selectedTerm} />
          </label>
          {genMessage && <p>{genMessage}</p>}
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setGenOpen(false)}>Close</button>
            <button type="submit" disabled={genBusy || !selectedTerm || scheduleConflicts.length > 0}>{genBusy ? 'Generating…' : 'Generate lessons'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default TimetablePage;