// Scheduling rules enforced everywhere (generator, manual edits, submit/approve):
//   1. A class sits at most N papers per day (N = class daily limit, default 3),
//      never two at overlapping times, with `rules.breakMinutes` between papers.
//   2. A teacher can never have two papers at overlapping times
//      (also keeping `rules.breakMinutes` free between papers).
//   3. An assignment (class + subject + teacher) has at most ONE paper per exam period.

export const DEFAULT_MAX_PAPERS_PER_CLASS_PER_DAY = 3;
const LIMIT_STORAGE_KEY = 'exam.maxPapersPerClassPerDay';

export const getClassDailyLimit = () => {
  try {
    const value = Number(globalThis.localStorage?.getItem(LIMIT_STORAGE_KEY));
    return Number.isInteger(value) && value >= 1 ? value : DEFAULT_MAX_PAPERS_PER_CLASS_PER_DAY;
  } catch {
    return DEFAULT_MAX_PAPERS_PER_CLASS_PER_DAY;
  }
};

export const setClassDailyLimit = (value) => {
  try { globalThis.localStorage?.setItem(LIMIT_STORAGE_KEY, String(value)); } catch { /* ignore */ }
};

const normalizeRules = (rules = {}) => {
  const limit = Math.floor(Number(rules.maxPapersPerClassPerDay));
  return {
    breakMinutes: Math.max(0, Number(rules.breakMinutes) || 0),
    maxPapersPerClassPerDay: Number.isFinite(limit) && limit >= 1 ? limit : getClassDailyLimit(),
  };
};

const SLOT_STEP_MINUTES = 5;

const timeMinutes = (value) => {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
};

const normalizeIdentity = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const classIdentity = (exam) => {
  const id = exam.classId ?? exam.classesId ?? exam.class?.classesId ?? exam.class?.classId ??
    exam.classes?.classesId ?? exam.classes?.classId ??
    exam.assignment?.classId ?? exam.assignment?.classesId ??
    exam.assignment?.classes?.classesId ?? exam.assignment?.classes?.classId ??
    exam.assignment?.class?.classesId ?? exam.assignment?.class?.classId;
  if (id != null) return `id:${id}`;
  const name = exam.className ?? exam.classesName ?? exam.class?.name ?? exam.classes?.name ??
    exam.assignment?.className ?? exam.assignment?.classesName ??
    exam.assignment?.classes?.name ?? exam.assignment?.class?.name;
  return name ? `name:${normalizeIdentity(name)}` : '';
};

const teacherIdentity = (exam) => {
  const id = exam.teacherId ?? exam.teacher?.teacherId ?? exam.teacher?.id ??
    exam.assignment?.teacherId ?? exam.assignment?.teacher?.teacherId ??
    exam.assignment?.teacher?.id;
  if (id != null) return `id:${id}`;
  const name = exam.teacherName || exam.teacher?.name ||
    [exam.teacher?.firstName, exam.teacher?.lastName].filter(Boolean).join(' ') ||
    exam.assignment?.teacherName || exam.assignment?.teacher?.name ||
    [exam.assignment?.teacher?.firstName, exam.assignment?.teacher?.lastName].filter(Boolean).join(' ');
  return name?.trim() ? `name:${normalizeIdentity(name)}` : '';
};

const assignmentIdentity = (exam) => {
  const id = exam.assignmentId ?? exam.assignment?.assignmentId ??
    exam.assignment?.assignId ?? exam.assignment?.id;
  return id != null ? `id:${id}` : '';
};

const periodIdentity = (exam) => {
  const id = exam.examPeriodId ?? exam.examPeriod?.examPeriodId;
  return id != null ? String(id) : '';
};

const examKey = (exam) => exam?.examId ?? exam?.id;
const isSameExam = (a, b) => examKey(a) != null && examKey(b) != null &&
  String(examKey(a)) === String(examKey(b));

const timesClash = (first, second, breakMinutes) => {
  const firstStart = timeMinutes(first.startTime);
  const firstEnd = timeMinutes(first.endTime);
  const secondStart = timeMinutes(second.startTime);
  const secondEnd = timeMinutes(second.endTime);
  if ([firstStart, firstEnd, secondStart, secondEnd].some((time) => time == null)) return false;
  return firstStart < secondEnd + breakMinutes && secondStart < firstEnd + breakMinutes;
};

/**
 * Pairwise reasons two papers cannot both stand. Empty array = no clash.
 * (The per-class daily limit is a group rule; see explainExamConflict.)
 */
export const getExamConflictReasons = (first, second, rules = {}) => {
  if (!first || !second || isSameExam(first, second)) return [];
  const { breakMinutes } = normalizeRules(rules);
  const reasons = [];

  const assignment = assignmentIdentity(first);
  const period = periodIdentity(first);
  if (assignment && assignment === assignmentIdentity(second) &&
      period && period === periodIdentity(second)) {
    reasons.push('duplicate paper for the same class and subject');
  }

  if (first.examDate && first.examDate === second.examDate &&
      timesClash(first, second, breakMinutes)) {
    const firstClass = classIdentity(first);
    if (firstClass && firstClass === classIdentity(second)) reasons.push('same class at the same time');
    const firstTeacher = teacherIdentity(first);
    if (firstTeacher && firstTeacher === teacherIdentity(second)) reasons.push('same teacher');
  }
  return reasons;
};

const classDayPeers = (exam, pool) => {
  const cls = classIdentity(exam);
  if (!cls || !exam.examDate) return [];
  return pool.filter((other) =>
    !isSameExam(exam, other) && other.examDate === exam.examDate && classIdentity(other) === cls);
};

/** First rule `exam` breaks against `pool`: { conflict, reasons } or null. */
export const explainExamConflict = (exam, pool, rules = {}) => {
  const r = normalizeRules(rules);
  for (const other of pool) {
    const reasons = getExamConflictReasons(exam, other, r);
    if (reasons.length) return { conflict: other, reasons };
  }
  const peers = classDayPeers(exam, pool);
  if (peers.length >= r.maxPapersPerClassPerDay) {
    return {
      conflict: peers[0],
      reasons: [`class would have more than ${r.maxPapersPerClassPerDay} papers that day`],
    };
  }
  return null;
};

export const findExamScheduleConflict = (exam, exams, rules = {}) =>
  explainExamConflict(exam, exams, rules)?.conflict || null;

/** Every clashing pair in a list: [{ first, second, reasons }]. Avoids a full O(n²) scan. */
export const listExamConflicts = (exams, rules = {}) => {
  const r = normalizeRules(rules);
  const buckets = new Map();
  const classDays = new Map();
  const addTo = (map, key, index) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(index);
  };
  exams.forEach((exam, index) => {
    if (exam.examDate) {
      addTo(buckets, `date:${exam.examDate}`, index);
      const cls = classIdentity(exam);
      if (cls) addTo(classDays, `${cls}|${exam.examDate}`, index);
    }
    const assignment = assignmentIdentity(exam);
    const period = periodIdentity(exam);
    if (assignment && period) addTo(buckets, `assign:${assignment}|${period}`, index);
  });

  const seen = new Set();
  const conflicts = [];
  buckets.forEach((indexes) => {
    for (let a = 0; a < indexes.length; a += 1) {
      for (let b = a + 1; b < indexes.length; b += 1) {
        const [i, j] = indexes[a] < indexes[b] ? [indexes[a], indexes[b]] : [indexes[b], indexes[a]];
        const pairKey = `${i}:${j}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const reasons = getExamConflictReasons(exams[i], exams[j], r);
        if (reasons.length) conflicts.push({ first: exams[i], second: exams[j], reasons });
      }
    }
  });
  classDays.forEach((indexes) => {
    if (indexes.length <= r.maxPapersPerClassPerDay) return;
    for (let k = 1; k < indexes.length; k += 1) {
      conflicts.push({
        first: exams[indexes[k]],
        second: exams[indexes[0]],
        reasons: [`class has ${indexes.length} papers that day (limit ${r.maxPapersPerClassPerDay})`],
      });
    }
  });
  return conflicts;
};

const formatTime = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;

const fitsWindow = (exam, window, duration) => {
  const start = timeMinutes(exam.startTime);
  const end = timeMinutes(exam.endTime);
  const windowStart = timeMinutes(window.startTime);
  const windowEnd = timeMinutes(window.endTime);
  return exam.examDate === window.date && start != null && end != null &&
    windowStart != null && windowEnd != null && start >= windowStart &&
    end <= windowEnd && end - start === duration;
};

// Only papers that share a class, teacher or assignment with `exam` can ever clash with it,
// so filter once and test candidate slots against that short list.
const relevantTo = (exam, occupied) => {
  const cls = classIdentity(exam);
  const teacher = teacherIdentity(exam);
  const assignment = assignmentIdentity(exam);
  return occupied.filter((other) =>
    !isSameExam(exam, other) && (
      (cls && cls === classIdentity(other)) ||
      (teacher && teacher === teacherIdentity(other)) ||
      (assignment && assignment === assignmentIdentity(other))
    ));
};

const isAvailable = (candidate, relevant, rules) =>
  relevant.every((other) => getExamConflictReasons(candidate, other, rules).length === 0) &&
  classDayPeers(candidate, relevant).length < rules.maxPapersPerClassPerDay;

export const placeExamInWindows = (
  exam, windows, occupied, defaultDurationMinutes = 60, rules = {},
) => {
  const originalStart = timeMinutes(exam.startTime);
  const originalEnd = timeMinutes(exam.endTime);
  const duration = originalStart != null && originalEnd != null && originalEnd > originalStart
    ? originalEnd - originalStart
    : defaultDurationMinutes;
  if (!Number.isFinite(duration) || duration <= 0) return null;

  const r = normalizeRules(rules);
  const relevant = relevantTo(exam, occupied);

  const validWindows = windows
    .map((window) => ({
      ...window,
      windowStart: timeMinutes(window.startTime),
      windowEnd: timeMinutes(window.endTime),
    }))
    .filter((window) =>
      window.date && window.windowStart != null && window.windowEnd != null &&
      window.windowEnd - window.windowStart >= duration
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.windowStart - b.windowStart);

  const originalWindow = validWindows.find((window) => fitsWindow(exam, window, duration));
  if (originalWindow && isAvailable(exam, relevant, r)) {
    return { examDate: exam.examDate, startTime: exam.startTime, endTime: exam.endTime };
  }

  for (const window of validWindows) {
    for (let start = window.windowStart; start + duration <= window.windowEnd; start += SLOT_STEP_MINUTES) {
      const candidate = {
        ...exam,
        examDate: window.date,
        startTime: formatTime(start),
        endTime: formatTime(start + duration),
      };
      if (isAvailable(candidate, relevant, r)) {
        return {
          examDate: candidate.examDate,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
        };
      }
    }
  }

  return null;
};