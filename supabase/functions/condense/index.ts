// Supabase Edge Function: "condense"
// Turns a long spoken description into a task title of 5 words or fewer.
// Needs the secret ANTHROPIC_API_KEY (Edge Functions → Secrets).

import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-haiku-5-5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `You turn a person's spoken note into a short task title for their to-do app.
Rules: 5 words or fewer. Start with a verb (Book, Call, Fix, Order, Sort...). Plain British English.
No full stop, no quotation marks, no emoji. Keep the key object (e.g. "boiler", "school trip form").
Reply with the title only.`;

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

    const { text } = await req.json();
    if (!text || typeof text !== "string") return json({ error: "Missing text" }, 400);

    const res = await callClaude(key, {
      model: MODEL,
      max_tokens: 40,
      system: SYSTEM,
      messages: [{ role: "user", content: text.slice(0, 2000) }],
    });
    if (!res.ok) return json({ error: `Claude API error ${res.status}`, detail: (await res.text()).slice(0, 300) }, 502);
    const data = await res.json();
    let title: string = data.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
    title = title.replace(/["“”.]/g, "").trim().split(/\s+/).slice(0, 5).join(" ");
    return json({ title });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
