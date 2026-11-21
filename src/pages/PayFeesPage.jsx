import { useEffect, useState } from 'react';
import { getStudents, getMyChildren, getStudentFunds, getPaymentStatus, payFees } from '../api';

const toStudentList = (payload, keys) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  if (payload.data && typeof payload.data === 'object') return toStudentList(payload.data, keys);
  if (payload.user && typeof payload.user === 'object') return toStudentList(payload.user, keys);
  return [];
};

const studentIdOf = (student) =>
  student?.studentId ?? student?.id ?? student?.student?.studentId ?? student?.student?.id;
const studentNameOf = (student) =>
  `${student?.firstName ?? student?.student?.firstName ?? ''} ${student?.lastName ?? student?.student?.lastName ?? ''}`.trim() ||
  student?.name || student?.student?.name || `Student #${studentIdOf(student)}`;
const toFundsList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['funds', 'studentFunds', 'items', 'results']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return payload.data && typeof payload.data === 'object' ? toFundsList(payload.data) : [];
};
const requestError = (err, fallback) =>
  err.response?.data?.message || err.response?.data?.error ||
  (err.response?.status ? `Request failed (${err.response.status}).` : err.message || fallback);

const normalizeRole = (role) => {
  const value = Array.isArray(role) ? role[0] : role;
  if (value && typeof value === 'object') return normalizeRole(value.name ?? value.role);
  return String(value ?? '').trim().toUpperCase().replace(/^ROLE_/, '').replace(/[\s-]+/g, '_');
};

function formatCurrency(value) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(number);
}

// Must match MAX_AMOUNT in MpesaTransactionService.
const MAX_PAYMENT = 250000;

function PayFeesPage({ user }) {
  const isParent = normalizeRole(user?.role ?? user?.roles ?? user?.roleName) === 'PARENT';
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState('');

  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [dues, setDues] = useState([]);
  const [duesLoading, setDuesLoading] = useState(false);
  const [duesError, setDuesError] = useState('');

  const [selectedFundsId, setSelectedFundsId] = useState(null);
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('254');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [checkoutRequestId, setCheckoutRequestId] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');

  useEffect(() => {
    let mounted = true;
    setStudentsLoading(true);
    setStudents([]);
    setSelectedStudentId('');
    setDues([]);
    setSelectedFundsId(null);
    setStudentsError('');
    const fetchStudents = isParent ? getMyChildren() : getStudents();

    fetchStudents
      .then((res) => {
        if (mounted) {
          const studentList = toStudentList(
            res.data,
            isParent ? ['children', 'students', 'items', 'results'] : ['students', 'items', 'results']
          )
            .map((student) => ({ ...student, studentId: studentIdOf(student) }))
            .filter((student) => student.studentId != null && student.studentId !== '');
          setStudents(studentList);
          if (studentList.length === 0 && toStudentList(
            res.data,
            isParent ? ['children', 'students', 'items', 'results'] : ['students', 'items', 'results']
          ).length > 0) {
            setStudentsError('The student list loaded, but no usable student IDs were returned.');
          }
        }
      })
      .catch((err) => {
        if (mounted) {
          setStudents([]);
          setStudentsError(
            requestError(
              err,
              isParent ? 'Could not load your children. Please try again later.' : 'Could not load the student list.'
            )
          );
        }
      })
      .finally(() => mounted && setStudentsLoading(false));
    return () => { mounted = false; };
  }, [user]);

  useEffect(() => {
    if (status !== 'pending' || !checkoutRequestId) return undefined;

    let cancelled = false;
    let timer;
    const checkStatus = async () => {
      try {
        const response = await getPaymentStatus(checkoutRequestId);
        const payment = response.data?.data ?? response.data ?? {};
        const paymentStatus = String(payment.status ?? payment.paymentStatus ?? '').trim().toUpperCase();
        const resultCode = payment.resultCode ?? payment.ResultCode;

        if (['SUCCESS', 'PAID', 'COMPLETED'].includes(paymentStatus) || String(resultCode) === '0') {
          if (cancelled) return;
          setStatus('success');
          setMessage(payment.message || 'Payment received successfully.');
          setReceiptNumber(payment.receiptNumber || payment.mpesaReceiptNumber || payment.MpesaReceiptNumber || '');
          return;
        }

        if (['FAILED', 'CANCELLED', 'CANCELED', 'REJECTED', 'TIMEOUT'].includes(paymentStatus) || (resultCode != null && String(resultCode) !== '0')) {
          if (cancelled) return;
          setStatus('error');
          setMessage(payment.message || payment.resultDesc || payment.ResultDesc || 'Payment was not completed. You can try again.');
          return;
        }
      } catch {
        // Keep waiting; status checks can fail temporarily while the payment is processing.
      }

      if (!cancelled) timer = setTimeout(checkStatus, 4000);
    };

    checkStatus();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [checkoutRequestId, status]);

  const loadDues = (studentId) => {
    setDuesLoading(true);
    setDuesError('');
    setSelectedFundsId(null);
    getStudentFunds(studentId)
      .then((res) => setDues(toFundsList(res.data).filter((d) => Number(d.balance) > 0)))
      .catch((err) => setDuesError(requestError(err, 'Could not load fee balances for this student.')))
      .finally(() => setDuesLoading(false));
  };

  const handleStudentChange = (e) => {
    const studentId = e.target.value;
    selectStudent(studentId);
  };

  const selectStudent = (studentId) => {
    if (studentId && !students.some((student) => String(student.studentId) === String(studentId))) {
      setStudentsError('That student is not available for this account.');
      setSelectedStudentId('');
      setDues([]);
      setSelectedFundsId(null);
      setPaymentFormOpen(false);
      return;
    }
    setSelectedStudentId(studentId);
    setDues([]);
    setSelectedFundsId(null);
    setPaymentFormOpen(false);
    setStatus('idle');
    setMessage('');
    setCheckoutRequestId('');
    setReceiptNumber('');
    if (studentId) loadDues(studentId);
  };

  const selectedDue = dues.find((d) => d.fundsId === selectedFundsId);
  // Anything above the balance is accepted and held as a refund / carry-forward credit.
  const excessAmount = selectedDue
    ? Math.max(0, Number(amount || 0) - Number(selectedDue.balance))
    : 0;

  const openPayFor = (due) => {
    setSelectedFundsId(due.fundsId);
    setAmount(String(due.balance));
    setPhoneNumber('254');
    setPaymentFormOpen(!isParent);
    setStatus('idle');
    setMessage('');
    setCheckoutRequestId('');
    setReceiptNumber('');
  };

  const validate = () => {
    if (!selectedStudentId) return 'Select a student first.';
    if (!students.some((student) => String(student.studentId) === String(selectedStudentId))) {
      return 'The selected student is not available for this account.';
    }
    if (!selectedDue) return 'Select a fee to pay.';
    if (!Number.isInteger(Number(selectedStudentId)) || Number(selectedStudentId) <= 0) {
      return 'The selected student has an invalid ID. Refresh the page and try again.';
    }
    if (!Number.isInteger(Number(selectedDue.fundsId)) || Number(selectedDue.fundsId) <= 0) {
      return 'The selected fee has an invalid ID. Refresh the fee balances and try again.';
    }
    if (!amount || Number(amount) <= 0) return 'Enter an amount greater than zero.';
    if (!Number.isInteger(Number(amount))) return 'Enter a whole number of shillings.';
    if (Number(amount) > MAX_PAYMENT) {
      return `The most you can pay in one M-Pesa request is ${formatCurrency(MAX_PAYMENT)}.`;
    }
    if (!/^254[17]\d{8}$/.test(phoneNumber)) {
      return 'Enter a valid Safaricom number starting with 254 (e.g. 2547XXXXXXXX).';
    }
    return null;
  };

  const normalizePhoneNumberInput = (raw) => {
    const digits = (raw || '').replace(/\D/g, '');

    if (!digits) return '254';

    let local = digits;
    if (local.startsWith('254')) local = local.slice(3);
    else if (local.startsWith('0')) local = local.slice(1);

    local = local.replace(/^0+/, '').slice(0, 9);
    return `254${local}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setStatus('error');
      setMessage(validationError);
      return;
    }

    setStatus('submitting');
    setMessage('');

    try {
      const response = await payFees({
        phoneNumber,
        amount: Number(amount),
        accountRef: `Funds-${selectedDue.fundsId}`,
        transactionDescription: `${selectedDue.fundsType} payment`,
        fundsId: Number(selectedDue.fundsId),
        studentId: Number(selectedStudentId),
      });

      const responseData = response.data?.data ?? response.data ?? {};
      const requestId = responseData.checkoutRequestId ?? responseData.checkoutRequestID ?? responseData.CheckoutRequestID ?? '';
      setCheckoutRequestId(requestId);
      setStatus('pending');
      setMessage(requestId
        ? 'Request sent. Check your phone and enter your M-Pesa PIN. Waiting for payment confirmation…'
        : 'Request sent. Check your phone and enter your M-Pesa PIN. The payment status cannot be checked automatically.');
      setReceiptNumber('');
    } catch (err) {
      setStatus('error');
      setMessage(
        err.response?.data?.message ||
          'Could not start the payment. Please check the details and try again.'
      );
    }
  };

  if (status === 'pending') {
    return (
      <div className="page-card" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
        <div className="info-card" role="status" aria-live="polite" style={{ maxWidth: '560px', width: '100%', textAlign: 'center' }}>
          <h2>Waiting for M-Pesa confirmation</h2>
          <p>{message || 'Check your phone and enter your M-Pesa PIN to complete the payment.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Payments</p>
          <h2>Pay Fees</h2>
        </div>
      </div>

      <div className="info-card" style={{ marginBottom: '1.5rem' }}>
        <h3>Select Student</h3>

        {studentsLoading && <p>Loading students…</p>}
        {!studentsLoading && studentsError && <p style={{ color: '#c0392b' }}>{studentsError}</p>}

        {!studentsLoading && !studentsError && students.length === 0 && (
          <p>No students found.</p>
        )}

        {!studentsLoading && !studentsError && students.length > 0 && !isParent && (
          <select
            value={selectedStudentId}
            onChange={handleStudentChange}
            disabled={status === 'submitting' || status === 'pending'}
            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #ccc' }}
          >
            <option value="">Select a student…</option>
            {students.map((s) => (
              <option key={s.studentId} value={s.studentId}>
                {studentNameOf(s)}
              </option>
            ))}
          </select>
        )}
        {!studentsLoading && !studentsError && students.length > 0 && isParent && (
          <div className="grid-3">
            {students.map((student) => {
              const isSelected = String(student.studentId) === String(selectedStudentId);
              return (
                <div
                  key={student.studentId}
                  className="info-card"
                  style={isSelected ? { border: '2px solid #2563eb' } : undefined}
                >
                  <h4>{studentNameOf(student)}</h4>
                  {student.className && <p>Class: {student.className}</p>}
                  <button
                    type="button"
                    className={isSelected ? 'secondary' : undefined}
                    onClick={() => selectStudent(String(student.studentId))}
                    disabled={status === 'submitting' || status === 'pending'}
                  >
                    {isSelected ? 'Selected' : 'View fees'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedStudentId && (
        <div className="info-card" style={{ marginBottom: '1.5rem' }}>
          <div className="section-heading">
            <h3>{isParent ? `Fees for ${students.find((student) => String(student.studentId) === String(selectedStudentId))?.firstName || 'student'}` : 'Outstanding Balances'}</h3>
            {isParent && (
              <button
                type="button"
                className="secondary"
                onClick={() => selectStudent('')}
                disabled={status === 'submitting' || status === 'pending'}
              >
                Choose another child
              </button>
            )}
          </div>

          {duesLoading && <p>Loading fee balances…</p>}
          {!duesLoading && duesError && <p style={{ color: '#c0392b' }}>{duesError}</p>}
          {!duesLoading && !duesError && dues.length === 0 && (
            <p>No outstanding fees for this student. Fully paid up.</p>
          )}

          {!duesLoading && dues.length > 0 && (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {(selectedDue ? [selectedDue] : dues).map((due) => (
                <div
                  key={due.fundsId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem 1rem',
                    border: '1px solid',
                    borderColor: selectedFundsId === due.fundsId ? '#2e7d32' : '#ddd',
                    borderRadius: '8px',
                  }}
                >
                  <div>
                    <strong>{due.fundsType}</strong>
                    {due.termName && (
                      <p style={{ margin: 0, color: '#888', fontSize: '0.85rem' }}>
                        {due.termName} {due.termYear}
                      </p>
                    )}
                    <p style={{ margin: 0, color: '#666' }}>
                      Balance: {formatCurrency(due.balance)} of {formatCurrency(due.amountDue)}
                    </p>
                  </div>
                  {selectedDue ? (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setSelectedFundsId(null);
                        setPaymentFormOpen(false);
                        setStatus('idle');
                        setMessage('');
                      }}
                      disabled={status === 'submitting' || status === 'pending'}
                    >
                      Choose another fee
                    </button>
                  ) : (
                    <button type="button" onClick={() => openPayFor(due)}>
                      {isParent ? 'Choose fee' : 'Pay'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {isParent && selectedDue && !paymentFormOpen && status !== 'pending' && status !== 'success' && (
            <button type="button" onClick={() => setPaymentFormOpen(true)} style={{ marginTop: '1rem' }}>
              Proceed to payment
            </button>
          )}
        </div>
      )}

      {selectedDue && (!isParent || paymentFormOpen || status === 'pending' || status === 'success') && (
        <div className="info-card">
          <h3>Pay {selectedDue.fundsType}</h3>
          {status === 'pending' || status === 'success' ? (
            <div role="status" aria-live="polite">
              <h4>{status === 'pending' ? 'Payment request sent' : 'Payment confirmed'}</h4>
              <p>{message}</p>
              <p>Amount: {formatCurrency(amount)} · Phone: {phoneNumber}</p>
              {excessAmount > 0 && (
                <p>
                  {formatCurrency(excessAmount)} of this payment is extra. Under My refunds you can choose to
                  have it refunded or carried to the next semester.
                </p>
              )}
              {status === 'pending' && checkoutRequestId && <p>Do not submit another payment while this request is processing.</p>}
              {receiptNumber && <p>Receipt: {receiptNumber}</p>}
              {status === 'pending' && !checkoutRequestId && (
                <button type="button" onClick={() => {
                  setStatus('idle');
                  setMessage('');
                  setSelectedFundsId(null);
                  loadDues(selectedStudentId);
                }}>
                  Refresh balances before retrying
                </button>
              )}
              {status === 'success' && (
                <button type="button" onClick={() => {
                  setStatus('idle');
                  setMessage('');
                  setCheckoutRequestId('');
                  setSelectedFundsId(null);
                  loadDues(selectedStudentId);
                }}>
                  Refresh balances
                </button>
              )}
            </div>
          ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="amount" style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>
                Amount (KES) - balance owed: {formatCurrency(selectedDue.balance)}
              </label>
              <input
                id="amount"
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #ccc' }}
              />
              {excessAmount > 0 && (
                <p style={{ margin: '0.5rem 0 0', color: '#92400e', fontSize: '0.9rem' }}>
                  {formatCurrency(excessAmount)} is above the balance. The fee will be cleared and the extra
                  will be held as credit, so you can choose a refund or carry it to the next semester.
                </p>
              )}
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label htmlFor="phoneNumber" style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>
                M-Pesa Phone Number
              </label>
              <input
                id="phoneNumber"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(normalizePhoneNumberInput(e.target.value))}
                placeholder="2547XXXXXXXX"
                style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #ccc' }}
              />
            </div>

            <button type="submit" disabled={status === 'submitting'}>
              {status === 'submitting' ? 'Sending request...' : 'Pay with M-Pesa'}
            </button>
          </form>
          )}

          {status === 'error' && <p style={{ marginTop: '1rem', color: '#c0392b' }}>{message}</p>}
        </div>
      )}
    </div>
  );
}

export default PayFeesPage;