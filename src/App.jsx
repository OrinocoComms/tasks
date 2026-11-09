import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { supabase } from "./lib/supabase.js";
import { isDemo, useStore } from "./lib/data.js";
import { planTasks } from "./lib/plan.js";
import Login from "./views/Login.jsx";
import Today from "./views/Today.jsx";
import Tasks from "./views/Tasks.jsx";
import Wins from "./views/Wins.jsx";
import Designer from "./views/Designer.jsx";
import Session from "./views/Session.jsx";
import { Burst, BigWin } from "./views/Celebrate.jsx";

export default function App() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    if (isDemo) return setUser({ id: "demo" });
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  if (user === undefined) return null;
  if (!user) return <Login />;
  return <Home user={user} />;
}

const TABS = [
  ["today", "Today", "○"],
  ["tasks", "Tasks", "☰"],
  ["wins", "Wins", "✦"],
];

function Home({ user }) {
  const { db, error, actions } = useStore(user);
  const [tab, setTab] = useState("today");
  const [designing, setDesigning] = useState(null); // task id or "new"
  const [newZone, setNewZone] = useState(null);
  const [session, setSession] = useState(false);
  const [burst, setBurst] = useState(null);
  const [bigWin, setBigWin] = useState(null);

  const plan = useMemo(() => (db ? planTasks(db.tasks, db.steps, db.sessions) : {}), [db]);

  if (!db) return <div className="empty">{error ? `Couldn't load: ${error}` : "Loading…"}</div>;

  const celebrate = (result, task) => {
    if (result === "task-done") setBigWin(task);
    else setBurst(Date.now());
  };

  const openDesigner = (id, zoneId = null) => { setNewZone(zoneId); setDesigning(id); };
  const designingTask = designing && designing !== "new" ? db.tasks.find((t) => t.id === designing) : null;

  const shared = { db, plan, actions, openDesigner, celebrate };

  return (
    <>
      {isDemo && <div className="demo-bar">Demo mode: sample data, saved only in this browser</div>}
      <div className="app">
        <nav className="nav">
          <div className="brand">Little steps</div>
          {TABS.map(([id, label, ic]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              <span className="ic">{ic}</span>{label}
            </button>
          ))}
        </nav>
        <main className="main">
          {tab === "today" && <Today {...shared} startSession={() => setSession(true)} />}
          {tab === "tasks" && <Tasks {...shared} />}
          {tab === "wins" && <Wins {...shared} />}
        </main>
      </div>

      {tab !== "wins" && <button className="fab" aria-label="Add task" onClick={() => openDesigner("new")}>+</button>}

      {designing && (
        <Designer
          key={designing}
          task={designingTask}
          zoneId={newZone}
          {...shared}
          onClose={() => setDesigning(null)}
          onCreated={(t) => setDesigning(t.id)}
        />
      )}
      {session && <Session {...shared} onClose={() => setSession(false)} />}
      {burst && <Burst key={burst} onDone={() => setBurst(null)} />}
      {bigWin && <BigWin task={bigWin} steps={db.steps.filter((s) => s.task_id === bigWin.id)} onClose={() => setBigWin(null)} />}
      {error && <div className="toast">{error}</div>}
    </>
  );
}
