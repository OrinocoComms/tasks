// Supabase Edge Function: "breakdown"
// Breaks a task into small steps and checks that the FIRST step is a single, achievable step.
// Needs the secret ANTHROPIC_API_KEY (Edge Functions → Secrets).

import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-sonnet-5-5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `You help a person who procrastinates turn personal admin tasks into steps small enough to start without thinking.
They do one 15-minute session a day. Starting is their biggest hurdle, so the FIRST step matters most.

A first step PASSES only if all four tests are true:
1. action: it is one concrete physical action you can picture doing (starts with a verb like "open", "find", "write", "phone", "put"). Not "sort out", "deal with", "look into", "plan", "think about".
2. time: it fits comfortably in under 15 minutes.
3. no_decisions: it needs no decisions, choices or information the person doesn't already have.
4. start_point: it's obvious exactly where to begin (which drawer, which website, which person).

If the first step fails any test and you cannot fix it from what you know, ask ONE short, friendly, specific question that would let you make it smaller (e.g. "Where are the old bank statements kept?" or "Do you already know which plumber you'd call?"). Never ask more than one question at a time. If earlier answers are given, use them.

Steps after the first can be slightly bigger but each should still fit in one 15-minute session. Aim for 3–8 steps in total. Keep each step under 12 words, plain British English, no numbering.
If the person already has steps, keep their wording where it's fine and only reshape what needs it.

Reply with JSON only, no prose, in exactly this shape:
{"steps": ["first step", "..."], "tests": {"action": true, "time": true, "no_decisions": true, "start_point": true}, "passes": true, "question": null, "note": "one short encouraging sentence about why the first step works, or what's missing"}
"passes" must be true only if all four tests are true. If passes is false, "question" must be a question.`;

async function callClaude(key: string, body: unknown) {
  const send = (headers: Record<string, string>) =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", ...headers },
      body: JSON.stringify(body),
    });
  let res = await send({ "x-api-key": key });
  if (res.status === 401) res = await send({ authorization: `Bearer ${key}` });
  return res;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...cors, "content-type": "application/json" } });

  try {
    // Only signed-in users may spend API credit
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "ANTHROPIC_API_KEY secret is not set" }, 500);

    const { task, steps = [], history = [] } = await req.json();
    if (!task?.title) return json({ error: "Missing task title" }, 400);

    const lines = [
      `Task: ${task.title}`,
      task.notes ? `Notes: ${task.notes}` : "",
      task.due_date ? `Deadline: ${task.due_date} (${task.deadline_type})` : "",
      steps.length ? `Current steps:\n- ${steps.join("\n- ")}` : "No steps yet.",
      history.length
        ? `Earlier questions and answers:\n${history.map((h: { q: string; a: string }) => `Q: ${h.q}\nA: ${h.a}`).join("\n")}`
        : "",
    ].filter(Boolean);

    const res = await callClaude(key, {
      model: MODEL,
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: "user", content: lines.join("\n\n") }],
    });
    if (!res.ok) {
      const detail = await res.text();
      return json({ error: `Claude API error ${res.status}`, detail: detail.slice(0, 400) }, 502);
    }
    const data = await res.json();
    const text: string = data.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return json({ error: "Could not read the reply", detail: text.slice(0, 400) }, 502);
    const out = JSON.parse(match[0]);
    out.passes = !!(out.tests && Object.values(out.tests).every(Boolean) && out.passes);
    return json(out);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
