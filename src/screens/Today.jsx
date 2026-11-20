import { DatePopup } from "../Calendar.jsx";
import { useEffect, useRef, useState } from "react";
import {
  addDays, doneToday, fmtMins, ordinal, plannedMins, quickWins, todayItems, todayStr, unallocated, dateRange,
} from "../lib/logic.js";
import { condense } from "../lib/store.js";
import { AreaIcon, Icon, ItemRow, Nav } from "../ui.jsx";
import { useCompleter } from "./common.jsx";

export default function Today({ db, actions }) {
  const [open, setOpen] = useState({ today: true, unallocated: true });
  const [sheet, setSheet] = useState(null); // add | rebalance | quick | voice
  const { toggle, glow, dialogs } = useCompleter(db, actions);
  const limit = db.settings?.daily_limit_mins || 60;

  const live = todayItems(db.items);
  const finished = doneToday(db.items);
  const list = [...live, ...finished];
  const planned = plannedMins(list);
  const left = plannedMins(live);
  const over = planned > limit;
  const unalloc = unallocated(db.items);
  const now = new Date();

  // Under each task: its outcome; under a subtask: the task it belongs to
  const metaFor = (item, showVoice) => {
    const outcome = db.outcomes.find((o) => o.id === item.outcome_id);
    const parent = item.parent_id && db.items.find((i) => i.id === item.parent_id);
    return (
      <>
        {parent ? <span>{parent.title}</span> : outcome ? <span>{outcome.title}</span> : null}
      </>
    );
  };

  return (
    <div className="page">
      {/* Date + time against the daily limit */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, padding: "calc(env(safe-area-inset-top) + 28px) 20px 16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="kicker" style={{ fontSize: 13 }}>{now.toLocaleDateString("en-GB", { weekday: "long" })}</span>
          <span className="h1">{now.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</span>
        </div>
        <div style={{ background: over ? "var(--rust-soft)" : "var(--card)", borderRadius: 16, padding: "10px 14px", display: "flex", flexDirection: "column", alignItems: "flex-end", transition: "background 0.4s" }}>
          <span style={{ fontSize: 12, color: over ? "var(--must)" : "var(--muted)" }}>{over ? `Planned · limit ${fmtMins(limit)}` : "Left today, est."}</span>
          <span className="num" style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>{fmtMins(over ? planned : left)}</span>
        </div>
      </div>

      {/* Key + voice, quick win, add */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "0 20px 12px 22px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--muted)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="dot must" style={{ marginTop: 0 }} />Must do today</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="dot" style={{ marginTop: 0 }} />Moveable</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="roundbtn" aria-label="Add a task by voice" onClick={() => setSheet("voice")}><Icon name="mic" /></button>
          <button aria-label="Quick win: give me a 5-minute task" onClick={() => setSheet("quick")}
            style={{ height: 48, border: 0, borderRadius: 999, background: "var(--card)", padding: "0 14px 0 12px", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600 }}>
            <Icon name="bolt" size={18} />5 min
          </button>
          <button className="fab" aria-label="Add an outcome or task" onClick={() => setSheet("add")}><Icon name="plus" size={22} width={2} color="#f2efea" /></button>
        </div>
      </div>

      <div className="scroll">
        {over && (
          <div className="alert" role="alert">
            <span className="ic"><Icon name="warn" size={20} width={2} color="#fff" /></span>
            <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{fmtMins(planned - limit)} over your {limit === 60 ? "hour" : fmtMins(limit)}</span>
            <button onClick={() => setSheet("rebalance")}>Rebalance</button>
          </div>
        )}


        <Section title="Today" open={open.today} onToggle={() => setOpen({ ...open, today: !open.today })}
          summary={`${finished.length} of ${list.length} done`}>
          {list.length === 0 && <div className="empty">Nothing on today. Enjoy it, or grab a 5-minute win.</div>}
          {list.map((item, i) => (
            <ItemRow key={item.id} item={item} db={db} first={i === 0} glowing={glow === item.id}
              onTick={() => toggle(item)} href={`#/task/${item.id}`} meta={metaFor(item, false)} />
          ))}
        </Section>

        <Section title="Unallocated" open={open.unallocated} onToggle={() => setOpen({ ...open, unallocated: !open.unallocated })}
          summary={String(unalloc.length)}>
          {unalloc.length === 0 && <div className="empty">Nothing here.</div>}
          {unalloc.map((item, i) => (
            <ItemRow key={item.id} item={item} db={db} first={i === 0} glowing={glow === item.id}
              onTick={() => toggle(item)} href={`#/task/${item.id}`} meta={metaFor(item, true)} />
          ))}
        </Section>
      </div>
      <Nav tab="today" />

      {sheet === "add" && <AddChooser onClose={() => setSheet(null)} />}
      {sheet === "rebalance" && <Rebalance db={db} actions={actions} limit={limit} onClose={() => setSheet(null)} />}
      {sheet === "quick" && <QuickWin db={db} onClose={() => setSheet(null)} />}
      {sheet === "voice" && <Voice actions={actions} onClose={() => setSheet(null)} />}
      {dialogs}
    </div>
  );
}

function Section({ title, summary, open, onToggle, children }) {
  return (
    <section className="panel">
      <button className="panel-head" onClick={onToggle} aria-expanded={open}>
        <span className="h2" style={{ flex: 1 }}>{title}</span>
        <span className="small num" style={{ fontSize: 14 }}>{summary}</span>
        <span className="chev" style={{ transform: open ? "rotate(180deg)" : "none", display: "grid" }}><Icon name="chev" size={18} /></span>
      </button>
      {open && <div style={{ padding: "0 4px 4px" }}>{children}</div>}
    </section>
  );
}


function AddChooser({ onClose }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Add" onClick={(e) => e.stopPropagation()}>
        <span className="kicker">Add</span>
        <a className="btn white" href="#/task/new" style={{ minHeight: 60, fontSize: 18, fontWeight: 600 }}>Task</a>
        <a className="btn white" href="#/outcome/new" style={{ minHeight: 60, fontSize: 18, fontWeight: 600 }}>Outcome</a>
        <button className="btn quiet" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ---------- Rebalance: get today back within the limit ----------
function Rebalance({ db, actions, limit, onClose }) {
  const [movedHere, setMovedHere] = useState([]); // snapshots for undo
  const [shifter, setShifter] = useState(null); // { item, date }
  const live = todayItems(db.items);
  const planned = plannedMins([...live, ...doneToday(db.items)]);
  const over = planned > limit;
  const tomorrow = addDays(todayStr(), 1);

  const doMove = (item, date) => {
    setMovedHere((m) => [...m, { ...item, newDate: date }]);
    actions.moveItem(item, date);
  };
  const tryMove = (item, date) => {
    if ((item.moved_count || 0) + 1 >= 3) return setShifter({ item, date });
    doMove(item, date);
  };
  const undo = (snap) => {
    actions.updateItem(snap.id, { start_date: snap.start_date, due_date: snap.due_date, moved_count: snap.moved_count });
    setMovedHere((m) => m.filter((x) => x.id !== snap.id));
  };
  const order = [...live].sort((a, b) => (a.priority === "must") - (b.priority === "must"));

  return (
    <div className="scrim" onClick={() => !over && onClose()}>
      <div className="sheet" role="dialog" aria-label="Rebalance today" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px" }}>
          <span className="h2" style={{ fontSize: 22 }}>Fit today into {limit === 60 ? "an hour" : fmtMins(limit)}</span>
          <div className="bar"><div style={{ width: `${Math.min(100, (planned / limit) * 100)}%`, background: over ? "var(--must)" : "var(--ink)" }} /></div>
          <span className="num" style={{ fontSize: 13, color: over ? "var(--must)" : "var(--soft)" }}>
            {fmtMins(planned)} planned · {over ? `${fmtMins(planned - limit)} to move` : "within your limit"}
          </span>
        </div>
        <div className="panel" style={{ padding: "2px 4px" }}>
          {order.map((item, i) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 6px 10px 12px", borderTop: i ? "1px solid var(--line)" : 0 }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 15, lineHeight: 1.3 }}>{item.title}</span>
                <span className="num" style={{ fontSize: 12, color: (item.moved_count || 0) >= 2 ? "var(--must)" : "var(--muted)" }}>
                  {fmtMins(item.est_mins || 0)}{item.priority === "must" ? " · Must do today" : ""}{item.moved_count ? ` · moved ${item.moved_count}× already` : ""}
                </span>
              </div>
              <button className="chip" onClick={() => tryMove(item, tomorrow)}>Tomorrow</button>
              <DateButton label={`Move "${item.title}" to another day`} onPick={(d) => tryMove(item, d)} />
            </div>
          ))}
          {movedHere.map((snap) => (
            <div key={snap.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 6px 10px 12px", borderTop: "1px solid var(--line)" }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 15, color: "#8a847c" }}>{snap.title}</span>
                <span className="small" style={{ fontSize: 12 }}>Moved to {dateRange(snap.newDate)}</span>
              </div>
              <button className="btn quiet" style={{ width: "auto", textDecoration: "underline" }} onClick={() => undo(snap)}>Undo</button>
            </div>
          ))}
        </div>
        <button className={`btn ${over ? "off" : ""}`} onClick={() => !over && onClose()} aria-disabled={over}>
          {over ? `Move ${fmtMins(planned - limit)} more to finish` : "Done"}
        </button>
      </div>
      {shifter && <Shifter item={shifter.item} onClose={() => setShifter(null)}
        onMove={(d) => { doMove(shifter.item, d || shifter.date); setShifter(null); }}
        onDrop={() => { actions.deleteItem(shifter.item.id); setShifter(null); }} />}
    </div>
  );
}

function DateButton({ label, onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label={label} onClick={() => setOpen(true)}
        style={{ width: 36, height: 36, border: 0, borderRadius: "50%", background: "var(--paper)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon name="cal" size={16} width={1.6} />
      </button>
      {open && <DatePopup title="Move to" min={addDays(todayStr(), 1)} onSave={({ start }) => { setOpen(false); onPick(start); }} onClose={() => setOpen(false)} />}
    </>
  );
}

// A task that keeps getting pushed back
function Shifter({ item, onClose, onMove, onDrop }) {
  const [picking, setPicking] = useState(false);
  const times = (item.moved_count || 0) + 1;
  return (
    <div className="scrim center" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="dialog" role="alertdialog" aria-label={`Moving this for the ${ordinal(times)} time`} onClick={(e) => e.stopPropagation()}>
        <span style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--must)", background: "var(--rust-soft)", borderRadius: 999, padding: "4px 10px" }}>{ordinal(times)} move</span>
        <span style={{ fontSize: 21, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.2 }}>“{item.title}” keeps getting pushed back.</span>
        <span style={{ fontSize: 14, color: "var(--soft)", marginBottom: 6 }}>It might be too big, or not that important. What would help?</span>
        <a className="btn" href={`#/task/${item.id}`}>Break it into smaller steps</a>
        <button className="btn white" onClick={() => setPicking(true)}>Pick a date and stick to it</button>
        {picking && <DatePopup title="Do it on" min={addDays(todayStr(), 1)} onSave={({ start }) => { setPicking(false); onMove(start); }} onClose={() => setPicking(false)} />}
        <button className="btn white" onClick={onDrop}>Drop it</button>
        <button className="btn quiet" onClick={() => onMove()}>Move it anyway</button>
      </div>
    </div>
  );
}

// ---------- Quick win ----------
function QuickWin({ db, onClose }) {
  const options = quickWins(db.items);
  const [i, setI] = useState(0);
  const pick = options[i % Math.max(1, options.length)];
  const outcome = pick && db.outcomes.find((o) => o.id === pick.outcome_id);
  const area = pick && db.areas.find((a) => a.id === pick.area_id);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Quick win" onClick={(e) => e.stopPropagation()}>
        <span className="kicker" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="bolt" size={16} />Quick win · 5 min</span>
        {pick ? (
          <>
            <div className="panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{pick.title}</span>
              <span className="small">{[area?.name, outcome?.title].filter(Boolean).join(" · ") || "No area yet"}</span>
            </div>
            <a className="btn salmon" href={`#/timer/${pick.id}`}><Icon name="play" size={16} />Start</a>
            {options.length > 1 && <button className="btn white" onClick={() => setI(i + 1)}>Give me another</button>}
          </>
        ) : (
          <div className="panel empty">No 5-minute tasks waiting. Give some tasks a 5 min time and they'll show up here.</div>
        )}
        <button className="btn quiet" onClick={onClose}>Not now</button>
      </div>
    </div>
  );
}

// ---------- Voice ----------
function Voice({ actions, onClose }) {
  const Rec = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const [stage, setStage] = useState(Rec ? "listening" : "type"); // listening | type | thinking | heard
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const recRef = useRef(null);

  useEffect(() => {
    if (!Rec) return;
    const rec = new Rec();
    rec.lang = "en-GB";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => setText(Array.from(e.results).map((r) => r[0].transcript).join(" "));
    rec.onerror = () => setStage((s) => (s === "listening" ? "type" : s));
    try { rec.start(); } catch { setStage("type"); }
    recRef.current = rec;
    return () => { try { rec.stop(); } catch { /* ignore */ } };
  }, []);

  const finish = async () => {
    try { recRef.current?.stop(); } catch { /* ignore */ }
    if (!text.trim()) return setStage("type");
    setStage("thinking");
    setTitle(await condense(text.trim()));
    setStage("heard");
  };
  const add = () => { actions.addItem({ title: title.trim() || text.trim().slice(0, 60), description: text.trim(), from_voice: true }); onClose(); };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Add a task by voice" onClick={(e) => e.stopPropagation()}>
        {stage === "listening" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, padding: "18px 0 8px" }}>
            <div style={{ position: "relative", width: 96, height: 96 }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--salmon)", animation: "listen 1.4s ease-out infinite" }} />
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--ink)", display: "grid", placeItems: "center" }}><Icon name="mic" size={34} color="#f2efea" /></span>
            </div>
            <span style={{ fontSize: 17, fontWeight: 500 }}>Listening…</span>
            <span className="small" style={{ fontSize: 14, textAlign: "center", minHeight: 40 }}>{text}</span>
            <button className="btn" style={{ width: "auto", padding: "0 28px" }} onClick={finish}>Done</button>
            <button className="btn quiet" style={{ width: "auto" }} onClick={() => { try { recRef.current?.stop(); } catch { /* ignore */ } setStage("type"); }}>Type instead</button>
          </div>
        )}
        {stage === "type" && (
          <>
            <span className="kicker">Say or type it</span>
            <textarea className="input" rows={4} autoFocus value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Use your keyboard's microphone (Google voice typing, Wispr Flow…) or just type" />
            <button className="btn" onClick={finish}>Make it a task</button>
          </>
        )}
        {stage === "thinking" && <div className="empty" style={{ textAlign: "center" }}>Shortening…</div>}
        {stage === "heard" && (
          <>
            <span className="kicker">New task</span>
            <div className="panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Task title"
                style={{ padding: 0, fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em" }} />
              <span className="small" style={{ lineHeight: 1.45 }}>“{text}”</span>
              <span className="small" style={{ fontSize: 12 }}>Your full words are kept in the description.</span>
            </div>
            <button className="btn" onClick={add}>Add to Unallocated</button>
          </>
        )}
        <button className="btn quiet" onClick={onClose}>Discard</button>
      </div>
    </div>
  );
}

export { AreaIcon };
