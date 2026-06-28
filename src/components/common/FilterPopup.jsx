import { useState, useEffect } from 'react';

// ─── Shared filter button + popup ─────────────────────────────────────────────
// Single right-aligned "🔍 Filters (N)" button. Click opens a popup:
//   • Mobile  (<=768px): bottom-anchored sheet with drag handle
//   • Desktop (>768px): centered modal with rounded corners
//
// The actual filter controls are passed in as `children` so each page
// can build its own form. The popup itself doesn't know what's inside —
// it only handles the chrome (button + sheet + scroll lock + responsive
// layout).
//
// Usage:
//   const [open, setOpen] = useState(false);
//   const activeCount = search ? 1 : 0 + ...;
//   <FilterPopup activeCount={activeCount} onClear={clearAll} title="🔍 Filters">
//     <Field label="...">...</Field>
//   </FilterPopup>
//
// The button and clear pill are right-aligned and match the size of the
// "New Task" / "Export" toolbar buttons elsewhere in the app, so the
// page header stays visually consistent.

export function FilterPopup({ activeCount = 0, onClear, title = '🔍 Filters', buttonLabel = '🔍 Filters', children }) {
  const [open, setOpen] = useState(false);

  // Lock body scroll while the popup is open so the page behind doesn't
  // scroll when the user drags inside the sheet. Mirrors Modal.jsx.
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Decide layout at render time. The popup only mounts when opened, so
  // we read window.innerWidth on each open — good enough since the
  // sheet is short-lived.
  const isMobileLayout = typeof window !== 'undefined' && window.innerWidth <= 768;

  return (
    <>
      {/* Right-aligned trigger button — matches New Task / Export button size */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {activeCount > 0 && onClear && (
          <button
            onClick={onClear}
            style={{
              padding: '9px 14px', borderRadius: 8,
              background: '#fde8e8', color: '#c0392b',
              border: '1.5px solid #f5b7b1',
              fontWeight: 800, fontSize: 13,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: "'Nunito',sans-serif",
            }}
            title="Clear all filters"
          >
            ✕ Clear
          </button>
        )}
        <button
          onClick={() => setOpen(true)}
          style={{
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: activeCount > 0 ? '#0d7377' : '#334155',
            color: 'white',
            fontWeight: 800, fontSize: 13,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            cursor: 'pointer',
            fontFamily: "'Nunito',sans-serif",
            boxShadow: activeCount > 0 ? '0 2px 8px rgba(13,115,119,0.25)' : 'none',
          }}
          aria-label="Open filters"
        >
          {buttonLabel}
          {activeCount > 0 && (
            <span style={{
              background: 'rgba(255,255,255,0.25)',
              color: 'white',
              padding: '1px 7px', borderRadius: 10,
              fontSize: 11, fontWeight: 800,
              minWidth: 20, textAlign: 'center',
            }}>
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Popup — bottom sheet on mobile, centered modal on desktop */}
      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(10,22,40,0.55)',
            display: 'flex',
            alignItems: isMobileLayout ? 'flex-end' : 'center',
            justifyContent: 'center',
            padding: isMobileLayout ? 0 : 20,
          }}
        >
          <div style={{
            background: 'white',
            width: '100%',
            maxWidth: isMobileLayout ? 520 : 460,
            borderRadius: isMobileLayout ? '18px 18px 0 0' : 14,
            boxShadow: isMobileLayout ? '0 -16px 48px rgba(0,0,0,0.25)' : '0 20px 60px rgba(0,0,0,0.30)',
            maxHeight: isMobileLayout ? '88vh' : '85vh',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Drag handle — mobile only */}
            {isMobileLayout && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
                <div style={{ width: 44, height: 4, background: '#d8e2ef', borderRadius: 4 }} />
              </div>
            )}

            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: isMobileLayout ? '4px 18px 12px' : '16px 20px 14px',
              borderBottom: '1px solid #e8eef5',
            }}>
              <div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: '#0b1e3d', fontWeight: 700 }}>{title}</div>
                <div style={{ fontSize: 11, color: '#6b7a90', marginTop: 2 }}>
                  {activeCount > 0 ? `${activeCount} filter${activeCount === 1 ? '' : 's'} applied` : 'No filters applied'}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: '#f3f7fc', border: 'none', color: '#1a2535',
                  fontSize: 16, fontWeight: 800, cursor: 'pointer',
                }}
                aria-label="Close filters"
              >✕</button>
            </div>

            {/* Scrollable body — page-specific controls render here */}
            <div style={{ overflowY: 'auto', padding: '16px 18px 8px' }}>
              {children}
            </div>

            {/* Sticky footer — Done button closes the popup. Pages that
                want Apply behaviour can use onApply instead. */}
            <div style={{
              display: 'flex', gap: 8,
              padding: isMobileLayout ? '12px 18px 18px' : '12px 20px 16px',
              borderTop: '1px solid #e8eef5', background: 'white',
            }}>
              {onClear && (
                <button
                  onClick={() => { onClear(); }}
                  disabled={activeCount === 0}
                  style={{
                    flex: '0 0 auto', padding: '11px 16px', borderRadius: 9,
                    background: activeCount === 0 ? '#f3f7fc' : 'white',
                    color: activeCount === 0 ? '#b0bec5' : '#c0392b',
                    border: `1.5px solid ${activeCount === 0 ? '#d8e2ef' : '#f5b7b1'}`,
                    fontWeight: 800, fontSize: 13,
                    cursor: activeCount === 0 ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                    fontFamily: "'Nunito',sans-serif",
                  }}
                >✕ Clear</button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{
                  flex: 1, padding: '11px 16px', borderRadius: 9,
                  background: '#0d7377', color: 'white', border: 'none',
                  fontWeight: 800, fontSize: 13, cursor: 'pointer',
                  fontFamily: "'Nunito',sans-serif",
                }}
              >Apply Filters ({activeCount})</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Shared "Field" wrapper for popup controls ───────────────────────────────
// Each filter row uses a small uppercase label + control block, matching
// the Tasks page popup. Pages render this directly inside <FilterPopup>.
export function FilterField({ label, children }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 800,
        color: '#6b7a90', textTransform: 'uppercase',
        letterSpacing: 0.4, marginBottom: 5,
      }}>{label}</label>
      {children}
    </div>
  );
}

// ─── Shared input style for popup controls ────────────────────────────────────
// Matches the `IS` constant in Tasks.jsx so all popup inputs look the
// same across pages. Centralised here so we can tweak in one place.
export const FP_INPUT = {
  width: '100%', padding: '9px 13px', borderRadius: 8,
  border: '1.5px solid #d8e2ef', fontFamily: "'Nunito',sans-serif",
  fontSize: 13, color: '#1a2535', outline: 'none',
  background: 'white', fontWeight: 600,
};

// ─── Shared chip-row filter button ────────────────────────────────────────────
// Used by pages that want a tap-friendly radio-style chip row instead of
// a select dropdown. Centralised so all chip rows across pages use the
// same teal/light-grey palette and identical sizing.
export function ChipButton({ active, onClick, children, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '9px 6px', borderRadius: 8, minWidth: 0,
        background: active ? '#0d7377' : '#f8fbff',
        color: active ? 'white' : '#1a2535',
        border: `1.5px solid ${active ? '#0d7377' : '#d8e2ef'}`,
        fontWeight: 800, fontSize: 11, cursor: 'pointer',
        whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.25,
        fontFamily: "'Nunito',sans-serif",
        ...style,
      }}
    >{children}</button>
  );
}
