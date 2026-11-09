import { useState } from "react";
import { supabase } from "../lib/supabase.js";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("in");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const fn = mode === "in" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { data, error } = await fn.call(supabase.auth, { email, password });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === "up" && !data.session) setMsg("Check your email to confirm, then sign in here.");
  };

  return (
    <div className="main" style={{ maxWidth: 400, paddingTop: "18vh" }}>
      <div className="kicker">Little steps</div>
      <h1>{mode === "in" ? "Welcome back" : "Create your account"}</h1>
      <p className="sub">One small step a day.</p>
      <form onSubmit={submit}>
        <div className="field"><label>Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></div>
        <div className="field"><label>Password</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={6} required /></div>
        <button className="btn wide" disabled={busy}>{mode === "in" ? "Sign in" : "Create account"}</button>
      </form>
      {msg && <p className="small" style={{ marginTop: 14 }}>{msg}</p>}
      <button className="btn quiet wide" style={{ marginTop: 10 }} onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(""); }}>
        {mode === "in" ? "First time? Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
