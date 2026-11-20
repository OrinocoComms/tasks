import { useState } from "react";
import { openChildren } from "../lib/logic.js";
import { Icon } from "../ui.jsx";

// Ticking things off, with the glow, the "subtasks too?" question and the outcome-achieved moment
export function useCompleter(db, actions) {
  const [glow, setGlow] = useState(null);
  const [ask, setAsk] = useState(null);
  const [achieved, setAchieved] = useState(null);

  const flash = (id) => { setGlow(id); setTimeout(() => setGlow((g) => (g === id ? null : g)), 900); };
  const finish = (item, withChildren) => {
    flash(item.id);
    const r = actions.completeItem(item, { withChildren });
    if (r === "outcome-achieved") setTimeout(() => setAchieved(db.outcomes.find((o) => o.id === item.outcome_id)), 700);
  };
  const toggle = (item) => {
    if (item.done) return actions.uncompleteItem(item);
    const open = openChildren(db.items, item.id);
    if (open.length) return setAsk({ item, open });
    finish(item, false);
  };

  const dialogs = (
    <>
      {ask && (
        <div className="scrim" onClick={() => setAsk(null)}>
          <div className="sheet" role="dialog" aria-label="Unfinished subtasks" onClick={(e) => e.stopPropagation()}>
            <span className="h2">{ask.open.length} subtask{ask.open.length === 1 ? " isn't" : "s aren't"} ticked off yet.</span>
            <span className="small" style={{ marginBottom: 6 }}>{ask.open.map((i) => i.title).join(" · ")}</span>
            <button className="btn" onClick={() => { finish(ask.item, true); setAsk(null); }}>Mark them done too</button>
            <button className="btn white" onClick={() => { finish(ask.item, false); setAsk(null); }}>Just complete this task</button>
            <button className="btn quiet" onClick={() => setAsk(null)}>Cancel</button>
          </div>
        </div>
      )}
      {achieved && (
        <div className="scrim center" onClick={() => setAchieved(null)}>
          <div className="dialog" role="alertdialog" aria-label="Outcome achieved" style={{ alignItems: "center", textAlign: "center", padding: "32px 22px 20px" }}>
            <div style={{ width: 96, height: 96, borderRadius: "50%", background: "var(--ink)", display: "grid", placeItems: "center", animation: "doneglow 1.2s ease-out", marginBottom: 12 }}>
              <Icon name="check" size={44} width={2.6} color="var(--paper)" />
            </div>
            <span className="kicker">Outcome achieved</span>
            <span className="h1" style={{ fontSize: 28 }}>{achieved.title}</span>
            <button className="btn" style={{ marginTop: 18 }} onClick={() => setAchieved(null)}>Lovely</button>
          </div>
        </div>
      )}
    </>
  );
  return { toggle, glow, dialogs };
}

// Grows a textarea to fit its text
export const grow = (el) => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } };
