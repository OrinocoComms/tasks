import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { DEFAULT_AREAS, addDays, nextOccurrence, todayStr, toDateStr } from "./logic.js";

// Demo mode: no Supabase configured, or ?demo in the address. Data stays in this browser.
export const isDemo = !supabase || new URLSearchParams(location.search).has("demo");

const LS = "focus-demo-v3";
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function demoSeed() {
  const t = todayStr();
  const d = (n) => addDays(t, n);
  const ago = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const areas = DEFAULT_AREAS.map(([name, icon], i) => ({ id: uid(), name, icon, position: i, created_at: ago(30) }));
  const A = Object.fromEntries(areas.map((a) => [a.name, a.id]));
  const outcomes = [];
  const items = [];
  const outcome = (o) => { const row = { id: uid(), description: "", achieved_at: null, created_at: ago(10), ...o }; outcomes.push(row); return row.id; };
  const item = (o) => {
    const row = { id: uid(), parent_id: null, outcome_id: null, area_id: null, description: "", priority: "could", start_date: null, due_date: null, est_mins: null, repeat: null, moved_count: 0, from_voice: false, position: items.length, done: false, done_at: null, created_at: ago(5), ...o };
    items.push(row);
    return row.id;
  };

  const fire = outcome({ title: "Make the house fire safe", area_id: A.House, due_date: d(14) });
  const garage = outcome({ title: "Garage usable again", area_id: A.House, due_date: d(30) });
  const car = outcome({ title: "Car insured for 2027", area_id: A.Car, due_date: d(10) });
  outcome({ title: "Loft insulation topped up", area_id: A.House, achieved_at: ago(21) });

  // Fire safety
  item({ title: "Test the existing smoke alarms", outcome_id: fire, area_id: A.House, est_mins: 10, start_date: d(-3), done: true, done_at: ago(3) });
  const alarms = item({ title: "Fit new smoke alarms", outcome_id: fire, area_id: A.House, priority: "must", est_mins: 30, start_date: d(5), due_date: d(6) });
  item({ title: "Research smoke alarms", parent_id: alarms, area_id: A.House, est_mins: 20, start_date: d(-1), done: true, done_at: ago(1) });
  item({ title: "Select a smoke alarm system", parent_id: alarms, area_id: A.House, priority: "must", est_mins: 15, start_date: d(1) });
  item({ title: "Order the smoke alarms", parent_id: alarms, area_id: A.House, priority: "must", est_mins: 10, start_date: d(2), due_date: d(3) });
  item({ title: "Fit a fire extinguisher in the kitchen", outcome_id: fire, area_id: A.House, est_mins: 20, start_date: d(1), due_date: d(4) });
  item({ title: "Install fire escape ladders in the kids' bedrooms", outcome_id: fire, area_id: A.House, priority: "must", est_mins: 60, start_date: d(5), due_date: d(12) });

  // Today (deliberately a bit over the hour, with two rolled-over tasks)
  item({ title: "Get two car insurance quotes online", outcome_id: car, area_id: A.Car, priority: "must", est_mins: 15, start_date: t });
  item({ title: "Reply to school about the trip form", area_id: A.Kids, priority: "must", est_mins: 5, start_date: t });
  item({ title: "Sort out the recycling", area_id: A.House, est_mins: 15, start_date: d(-1), moved_count: 1 });
  item({ title: "Clear one shelf in the garage", outcome_id: garage, area_id: A.House, est_mins: 15, start_date: t });
  item({ title: "Order printer ink", area_id: A.House, est_mins: 5, start_date: t });
  item({ title: "Book the boiler service", area_id: A.House, est_mins: 10, start_date: d(-2), moved_count: 2 });

  // Garage
  item({ title: "Take old paint tins to the tip", outcome_id: garage, area_id: A.House, est_mins: 30, start_date: d(-6), done: true, done_at: ago(6) });
  item({ title: "Put up shelving brackets", outcome_id: garage, area_id: A.House, est_mins: 45, start_date: d(-4), done: true, done_at: ago(4) });
  item({ title: "Sell the old bike", outcome_id: garage, area_id: A.House, est_mins: 20, start_date: d(8) });
  item({ title: "Sweep the floor", outcome_id: garage, area_id: A.House, est_mins: 15, start_date: d(9) });

  // Quick-win candidates (5 min, not on today)
  item({ title: "Descale the kettle", area_id: A.House, est_mins: 5 });
  item({ title: "Unsubscribe from three shop emails", area_id: A.General, est_mins: 5 });
  item({ title: "Check the car tyre pressures", outcome_id: car, area_id: A.Car, est_mins: 5, start_date: d(4), priority: "must" });

  // Repeating
  item({ title: "Put the bins out", area_id: A.House, est_mins: 5, start_date: d(3), repeat: { freq: "weekly", days: [parseDateDay(d(3))] } });

  // Unallocated
  item({ title: "Look into a window cleaner", from_voice: true });
  item({ title: "Return the library books" });
  item({ title: "Sort the summer photos", from_voice: true });

  // Timer history for the review (guessed vs actual)
  const byTitle = (t) => items.find((i) => i.title === t).id;
  const sessions = [
    ["Test the existing smoke alarms", 14, 3], ["Research smoke alarms", 35, 1],
    ["Take old paint tins to the tip", 50, 6], ["Put up shelving brackets", 70, 4],
  ].map(([title, mins, daysAgo]) => ({ id: uid(), item_id: byTitle(title), seconds: mins * 60, finished_at: ago(daysAgo) }));

  return { areas, outcomes, items, sessions, settings: { daily_limit_mins: 60, review_day: new Date().getDay(), last_review: null } };
}
function parseDateDay(s) { const [y, m, dd] = s.split("-").map(Number); return new Date(y, m - 1, dd).getDay(); }

function demoLoad() {
  try { const d = JSON.parse(localStorage.getItem(LS)); if (d) return d; } catch { /* ignore */ }
  const d = demoSeed();
  localStorage.setItem(LS, JSON.stringify(d));
  return d;
}
export function resetDemo() { localStorage.removeItem(LS); location.reload(); }

async function fetchAll() {
  const since = new Date(Date.now() - 35 * 86400000).toISOString();
  const [a, o, i, s, ts] = await Promise.all([
    supabase.from("areas").select("*").order("position"),
    supabase.from("outcomes").select("*").order("created_at"),
    supabase.from("items").select("*").order("position"),
    supabase.from("settings").select("*").maybeSingle(),
    supabase.from("timer_sessions").select("*").gte("finished_at", since),
  ]);
  const err = a.error || o.error || i.error || s.error || ts.error;
  if (err) throw err;
  return { areas: a.data, outcomes: o.data, items: i.data, sessions: ts.data, settings: s.data || { daily_limit_mins: 60, review_day: 0, last_review: null } };
}

export function useStore(user) {
  const [db, setDb] = useState(null);
  const [error, setError] = useState(null);
  const dbRef = useRef(null);
  dbRef.current = db;
  const seeded = useRef(false);

  const refresh = useCallback(async () => {
    if (isDemo) return setDb(demoLoad());
    try {
      const data = await fetchAll();
      if (data.areas.length === 0 && !seeded.current) {
        seeded.current = true;
        const areas = DEFAULT_AREAS.map(([name, icon], i) => ({ id: uid(), name, icon, position: i, created_at: now() }));
        await supabase.from("areas").insert(areas);
        data.areas = areas;
      }
      setDb(data);
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    }
  }, []);

  useEffect(() => {
    if (!user && !isDemo) return;
    refresh();
    if (isDemo) return;
    let timer;
    const later = () => { clearTimeout(timer); timer = setTimeout(refresh, 600); };
    const ch = supabase.channel("focus-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, later)
      .on("postgres_changes", { event: "*", schema: "public", table: "outcomes" }, later)
      .on("postgres_changes", { event: "*", schema: "public", table: "areas" }, later)
      .subscribe();
    const onVisible = () => { if (document.visibilityState === "visible") later(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { supabase.removeChannel(ch); document.removeEventListener("visibilitychange", onVisible); clearTimeout(timer); };
  }, [user, refresh]);

  useEffect(() => { if (isDemo && db) localStorage.setItem(LS, JSON.stringify(db)); }, [db]);

  const remote = async (q) => {
    if (isDemo || !q) return;
    const { error } = await q;
    if (error) { console.error(error); setError(error.message); }
  };
  const patchLocal = (table, id, changes) =>
    setDb((d) => ({ ...d, [table]: d[table].map((r) => (r.id === id ? { ...r, ...changes } : r)) }));

  const actions = {
    // Areas
    addArea: (name, icon) => {
      const row = { id: uid(), name, icon, position: dbRef.current.areas.length, created_at: now() };
      setDb((d) => ({ ...d, areas: [...d.areas, row] }));
      remote(supabase?.from("areas").insert(row));
      return row;
    },
    updateArea: (id, changes) => { patchLocal("areas", id, changes); remote(supabase?.from("areas").update(changes).eq("id", id)); },

    // Outcomes
    addOutcome: (fields) => {
      const row = { id: uid(), area_id: null, description: "", due_date: null, achieved_at: null, created_at: now(), ...fields };
      setDb((d) => ({ ...d, outcomes: [...d.outcomes, row] }));
      remote(supabase?.from("outcomes").insert(row));
      return row;
    },
    updateOutcome: (id, changes) => { patchLocal("outcomes", id, changes); remote(supabase?.from("outcomes").update(changes).eq("id", id)); },
    deleteOutcome: (id) => {
      setDb((d) => ({ ...d, outcomes: d.outcomes.filter((o) => o.id !== id), items: d.items.map((i) => (i.outcome_id === id ? { ...i, outcome_id: null } : i)) }));
      remote(supabase?.from("outcomes").delete().eq("id", id));
    },

    // Items (tasks and subtasks)
    addItem: (input) => {
      const fields = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
      const row = {
        id: uid(), parent_id: null, outcome_id: null, area_id: null, description: "", priority: "could",
        start_date: null, due_date: null, est_mins: null, repeat: null, moved_count: 0, from_voice: false,
        position: dbRef.current.items.length, done: false, done_at: null, created_at: now(), ...fields,
      };
      setDb((d) => ({ ...d, items: [...d.items, row] }));
      remote(supabase?.from("items").insert(row));
      return row;
    },
    updateItem: (id, changes) => { patchLocal("items", id, changes); remote(supabase?.from("items").update(changes).eq("id", id)); },
    deleteItem: (id) => {
      const doomed = new Set([id]);
      let grew = true;
      while (grew) { grew = false; for (const i of dbRef.current.items) if (i.parent_id && doomed.has(i.parent_id) && !doomed.has(i.id)) { doomed.add(i.id); grew = true; } }
      setDb((d) => ({ ...d, items: d.items.filter((i) => !doomed.has(i.id)) }));
      remote(supabase?.from("items").delete().eq("id", id));
    },

    // Tick off. Repeating tasks bring back their next one (with a fresh set of subtasks).
    // Returns "outcome-achieved" when this finished an outcome.
    completeItem: (item, { withChildren = false } = {}) => {
      const t = now();
      const db0 = dbRef.current;
      const ids = [item.id];
      if (withChildren) db0.items.filter((i) => i.parent_id === item.id && !i.done).forEach((i) => ids.push(i.id));
      setDb((d) => ({ ...d, items: d.items.map((i) => (ids.includes(i.id) ? { ...i, done: true, done_at: t } : i)) }));
      ids.forEach((id) => remote(supabase?.from("items").update({ done: true, done_at: t }).eq("id", id)));

      if (item.repeat && item.repeat.freq && item.repeat.freq !== "never") {
        const from = [todayStr(), item.start_date || item.due_date].filter(Boolean).sort().pop();
        const next = nextOccurrence(item.repeat, from);
        if (next) {
          const span = item.start_date && item.due_date ? Math.round((new Date(item.due_date) - new Date(item.start_date)) / 86400000) : 0;
          const copy = actions.addItem({
            ...item, id: undefined, done: false, done_at: null, moved_count: 0, created_at: now(),
            start_date: next, due_date: span ? addDays(next, span) : (item.due_date ? next : null),
          });
          db0.items.filter((i) => i.parent_id === item.id).forEach((c) =>
            actions.addItem({ ...c, id: undefined, parent_id: copy.id, done: false, done_at: null, moved_count: 0, start_date: null, due_date: null, created_at: now() }));
        }
      }

      if (item.outcome_id && !item.parent_id) {
        const siblings = db0.items.filter((i) => i.outcome_id === item.outcome_id && !i.parent_id);
        if (siblings.every((i) => i.done || i.id === item.id)) {
          actions.updateOutcome(item.outcome_id, { achieved_at: t });
          return "outcome-achieved";
        }
      }
      return "done";
    },
    uncompleteItem: (item) => {
      actions.updateItem(item.id, { done: false, done_at: null });
      if (item.outcome_id) {
        const o = dbRef.current.outcomes.find((x) => x.id === item.outcome_id);
        if (o?.achieved_at) actions.updateOutcome(o.id, { achieved_at: null });
      }
    },
    // Long titles (often dictated) get shortened to 5 words; the full text goes in the description
    tidyTitle: async (row) => {
      const text = row.title.trim();
      if (text.split(/\s+/).length <= 5) return;
      const short = await condense(text);
      if (!short || short === text) return;
      const cur = dbRef.current.items.find((i) => i.id === row.id);
      if (!cur || cur.title !== row.title) return; // edited in the meantime
      actions.updateItem(row.id, { title: short, description: cur.description ? `${text}\n\n${cur.description}` : text });
    },
    moveItem: (item, date) => {
      const changes = { start_date: date, moved_count: (item.moved_count || 0) + 1 };
      if (item.due_date && item.due_date < date) changes.due_date = date;
      actions.updateItem(item.id, changes);
    },

    saveSession: (itemId, seconds) => {
      const row = { id: uid(), item_id: itemId, seconds, finished_at: now() };
      setDb((d) => ({ ...d, sessions: [...(d.sessions || []), row] }));
      remote(supabase?.from("timer_sessions").insert(row));
    },
    setLimit: (mins) => actions.setSettings({ daily_limit_mins: mins }),
    setSettings: (changes) => {
      const next = { ...dbRef.current.settings, ...changes };
      setDb((d) => ({ ...d, settings: next }));
      const { user_id, ...row } = next;
      remote(supabase?.from("settings").upsert(row));
    },
  };

  return { db, error, actions };
}

// Voice: shorten a spoken note to a title of 5 words or fewer
export async function condense(text) {
  const fallback = () => {
    const words = text.replace(/^(i need to|i've got to|i have to|remind me to|remember to|i should)\s+/i, "").split(/\s+/).slice(0, 5).join(" ");
    return words.charAt(0).toUpperCase() + words.slice(1).replace(/[.,]$/, "");
  };
  if (isDemo) return fallback();
  try {
    const { data, error } = await supabase.functions.invoke("condense", { body: { text } });
    if (error || !data?.title) throw error || new Error("No title");
    return data.title;
  } catch {
    return fallback();
  }
}

export { toDateStr };
