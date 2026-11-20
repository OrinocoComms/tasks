import { useState } from "react";
import { outcomeProgress, niceDate } from "../lib/logic.js";
import { AreaIcon, Back, Icon, ItemRow, Nav } from "../ui.jsx";
import { useCompleter } from "./common.jsx";

export default function Area({ db, actions, id }) {
  const area = db.areas.find((a) => a.id === id);
  const [showAchieved, setShowAchieved] = useState(false);
  const [adding, setAdding] = useState(false);
  const { toggle, glow, dialogs } = useCompleter(db, actions);
  if (!area) return <div className="page"><div className="topbar"><Back href="#/areas" /></div><div className="empty">Area not found.</div></div>;

  const outcomes = db.outcomes.filter((o) => o.area_id === id && !o.achieved_at);
  const achieved = db.outcomes.filter((o) => o.area_id === id && o.achieved_at).sort((a, b) => b.achieved_at.localeCompare(a.achieved_at));
  const tasks = db.items.filter((i) => i.area_id === id && !i.outcome_id && !i.parent_id && (!i.done || (i.done_at && Date.now() - new Date(i.done_at) < 86400000)));
  const openCount = tasks.filter((t) => !t.done).length;

  return (
    <div className="page">
      <div className="topbar" style={{ justifyContent: "space-between", paddingRight: 20 }}>
        <Back href="#/areas" label="Back to Areas of focus" />
        <button className="fab" aria-label={`Add to ${area.name}`} onClick={() => setAdding(true)}><Icon name="plus" size={22} width={2} color="#f2efea" /></button>
      </div>
      <div className="scroll" style={{ padding: "0 20px 112px", gap: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <AreaIcon icon={area.icon} size={48} width={2.4} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <h1 className="h1">{area.name}</h1>
            <span className="small">{outcomes.length} outcome{outcomes.length === 1 ? "" : "s"} · {openCount} other task{openCount === 1 ? "" : "s"}</span>
          </div>
        </div>

        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 className="kicker" style={{ margin: "0 0 2px 2px" }}>Outcomes</h2>
          {outcomes.length === 0 && <div className="panel empty">No outcomes yet.</div>}
          {outcomes.map((o) => {
            const p = outcomeProgress(db.items, o);
            return (
              <a key={o.id} href={`#/outcome/${o.id}`} className="panel" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, borderRadius: 18, textDecoration: "none" }}>
                <span style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 17, fontWeight: 500, lineHeight: 1.25 }}>{o.title}</span>
                  <span style={{ color: "var(--faint)", marginTop: 2 }}><Icon name="right" size={16} /></span>
                </span>
                <div className="bar sm" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${o.title} progress`}><div style={{ width: `${p.pct}%` }} /></div>
                <span className="small num" style={{ display: "flex" }}>
                  <span>{p.total ? `${p.done} of ${p.total} tasks · ${p.pct}%` : "No tasks yet"}</span>
                  {o.due_date && <span style={{ marginLeft: "auto" }}>Due {niceDate(o.due_date)}</span>}
                </span>
              </a>
            );
          })}
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 className="kicker" style={{ margin: "0 0 2px 2px" }}>Other tasks</h2>
          <div className="panel" style={{ padding: "2px 4px" }}>
            {tasks.length === 0 && <div className="empty">None.</div>}
            {tasks.map((t, i) => (
              <ItemRow key={t.id} item={t} db={db} first={i === 0} glowing={glow === t.id} onTick={() => toggle(t)} href={`#/task/${t.id}`} showDates />
            ))}
          </div>
        </section>

        {achieved.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => setShowAchieved(!showAchieved)} aria-expanded={showAchieved}
              style={{ minHeight: 44, border: 0, background: "transparent", padding: "0 2px", display: "flex", alignItems: "center", gap: 8, color: "var(--muted)" }}>
              <span className="kicker">Achieved · {achieved.length}</span>
              <span className="chev" style={{ transform: showAchieved ? "rotate(180deg)" : "none", display: "grid" }}><Icon name="chev" size={14} width={2} /></span>
            </button>
            {showAchieved && achieved.map((o) => (
              <a key={o.id} href={`#/outcome/${o.id}`} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--done-bg)", borderRadius: 18, padding: "14px 16px", textDecoration: "none" }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--ink)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="check" size={13} width={3} color="#f2efea" /></span>
                <span style={{ flex: 1, fontSize: 15, color: "var(--soft)" }}>{o.title}</span>
                <span className="small" style={{ fontSize: 12 }}>{new Date(o.achieved_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
              </a>
            ))}
          </section>
        )}
      </div>
      <Nav tab="areas" />
      {adding && (
        <div className="scrim" onClick={() => setAdding(false)}>
          <div className="sheet" role="dialog" aria-label={`Add to ${area.name}`} onClick={(e) => e.stopPropagation()}>
            <span className="kicker">Add to {area.name}</span>
            <a className="btn white" href={`#/task/new?area=${area.id}`}>Task</a>
            <a className="btn white" href={`#/outcome/new?area=${area.id}`}>Outcome</a>
            <button className="btn quiet" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
      {dialogs}
    </div>
  );
}
