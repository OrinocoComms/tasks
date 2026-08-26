import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

const COLORS = {
  court: "#1B3A26",
  courtMid: "#2C5236",
  courtStripe: "#234630",
  chalk: "#FBFBF8",
  card: "#FFFFFF",
  brass: "#B08D57",
  brassLight: "#DCC48F",
  ink: "#1B211D",
  sub: "#5B655C",
  line: "#E4E3DA",
  win: "#2E7D46",
  loss: "#B5442E",
  away: "#8A8578",
};

const ADMIN_PIN = "1234"; // change this to whatever PIN you want to share with the coach/organiser
const VOID = "void"; // match.result value meaning "not played, nobody's rank changes"
const FORFEIT_PREFIX = "forfeit:"; // match.result = FORFEIT_PREFIX + id of the player who forfeited

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
  const [forfeitPick, setForfeitPick] = useState(null);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [newName, setNewName] = useState("");
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

  function addPlayer() {
    const name = newName.trim();
    if (!name) return;
    const id = "p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    save({
      ...state,
      players: [
        ...state.players,
        { id, name, rank: state.players.length + 1, active: true, byeCount: 0 },
      ],
    });
    setNewName("");
    setNotice("");
  }

  function removePlayer(id) {
    save({ ...state, players: state.players.filter((p) => p.id !== id) });
  }

  function setPlayerActive(id, active) {
    save({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, active } : p)) });
  }

  function renamePlayer(id, newName) {
    const name = newName.trim();
    if (!name) return;
    save({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, name } : p)) });
  }

  function voidMatch(matchId) {
    const nextMatches = state.matches.map((m) => (m.id === matchId ? { ...m, result: VOID, score: "", loggedAt: Date.now() } : m));
    save({ ...state, matches: nextMatches });
  }

  function forfeitMatch(matchId, forfeitingPlayerId) {
    const match = state.matches.find((m) => m.id === matchId);
    if (!match || match.result) return;
    const otherPlayerId = match.playerA === forfeitingPlayerId ? match.playerB : match.playerA;
    const forfeiter = getPlayer(forfeitingPlayerId);
    const other = getPlayer(otherPlayerId);
    if (!forfeiter || !other) return;
    const nextPlayers = state.players.map((p) => {
      if (p.id === forfeitingPlayerId) return { ...p, rank: other.rank };
      if (p.id === otherPlayerId) return { ...p, rank: forfeiter.rank };
      return p;
    });
    const nextMatches = state.matches.map((m) =>
      m.id === matchId ? { ...m, result: FORFEIT_PREFIX + forfeitingPlayerId, score: "", loggedAt: Date.now() } : m
    );
    save({ ...state, players: nextPlayers, matches: nextMatches });
  }

  function buildRoundSummary() {
    if (!currentCycle) return "";
    const lines = [];
    lines.push(`Round ${currentCycle.number} recap — Walmer Autumn/Winter Tennis Ladder`);
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
        lines.push(`- ${a.name} vs ${b.name}: forfeited by ${forfeiter ? forfeiter.name : "?"}, positions swapped.`);
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

  function startLadder() {
    if (state.players.length < 2) {
      setNotice("Add at least 2 players first.");
      return;
    }
    const shuffled = shuffle(state.players).map((p, i) => ({ ...p, rank: i + 1 }));
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
      candidates.sort((a, b) => Math.abs(a.rank - player.rank) - Math.abs(b.rank - player.rank));
      const opponent = candidates[0];
      pool = pool.filter((p) => p.id !== opponent.id);
      newMatches.push({
        id: "m_" + cycleId + "_" + newMatches.length,
        cycleId,
        playerA: player.id,
        playerB: opponent.id,
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
          background: `repeating-linear-gradient(115deg, ${COLORS.court} 0px, ${COLORS.court} 22px, ${COLORS.courtStripe} 22px, ${COLORS.courtStripe} 44px)`,
          borderRadius: 12,
          padding: "1.15rem 1.25rem",
          marginBottom: "1rem",
          position: "relative",
        }}
      >
        <button
          onClick={() => setTab("admin")}
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            background: "none",
            border: "none",
            color: tab === "admin" ? COLORS.brassLight : "rgba(251,251,248,0.4)",
            fontSize: 11,
            cursor: "pointer",
            padding: 4,
          }}
          aria-label="Admin"
        >
          Admin
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              border: `1px solid ${COLORS.brass}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              background: "rgba(0,0,0,0.12)",
            }}
          >
            <span style={{ color: COLORS.brassLight, fontSize: 11, fontWeight: 500, letterSpacing: 0.5 }}>
              WLTCC
            </span>
          </div>
          <div>
            <p style={{ color: COLORS.brassLight, fontSize: 11, margin: 0, letterSpacing: 0.6, textTransform: "uppercase" }}>
              Walmer Lawn Tennis &amp; Croquet Club
            </p>
            <p
              style={{
                color: COLORS.chalk,
                fontSize: 21,
                fontWeight: 600,
                margin: "2px 0 0",
                fontFamily: "'Oswald', 'Inter', sans-serif",
                letterSpacing: 0.3,
              }}
            >
              Autumn/Winter Tennis Ladder 2026/2027
            </p>
            <p style={{ color: "rgba(251,251,248,0.65)", fontSize: 12.5, margin: "3px 0 0" }}>
              {currentCycle
                ? `Cycle ${currentCycle.number} · ${currentMatches.filter((m) => m.result).length}/${currentMatches.length} logged`
                : "Not started yet"}
            </p>
          </div>
        </div>
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
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={(state.pendingAway || []).includes(p.id)}
                      onChange={() => toggleAway(p.id)}
                    />
                    Mark {p.name} unavailable for the next round
                  </label>
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
                            {a.name} vs {b.name} — forfeited by {forfeiter ? forfeiter.name : "?"}, positions swapped
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
                            gridTemplateColumns: "1fr repeat(3, 40px) 44px",
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
                          <p style={{ fontSize: 11, color: COLORS.sub, margin: 0, textAlign: "center" }}>Forfeit</p>

                          <p style={{ fontSize: 13.5, fontWeight: 500, margin: 0, opacity: forfeitPick ? 0.4 : 1 }}>{a.name}</p>
                          {[0, 1, 2].map((i) => (
                            <input
                              key={i}
                              type="text"
                              inputMode="numeric"
                              maxLength={2}
                              disabled={!!forfeitPick}
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
                                opacity: forfeitPick ? 0.4 : 1,
                              }}
                            />
                          ))}
                          <div style={{ display: "flex", justifyContent: "center" }}>
                            <input
                              type="checkbox"
                              checked={forfeitPick === a.id}
                              onChange={() => setForfeitPick(forfeitPick === a.id ? null : a.id)}
                            />
                          </div>

                          <p style={{ fontSize: 13.5, fontWeight: 500, margin: 0, opacity: forfeitPick ? 0.4 : 1 }}>{b.name}</p>
                          {[0, 1, 2].map((i) => (
                            <input
                              key={i}
                              type="text"
                              inputMode="numeric"
                              maxLength={2}
                              disabled={!!forfeitPick}
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
                                opacity: forfeitPick ? 0.4 : 1,
                              }}
                            />
                          ))}
                          <div style={{ display: "flex", justifyContent: "center" }}>
                            <input
                              type="checkbox"
                              checked={forfeitPick === b.id}
                              onChange={() => setForfeitPick(forfeitPick === b.id ? null : b.id)}
                            />
                          </div>
                        </div>
                        {forfeitPick && (
                          <p style={{ fontSize: 12, color: COLORS.sub, margin: "0 0 10px" }}>
                            {getPlayer(forfeitPick)?.name} forfeits — no win or loss recorded, ranks simply swap.
                          </p>
                        )}
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
                              setForfeitPick(null);
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
                              if (forfeitPick) {
                                forfeitMatch(m.id, forfeitPick);
                                setExpandedMatchId(null);
                                setForfeitPick(null);
                                setScoreSets([{ self: "", opp: "" }, { self: "", opp: "" }, { self: "", opp: "" }]);
                                setScoreError("");
                                return;
                              }
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
                            {forfeitPick ? "Confirm forfeit ✓" : "Confirm result ✓"}
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
                                  setForfeitPick(null);
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
                          setForfeitPick(null);
                        }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                      >
                        <p style={{ fontSize: 13.5, fontWeight: 500, margin: 0 }}>
                          {a.name} vs {b.name}
                        </p>
                        <p style={{ fontSize: 12.5, color: COLORS.sub, margin: 0 }}>Enter score →</p>
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
              body: "Everyone starts in a random order — no ranking needed to join. Beat someone ranked above you and you take their spot; everyone between shifts down one place. Beat someone below you and nothing changes, since that's expected.",
            },
            {
              title: "How matchups are chosen",
              body: "Each round, you're paired with someone ranked close to you where possible, and the pairing avoids opponents you've played in the last couple of rounds so it doesn't become the same rematch. If the group is small, the range widens automatically so everyone gets a game.",
            },
            {
              title: "If you can't play",
              body: "Tap your name on the Ladder tab and tick \"mark unavailable for the next round.\" You'll be left out of that round's matchups and your rank stays exactly where it is — no penalty for being away.",
            },
            {
              title: "Byes",
              body: "If there's an odd number of players available in a round, one person sits out. It's rotated so it isn't always the same player.",
            },
            {
              title: "Logging a result",
              body: "Head to This round, tap your match, and enter the games won per set. The app works out the winner from the score — there's no separate \"I won\" button.",
            },
            {
              title: "If a match can't be played",
              body: "If you genuinely can't find a time between you, mark the match as \"not played\" in This round — neither rank changes, and you'll both get a new opponent next round. If one of you is happy to concede instead — say, you can't make it and would rather give up the match than reschedule — use the forfeit option in the score entry: tick the box next to the conceding player's name and confirm. It won't count as a win or loss for either of you, but your two ladder positions simply swap. If you're not sure which fits, check with the organiser.",
            },
            {
              title: "Leaving the ladder",
              body: "If it's too much of a commitment, just let the organiser know — you'll be taken off the active ladder and won't be matched in future rounds. Your past results stay on record, but you'll no longer appear on the current standings.",
            },
          ].map((section) => (
            <div
              key={section.title}
              style={{ background: COLORS.card, border: `0.5px solid ${COLORS.line}`, borderRadius: 12, padding: "1rem 1.1rem" }}
            >
              <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 6px" }}>{section.title}</p>
              <p style={{ fontSize: 13.5, color: COLORS.sub, margin: 0, lineHeight: 1.5 }}>{section.body}</p>
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
            <button onClick={startLadder}>Start ladder (random seeding)</button>
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
