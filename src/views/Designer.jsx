import { useState } from "react";
import { aiBreakdown, isDemo } from "../lib/data.js";
import { planLabel, stepsFor } from "../lib/plan.js";

const TESTS = [
  ["action", "One physical action", "You can picture yourself doing it: open, find, write, phone…"],
  ["time", "Under 15 minutes", "It fits easily in one session."],
  ["no_decisions", "No decisions needed", "You don't have to choose or find anything out first."],
  ["start_point", "Obvious where to begin", "You know which drawer, website or person."],
];
const NO_TESTS = { action: false, time: false, no_decisions: false, start_point: false };
const ALL_TESTS = { action: true, time: true, no_decisions: true, start_point: true };

export default function Designer({ task, zoneId, db, plan, actions, onClose, onCreated, celebrate }) {
  if (!task) return <NewTask db={db} zoneId={zoneId} actions={actions} onClose={onClose} onCreated={onCreated} />;
  return <Design task={task} db={db} plan={plan} actions={actions} onClose={onClose} celebrate={celebrate} />;
}

function Sheet({ children, onClose }) {
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function ZonePicker({ zones, value, onChange }) {
  return (
    <div className="chips" style={{ margin: "0 0 18px", padding: 0, flexWrap: "wrap" }}>
      {[...zones].sort((a, b) => a.position - b.position).map((z) => (
        <button key={z.id} type="button" className={`chip ${value === z.id ? "on" : ""}`} onClick={() => onChange(z.id)}>{z.emoji} {z.name}</button>
      ))}
    </div>
  );
}

function NewTask({ db, zoneId, actions, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [zone, setZone] = useState(zoneId || db.zones[0]?.id || null);
  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreated(actions.addTask({ title: title.trim(), zone_id: zone }));
  };
  return (
    <Sheet onClose={onClose}>
      <form onSubmit={submit}>
        <div className="kicker">New task</div>
        <input className="input big" autoFocus placeholder="What's been nagging at you?" value={title} onChange={(e) => setTitle(e.target.value)} style={{ margin: "8px 0 18px" }} />
        <ZonePicker zones={db.zones} value={zone} onChange={setZone} />
        <div className="row">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" style={{ flex: 1 }} disabled={!title.trim()}>Next: break it down →</button>
        </div>
      </form>
    </Sheet>
  );
}

function Design({ task, db, plan, actions, onClose, celebrate }) {
  const all = stepsFor(task.id, db.steps);
  const doneSteps = all.filter((s) => s.done);
  const [items, setItems] = useState(() => all.filter((s) => !s.done).map((s) => s.title));
  const [dirty, setDirty] = useState(false);
  const [tests, setTests] = useState(task.status === "ready" ? ALL_TESTS : NO_TESTS);
  const [firstChecked, setFirstChecked] = useState(items[0] || "");
  const [ai, setAi] = useState(null);         // last AI result
  const [history, setHistory] = useState([]); // [{q, a}]
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const p = plan[task.id];
  const label = planLabel(task, p);
  const isDone = task.status === "done";

  const touch = { touched_at: new Date().toISOString() };
  const update = (changes) => actions.updateTask(task.id, changes);

  const setStepList = (list) => {
    setItems(list);
    setDirty(true);
    // Changing the first step means it needs checking again
    if ((list[0] || "") !== firstChecked) setTests(NO_TESTS);
  };
  const saveSteps = (list = items) => {
    const clean = list.map((s) => s.trim()).filter(Boolean);
    actions.replaceSteps(task.id, clean);
    setDirty(false);
    return clean;
  };

  const runAi = async (hist = history, stepList = items) => {
    setBusy(true);
    setAiError("");
    try {
      const res = await aiBreakdown(task, stepList.filter((s) => s.trim()), hist);
      setAi(res);
      setAnswer("");
    } catch (e) {
      setAiError(e.message);
    }
    setBusy(false);
  };

  const useAi = () => {
    setItems(ai.steps);
    setDirty(true);
    setTests(ai.tests || NO_TESTS);
    setFirstChecked(ai.steps[0] || "");
    if (ai.passes) setAi(null);
  };

  const sendAnswer = (e) => {
    e.preventDefault();
    if (!answer.trim()) return;
    const h = [...history, { q: ai.question, a: answer.trim() }];
    setHistory(h);
    runAi(h, ai.steps || items);
  };

  const allPass = Object.values(tests).every(Boolean) && items.some((s) => s.trim());

  const markReady = () => {
    saveSteps();
    update({ status: "ready", ...touch });
    onClose();
  };

  const close = () => {
    if (dirty) {
      saveSteps();
      // An edited first step that no longer passes the test goes back to designing
      update({ ...touch, ...(task.status === "ready" && !allPass ? { status: "designing" } : {}) });
    }
    onClose();
  };

  const finishTask = () => {
    update({ status: "done", completed_at: new Date().toISOString() });
    onClose();
    celebrate("task-done", task);
  };

  return (
    <Sheet onClose={close}>
      <div className="row spread">
        <div className="kicker">{isDone ? "Finished" : task.status === "ready" ? "Ready to go" : "Designing"}</div>
        <button className="btn quiet sm" onClick={close}>Done</button>
      </div>
      <input className="input big" defaultValue={task.title} onBlur={(e) => e.target.value.trim() && e.target.value !== task.title && update({ title: e.target.value.trim() })} style={{ margin: "6px 0 14px" }} />
      <ZonePicker zones={db.zones} value={task.zone_id} onChange={(id) => update({ zone_id: id })} />

      {p?.staleness === "rethink" && (
        <div className="banner warn">
          <span>🪑</span>
          <div className="grow">This has sat for {p.age} days. No judgement: it usually means the first step still isn't small enough. Let's shrink it.</div>
        </div>
      )}

      {/* Deadline */}
      <h2 style={{ marginTop: 8 }}>What happens if it isn't done?</h2>
      <div className="choice">
        <button className={task.deadline_type === "hard" ? "on" : ""} onClick={() => update({ deadline_type: "hard" })}>
          <b>Something real goes wrong</b><span>A fine, a missed booking, a cost. It's a hard deadline.</span>
        </button>
        <button className={task.deadline_type === "target" ? "on" : ""} onClick={() => update({ deadline_type: "target" })}>
          <b>Nothing much, but I'd like it done by…</b><span>A target date you've chosen.</span>
        </button>
        <button className={task.deadline_type === "someday" ? "on" : ""} onClick={() => update({ deadline_type: "someday", due_date: null })}>
          <b>Nothing, really</b><span>No date. It'll come up when there's space.</span>
        </button>
      </div>
      {task.deadline_type !== "someday" && (
        <div style={{ marginTop: 14 }}>
          <div className="field">
            <label>{task.deadline_type === "hard" ? "Deadline" : "Target date"}</label>
            <input className="input" type="date" value={task.due_date || ""} onChange={(e) => update({ due_date: e.target.value || null })} />
          </div>
          {task.deadline_type === "hard" && (
            <div className="field">
              <label>What goes wrong if it's missed?</label>
              <input className="input" placeholder="e.g. £100 fine" defaultValue={task.consequence || ""} onBlur={(e) => update({ consequence: e.target.value })} />
            </div>
          )}
          {label && <span className={`pill ${label.tone}`}>{label.text}</span>}
          {p && task.due_date && <p className="small">Needs about {p.sessionsNeeded} session{p.sessionsNeeded === 1 ? "" : "s"}{task.status === "designing" ? " (a guess until it has steps)" : ""}.</p>}
        </div>
      )}

      {/* Steps */}
      <h2>Steps</h2>
      {doneSteps.length > 0 && (
        <ul className="steps">
          {doneSteps.map((s) => (
            <li key={s.id} className="done"><span className="n">✓</span><span style={{ flex: 1 }}>{s.title}</span>
              <span className="tools"><button title="Undo" onClick={() => actions.uncompleteStep(s)}>↺</button></span>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && <div className="first-label">{doneSteps.length ? "Next step" : "First step"}</div>}
      <ul className="steps">
        {items.map((s, i) => (
          <li key={i} className={i === 0 ? "first" : ""}>
            <span className="n">{doneSteps.length + i + 1}</span>
            <input value={s} placeholder="A small, physical action" onChange={(e) => setStepList(items.map((x, j) => (j === i ? e.target.value : x)))} />
            <span className="tools">
              {i > 0 && <button title="Move up" onClick={() => { const l = [...items]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; setStepList(l); }}>↑</button>}
              <button title="Remove" onClick={() => setStepList(items.filter((_, j) => j !== i))}>✕</button>
            </span>
          </li>
        ))}
      </ul>
      <button className="btn quiet sm" onClick={() => setStepList([...items, ""])}>+ Add a step</button>

      {/* AI helper */}
      {!isDone && (
        <div style={{ marginTop: 14 }}>
          {!ai && (
            <button className="btn ghost wide" disabled={busy} onClick={() => runAi()}>
              {busy ? "Thinking…" : items.some((s) => s.trim()) ? "✦ Check and shrink my steps" : "✦ Help me break it down"}
            </button>
          )}
          {aiError && <p className="small" style={{ color: "var(--danger)" }}>{isDemo ? aiError : `Couldn't reach the helper: ${aiError}`}</p>}
          {ai && (
            <div className="card ai" style={{ marginTop: 6 }}>
              <div className="kicker">Suggested steps</div>
              <ol style={{ paddingLeft: 20, margin: "8px 0" }}>
                {ai.steps.map((s, i) => <li key={i} style={{ marginBottom: 4, fontWeight: i === 0 ? 600 : 400 }}>{s}</li>)}
              </ol>
              {ai.note && <p className="small">{ai.note}</p>}
              {ai.passes ? (
                <div className="row">
                  <button className="btn accent" onClick={useAi}>Use these steps</button>
                  <button className="btn quiet" onClick={() => setAi(null)}>Keep mine</button>
                </div>
              ) : (
                <form onSubmit={sendAnswer}>
                  <div className="q">{ai.question}</div>
                  <input className="input" autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" />
                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="btn" disabled={busy || !answer.trim()}>{busy ? "Thinking…" : "Answer"}</button>
                    <button type="button" className="btn quiet" onClick={useAi}>Use these anyway</button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {/* First-step test */}
      {!isDone && items.some((s) => s.trim()) && (
        <>
          <h2>Is the first step small enough?</h2>
          <p className="small" style={{ marginTop: -6 }}>“{items[0] || "…"}”</p>
          <div className="tests">
            {TESTS.map(([k, title, hint]) => (
              <button key={k} className={`test ${tests[k] ? "yes" : ai && ai.tests && !ai.tests[k] ? "no" : ""}`}
                onClick={() => { setTests({ ...tests, [k]: !tests[k] }); setFirstChecked(items[0] || ""); }}>
                <span className="box">{tests[k] ? "✓" : ""}</span>
                <span><b>{title}</b><span>{hint}</span></span>
              </button>
            ))}
          </div>
          <button className="btn accent wide" disabled={!allPass} onClick={markReady}>
            {allPass ? (task.status === "ready" ? "Save" : "Ready to go") : "Tick all four to make it ready"}
          </button>
        </>
      )}

      <div className="row spread" style={{ marginTop: 32 }}>
        <button className="btn quiet sm" onClick={() => confirm(`Delete "${task.title}"?`) && (actions.deleteTask(task.id), onClose())}>Delete task</button>
        {isDone
          ? <button className="btn quiet sm" onClick={() => update({ status: "ready", completed_at: null, ...touch })}>Reopen</button>
          : <button className="btn quiet sm" onClick={finishTask}>Mark whole task done</button>}
      </div>
    </Sheet>
  );
}
