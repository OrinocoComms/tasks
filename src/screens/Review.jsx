import { useState } from "react";
import { DatePopup } from "../Calendar.jsx";
import {
  DAYS, addDays, fmtMins, nextMonday, notDone, plannedMins, plannedOn, reviewDue, todayStr, weekSummary, parseDate,
} from "../lib/logic.js";
import { isDemo, resetDemo } from "../lib/store.js";
import { supabase } from "../lib/supabase.js";
import { AreaIcon, Icon, Nav } from "../ui.jsx";
import { go } from "../App.jsx";

const STEPS = ["Wins", "Not done", "Time", "Next week"];
const dayName = (n) => DAYS.find((d) => d[2] === n)[0];
const shortDay = (s) => parseDate(s).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });

export default function Review({ db, actions, query }) {
  const step = query.step ? Number(query.step) : null;
  const [settingsOpen, setSettingsOpen] = useState(false);
  if (step) return <Flow db={db} actions={actions} step={step} />;

  const s = db.settings || {};
  const due = reviewDue(s);
  const doneThisWeek = s.last_review && s.last_review >= addDays(todayStr(), -6) && !due;
  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top) + 36px) 20px 20px 22px" }}>
        <h1 className="h1">Weekly review</h1>
        <button className="roundbtn" aria-label="Settings" onClick={() => setSettingsOpen(true)}><Icon name="gear" /></button>
      </div>
      <div className="scroll" style={{ padding: "0 20px 112px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="details" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <span className="kicker" style={{ color: due ? "var(--must)" : undefined }}>
            {due ? "Due" : doneThisWeek ? "Done this week" : `Next: ${dayName(s.review_day ?? 0)}`}
          </span>
          <span style={{ fontSize: 15, color: "var(--soft)" }}>{STEPS.join(" · ")}</span>
          <button className="btn" onClick={() => go("/review?step=1")}>{doneThisWeek ? "Review again" : "Start"}</button>
        </div>
      </div>
      <Nav tab="review" />
      {settingsOpen && <Settings db={db} actions={actions} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function Flow({ db, actions, step }) {
  const to = (n) => go(n ? `/review?step=${n}` : "/review");
  const finish = () => { actions.setSettings({ last_review: todayStr() }); sessionStorage.removeItem("review-skip"); to(null); };
  const last = step === STEPS.length;
  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(env(safe-area-inset-top) + 20px) 20px 8px" }}>
        <button className="iconbtn" aria-label="Back" onClick={() => to(step > 1 ? step - 1 : null)}><Icon name="back" size={22} /></button>
        <div style={{ flex: 1, display: "flex", gap: 6 }} aria-hidden="true">
          {STEPS.map((_, i) => <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < step ? "var(--ink)" : "var(--line2)" }} />)}
        </div>
        <span className="small num">{step}/{STEPS.length}</span>
      </div>
      <div style={{ padding: "12px 22px 14px" }}><h1 className="h1">{STEPS[step - 1]}</h1></div>
      <div className="scroll" style={{ padding: "0 20px 120px", display: "flex", flexDirection: "column", gap: 12 }}>
        {step === 1 && <Wins db={db} />}
        {step === 2 && <NotDone db={db} actions={actions} />}
        {step === 3 && <Time db={db} />}
        {step === 4 && <NextWeek db={db} actions={actions} />}
      </div>
      <div className="bottombar">
        <button className="btn" onClick={() => (last ? finish() : to(step + 1))}>{last ? "Finish" : "Next"}</button>
      </div>
    </div>
  );
}

const Stat = ({ value, label }) => (
  <div className="details" style={{ flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
    <span className="num" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>{value}</span>
    <span className="small">{label}</span>
  </div>
);

function Wins({ db }) {
  const { done, achieved, timedMins } = weekSummary(db);
  if (!done.length) return <div className="empty">Nothing ticked off. Fresh start.</div>;
  const shown = done.slice(0, 8);
  return (
    <>
      <div style={{ display: "flex", gap: 10 }}>
        <Stat value={done.length} label="done" />
        <Stat value={fmtMins(timedMins)} label="timed" />
        {achieved.length > 0 && <Stat value={achieved.length} label={achieved.length === 1 ? "outcome" : "outcomes"} />}
      </div>
      {achieved.map((o) => (
        <div key={o.id} className="details" style={{ padding: "14px 16px", background: "var(--rust-soft)", fontWeight: 600 }}>★ {o.title}</div>
      ))}
      <div className="details">
        {shown.map((i, n) => (
          <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderTop: n ? "1px solid var(--line2)" : 0 }}>
            <Icon name="check" size={18} width={2} /><span style={{ fontSize: 15 }}>{i.title}</span>
          </div>
        ))}
        {done.length > shown.length && <div className="small" style={{ padding: "0 0 12px 28px" }}>+{done.length - shown.length} more</div>}
      </div>
    </>
  );
}

function NotDone({ db, actions }) {
  const [skipped, setSkipped] = useState(() => JSON.parse(sessionStorage.getItem("review-skip") || "[]"));
  const [picking, setPicking] = useState(false);
  const skip = (id) => { const n = [...skipped, id]; setSkipped(n); sessionStorage.setItem("review-skip", JSON.stringify(n)); };
  const list = notDone(db.items).filter((i) => !skipped.includes(i.id));
  const item = list[0];
  if (!item) return <div className="empty">All sorted.</div>;
  const area = db.areas.find((a) => a.id === item.area_id);
  const parent = item.parent_id && db.items.find((i) => i.id === item.parent_id);
  return (
    <>
      <span className="small">{list.length} to sort</span>
      <div className="details" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {area && <AreaIcon icon={area.icon} size={28} />}
          {item.moved_count > 0 && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--must)", background: "var(--rust-soft)", borderRadius: 999, padding: "4px 10px" }}>Moved {item.moved_count}×</span>}
        </div>
        <span style={{ fontSize: 21, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{item.title}</span>
        <span className="small">{[parent?.title, item.est_mins && fmtMins(item.est_mins)].filter(Boolean).join(" · ")}</span>
      </div>
      <button className="btn white" onClick={() => actions.moveItem(item, nextMonday())}>Next Monday</button>
      <button className="btn white" onClick={() => setPicking(true)}>Pick a date</button>
      <button className="btn white" onClick={() => go(`/task/${item.id}`)}>Break it down</button>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn quiet" onClick={() => actions.deleteItem(item.id)}>Drop</button>
        <button className="btn quiet" onClick={() => skip(item.id)}>Keep as is</button>
      </div>
      {picking && <DatePopup title="Move to" min={addDays(todayStr(), 1)} onSave={({ start }) => { setPicking(false); actions.moveItem(item, start); }} onClose={() => setPicking(false)} />}
    </>
  );
}

function Time({ db }) {
  const { timed } = weekSummary(db);
  if (!timed.length) return <div className="empty">No timed tasks. Use ▶ to time one.</div>;
  const est = timed.reduce((n, t) => n + t.est, 0), actual = timed.reduce((n, t) => n + t.actual, 0);
  const pct = Math.round(((actual - est) / est) * 100);
  const verdict = Math.abs(pct) <= 10 ? "Spot on" : pct > 0 ? `${pct}% over` : `${-pct}% under`;
  // Per area
  const areas = {};
  for (const t of timed) { const k = t.item.area_id || "none"; areas[k] = areas[k] || { est: 0, actual: 0 }; areas[k].est += t.est; areas[k].actual += t.actual; }
  const areaRows = Object.entries(areas).map(([id, v]) => ({ area: db.areas.find((a) => a.id === id), ratio: v.actual / v.est }))
    .filter((r) => r.area).sort((a, b) => b.ratio - a.ratio);
  return (
    <>
      <div className="details" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="num" style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", color: Math.abs(pct) > 10 ? "var(--must)" : undefined }}>{verdict}</span>
        <span className="small">Guessed {fmtMins(est)} · took {fmtMins(actual)}</span>
      </div>
      {areaRows.length > 1 && (
        <div className="details">
          {areaRows.map((r, n) => (
            <div key={r.area.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: n ? "1px solid var(--line2)" : 0 }}>
              <AreaIcon icon={r.area.icon} size={24} /><span style={{ flex: 1 }}>{r.area.name}</span>
              <span className="num" style={{ fontWeight: 600 }}>×{r.ratio.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="details">
        {timed.map((t, n) => (
          <div key={t.item.id} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "12px 0", borderTop: n ? "1px solid var(--line2)" : 0 }}>
            <span style={{ flex: 1, fontSize: 15 }}>{t.item.title}</span>
            <span className="num small" style={{ whiteSpace: "nowrap", color: t.actual > t.est * 1.1 ? "var(--must)" : undefined }}>{fmtMins(t.est)} → {fmtMins(t.actual)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function NextWeek({ db, actions }) {
  const limit = db.settings?.daily_limit_mins || 60;
  const days = Array.from({ length: 7 }, (_, i) => addDays(todayStr(), i + 1));
  return (
    <>
      <span className="small">Tap a dot to switch must do today / moveable.</span>
      {days.map((d) => {
        const list = plannedOn(db.items, d), mins = plannedMins(list), over = mins > limit;
        return (
          <div key={d} className="details" style={{ padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 58, fontWeight: 600 }}>{shortDay(d)}</span>
              <span style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--line2)", overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${Math.min(100, (mins / limit) * 100)}%`, background: over ? "var(--must)" : "var(--ink)" }} />
              </span>
              <span className="num small" style={{ width: 52, textAlign: "right", color: over ? "var(--must)" : undefined }}>{mins ? fmtMins(mins) : "–"}</span>
            </div>
            {list.map((i) => (
              <button key={i.id} onClick={() => actions.updateItem(i.id, { priority: i.priority === "must" ? "could" : "must" })}
                aria-label={`${i.title}: ${i.priority === "must" ? "must do today" : "moveable"}`}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", border: 0, background: "none", padding: "9px 0 0", textAlign: "left", fontSize: 15, color: "var(--ink)" }}>
                <span className={`dot ${i.priority === "must" ? "must" : ""}`} style={{ marginTop: 0, flex: "none" }} />
                <span style={{ flex: 1 }}>{i.title}</span>
              </button>
            ))}
          </div>
        );
      })}
    </>
  );
}

function Settings({ db, actions, onClose }) {
  const limit = db.settings?.daily_limit_mins || 60;
  const day = db.settings?.review_day ?? 0;
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <span className="kicker">Daily limit</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[30, 45, 60, 90, 120].map((m) => (
            <button key={m} className={`chip ${limit === m ? "on" : "outline"}`} aria-pressed={limit === m} onClick={() => actions.setLimit(m)}>{fmtMins(m)}</button>
          ))}
        </div>
        <span className="kicker" style={{ marginTop: 8 }}>Review day</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {DAYS.map(([name, , n]) => (
            <button key={n} className={`chip ${day === n ? "on" : "outline"}`} aria-pressed={day === n} onClick={() => actions.setSettings({ review_day: n })}>{name.slice(0, 3)}</button>
          ))}
        </div>
        <div style={{ height: 8 }} />
        {isDemo
          ? <button className="btn white" onClick={resetDemo}>Reset the sample data</button>
          : <button className="btn white" onClick={() => supabase.auth.signOut()}>Sign out</button>}
        <button className="btn quiet" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
