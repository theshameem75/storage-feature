import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toCurl } from '../services/api';

export function ApiTrace({ calls = [], sdk, note }) {
  const [copiedKey, setCopiedKey] = useState(null);
  const copyable = calls.filter((c) => !c.res && c.method && c.url && !c.noCopy);

  const doCopy = (e, key, text) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopiedKey(key);
        setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1600);
      },
      () => {},
    );
  };

  const methodCounts = {};
  copyable.forEach((c) => {
    methodCounts[c.method] = (methodCounts[c.method] || 0) + 1;
  });
  const labelFor = (c) => {
    if (c.label) return c.label;
    if (methodCounts[c.method] > 1) {
      const seg = c.url.split('?')[0].split('/').filter(Boolean).pop() || '';
      return `${c.method} ${seg.slice(0, 14)}`;
    }
    return c.method;
  };

  const chip = (key, label, text) => (
    <button type="button" className="cx-copy" key={key} onClick={(e) => doCopy(e, key, text)}>
      {copiedKey === key ? (
        <>
          <Check size={11} style={{ verticalAlign: '-2px' }} /> copied
        </>
      ) : (
        <>
          <Copy size={11} style={{ verticalAlign: '-2px' }} /> {label}
        </>
      )}
    </button>
  );

  return (
    <details className="cx-trace">
      <summary>
        <span className="cx-caret">▸</span> api trace &amp; platform notes
        {copyable.length ? (
          <span className="cx-trace-actions">
            {copyable.map((c, i) => chip(`c${i}`, `copy ${labelFor(c)}`, toCurl(c)))}
            {copyable.length > 1 ? chip('all', 'copy all', copyable.map((c) => toCurl(c)).join('\n\n')) : null}
          </span>
        ) : null}
      </summary>
      <pre className="cx-pre cx-scroll">
        {calls.map((c, i) => (
          <React.Fragment key={i}>
            {c.res ? (
              <>
                <span className="out">←</span> {c.text}
              </>
            ) : (
              <>
                <span className="in">→</span> {c.method}  {c.url}
                {c.note ? `   ${c.note}` : ''}
              </>
            )}
            {'\n'}
          </React.Fragment>
        ))}
        {sdk ? (
          <>
            {'\n'}
            {sdk}
          </>
        ) : null}
      </pre>
      {note ? (
        <div className="cx-note">
          <div className="cap">platform notes</div>
          <div className="txt">{note}</div>
        </div>
      ) : null}
    </details>
  );
}