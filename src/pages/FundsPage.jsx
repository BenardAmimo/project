import { useState, useEffect } from 'react';
import Modal from '../components/Modal';
import CollapsibleSection from '../components/CollapsibleSection';
import { getStudents, getTerms, getClasses, getStudentFunds, createFundsForAllStudents } from '../api';

const FUNDS_TYPES = ['FEES', 'SNACKS'];
const getList = (data, key) => {
  const candidates = [data?.[key], data?.data?.[key], data?.data, data];
  return candidates.find(Array.isArray) || [];
};

function formatCurrency(value) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(number);
}

function FundsPage() {
  const [students, setStudents] = useState([]);
  const [terms, setTerms] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ classesId: '', termId: '', amount: '', fundsType: 'FEES' });

  useEffect(() => {
    let mounted = true;
    const errors = [];
    const load = (request, key, setValue, label) =>
      request()
        .then((res) => {
          if (mounted) setValue(getList(res.data, key));
        })
        .catch((err) => {
          if (mounted) {
            errors.push(
              err.response?.data?.message || `Could not load ${label}: ${err.message || 'request failed'}`
            );
          }
        });

    Promise.all([
      load(getStudents, 'students', setStudents, 'students'),
      load(getTerms, 'terms', setTerms, 'terms'),
      load(getClasses, 'classes', setClasses, 'classes'),
    ]).finally(() => {
      if (mounted) {
        setLookupError(errors.join(' '));
        setLookupsLoading(false);
      }
    });

    return () => { mounted = false; };
  }, []);

  const loadFunds = (studentId) => {
    if (!studentId) return;
    setLoading(true);
    setError('');
    getStudentFunds(studentId)
      .then((res) => setFunds(res.data || []))
      .catch(() => setError('Could not load fee records for this student.'))
      .finally(() => setLoading(false));
  };

  const handleStudentSelect = (e) => {
    const studentId = e.target.value;
    setSelectedStudentId(studentId);
    setFunds([]);
    loadFunds(studentId);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess('');
    setError('');
    try {
      const res = await createFundsForAllStudents({
        classesId: Number(form.classesId),
        termId: Number(form.termId),
        amount: Number(form.amount),
        fundsType: form.fundsType,
      });
      setModalOpen(false);
      setSuccess(res.data || 'Fee applied to the class.');
      setForm({ classesId: '', termId: '', amount: '', fundsType: 'FEES' });
      if (selectedStudentId) loadFunds(selectedStudentId);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not apply fee to this class');
    }
  };

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Finance</p>
          <h2>Funds</h2>
        </div>
        <button onClick={() => setModalOpen(true)}>Set Fee for Class</button>
      </div>

      {success && <p style={{ color: '#1e7e34' }}>{success}</p>}
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {lookupError && <p role="alert" style={{ color: '#c0392b' }}>{lookupError}</p>}

      <div className="info-card" style={{ marginBottom: '1.5rem' }}>
        <h3>Check a Student's Fee Records</h3>
        <select
          value={selectedStudentId}
          onChange={handleStudentSelect}
          style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #ccc' }}
        >
          <option value="">
            {lookupsLoading
              ? 'Loading students…'
              : students.length
                ? 'Select a student…'
                : lookupError
                  ? 'Students could not be loaded'
                  : 'No students found'}
          </option>
          {students.map((s) => (
            <option key={s.studentId ?? s.id} value={s.studentId ?? s.id}>
              {`${s.firstName || ''} ${s.lastName || ''}`.trim()}
            </option>
          ))}
        </select>
      </div>

      {selectedStudentId && (
        <CollapsibleSection title="Fee records" subtitle="All fee records for the selected student" defaultOpen>
          <div className="grid-3">
            {loading && <p>Loading…</p>}
            {!loading && funds.length === 0 ? (
              <div className="info-card">
                <p>No fee records yet for this student.</p>
              </div>
            ) : funds.map((f) => (
              <div key={f.fundsId} className="info-card">
                <h3>{f.fundsType}</h3>
                {f.termName && <p><strong>Term:</strong> {f.termName} {f.termYear}</p>}
                <p><strong>Amount Due:</strong> {formatCurrency(f.amountDue)}</p>
                <p><strong>Paid:</strong> {formatCurrency(f.amountPaid)}</p>
                <p><strong>Balance:</strong> {formatCurrency(f.balance)}</p>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      <Modal isOpen={modalOpen} title="Set Fee for This Class" onClose={() => setModalOpen(false)}>
        <p style={{ marginTop: 0, color: '#666' }}>
          This creates a fee record for every student in the selected class. Safe to re-run later —
          students who already have this fee for the selected term won't be charged twice.
        </p>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label>
            Class
            <select
              value={form.classesId}
              onChange={(e) => setForm({ ...form, classesId: e.target.value })}
              required
            >
              <option value="">Select a class</option>
              {classes.map((c) => (
                <option key={c.classesId} value={c.classesId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Term
            <select
              value={form.termId}
              onChange={(e) => setForm({ ...form, termId: e.target.value })}
              required
            >
              <option value="">Select a term</option>
              {terms.map((t) => (
                <option key={t.termId} value={t.termId}>
                  {t.name} {t.year}
                </option>
              ))}
            </select>
          </label>

          <label>
            Fee Type
            <select
              value={form.fundsType}
              onChange={(e) => setForm({ ...form, fundsType: e.target.value })}
              required
            >
              {FUNDS_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>

          <input
            type="number"
            min="1"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="Amount (KES) - applies to every student in this class"
            required
          />

          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit">Apply to Class</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default FundsPage;