import { useState } from "react";
import { aiBreakdown, isDemo } from "../lib/data.js";
import { planLabel, stepsFor, toDateStr } from "../lib/plan.js";
import DateField from "./DateField.jsx";

const TESTS = [
  ["action", "One physical action", "You can picture yourself doing it: open, find, write, phone…"],
  ["time", "Under 15 minutes", "It fits easily in one session."],
  ["no_decisions", "No decisions needed", "You don't have to choose or find anything out first."],
  ["start_point", "Obvious where to begin", "You know which drawer, website or person."],
];
const NO_TESTS = { action: false, time: false, no_decisions: false, start_point: false };

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

// The zone, shown as the small heading; tap to change it
function ZoneSelect({ zones, value, onChange }) {
  return (
    <label className="zone-select">
      <select value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">No zone</option>
        {[...zones].sort((a, b) => a.position - b.position).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
      </select>
      <span className="caret">▾</span>
    </label>
  );
}

// Task dates are stored as do_date (start) and due_date (finish)
const taskDates = (t) => ({ start: t.do_date, end: t.due_date });
function datesToTask({ start, end }, hard) {
  return {
    do_date: start,
    due_date: end,
    deadline_type: hard && end ? "hard" : end ? "target" : "someday",
  };
}

function NewTask({ db, zoneId, actions, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [zone, setZone] = useState(zoneId || db.zones[0]?.id || null);
  const [dates, setDates] = useState({ start: toDateStr(new Date()), end: null });
  const [hard, setHard] = useState(false);
  const create = () => actions.addTask({ title: title.trim(), zone_id: zone, ...datesToTask(dates, hard) });
  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    create();
    onClose();
  };
  return (
    <Sheet onClose={onClose}>
      <form onSubmit={submit}>
        <ZoneSelect zones={db.zones} value={zone} onChange={setZone} />
        <input className="input big" autoFocus placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} style={{ margin: "6px 0 18px" }} />
        <DateField start={dates.start} end={dates.end} onChange={(d) => { setDates(d); setHard(d.hard); }} hard={hard} showHard />
        <div className="row" style={{ marginTop: 22 }}>
          <button className="btn" style={{ flex: 1 }} disabled={!title.trim()}>Save</button>
          <button type="button" className="btn ghost" disabled={!title.trim()} onClick={() => onCreated(create())}>Add subtasks →</button>
        </div>
      </form>
    </Sheet>
  );
}

function Design({ task, db, plan, actions, onClose, celebrate }) {
  const all = stepsFor(task.id, db.steps);
  const doneSteps = all.filter((s) => s.done);
  const [items, setItems] = useState(() => all.filter((s) => !s.done).map((s) => ({ title: s.title, do_date: s.do_date || null, due_date: s.due_date || null })));
  const [dirty, setDirty] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [tests, setTests] = useState(NO_TESTS);
  const [ai, setAi] = useState(null);
  const [history, setHistory] = useState([]);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const p = plan[task.id];
  const label = planLabel(task, p);
  const isDone = task.status === "done";
  const hard = task.deadline_type === "hard";
  const titles = items.map((s) => s.title.trim()).filter(Boolean);

  const touch = { touched_at: new Date().toISOString() };
  const update = (changes) => actions.updateTask(task.id, changes);

  const setStepList = (list) => { setItems(list); setDirty(true); };
  const setStep = (i, changes) => setStepList(items.map((x, j) => (j === i ? { ...x, ...changes } : x)));
  const saveSteps = () => {
    actions.replaceSteps(task.id, items.filter((s) => s.title.trim()).map((s) => ({ ...s, title: s.title.trim() })));
    setDirty(false);
  };

  const runAi = async (hist = history, stepList = titles) => {
    setBusy(true);
    setAiError("");
    try {
      setAi(await aiBreakdown(task, stepList, hist));
      setAnswer("");
    } catch (e) {
      setAiError(e.message);
    }
    setBusy(false);
  };
  const useAi = () => {
    // Keep any dates already set on steps with the same wording
    const byTitle = Object.fromEntries(items.map((s) => [s.title.trim(), s]));
    setStepList(ai.steps.map((t) => ({ title: t, do_date: byTitle[t]?.do_date || null, due_date: byTitle[t]?.due_date || null })));
    setTests(ai.tests || NO_TESTS);
    setAi(null);
  };
  const sendAnswer = (e) => {
    e.preventDefault();
    if (!answer.trim()) return;
    const h = [...history, { q: ai.question, a: answer.trim() }];
    setHistory(h);
    runAi(h, ai.steps || titles);
  };

  const close = () => {
    if (dirty) {
      saveSteps();
      update(touch);
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
        <ZoneSelect zones={db.zones} value={task.zone_id} onChange={(id) => update({ zone_id: id })} />
        <button className="btn quiet sm" onClick={close}>Done</button>
      </div>
      <input className="input big" defaultValue={task.title} onBlur={(e) => e.target.value.trim() && e.target.value !== task.title && update({ title: e.target.value.trim() })} style={{ margin: "4px 0 14px" }} />

      {!isDone && (
        <>
          <DateField
            start={task.do_date} end={task.due_date}
            onChange={(d) => update(datesToTask(d, d.hard))}
            hard={hard} showHard
          />
          {label && <div style={{ marginTop: 10 }}><span className={`pill ${label.tone}`}>{label.text}</span></div>}
        </>
      )}

      {p?.staleness === "rethink" && (
        <div className="banner warn" style={{ marginTop: 14 }}>
          <div className="grow">This has sat for {p.age} days. That usually means the first step still isn't small enough.</div>
        </div>
      )}

      {/* Subtasks, right under the task */}
      <div className="subtasks">
        {doneSteps.map((s) => (
          <div key={s.id} className="sub done">
            <span className="n">✓</span>
            <span className="t">{s.title}</span>
            <button className="x" title="Undo" onClick={() => actions.uncompleteStep(s)}>↺</button>
          </div>
        ))}
        {items.map((s, i) => (
          <div key={i} className={`sub ${i === 0 ? "first" : ""}`}>
            <span className="n" />
            <div className="grow">
              <textarea className="t" rows={1} value={s.title} placeholder="Subtask"
                ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
                onChange={(e) => setStep(i, { title: e.target.value.replace(/\n/g, " ") })} />
              <DateField compact start={s.do_date} end={s.due_date} onChange={({ start, end }) => setStep(i, { do_date: start, due_date: end })} />
            </div>
            {i > 0 && <button className="x" title="Move up" onClick={() => { const l = [...items]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; setStepList(l); }}>↑</button>}
            <button className="x" title="Remove" onClick={() => setStepList(items.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        {!isDone && (
          <button className="sub add" onClick={() => setStepList([...items, { title: "", do_date: null, due_date: null }])}>
            <span className="n" /><span className="t">Add a subtask</span>
          </button>
        )}
      </div>
      {items.length > 0 && <p className="small" style={{ margin: "6px 0 0" }}>Subtasks without a date show up one at a time, from the task's start date.</p>}

      {/* AI helper */}
      {!isDone && (
        <div style={{ marginTop: 18 }}>
          {!ai && (
            <button className="btn ghost wide" disabled={busy} onClick={() => runAi()}>
              {busy ? "Thinking…" : titles.length ? "Check and shrink my subtasks" : "Help me break it down"}
            </button>
          )}
          {aiError && <p className="small" style={{ color: "var(--danger)" }}>{isDemo ? aiError : `Couldn't reach the helper: ${aiError}`}</p>}
          {ai && (
            <div className="card ai" style={{ marginTop: 6 }}>
              <div className="kicker">Suggested subtasks</div>
              <ol style={{ paddingLeft: 20, margin: "8px 0" }}>
                {ai.steps.map((s, i) => <li key={i} style={{ marginBottom: 4, fontWeight: i === 0 ? 600 : 400 }}>{s}</li>)}
              </ol>
              {ai.note && <p className="small">{ai.note}</p>}
              {ai.passes ? (
                <div className="row">
                  <button className="btn" onClick={useAi}>Use these</button>
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

          {titles.length > 0 && (
            <>
              <button className="btn quiet sm" style={{ marginTop: 10, paddingLeft: 0 }} onClick={() => setCheckOpen(!checkOpen)}>
                {checkOpen ? "Hide" : "Is the first subtask small enough?"}
              </button>
              {checkOpen && (
                <div className="tests">
                  {TESTS.map(([k, title, hint]) => (
                    <button key={k} className={`test ${tests[k] ? "yes" : ""}`} onClick={() => setTests({ ...tests, [k]: !tests[k] })}>
                      <span className="box">{tests[k] ? "✓" : ""}</span>
                      <span><b>{title}</b><span>{hint}</span></span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="row spread" style={{ marginTop: 32 }}>
        <button className="btn quiet sm" onClick={() => (confirmDelete ? (actions.deleteTask(task.id), onClose()) : setConfirmDelete(true))}>
          {confirmDelete ? "Tap again to delete" : "Delete task"}
        </button>
        {isDone
          ? <button className="btn quiet sm" onClick={() => update({ status: "ready", completed_at: null, ...touch })}>Reopen</button>
          : <button className="btn quiet sm" onClick={finishTask}>Mark whole task done</button>}
      </div>
    </Sheet>
  );
}
