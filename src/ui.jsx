// Shared bits: icons, task rows, navigation.
import { useState } from "react";
import { childrenOf, dateRange, fmtMins, remainingMins } from "./lib/logic.js";

const S = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" };

export function Icon({ name, size = 20, width = 1.8, color }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", ...S, strokeWidth: width, style: color ? { color } : undefined, "aria-hidden": true };
  switch (name) {
    case "back": return <svg {...p}><path d="M15 5l-7 7 7 7" /></svg>;
    case "plus": return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
    case "chev": return <svg {...p}><path d="M6 9l6 6 6-6" /></svg>;
    case "right": return <svg {...p}><path d="M9 6l6 6-6 6" /></svg>;
    case "check": return <svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
    case "cal": return <svg {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>;
    case "mic": return <svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>;
    case "repeat": return <svg {...p}><path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 014-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 01-4 4H4" /></svg>;
    case "warn": return <svg {...p}><path d="M12 3.5L2.5 20h19z" /><path d="M12 10v4.5" /><path d="M12 17.4v.1" /></svg>;
    case "play": return <svg width={size} height={size} viewBox="0 0 24 24" fill={color || "currentColor"} aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>;
    case "pause": return <svg width={size} height={size} viewBox="0 0 24 24" fill={color || "currentColor"} aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1.2" /><rect x="14" y="4.5" width="4" height="15" rx="1.2" /></svg>;
    case "bolt": return <svg width={size} height={size} viewBox="0 0 24 24" fill="#e3936b" stroke="#1e1c1b" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true"><path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z" /></svg>;
    default: return null;
  }
}

export function AreaIcon({ icon, size = 56, width = 2.2 }) {
  const p = { width: size, height: size, viewBox: "0 0 64 64", ...S, strokeWidth: width, "aria-hidden": true };
  switch (icon) {
    case "house": return <svg {...p}><path d="M8 30L32 10l24 20" /><path d="M14 25v29h36V25" /><path d="M27 54V39h10v15" /><path d="M44 18v-6h5v10" /></svg>;
    case "health": return <svg {...p}><path d="M32 53C14 41 8 32 8 23a12 12 0 0 1 24-4 12 12 0 0 1 24 4c0 9-6 18-24 30z" /></svg>;
    case "kids": return <svg {...p}><circle cx="21" cy="17" r="6" /><path d="M21 27c-5 0-8 3-8 8v9h4v12h8V44h4v-9c0-5-3-8-8-8z" /><circle cx="44" cy="19" r="5.5" /><path d="M38.5 16l-4 2.5M49.5 16l4 2.5" /><path d="M44 28c-4 0-6 3-7 7l-3 13h20l-3-13c-1-4-3-7-7-7z" /><path d="M41 48v8M47 48v8" /></svg>;
    case "garden": return <svg {...p}><circle cx="32" cy="21" r="4.5" /><circle cx="32" cy="11.5" r="5" /><circle cx="41.5" cy="21" r="5" /><circle cx="32" cy="30.5" r="5" /><circle cx="22.5" cy="21" r="5" /><path d="M32 35.5V57" /><path d="M32 48c-7 0-11-4-12-9 7 0 11 4 12 9z" /><path d="M32 44c6 0 10-3 11-8-6 0-10 3-11 8z" /></svg>;
    case "finances": return <svg {...p}><ellipse cx="32" cy="18" rx="18" ry="6" /><path d="M14 18v8c0 3.3 8 6 18 6s18-2.7 18-6v-8" /><path d="M14 26v9c0 3.3 8 6 18 6s18-2.7 18-6v-9" /><path d="M14 35v9c0 3.3 8 6 18 6s18-2.7 18-6v-9" /></svg>;
    case "leisure": return <svg {...p}><circle cx="32" cy="32" r="11" /><path d="M32 8v7M32 49v7M8 32h7M49 32h7M15 15l5 5M44 44l5 5M15 49l5-5M44 20l5-5" /></svg>;
    case "car": return <svg {...p}><path d="M8 41V34c0-3 2-5 5-5.5L20 27l6.5-7.6c1-1.1 2.3-1.4 3.7-1.4h9.6c1.5 0 2.9.6 3.9 1.8L50 27l4.5 1.1c1.9.5 3 2.1 3 4V41h-3.5a7.5 7.5 0 0 0-15 0H25.5a7.5 7.5 0 0 0-15 0z" /><path d="M23.5 27l5.5-6.5h6.5V27z" /><path d="M38.5 20.5h2c1 0 1.8.4 2.4 1.1L47 27h-8.5z" /><circle cx="18" cy="41" r="5.5" /><circle cx="47" cy="41" r="5.5" /></svg>;
    default: return <svg {...p}><circle cx="32" cy="32" r="22" /><path d="M32 17l6 15-6 15-6-15z" /><circle cx="32" cy="32" r="1.5" fill="currentColor" /></svg>;
  }
}

export function Tick({ item, onClick, small }) {
  const on = item.done;
  return (
    <button type="button" className={`tick ${on ? "on" : ""} ${item.priority === "must" ? "must" : ""} ${small ? "sm" : ""}`} onClick={onClick}
      aria-pressed={on} aria-label={`${on ? "Mark not done" : "Mark done"}: ${item.title}`}>
      <span>{on && <Icon name="check" size={small ? 11 : 13} width={3} color="#f2efea" />}</span>
    </button>
  );
}

export function Dot({ item, small }) {
  if (item.done) return null;
  return <span role="img" aria-label={item.priority === "must" ? "Must do today" : "Moveable"} className={`dot ${item.priority === "must" ? "must" : ""} ${small ? "sm" : ""}`} />;
}

// A task row: tick, title + priority dot, then a meta line. Tapping the text opens it.
export function ItemRow({ item, db, first, glowing, onTick, href, meta, showDates, right }) {
  const mins = item.done ? (item.est_mins || 0) : remainingMins(db.items, item);
  return (
    <div className={`row ${first ? "first" : ""} ${item.done ? "done" : ""} ${glowing ? "glow" : ""}`}>
      <Tick item={item} onClick={onTick} />
      <a className="rowbody" href={href}>
        <span className="rowtitle"><span className="t">{item.title}</span><Dot item={item} /></span>
        <span className="meta num">
          {showDates && (item.start_date || item.due_date) && <><Icon name="cal" size={13} width={1.7} /><span>{dateRange(item.start_date, item.due_date)}</span></>}
          {meta}
          {item.repeat && item.repeat.freq !== "never" && <Icon name="repeat" size={13} />}
          {mins > 0 && <span className="right">{fmtMins(mins)}</span>}
        </span>
      </a>
      {right}
    </div>
  );
}

export function useGlow() {
  const [glow, setGlow] = useState(null);
  const fire = (id) => { setGlow(id); setTimeout(() => setGlow((g) => (g === id ? null : g)), 900); };
  return [glow, fire];
}

export function Nav({ tab }) {
  return (
    <nav className="nav" aria-label="Main">
      <a href="#/" className={tab === "today" ? "on" : ""} aria-current={tab === "today" ? "page" : undefined}>Today</a>
      <a href="#/areas" className={`wide ${tab === "areas" ? "on" : ""}`} aria-current={tab === "areas" ? "page" : undefined}>Areas of focus</a>
      <a href="#/more" className={tab === "more" ? "on" : ""} aria-current={tab === "more" ? "page" : undefined}>TBC</a>
    </nav>
  );
}

export function Back({ href, label = "Back" }) {
  return <a className="iconbtn" href={href} aria-label={label} onClick={(e) => { if (history.length > 1 && !href) { e.preventDefault(); history.back(); } }}><Icon name="back" size={22} /></a>;
}

export const countSubtasks = (db, item) => {
  const kids = childrenOf(db.items, item.id);
  return { total: kids.length, done: kids.filter((k) => k.done).length };
};

