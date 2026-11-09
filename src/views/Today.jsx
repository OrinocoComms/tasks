import { buildQueue, didSessionToday, needsExtraSession, planLabel } from "../lib/plan.js";
import TaskRow from "./TaskRow.jsx";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Today({ db, plan, openDesigner, startSession }) {
  const queue = buildQueue(db.tasks, db.steps, plan);
  const doneToday = didSessionToday(db.sessions);
  const extra = needsExtraSession(db.tasks, plan);
  const open = db.tasks.filter((t) => t.status !== "done");
  const toDesign = open.filter((t) => t.status === "designing");
  const rethink = open.filter((t) => plan[t.id]?.staleness === "rethink");
  const dated = open
    .filter((t) => t.due_date && t.deadline_type !== "someday")
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 5);
  const zone = (id) => db.zones.find((z) => z.id === id);
  const next = queue[0];

  return (
    <>
      <div className="kicker">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
      <h1>{greeting()}</h1>
      <p className="sub">{doneToday ? "Today's 15 minutes are done. Nice." : "Fifteen minutes. One small step at a time."}</p>

      {extra && (
        <div className="banner danger">
          <span>⏰</span>
          <div className="grow">
            A hard deadline is at risk. {doneToday ? "A second session today would get it back on track." : "Today's session will start with it."}
          </div>
        </div>
      )}

      {rethink.length > 0 && (
        <div className="banner warn">
          <span>🪑</span>
          <div className="grow">
            <b>{rethink.length === 1 ? `"${rethink[0].title}"` : `${rethink.length} tasks`}</b> {rethink.length === 1 ? "has" : "have"} sat untouched for two weeks or more. That usually means the first step is still too big.
          </div>
          <button className="btn sm ghost" onClick={() => openDesigner(rethink[0].id)}>Shrink it</button>
        </div>
      )}

      {next ? (
        <div className="card hero">
          <div className="kicker">First up</div>
          <div className="step">{next.step.title}</div>
          <div className="row wrap" style={{ marginBottom: 20 }}>
            <span className="small">{zone(next.task.zone_id)?.emoji} {next.task.title}</span>
            {(() => { const l = planLabel(next.task, next.p); return l && <span className={`pill ${l.tone}`}>{l.text}</span>; })()}
          </div>
          <button className="btn accent wide" onClick={startSession}>
            {doneToday ? "Go again: another 15" : "Start my 15"}
          </button>
          <p className="small" style={{ textAlign: "center", margin: "10px 0 0" }}>You only have to do one minute.</p>
          {queue.length > 1 && (
            <p className="small" style={{ marginTop: 16 }}>
              Then: {queue.slice(1, 3).map((q) => q.step.title).join(" · ")}{queue.length > 3 ? " …" : ""}
            </p>
          )}
        </div>
      ) : (
        <div className="card hero">
          <div className="kicker">Nothing ready yet</div>
          <div className="step">{toDesign.length ? "Give a task a first step" : "What's been nagging at you?"}</div>
          <p className="small">
            A task is ready when its first step is small enough to start without thinking.
          </p>
          <button className="btn accent wide" style={{ marginTop: 14 }} onClick={() => openDesigner(toDesign[0]?.id || "new")}>
            {toDesign.length ? `Design "${toDesign[0].title}"` : "Add a task"}
          </button>
        </div>
      )}

      {toDesign.length > 0 && next && (
        <>
          <h2>Needs a first step</h2>
          <div className="card" style={{ padding: "4px 14px" }}>
            {toDesign.slice(0, 4).map((t) => <TaskRow key={t.id} task={t} db={db} plan={plan} onClick={() => openDesigner(t.id)} />)}
          </div>
        </>
      )}

      {dated.length > 0 && (
        <>
          <h2>Deadlines</h2>
          <div className="card" style={{ padding: "4px 14px" }}>
            {dated.map((t) => <TaskRow key={t.id} task={t} db={db} plan={plan} onClick={() => openDesigner(t.id)} />)}
          </div>
        </>
      )}
    </>
  );
}
