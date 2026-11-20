import { useEffect, useState } from "react";
import { childrenOf, openChildren } from "../lib/logic.js";
import { AreaIcon, Icon } from "../ui.jsx";

// The running clock survives leaving the screen: going back pauses it where it got to.
const KEY = (id) => `timer:${id}`;
const load = (id) => { try { return JSON.parse(localStorage.getItem(KEY(id))) || { banked: 0, startedAt: 0, running: false }; } catch { return { banked: 0, startedAt: 0, running: false }; } };
const store = (id, t) => { try { localStorage.setItem(KEY(id), JSON.stringify(t)); } catch { /* ignore */ } };

export default function Timer({ db, actions, id }) {
  const item = db.items.find((i) => i.id === id);
  const [t, setT] = useState(() => load(id));
  const [, tick] = useState(0);
  const [ask, setAsk] = useState(null);
  const [done, setDone] = useState(null); // { secs, marked }

  useEffect(() => { const i = setInterval(() => t.running && tick((n) => n + 1), 500); return () => clearInterval(i); }, [t.running]);
  // Leaving the screen pauses the clock
  useEffect(() => () => {
    const cur = load(id);
    if (cur.running) store(id, { banked: cur.banked + Date.now() - cur.startedAt, startedAt: 0, running: false });
  }, [id]);

  if (!item) return <div className="page"><div className="topbar"><a className="iconbtn" href="#/" aria-label="Back"><Icon name="back" size={22} /></a></div><div className="empty">Not found.</div></div>;

  const parent = item.parent_id && db.items.find((i) => i.id === item.parent_id);
  const outcome = db.outcomes.find((o) => o.id === (item.outcome_id || parent?.outcome_id));
  const area = db.areas.find((a) => a.id === (item.area_id || parent?.area_id));
  const est = item.est_mins || 0;
  const elapsed = t.banked + (t.running ? Date.now() - t.startedAt : 0);
  const left = est * 60 - Math.floor(elapsed / 1000);
  const over = est > 0 && left < 0;
  const a = Math.abs(left);
  const clock = est ? `${over ? "−" : ""}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}` : `${Math.floor(elapsed / 60000)}:${String(Math.floor(elapsed / 1000) % 60).padStart(2, "0")}`;

  const update = (next) => { setT(next); store(id, next); };
  const playPause = () => (t.running
    ? update({ banked: t.banked + Date.now() - t.startedAt, startedAt: 0, running: false })
    : update({ ...t, startedAt: Date.now(), running: true }));

  const finish = (withChildren) => {
    const secs = Math.round(elapsed / 1000);
    actions.completeItem(item, { withChildren });
    if (secs > 0) actions.saveSession(item.id, secs);
    localStorage.removeItem(KEY(id));
    setT({ banked: elapsed, startedAt: 0, running: false });
    setAsk(null);
    setDone({ secs, marked: withChildren });
  };
  const complete = () => {
    const open = openChildren(db.items, item.id);
    if (open.length) { if (t.running) playPause(); return setAsk(open); }
    finish(false);
  };

  // After a subtask: the next unfinished sibling, else the main task
  let next = null;
  if (done && parent) {
    next = childrenOf(db.items, parent.id).find((s) => !s.done && s.id !== item.id) || (!parent.done ? parent : null);
  }

  if (done) {
    const took = Math.round(done.secs / 60);
    const diff = took - est;
    return (
      <div className="page" style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: "0 32px 40px", gap: 10 }}>
        <div style={{ width: 112, height: 112, borderRadius: "50%", background: "var(--ink)", display: "grid", placeItems: "center", animation: "doneglow 1.2s ease-out", marginBottom: 18 }}>
          <Icon name="check" size={50} width={2.6} color="#f2efea" />
        </div>
        <span className="kicker">Done</span>
        <h1 className="h1" style={{ fontSize: 30 }}>{item.title}</h1>
        <span style={{ fontSize: 15, color: "var(--soft)" }}>
          {done.secs < 60 ? "Ticked off." : `Took ${Math.floor(done.secs / 60)}:${String(done.secs % 60).padStart(2, "0")}${est ? (diff > 0 ? `, ${diff} min over the estimate.` : diff < 0 ? `, ${-diff} min under the estimate.` : ", right on the estimate.") : "."}`}
        </span>
        {done.marked && <span className="small">Subtasks marked done too.</span>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 400, marginTop: 28 }}>
          {next ? (
            <>
              <a className="btn salmon" href={`#/timer/${next.id}`} style={{ textTransform: "none", letterSpacing: 0 }}><Icon name="play" size={16} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Next: {next.title}</span></a>
              <a className="btn white" href={`#/task/${parent.id}`}>Back to the task</a>
            </>
          ) : (
            <>
              <a className="btn" href="#/">Back to Today</a>
              {outcome && <a className="btn white" href={`#/outcome/${outcome.id}`}>See the outcome</a>}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <a className="iconbtn" href={`#/task/${item.id}`} onClick={(e) => { if (history.length > 1) { e.preventDefault(); history.back(); } }} aria-label="Back (pauses the timer)"><Icon name="back" size={22} /></a>
        <span className="kicker" style={{ fontSize: 11 }}>{t.running ? "In progress" : elapsed ? "Paused" : item.parent_id ? "Subtask" : "Task"}</span>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 28px 0", textAlign: "center" }}>
        <div style={{ marginBottom: 18 }}><AreaIcon icon={area?.icon || "general"} size={64} /></div>
        <span className="small">{parent ? `Part of: ${parent.title}` : outcome ? outcome.title : area ? area.name : ""}</span>
        <h1 className="h1" style={{ margin: "8px 0 0", fontSize: 30, lineHeight: 1.15 }}>{item.title}</h1>
        <button onClick={playPause} aria-label={t.running ? "Pause" : elapsed ? "Resume" : "Start"}
          style={{ marginTop: 44, width: 152, height: 152, border: 0, borderRadius: "50%", background: "var(--ink)", display: "grid", placeItems: "center", boxShadow: "0 14px 34px rgba(30,28,27,0.22)" }}>
          {t.running ? <Icon name="pause" size={46} color="#f2efea" /> : <span style={{ marginLeft: 6, display: "grid" }}><Icon name="play" size={50} color="#f2efea" /></span>}
        </button>
        <div role="timer" className="num" style={{ marginTop: 36, fontSize: 64, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1, color: over ? "var(--must)" : "var(--ink)" }}>{clock}</div>
        <span style={{ marginTop: 10, fontSize: 14, color: over ? "var(--must)" : "var(--muted)" }}>
          {over ? `Over the ${est} min estimate. Keep going.` : elapsed && est ? `of ${est} min` : ""}
        </span>
      </div>
      <div style={{ padding: "14px 20px calc(env(safe-area-inset-bottom) + 28px)" }}>
        <button className="btn salmon" style={{ minHeight: 56, fontSize: 16 }} onClick={complete}><Icon name="check" size={18} width={2.6} />Complete</button>
      </div>

      {ask && (
        <div className="scrim" onClick={() => setAsk(null)}>
          <div className="sheet" role="dialog" aria-label="Unfinished subtasks" onClick={(e) => e.stopPropagation()}>
            <span className="h2">{ask.length} subtask{ask.length === 1 ? " isn't" : "s aren't"} ticked off yet.</span>
            <span className="small" style={{ marginBottom: 6 }}>{ask.map((i) => i.title).join(" · ")}</span>
            <button className="btn" onClick={() => finish(true)}>Mark them done too</button>
            <button className="btn white" onClick={() => finish(false)}>Just complete this task</button>
            <button className="btn quiet" onClick={() => setAsk(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
