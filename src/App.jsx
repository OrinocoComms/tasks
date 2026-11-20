import { useEffect, useState } from "react";
import "./styles.css";
import { supabase } from "./lib/supabase.js";
import { isDemo, useStore } from "./lib/store.js";
import Login from "./screens/Login.jsx";
import Today from "./screens/Today.jsx";
import Areas from "./screens/Areas.jsx";
import Area from "./screens/Area.jsx";
import Outcome from "./screens/Outcome.jsx";
import Task from "./screens/Task.jsx";
import Timer from "./screens/Timer.jsx";
import More from "./screens/More.jsx";

// Tiny hash router: #/task/abc?outcome=xyz
function useRoute() {
  const read = () => {
    const h = location.hash.replace(/^#/, "") || "/";
    const [path, qs] = h.split("?");
    return { parts: path.split("/").filter(Boolean), query: Object.fromEntries(new URLSearchParams(qs || "")) };
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
export const go = (path) => { location.hash = path; };

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

function Home({ user }) {
  const { db, error, actions } = useStore(user);
  const route = useRoute();
  if (!db) return <div className="empty">{error ? `Couldn't load: ${error}` : "Loading…"}</div>;

  const [a, b] = route.parts;
  const props = { db, actions, query: route.query };
  let screen;
  if (!a) screen = <Today {...props} />;
  else if (a === "areas") screen = <Areas {...props} />;
  else if (a === "area") screen = <Area {...props} id={b} />;
  else if (a === "outcome") screen = <Outcome key={b} {...props} id={b} />;
  else if (a === "task") screen = <Task key={b + JSON.stringify(route.query)} {...props} id={b} />;
  else if (a === "timer") screen = <Timer key={b} {...props} id={b} />;
  else if (a === "more") screen = <More {...props} />;
  else screen = <Today {...props} />;

  return (
    <>
      {isDemo && <div className="demo-bar">Demo mode: sample data, saved only in this browser</div>}
      {screen}
      {error && <div className="toast" role="alert">{error}</div>}
    </>
  );
}
