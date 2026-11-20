import { isDemo, resetDemo } from "../lib/store.js";
import { supabase } from "../lib/supabase.js";
import { fmtMins } from "../lib/logic.js";
import { Nav } from "../ui.jsx";

// Tab 3 is still to be decided; for now it holds settings.
export default function More({ db, actions }) {
  const limit = db.settings?.daily_limit_mins || 60;
  return (
    <div className="page">
      <div style={{ padding: "calc(env(safe-area-inset-top) + 36px) 22px 20px" }}><h1 className="h1">Settings</h1></div>
      <div className="scroll" style={{ padding: "0 20px 112px" }}>
        <div className="details" style={{ padding: "16px" }}>
          <span className="small">Daily limit</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "6px 0 12px" }}>
            <span className="h1 num" style={{ fontSize: 28 }}>{fmtMins(limit)}</span>
            <span className="small">of tasks a day before you're asked to rebalance</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[30, 45, 60, 90, 120].map((m) => (
              <button key={m} className={`chip ${limit === m ? "on" : ""}`} aria-pressed={limit === m} onClick={() => actions.setLimit(m)}>{fmtMins(m)}</button>
            ))}
          </div>
        </div>
        {isDemo
          ? <button className="btn white" onClick={resetDemo}>Reset the sample data</button>
          : <button className="btn white" onClick={() => supabase.auth.signOut()}>Sign out</button>}
      </div>
      <Nav tab="more" />
    </div>
  );
}
