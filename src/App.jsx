import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

const COLORS = {
  // palette taken from the club poster: clay court, autumn orange, cream, court green, ball yellow
  court: "#A9380C",
  courtMid: "#B8420F",
  courtStripe: "#9A3009",
  chalk: "#FCF3E3",
  card: "#FFFFFF",
  brass: "#C8641A",
  brassLight: "#FFA85C",
  ink: "#2A1D15",
  sub: "#6B5E52",
  line: "#EADFCB",
  win: "#3E6B2A",
  loss: "#B5442E",
  away: "#8A8578",
  grass: "#4A7330",
  ball: "#D4E82B",
};

const ADMIN_PIN = "1234"; // change this to whatever PIN you want to share with the coach/organiser
const VOID = "void"; // match.result value meaning "not played, nobody's rank changes"
const FORFEIT_PREFIX = "forfeit:"; // match.result = FORFEIT_PREFIX + id of the player who forfeited
const AVAILABILITY_TAGS = [
  "Weekday mornings",
  "Weekday evenings",
  "Weekend mornings",
  "Weekend afternoons",
  "Weekend evenings",
  "Flexible / anytime",
];

const DEFAULT_STATE = {
  players: [],
  cycles: [],
  matches: [],
  pendingAway: [],
  seeded: false,
  leaderStreak: { playerId: null, rounds: 0 },
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Evaluates up to 3 sets of { self, opp } game counts (strings). Empty sets are ignored.
// Returns { winner: "self" | "opponent", scoreStr } or null if nothing valid/decisive was entered.
function evaluateSets(sets) {
  const filled = sets.filter((s) => s.self.trim() !== "" && s.opp.trim() !== "");
  if (filled.length === 0) return null;
  let selfWins = 0;
  let oppWins = 0;
  const parts = [];
  for (const s of filled) {
    const a = parseInt(s.self, 10);
    const b = parseInt(s.opp, 10);
    if (isNaN(a) || isNaN(b) || a === b) return null;
    if (a > b) selfWins++;
    else oppWins++;
    parts.push(`${a}-${b}`);
  }
  if (selfWins === oppWins) return null;
  return { winner: selfWins > oppWins ? "self" : "opponent", scoreStr: parts.join(" ") };
}

// Parses a stored score string like "6-3 6-4" back into [[a, b], [a, b], ...] for display.
function parseStoredScore(scoreStr) {
  if (!scoreStr) return [];
  return scoreStr
    .trim()
    .split(/\s+/)
    .map((s) => {
      const m = s.match(/^(\d+)-(\d+)$/);
      return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
    })
    .filter(Boolean);
}

export default function LadderApp() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("ladder");
  const [expandedMatchId, setExpandedMatchId] = useState(null);
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [reopenConfirmId, setReopenConfirmId] = useState(null);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [newName, setNewName] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkMsg, setBulkMsg] = useState("");
  const [backupText, setBackupText] = useState("");
  const [backupMsg, setBackupMsg] = useState("");
  const [notice, setNotice] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [viewingPlayerId, setViewingPlayerId] = useState(null);
  const [scoreSets, setScoreSets] = useState([
    { self: "", opp: "" },
    { self: "", opp: "" },
    { self: "", opp: "" },
  ]);
  const [scoreError, setScoreError] = useState("");

  useEffect(() => {
    let channel;
    (async () => {
      try {
        const { data, error } = await supabase.from("ladder_state").select("data").eq("id", 1).single();
        if (error) throw error;
        setState(data?.data || DEFAULT_STATE);
      } catch {
        setState(DEFAULT_STATE);
      }
      setLoading(false);

      // Live sync: when anyone else updates the ladder, pick it up here too.
      channel = supabase
        .channel("ladder_state_changes")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "ladder_state", filter: "id=eq.1" },
          (payload) => {
            if (payload.new?.data) setState(payload.new.data);
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const save = useCallback(async (next) => {
    setState(next);
    try {
      const { error } = await supabase.from("ladder_state").update({ data: next }).eq("id", 1);
      if (error) throw error;
    } catch {
      setNotice("Could not save just then — try again.");
    }
  }, []);

  if (loading || !state) {
    return (
      <div style={{ padding: "2rem", color: COLORS.sub, fontSize: 14 }}>
        Loading ladder…
      </div>
    );
  }

  const getPlayer = (id) => state.players.find((p) => p.id === id);
  const currentCycle = state.cycles[state.cycles.length - 1] || null;
  const currentMatches = currentCycle
    ? state.matches.filter((m) => m.cycleId === currentCycle.id)
    : [];
  const standings = state.players.filter((p) => p.active !== false).sort((a, b) => a.rank - b.rank);

  // Add many players at once, in the order listed (one per line; "1." / "2)" numbering is ignored).
  function addPlayersFromList() {
    const existing = new Set(state.players.map((p) => p.name.trim().toLowerCase()));
    const names = [];
    let skipped = 0;
    bulkText.split(/\r?\n/).forEach((line) => {
      const name = line.replace(/^\s*\d+\s*[.)\-:]?\s*/, "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (existing.has(key)) {
        skipped += 1;
        return;
      }
      existing.add(key);
      names.push(name);
    });
    if (names.length === 0) {
      setBulkMsg(skipped ? "Those names are already on the list." : "Nothing to add yet.");
      return;
    }
    const base = state.players.length;
    const stamp = Date.now();
    const added = names.map((name, i) => ({
      id: "p_" + stamp + "_" + i + "_" + Math.random().toString(36).slice(2, 6),
      name,
      rank: base + i + 1,
      active: true,
      byeCount: 0,
      availability: [],
    }));
    save({ ...state, players: [...state.players, ...added] });
    setBulkText("");
    setBulkOpen(false);
    setBulkMsg(`Added ${names.length} player${names.length === 1 ? "" : "s"}${skipped ? ` (${skipped} already on the list, skipped)` : ""}.`);
    setNotice("");
  }

  // Plain-text backup of the current ladder order, ready to paste back in via "Add from a list".
  function copyLadder() {
    const lines = standings.map((p, i) => `${i + 1}. ${p.name}`);
    const text = lines.join("\n");
    setBackupText(text);
    setBackupMsg("");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => setBackupMsg("Copied. Paste it somewhere safe."),
          () => setBackupMsg("Couldn't copy automatically. Select the text below and copy it.")
        );
        return;
      }
    } catch (e) {
      // fall through
    }
    setBackupMsg("Select the text below and copy it.");
  }

  function addPlayer() {
    const name = newName.trim();
    if (!name) return;
    const id = "p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    save({
      ...state,
      players: [
        ...state.players,
        { id, name, rank: state.players.length + 1, active: true, byeCount: 0, availability: [] },
      ],
    });
    setNewName("");
    setNotice("");
  }

  function removePlayer(id) {
    save({ ...state, players: state.players.filter((p) => p.id !== id) });
  }

  function setPlayerActive(id, active) {
    const target = state.players.find((p) => p.id === id);
    if (active && target && target.active === false && state.seeded) {
      // Rejoining: go to the bottom of the ladder, everyone else closes the gap.
      const others = [...state.players].filter((p) => p.id !== id).sort((a, b) => a.rank - b.rank);
      const ordered = [...others, { ...target, active: true }];
      const rankOf = Object.fromEntries(ordered.map((p, i) => [p.id, i + 1]));
      save({ ...state, players: state.players.map((p) => ({ ...p, active: p.id === id ? true : p.active, rank: rankOf[p.id] })) });
      return;
    }
    save({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, active } : p)) });
  }

  function renamePlayer(id, newName) {
    const name = newName.trim();
    if (!name) return;
    save({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, name } : p)) });
  }

  // Apply one logged result to a { playerId: rank } map (same rules as logResult).
  function applyResultToRanks(ranks, m) {
    if (!m.result || m.result === VOID) return ranks;
    const next = { ...ranks };
    if (m.result.startsWith(FORFEIT_PREFIX)) {
      const fId = m.result.slice(FORFEIT_PREFIX.length);
      const oId = m.playerA === fId ? m.playerB : m.playerA;
      if (next[fId] < next[oId]) {
        const t = next[fId];
        next[fId] = next[oId];
        next[oId] = t;
      }
      return next;
    }
    const winnerId = m.result;
    const loserId = m.playerA === winnerId ? m.playerB : m.playerA;
    if (next[winnerId] > next[loserId]) {
      const lo = next[loserId];
      const hi = next[winnerId];
      Object.keys(next).forEach((id) => {
        if (id === winnerId) next[id] = lo;
        else if (next[id] >= lo && next[id] < hi) next[id] += 1;
      });
    }
    return next;
  }

  // Admin only: reopen a logged result in the current round. The ladder is rebuilt by
  // replaying the round's other results on top of the ranks at the start of the round.
  function reopenResult(matchId) {
    const match = state.matches.find((m) => m.id === matchId);
    const cycle = match && state.cycles.find((c) => c.id === match.cycleId);
    if (!match || !match.result) return;
    if (!cycle || cycle.id !== currentCycle?.id) {
      setNotice("Only results from the current round can be reopened.");
      return;
    }
    if (!cycle.startRanks) {
      setNotice("This round was created before reopening was available, so it can't be reopened.");
      return;
    }
    const logged = state.matches
      .filter((m) => m.cycleId === cycle.id && m.result)
      .sort((a, b) => (a.loggedAt || 0) - (b.loggedAt || 0));
    const replay = (list) => list.reduce((r, m) => applyResultToRanks(r, m), { ...cycle.startRanks });
    const full = replay(logged);
    const consistent =
      state.players.every((p) => full[p.id] === p.rank) && Object.keys(full).length === state.players.length;
    if (!consistent) {
      setNotice(
        "The ladder has been changed by hand this round (a player was added, removed or reinstated), so the result can't be reopened automatically."
      );
      return;
    }
    const rebuilt = replay(logged.filter((m) => m.id !== matchId));
    const nextPlayers = state.players.map((p) => ({ ...p, rank: rebuilt[p.id] }));
    const nextMatches = state.matches.map((m) =>
      m.id === matchId ? { ...m, result: null, score: "", loggedAt: undefined } : m
    );
    save({ ...state, players: nextPlayers, matches: nextMatches });
    setNotice("");
  }

  function voidMatch(matchId) {
    const nextMatches = state.matches.map((m) => (m.id === matchId ? { ...m, result: VOID, score: "", loggedAt: Date.now() } : m));
    save({ ...state, matches: nextMatches });
  }

  function buildRoundSummary() {
    if (!currentCycle) return "";
    const lines = [];
    lines.push(`Round ${currentCycle.number} recap — Deal & Walmer Autumn/Winter Tennis Ladder`);
    lines.push("");

    const topPlayer = standings[0];
    if (topPlayer) {
      const streak = state.leaderStreak || { playerId: null, rounds: 0 };
      lines.push(
        streak.playerId === topPlayer.id && streak.rounds > 1
          ? `Leader: ${topPlayer.name} — top of the ladder for ${streak.rounds} rounds running.`
          : `Leader: ${topPlayer.name} — new to the top spot this round.`
      );
      lines.push("");
    }

    lines.push("Results:");
    currentMatches.forEach((m) => {
      const a = getPlayer(m.playerA);
      const b = getPlayer(m.playerB);
      if (!a || !b) return;
      if (m.result === VOID) {
        lines.push(`- ${a.name} vs ${b.name}: not played this round.`);
      } else if (m.result && m.result.startsWith(FORFEIT_PREFIX)) {
        const forfeiter = getPlayer(m.result.slice(FORFEIT_PREFIX.length));
        lines.push(`- ${a.name} vs ${b.name}: forfeited by ${forfeiter ? forfeiter.name : "?"}.`);
      } else if (m.result) {
        const winner = getPlayer(m.result);
        const totalWins = state.matches.filter((mm) => mm.result === m.result).length;
        const isFirstWin = totalWins === 1;
        lines.push(
          `- ${a.name} vs ${b.name}: ${winner.name} won${m.score ? ` (${m.score})` : ""}.${isFirstWin ? " First win of the ladder for them." : ""}`
        );
      } else {
        lines.push(`- ${a.name} vs ${b.name}: not yet played.`);
      }
    });

    if (currentCycle.awayIds.length > 0) {
      const names = currentCycle.awayIds.map((id) => getPlayer(id)?.name).filter(Boolean).join(", ");
      lines.push("");
      lines.push(`Away this round: ${names}.`);
    }
    if (currentCycle.byePlayerId) {
      lines.push(`Bye: ${getPlayer(currentCycle.byePlayerId)?.name}.`);
    }

    return lines.join("\n");
  }

  function startLadder(keepOrder = false) {
    if (state.players.length < 2) {
      setNotice("Add at least 2 players first.");
      return;
    }
    // keepOrder: rank 1 = first player added, rank 2 = second, and so on.
    const base = keepOrder ? state.players : shuffle(state.players);
    const shuffled = base.map((p, i) => ({ ...p, rank: i + 1 }));
    save({ ...state, players: shuffled, cycles: [], matches: [], pendingAway: [], seeded: true });
    setNotice("");
    setTab("admin");
  }

  function generateNextCycle() {
    const awayIds = state.pendingAway || [];
    const available = state.players
      .filter((p) => p.active !== false && !awayIds.includes(p.id))
      .sort((a, b) => a.rank - b.rank);

    if (available.length < 2) {
      setNotice("Not enough available players to generate a round.");
      return;
    }

    const cycleNumber = state.cycles.length + 1;
    const cycleId = "c" + cycleNumber;
    const recentCycleIds = state.cycles.slice(-2).map((c) => c.id);
    const recentOpponents = {};
    available.forEach((p) => (recentOpponents[p.id] = new Set()));
    state.matches.forEach((m) => {
      if (recentCycleIds.includes(m.cycleId)) {
        if (recentOpponents[m.playerA]) recentOpponents[m.playerA].add(m.playerB);
        if (recentOpponents[m.playerB]) recentOpponents[m.playerB].add(m.playerA);
      }
    });

    // Above/below history: bias > 0 means the player has mostly faced higher-ranked
    // opponents so far (so would benefit from a lower-ranked one next), and vice versa.
    // Uses the ranks recorded when each match was created; void matches are ignored.
    const bias = {};
    available.forEach((p) => (bias[p.id] = 0));
    state.matches.forEach((m) => {
      if (m.result === VOID || m.rankA == null || m.rankB == null) return;
      if (m.rankA === m.rankB) return;
      const aFacedHigher = m.rankB < m.rankA;
      if (bias[m.playerA] !== undefined) bias[m.playerA] += aFacedHigher ? 1 : -1;
      if (bias[m.playerB] !== undefined) bias[m.playerB] += aFacedHigher ? -1 : 1;
    });
    const clamp = (n) => Math.max(-2, Math.min(2, n));

    const band = available.length < 10 ? 7 : 4;
    // Shuffle processing order (not rank) so no one player is systematically more
    // likely to face someone below them just because of where they sit on the ladder.
    let pool = shuffle(available);
    let byePlayerId = null;

    if (pool.length % 2 === 1) {
      const sortedByByes = [...pool].sort((a, b) => (a.byeCount || 0) - (b.byeCount || 0));
      byePlayerId = sortedByByes[0].id;
      pool = pool.filter((p) => p.id !== byePlayerId);
    }

    const newMatches = [];
    while (pool.length > 1) {
      const player = pool.shift();
      let candidates = pool.filter(
        (p) => Math.abs(p.rank - player.rank) <= band && !recentOpponents[player.id].has(p.id)
      );
      if (candidates.length === 0)
        candidates = pool.filter((p) => !recentOpponents[player.id].has(p.id));
      if (candidates.length === 0) candidates = pool;
      // Closest rank still matters most, but history nudges the choice towards
      // whichever direction (above/below) each of the two players has faced less.
      const cost = (c) => {
        const dist = Math.abs(c.rank - player.rank);
        const cBelow = c.rank > player.rank;
        const playerGain = clamp(cBelow ? bias[player.id] : -bias[player.id]);
        const oppGain = clamp(cBelow ? -bias[c.id] : bias[c.id]);
        return dist - 0.75 * (playerGain + oppGain);
      };
      candidates.sort((a, b) => cost(a) - cost(b));
      const opponent = candidates[0];
      pool = pool.filter((p) => p.id !== opponent.id);
      newMatches.push({
        id: "m_" + cycleId + "_" + newMatches.length,
        cycleId,
        playerA: player.id,
        playerB: opponent.id,
        rankA: player.rank,
        rankB: opponent.rank,
        result: null,
      });
    }

    const cycle = {
      id: cycleId,
      number: cycleNumber,
      status: "open",
      createdAt: Date.now(),
      awayIds,
      byePlayerId,
      startRanks: Object.fromEntries(state.players.map((p) => [p.id, p.rank])),
    };
    const nextPlayers = state.players.map((p) =>
      p.id === byePlayerId ? { ...p, byeCount: (p.byeCount || 0) + 1 } : p
    );

    const currentTop = [...state.players].sort((a, b) => a.rank - b.rank)[0];
    const prevStreak = state.leaderStreak || { playerId: null, rounds: 0 };
    const nextLeaderStreak = currentTop
      ? currentTop.id === prevStreak.playerId
        ? { playerId: currentTop.id, rounds: prevStreak.rounds + 1 }
        : { playerId: currentTop.id, rounds: 1 }
      : prevStreak;

    save({
      ...state,
      players: nextPlayers,
      cycles: [...state.cycles, cycle],
      matches: [...state.matches, ...newMatches],
      pendingAway: [],
      leaderStreak: nextLeaderStreak,
    });
    setNotice("");
  }

  function logResult(matchId, winnerId, score) {
    const match = state.matches.find((m) => m.id === matchId);
    if (!match || match.result) return;
    const loserId = match.playerA === winnerId ? match.playerB : match.playerA;
    const winner = getPlayer(winnerId);
    const loser = getPlayer(loserId);
    let nextPlayers = state.players;

    if (winner.rank > loser.rank) {
      const lo = loser.rank;
      const hi = winner.rank;
      nextPlayers = state.players.map((p) => {
        if (p.id === winnerId) return { ...p, rank: lo };
        if (p.id !== winnerId && p.rank >= lo && p.rank < hi) return { ...p, rank: p.rank + 1 };
        return p;
      });
    }

    const nextMatches = state.matches.map((m) =>
      m.id === matchId ? { ...m, result: winnerId, score: (score || "").trim(), loggedAt: Date.now() } : m
    );
    save({ ...state, players: nextPlayers, matches: nextMatches });
  }

  function toggleAway(playerId) {
    const set = new Set(state.pendingAway || []);
    if (set.has(playerId)) set.delete(playerId);
    else set.add(playerId);
    save({ ...state, pendingAway: Array.from(set) });
  }

  function toggleAvailability(playerId, tag) {
    const nextPlayers = state.players.map((p) => {
      if (p.id !== playerId) return p;
      const current = p.availability || [];
      const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
      return { ...p, availability: next };
    });
    save({ ...state, players: nextPlayers });
  }

  function resetAll() {
    save(DEFAULT_STATE);
    setViewingPlayerId(null);
    setExpandedMatchId(null);
    setResetConfirming(false);
    setTab("admin");
  }

  function submitPin() {
    if (pinInput === ADMIN_PIN) {
      setAdminUnlocked(true);
      setPinError("");
      setPinInput("");
    } else {
      setPinError("Wrong PIN — ask the organiser if you don't know it.");
    }
  }

  const tabs = [
    { id: "ladder", label: "Ladder" },
    { id: "round", label: "This round" },
    { id: "rules", label: "Rules" },
  ];

  return (
    <div
      style={{
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: COLORS.ink,
        maxWidth: 640,
        margin: "0 auto",
        background: COLORS.chalk,
        borderRadius: 16,
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: COLORS.court,
          borderRadius: 12,
          padding: "1.6rem 1.25rem 3.2rem",
          marginBottom: "1rem",
          position: "relative",
          overflow: "hidden",
          textAlign: "center",
        }}
      >
        {/* falling leaves, a nod to the poster */}
        <svg
          aria-hidden="true"
          viewBox="0 0 400 140"
          preserveAspectRatio="xMidYMin slice"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        >
          {[
            [28, 22, 28, -25, "#F0A64A"],
            [120, 70, 18, 40, "#D9822B"],
            [160, 112, 20, 15, "#E8943A"],
            [300, 30, 30, -50, "#C96A22"],
            [365, 80, 20, 25, "#F0A64A"],
            [60, 100, 16, -10, "#C96A22"],
          ].map(([x, y, s, rot, fill], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${rot}) scale(${s / 24})`} opacity="0.55">
              <path d="M12 0 C22 7 22 19 12 28 C2 19 2 7 12 0 Z" fill={fill} />
              <path d="M12 3 L12 30" stroke="#8C3008" strokeWidth="1.2" fill="none" />
            </g>
          ))}
        </svg>

        {/* court corner with tennis balls */}
        <svg
          aria-hidden="true"
          viewBox="0 0 200 50"
          style={{ position: "absolute", right: 0, bottom: 0, width: 220, height: 55, pointerEvents: "none" }}
        >
          <polygon points="0,50 200,5 200,50" fill="#4A7330" />
          <line x1="0" y1="50" x2="200" y2="5" stroke="#FFFFFF" strokeWidth="3.5" />
          {[[62, 31], [140, 25]].map(([cx, cy], i) => (
            <g key={i}>
              <circle cx={cx} cy={cy} r="7.5" fill="#D4E82B" />
              <path d={`M${cx - 6} ${cy - 3} Q${cx} ${cy + 1} ${cx - 4} ${cy + 6}`} stroke="#FFFFFF" strokeWidth="1.3" fill="none" />
            </g>
          ))}
        </svg>

        <button
          onClick={() => setTab("admin")}
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            background: "none",
            border: "none",
            color: tab === "admin" ? COLORS.brassLight : "rgba(255,248,236,0.45)",
            fontSize: 11,
            cursor: "pointer",
            padding: 4,
            zIndex: 2,
          }}
          aria-label="Admin"
        >
          Admin
        </button>

        <div style={{ position: "relative", fontFamily: "'Oswald', 'Inter', sans-serif", textTransform: "uppercase", lineHeight: 1.08 }}>
          <p style={{ color: COLORS.chalk, fontSize: 26, fontWeight: 600, margin: 0, letterSpacing: 0.8 }}>Deal &amp; Walmer</p>
          <p style={{ color: COLORS.brassLight, fontSize: 26, fontWeight: 600, margin: 0, letterSpacing: 0.8 }}>Autumn / Winter</p>
          <p style={{ color: COLORS.chalk, fontSize: 26, fontWeight: 500, margin: 0, letterSpacing: 0.8 }}>Tennis Ladder</p>
          <p style={{ color: "rgba(255,248,236,0.7)", fontSize: 12, fontWeight: 500, margin: "8px 0 0", letterSpacing: 2 }}>2026 / 2027</p>
        </div>
        <p style={{ position: "absolute", left: 14, bottom: 10, color: "rgba(255,248,236,0.85)", fontSize: 12.5, margin: 0, textAlign: "left" }}>
          {currentCycle
            ? `Cycle ${currentCycle.number} · ${currentMatches.filter((m) => m.result).length}/${currentMatches.length} logged`
            : "Not started yet"}
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "1rem" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: "8px 0",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 8,
              border: `0.5px solid ${tab === t.id ? COLORS.courtMid : COLORS.line}`,
              borderBottom: tab === t.id ? `2.5px solid ${COLORS.brass}` : `0.5px solid ${COLORS.line}`,
              background: tab === t.id ? COLORS.courtMid : "transparent",
              color: tab === t.id ? COLORS.chalk : COLORS.ink,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <div
          style={{
            fontSize: 13,
            color: COLORS.loss,
            background: "#FBEAE6",
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: "1rem",
          }}
        >
          {notice}
        </div>
      )}

      {tab === "ladder" && (
        <div>
          {viewingPlayerId ? (() => {
            const p = getPlayer(viewingPlayerId);
            if (!p) { setViewingPlayerId(null); return null; }
            const history = state.matches
              .filter((m) => (m.playerA === p.id || m.playerB === p.id) && m.result && m.result !== VOID && !m.result.startsWith(FORFEIT_PREFIX))
              .map((m) => {
                const cycle = state.cycles.find((c) => c.id === m.cycleId);
                const oppId = m.playerA === p.id ? m.playerB : m.playerA;
                const opp = getPlayer(oppId);
                const won = m.result === p.id;
                return { ...m, cycleNumber: cycle ? cycle.number : "?", oppName: opp ? opp.name : "?", won };
              })
              .sort((a, b) => (b.cycleNumber || 0) - (a.cycleNumber || 0));
            const wins = history.filter((h) => h.won).length;

            return (
              <div>
                <button
                  onClick={() => setViewingPlayerId(null)}
                  style={{ fontSize: 12.5, marginBottom: 12, background: "none", border: "none", color: COLORS.sub, cursor: "pointer", padding: 0 }}
                >
                  ← Back to ladder
                </button>
                <div style={{ background: COLORS.card, border: `0.5px solid ${COLORS.line}`, borderRadius: 12, padding: "1.1rem", marginBottom: 12 }}>
                  <p style={{ fontSize: 16, fontWeight: 500, margin: "0 0 14px" }}>{p.name}</p>
                  <p style={{ fontSize: 12.5, color: COLORS.sub, margin: "0 0 2px" }}>Rank</p>
                  <p style={{ fontSize: 26, fontWeight: 500, margin: "0 0 14px" }}>#{p.rank}</p>
                  <p style={{ fontSize: 12.5, color: COLORS.sub, margin: "0 0 2px" }}>Record this ladder</p>
                  <p style={{ fontSize: 20, fontWeight: 500, margin: "0 0 16px" }}>
                    {wins}-{history.length - wins}
                  </p>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12.5,
                      color: COLORS.sub,
                      cursor: "pointer",
                      borderTop: `0.5px solid ${COLORS.line}`,
                      paddingTop: 12,
                      marginBottom: 14,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={(state.pendingAway || []).includes(p.id)}
                      onChange={() => toggleAway(p.id)}
                    />
                    Mark {p.name} unavailable for the next round
                  </label>
                  <p style={{ fontSize: 12, color: COLORS.sub, margin: "0 0 8px" }}>General availability</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {AVAILABILITY_TAGS.map((tag) => {
                      const selected = (p.availability || []).includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => toggleAvailability(p.id, tag)}
                          style={{
                            fontSize: 12,
                            padding: "5px 10px",
                            borderRadius: 6,
                            cursor: "pointer",
                            border: `0.5px solid ${selected ? COLORS.courtMid : COLORS.line}`,
                            background: selected ? COLORS.courtMid : COLORS.chalk,
                            color: selected ? COLORS.chalk : COLORS.sub,
                          }}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {history.length === 0 ? (
                  <p style={{ fontSize: 13.5, color: COLORS.sub }}>No results logged yet.</p>
                ) : (
                  <div style={{ background: COLORS.card, border: `0.5px solid ${COLORS.line}`, borderRadius: 12, overflow: "hidden" }}>
                    {history.map((h, i) => (
                      <div
                        key={h.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 14px",
                          borderTop: i === 0 ? "none" : `0.5px solid ${COLORS.line}`,
                        }}
                      >
                        <div>
                          <p style={{ fontSize: 13, color: COLORS.sub, margin: 0 }}>Cycle {h.cycleNumber}</p>
                          <p style={{ fontSize: 13.5, fontWeight: 500, margin: "2px 0 0", color: h.won ? COLORS.win : COLORS.loss }}>
                            {h.won ? "Beat" : "Lost to"} {h.oppName}
                          </p>
                        </div>
                        {h.score && <p style={{ fontSize: 13, color: COLORS.sub, margin: 0 }}>{h.score}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })() : standings.length === 0 ? (
            <p style={{ color: COLORS.sub, fontSize: 14 }}>No players yet — add some in Admin.</p>
          ) : (
            <div>
              <div style={{ display: "flex", padding: "0 14px 6px", justifyContent: "flex-end" }}>
                <p style={{ fontSize: 10.5, color: COLORS.sub, margin: 0, letterSpacing: 0.3 }}>W&#8209;L</p>
              </div>
              <div style={{ background: COLORS.card, border: `0.5px solid ${COLORS.line}`, borderRadius: 12, overflow: "hidden" }}>
              {standings.map((p, i) => {
                const isAway = currentCycle && currentCycle.awayIds.includes(p.id);
                const isBye = currentCycle && currentCycle.byePlayerId === p.id;
                const record = state.matches.reduce(
                  (acc, m) => {
                    if (!m.result || m.result === VOID || m.result.startsWith(FORFEIT_PREFIX) || (m.playerA !== p.id && m.playerB !== p.id)) return acc;
                    if (m.result === p.id) acc.wins++;
                    else acc.losses++;
                    return acc;
                  },
                  { wins: 0, losses: 0 }
                );
                let statusText = `${record.wins}-${record.losses}`;
                let statusColor = COLORS.sub;
                if (isAway) { statusText = "Away"; statusColor = COLORS.away; }
                else if (isBye) { statusText = "Bye"; statusColor = COLORS.sub; }

                const streak = state.leaderStreak || { playerId: null, rounds: 0 };
                const leaderLabel =
                  i === 0
                    ? streak.playerId === p.id && streak.rounds > 1
                      ? `${streak.rounds} rounds as leader`
                      : "🎉 New leader"
                    : null;

                return (
                  <div
                    key={p.id}
                    onClick={() => setViewingPlayerId(p.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      borderTop: i === 0 ? "none" : `0.5px solid ${COLORS.line}`,
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        background: COLORS.card,
                        border: `1.5px solid ${COLORS.courtMid}`,
                        color: COLORS.courtMid,
                        fontSize: 12,
                        fontWeight: 500,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {p.rank}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{p.name}</p>
                      {leaderLabel && (
                        <p style={{ fontSize: 11, color: COLORS.brass, fontWeight: 500, margin: "2px 0 0" }}>
                          {leaderLabel}
                        </p>
                      )}
                    </div>
                    <p style={{ fontSize: 12.5, color: statusColor, margin: 0 }}>{statusText}</p>
                  </div>
                );
              })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "round" && (
        <div>
          {!currentCycle ? (
            <p style={{ color: COLORS.sub, fontSize: 14 }}>The ladder hasn't started yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {currentMatches.map((m) => {
                const a = getPlayer(m.playerA);
                const b = getPlayer(m.playerB);
                const isExpanded = expandedMatchId === m.id;
                return (
                  <div
                    key={m.id}
                    style={{ background: COLORS.card, border: `0.5px solid ${COLORS.line}`, borderRadius: 12, padding: "1rem 1.1rem" }}
                  >
                    {m.result === VOID ? (
                      <p style={{ fontSize: 13.5, margin: 0 }}>
                        <span style={{ color: COLORS.sub }}>{a.name} vs {b.name} — not played this round, ranks unchanged</span>
                      </p>
                    ) : m.result && m.result.startsWith(FORFEIT_PREFIX) ? (() => {
                      const forfeiterId = m.result.slice(FORFEIT_PREFIX.length);
                      const forfeiter = getPlayer(forfeiterId);
                      return (
                        <p style={{ fontSize: 13.5, margin: 0 }}>
                          <span style={{ color: COLORS.sub }}>
                            {a.name} vs {b.name} — forfeited by {forfeiter ? forfeiter.name : "?"}
                          </span>
                        </p>
                      );
                    })() : m.result ? (() => {
                      const sets = parseStoredScore(m.score);
                      const winnerIsA = m.result === a.id;
                      if (sets.length === 0) {
                        return (
                          <p style={{ fontSize: 13.5, margin: 0 }}>
                            <span style={{ fontWeight: 500, color: winnerIsA ? COLORS.ink : COLORS.sub }}>{a.name}</span>
                            {" vs "}
                            <span style={{ fontWeight: 500, color: !winnerIsA ? COLORS.ink : COLORS.sub }}>{b.name}</span>
                            <span style={{ color: COLORS.sub }}> · {getPlayer(m.result).name} won</span>
                          </p>
                        );
                      }
                      return (
                        <div>
                          {[a, b].map((pl, row) => {
                            const isWinnerRow = row === 0 ? winnerIsA : !winnerIsA;
                            return (
                              <div key={pl.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <p
                                  style={{
                                    flex: 1,
                                    margin: 0,
                                    fontSize: 13.5,
                                    fontWeight: isWinnerRow ? 500 : 400,
                                    color: isWinnerRow ? COLORS.ink : COLORS.sub,
                                  }}
                                >
                                  {pl.name}
                                </p>
                                {sets.map((s, idx) => {
                                  const mine = row === 0 ? s[0] : s[1];
                                  const theirs = row === 0 ? s[1] : s[0];
                                  return (
                                    <p
                                      key={idx}
                                      style={{
                                        width: 20,
                                        textAlign: "center",
                                        margin: 0,
                                        fontSize: 14,
                                        fontWeight: mine > theirs ? 600 : 400,
                                        color: mine > theirs ? COLORS.ink : COLORS.sub,
                                      }}
                                    >
                                      {mine}
                                    </p>
                                  );
                                })}
                                <span style={{ width: 16, textAlign: "center", color: COLORS.win, fontSize: 13 }}>
                                  {isWinnerRow ? "✓" : ""}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })() : isExpanded ? (
                      <div>
                        <p style={{ fontSize: 13.5, fontWeight: 500, margin: "0 0 12px" }}>
                          {a.name} vs {b.name}
                        </p>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr repeat(3, 40px)",
                            columnGap: 8,
                            rowGap: 8,
                            alignItems: "center",
                            marginBottom: 12,
                          }}
                        >
                          <div />
                          {["Set 1", "Set 2", "Tiebreak"].map((label, i) => (
                            <p key={i} style={{ fontSize: 11, color: COLORS.sub, margin: 0, textAlign: "center" }}>
                              {label}
                            </p>
                          ))}

                          <p style={{ fontSize: 13.5, fontWeight: 500, margin: 0 }}>{a.name}</p>
                          {[0, 1, 2].map((i) => (
                            <input
                              key={i}
                              type="text"
                              inputMode="numeric"
                              maxLength={2}
                                                            value={scoreSets[i].self}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^0-9]/g, "");
                                setScoreSets((prev) => prev.map((set, idx) => (idx === i ? { ...set, self: v } : set)));
                                setScoreError("");
                              }}
                              style={{
                                width: 40,
                                height: 40,
                                textAlign: "center",
                                padding: 0,
                                fontSize: 15,
                                fontWeight: 500,
                                background: COLORS.chalk,
                                border: `1.5px solid ${COLORS.courtMid}`,
                                borderRadius: 8,
                                color: COLORS.ink,
                                                              }}
                            />
                          ))}

                          <p style={{ fontSize: 13.5, fontWeight: 500, margin: 0 }}>{b.name}</p>
                          {[0, 1, 2].map((i) => (
                            <input
                              key={i}
                              type="text"
                              inputMode="numeric"
                              maxLength={2}
                                                            value={scoreSets[i].opp}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^0-9]/g, "");
                                setScoreSets((prev) => prev.map((set, idx) => (idx === i ? { ...set, opp: v } : set)));
                                setScoreError("");
                              }}
                              style={{
                                width: 40,
                                height: 40,
                                textAlign: "center",
                                padding: 0,
                                fontSize: 15,
                                fontWeight: 500,
                                background: COLORS.chalk,
                                border: `1.5px solid ${COLORS.courtMid}`,
                                borderRadius: 8,
                                color: COLORS.ink,
                                                              }}
                            />
                          ))}
                        </div>
                        {scoreError && (
                          <p style={{ fontSize: 12.5, color: COLORS.loss, margin: "0 0 8px" }}>{scoreError}</p>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            style={{ flex: 1, fontSize: 13 }}
                            onClick={() => {
                              setExpandedMatchId(null);
                              setScoreSets([{ self: "", opp: "" }, { self: "", opp: "" }, { self: "", opp: "" }]);
                              setScoreError("");
                              setVoidConfirmOpen(false);
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            style={{
                              flex: 2,
                              fontSize: 13,
                              background: COLORS.courtMid,
                              color: COLORS.chalk,
                              border: `0.5px solid ${COLORS.courtMid}`,
                            }}
                            onClick={() => {
                              const evaluated = evaluateSets(scoreSets);
                              if (!evaluated) {
                                setScoreError("Fill in at least one set clearly, with no ties.");
                                return;
                              }
                              const winnerId = evaluated.winner === "self" ? a.id : b.id;
                              logResult(m.id, winnerId, evaluated.scoreStr);
                              setExpandedMatchId(null);
                              setScoreSets([{ self: "", opp: "" }, { self: "", opp: "" }, { self: "", opp: "" }]);
                              setScoreError("");
                            }}
                          >
                            Confirm result ✓
                          </button>
                        </div>

                        {!voidConfirmOpen ? (
                          <div style={{ textAlign: "left" }}>
                            <button
                              onClick={() => setVoidConfirmOpen(true)}
                              style={{
                                marginTop: 10,
                                fontSize: 11.5,
                                color: COLORS.sub,
                                background: COLORS.chalk,
                                border: `0.5px solid ${COLORS.line}`,
                                borderRadius: 6,
                                padding: "4px 10px",
                                cursor: "pointer",
                              }}
                            >
                              Match not played
                            </button>
                          </div>
                        ) : (
                          <div style={{ marginTop: 10, background: COLORS.chalk, borderRadius: 8, padding: "0.7rem 0.8rem" }}>
                            <p style={{ fontSize: 12, color: COLORS.sub, margin: "0 0 8px" }}>
                              Both ranks stay unchanged. Are you sure?
                            </p>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button style={{ flex: 1, fontSize: 12 }} onClick={() => setVoidConfirmOpen(false)}>
                                Cancel
                              </button>
                              <button
                                style={{ flex: 1, fontSize: 12, background: COLORS.loss, color: COLORS.chalk, border: `0.5px solid ${COLORS.loss}` }}
                                onClick={() => {
                                  voidMatch(m.id);
                                  setExpandedMatchId(null);
                                  setVoidConfirmOpen(false);
                                }}
                              >
                                Confirm
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        onClick={() => {
                          setExpandedMatchId(m.id);
                          setScoreSets([{ self: "", opp: "" }, { self: "", opp: "" }, { self: "", opp: "" }]);
                          setScoreError("");
                          setVoidConfirmOpen(false);
                        }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                      >
                        <p style={{ fontSize: 13.5, fontWeight: 500, margin: 0 }}>
                          {a.name} vs {b.name}
                        </p>
                        <p style={{ fontSize: 12.5, color: COLORS.sub, margin: 0 }}>Enter score →</p>
                      </div>
                    )}
                    {adminUnlocked && m.result && (
                      <div style={{ marginTop: 8 }}>
                        {reopenConfirmId === m.id ? (
                          <div style={{ background: COLORS.chalk, borderRadius: 8, padding: "0.6rem 0.8rem" }}>
                            <p style={{ fontSize: 12, color: COLORS.sub, margin: "0 0 8px" }}>
                              Reopen this match so the score can be re-entered? The ladder is rebuilt from the start of the round.
                            </p>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button style={{ flex: 1, fontSize: 12 }} onClick={() => setReopenConfirmId(null)}>
                                Cancel
                              </button>
                              <button
                                style={{ flex: 1, fontSize: 12, background: COLORS.courtMid, color: COLORS.chalk, border: `0.5px solid ${COLORS.courtMid}` }}
                                onClick={() => {
                                  reopenResult(m.id);
                                  setReopenConfirmId(null);
                                }}
                              >
                                Reopen
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setReopenConfirmId(m.id)}
                            style={{
                              fontSize: 11.5,
                              color: COLORS.sub,
                              background: COLORS.chalk,
                              border: `0.5px solid ${COLORS.line}`,
                              borderRadius: 6,
                              padding: "4px 10px",
                              cursor: "pointer",
                            }}
                          >
                            Reopen result (admin)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {(currentCycle.awayIds.length > 0 || currentCycle.byePlayerId) && (
                <div style={{ fontSize: 12.5, color: COLORS.sub, padding: "4px 4px 0" }}>
                  {currentCycle.awayIds.length > 0 && (
                    <p style={{ margin: "0 0 2px" }}>
                      Away this round: {currentCycle.awayIds.map((id) => getPlayer(id)?.name).filter(Boolean).join(", ")}
                    </p>
                  )}
                  {currentCycle.byePlayerId && (
                    <p style={{ margin: 0 }}>Bye: {getPlayer(currentCycle.byePlayerId)?.name}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "rules" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            {
              title: "How the ladder works",
              body: [
                "This is a mixed singles ladder. The rules are simple: beat someone ranked above you and you take their spot, and everyone between shifts down one place. Beat someone below you and nothing changes.",
              ],
            },
            {
              title: "Matchups & scheduling",
              body: [
                "Every two weeks a new round is automatically generated. You'll be selected to play someone close to you on the ladder, avoiding players you've played recently. You arrange to play the match at a time that suits you both.",
              ],
            },
            {
              title: "Booking",
              body: [
                "Matches can be played either at the club or indoors at Tides/Deal Leisure Centre. Agree between you which to use, and one of you books the court.",
                "If you play at the Leisure Centre, the player who books pays for the court and the other player pays half the cost back to them before the match starts, ideally by bank transfer.",
                "If you cancel after the court has been paid for, you cover the other player's half, unless the court is refunded.",
              ],
            },
            {
              title: "If you're unavailable for a round",
              body: [
                "Before the new round has been generated, tap your name on the Ladder tab and tick \"unavailable for next round\". You'll be left out of that round's matchups.",
                "It's frustrating when a match falls through because two people can't agree a time, so if your schedule looks busy over the next couple of weeks, please consider marking yourself unavailable rather than being matched and not playing.",
              ],
            },
            {
              title: "If you can't agree a time",
              body: [
                "If you can't find a time that works, or bad weather or something else prevents you from playing, either of you can tap \"Match not played\" on your match card. Nobody's rank changes and you'll be matched with someone new next round.",
              ],
            },
            {
              title: "Byes",
              body: [
                "If there's an odd number of players in a round, one person sits out. It's rotated so it isn't always the same player.",
              ],
            },
            {
              title: "Logging a result",
              body: [
                "Go to 'This round' in the app, tap your match, and enter the result.",
                "If you make an error, tell the organiser before the end of the round and the result can be corrected. After the next round has started it can't be changed.",
              ],
            },
            {
              title: "Leaving the ladder",
              body: [
                "If it's too much of a commitment and you want to be removed, just let the organiser know. You'll be taken off the active ladder. You can rejoin whenever you like, but you'll start at the bottom of the ladder.",
              ],
            },
          ].map((section) => (
            <div
              key={section.title}
              style={{ background: COLORS.card, border: `0.5px solid ${COLORS.line}`, borderRadius: 12, padding: "1rem 1.1rem" }}
            >
              <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 6px" }}>{section.title}</p>
              {section.body.map((para, i) => (
                <p key={i} style={{ fontSize: 13.5, color: COLORS.sub, margin: i === 0 ? 0 : "8px 0 0", lineHeight: 1.5 }}>{para}</p>
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === "admin" && !adminUnlocked && (
        <div style={{ background: COLORS.card, border: `0.5px solid ${COLORS.line}`, borderRadius: 12, padding: "1.25rem 1.1rem" }}>
          <p style={{ fontSize: 13.5, color: COLORS.sub, margin: "0 0 10px" }}>
            Admin area — enter the organiser PIN to continue.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitPin()}
              placeholder="PIN"
              style={{ flex: 1 }}
            />
            <button style={{ fontSize: 13 }} onClick={submitPin}>
              Unlock
            </button>
          </div>
          {pinError && (
            <p style={{ fontSize: 12.5, color: COLORS.loss, margin: "10px 0 0" }}>{pinError}</p>
          )}
        </div>
      )}

      {tab === "admin" && adminUnlocked && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ background: COLORS.card, border: `0.5px solid ${COLORS.line}`, borderRadius: 12, padding: "1rem 1.1rem" }}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 10px" }}>Players ({state.players.length})</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                placeholder="Player name"
                style={{ flex: 1 }}
              />
              <button style={{ fontSize: 13 }} onClick={addPlayer}>
                Add
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <button style={{ fontSize: 12 }} onClick={() => { setBulkOpen(!bulkOpen); setBulkMsg(""); }}>
                {bulkOpen ? "Close list" : "Add from a list"}
              </button>
              {state.players.length > 0 && (
                <button style={{ fontSize: 12 }} onClick={copyLadder}>
                  Copy ladder (backup)
                </button>
              )}
            </div>
            {bulkOpen && (
              <div style={{ background: COLORS.chalk, borderRadius: 8, padding: "0.7rem 0.8rem", marginBottom: 10 }}>
                <p style={{ fontSize: 12, color: COLORS.sub, margin: "0 0 6px" }}>
                  One name per line, in ladder order (top first). Numbering like "1." is ignored.
                </p>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={8}
                  placeholder={"1. First name\n2. Second name\n3. ..."}
                  style={{ width: "100%", boxSizing: "border-box", fontSize: 13.5, fontFamily: "inherit" }}
                />
                <button style={{ fontSize: 13, marginTop: 8 }} onClick={addPlayersFromList}>
                  Add these players
                </button>
              </div>
            )}
            {bulkMsg && <p style={{ fontSize: 12.5, color: COLORS.sub, margin: "0 0 10px" }}>{bulkMsg}</p>}
            {backupText && (
              <div style={{ background: COLORS.chalk, borderRadius: 8, padding: "0.7rem 0.8rem", marginBottom: 10 }}>
                {backupMsg && <p style={{ fontSize: 12, color: COLORS.sub, margin: "0 0 6px" }}>{backupMsg}</p>}
                <textarea
                  readOnly
                  value={backupText}
                  rows={Math.min(10, backupText.split("\n").length + 1)}
                  onFocus={(e) => e.target.select()}
                  style={{ width: "100%", boxSizing: "border-box", fontSize: 13, fontFamily: "inherit" }}
                />
                <button style={{ fontSize: 12, marginTop: 6 }} onClick={() => { setBackupText(""); setBackupMsg(""); }}>
                  Hide
                </button>
              </div>
            )}
            {state.players.length > 0 && (
              <div>
                {state.players.map((p) =>
                  editingPlayerId === p.id ? (
                    <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 0" }}>
                      <input
                        type="text"
                        value={editNameValue}
                        onChange={(e) => setEditNameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            renamePlayer(p.id, editNameValue);
                            setEditingPlayerId(null);
                          }
                          if (e.key === "Escape") setEditingPlayerId(null);
                        }}
                        autoFocus
                        style={{ flex: 1, fontSize: 13.5 }}
                      />
                      <button
                        style={{ fontSize: 12, padding: "2px 8px" }}
                        onClick={() => {
                          renamePlayer(p.id, editNameValue);
                          setEditingPlayerId(null);
                        }}
                      >
                        Save
                      </button>
                      <button style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => setEditingPlayerId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", fontSize: 13.5, gap: 6 }}>
                      <span style={{ color: p.active === false ? COLORS.sub : COLORS.ink, flex: 1 }}>
                        {p.name}
                        {p.active === false && " (left the ladder)"}
                      </span>
                      <button
                        style={{ fontSize: 12, padding: "2px 8px" }}
                        onClick={() => {
                          setEditingPlayerId(p.id);
                          setEditNameValue(p.name);
                        }}
                      >
                        Edit
                      </button>
                      {!state.seeded && (
                        <button style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => removePlayer(p.id)}>
                          Remove
                        </button>
                      )}
                      {state.seeded && p.active !== false && (
                        <button style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => setPlayerActive(p.id, false)}>
                          Mark as left
                        </button>
                      )}
                      {state.seeded && p.active === false && (
                        <button style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => setPlayerActive(p.id, true)}>
                          Reinstate
                        </button>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {!state.seeded ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => startLadder(true)}>Start ladder (in the order added)</button>
              <button onClick={() => startLadder(false)}>Start ladder (random order)</button>
            </div>
          ) : !currentCycle ? (
            <button onClick={generateNextCycle} style={{ width: "100%" }}>
              Generate round 1
            </button>
          ) : (
            <div style={{ background: COLORS.card, border: `0.5px solid ${COLORS.line}`, borderRadius: 12, padding: "1rem 1.1rem" }}>
              <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 10px" }}>
                Cycle {currentCycle.number}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div style={{ background: COLORS.chalk, borderRadius: 8, padding: "10px" }}>
                  <p style={{ fontSize: 11.5, color: COLORS.sub, margin: "0 0 2px" }}>Players</p>
                  <p style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>{state.players.length}</p>
                </div>
                <div style={{ background: COLORS.chalk, borderRadius: 8, padding: "10px" }}>
                  <p style={{ fontSize: 11.5, color: COLORS.sub, margin: "0 0 2px" }}>Marked away (next)</p>
                  <p style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>{(state.pendingAway || []).length}</p>
                </div>
                <div style={{ background: COLORS.chalk, borderRadius: 8, padding: "10px" }}>
                  <p style={{ fontSize: 11.5, color: COLORS.sub, margin: "0 0 2px" }}>Results pending</p>
                  <p style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>{currentMatches.filter((m) => !m.result).length}</p>
                </div>
              </div>
              <button onClick={generateNextCycle} style={{ width: "100%" }}>
                Generate next round
              </button>
            </div>
          )}

          {currentCycle && (
            <div style={{ background: COLORS.card, border: `0.5px solid ${COLORS.line}`, borderRadius: 12, padding: "1rem 1.1rem" }}>
              <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 4px" }}>Round recap</p>
              <p style={{ fontSize: 12.5, color: COLORS.sub, margin: "0 0 10px" }}>
                Copy this and paste it into a chat with Claude, asking it to turn it into a short, fun recap for your WhatsApp group.
              </p>
              {!showSummary ? (
                <button style={{ width: "100%", fontSize: 13 }} onClick={() => setShowSummary(true)}>
                  Show round summary
                </button>
              ) : (
                <div>
                  <textarea
                    readOnly
                    value={buildRoundSummary()}
                    onClick={(e) => e.target.select()}
                    style={{
                      width: "100%",
                      height: 160,
                      fontSize: 12.5,
                      fontFamily: "inherit",
                      color: COLORS.ink,
                      background: COLORS.chalk,
                      border: `0.5px solid ${COLORS.line}`,
                      borderRadius: 8,
                      padding: "0.6rem 0.7rem",
                      marginBottom: 8,
                      resize: "vertical",
                    }}
                  />
                  <p style={{ fontSize: 11.5, color: COLORS.sub, margin: 0 }}>Tap the text to select it all, then copy.</p>
                </div>
              )}
            </div>
          )}

          {!resetConfirming ? (
            <button
              onClick={() => setResetConfirming(true)}
              style={{ fontSize: 12.5, color: COLORS.loss, borderColor: COLORS.loss }}
            >
              Reset all data
            </button>
          ) : (
            <div style={{ background: "#FBEAE6", border: `0.5px solid ${COLORS.loss}`, borderRadius: 12, padding: "0.9rem 1rem" }}>
              <p style={{ fontSize: 13, color: COLORS.loss, margin: "0 0 10px" }}>
                This clears every player, cycle and result for everyone. Are you sure?
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ flex: 1, fontSize: 12.5 }} onClick={() => setResetConfirming(false)}>
                  Cancel
                </button>
                <button
                  style={{ flex: 1, fontSize: 12.5, background: COLORS.loss, color: COLORS.chalk, border: `0.5px solid ${COLORS.loss}` }}
                  onClick={resetAll}
                >
                  Yes, reset everything
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
