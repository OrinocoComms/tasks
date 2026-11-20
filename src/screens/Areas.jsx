import { useState } from "react";
import { AREA_ICONS } from "../lib/logic.js";
import { AreaIcon, Icon, Nav } from "../ui.jsx";

export default function Areas({ db, actions }) {
  const [adding, setAdding] = useState(false);
  const areas = [...db.areas].sort((a, b) => a.position - b.position);
  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(env(safe-area-inset-top) + 36px) 20px 20px 22px" }}>
        <h1 className="h1">Areas of focus</h1>
        <button className="fab" aria-label="Add an area of focus" onClick={() => setAdding(true)}><Icon name="plus" size={22} width={2} color="#f2efea" /></button>
      </div>
      <div className="scroll" style={{ padding: "0 20px 112px" }}>
        <div className="grid2">
          {areas.map((a) => (
            <a key={a.id} className="tile" href={`#/area/${a.id}`}><AreaIcon icon={a.icon} /><span>{a.name}</span></a>
          ))}
        </div>
      </div>
      <Nav tab="areas" />
      {adding && <AddArea onAdd={(name, icon) => { actions.addArea(name, icon); setAdding(false); }} onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddArea({ onAdd, onClose }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("general");
  return (
    <div className="scrim" onClick={onClose}>
      <form className="sheet" role="dialog" aria-label="New area of focus" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) onAdd(name.trim(), icon); }}>
        <span className="kicker">New area of focus</span>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Pets" />
        <span className="small">Icon</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {AREA_ICONS.map((ic) => (
            <button type="button" key={ic} aria-label={ic} aria-pressed={icon === ic} onClick={() => setIcon(ic)}
              style={{ aspectRatio: 1, border: 0, borderRadius: 16, background: "var(--card)", boxShadow: icon === ic ? "inset 0 0 0 2px var(--ink)" : "none", display: "grid", placeItems: "center" }}>
              <AreaIcon icon={ic} size={36} />
            </button>
          ))}
        </div>
        <button className="btn" disabled={!name.trim()}>Add area</button>
        <button type="button" className="btn quiet" onClick={onClose}>Cancel</button>
      </form>
    </div>
  );
}
