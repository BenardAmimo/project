import { useState, useEffect, useRef } from 'react';
import { searchStudents } from '../api'; // adjust to match your api.js export

function StudentSearchSelect({ onSelect, selectedStudent }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchStudents(query.trim());
        setResults(res.data || []);
        setOpen(true);
      } catch (err) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300); // debounce so we don't hit the API on every keystroke

    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePick = (student) => {
    onSelect(student);
    setQuery(`${student.firstName} ${student.lastName}`);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', marginBottom: '1rem' }}>
      <label htmlFor="studentSearch" style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>
        Student
      </label>
      <input
        id="studentSearch"
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (selectedStudent) onSelect(null); // clear selection if they start typing again
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Type student name..."
        style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #ccc' }}
        autoComplete="off"
      />

      {loading && (
        <div style={{ position: 'absolute', right: '0.75rem', top: '2.4rem', fontSize: '0.85rem', color: '#888' }}>
          Searching…
        </div>
      )}

      {open && results.length > 0 && (
        <ul
          style={{
            position: 'absolute',
            zIndex: 10,
            top: '100%',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: '6px',
            marginTop: '0.25rem',
            maxHeight: '220px',
            overflowY: 'auto',
            listStyle: 'none',
            padding: 0,
          }}
        >
          {results.map((student) => (
            <li
              key={student.studentId}
              onClick={() => handlePick(student)}
              style={{
                padding: '0.6rem 0.8rem',
                cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0',
              }}
              onMouseDown={(e) => e.preventDefault()} // prevent input blur before click registers
            >
              <div style={{ fontWeight: 600 }}>
                {student.firstName} {student.lastName}
              </div>
              {student.classes?.className && (
                <div style={{ fontSize: '0.85rem', color: '#666' }}>{student.classes.className}</div>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && !loading && query.trim().length >= 2 && results.length === 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '0.25rem', fontSize: '0.85rem', color: '#888' }}>
          No students found.
        </div>
      )}
    </div>
  );
}

export default StudentSearchSelect;