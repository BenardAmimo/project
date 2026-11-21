import { useState } from 'react';

function CollapsibleSection({ title, subtitle, defaultOpen = true, children, className = '' }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={`collapsible-section ${className}`.trim()}>
      <button type="button" className="collapsible-header" onClick={() => setIsOpen((value) => !value)}>
        <div>
          <p className="section-title">{title}</p>
          {subtitle && <p className="section-subtitle">{subtitle}</p>}
        </div>
        <span className="section-chevron">{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && <div className="collapsible-body">{children}</div>}
    </section>
  );
}

export default CollapsibleSection;
