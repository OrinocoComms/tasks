import { DatePopup } from "../Calendar.jsx";
import { useState } from "react";
import { childrenOf, dateRange, fmtMins, niceDate, outcomeProgress, remainingMins } from "../lib/logic.js";
import { Back, Dot, Icon, Tick } from "../ui.jsx";
import { go } from "../App.jsx";
import { grow, useCompleter } from "./common.jsx";

function AreaPill({ db, value, onChange }) {
  const area = db.areas.find((a) => a.id === value);
  return (
    <label className="pillbtn">
      <span className="lbl">Area</span><span className="val">{area ? area.name : "None"}</span>
      <select value={value || ""} onChange={(e) => onChange(e.target.value || null)} aria-label="Area of focus">
        <option value="">None</option>
        {[...db.areas].sort((a, b) => a.position - b.position).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
  );
}
export { AreaPill };

function DuePill({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="pillbtn" style={{ marginLeft: "auto" }} onClick={() => setOpen(true)}>
        <Icon name="cal" size={15} width={1.6} /><span className="val">{value ? `Due ${niceDate(value)}` : "Set due date"}</span>
      </button>
      {open && <DatePopup title="Outcome due date" start={value} onSave={({ start }) => { onChange(start); setOpen(false); }} onClose={() => setOpen(false)} />}
    </>
  );
}

export default function Outcome({ db, actions, id, query }) {
  if (id === "new") return <NewOutcome db={db} actions={actions} areaId={query.area} taskId={query.task} then={query.then} />;
  const outcome = db.outcomes.find((o) => o.id === id);
  if (!outcome) return <div className="page"><div className="topbar"><Back href="#/" /></div><div className="empty">Outcome not found.</div></div>;
  return <OutcomeView db={db} actions={actions} outcome={outcome} />;
}

function NewOutcome({ db, actions, areaId, taskId, then }) {
  const fromTask = taskId || then === "task";
  const [title, setTitle] = useState("");
  const [area, setArea] = useState(areaId || null);
  const [due, setDue] = useState(null);
  const [desc, setDesc] = useState("");
  const save = () => {
    if (!title.trim()) return;
    const o = actions.addOutcome({ title: title.trim(), area_id: area, due_date: due, description: desc.trim() });
    if (taskId) {
      const t = db.items.find((i) => i.id === taskId);
      actions.updateItem(taskId, { outcome_id: o.id, ...(area && !t?.area_id ? { area_id: area } : {}) });
      return go(`/task/${taskId}`);
    }
    if (then === "task") return go(`/task/new?outcome=${o.id}${area ? `&area=${area}` : ""}`);
    go(`/outcome/${o.id}`);
  };
  return (
    <div className="page">
      <div className="topbar"><Back /><AreaPill db={db} value={area} onChange={setArea} /><DuePill value={due} onChange={setDue} /></div>
      <div className="scroll" style={{ padding: "10px 20px 140px", gap: 16 }}>
        <span className="kicker">New outcome</span>
        <textarea className="input title" rows={1} autoFocus placeholder="What do you want to achieve?" value={title} ref={grow}
          onChange={(e) => { setTitle(e.target.value.replace(/\n/g, "")); grow(e.target); }} />
        <label className="small" style={{ display: "flex", flexDirection: "column", gap: 6 }}>Description (optional)
          <textarea className="input" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Why it matters, what done looks like…" />
        </label>
        {!fromTask && <span className="small">Next you'll add its tasks: every outcome needs at least one.</span>}
      </div>
      <div className="bottombar"><button className={`btn ${title.trim() ? "" : "off"}`} onClick={save}>{fromTask ? "Save" : "Save and add tasks"}</button></div>
    </div>
  );
}

function OutcomeView({ db, actions, outcome }) {
  const p = outcomeProgress(db.items, outcome);
  const [open, setOpen] = useState({});
  const [descOpen, setDescOpen] = useState(!!outcome.description);
  const [confirmDel, setConfirmDel] = useState(false);
  const { toggle, glow, dialogs } = useCompleter(db, actions);
  const update = (c) => actions.updateOutcome(outcome.id, c);
  const tasks = [...p.tasks].sort((a, b) => (a.done - b.done) || (a.start_date || "9").localeCompare(b.start_date || "9"));

  return (
    <div className="page">
      <div className="topbar">
        <Back />
        <AreaPill db={db} value={outcome.area_id} onChange={(v) => update({ area_id: v })} />
        <DuePill value={outcome.due_date} onChange={(v) => update({ due_date: v })} />
      </div>
      <div className="scroll" style={{ padding: "8px 20px 120px", gap: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="small num" style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="kicker" style={{ fontSize: 11 }}>Outcome</span>
            <span>{outcome.achieved_at ? "Achieved" : p.total ? `${p.done} of ${p.total} tasks · ${p.pct}%` : "No tasks yet"}</span>
          </div>
          <div className="bar" role="progressbar" aria-label="Outcome progress" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${p.pct}%` }} /></div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <textarea className="input title" rows={1} defaultValue={outcome.title} ref={grow} aria-label="Outcome name"
            onInput={(e) => grow(e.target)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.target.blur())}
            onBlur={(e) => e.target.value.trim() && e.target.value !== outcome.title && update({ title: e.target.value.trim() })} />
          {descOpen
            ? <textarea className="input" rows={3} defaultValue={outcome.description || ""} placeholder="Why it matters, what done looks like…" aria-label="Description"
                onBlur={(e) => update({ description: e.target.value })} />
            : <button onClick={() => setDescOpen(true)} style={{ alignSelf: "flex-start", minHeight: 32, border: 0, padding: 0, background: "transparent", fontSize: 14, color: "var(--soft)", textDecoration: "underline dotted" }}>+ Add a description</button>}
        </div>

        <section className="panel">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px 10px" }}>
            <span className="h2" style={{ flex: 1 }}>Tasks</span>
            <span className="small num" style={{ fontSize: 14 }}>{p.left ? `${fmtMins(p.left)} left` : p.total ? "All done" : ""}</span>
          </div>
          <div style={{ padding: "0 4px" }}>
            {tasks.length === 0 && <div className="empty" style={{ borderTop: "1px solid var(--line)" }}>Add the first task to get this moving.</div>}
            {tasks.map((t) => {
              const kids = childrenOf(db.items, t.id);
              const isOpen = !!open[t.id];
              const mins = t.done ? (t.est_mins || 0) + kids.reduce((n, k) => n + (k.est_mins || 0), 0) : remainingMins(db.items, t);
              return (
                <div key={t.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <div className={`row first ${t.done ? "done" : ""} ${glow === t.id ? "glow" : ""}`} style={{ paddingRight: 0 }}>
                    <Tick item={t} onClick={() => toggle(t)} />
                    <a className="rowbody" href={`#/task/${t.id}`}>
                      <span className="rowtitle"><span className="t">{t.title}</span><Dot item={t} /></span>
                      <span className="meta num">
                        {(t.start_date || t.due_date) && <><Icon name="cal" size={13} width={1.7} /><span>{dateRange(t.start_date, t.due_date)}</span></>}
                        {t.repeat && t.repeat.freq !== "never" && <Icon name="repeat" size={13} />}
                        {mins > 0 && <span className="right">{fmtMins(mins)}</span>}
                      </span>
                    </a>
                    <button onClick={() => setOpen({ ...open, [t.id]: !isOpen })} aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} subtasks of ${t.title}`}
                      style={{ width: 44, height: 44, flexShrink: 0, border: 0, background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, padding: 0 }}>
                      <span className="chev" style={{ transform: isOpen ? "rotate(180deg)" : "none", display: "grid" }}><Icon name="chev" size={16} /></span>
                      {kids.length > 0 && <span className="num" style={{ fontSize: 10, color: "var(--muted)" }}>{kids.filter((k) => k.done).length}/{kids.length}</span>}
                    </button>
                  </div>
                  {isOpen && (
                    <div style={{ display: "flex", flexDirection: "column", margin: "0 8px 8px 40px", paddingLeft: 10, borderLeft: "1.5px solid var(--line2)" }}>
                      {kids.map((k) => (
                        <div key={k.id} className={`row first ${k.done ? "done" : ""} ${glow === k.id ? "glow" : ""}`} style={{ padding: 0, alignItems: "flex-start" }}>
                          <Tick item={k} small onClick={() => toggle(k)} />
                          <a className="rowbody" href={`#/task/${k.id}`} style={{ padding: "8px 8px 8px 0" }}>
                            <span className="rowtitle"><span className="t" style={{ fontSize: 14 }}>{k.title}</span><Dot item={k} small /></span>
                            <span className="meta num" style={{ fontSize: 12 }}>
                              {(k.start_date || k.due_date) && <><Icon name="cal" size={12} width={1.7} /><span>{dateRange(k.start_date, k.due_date)}</span></>}
                              {k.est_mins ? <span className="right">{fmtMins(k.est_mins)}</span> : null}
                            </span>
                          </a>
                        </div>
                      ))}
                      <a href={`#/task/new?parent=${t.id}`} style={{ alignSelf: "flex-start", minHeight: 40, display: "flex", alignItems: "center", paddingLeft: 12, fontSize: 14, color: "var(--soft)", textDecoration: "none" }}>+ Add a subtask</a>
                    </div>
                  )}
                </div>
              );
            })}
            <a className="addrow" style={{ display: "flex", alignItems: "center", textDecoration: "none" }} href={`#/task/new?outcome=${outcome.id}${outcome.area_id ? `&area=${outcome.area_id}` : ""}`}>+ Add a task</a>
          </div>
        </section>

        <button className="btn quiet" onClick={() => (confirmDel ? (actions.deleteOutcome(outcome.id), go("/")) : setConfirmDel(true))}>
          {confirmDel ? "Tap again to delete (its tasks are kept)" : "Delete outcome"}
        </button>
      </div>
      {dialogs}
    </div>
  );
}
