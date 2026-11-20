import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AREA_ICONS } from "../lib/logic.js";
import { AreaIcon, Icon, Nav } from "../ui.jsx";

export default function Areas({ db, actions }) {
  const [adding, setAdding] = useState(false);
  const areas = [...db.areas].sort((a, b) => a.position - b.position);
  const save = (ids) => ids.forEach((id, i) => {
    const a = db.areas.find((x) => x.id === id);
    if (a && a.position !== i) actions.updateArea(id, { position: i });
  });
  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(env(safe-area-inset-top) + 36px) 20px 20px 22px" }}>
        <h1 className="h1">Areas of focus</h1>
        <button className="fab" aria-label="Add an area of focus" onClick={() => setAdding(true)}><Icon name="plus" size={22} width={2} color="#f2efea" /></button>
      </div>
      <div className="scroll" style={{ padding: "0 20px 112px" }}>
        <TileGrid areas={areas} onReorder={save} />
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

// Press and hold a tile, then drag it; the others slide out of the way
function TileGrid({ areas, onReorder }) {
  const [order, setOrder] = useState(areas.map((a) => a.id));
  const [drag, setDrag] = useState(null); // { id, dx, dy }
  const gridRef = useRef(null);
  const els = useRef({});
  const prev = useRef({});
  const st = useRef({});
  const orderRef = useRef(order);
  orderRef.current = order;

  // Follow the saved order unless a drag is under way
  const key = areas.map((a) => a.id).join();
  useEffect(() => { if (!st.current.active) setOrder(areas.map((a) => a.id)); }, [key]);

  // Slide tiles from where they were to where they are now
  useLayoutEffect(() => {
    const now = {};
    for (const id of order) {
      const el = els.current[id]; if (!el) continue;
      const r = el.getBoundingClientRect(); now[id] = r;
      const p = prev.current[id];
      if (p && id !== drag?.id && (p.left !== r.left || p.top !== r.top)) {
        el.animate([{ transform: `translate(${p.left - r.left}px, ${p.top - r.top}px)` }, { transform: "none" }],
          { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
    }
    prev.current = now;
  });

  // Stop the page scrolling while dragging (must be a non-passive listener)
  useEffect(() => {
    const g = gridRef.current;
    const stop = (e) => { if (st.current.active) e.preventDefault(); };
    g.addEventListener("touchmove", stop, { passive: false });
    document.addEventListener("touchmove", stop, { passive: false });
    return () => { g.removeEventListener("touchmove", stop); document.removeEventListener("touchmove", stop); };
  }, []);

  const down = (e, id) => {
    if (e.button && e.button !== 0) return;
    const el = els.current[id];
    st.current = { id, x0: e.clientX, y0: e.clientY, pointer: e.pointerId, el, active: false };
    st.current.timer = setTimeout(() => {
      const slots = order.map((oid) => els.current[oid].getBoundingClientRect());
      const r = el.getBoundingClientRect();
      Object.assign(st.current, { active: true, slots, gx: st.current.x0 - r.left, gy: st.current.y0 - r.top, moved: false });
      try { el.setPointerCapture(st.current.pointer); } catch {}
      navigator.vibrate?.(15);
      setDrag({ id, dx: 0, dy: 0 });
    }, 380);
  };

  const move = (e) => {
    const s = st.current; if (!s.id) return;
    if (!s.active) {
      if (Math.hypot(e.clientX - s.x0, e.clientY - s.y0) > 8) { clearTimeout(s.timer); st.current = {}; }
      return;
    }
    s.moved = true;
    // Nearest slot to the dragged tile's centre
    const cx = e.clientX - s.gx + s.slots[0].width / 2, cy = e.clientY - s.gy + s.slots[0].height / 2;
    let best = 0, bd = Infinity;
    s.slots.forEach((r, i) => { const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy); if (d < bd) { bd = d; best = i; } });
    const o = orderRef.current;
    if (o.indexOf(s.id) !== best) { const n = o.filter((x) => x !== s.id); n.splice(best, 0, s.id); orderRef.current = n; setOrder(n); }
    const slot = s.slots[best];
    setDrag({ id: s.id, dx: e.clientX - s.gx - slot.left, dy: e.clientY - s.gy - slot.top });
  };

  const up = () => {
    const s = st.current; clearTimeout(s.timer);
    if (s.active) {
      s.justDragged = true;
      setTimeout(() => { st.current = {}; }, 0);
      setDrag(null);
      onReorder(orderRef.current);
    } else st.current = {};
  };

  const byId = Object.fromEntries(areas.map((a) => [a.id, a]));
  return (
    <div className="grid2" ref={gridRef}>
      {order.filter((id) => byId[id]).map((id) => {
        const a = byId[id], dragging = drag?.id === id;
        return (
          <div key={id} ref={(el) => { els.current[id] = el; }} className={`tile${dragging ? " lifting" : ""}`}
            role="link" tabIndex={0} aria-label={a.name} draggable={false}
            onKeyDown={(e) => { if (e.key === "Enter") location.hash = `#/area/${id}`; }}
            style={dragging ? { transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.06)` } : undefined}
            onPointerDown={(e) => down(e, id)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => { if (!(st.current.justDragged || st.current.active)) location.hash = `#/area/${id}`; }}>
            <AreaIcon icon={a.icon} /><span>{a.name}</span>
          </div>
        );
      })}
    </div>
  );
}
