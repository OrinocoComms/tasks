import { planLabel, stepsFor } from "../lib/plan.js";

export default function TaskRow({ task, db, plan, onClick }) {
  const p = plan[task.id];
  const zone = db.zones.find((z) => z.id === task.zone_id);
  const steps = stepsFor(task.id, db.steps);
  const label = planLabel(task, p);
  const stale = p?.staleness;
  return (
    <button className={`task ${stale === "stale" ? "stale" : ""} ${stale === "rethink" ? "rethink" : ""}`} onClick={onClick}>
      <span className="emoji">{zone?.emoji || "·"}</span>
      <span className="body">
        <span className="title">{task.title}</span>
        <span className="meta">
          {task.deadline_type === "hard" && !label && <span className="pill danger">Hard deadline</span>}
          {label && <span className={`pill ${label.tone}`}>{task.deadline_type === "hard" ? "● " : ""}{label.text}</span>}
          {task.status === "designing" && <span className="pill">Needs a first step</span>}
          {stale === "rethink" && <span className="pill warn">Untouched {p.age} days</span>}
          {steps.length > 0 && (
            <span className="dots">{steps.slice(0, 10).map((s) => <i key={s.id} className={s.done ? "on" : ""} />)}</span>
          )}
        </span>
      </span>
    </button>
  );
}
