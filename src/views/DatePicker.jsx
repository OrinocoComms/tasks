import { useState } from "react";
import { niceDate, parseDate, toDateStr } from "../lib/plan.js";

// Calendar icon button + pop-over calendar.
// A date is one day ({ start, end: null }) or a range ({ start, end }).
// The popover shows one date field; "+ Start date" turns it into a range.

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export function dateLabel(start, end) {
  if (!start && !end) return "";
  if (start && end && end !== start) return `${cap(niceDate(start))} → ${niceDate(end)}`;
  return cap(niceDate(start || end));
}

const fmtField = (d) => {
  if (!d) return "";
  const x = parseDate(d);
  return `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}/${String(x.getFullYear()).slice(2)}`;
};
const parseField = (txt) => {
  const m = txt.trim().match(/^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?$/);
  if (!m) return null;
  const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : new Date().getFullYear();
  const d = new Date(y, +m[2] - 1, +m[1]);
  return isNaN(d) || d.getDate() !== +m[1] ? null : toDateStr(d);
};

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

function Field({ value, active, placeholder, onFocus, onCommit, onClear }) {
  const [txt, setTxt] = useState(null);
  const shown = txt ?? fmtField(value);
  const commit = () => {
    if (txt === null) return;
    const d = parseField(txt);
    if (d) onCommit(d);
    setTxt(null);
  };
  return (
    <div className={`dp-field ${active ? "on" : ""}`} onClick={onFocus}>
      <input value={shown} placeholder={placeholder} onFocus={onFocus} onChange={(e) => setTxt(e.target.value)}
        onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commit())} />
      {value && <button type="button" className="dp-x" onClick={(e) => { e.stopPropagation(); onClear(); }} aria-label="Clear">×</button>}
    </div>
  );
}

export default function DatePicker({ start, end, onChange, hard = false, showHard = false, align = "right" }) {
  const [open, setOpen] = useState(false);
  // Stored: single day = { start: d, end: null } (or end = d when hard). Range = { start, end }.
  const isRange = !!(start && end && end !== start);
  const due = isRange ? end : start || end; // the main date field
  const [withStart, setWithStart] = useState(isRange);
  const [active, setActive] = useState("due");
  const [month, setMonth] = useState(() => { const d = due ? parseDate(due) : new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const today = toDateStr(new Date());

  const emit = (s, d, h = hard) => {
    if (s && d && s !== d) onChange({ start: s < d ? s : d, end: s < d ? d : s, hard: h });
    else { const one = d || s || null; onChange({ start: one, end: h && one ? one : null, hard: one ? h : false }); }
  };
  const startVal = isRange ? start : null;

  const pick = (d) => {
    if (withStart && active === "start") { emit(d, due && due >= d ? due : null); setActive("due"); }
    else emit(withStart ? startVal : null, d);
  };

  // Month grid, Monday first
  const first = new Date(month);
  const lead = (first.getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i - lead + 1));
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <span className={`dp ${align}`}>
      <button type="button" className={`dp-trigger ${due ? "set" : ""}`} onClick={() => setOpen(!open)} aria-label="Set date">
        <CalendarIcon />
        {due && <span>{dateLabel(start, end)}</span>}
      </button>
      {open && (
        <>
          <div className="dp-backdrop" onClick={() => setOpen(false)} />
          <div className="dp-pop" onClick={(e) => e.stopPropagation()}>
            <div className="dp-fields">
              {withStart ? (
                <Field value={startVal} active={active === "start"} placeholder="Start date" onFocus={() => setActive("start")}
                  onCommit={(d) => { emit(d, due); setActive("due"); }} onClear={() => { emit(null, due); setWithStart(false); setActive("due"); }} />
              ) : (
                <button type="button" className="dp-add" onClick={() => { setWithStart(true); setActive("start"); }}>+ Start date</button>
              )}
              <Field value={due} active={active === "due"} placeholder="Date" onFocus={() => setActive("due")}
                onCommit={(d) => emit(withStart ? startVal : null, d)} onClear={() => emit(withStart ? startVal : null, null)} />
            </div>
            <div className="dp-head">
              <button type="button" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
              <span>{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
              <button type="button" onClick={() => shift(1)} aria-label="Next month">›</button>
            </div>
            <div className="dp-grid">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} className="dow">{d}</span>)}
              {days.map((d) => {
                const s = toDateStr(d);
                const inMonth = d.getMonth() === month.getMonth();
                const weekend = d.getDay() === 0 || d.getDay() === 6;
                const sel = s === due || (startVal && s === startVal);
                const between = startVal && due && s > startVal && s < due;
                return (
                  <button type="button" key={s} onClick={() => pick(s)}
                    className={`day ${inMonth ? "" : "out"} ${weekend ? "wk" : ""} ${s === today ? "today" : ""} ${sel ? "sel" : ""} ${between ? "between" : ""}`}>
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="dp-foot">
              {showHard ? (
                <button type="button" className={`toggle ${hard ? "on" : ""}`} disabled={!due} onClick={() => emit(startVal, due, !hard)}>
                  <span className="sw" /><span>Hard deadline</span>
                </button>
              ) : <span />}
              <button type="button" className="btn quiet sm" onClick={() => { onChange({ start: null, end: null, hard: false }); setWithStart(false); setActive("due"); }}>Clear</button>
            </div>
          </div>
        </>
      )}
    </span>
  );
}
