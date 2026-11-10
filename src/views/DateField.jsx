import { useState } from "react";
import { DAY, niceDate, toDateStr } from "../lib/plan.js";

// A date that's either one day, or a start → finish range.
// value: { start, end }  (end is null for a single day; both null for no date)

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export function dateLabel(start, end) {
  if (!start && !end) return "No date";
  if (start && end && end !== start) return `${cap(niceDate(start))} → ${niceDate(end)}`;
  return cap(niceDate(start || end));
}

export default function DateField({ start, end, onChange, hard = false, showHard, compact }) {
  const [open, setOpen] = useState(!compact);
  const today = toDateStr(new Date());
  const tomorrow = toDateStr(new Date(Date.now() + DAY));
  const mode = !start && !end ? "none" : end && end !== start ? "range" : "single";
  const set = (s, e, h = hard) => onChange({ start: s || null, end: e || null, hard: h });

  if (compact && !open) {
    return (
      <button type="button" className={`date-pill ${mode === "none" ? "empty" : ""}`} onClick={() => setOpen(true)}>
        {mode === "none" ? "Add date" : dateLabel(start, end)}
      </button>
    );
  }

  return (
    <div className={`datefield ${compact ? "compact" : ""}`}>
      <div className="seg">
        <button type="button" className={mode === "none" ? "on" : ""} onClick={() => set(null, null, false)}>No date</button>
        <button type="button" className={mode === "single" ? "on" : ""} onClick={() => set(start || today, hard ? start || today : null)}>One day</button>
        <button type="button" className={mode === "range" ? "on" : ""} onClick={() => set(start || today, end && end !== start ? end : toDateStr(new Date((start ? new Date(start) : new Date()).getTime() + 3 * DAY)))}>Start → finish</button>
      </div>

      {mode === "single" && (
        <div className="row wrap" style={{ marginTop: 10 }}>
          <button type="button" className={`chip ${start === today ? "on" : ""}`} onClick={() => set(today, hard ? today : null)}>Today</button>
          <button type="button" className={`chip ${start === tomorrow ? "on" : ""}`} onClick={() => set(tomorrow, hard ? tomorrow : null)}>Tomorrow</button>
          <input type="date" className="input date" value={start || ""} onChange={(e) => set(e.target.value, hard ? e.target.value : null)} />
        </div>
      )}

      {mode === "range" && (
        <div className="range" style={{ marginTop: 10 }}>
          <label><span>Start</span><input type="date" className="input date" value={start || ""} onChange={(e) => set(e.target.value, end && end < e.target.value ? e.target.value : end)} /></label>
          <label><span>Finish</span><input type="date" className="input date" value={end || ""} min={start || undefined} onChange={(e) => set(start, e.target.value)} /></label>
        </div>
      )}

      {showHard && mode !== "none" && (
        <button type="button" className={`toggle ${hard ? "on" : ""}`} onClick={() => {
          const next = !hard;
          // A one-day hard deadline means it must be done that day
          if (mode === "single") set(start, next ? start : null, next);
          else set(start, end, next);
        }}>
          <span className="sw" />
          <span>Hard deadline<span className="small" style={{ display: "block" }}>Something goes wrong if it's missed</span></span>
        </button>
      )}

      {compact && <button type="button" className="btn quiet sm" onClick={() => setOpen(false)}>Done</button>}
    </div>
  );
}
