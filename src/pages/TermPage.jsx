import { useMemo, useState, useEffect } from 'react';
import Modal from '../components/Modal';
import CollapsibleSection from '../components/CollapsibleSection';
import { getTerms, createTerm, updateTerm, deleteTerm } from '../api';

function formatDate(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function TermPage() {
  const [terms, setTerms] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', year: '', startDate: '', endDate: '' });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getTerms()
      .then((res) => {
        if (!mounted) return;
        setTerms(res.data.terms || res.data || []);
      })
      .catch(() => {
        setError('Could not load terms from backend.');
        setTerms([]);
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const filteredTerms = useMemo(() => {
    const q = search.toLowerCase();
    return terms.filter((t) => [t.name, t.year].join(' ').toLowerCase().includes(q));
  }, [search, terms]);

  const openCreateModal = () => {
    setForm({ name: '', year: '', startDate: '', endDate: '' });
    setEditingId(null);
    setError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        const res = await updateTerm(editingId, form);
        setTerms((current) => current.map((t) => (t.termId === editingId ? res.data : t)));
        setEditingId(null);
      } else {
        await createTerm(form);
        setTerms((current) => [{ termId: Date.now(), ...form, fundings: [] }, ...current]);
      }
      setForm({ name: '', year: '', startDate: '', endDate: '' });
      setModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create term');
    }
  };

  const beginEdit = (t) => {
    setForm({ name: t.name || '', year: t.year || '', startDate: t.startDate || '', endDate: t.endDate || '' });
    setEditingId(t.termId);
    setModalOpen(true);
  };

  const handleDelete = async (termId) => {
    if (!window.confirm('Delete this term?')) return;
    try {
      await deleteTerm(termId);
      setTerms((current) => current.filter((t) => t.termId !== termId));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete term');
    }
  };

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Academics</p>
          <h2>Terms</h2>
        </div>
        <button onClick={openCreateModal}>Add Term</button>
      </div>

      <div className="toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search terms" />
      </div>

      {error && <p style={{ color: '#c0392b' }}>{error}</p>}

      <CollapsibleSection title="Term list" subtitle="School terms and their date ranges" defaultOpen>
        <div className="grid-3">
          {loading && <p>Loading terms…</p>}
          {!loading && filteredTerms.length === 0 ? (
            <div className="info-card">
              <p>No terms found. Add a new term to get started.</p>
            </div>
          ) : filteredTerms.map((t) => (
            <div key={t.termId} className="info-card">
              <h3>{t.name} — {t.year}</h3>
              <p><strong>Starts:</strong> {formatDate(t.startDate)}</p>
              <p><strong>Ends:</strong> {formatDate(t.endDate)}</p>
              <p><strong>Fee records:</strong> {t.fundings?.length ?? 0}</p>
              <div style={{ marginTop: '0.75rem' }}>
                <button className="secondary" onClick={() => beginEdit(t)}>Edit</button>
                <button className="secondary" onClick={() => handleDelete(t.termId)} style={{ marginLeft: '0.5rem' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <Modal isOpen={modalOpen} title={editingId ? 'Edit Term' : 'Add New Term'} onClose={closeModal}>
        <form className="modal-form" onSubmit={handleSubmit}>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Term name (e.g. Term 2)" required />
          <input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="Year (e.g. 2026)" required />
          <label>
            Start date
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
          </label>
          <label>
            End date
            <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={closeModal}>Cancel</button>
            <button type="submit">{editingId ? 'Update Term' : 'Add Term'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default TermPage;