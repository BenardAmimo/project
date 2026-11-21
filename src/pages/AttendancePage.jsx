import { useEffect, useMemo, useState } from 'react';
import Modal from '../components/Modal';
import CollapsibleSection from '../components/CollapsibleSection';
import {
  getClasses, getTeachers, getSubjects, getStudents,
  getLessons, createAdHocLesson, generateLessons, getRegister, markAttendance, getStudentAttendance, getTerms,
} from '../api';
import { isDateWithinAnyTerm } from '../termDates';

const STATUSES = [
  { key: 'PRESENT', label: 'Present', color: '#16a34a' },
  { key: 'ABSENT', label: 'Absent', color: '#dc2626' },
  { key: 'LATE', label: 'Late', color: '#d97706' },
  { key: 'EXCUSED', label: 'Excused', color: '#2563eb' },
];

const unwrap = (res, key) => res.data?.[key] || res.data || [];
const hhmm = (t) => (t || '').slice(0, 5);
const today = () => new Date().toLocaleDateString('en-CA');
const teacherLabel = (t) =>
  `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.teacherNo || `Teacher #${t.teacherId}`;
const studentLabel = (s) => `${s.firstName || ''} ${s.lastName || ''}`.trim() || `Student #${s.studentId}`;
const prettyDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const lessonClassId = (lesson) => lesson.classesId ?? lesson.classId ?? lesson.classes?.classesId ?? lesson.class?.classesId;
const classIdOf = (classItem) => classItem.classesId ?? classItem.classId ?? classItem.id ?? classItem.classroomId;
const classNameOf = (classItem) => classItem.name ?? classItem.className ?? classItem.grade ?? 'Unnamed class';
const lessonTeacherId = (lesson) => lesson.teacherId ?? lesson.teacher?.teacherId;
const timeOverlaps = (start, end, otherStart, otherEnd) =>
  hhmm(start) < hhmm(otherEnd) && hhmm(end) > hhmm(otherStart);
const findLessonConflict = (lesson, lessons) => {
  const conflict = lessons.find((other) => {
    if (other === lesson || String(other.lessonId) === String(lesson.lessonId)) return false;
    if (!timeOverlaps(lesson.startTime, lesson.endTime, other.startTime, other.endTime)) return false;
    const sameTeacher = lessonTeacherId(lesson) != null && lessonTeacherId(other) != null && String(lessonTeacherId(lesson)) === String(lessonTeacherId(other));
    const sameClass = lessonClassId(lesson) != null && lessonClassId(other) != null && String(lessonClassId(lesson)) === String(lessonClassId(other));
    return sameTeacher || sameClass;
  });
  if (!conflict) return '';
  const sameTeacher = lessonTeacherId(lesson) != null && String(lessonTeacherId(lesson)) === String(lessonTeacherId(conflict));
  return sameTeacher
    ? `Scheduling conflict: ${lesson.teacherName || 'This teacher'} has another lesson from ${hhmm(conflict.startTime)}–${hhmm(conflict.endTime)}.`
    : `Scheduling conflict: ${lesson.className || 'This class'} has another lesson from ${hhmm(conflict.startTime)}–${hhmm(conflict.endTime)}.`;
};

function StatusButtons({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
      {STATUSES.map((s) => {
        const active = value === s.key;
        return (
          <button
            key={s.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(s.key)}
            style={{
              padding: '0.3rem 0.7rem', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${s.color}`,
              background: active ? s.color : 'transparent',
              color: active ? '#fff' : 'inherit',
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function AttendancePage() {
  const [tab, setTab] = useState('register');
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [terms, setTerms] = useState([]);
  const [termsLoaded, setTermsLoaded] = useState(false);
  const [termsFailed, setTermsFailed] = useState(false);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [error, setError] = useState('');

  // ---- register tab ----
  const [date, setDate] = useState(today());
  const [classFilter, setClassFilter] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [lessons, setLessons] = useState([]);
  const [lessonsLoading, setLessonsLoading] = useState(true);
  const [generatingDateLessons, setGeneratingDateLessons] = useState(false);
  const [dateGenerationMessage, setDateGenerationMessage] = useState('');
  const [active, setActive] = useState(null);       // lesson whose register is open
  const [register, setRegister] = useState([]);
  const [regLoading, setRegLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [adHocOpen, setAdHocOpen] = useState(false);
  const [adHocBusy, setAdHocBusy] = useState(false);
  const [adHoc, setAdHoc] = useState({ classesId: '', subjectId: '', teacherId: '', startTime: '08:00', endTime: '08:40' });
  const [adHocError, setAdHocError] = useState('');

  // ---- history tab ----
  const [studentId, setStudentId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    Promise.all([getClasses(), getTeachers(), getSubjects(), getStudents()])
      .then(([c, t, s, st]) => {
        setClasses(unwrap(c, 'classes'));
        setTeachers(unwrap(t, 'teachers'));
        setSubjects(unwrap(s, 'subjects'));
        setStudents(unwrap(st, 'students'));
      })
      .catch(() => setError('Could not load classes, teachers and students.'))
      .finally(() => setFiltersLoaded(true));
  }, []);

  useEffect(() => {
    getTerms()
      .then((res) => {
        const data = res.data?.terms || res.data?.data?.terms || res.data?.data || res.data;
        setTerms(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setTermsFailed(true);
        setError('Could not load terms. Lesson creation is unavailable until term dates can be verified.');
      })
      .finally(() => setTermsLoaded(true));
  }, []);

  const dateWithinTerm = isDateWithinAnyTerm(date, terms);

  const loadLessons = async () => {
    if (!classFilter) {
      setLessons([]);
      setLessonsLoading(false);
      setError('');
      return;
    }

    setLessonsLoading(true);
    try {
      const res = await getLessons({ date, classesId: classFilter });
      const lessonsForDate = unwrap(res, 'lessons');
      const lessonList = Array.isArray(lessonsForDate) ? lessonsForDate : [];
      setLessons(teacherFilter
        ? lessonList.filter((lesson) => String(lesson.teacherId ?? lesson.teacher?.teacherId) === teacherFilter)
        : lessonList);
      setError('');
    } catch (err) {
      setLessons([]);
      const status = err?.response?.status;
      setError(status === 403
        ? 'You do not have permission to view lessons. Please contact your administrator.'
        : `Could not load lessons${status ? ` (${status})` : ''}.`);
    } finally {
      setLessonsLoading(false);
    }
  };

  const generateLessonsForDate = async () => {
    if (generatingDateLessons || !termsLoaded || !dateWithinTerm) return;
    setGeneratingDateLessons(true);
    setDateGenerationMessage('');
    try {
      const response = await generateLessons({ startDate: date, endDate: date });
      await loadLessons();
      const created = Number(response.data?.lessonsCreated ?? 0);
      setDateGenerationMessage(created > 0
        ? `Created ${created} lesson${created === 1 ? '' : 's'} for this date.`
        : 'No new lessons were created. Check that a weekly timetable slot exists for this date and that lessons were not already generated.');
    } catch (err) {
      setDateGenerationMessage(err.response?.data?.message || 'Could not generate lessons for this date.');
    } finally {
      setGeneratingDateLessons(false);
    }
  };

  useEffect(() => {
    if (!filtersLoaded) return;
    setActive(null);
    setDateGenerationMessage('');
    loadLessons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, classFilter, teacherFilter, filtersLoaded]);

  const openRegister = async (lesson) => {
    setActive(lesson);
    setSaved('');
    setError('');
    setRegLoading(true);
    try {
      const res = await getRegister(lesson.lessonId);
      const savedMarks = unwrap(res, 'attendance');
      const existingMarks = Array.isArray(savedMarks) ? savedMarks : [];
      const lessonClassId = lesson.classesId ?? lesson.classId ?? lesson.classes?.classesId ?? lesson.class?.classesId;
      const lessonClassName = lesson.className ?? lesson.classes?.name ?? lesson.class?.name ?? '';
      const classRoster = students.filter((student) => {
        const studentClassId = student.classesId ?? student.classId ?? student.class_id ?? student.class?.classesId ?? student.classroom?.classesId ?? student.classroom?.id;
        if (lessonClassId != null && studentClassId != null) {
          return String(studentClassId) === String(lessonClassId);
        }
        const studentClassName = student.className ?? student.classesName ?? student.class?.name ?? student.classroom?.name ?? '';
        return !!lessonClassName && String(studentClassName).trim().toLowerCase() === String(lessonClassName).trim().toLowerCase();
      });
      const existingByStudentId = new Map(existingMarks.map((mark) => [String(mark.studentId), mark]));
      const rosterIds = new Set(classRoster.map((student) => String(student.studentId)));
      const completeRegister = classRoster.map((student) => {
        const savedMark = existingByStudentId.get(String(student.studentId));
        return {
          ...savedMark,
          studentId: student.studentId,
          studentName: savedMark?.studentName || student.studentName || `${student.firstName || ''} ${student.lastName || ''}`.trim() || studentLabel(student),
          status: savedMark?.status || '',
        };
      });
      existingMarks.forEach((mark) => {
        if (!rosterIds.has(String(mark.studentId))) completeRegister.push(mark);
      });
      setRegister(completeRegister);
    } catch (err) {
      setRegister([]);
      setError(err.response?.data?.message || 'Could not load the class list.');
    } finally {
      setRegLoading(false);
    }
  };

  const setStatus = (id, status) => {
    setSaved('');
    setRegister((cur) => cur.map((r) => (r.studentId === id ? { ...r, status } : r)));
  };

  const markAll = (status) => {
    setSaved('');
    setRegister((cur) => cur.map((r) => ({ ...r, status })));
  };

  const counts = useMemo(() => {
    const c = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, none: 0 };
    register.forEach((r) => { c[r.status || 'none'] += 1; });
    return c;
  }, [register]);

  const saveRegister = async () => {
    const marks = register.filter((r) => r.status).map((r) => ({ studentId: r.studentId, status: r.status }));
    if (marks.length === 0) { setError('Mark at least one student before saving.'); return; }
    setSaving(true);
    setError('');
    try {
      await markAttendance(active.lessonId, marks);
      setSaved(counts.none > 0
        ? `Saved. ${counts.none} student${counts.none === 1 ? ' is' : 's are'} still unmarked.`
        : 'Register saved.');
      loadLessons();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save the register.');
    } finally {
      setSaving(false);
    }
  };

  const openAdHoc = () => {
    setAdHoc({ classesId: classFilter, subjectId: '', teacherId: teacherFilter, startTime: '08:00', endTime: '08:40' });
    setAdHocError('');
    setAdHocOpen(true);
  };

  const submitAdHoc = async (e) => {
    e.preventDefault();
    if (adHocBusy) return;
    setAdHocError('');
    if (!termsLoaded || !dateWithinTerm) {
      setAdHocError('Lessons can only be created within a term date range.');
      return;
    }
    if (hhmm(adHoc.startTime) >= hhmm(adHoc.endTime)) {
      setAdHocError('The end time must be later than the start time.');
      return;
    }
    setAdHocBusy(true);
    try {
      const [classLessonsRes, teacherLessonsRes] = await Promise.all([
        getLessons({ date, classesId: adHoc.classesId }),
        getLessons({ date, teacherId: adHoc.teacherId }),
      ]);
      const possibleConflicts = [
        ...unwrap(classLessonsRes, 'lessons'),
        ...unwrap(teacherLessonsRes, 'lessons'),
      ];
      const uniqueLessons = [...new Map(possibleConflicts.map((lesson) => [String(lesson.lessonId), lesson])).values()];
      const draftLesson = {
        classesId: adHoc.classesId,
        teacherId: adHoc.teacherId,
        startTime: adHoc.startTime,
        endTime: adHoc.endTime,
      };
      const conflict = uniqueLessons.find((lesson) => {
        if (!timeOverlaps(draftLesson.startTime, draftLesson.endTime, lesson.startTime, lesson.endTime)) return false;
        const sameTeacher = lessonTeacherId(lesson) != null && String(lessonTeacherId(lesson)) === String(adHoc.teacherId);
        const sameClass = lessonClassId(lesson) != null && String(lessonClassId(lesson)) === String(adHoc.classesId);
        return sameTeacher || sameClass;
      });
      if (conflict) {
        const sameTeacher = lessonTeacherId(conflict) != null && String(lessonTeacherId(conflict)) === String(adHoc.teacherId);
        setAdHocError(sameTeacher
          ? `This teacher already has a lesson from ${hhmm(conflict.startTime)}–${hhmm(conflict.endTime)}.`
          : `This class already has a lesson from ${hhmm(conflict.startTime)}–${hhmm(conflict.endTime)}.`);
        return;
      }
      const res = await createAdHocLesson({
        classesId: Number(adHoc.classesId),
        subjectId: Number(adHoc.subjectId),
        teacherId: Number(adHoc.teacherId),
        date,
        startTime: adHoc.startTime,
        endTime: adHoc.endTime,
      });
      setAdHocOpen(false);
      await loadLessons();
      openRegister(res.data);
    } catch (err) {
      setAdHocError(err.response?.data?.message || 'Could not check the schedule or create the lesson.');
    } finally {
      setAdHocBusy(false);
    }
  };

  // history
  useEffect(() => {
    if (!studentId) { setHistory([]); return; }
    setHistoryLoading(true);
    getStudentAttendance(studentId, subjectId || undefined)
      .then((res) => setHistory(res.data || []))
      .catch(() => { setHistory([]); setError('Could not load attendance history.'); })
      .finally(() => setHistoryLoading(false));
  }, [studentId, subjectId]);

  const summary = useMemo(() => {
    const total = history.length;
    const attended = history.filter((h) => h.status === 'PRESENT' || h.status === 'LATE').length;
    return { total, rate: total ? Math.round((attended / total) * 100) : null };
  }, [history]);

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Academics</p>
          <h2>Attendance</h2>
        </div>
        <div className="attendance-view-switch" role="group" aria-label="Attendance view">
          <button type="button" aria-pressed={tab === 'register'} className={tab === 'register' ? '' : 'secondary'} onClick={() => setTab('register')}>Register</button>
          <button type="button" aria-pressed={tab === 'history'} className={tab === 'history' ? '' : 'secondary'} onClick={() => setTab('history')}>Student history</button>
        </div>
      </div>

      {error && <p style={{ color: '#c0392b' }}>{error}</p>}

      {tab === 'register' && (
        <>
          <div className="toolbar">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <label className="timetable-class-select">
              <span>Select a class to take attendance</span>
              <select
                value={classFilter}
                onChange={(e) => {
                  setClassFilter(e.target.value);
                  setTeacherFilter('');
                }}
                disabled={!filtersLoaded}
              >
                <option value="">Choose a class</option>
                {classes.map((c) => (
                  <option key={classIdOf(c)} value={classIdOf(c)}>{classNameOf(c)}</option>
                ))}
              </select>
            </label>
            {classFilter && (
              <select aria-label="Filter lessons by teacher" value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}>
                <option value="">All teachers</option>
                {teachers.map((t) => <option key={t.teacherId} value={t.teacherId}>{teacherLabel(t)}</option>)}
              </select>
            )}
            <button className="secondary" onClick={openAdHoc} disabled={!classFilter || !termsLoaded || !dateWithinTerm}>
              Add one-off lesson
            </button>
          </div>

          {!classFilter ? (
            <div className="info-card timetable-select-prompt">
              <h3>Choose a class to take attendance</h3>
              <p>Select a class above to see its lessons for the selected date and open the correct register.</p>
              {filtersLoaded && classes.length === 0 && <p>No classes are available. Add a class before taking attendance.</p>}
            </div>
          ) : (
          <>
          <CollapsibleSection title={`Lessons — ${prettyDate(date)}`} subtitle="Choose a lesson in this class to open its register" defaultOpen>
            {lessonsLoading ? <p>Loading lessons…</p> : lessons.length === 0 ? (
              <div className="info-card">
                <p>No lessons for this class on this date. Weekly timetable slots need to be generated into dated lessons before you can take attendance.</p>
                {dateWithinTerm ? (
                  <button onClick={generateLessonsForDate} disabled={generatingDateLessons || !termsLoaded}>
                    {generatingDateLessons ? 'Generating…' : `Generate lessons for ${prettyDate(date)}`}
                  </button>
                ) : (
                  <p>{!termsLoaded
                    ? 'Checking term dates before allowing lesson generation…'
                    : termsFailed
                      ? 'Term dates could not be verified, so lesson generation is unavailable.'
                      : 'Lessons can only be generated within a term date range.'}</p>
                )}
                {dateGenerationMessage && <p>{dateGenerationMessage}</p>}
                <p>Or add a one-off lesson for this date.</p>
              </div>
            ) : (
              <div className="grid-3">
                {lessons.map((l) => {
                  const studentCount = l.studentCount == null || l.studentCount === '' ? null : Number(l.studentCount);
                  const markedCount = l.markedCount == null || l.markedCount === '' ? null : Number(l.markedCount);
                  const countsAvailable = Number.isFinite(studentCount) && Number.isFinite(markedCount);
                  const done = countsAvailable && studentCount > 0 && markedCount >= studentCount;
                  const countLabel = !countsAvailable
                    ? 'Attendance count unavailable'
                    : markedCount === 0 ? 'Not marked yet' : `Marked ${markedCount} of ${studentCount}`;
                  const conflictMessage = findLessonConflict(l, lessons);
                  const isOpen = active?.lessonId === l.lessonId;
                  return (
                    <div key={l.lessonId} className="info-card" style={isOpen ? { outline: '2px solid #2563eb' } : conflictMessage ? { border: '1px solid #dc2626' } : undefined}>
                      <h3>{l.subjectName}</h3>
                      <p><strong>{hhmm(l.startTime)}–{hhmm(l.endTime)}</strong> · {l.className}</p>
                      <p>{l.teacherName}{l.adHoc ? ' · one-off' : ''}</p>
                      <p style={{ color: done ? '#16a34a' : 'inherit' }}>{countLabel}</p>
                      {conflictMessage && <p style={{ color: '#b91c1c' }}>{conflictMessage}</p>}
                      <button className="primary-button" style={{ width: '100%', marginTop: '0.5rem' }} onClick={() => openRegister(l)}>
                        {!countsAvailable || markedCount === 0 ? 'Take register' : 'Open register'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleSection>

          {active && (
            <CollapsibleSection
              title={`Register — ${active.subjectName}, ${active.className}`}
              subtitle={`${prettyDate(active.date)} · ${hhmm(active.startTime)}–${hhmm(active.endTime)}`}
              defaultOpen
            >
              {regLoading ? <p>Loading class list…</p> : register.length === 0 ? (
                <div className="info-card"><p>No students are assigned to {active.className} yet.</p></div>
              ) : (
                <>
                  <div className="toolbar">
                    <button className="secondary" onClick={() => markAll('PRESENT')}>Mark everyone present</button>
                    <span>
                      {STATUSES.map((s) => `${counts[s.key]} ${s.label.toLowerCase()}`).join(' · ')}
                      {counts.none > 0 ? ` · ${counts.none} unmarked` : ''}
                    </span>
                  </div>
                  {register.map((r) => (
                    <div key={r.studentId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', padding: '0.5rem 0', borderBottom: '1px solid rgba(128,128,128,0.25)' }}>
                      <span>{r.studentName}</span>
                      <StatusButtons value={r.status} onChange={(s) => setStatus(r.studentId, s)} />
                    </div>
                  ))}
                  <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button onClick={saveRegister} disabled={saving}>{saving ? 'Saving…' : 'Save register'}</button>
                    {saved && <span style={{ color: '#16a34a' }}>{saved}</span>}
                  </div>
                </>
              )}
            </CollapsibleSection>
          )}
          </>
          )}
        </>
      )}

      {tab === 'history' && (
        <>
          <div className="toolbar">
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Select a student</option>
              {students.map((s) => <option key={s.studentId} value={s.studentId}>{studentLabel(s)}</option>)}
            </select>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">All subjects</option>
              {subjects.map((s) => <option key={s.subjectId} value={s.subjectId}>{s.name}</option>)}
            </select>
          </div>

          <CollapsibleSection
            title="Attendance history"
            subtitle={summary.rate != null ? `${summary.rate}% attended across ${summary.total} lessons (present or late)` : 'Choose a student to see their record'}
            defaultOpen
          >
            {!studentId ? (
              <div className="info-card"><p>Select a student above.</p></div>
            ) : historyLoading ? <p>Loading history…</p> : history.length === 0 ? (
              <div className="info-card"><p>No attendance recorded for this student yet.</p></div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '0.4rem' }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '0.4rem' }}>Subject</th>
                      <th style={{ textAlign: 'left', padding: '0.4rem' }}>Class</th>
                      <th style={{ textAlign: 'left', padding: '0.4rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => {
                      const st = STATUSES.find((s) => s.key === h.status);
                      return (
                        <tr key={h.attendanceId} style={{ borderTop: '1px solid rgba(128,128,128,0.25)' }}>
                          <td style={{ padding: '0.4rem' }}>{prettyDate(h.lessonDate)}</td>
                          <td style={{ padding: '0.4rem' }}>{h.subjectName}</td>
                          <td style={{ padding: '0.4rem' }}>{h.className}</td>
                          <td style={{ padding: '0.4rem', color: st?.color, fontWeight: 600 }}>{st?.label || h.status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsibleSection>
        </>
      )}

      <Modal isOpen={adHocOpen} title={`One-off lesson — ${prettyDate(date)}`} onClose={() => setAdHocOpen(false)}>
        <form className="modal-form" onSubmit={submitAdHoc}>
          <label>
            Class
            <select value={adHoc.classesId} onChange={(e) => setAdHoc({ ...adHoc, classesId: e.target.value })} required>
              <option value="">Select a class</option>
              {classes.map((c) => (
                <option key={classIdOf(c)} value={classIdOf(c)}>{classNameOf(c)}</option>
              ))}
            </select>
          </label>
          <label>
            Subject
            <select value={adHoc.subjectId} onChange={(e) => setAdHoc({ ...adHoc, subjectId: e.target.value })} required>
              <option value="">Select a subject</option>
              {subjects.map((s) => <option key={s.subjectId} value={s.subjectId}>{s.name}</option>)}
            </select>
          </label>
          <label>
            Teacher
            <select value={adHoc.teacherId} onChange={(e) => setAdHoc({ ...adHoc, teacherId: e.target.value })} required>
              <option value="">Select a teacher</option>
              {teachers.map((t) => <option key={t.teacherId} value={t.teacherId}>{teacherLabel(t)}</option>)}
            </select>
          </label>
          <label>
            Starts
            <input type="time" value={adHoc.startTime} onChange={(e) => setAdHoc({ ...adHoc, startTime: e.target.value })} required />
          </label>
          <label>
            Ends
            <input type="time" value={adHoc.endTime} onChange={(e) => setAdHoc({ ...adHoc, endTime: e.target.value })} required />
          </label>
          {adHocError && <p style={{ color: '#c0392b' }}>{adHocError}</p>}
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setAdHocOpen(false)}>Cancel</button>
            <button type="submit" disabled={adHocBusy}>{adHocBusy ? 'Checking schedule…' : 'Create and open register'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default AttendancePage;