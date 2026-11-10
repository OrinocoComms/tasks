import { useEffect, useRef, useState } from "react";
import { todayList } from "./Today.jsx";

const ROUND = 15 * 60;

function fmt(s) {
  const a = Math.max(0, Math.round(s));
  return `${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}

function Ring({ fraction, children }) {
  const r = 100;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg width="220" height="220" viewBox="0 0 220 220">
        <circle cx="110" cy="110" r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
        <circle cx="110" cy="110" r={r} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * Math.min(1, fraction)} style={{ transition: "stroke-dashoffset 1s linear" }} />
      </svg>
      <div className="t">{children}</div>
    </div>
  );
}

export default function Session({ db, actions, celebrate, firstId, onClose }) {
  const [roundStart, setRoundStart] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [phase, setPhase] = useState("work"); // work | timeup | alldone
  const [skipped, setSkipped] = useState([]);
  const [first, setFirst] = useState(firstId);
  const [doneCount, setDoneCount] = useState(0);
  const sessionStart = useRef(Date.now());
  const saved = useRef(false);

  useEffect(() => {
    if (phase !== "work") return;
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, [phase]);

  const left = ROUND - (now - roundStart) / 1000;

  // The chosen task first, then the rest of today's list in order; skipped ones go to the back
  const list = todayList(db);
  const ordered = [
    ...list.filter((i) => i.key === first),
    ...list.filter((i) => i.key !== first && !skipped.includes(i.key)),
    ...list.filter((i) => i.key !== first && skipped.includes(i.key)),
  ];
  const current = ordered[0];

  useEffect(() => {
    if (phase === "work" && left <= 0) { setPhase("timeup"); navigator.vibrate?.([40, 60, 40]); }
    if (phase === "work" && !current) setPhase("alldone");
  }, [left, phase, current]);

  const done = () => {
    const result = current.step ? actions.completeStep(current.step) : actions.completeTask(current.task);
    navigator.vibrate?.(30);
    setDoneCount((n) => n + 1);
    setFirst(null);
    celebrate(result, current.task);
  };

  const skip = () => {
    setSkipped([...skipped.filter((id) => id !== current.key), current.key]);
    setFirst(null);
  };

  const again = () => { setRoundStart(Date.now()); setNow(Date.now()); setPhase("work"); };

  const finish = (moveRest) => {
    if (moveRest) actions.postpone(list);
    if (!saved.current) {
      saved.current = true;
      actions.saveSession({ started_at: new Date(sessionStart.current).toISOString(), actual_seconds: Math.round((Date.now() - sessionStart.current) / 1000), steps_done: doneCount });
    }
    onClose();
  };

  return (
    <div className="session">
      <button className="btn quiet close" onClick={() => finish(false)}>End</button>

      {phase === "work" && current && (
        <>
          <Ring fraction={1 - left / ROUND}>{fmt(left)}</Ring>
          <div className="step">{current.step ? current.step.title : current.task.title}</div>
          <div className="from">{current.step ? current.task.title : " "}</div>
          <div className="actions">
            <button className="btn accent wide big" onClick={done}>Done</button>
            {ordered.length > 1 && <button className="btn quiet" onClick={skip}>Skip for now</button>}
          </div>
          <p className="small" style={{ marginTop: 24 }}>{ordered.length - 1 ? `${ordered.length - 1} more on today's list` : "Last one for today"}</p>
        </>
      )}

      {phase === "timeup" && (
        <>
          <div className="kicker">Time's up</div>
          <div className="step" style={{ marginTop: 16 }}>{doneCount ? `${doneCount} done. Nice work.` : "Fifteen minutes in. Well done."}</div>
          <div className="from">{list.length} left on today's list.</div>
          <div className="actions">
            <button className="btn accent wide big" onClick={again}>Another 15 minutes</button>
            <button className="btn ghost wide" onClick={() => finish(true)}>Move {list.length === 1 ? "it" : "them"} to tomorrow</button>
            <button className="btn quiet" onClick={() => finish(false)}>Leave on today's list</button>
          </div>
        </>
      )}

      {phase === "alldone" && (
        <>
          <div className="tick-big">✓</div>
          <div className="step">Today's list is clear.</div>
          <div className="from">{doneCount} done{left > 0 ? `, with ${fmt(left)} to spare` : ""}.</div>
          <div className="actions">
            <button className="btn accent wide big" onClick={() => finish(false)}>Finish</button>
          </div>
        </>
      )}
    </div>
  );
}
