import { useState } from 'react';
import { currentMonthRange, last30DaysRange, toDay } from '../../utils';

// Reusable date-range picker with three preset chips (Current Month / Last 30
// Days / Custom) and an optional date-field selector that callers use to
// pick which field on each row should be filtered.
//
// Props:
//   value     = { preset: 'currentMonth'|'last30'|'custom', from, to, field? }
//   onChange  = (next) => void — receives the same shape
//   showField = bool — when true, render the "by: <field> ▾" select on the right
//   fieldOptions = [{ value, label }] — only used when showField is true
//
// All date strings are YYYY-MM-DD, lexicographically comparable. The picker
// only validates from <= to; the caller decides what an invalid range means
// (typically: keep showing rows as-is or treat as empty).
export function DateRangePicker({ value, onChange, showField = false, fieldOptions = [] }) {
  const today = toDay();
  const [err, setErr] = useState('');

  function applyPreset(preset) {
    if (preset === 'currentMonth') {
      const r = currentMonthRange();
      onChange({ ...value, preset, from: r.from, to: r.to });
    } else if (preset === 'last30') {
      const r = last30DaysRange();
      onChange({ ...value, preset, from: r.from, to: r.to });
    } else {
      // 'custom' — keep current from/to (don't reset); reveal inputs via preset change
      onChange({ ...value, preset });
    }
    setErr('');
  }

  function setFrom(from) {
    if (value.to && from > value.to) { setErr('From must be ≤ To'); return; }
    setErr('');
    onChange({ ...value, preset: 'custom', from });
  }
  function setTo(to) {
    if (value.from && to < value.from) { setErr('To must be ≥ From'); return; }
    setErr('');
    onChange({ ...value, preset: 'custom', to });
  }
  function setField(field) {
    onChange({ ...value, field });
  }

  const chips = [
    { key: 'currentMonth', label: '📅 Current Month' },
    { key: 'last30', label: '📅 Last 30 Days' },
    { key: 'custom', label: '🛠 Custom Range' },
  ];

  const chipBase = {
    padding: '6px 12px',
    borderRadius: 7,
    fontSize: 11.5,
    fontWeight: 800,
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
    border: '1.5px solid',
    background: 'white',
  };
  const activeChip = { ...chipBase, background: '#0d7377', color: 'white', borderColor: '#0d7377' };
  const inactiveChip = { ...chipBase, color: '#1a2535', borderColor: '#d8e2ef' };

  const dateInputStyle = {
    width: '100%',
    padding: '7px 10px',
    borderRadius: 7,
    border: '1.5px solid #d8e2ef',
    fontFamily: "'Nunito',sans-serif",
    fontSize: 12.5,
    color: '#1a2535',
    outline: 'none',
    background: 'white',
    fontWeight: 600,
  };

  const fieldSelectStyle = {
    padding: '6px 10px',
    borderRadius: 7,
    border: '1.5px solid #d8e2ef',
    fontFamily: "'Nunito',sans-serif",
    fontSize: 11.5,
    color: '#1a2535',
    background: 'white',
    fontWeight: 700,
    outline: 'none',
    cursor: 'pointer',
  };

  return (
    <div style={{ background: '#f8fbff', border: '1px solid #dbe7f5', borderRadius: 9, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10.5, color: '#6b7a90', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, marginRight: 2 }}>Date Range</span>
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => applyPreset(c.key)}
            style={value.preset === c.key ? activeChip : inactiveChip}
          >
            {c.label}
          </button>
        ))}
        {showField && fieldOptions.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10.5, color: '#6b7a90', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4 }}>By</span>
            <select value={value.field || fieldOptions[0].value} onChange={(e) => setField(e.target.value)} style={fieldSelectStyle}>
              {fieldOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {value.preset === 'custom' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, color: '#6b7a90', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>From</label>
            <input type="date" value={value.from || ''} max={value.to || today} onChange={(e) => setFrom(e.target.value)} style={dateInputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, color: '#6b7a90', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>To</label>
            <input type="date" value={value.to || ''} min={value.from || ''} max={today} onChange={(e) => setTo(e.target.value)} style={dateInputStyle} />
          </div>
        </div>
      )}

      {err && <div style={{ color: '#c0392b', fontSize: 11.5, fontWeight: 700, marginTop: 6 }}>⚠️ {err}</div>}
      {!err && value.from && value.to && (
        <div style={{ fontSize: 10.5, color: '#6b7a90', marginTop: 6 }}>
          Filter applied: <strong style={{ color: '#0d7377' }}>{value.from}</strong> → <strong style={{ color: '#0d7377' }}>{value.to}</strong>
          {value.preset && value.preset !== 'custom' && <span style={{ marginLeft: 6, color: '#1a7a4a' }}>({value.preset === 'currentMonth' ? 'current month' : 'last 30 days'})</span>}
        </div>
      )}
    </div>
  );
}