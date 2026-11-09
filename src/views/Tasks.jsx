import { useState } from "react";
import TaskRow from "./TaskRow.jsx";
import { isDemo, resetDemo } from "../lib/data.js";
import { supabase } from "../lib/supabase.js";

const ORDER = { overdue: 0, at_risk: 1, start_now: 2, on_track: 3, none: 4 };

export default function Tasks({ db, plan, actions, openDesigner }) {
  const [zoneId, setZoneId] = useState("all");
  const [editing, setEditing] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const sortTasks = (list) =>
    [...list].sort((a, b) =>
      (ORDER[plan[a.id]?.state] ?? 4) - (ORDER[plan[b.id]?.state] ?? 4) ||
      (a.deadline_type === "hard" ? 0 : 1) - (b.deadline_type === "hard" ? 0 : 1) ||
      (a.due_date || "9999").localeCompare(b.due_date || "9999"));

  const open = db.tasks.filter((t) => t.status !== "done");
  const done = db.tasks.filter((t) => t.status === "done").sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
  const zones = [...db.zones].sort((a, b) => a.position - b.position);
  const groups = zoneId === "all"
    ? [...zones.map((z) => ({ zone: z, tasks: open.filter((t) => t.zone_id === z.id) })), { zone: { id: null, name: "No zone", emoji: "·" }, tasks: open.filter((t) => !t.zone_id || !zones.some((z) => z.id === t.zone_id)) }]
    : [{ zone: zones.find((z) => z.id === zoneId), tasks: open.filter((t) => t.zone_id === zoneId) }];

  return (
    <>
      <div className="row spread">
        <h1>Tasks</h1>
        <button className="btn quiet sm" onClick={() => setEditing(true)}>Edit zones</button>
      </div>
      <p className="sub">{open.length} open · sorted by what needs starting first</p>

      <div className="chips">
        <button className={`chip ${zoneId === "all" ? "on" : ""}`} onClick={() => setZoneId("all")}>All</button>
        {zones.map((z) => (
          <button key={z.id} className={`chip ${zoneId === z.id ? "on" : ""}`} onClick={() => setZoneId(z.id)}>
            {z.emoji} {z.name} <span style={{ opacity: 0.6 }}>{open.filter((t) => t.zone_id === z.id).length || ""}</span>
          </button>
        ))}
      </div>

      {groups.filter((g) => g.tasks.length || zoneId !== "all").map((g) => (
        <section key={g.zone?.id ?? "none"}>
          {zoneId === "all" && <h2 style={{ marginTop: 22 }}>{g.zone.emoji} {g.zone.name}</h2>}
          <div className="card" style={{ padding: "4px 14px" }}>
            {g.tasks.length === 0 && <div className="empty">Nothing here. Lovely.</div>}
            {sortTasks(g.tasks).map((t) => <TaskRow key={t.id} task={t} db={db} plan={plan} onClick={() => openDesigner(t.id)} />)}
          </div>
          {zoneId !== "all" && (
            <button className="btn ghost wide" style={{ marginTop: 12 }} onClick={() => openDesigner("new", zoneId)}>+ Add to {g.zone?.name}</button>
          )}
        </section>
      ))}

      {done.length > 0 && (
        <>
          <button className="btn quiet" style={{ marginTop: 20 }} onClick={() => setShowDone(!showDone)}>
            {showDone ? "Hide" : "Show"} finished ({done.length})
          </button>
          {showDone && (
            <div className="card" style={{ padding: "4px 14px" }}>
              {done.slice(0, 30).map((t) => <TaskRow key={t.id} task={t} db={db} plan={plan} onClick={() => openDesigner(t.id)} />)}
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 40, textAlign: "center" }}>
        {isDemo
          ? <button className="btn quiet sm" onClick={resetDemo}>Reset demo data</button>
          : <button className="btn quiet sm" onClick={() => supabase.auth.signOut()}>Sign out</button>}
      </div>

      {editing && <ZoneEditor zones={zones} actions={actions} onClose={() => setEditing(false)} />}
    </>
  );
}

function ZoneEditor({ zones, actions, onClose }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row spread"><h2 style={{ margin: 0 }}>Zones</h2><button className="btn quiet" onClick={onClose}>Done</button></div>
        <ul className="steps" style={{ margin: "14px 0" }}>
          {zones.map((z, i) => (
            <li key={z.id}>
              <input style={{ maxWidth: 44, textAlign: "center" }} defaultValue={z.emoji || ""} onBlur={(e) => actions.updateZone(z.id, { emoji: e.target.value })} />
              <input defaultValue={z.name} onBlur={(e) => e.target.value.trim() && actions.updateZone(z.id, { name: e.target.value.trim() })} />
              <span className="tools">
                <button disabled={i === 0} onClick={() => { actions.updateZone(z.id, { position: zones[i - 1].position }); actions.updateZone(zones[i - 1].id, { position: z.position === zones[i - 1].position ? z.position + 1 : z.position }); }}>↑</button>
                <button onClick={() => confirm(`Delete "${z.name}"? Its tasks will keep going, just without a zone.`) && actions.deleteZone(z.id)}>✕</button>
              </span>
            </li>
          ))}
        </ul>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; actions.addZone(name.trim(), emoji || "•"); setName(""); setEmoji(""); }}>
          <input className="input" style={{ maxWidth: 64, textAlign: "center" }} placeholder="🙂" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
          <input className="input" placeholder="New zone, e.g. Car" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn sm">Add</button>
        </form>
      </div>
    </div>
  );
}
