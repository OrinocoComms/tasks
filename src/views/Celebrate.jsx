import { useEffect, useMemo, useRef } from "react";

const LINES = ["Done. Nice.", "One less thing.", "That's a win.", "Look at you go.", "Ticked off.", "Lighter already.", "Momentum!"];
const COLOURS = ["var(--accent)", "var(--warn)", "var(--danger)", "#7aa7d9", "#d9b44a"];

export function Burst({ onDone }) {
  const line = useMemo(() => LINES[Math.floor(Math.random() * LINES.length)], []);
  const bits = useMemo(() => Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2 + Math.random() * 0.3;
    const d = 90 + Math.random() * 90;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, c: COLOURS[i % COLOURS.length] };
  }), []);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => { const t = setTimeout(() => done.current(), 1700); return () => clearTimeout(t); }, []);
  return (
    <div className="burst">
      {bits.map((b, i) => <i key={i} style={{ background: b.c, "--x": `${b.x}px`, "--y": `${b.y}px` }} />)}
      <div className="msg">{line}</div>
    </div>
  );
}

export function BigWin({ task, steps, onClose }) {
  const days = Math.max(1, Math.round((Date.now() - new Date(task.created_at).getTime()) / 86400000));
  return (
    <div className="bigwin" onClick={onClose}>
      <div className="tick">✓</div>
      <div className="kicker" style={{ color: "#fff", opacity: 0.8 }}>Task finished</div>
      <h1>{task.title}</h1>
      <p>
        {steps.length > 1 ? `${steps.length} small steps` : "Done"}
        {days > 1 ? `, and it's been on your mind for ${days} days. Not any more.` : "."}
      </p>
      <button className="btn" onClick={onClose}>Lovely</button>
    </div>
  );
}
