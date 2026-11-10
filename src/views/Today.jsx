import { useState } from "react";
import { stepsFor, toDateStr } from "../lib/plan.js";

// Everything on today's list: open tasks whose do-date is today or earlier
export function todayList(db) {
  const today = toDateStr(new Date());
  return db.tasks
    .filter((t) => t.status !== "done" && t.do_date && t.do_date <= today)
    .sort((a, b) => a.do_date.localeCompare(b.do_date) || a.created_at.localeCompare(b.created_at))
    .map((t) => ({ task: t, step: stepsFor(t.id, db.steps).find((s) => !s.done) || null }));
}

export default function Today({ db, actions, startSession }) {
  const items = todayList(db);
  const [picked, setPicked] = useState(null);
  const [adding, setAdding] = useState("");
  const today = toDateStr(new Date());
  const tomorrowStr = toDateStr(new Date(Date.now() + 86400000));
  const tomorrowCount = db.tasks.filter((t) => t.status !== "done" && t.do_date === tomorrowStr).length;
  const doneToday = db.tasks.some((t) => t.completed_at && t.completed_at.slice(0, 10) === today) || db.steps.some((s) => s.done_at && s.done_at.slice(0, 10) === today);
  const selected = items.find((i) => i.task.id === picked) || items[0];
  const zone = (id) => db.zones.find((z) => z.id === id);

  const add = (e) => {
    e.preventDefault();
    if (!adding.trim()) return;
    actions.addTask({ title: adding.trim(), zone_id: null });
    setAdding("");
  };

  return (
    <div className="today">
      <div className="kicker">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
      <h1>Today</h1>
      <p className="sub">
        {items.length === 0 ? (doneToday ? "All done for today. Nice." : "Nothing on today's list.") : `${items.length} to do. Pick where to start.`}
      </p>
      {items.length === 0 && tomorrowCount > 0 && <p className="small" style={{ marginTop: -12, marginBottom: 20 }}>{tomorrowCount} lined up for tomorrow.</p>}

      <div className="pick-list">
        {items.map(({ task, step }) => {
          const on = selected?.task.id === task.id;
          return (
            <button key={task.id} className={`pick ${on ? "on" : ""}`} onClick={() => setPicked(task.id)}>
              <span className="radio" />
              <span className="body">
                <span className="title">{step ? step.title : task.title}</span>
                <span className="meta">
                  {step && <span>{zone(task.zone_id)?.emoji} {task.title}</span>}
                  {!step && zone(task.zone_id) && <span>{zone(task.zone_id).emoji} {zone(task.zone_id).name}</span>}
                  {task.do_date < today && <span className="late">from earlier</span>}
                  {task.postponed >= 3 && <span className="late">moved {task.postponed}×</span>}
                </span>
              </span>
            </button>
          );
        })}
        <form className="pick add" onSubmit={add}>
          <span className="radio plus">+</span>
          <input placeholder="Add something for today" value={adding} onChange={(e) => setAdding(e.target.value)} />
        </form>
      </div>

      {items.length > 0 && (
        <div className="start-bar">
          <button className="btn accent wide big" onClick={() => startSession(selected.task.id)}>Start · 15 min</button>
        </div>
      )}
    </div>
  );
}
