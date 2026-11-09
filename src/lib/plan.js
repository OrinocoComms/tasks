// Planning logic: deadlines, "start by" dates, staleness and today's queue.
// Assumes one 15-minute session a day, roughly one step per session.

export const DAY = 86400000;

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toDateStr(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export function daysFromToday(dateStr) {
  return Math.round((parseDate(dateStr) - startOfDay()) / DAY);
}

export function niceDate(dateStr) {
  const n = daysFromToday(dateStr);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  const d = parseDate(dateStr);
  const opts = n > 0 && n < 7 ? { weekday: "short" } : { weekday: "short", day: "numeric", month: "short" };
  return d.toLocaleDateString("en-GB", opts);
}

export const STALE_DAYS = 7;
export const RETHINK_DAYS = 14;

export function ageDays(task) {
  return Math.floor((Date.now() - new Date(task.touched_at || task.created_at).getTime()) / DAY);
}

export function staleness(task) {
  if (task.status === "done") return "fresh";
  const a = ageDays(task);
  if (a >= RETHINK_DAYS) return "rethink";
  if (a >= STALE_DAYS) return "stale";
  return "fresh";
}

export function stepsFor(taskId, steps) {
  return steps.filter((s) => s.task_id === taskId).sort((a, b) => a.position - b.position);
}

export function didSessionToday(sessions) {
  const t = startOfDay().getTime();
  return sessions.some((s) => new Date(s.started_at).getTime() >= t);
}

// Work back from deadlines. Tasks share one session a day, so earlier
// deadlines eat into the time available for later ones.
export function planTasks(tasks, steps, sessions) {
  const plan = {};
  const sessionToday = didSessionToday(sessions);
  const open = tasks.filter((t) => t.status !== "done");
  for (const t of open) {
    const st = stepsFor(t.id, steps);
    const remaining = st.filter((s) => !s.done).length;
    plan[t.id] = {
      remaining,
      total: st.length,
      // A task still being designed probably needs a few steps we haven't written yet
      sessionsNeeded: Math.max(remaining, t.status === "designing" ? 3 : 1),
      staleness: staleness(t),
      age: ageDays(t),
      state: "none",
    };
  }
  const dated = open
    .filter((t) => t.due_date && t.deadline_type !== "someday")
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || (a.deadline_type === "hard" ? -1 : 1));
  let cumulative = 0;
  for (const t of dated) {
    const p = plan[t.id];
    cumulative += p.sessionsNeeded;
    const daysLeft = daysFromToday(t.due_date);
    // Sessions available up to and including the deadline day
    const available = daysLeft + (sessionToday ? 0 : 1);
    const slack = available - cumulative;
    p.slack = slack;
    p.startBy = toDateStr(new Date(startOfDay().getTime() + Math.max(0, slack) * DAY));
    if (daysLeft < 0) p.state = "overdue";
    else if (slack < 0) p.state = "at_risk";
    else if (slack <= 3) p.state = "start_now";
    else p.state = "on_track";
  }
  return plan;
}

const URGENCY = { overdue: 0, at_risk: 1, start_now: 2, on_track: 3, none: 4 };

function rank(t, p) {
  const hard = t.deadline_type === "hard" ? 0 : t.deadline_type === "target" ? 1 : 2;
  return [URGENCY[p.state] ?? 4, hard, t.due_date || "9999", -p.age];
}

function cmp(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

// The next step of every ready task, most pressing first.
export function buildQueue(tasks, steps, plan) {
  return tasks
    // A task that's sat untouched for two weeks goes back to the designer, not into sessions
    // (unless it has a hard deadline, which can't wait)
    .filter((t) => t.status === "ready" && plan[t.id] && (plan[t.id].staleness !== "rethink" || t.deadline_type === "hard"))
    .map((t) => ({ task: t, step: stepsFor(t.id, steps).find((s) => !s.done), p: plan[t.id] }))
    .filter((x) => x.step)
    .sort((a, b) => cmp(rank(a.task, a.p), rank(b.task, b.p)));
}

export function needsExtraSession(tasks, plan) {
  return tasks.some((t) => t.deadline_type === "hard" && ["at_risk", "overdue"].includes(plan[t.id]?.state));
}

export function planLabel(task, p) {
  if (!p || !task.due_date || task.deadline_type === "someday") return null;
  const due = niceDate(task.due_date);
  switch (p.state) {
    case "overdue": return { tone: "danger", text: `Was due ${due}` };
    case "at_risk": return { tone: task.deadline_type === "hard" ? "danger" : "warn", text: `At risk · due ${due}` };
    case "start_now": return { tone: "warn", text: `Start now · due ${due}` };
    default: return { tone: "calm", text: `Start by ${niceDate(p.startBy)} · due ${due}` };
  }
}
