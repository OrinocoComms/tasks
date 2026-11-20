// The app's own calendar, so picking a date works the same everywhere
// (the browser's built-in date box doesn't always open, e.g. inside embedded previews).
import { useState } from "react";
import { addDays, parseDate, toDateStr, todayStr } from "./lib/logic.js";
import { Icon } from "./ui.jsx";

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];

export function Calendar({ value, min, onPick }) {
  const start = parseDate(value || todayStr());
  const [month, setMonth] = useState(new Date(start.getFullYear(), start.getMonth(), 1));
  const lead = (month.getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i - lead + 1));
  const today = todayStr();
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0 8px" }}>
        <button type="button" className="iconbtn" aria-label="Previous month" onClick={() => shift(-1)}><Icon name="back" size={18} /></button>
        <span style={{ fontWeight: 500, fontSize: 16 }}>{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
        <button type="button" className="iconbtn" aria-label="Next month" onClick={() => shift(1)} style={{ transform: "rotate(180deg)" }}><Icon name="back" size={18} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 2 }}>
        {WEEK.map((d, i) => <span key={i} style={{ textAlign: "center", fontSize: 12, fontWeight: 500, color: "var(--muted)", padding: "4px 0 6px" }}>{d}</span>)}
        {days.map((d) => {
          const s = toDateStr(d);
          const out = d.getMonth() !== month.getMonth();
          const off = min && s < min;
          const sel = s === value;
          return (
            <button type="button" key={s} disabled={off} onClick={() => onPick(s)} aria-label={d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} aria-pressed={sel}
              style={{ height: 40, border: 0, background: "transparent", display: "grid", placeItems: "center", padding: 0, cursor: off ? "default" : "pointer" }}>
              <span className="num" style={{
                width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 14,
                background: sel ? "var(--salmon)" : "transparent", fontWeight: sel || s === today ? 600 : 400,
                boxShadow: s === today && !sel ? "inset 0 0 0 1.5px var(--ink)" : "none",
                color: off ? "#cfc9c1" : out ? "var(--faint)" : "var(--ink)",
              }}>{d.getDate()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// A calendar in a sheet: tap a day to choose it
export function CalendarSheet({ title = "Choose a date", value, min, onPick, onClose, onClear }) {
  return (
    <div className="scrim" style={{ zIndex: 70 }} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <span className="kicker">{title}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" className="chip" style={{ background: "var(--card)" }} onClick={() => onPick(todayStr())} disabled={min && todayStr() < min}>Today</button>
          <button type="button" className="chip" style={{ background: "var(--card)" }} onClick={() => onPick(addDays(todayStr(), 1))}>Tomorrow</button>
          <button type="button" className="chip" style={{ background: "var(--card)" }} onClick={() => onPick(addDays(todayStr(), 7))}>In a week</button>
        </div>
        <Calendar value={value} min={min} onPick={onPick} />
        {onClear && <button type="button" className="btn white" onClick={onClear}>No date</button>}
        <button type="button" className="btn quiet" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
