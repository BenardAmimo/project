import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
if (!API_BASE_URL) {
  console.error('VITE_API_BASE_URL is not set. API calls will fail.');
}

const api = axios.create({ baseURL: API_BASE_URL });

/* ------------------------------------------------------------------ */
/* Auth plumbing                                                       */
/* ------------------------------------------------------------------ */

// Kept for compatibility with existing callers.
export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

const PUBLIC_PATHS = ['/login', '/complete-registration', '/invite-valid'];
const isPublicUrl = (url = '') => PUBLIC_PATHS.some((p) => url.startsWith(p));

// Attach the token to every request, except public endpoints. A stale token
// sent to /login can make a JWT filter reject the request before it is handled.
api.interceptors.request.use((config) => {
  if (isPublicUrl(config.url)) {
    delete config.headers.Authorization;
    return config;
  }
  if (!config.headers.Authorization) {
    const token = sessionStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Keep the app session intact when a resource endpoint rejects one request.
// Endpoint-specific authorization failures should be shown by the page, not
// treated as a global logout.
api.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(err)
);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const normalizeRoleForBackend = (role) =>
  role ? role.toString().trim().replace(/\s+/g, '_').toUpperCase() : role;

const normalizeGenderForBackend = (gender) =>
  gender == null || gender === ''
    ? gender
    : gender.toString().trim().replace(/\s+/g, '_').toUpperCase();

const normalizePersonPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;
  const copy = { ...payload };
  if (copy.gender !== undefined) copy.gender = normalizeGenderForBackend(copy.gender);
  if (copy.age !== undefined && copy.age !== null && copy.age !== '') copy.age = Number(copy.age);
  return copy;
};

/* ------------------------------------------------------------------ */
/* Auth / users                                                        */
/* ------------------------------------------------------------------ */

// Your LoginRequest uses `email`, so that is the only identifier we send.
// `username` is accepted as an alias for older callers.
export const login = ({ email, username, password }) =>
  api.post('/login', { email: email || username || '', password });

// Pass the same idempotencyKey again when RETRYING the same submit.
export const inviteUser = async (data, idempotencyKey = newIdempotencyKey()) => {
  try {
    return await api.post(
      '/admin/invite-user',
      {
        ...normalizePersonPayload(data),
        enabled: data.enabled ?? false,
        role: normalizeRoleForBackend(data.role),
      },
      { headers: { 'Idempotency-Key': idempotencyKey } }
    );
  } catch (error) {
    if (!error.response) error.inviteStatusUnknown = true;
    throw error;
  }
};

// Body must be { code, username, password }. `code` is the long token from the invite link
// (read it from the URL, e.g. ?code=...). Do not ask the user to type it.
export const setupPassword = ({ code, username, password }) =>
  api.post('/complete-registration', { code, username, password });

export const checkInvite = (code) => api.post('/invite-valid', { code });

// SUPER_ADMIN only. Replaces the old invite for an account that has not been activated yet.
export const resendInvite = (email) => api.post('/admin/resend-invite', { email });

// Needs GET /me in UserController (snippet in the review notes).
export const currentUser = () => api.get('/me');
export const getUsers = () => api.get('/users');

/* ------------------------------------------------------------------ */
/* Students                                                            */
/* ------------------------------------------------------------------ */

export const getStudents = () => api.get('/students');
export const createStudent = (p) => api.post('/students', normalizePersonPayload(p));
export const updateStudent = (id, p) => api.put(`/student/${id}`, normalizePersonPayload(p));
export const deleteStudent = (id) => api.delete(`/student/${id}`);
// NOTE: no GET /students/search in the controllers you pasted. Add it or remove this.
export const searchStudents = (query) => api.get('/students/search', { params: { query } });

/* ------------------------------------------------------------------ */
/* Parents                                                             */
/* ------------------------------------------------------------------ */

export const getParents = () => api.get('/parents');
export const getMyChildren = () => api.get('/me/children');
export const createParent = (p) => inviteUser({ ...normalizePersonPayload(p), role: 'Parent' });
export const updateParent = (id, p) => api.put(`/parent/update/${id}`, normalizePersonPayload(p));
export const deleteParent = (id) => api.delete(`/parent/id/${id}`);

/* ------------------------------------------------------------------ */
/* Teachers                                                            */
/* ------------------------------------------------------------------ */

export const getTeachers = () => api.get('/teachers');
export const getMyClasses = () => api.get('/me/classes');
export const createTeacher = (p) => inviteUser({ ...normalizePersonPayload(p), role: 'Teacher' });
export const updateTeacher = (id, p) => api.put(`/teacher/id/${id}`, normalizePersonPayload(p));
export const deleteTeacher = (id) => api.delete(`/teacher/${id}`);

/* ------------------------------------------------------------------ */
/* Support staff                                                       */
/* ------------------------------------------------------------------ */

export const getSupportStaff = () => api.get('/staffs');
export const createSupportStaffProfile = (person, userId) => {
  const payload = normalizePersonPayload(person);
  const workDone = typeof payload.workDone === 'string' ? payload.workDone.trim() : '';
  if (!workDone) {
    throw new Error('Job title is required for support staff.');
  }
  if (userId === undefined || userId === null || userId === '') {
    throw new Error('An account is required to save a support staff profile.');
  }
  const numericUserId = Number(userId);
  if (!Number.isFinite(numericUserId)) {
    throw new Error('The account ID is invalid, so the support staff profile could not be saved.');
  }

  return api.post('/staff', {
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: payload.email,
    workDone,
    gender: payload.gender,
    userId: numericUserId,
    age: payload.age,
    phoneNumber: payload.phoneNumber,
  });
};

export const createSupportStaff = async (person) => {
  const payload = normalizePersonPayload(person);
  const workDone = typeof payload.workDone === 'string' ? payload.workDone.trim() : '';
  if (!workDone) {
    throw new Error('Job title is required for support staff.');
  }

  const inviteResponse = await inviteUser({ ...payload, role: 'STAFF' });
  const inviteData = inviteResponse.data;
  const possibleUsers = [
    inviteData,
    inviteData?.data,
    inviteData?.user,
    inviteData?.data?.user,
  ];
  let userId = possibleUsers
    .map((user) => user?.userId ?? user?.id)
    .find((id) => id !== undefined && id !== null);

  try {
    if (userId == null) {
      const usersResponse = await api.get('/users');
      const usersData = usersResponse.data;
      const users = [
        usersData?.users,
        usersData?.data?.users,
        usersData?.data,
        usersData,
      ].find(Array.isArray) || [];
      const invitedUser = users.find(
        (user) => user.email?.trim().toLowerCase() === payload.email?.trim().toLowerCase()
      );
      userId = invitedUser?.userId ?? invitedUser?.id;
    }

    if (userId == null) {
      throw new Error('The invite was created, but the account ID was not returned or found.');
    }

    return await createSupportStaffProfile(payload, userId);
  } catch (error) {
    error.inviteSent = true;
    throw error;
  }
};
export const updateSupportStaff = (id, person) => {
  const payload = normalizePersonPayload(person);
  if (payload.workDone !== undefined) {
    payload.workDone = typeof payload.workDone === 'string' ? payload.workDone.trim() : '';
    if (!payload.workDone) {
      throw new Error('Job title is required for support staff.');
    }
  }
  return api.put(`/staff/${id}`, payload);
};
export const deleteSupportStaff = (id) => api.delete(`/staff/${id}`);

/* ------------------------------------------------------------------ */
/* Classes, subjects, terms, assignments                               */
/* ------------------------------------------------------------------ */

export const getClasses = () => api.get('/classes');
export const createClass = (p) => api.post('/classes', p);
export const updateClass = (id, p) => api.put(`/classes/${id}`, p);
export const deleteClass = (id) => api.delete(`/classes/${id}`);

export const getSubjects = () => api.get('/subjects');
export const createSubject = (p) => api.post('/subjects', p);
export const updateSubject = (id, p) => api.put(`/subject/${id}`, p);
export const deleteSubject = (id) => api.delete(`/subject/${id}`);

export const getTerms = () => api.get('/terms');
export const createTerm = (p) => api.post('/term', p);
export const updateTerm = (id, p) => api.put(`/term/${id}`, p);
export const deleteTerm = (id) => api.delete(`/term/${id}`);

export const getAssignments = () => api.get('/assignments');
export const createAssignment = (p) => api.post('/assigns', p);
export const updateAssignment = (id, p) => api.put(`/assign/${id}`, p);
export const deleteAssignment = (id) => api.delete(`/assign/id/${id}`);

/* ------------------------------------------------------------------ */
/* Exams                                                               */
/* ------------------------------------------------------------------ */


export const getExamPeriods   = () => api.get('/exam-periods');
export const createExamPeriod = (d) => api.post('/exam-periods', d);
export const updateExamPeriod = (id, d) => api.put(`/exam-periods/${id}`, d);
export const deleteExamPeriod = (id) => api.delete(`/exam-periods/${id}`);
export const generateExamTimetable = (id, d) => api.post(`/exam-periods/${id}/generate`, d);

export const getExams   = (examPeriodId) => api.get('/exams', { params: examPeriodId ? { examPeriodId } : {} });
export const createExam = (d) => api.post('/exams', d);
export const updateExam = (id, d) => api.put(`/exams/${id}`, d);
export const deleteExam = (id) => api.delete(`/exams/${id}`);
export const submitExam = (id, version) => api.post(`/exams/${id}/submit`, null, { params: { version } });
export const reviewExam = (id, d) => api.post(`/exams/${id}/review`, d);



export const getResultSheet = (examId) => api.get(`/exams/${examId}/results`);
export const saveResults    = (examId, d) => api.put(`/exams/${examId}/results`, d);
export const submitResults  = (examId) => api.post(`/exams/${examId}/results/submit`);
export const reviewResults  = (examId, d) => api.post(`/exams/${examId}/results/review`, d);

export const getReportCard   = (studentId, termId) => api.get('/reports/report-card', { params: { studentId, termId } });
export const getClassRanking = (classId, termId) => api.get('/reports/class-ranking', { params: { classId, termId } });
export const getBestStudents = (classId, termId, examType) =>
  api.get('/reports/best-students', { params: { classId, termId, ...(examType ? { examType } : {}) } });
/* ------------------------------------------------------------------ */
/* Finance                                                             */
/* ------------------------------------------------------------------ */

export const getFinanceSummary = () => api.get('/api/finance/summary');

// Poll after payFees() until status is SUCCESS or FAILED (response: { status, message, receiptNumber }).
export const getPaymentStatus = (checkoutRequestId) => api.get(`/stkpush/${checkoutRequestId}`);
export const getStudentFunds = (studentId) => api.get(`/${studentId}/funds`);
export const createFunds = (p) => api.post('/funds', p);
export const createFundsForAllStudents = (p) => api.post('/funds/bulk', p);

// The backend REQUIRES the Idempotency-Key header. Create ONE key per payment attempt
// (e.g. when the pay dialog opens, via newPaymentKey) and reuse it if the user retries or
// double-clicks. If you let the default generate a fresh key each call, every click is a new charge.
export const newPaymentKey = newIdempotencyKey;
export const payFees = (payload, idempotencyKey = newIdempotencyKey()) =>
  api.post('/stkPush', payload, { headers: { 'Idempotency-Key': idempotencyKey } });

/* ------------------------------------------------------------------ */
/* Timetable, lessons, attendance                                      */
/* ------------------------------------------------------------------ */

// TODO backend: GET /timetable-slots does not exist yet.
export const getTimetableSlots = () => api.get('/timetable-slots');
export const createTimetableSlot = (p) => api.post('/timetable-slots', p);
// TODO backend: DELETE /timetable-slots/{id} does not exist yet.
export const deleteTimetableSlot = (id) => api.delete(`/timetable-slots/${id}`);

// { startDate, endDate }
export const generateLessons = (p) => api.post('/timetable/generate-lessons', p);

// params MUST include `date` and exactly one of `classesId` or `teacherId`.
export const getLessons = (params) => api.get('/lessons', { params });
export const createAdHocLesson = (p) => api.post('/lessons/ad-hoc', p);

// Stops calls like /lessons/undefined/attendance before they leave the browser.
const requireId = (id, what) => {
  if (id === undefined || id === null || id === '' || id === 'undefined') {
    throw new Error(`Missing ${what}`);
  }
  return id;
};

// Saved attendance for a lesson.
export const getLessonAttendance = (lessonId) =>
  api.get(`/lessons/${requireId(lessonId, 'lessonId')}/attendance`);
// TODO backend: there is no /lessons/{id}/register (class list to mark against).
// Until it exists, an unmarked lesson returns an empty list here.
export const getRegister = getLessonAttendance;

// marks: [{ studentId, status }]  status = PRESENT | ABSENT | LATE | EXCUSED
export const markAttendance = (lessonId, marks) =>
  api.post(`/lessons/${requireId(lessonId, 'lessonId')}/attendance`, marks);

export const getStudentAttendance = (studentId, subjectId) =>
  api.get(`/students/${requireId(studentId, 'studentId')}/attendance`, {
    params: subjectId ? { subjectId } : undefined,
  });

export default api;