import { useState, useEffect } from 'react';
import CollapsibleSection from '../components/CollapsibleSection';
import { getMyClasses } from '../api';

function MyClassesPage() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getMyClasses()
      .then((res) => {
        if (!mounted) return;
        setClasses(res.data || []);
      })
      .catch(() => {
        setError('Could not load your classes from backend.');
        setClasses([]);
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  return (
    <div className="page-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Academics</p>
          <h2>My Classes</h2>
        </div>
      </div>

      {loading && <p>Loading your classes…</p>}
      {!loading && error && <p style={{ color: '#c0392b' }}>{error}</p>}

      {!loading && !error && classes.length === 0 && (
        <div className="info-card">
          <p>You have no assigned classes yet. Contact an administrator to be assigned a subject.</p>
        </div>
      )}

      {!loading && !error && classes.map((cls) => (
        <CollapsibleSection
          key={cls.assignmentId}
          title={`${cls.subjectName} — ${cls.className}`}
          subtitle={cls.classLocation ? `Location: ${cls.classLocation}` : 'No location set'}
          defaultOpen
        >
          <div className="grid-3">
            {cls.students?.length === 0 ? (
              <div className="info-card">
                <p>No students in this class yet.</p>
              </div>
            ) : cls.students?.map((student) => (
              <div key={student.studentId} className="info-card">
                <h3>{`${student.firstName || ''} ${student.lastName || ''}`.trim()}</h3>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      ))}
    </div>
  );
}

export default MyClassesPage;