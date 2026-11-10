import { useState } from "react";
import { niceDate, stepsFor, toDateStr } from "../lib/plan.js";

// Today's list. A task with no subtasks shows up from its start date.
// A subtask with its own date shows up from that date. Undated subtasks
// show up one at a time (the next one) from the task's start date.
export function todayList(db) {
  const today = toDateStr(new Date());
  const out = [];
  for (const task of db.tasks) {
    if (task.status === "done") continue;
    const open = stepsFor(task.id, db.steps).filter((s) => !s.done);
    if (!open.length) {
      if (task.do_date && task.do_date <= today) out.push({ key: task.id, task, step: null, start: task.do_date, end: task.due_date });
      continue;
    }
    const nextUndated = open.find((s) => !s.do_date);
    for (const step of open) {
      if (step.do_date ? step.do_date <= today : step === nextUndated && task.do_date && task.do_date <= today) {
        out.push({ key: step.id, task, step, start: step.do_date || task.do_date, end: step.due_date || (step.do_date ? null : task.due_date) });
      }
    }
  }
  return out.sort((a, b) => (a.end || "9999").localeCompare(b.end || "9999") || a.start.localeCompare(b.start) || a.task.created_at.localeCompare(b.task.created_at));
}

function when(item, today) {
  if (item.end) {
    if (item.end < today) return { late: true, text: `was due ${niceDate(item.end)}` };
    if (item.end === today) return { late: true, text: "due today" };
    return { text: `until ${niceDate(item.end)}` };
  }
  if (item.start < today) return { late: true, text: "from earlier" };
  return null;
}

export default function Today({ db, actions, startSession }) {
  const items = todayList(db);
  const [picked, setPicked] = useState(null);
  const [flipped, setFlipped] = useState(null);
  const [adding, setAdding] = useState("");
  const today = toDateStr(new Date());
  const tomorrowStr = toDateStr(new Date(Date.now() + 86400000));
  const tomorrowCount = db.tasks.filter((t) => t.status !== "done" && t.do_date === tomorrowStr).length;
  const doneToday = db.tasks.some((t) => t.completed_at && t.completed_at.slice(0, 10) === today) || db.steps.some((s) => s.done_at && s.done_at.slice(0, 10) === today);
  const selected = items.find((i) => i.key === picked) || items[0];
  const zone = (id) => db.zones.find((z) => z.id === id);

  const add = (e) => {
    e.preventDefault();
    if (!adding.trim()) return;
    actions.addTask({ title: adding.trim(), zone_id: null });
    setAdding("");
  };

  return (
    <div className="today">
      {items.length === 0 && (
        <div className="clear">
          <h1>{doneToday ? "All done. Nice." : "Nothing to do."}</h1>
          {tomorrowCount > 0 && <p className="sub">{tomorrowCount} lined up for tomorrow.</p>}
        </div>
      )}

      <div className="pick-list">
        {items.map((item) => {
          const { task, step } = item;
          const on = selected?.key === item.key;
          const isFlipped = step && flipped === item.key;
          // Tap to pick it. Tap a picked subtask again to flip it and see which task it belongs to.
          const tap = () => {
            if (!on) { setPicked(item.key); setFlipped(null); }
            else if (step) setFlipped(isFlipped ? null : item.key);
          };
          return (
            <button key={item.key} className={`pick flip ${on ? "on" : ""} ${isFlipped ? "flipped" : ""} ${step ? "has-parent" : ""}`} onClick={tap}>
              <span className="face front">
                <span className="radio" />
                <span className="title">{step ? step.title : task.title}</span>
              </span>
              {step && (
                <span className="face back" aria-hidden={!isFlipped}>
                  <span className="kicker">Part of</span>
                  <span className="title">{task.title}</span>
                </span>
              )}
            </button>
          );
        })}
        <form className="pick add" onSubmit={add}>
          <span className="radio plus" />
          <input placeholder="Add something for today" value={adding} onChange={(e) => setAdding(e.target.value)} />
        </form>
      </div>

      {items.length > 0 && (
        <div className="start-bar">
          <button className="btn accent wide big" onClick={() => startSession(selected.key)}>Start · 15 min</button>
        </div>
      )}
    </div>
  );
}
