
import { useEffect, useState } from 'react';
import CollapsibleSection from '../components/CollapsibleSection';
import { getFinanceSummary } from '../api';

function formatCurrency(value) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(number);
}

function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleString('en-KE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }) {
  const styles = {
    SUCCESS: { background: '#e6f4ea', color: '#1e7e34' },
    PENDING: { background: '#fff4e0', color: '#9a6300' },
    FAILED: { background: '#fdecea', color: '#c0392b' },
  };
  const style = styles[status] || { background: '#eee', color: '#555' };

  return (
    <span
      style={{
        ...style,
        padding: '2px 10px',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}

function FinancePage() {
  const [finance, setFinance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadFinanceSummary = () => {
    setLoading(true);
    setError(null);

    getFinanceSummary()
      .then((res) => setFinance(res.data))
      .catch((err) => {
        const message =
          err.response?.status === 403
            ? "You don't have permission to view finance data."
            : 'Could not load finance data. Check your connection and try again.';
        setError(message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadFinanceSummary();
  }, []);

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>Finance</h2>
        </div>
        <button onClick={loadFinanceSummary}>Refresh</button>
      </div>

      <CollapsibleSection
        title="Finance summary"
        subtitle="Fees collected, pending payments, and recent transactions"
      >
        {loading && <p>Loading finance data…</p>}

        {!loading && error && (
          <div className="info-card">
            <h3>Something went wrong</h3>
            <p>{error}</p>
            <button onClick={loadFinanceSummary}>Try again</button>
          </div>
        )}

        {!loading && !error && finance && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              <div className="info-card">
                <h3>Total Collected</h3>
                <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {formatCurrency(finance.totalCollected)}
                </p>
              </div>

              <div className="info-card">
                <h3>Pending</h3>
                <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {formatCurrency(finance.totalPending)}
                </p>
              </div>

              <div className="info-card">
                <h3>Successful Transactions</h3>
                <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {finance.transactionCount}
                </p>
              </div>
            </div>

            <div className="info-card">
              <h3>Recent Transactions</h3>

              {finance.recentTransactions?.length === 0 && (
                <p>No transactions yet. Once fees are paid via M-Pesa, they'll show up here.</p>
              )}

              {finance.recentTransactions?.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                      <th style={{ padding: '8px 4px' }}>Student</th>
                      <th style={{ padding: '8px 4px' }}>Amount</th>
                      <th style={{ padding: '8px 4px' }}>Status</th>
                      <th style={{ padding: '8px 4px' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finance.recentTransactions.map((t, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '8px 4px' }}>{t.studentName}</td>
                        <td style={{ padding: '8px 4px' }}>{formatCurrency(t.amount)}</td>
                        <td style={{ padding: '8px 4px' }}>
                          <StatusBadge status={t.status} />
                        </td>
                        <td style={{ padding: '8px 4px' }}>{formatDate(t.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </CollapsibleSection>
    </div>
  );
}

export default FinancePage;