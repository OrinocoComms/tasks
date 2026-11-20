import { DatePopup } from "../Calendar.jsx";
import { useState } from "react";
import { DAYS, ORDS, addDays, childrenOf, dateRange, fmtMins, nextOccurrence, ordinal, remainingMins, repeatLabel, todayStr } from "../lib/logic.js";
import { Back, Dot, Icon, Tick } from "../ui.jsx";
import { go } from "../App.jsx";
import { AreaPill } from "./Outcome.jsx";
import { grow, useCompleter } from "./common.jsx";

const PRESETS = [5, 15, 30, 60];

export default function Task({ db, actions, id, query }) {
  const isNew = id === "new";
  const existing = !isNew && db.items.find((i) => i.id === id);
  const parentFromQuery = query.parent && db.items.find((i) => i.id === query.parent);
  const [draft, setDraft] = useState(() => ({
    title: "", priority: "could", est_mins: null, start_date: null, due_date: null, repeat: null, description: "",
    outcome_id: query.outcome || parentFromQuery?.outcome_id || null,
    area_id: query.area || parentFromQuery?.area_id || null,
    parent_id: query.parent || null,
  }));
  const [timeOpen, setTimeOpen] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(!!existing?.description);
  const [confirmDel, setConfirmDel] = useState(false);
  const [reorder, setReorder] = useState(false);
  const { toggle, glow, dialogs } = useCompleter(db, actions);

  if (!isNew && !existing) return <div className="page"><div className="topbar"><Back href="#/" /></div><div className="empty">Task not found.</div></div>;
  const item = isNew ? draft : existing;
  const set = (c) => (isNew ? setDraft((d) => ({ ...d, ...c })) : actions.updateItem(item.id, c));

  const parent = item.parent_id && db.items.find((i) => i.id === item.parent_id);
  const outcome = db.outcomes.find((o) => o.id === item.outcome_id);
  const kids = isNew ? [] : childrenOf(db.items, item.id);
  const openKids = kids.filter((k) => !k.done);
  const subMins = kids.reduce((n, k) => n + remainingMins(db.items, k), 0);
  const repeats = item.repeat && item.repeat.freq && item.repeat.freq !== "never";
  const showRepeat = repeats || repeatOpen;

  // Subtasks are done in list order; renumber them all when one moves
  const moveKid = (idx, dir) => {
    const order = [...kids];
    const [k] = order.splice(idx, 1);
    order.splice(idx + dir, 0, k);
    order.forEach((x, i) => { if (x.position !== i) actions.updateItem(x.id, { position: i }); });
  };

  const save = () => {
    if (!draft.title.trim()) return;
    const row = actions.addItem({ ...draft, title: draft.title.trim() });
    go(`/task/${row.id}`);
  };

  return (
    <div className="page">
      <div className="topbar">
        <Back />
        <AreaPill db={db} value={item.area_id} onChange={(v) => set({ area_id: v })} />
        {parent ? (
          <a className="pillbtn" href={`#/task/${parent.id}`} style={{ marginLeft: "auto" }}>
            <span className="lbl">Part of</span><span className="val">{parent.title}</span>
          </a>
        ) : (
          <label className="pillbtn" style={{ marginLeft: "auto" }}>
            <span className="lbl">Outcome</span><span className="val">{outcome ? outcome.title : "None"}</span>
            <select value={item.outcome_id || ""} aria-label="Outcome" onChange={(e) => {
              const o = db.outcomes.find((x) => x.id === e.target.value);
              set({ outcome_id: e.target.value || null, ...(o?.area_id && !item.area_id ? { area_id: o.area_id } : {}) });
            }}>
              <option value="">None</option>
              {db.outcomes.filter((o) => !o.achieved_at || o.id === item.outcome_id).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="scroll" style={{ padding: "10px 20px 130px", gap: 16 }}>
        {/* Name, priority, repeat */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span className="kicker" style={{ fontSize: 11 }}>{isNew ? (item.parent_id ? "New subtask" : "New task") : item.parent_id ? "Subtask" : "Task"}</span>
          {isNew
            ? <textarea className="input title" rows={1} autoFocus placeholder="What needs doing?" value={draft.title} ref={grow}
                onChange={(e) => { setDraft({ ...draft, title: e.target.value.replace(/\n/g, "") }); grow(e.target); }} />
            : <textarea className="input title" rows={1} defaultValue={item.title} ref={grow} aria-label="Task name"
                onInput={(e) => grow(e.target)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.target.blur())}
                onBlur={(e) => e.target.value.trim() && e.target.value !== item.title && set({ title: e.target.value.trim() })} />}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div className="seg" role="group" aria-label="Priority">
              <button className={item.priority === "must" ? "on" : ""} aria-pressed={item.priority === "must"} onClick={() => set({ priority: "must" })}>
                <span className="dot must" style={{ marginTop: 0, width: 9, height: 9 }} />Must do
              </button>
              <button className={item.priority === "could" ? "on" : ""} aria-pressed={item.priority === "could"} onClick={() => set({ priority: "could" })}>
                <span className="dot" style={{ marginTop: 0, width: 9, height: 9 }} />Could do
              </button>
            </div>
            <button aria-label={repeats ? "Repeat settings" : "Make this task repeat"} aria-pressed={!!repeats}
              onClick={() => {
                if (!repeats && !repeatOpen) {
                  setRepeatOpen(true);
                  set({ repeat: { freq: "weekly", days: [new Date().getDay()] }, ...(item.start_date ? {} : { start_date: todayStr() }) });
                } else setRepeatOpen(!repeatOpen);
              }}
              style={{ width: 42, height: 42, flexShrink: 0, border: 0, borderRadius: "50%", background: repeats ? "var(--ink)" : "var(--card)", display: "grid", placeItems: "center" }}>
              <Icon name="repeat" size={18} color={repeats ? "#f2efea" : "#1e1c1b"} />
            </button>
          </div>
        </div>

        {/* Details */}
        <div className="details">
          <button className="drow first" onClick={() => setDateOpen(true)}>
            <span className="k">Due</span>
            <span className="v num">{item.start_date || item.due_date ? dateRange(item.start_date, item.due_date) : "No date"}</span>
            <Icon name="cal" size={17} width={1.6} />
          </button>

          <div style={{ borderTop: "1px solid var(--line)" }}>
            <button className="drow first" onClick={() => setTimeOpen(!timeOpen)} aria-expanded={timeOpen || !item.est_mins}>
              <span className="k">Task time</span>
              <span className="v num">{item.est_mins ? fmtMins(item.est_mins) : "Choose a time"}</span>
              <span className="chev" style={{ transform: timeOpen || !item.est_mins ? "rotate(180deg)" : "none", display: "grid", color: "var(--faint)" }}><Icon name="chev" size={16} /></span>
            </button>
            {(timeOpen || !item.est_mins) && <TimePicker value={item.est_mins} onPick={(m) => { set({ est_mins: m }); setTimeOpen(false); }} />}
          </div>

          {showRepeat && (
            <div style={{ borderTop: "1px solid var(--line)" }}>
              <button className="drow first" onClick={() => setRepeatOpen(!repeatOpen)} aria-expanded={repeatOpen}>
                <span className="k">Repeats</span>
                <span className="v" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>{repeats && <Icon name="repeat" size={15} />}{repeatLabel(item.repeat)}</span>
                <span className="chev" style={{ transform: repeatOpen ? "rotate(180deg)" : "none", display: "grid", color: "var(--faint)" }}><Icon name="chev" size={16} /></span>
              </button>
              {repeatOpen && <RepeatPicker value={item.repeat} onChange={(r) => {
                const on = r && r.freq !== "never";
                // A repeating task needs a first date, or it never reaches Today
                const first = on && !item.start_date ? nextOccurrence(r, addDays(todayStr(), -1)) : null;
                set({ repeat: on ? r : null, ...(first ? { start_date: first } : {}) });
                if (!on) setRepeatOpen(false);
              }} />}
            </div>
          )}

          {kids.length > 0 && (
            <div className="drow">
              <span className="k">Subtask</span>
              <span className="v num">{fmtMins(subMins)}</span>
            </div>
          )}
        </div>

        {/* Description */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="small">Description</span>
          {descOpen
            ? <textarea className="input" rows={3} aria-label="Description" placeholder="Anything worth remembering…"
                {...(isNew ? { value: draft.description, onChange: (e) => setDraft({ ...draft, description: e.target.value }) } : { defaultValue: item.description || "", onBlur: (e) => set({ description: e.target.value }) })} />
            : <button onClick={() => setDescOpen(true)} style={{ minHeight: 48, border: "1px dashed #b9b2a8", borderRadius: 14, background: "transparent", textAlign: "left", padding: "0 14px", fontSize: 15, color: "var(--soft)" }}>+ Add a description</button>}
        </div>

        {/* Subtasks (tasks only, not subtasks of subtasks) */}
        {!isNew && !item.parent_id && (
          <section className="panel">
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px 10px" }}>
              <span className="h2" style={{ flex: 1, fontSize: 19 }}>Subtasks</span>
              {kids.length > 0 && !reorder && <span className="small num">{kids.length - openKids.length} of {kids.length} done</span>}
              {kids.length > 1 && <button className={`chip ${reorder ? "on" : ""}`} aria-pressed={reorder} onClick={() => setReorder(!reorder)}>{reorder ? "Done" : "Reorder"}</button>}
            </div>
            <div style={{ padding: "0 4px" }}>
              {kids.map((k, idx) => (
                <div key={k.id} className={`row ${k.done ? "done" : ""} ${glow === k.id ? "glow" : ""}`} style={{ alignItems: reorder ? "center" : "flex-start", paddingRight: 0 }}>
                  <Tick item={k} onClick={() => toggle(k)} />
                  <a className="rowbody" href={`#/task/${k.id}`} style={{ paddingTop: 10 }}>
                    <span className="rowtitle"><span className="t" style={{ fontSize: 15 }}>{k.title}</span><Dot item={k} small /></span>
                    <span className="meta num" style={{ fontSize: 12 }}>
                      {(k.start_date || k.due_date) && <><Icon name="cal" size={12} width={1.7} /><span>{dateRange(k.start_date, k.due_date)}</span></>}
                      {k.est_mins ? <span className="right">{fmtMins(k.est_mins)}</span> : null}
                    </span>
                  </a>
                  {reorder && (
                    <span style={{ display: "flex", flexShrink: 0 }}>
                      <button className="iconbtn" aria-label={`Move "${k.title}" up`} disabled={idx === 0} style={{ opacity: idx === 0 ? 0.25 : 1, transform: "rotate(180deg)" }} onClick={() => moveKid(idx, -1)}><Icon name="chev" size={18} /></button>
                      <button className="iconbtn" aria-label={`Move "${k.title}" down`} disabled={idx === kids.length - 1} style={{ opacity: idx === kids.length - 1 ? 0.25 : 1 }} onClick={() => moveKid(idx, 1)}><Icon name="chev" size={18} /></button>
                    </span>
                  )}
                  {!k.done && !reorder && (
                    <a href={`#/timer/${k.id}`} aria-label={`Start "${k.title}"`} style={{ width: 44, height: 48, flexShrink: 0, display: "grid", placeItems: "center" }}>
                      <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--paper)", display: "grid", placeItems: "center" }}><Icon name="play" size={12} /></span>
                    </a>
                  )}
                </div>
              ))}
              {!reorder && <AddSubtask onAdd={(f) => actions.addItem({ ...f, parent_id: item.id, area_id: item.area_id, priority: "could", position: kids.length ? Math.max(...kids.map((k) => k.position || 0)) + 1 : 0 })} />}
            </div>
          </section>
        )}

        {!isNew && (
          <button className="btn quiet" onClick={() => (confirmDel ? (actions.deleteItem(item.id), history.back()) : setConfirmDel(true))}>
            {confirmDel ? "Tap again to delete" : `Delete ${item.parent_id ? "subtask" : "task"}`}
          </button>
        )}
      </div>

      <div className="bottombar">
        {isNew ? (
          <button className={`btn ${draft.title.trim() ? "" : "off"}`} onClick={save}>Save {draft.parent_id ? "subtask" : "task"}</button>
        ) : item.done ? (
          <button className="btn white" onClick={() => toggle(item)}>Done · tap to reopen</button>
        ) : openKids.length ? (
          <button className="btn salmon off" aria-disabled="true"><Icon name="play" size={18} color="#8a847c" />Start</button>
        ) : (
          <a className="btn salmon" href={`#/timer/${item.id}`}><Icon name="play" size={18} />Start</a>
        )}
      </div>

      {dateOpen && <DatePopup title="Due date" allowRange start={item.start_date || item.due_date} due={item.due_date}
        onSave={({ start, due }) => { set({ start_date: start, due_date: due }); setDateOpen(false); }} onClose={() => setDateOpen(false)} />}
      {dialogs}
    </div>
  );
}

function TimePicker({ value, onPick }) {
  const isCustom = value && !PRESETS.includes(value);
  const [custom, setCustom] = useState(isCustom);
  const [mins, setMins] = useState(isCustom ? value : 45);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 0 14px" }}>
      <div role="group" aria-label="Task time" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {PRESETS.map((m) => (
          <button key={m} className={`chip ${!custom && value === m ? "on" : ""}`} aria-pressed={!custom && value === m} style={{ minWidth: 52 }} onClick={() => { setCustom(false); onPick(m); }}>{m} min</button>
        ))}
        <button className={`chip ${custom ? "on" : "outline"}`} aria-pressed={custom} onClick={() => setCustom(true)}>Custom…</button>
      </div>
      {custom && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--soft)" }}>
          <input className="input mins" type="number" min="1" value={mins} onChange={(e) => setMins(e.target.value)} aria-label="Custom task time in minutes" />
          minutes
          <button className="chip on" style={{ marginLeft: "auto", minHeight: 40, padding: "0 16px" }} onClick={() => { const n = parseInt(mins, 10); if (n > 0) onPick(n); }}>Done</button>
        </div>
      )}
    </div>
  );
}

function RepeatPicker({ value, onChange }) {
  const r = value || { freq: "never" };
  const set = (c) => onChange({ ...r, ...c });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 0 16px" }}>
      <div role="group" aria-label="How often" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {[["never", "Never"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]].map(([f, l]) => (
          <button key={f} className={`chip ${r.freq === f ? "on" : ""}`} aria-pressed={r.freq === f}
            onClick={() => (f === "never" ? onChange(null) : set({ freq: f, days: r.days || [new Date().getDay()], monthMode: r.monthMode || "date", monthDate: r.monthDate || 1, ord: r.ord || 0, monthDay: r.monthDay ?? 5 }))}>{l}</button>
        ))}
      </div>
      {r.freq === "weekly" && (
        <div role="group" aria-label="Days of the week" style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
          {DAYS.map(([name, short, n]) => {
            const on = (r.days || []).includes(n);
            return <button key={name} className={`daychip ${on ? "on" : ""}`} aria-label={name} aria-pressed={on}
              onClick={() => set({ days: on ? r.days.filter((x) => x !== n) : [...(r.days || []), n] })}>{short}</button>;
          })}
        </div>
      )}
      {r.freq === "monthly" && (
        <>
          <div className="seg" style={{ background: "var(--paper)", alignSelf: "flex-start" }}>
            <button className={r.monthMode !== "day" ? "on" : ""} onClick={() => set({ monthMode: "date" })}>On a date</button>
            <button className={r.monthMode === "day" ? "on" : ""} onClick={() => set({ monthMode: "day" })}>On a day</button>
          </div>
          {r.monthMode !== "day" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15 }}>
              <span style={{ color: "var(--soft)" }}>On the</span>
              <button className="daychip" aria-label="Earlier date" onClick={() => set({ monthDate: Math.max(1, (r.monthDate || 1) - 1) })}>−</button>
              <span className="num" style={{ minWidth: 44, textAlign: "center", fontWeight: 600 }}>{ordinal(r.monthDate || 1)}</span>
              <button className="daychip" aria-label="Later date" onClick={() => set({ monthDate: Math.min(31, (r.monthDate || 1) + 1) })}>+</button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ORDS.map((o, i) => <button key={o} className={`chip ${(r.ord || 0) === i ? "on" : ""}`} onClick={() => set({ ord: i })}>{o}</button>)}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
                {DAYS.map(([name, short, n]) => <button key={name} className={`daychip ${r.monthDay === n ? "on" : ""}`} aria-label={name} onClick={() => set({ monthDay: n })}>{short}</button>)}
              </div>
            </>
          )}
        </>
      )}
      <span className="small" style={{ fontSize: 12 }}>Ticking it off brings back the next one. Missed ones don't pile up.</span>
    </div>
  );
}

function AddSubtask({ onAdd }) {
  const [v, setV] = useState("");
  const [mins, setMins] = useState(null);
  const [custom, setCustom] = useState(false);
  const [date, setDate] = useState({ start: null, due: null });
  const [cal, setCal] = useState(false);
  const [editing, setEditing] = useState(false);
  if (!editing) return <button className="addrow" onClick={() => setEditing(true)}>+ Add a subtask</button>;
  const reset = () => { setV(""); setMins(null); setCustom(false); setDate({ start: null, due: null }); };
  const submit = (e) => {
    e.preventDefault();
    if (!v.trim()) return;
    onAdd({ title: v.trim(), est_mins: mins ? Number(mins) : null, start_date: date.start, due_date: date.due });
    reset();
  };
  return (
    <form onSubmit={submit} style={{ borderTop: "1px solid var(--line)", padding: "10px 10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
      <input className="input" autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="Subtask" style={{ background: "var(--paper)" }} />
      <div role="group" aria-label="Subtask time" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {PRESETS.map((m) => (
          <button type="button" key={m} className={`chip ${!custom && mins === m ? "on" : ""}`} aria-pressed={!custom && mins === m}
            onClick={() => { setCustom(false); setMins(mins === m ? null : m); }}>{m} min</button>
        ))}
        <button type="button" className={`chip ${custom ? "on" : "outline"}`} aria-pressed={custom} onClick={() => { setCustom(true); setMins(45); }}>Custom…</button>
      </div>
      {custom && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--soft)" }}>
          <input className="input mins" type="number" min="1" value={mins || ""} onChange={(e) => setMins(e.target.value)} aria-label="Custom subtask time in minutes" />
          minutes
        </label>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" onClick={() => setCal(true)} aria-label="Subtask due date"
          style={{ flex: 1, minHeight: 44, border: 0, borderRadius: 12, background: "var(--paper)", display: "flex", alignItems: "center", gap: 8, padding: "0 12px", fontSize: 14, color: date.start ? "var(--ink)" : "var(--muted)", textAlign: "left" }}>
          <Icon name="cal" size={16} width={1.6} />
          {date.start ? dateRange(date.start, date.due) : "Due date"}
        </button>
        <button className="chip on" style={{ minHeight: 44, padding: "0 18px" }} disabled={!v.trim()}>Add</button>
      </div>
      <button type="button" className="btn quiet" style={{ minHeight: 36 }} onClick={() => { reset(); setEditing(false); }}>Close</button>
      {cal && <DatePopup title="Subtask due date" allowRange start={date.start} due={date.due}
        onSave={(d) => { setDate(d); setCal(false); }} onClose={() => setCal(false)} />}
    </form>
  );
}
