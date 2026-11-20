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
    <div className="page" style={{ padding: "18vh 24px 40px", gap: 12 }}>
      <h1 className="h1">{mode === "in" ? "Welcome back" : "Create your account"}</h1>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        <label className="small">Email<input className="input" style={{ marginTop: 6 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
        <label className="small">Password<input className="input" style={{ marginTop: 6 }} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={6} required /></label>
        <button className="btn" disabled={busy} style={{ marginTop: 8 }}>{mode === "in" ? "Sign in" : "Create account"}</button>
      </form>
      {msg && <p className="small">{msg}</p>}
      <button className="btn quiet" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(""); }}>
        {mode === "in" ? "First time? Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
