export function ServiceCard({ dotColor, name, sub, cmd, open, onToggle, children }) {
  return (
    <section className={`cx-svc${open ? ' open' : ''}`}>
      <div className="cx-svc-head">
        <span className="cx-dot" style={{ background: dotColor, color: dotColor }} />
        <span className="cx-svc-name">{name}</span>
        <span className="cx-svc-sub">{sub}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="cx-btn cyan" onClick={onToggle}>
          {open ? 'collapse ▲' : 'run ▾'}
        </button>
      </div>
      <div className="cx-cmd">{cmd}</div>
      {open ? <div className="cx-body cx-svc-body">{children}</div> : null}
    </section>
  );
}