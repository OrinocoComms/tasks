// The app's own pop-up calendar. One tap picks a day; in "Start → due" mode,
// the first tap is the start and the second the due date.
import { useState } from "react";
import { parseDate, toDateStr, todayStr } from "./lib/logic.js";
import { Icon } from "./ui.jsx";

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];

function Month({ start, end, min, onPick }) {
  const first = parseDate(start || todayStr());
  const [month, setMonth] = useState(new Date(first.getFullYear(), first.getMonth(), 1));
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
          const sel = s === start || s === end;
          const between = start && end && s > start && s < end;
          return (
            <button type="button" key={s} disabled={off} onClick={() => onPick(s)} aria-pressed={sel}
              aria-label={d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
              style={{ height: 34, border: 0, background: between ? "var(--rust-soft)" : "transparent", display: "grid", placeItems: "center", padding: 0, cursor: off ? "default" : "pointer" }}>
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

/**
 * Pop-up calendar.
 * allowRange: show the "Due date | Start → due" switch.
 * onSave({ start, due }): for a single day, start is that day and due is null.
 */
export function DatePopup({ title, start, due, allowRange = false, min, onSave, onClose }) {
  const [range, setRange] = useState(!!(allowRange && start && due && start !== due));
  const [s, setS] = useState(start || null);
  const [e, setE] = useState(range ? due : null);
  const [step, setStep] = useState("start");

  const pick = (d) => {
    if (!range) return onSave({ start: d, due: null });
    if (step === "start" || (s && d < s)) { setS(d); setE(null); setStep("due"); return; }
    setE(d);
    onSave({ start: s, due: d });
  };
  const hint = !range ? "" : step === "start" ? "Tap the start date" : "Now tap the due date";

  return (
    <div className="scrim center" style={{ zIndex: 70, background: "rgba(30,28,27,0.3)" }} onClick={(ev) => { ev.stopPropagation(); onClose(); }}>
      <div role="dialog" aria-label={title || "Choose a date"} onClick={(ev) => ev.stopPropagation()}
        style={{ width: "100%", maxWidth: 300, background: "var(--paper)", borderRadius: 20, padding: "12px 12px 10px", display: "flex", flexDirection: "column", gap: 8, boxShadow: "0 16px 40px rgba(30,28,27,0.22)", animation: "up 0.18s ease-out" }}>
        {allowRange && (
          <div className="seg" style={{ alignSelf: "center" }}>
            <button type="button" className={!range ? "on" : ""} onClick={() => { setRange(false); setStep("start"); }} style={{ minHeight: 32, fontSize: 12 }}>Due date</button>
            <button type="button" className={range ? "on" : ""} onClick={() => { setRange(true); setStep("start"); setE(null); }} style={{ minHeight: 32, fontSize: 12 }}>Start → due</button>
          </div>
        )}
        {hint && <span style={{ textAlign: "center", fontSize: 12, color: "var(--muted)" }}>{hint}</span>}
        <Month start={s} end={range ? e : null} min={min} onPick={pick} />
      </div>
    </div>
  );
}
