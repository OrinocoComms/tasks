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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0 4px" }}>
        <button type="button" className="iconbtn" style={{ width: 36, height: 36 }} aria-label="Previous month" onClick={() => shift(-1)}><Icon name="back" size={16} /></button>
        <span style={{ fontWeight: 500, fontSize: 14 }}>{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
        <button type="button" className="iconbtn" aria-label="Next month" onClick={() => shift(1)} style={{ width: 36, height: 36, transform: "rotate(180deg)" }}><Icon name="back" size={16} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 2 }}>
        {WEEK.map((d, i) => <span key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 500, color: "var(--muted)", padding: "2px 0 4px" }}>{d}</span>)}
        {days.map((d) => {
          const s = toDateStr(d);
          const out = d.getMonth() !== month.getMonth();
          const off = min && s < min;
          const sel = s === value;
          return (
            <button type="button" key={s} disabled={off} onClick={() => onPick(s)} aria-label={d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} aria-pressed={sel}
              style={{ height: 34, border: 0, background: "transparent", display: "grid", placeItems: "center", padding: 0, cursor: off ? "default" : "pointer" }}>
              <span className="num" style={{
                width: 30, height: 30, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 13,
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

// A small pop-up calendar: tap a day to choose it
export function CalendarSheet({ title = "Choose a date", value, min, onPick, onClose, onClear }) {
  const small = { background: "var(--card)", minHeight: 30, padding: "0 10px", fontSize: 12 };
  return (
    <div className="scrim center" style={{ zIndex: 70, background: "rgba(30,28,27,0.3)" }} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 300, background: "var(--paper)", borderRadius: 20, padding: "14px 12px 10px", display: "flex", flexDirection: "column", gap: 8, boxShadow: "0 16px 40px rgba(30,28,27,0.22)", animation: "up 0.18s ease-out" }}>
        <span className="kicker" style={{ fontSize: 11, padding: "0 4px" }}>{title}</span>
        <div style={{ display: "flex", gap: 5, padding: "0 2px" }}>
          <button type="button" className="chip" style={small} onClick={() => onPick(todayStr())} disabled={min && todayStr() < min}>Today</button>
          <button type="button" className="chip" style={small} onClick={() => onPick(addDays(todayStr(), 1))}>Tomorrow</button>
          <button type="button" className="chip" style={small} onClick={() => onPick(addDays(todayStr(), 7))}>In a week</button>
        </div>
        <Calendar value={value} min={min} onPick={onPick} />
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          {onClear && <button type="button" className="chip" style={small} onClick={onClear}>No date</button>}
          <button type="button" className="chip" style={{ ...small, background: "transparent" }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
