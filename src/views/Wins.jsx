import { DAY, startOfDay } from "../lib/plan.js";

function weekStart() {
  const d = startOfDay();
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - dow * DAY);
}

export default function Wins({ db }) {
  const ws = weekStart().getTime();
  const monthAgo = Date.now() - 30 * DAY;
  const doneSteps = db.steps.filter((s) => s.done && s.done_at);
  const doneTasks = db.tasks.filter((t) => t.status === "done" && t.completed_at);
  const stepsWeek = doneSteps.filter((s) => new Date(s.done_at).getTime() >= ws).length;
  const sessionsWeek = db.sessions.filter((s) => new Date(s.started_at).getTime() >= ws);
  const tasksMonth = doneTasks.filter((t) => new Date(t.completed_at).getTime() >= monthAgo).length;
  const minutesWeek = Math.round(sessionsWeek.reduce((n, s) => n + s.actual_seconds, 0) / 60);

  const days = Array.from({ length: 7 }, (_, i) => {
    const start = ws + i * DAY;
    return {
      label: new Date(start).toLocaleDateString("en-GB", { weekday: "narrow" }),
      on: db.sessions.some((s) => { const t = new Date(s.started_at).getTime(); return t >= start && t < start + DAY; }),
    };
  });

  // Log: tasks and steps from the last 30 days, grouped by day
  const taskTitle = Object.fromEntries(db.tasks.map((t) => [t.id, t.title]));
  const entries = [
    ...doneTasks.map((t) => ({ when: t.completed_at, kind: "task", title: t.title })),
    ...doneSteps.map((s) => ({ when: s.done_at, kind: "step", title: s.title, from: taskTitle[s.task_id] })),
  ].filter((e) => new Date(e.when).getTime() >= monthAgo).sort((a, b) => b.when.localeCompare(a.when));
  const groups = [];
  for (const e of entries) {
    const key = new Date(e.when).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
    if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, items: [] });
    groups[groups.length - 1].items.push(e);
  }

  return (
    <>
      <h1>Wins</h1>
      <p className="sub">Everything you've got done. It adds up.</p>
      <div className="stats">
        <div className="stat"><b>{stepsWeek}</b><span>steps this week</span></div>
        <div className="stat"><b>{minutesWeek}</b><span>minutes this week</span></div>
        <div className="stat"><b>{tasksMonth}</b><span>tasks finished in 30 days</span></div>
      </div>
      <div className="week">
        {days.map((d, i) => <div key={i}><i className={d.on ? "on" : ""} />{d.label}</div>)}
      </div>
      <p className="small">{sessionsWeek.length ? `${sessionsWeek.length} session${sessionsWeek.length === 1 ? "" : "s"} this week.` : "No sessions yet this week. One minute is enough to start."}</p>

      {groups.length === 0 && <div className="empty">Your wins will show up here.</div>}
      {groups.map((g) => (
        <section key={g.key}>
          <h2>{g.key}</h2>
          {g.items.map((e, i) => (
            <div key={i} className={`win ${e.kind}`}>
              <span className="c">{e.kind === "task" ? "★" : "✓"}</span>
              <div>{e.kind === "task" ? <b>{e.title}</b> : e.title}{e.from && <div className="small">{e.from}</div>}</div>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
