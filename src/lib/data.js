import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { DAY, toDateStr } from "./plan.js";

// Demo mode: no Supabase configured, or ?demo in the URL. Data lives in this browser only.
export const isDemo = !supabase || new URLSearchParams(location.search).has("demo");

const LS = "tasks-demo-v2";
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export const DEFAULT_ZONES = [
  ["House", "🏠"], ["Garden", "🌿"], ["Kids", "🧒"], ["Admin & money", "📄"], ["Health", "🏃"],
];

function demoSeed() {
  const zones = DEFAULT_ZONES.map(([name, emoji], i) => ({ id: uid(), name, emoji, position: i }));
  const z = Object.fromEntries(zones.map((x) => [x.name, x.id]));
  const ago = (d) => new Date(Date.now() - d * DAY).toISOString();
  const inDays = (d) => toDateStr(new Date(Date.now() + d * DAY));
  const tasks = [];
  const steps = [];
  const add = (t, stepList = []) => {
    const id = uid();
    tasks.push({ id, notes: "", consequence: "", due_date: null, deadline_type: "someday", status: "ready", created_at: ago(3), touched_at: ago(1), ...t });
    stepList.forEach(([title, done], i) =>
      steps.push({ id: uid(), task_id: id, title, position: i, done: !!done, done_at: done ? ago(done) : null }));
  };
  add({ title: "Renew car insurance", zone_id: z["Admin & money"], deadline_type: "hard", due_date: inDays(5), consequence: "Car isn't insured" },
    [["Find current policy email and note renewal price", 1], ["Get two comparison quotes online"], ["Phone current insurer to ask for a better price"], ["Pay and save the new documents"]]);
  add({ title: "Book kids' dentist check-ups", zone_id: z["Kids"], deadline_type: "target", due_date: inDays(12) },
    [["Open the dentist's booking page on my phone"], ["Pick two after-school slots and book"]]);
  add({ title: "Clear the garage", zone_id: z["House"], status: "designing", touched_at: ago(2) });
  add({ title: "Fix the wobbly garden gate", zone_id: z["Garden"], touched_at: ago(16), created_at: ago(30) },
    [["Sort out the gate"]]);
  add({ title: "Return the Amazon parcel", zone_id: z["House"], status: "done", completed_at: ago(1) },
    [["Print the returns label", 2], ["Drop it at the post office", 1]]);
  const sessions = [
    { id: uid(), started_at: ago(1), planned_minutes: 15, actual_seconds: 17 * 60, steps_done: 2 },
    { id: uid(), started_at: ago(2), planned_minutes: 15, actual_seconds: 15 * 60, steps_done: 1 },
  ];
  return { zones, tasks, steps, sessions };
}

function demoLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(LS));
    if (d) return d;
  } catch { /* ignore */ }
  const d = demoSeed();
  localStorage.setItem(LS, JSON.stringify(d));
  return d;
}

export function resetDemo() {
  localStorage.removeItem(LS);
  location.reload();
}

async function fetchAll() {
  const since = new Date(Date.now() - 120 * DAY).toISOString();
  const [z, t, s, se] = await Promise.all([
    supabase.from("zones").select("*").order("position"),
    supabase.from("tasks").select("*").order("created_at"),
    supabase.from("steps").select("*").order("position"),
    supabase.from("sessions").select("*").gte("started_at", since).order("started_at"),
  ]);
  const err = z.error || t.error || s.error || se.error;
  if (err) throw err;
  return { zones: z.data, tasks: t.data, steps: s.data, sessions: se.data };
}

export function useStore(user) {
  const [db, setDb] = useState(null);
  const [error, setError] = useState(null);
  const seeded = useRef(false);

  const refresh = useCallback(async () => {
    if (isDemo) return setDb(demoLoad());
    try {
      const data = await fetchAll();
      if (data.zones.length === 0 && !seeded.current) {
        seeded.current = true;
        const zones = DEFAULT_ZONES.map(([name, emoji], i) => ({ id: uid(), name, emoji, position: i }));
        await supabase.from("zones").insert(zones);
        data.zones = zones;
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
    const later = () => { clearTimeout(timer); timer = setTimeout(refresh, 500); };
    const ch = supabase.channel("all-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, later)
      .on("postgres_changes", { event: "*", schema: "public", table: "steps" }, later)
      .on("postgres_changes", { event: "*", schema: "public", table: "zones" }, later)
      .subscribe();
    const onFocus = () => later();
    window.addEventListener("focus", onFocus);
    return () => { supabase.removeChannel(ch); window.removeEventListener("focus", onFocus); clearTimeout(timer); };
  }, [user, refresh]);

  // Persist demo data
  useEffect(() => { if (isDemo && db) localStorage.setItem(LS, JSON.stringify(db)); }, [db]);

  const remote = async (q) => {
    if (isDemo) return;
    const { error } = await q;
    if (error) { console.error(error); setError(error.message); }
  };

  const patch = (table, id, changes) =>
    setDb((d) => ({ ...d, [table]: d[table].map((r) => (r.id === id ? { ...r, ...changes } : r)) }));

  const actions = {
    // Zones
    addZone: (name, emoji) => {
      const z = { id: uid(), name, emoji, position: (db?.zones.length || 0) };
      setDb((d) => ({ ...d, zones: [...d.zones, z] }));
      remote(supabase?.from("zones").insert(z));
    },
    updateZone: (id, changes) => { patch("zones", id, changes); remote(supabase?.from("zones").update(changes).eq("id", id)); },
    deleteZone: (id) => {
      setDb((d) => ({ ...d, zones: d.zones.filter((z) => z.id !== id), tasks: d.tasks.map((t) => (t.zone_id === id ? { ...t, zone_id: null } : t)) }));
      remote(supabase?.from("zones").delete().eq("id", id));
    },

    // Tasks
    addTask: (fields) => {
      const t = { id: uid(), notes: "", consequence: "", deadline_type: "someday", due_date: null, status: "designing", created_at: now(), touched_at: now(), completed_at: null, ...fields };
      setDb((d) => ({ ...d, tasks: [...d.tasks, t] }));
      remote(supabase?.from("tasks").insert(t));
      return t;
    },
    updateTask: (id, changes) => { patch("tasks", id, changes); remote(supabase?.from("tasks").update(changes).eq("id", id)); },
    deleteTask: (id) => {
      setDb((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id), steps: d.steps.filter((s) => s.task_id !== id) }));
      remote(supabase?.from("tasks").delete().eq("id", id));
    },

    // Steps
    // Replace the not-yet-done steps of a task with a new list (keeps finished ones)
    replaceSteps: (taskId, titles) => {
      const kept = db.steps.filter((s) => s.task_id === taskId && s.done).sort((a, b) => a.position - b.position);
      const fresh = titles.map((title, i) => ({ id: uid(), task_id: taskId, title, position: kept.length + i, done: false, done_at: null }));
      setDb((d) => ({ ...d, steps: [...d.steps.filter((s) => s.task_id !== taskId || s.done), ...fresh] }));
      if (!isDemo) {
        (async () => {
          await remote(supabase.from("steps").delete().eq("task_id", taskId).eq("done", false));
          if (fresh.length) await remote(supabase.from("steps").insert(fresh));
        })();
      }
    },
    completeStep: (step) => {
      const t = now();
      patch("steps", step.id, { done: true, done_at: t });
      patch("tasks", step.task_id, { touched_at: t });
      remote(supabase?.from("steps").update({ done: true, done_at: t }).eq("id", step.id));
      remote(supabase?.from("tasks").update({ touched_at: t }).eq("id", step.task_id));
      // Was that the last one?
      const left = db.steps.filter((s) => s.task_id === step.task_id && !s.done && s.id !== step.id);
      if (left.length === 0) {
        patch("tasks", step.task_id, { status: "done", completed_at: t });
        remote(supabase?.from("tasks").update({ status: "done", completed_at: t }).eq("id", step.task_id));
        return "task-done";
      }
      return "step-done";
    },
    uncompleteStep: (step) => {
      patch("steps", step.id, { done: false, done_at: null });
      remote(supabase?.from("steps").update({ done: false, done_at: null }).eq("id", step.id));
    },

    // Sessions
    saveSession: (s) => {
      const row = { id: uid(), planned_minutes: 15, ...s };
      setDb((d) => ({ ...d, sessions: [...d.sessions, row] }));
      remote(supabase?.from("sessions").insert(row));
    },
  };

  return { db, error, actions, refresh };
}

// Ask Claude to break a task down (via the Supabase Edge Function)
export async function aiBreakdown(task, steps, history) {
  if (isDemo) throw new Error("AI breakdown works once the app is connected to Supabase. Use the checklist for now.");
  const { data, error } = await supabase.functions.invoke("breakdown", {
    body: { task: { title: task.title, notes: task.notes, due_date: task.due_date, deadline_type: task.deadline_type }, steps, history },
  });
  if (error) {
    let msg = error.message;
    try { const body = await error.context.json(); msg = body.error + (body.detail ? `: ${body.detail}` : ""); } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data;
}
