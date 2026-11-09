import { useEffect, useRef, useState } from "react";
import { buildQueue } from "../lib/plan.js";

const TARGET = 15 * 60;
const STARTER = 60;

function fmt(s) {
  const a = Math.abs(Math.round(s));
  return `${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}

function Ring({ fraction, children }) {
  const r = 100;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg width="220" height="220" viewBox="0 0 220 220">
        <circle cx="110" cy="110" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle cx="110" cy="110" r={r} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, fraction))} style={{ transition: "stroke-dashoffset 1s linear" }} />
      </svg>
      <div className="t"><div>{children}</div></div>
    </div>
  );
}

// phases: start → minute → started → work → timeup
export default function Session({ db, plan, actions, celebrate, onClose, openDesigner }) {
  const [phase, setPhase] = useState("start");
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [skipped, setSkipped] = useState([]);
  const [doneCount, setDoneCount] = useState(0);
  const saved = useRef(false);

  useEffect(() => {
    if (!startedAt) return;
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, [startedAt]);

  const elapsed = startedAt ? (now - startedAt) / 1000 : 0;

  useEffect(() => {
    if (phase === "minute" && elapsed >= STARTER) { setPhase("started"); navigator.vibrate?.(40); }
    if (phase === "work" && elapsed >= TARGET) { setPhase("timeup"); navigator.vibrate?.([40, 60, 40]); }
  }, [elapsed, phase]);

  const queue = buildQueue(db.tasks, db.steps, plan).filter((q) => !skipped.includes(q.step.id));
  const current = queue[0];
  const zone = current && db.zones.find((z) => z.id === current.task.zone_id);
  const nextDesign = db.tasks.find((t) => t.status === "designing");

  const begin = () => { setStartedAt(Date.now()); setNow(Date.now()); setPhase("minute"); };

  const complete = () => {
    if (!current) return;
    const result = actions.completeStep(current.step);
    setDoneCount((n) => n + 1);
    navigator.vibrate?.(30);
    celebrate(result, current.task);
  };

  const finish = (andThen) => {
    if (!saved.current && (elapsed >= STARTER || doneCount > 0)) {
      saved.current = true;
      actions.saveSession({ started_at: new Date(startedAt).toISOString(), actual_seconds: Math.round(elapsed), steps_done: doneCount });
    }
    onClose();
    andThen?.();
  };

  const stepCard = current ? (
    <>
      <div className="step">{current.step.title}</div>
      <div className="from">{zone?.emoji} {current.task.title}</div>
    </>
  ) : (
    <>
      <div className="step">Everything that's ready is done.</div>
      <div className="from">{nextDesign ? `Use the time to give "${nextDesign.title}" a first step?` : "Nothing else on the list. Enjoy that."}</div>
    </>
  );

  return (
    <div className="session">
      <button className="btn quiet close" onClick={() => finish()}>{phase === "start" ? "Close" : "End"}</button>

      {phase === "start" && (
        <>
          <div className="kicker">Just one minute</div>
          <Ring fraction={0}>1:00</Ring>
          {stepCard}
          <div className="actions">
            <button className="btn accent wide" onClick={begin} disabled={!current}>Start one minute</button>
            <p className="small">That's all you're signing up for.</p>
          </div>
        </>
      )}

      {phase === "minute" && (
        <>
          <div className="kicker">Just start</div>
          <Ring fraction={elapsed / STARTER}>{fmt(STARTER - elapsed)}</Ring>
          {stepCard}
          <div className="actions">
            {current && <button className="btn accent wide" onClick={complete}>Done ✓</button>}
          </div>
        </>
      )}

      {phase === "started" && (
        <>
          <div className="kicker">One minute done</div>
          <div className="step" style={{ marginTop: 20 }}>You started. That was the hard part.</div>
          <div className="from">It already counts as a win.</div>
          <div className="actions">
            <button className="btn accent wide" onClick={() => setPhase("work")}>Keep going ({fmt(TARGET - elapsed)} left)</button>
            <button className="btn ghost wide" onClick={() => finish()}>Stop here</button>
          </div>
        </>
      )}

      {phase === "work" && (
        <>
          <div className="kicker">{doneCount ? `${doneCount} done this session` : "Your 15 minutes"}</div>
          <Ring fraction={elapsed / TARGET}>{fmt(TARGET - elapsed)}</Ring>
          {stepCard}
          <div className="actions">
            {current ? (
              <>
                <button className="btn accent wide" onClick={complete}>Done ✓</button>
                <button className="btn quiet" onClick={() => setSkipped([...skipped, current.step.id])}>Skip for now</button>
              </>
            ) : nextDesign ? (
              <button className="btn wide" onClick={() => finish(() => openDesigner(nextDesign.id))}>Design it</button>
            ) : (
              <button className="btn wide" onClick={() => finish()}>Finish</button>
            )}
          </div>
        </>
      )}

      {phase === "timeup" && (
        <>
          <div className="kicker">Time's up</div>
          <div className="step" style={{ marginTop: 20 }}>
            {doneCount ? `${doneCount} step${doneCount === 1 ? "" : "s"} done.` : "Fifteen minutes in."} Well done.
          </div>
          <div className="from">You can stop now with a clear conscience.</div>
          <div className="actions">
            <button className="btn accent wide" onClick={() => finish()}>Finish</button>
            {current && <button className="btn ghost wide" onClick={() => setPhase("bonus")}>I'm on a roll, keep going</button>}
          </div>
        </>
      )}

      {phase === "bonus" && (
        <>
          <div className="kicker">Bonus time</div>
          <Ring fraction={1}>+{fmt(elapsed - TARGET)}</Ring>
          {stepCard}
          <div className="actions">
            {current && <button className="btn accent wide" onClick={complete}>Done ✓</button>}
            <button className="btn ghost wide" onClick={() => finish()}>Finish</button>
          </div>
        </>
      )}
    </div>
  );
}
