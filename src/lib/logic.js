// App rules: dates, Today's list, time roll-ups, the daily limit, repeats, quick wins.

export const DAY = 86400000;

export function toDateStr(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export const todayStr = () => toDateStr(new Date());
export const addDays = (s, n) => toDateStr(parseDate(s).getTime() + n * DAY);
export const daysFromToday = (s) => Math.round((parseDate(s) - parseDate(todayStr())) / DAY);

export function niceDate(s) {
  if (!s) return "";
  const n = daysFromToday(s);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  const opts = n > 0 && n < 7 ? { weekday: "short" } : { weekday: "short", day: "numeric", month: "short" };
  return parseDate(s).toLocaleDateString("en-GB", opts);
}
export function dateRange(start, due) {
  if (start && due && start !== due) {
    return `${parseDate(start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} → ${niceDate(due)}`;
  }
  return niceDate(start || due);
}

export function fmtMins(m) {
  if (!m) return "0 min";
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h}h${r ? ` ${r}m` : ""}` : `${r} min`;
}

// ---------- Item helpers ----------
export const childrenOf = (items, id) =>
  items.filter((i) => i.parent_id === id).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
export const openChildren = (items, id) => childrenOf(items, id).filter((i) => !i.done);
export const doDate = (i) => i.start_date || i.due_date;

// An item's own time plus whatever is left of its subtasks
export function remainingMins(items, item) {
  if (item.done) return 0;
  return (item.est_mins || 0) + childrenOf(items, item.id).reduce((n, c) => n + remainingMins(items, c), 0);
}
export function totalMins(items, item) {
  return (item.est_mins || 0) + childrenOf(items, item.id).reduce((n, c) => n + totalMins(items, c), 0);
}

// ---------- Today ----------
// Anything not done whose date has arrived (unfinished days roll over by themselves)
export function todayItems(items) {
  const t = todayStr();
  const order = { must: 0, could: 1 };
  return items
    .filter((i) => !i.done && doDate(i) && doDate(i) <= t)
    .sort((a, b) => order[a.priority] - order[b.priority] || doDate(a).localeCompare(doDate(b)) || a.created_at.localeCompare(b.created_at));
}
// Ticked off today (stay on the list, greyed)
export function doneToday(items) {
  const t = todayStr();
  return items.filter((i) => i.done && i.done_at && toDateStr(i.done_at) === t && doDate(i) && doDate(i) <= t);
}
// Each item counts only its own time, so a task and its subtasks aren't counted twice
export const plannedMins = (list) => list.reduce((n, i) => n + (i.est_mins || 0), 0);

export function rolledLabel(item) {
  const d = doDate(item);
  if (!d || d >= todayStr()) return null;
  return daysFromToday(d) === -1 ? "From yesterday" : `From ${niceDate(d)}`;
}

// Unallocated: top-level tasks with no outcome, no area and no date yet
export const unallocated = (items) =>
  items.filter((i) => !i.done && !i.parent_id && !i.outcome_id && !i.area_id && !doDate(i));

// ---------- Quick wins ----------
// A 5-minute task that isn't on today's list: must-dos first, then the longest-waiting
export function quickWins(items) {
  const t = todayStr();
  const order = { must: 0, could: 1 };
  return items
    .filter((i) => !i.done && (!doDate(i) || doDate(i) > t) && remainingMins(items, i) > 0 && remainingMins(items, i) <= 5 && openChildren(items, i.id).length === 0)
    .sort((a, b) => order[a.priority] - order[b.priority] || a.created_at.localeCompare(b.created_at));
}

// ---------- Outcomes ----------
export function outcomeProgress(items, outcome) {
  const tasks = items.filter((i) => i.outcome_id === outcome.id && !i.parent_id);
  const done = tasks.filter((i) => i.done).length;
  const left = tasks.reduce((n, i) => n + remainingMins(items, i), 0);
  return { tasks, done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0, left };
}

// ---------- Repeats ----------
export const DAYS = [["Monday", "M", 1], ["Tuesday", "T", 2], ["Wednesday", "W", 3], ["Thursday", "T", 4], ["Friday", "F", 5], ["Saturday", "S", 6], ["Sunday", "S", 0]];
export const ORDS = ["1st", "2nd", "3rd", "4th", "Last"];
export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
export function repeatLabel(r) {
  if (!r || r.freq === "never") return "Never";
  if (r.freq === "daily") return "Every day";
  if (r.freq === "weekly") {
    const names = DAYS.filter((d) => (r.days || []).includes(d[2])).map((d) => d[0]);
    if (!names.length) return "Weekly: pick a day";
    return "Every " + (names.length > 2 ? names.map((n) => n.slice(0, 3)).join(", ") : names.join(" & "));
  }
  if (r.freq === "monthly") {
    if (r.monthMode === "day") {
      const day = DAYS.find((d) => d[2] === (r.monthDay ?? 5))[0];
      return `${ORDS[r.ord || 0] === "Last" ? "Last" : ORDS[r.ord || 0]} ${day} of every month`;
    }
    return `${ordinal(r.monthDate || 1)} of every month`;
  }
  return "Never";
}
function nthWeekdayOfMonth(year, month, weekday, ordIdx) {
  if (ordIdx === 4) {
    const last = new Date(year, month + 1, 0);
    const diff = (last.getDay() - weekday + 7) % 7;
    return new Date(year, month, last.getDate() - diff);
  }
  const first = new Date(year, month, 1);
  const diff = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + diff + ordIdx * 7);
}
// The next date after `afterStr` that matches the rule
export function nextOccurrence(r, afterStr) {
  if (!r || r.freq === "never") return null;
  let d = parseDate(afterStr);
  for (let i = 0; i < 400; i++) {
    d = new Date(d.getTime() + DAY);
    const s = toDateStr(d);
    if (r.freq === "daily") return s;
    if (r.freq === "weekly" && (r.days || []).includes(d.getDay())) return s;
    if (r.freq === "monthly") {
      if (r.monthMode === "day") {
        const target = nthWeekdayOfMonth(d.getFullYear(), d.getMonth(), r.monthDay ?? 5, r.ord || 0);
        if (toDateStr(target) === s) return s;
      } else {
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        if (d.getDate() === Math.min(r.monthDate || 1, lastDay)) return s;
      }
    }
  }
  return null;
}

// ---------- Area icons ----------
export const AREA_ICONS = ["house", "health", "kids", "garden", "finances", "general", "leisure", "car"];
export const DEFAULT_AREAS = [
  ["House", "house"], ["Health", "health"], ["Kids", "kids"], ["Garden", "garden"],
  ["Finances", "finances"], ["Leisure", "leisure"], ["General", "general"], ["Car", "car"],
];

// ---------- Weekly review ----------
const dayOf = (s) => parseDate(s).getDay();
// The most recent review day, on or before today
export function lastReviewDay(reviewDay) {
  const t = todayStr();
  return addDays(t, -((dayOf(t) - reviewDay + 7) % 7));
}
export function reviewDue(settings) {
  const day = settings?.review_day ?? 0;
  const last = settings?.last_review;
  if (!last) return dayOf(todayStr()) === day;
  return last < lastReviewDay(day);
}
export function nextMonday() {
  const t = todayStr();
  return addDays(t, ((8 - dayOf(t)) % 7) || 7);
}
// What happened in the last 7 days
export function weekSummary(db) {
  const from = addDays(todayStr(), -6);
  const inWeek = (ts) => ts && toDateStr(ts) >= from;
  const done = db.items.filter((i) => i.done && inWeek(i.done_at)).sort((a, b) => b.done_at.localeCompare(a.done_at));
  const achieved = db.outcomes.filter((o) => inWeek(o.achieved_at));
  const sessions = (db.sessions || []).filter((s) => inWeek(s.finished_at));
  const timedMins = Math.round(sessions.reduce((n, s) => n + s.seconds, 0) / 60);
  // Guessed vs actual, per task (only tasks that had a guess)
  const byItem = {};
  for (const s of sessions) byItem[s.item_id] = (byItem[s.item_id] || 0) + s.seconds;
  const timed = Object.entries(byItem).map(([id, secs]) => {
    const item = db.items.find((i) => i.id === id);
    return item && item.est_mins ? { item, est: item.est_mins, actual: Math.max(1, Math.round(secs / 60)) } : null;
  }).filter(Boolean);
  return { done, achieved, timedMins, timed };
}
export function notDone(items) {
  const t = todayStr();
  return items.filter((i) => !i.done && doDate(i) && doDate(i) <= t)
    .sort((a, b) => (b.moved_count || 0) - (a.moved_count || 0) || doDate(a).localeCompare(doDate(b)));
}
export function plannedOn(items, date) {
  return items.filter((i) => !i.done && doDate(i) === date)
    .sort((a, b) => (a.priority === "must" ? 0 : 1) - (b.priority === "must" ? 0 : 1));
}
