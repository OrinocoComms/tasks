import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase.js";

const LOCAL_KEY = "tasks_orinoco_v5";
function loadLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch { return []; } }
function saveLocal(t) { localStorage.setItem(LOCAL_KEY, JSON.stringify(t)); }
function genId() { return crypto.randomUUID(); }

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
function todayStr() { return new Date().toISOString().slice(0, 10); }
function formatTime(m) { if (!m) return null; if (m < 60) return `${m}m`; const h = Math.floor(m/60), r = m%60; return r ? `${h}h ${r}m` : `${h}h`; }
function isThisWeek(s) { if (!s) return false; const d = new Date(s+"T00:00:00"), t = new Date(); t.setHours(0,0,0,0); const e = new Date(t); e.setDate(t.getDate()+7); return d >= t && d < e; }
function isToday(s) { return s === todayStr(); }
function isTomorrow(s) {
  if (!s) return false;
  const t = new Date(); t.setHours(0,0,0,0);
  const tom = new Date(t); tom.setDate(t.getDate()+1);
  const tomStr = tom.getFullYear()+"-"+String(tom.getMonth()+1).padStart(2,"0")+"-"+String(tom.getDate()).padStart(2,"0");
  return s === tomStr;
}
function isOverdue(s) { if (!s) return false; return s < todayStr(); }
function daysOverdue(s) { if (!s) return 0; const d = new Date(s+"T00:00:00"), t = new Date(); t.setHours(0,0,0,0); return Math.round((t-d)/86400000); }
function sortTasks(arr) {
  return [...arr].sort((a,b) => {
    const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (pd) return pd;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1; if (b.due_date) return 1; return 0;
  });
}

const CTX = {
  orinoco:  { bg: "#4DA3C9", bgDeep: "#1E5C91", label: "Orinoco" },
  personal: { bg: "#5B7FA6", bgDeep: "#2D4F72", label: "Personal" },
};

const PROJ_ACCENTS = [
  { dot:"#4DA3C9", bg:"rgba(77,163,201,0.10)",  border:"rgba(77,163,201,0.28)"  },
  { dot:"#E9A9A1", bg:"rgba(233,169,161,0.14)", border:"rgba(233,169,161,0.35)" },
  { dot:"#2FA859", bg:"rgba(47,168,89,0.10)",   border:"rgba(47,168,89,0.28)"   },
  { dot:"#1E5C91", bg:"rgba(30,92,145,0.10)",   border:"rgba(30,92,145,0.28)"   },
  { dot:"#B8860B", bg:"rgba(184,134,11,0.10)",  border:"rgba(184,134,11,0.28)"  },
  { dot:"#9A6B8A", bg:"rgba(154,107,138,0.10)", border:"rgba(154,107,138,0.28)" },
];

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Archivo+Black&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  :root{
    --blue:#4DA3C9;--blue-pale:#DCE8EF;--blue-deep:#1E5C91;
    --ink:#102A43;--ink-soft:#3A4A5C;--muted:#6A7887;
    --paper:#F6F1EB;--white:#FFFFFF;--leaf:#2FA859;
    --rule:rgba(16,42,67,0.10);--rule-med:rgba(16,42,67,0.18);
    --overdue-bg:#FEF2F0;--overdue-border:rgba(192,57,43,0.20);
    --overdue-text:#C0392B;--overdue-accent:#E74C3C;
    --high:#C0392B;--high-bg:rgba(192,57,43,0.08);
    --med:#B8860B;--med-bg:rgba(184,134,11,0.08);
    --low:#2FA859;--low-bg:rgba(47,168,89,0.08);
    --font-display:'Archivo Black','Montserrat',sans-serif;
    --font-sans:'Montserrat',system-ui,sans-serif;
    --shadow-1:0 1px 3px rgba(16,42,67,0.07);
    --shadow-2:0 6px 20px rgba(16,42,67,0.09);
    --shadow-3:0 14px 40px rgba(16,42,67,0.13);
    --radius:6px;--radius-pill:999px;--tab-h:90px;
    --ease:cubic-bezier(0.22,1,0.36,1);
  }
  html,body,#root{height:100%;}
  body{font-family:var(--font-sans);background:var(--paper);color:var(--ink);-webkit-font-smoothing:antialiased;overflow:hidden;}
  .app{display:flex;flex-direction:column;height:100dvh;width:100%;max-width:640px;margin:0 auto;position:relative;background:var(--paper);overflow:hidden;}

  /* Header */
  .today-header{flex-shrink:0;padding:16px 20px 0;box-shadow:var(--shadow-2);transition:background 300ms var(--ease);}
  .today-header-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
  .wordmark-name{font-family:var(--font-display);font-size:18px;color:var(--white);letter-spacing:-0.01em;}
  .ctx-toggle{display:flex;background:rgba(0,0,0,0.18);border-radius:var(--radius-pill);padding:3px;gap:2px;}
  .ctx-btn{font-family:var(--font-sans);font-size:11px;font-weight:700;letter-spacing:0.03em;padding:5px 14px;border-radius:var(--radius-pill);border:none;background:transparent;color:rgba(255,255,255,0.65);cursor:pointer;transition:all 200ms var(--ease);white-space:nowrap;}
  .ctx-btn.active{background:var(--white);}
  .header-bottom{display:flex;align-items:center;justify-content:space-between;padding-bottom:13px;}
  .date-info{display:flex;flex-direction:column;gap:1px;}
  .date-label{font-size:10px;font-weight:600;color:rgba(255,255,255,0.65);letter-spacing:0.08em;text-transform:uppercase;}
  .date-remaining{font-size:11px;font-weight:700;color:rgba(255,255,255,0.9);margin-top:1px;}
  .header-right{display:flex;align-items:center;gap:8px;}
  .done-badge{font-size:11px;font-weight:700;background:rgba(255,255,255,0.18);color:rgba(255,255,255,0.9);padding:3px 10px;border-radius:var(--radius-pill);}
  .done-badge.has-done{background:var(--leaf);color:var(--white);}
  .btn-new-white{display:flex;align-items:center;padding:0 14px;height:30px;border-radius:var(--radius-pill);border:none;background:var(--white);font-family:var(--font-sans);font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;transition:all 200ms var(--ease);box-shadow:var(--shadow-1);}
  .btn-new-white:hover{background:var(--blue-pale);}

  /* Plain header */
  .plain-header{flex-shrink:0;background:var(--white);padding:14px 16px 13px;border-bottom:1px solid var(--rule);display:flex;align-items:center;justify-content:space-between;box-shadow:var(--shadow-1);gap:8px;}
  .plain-header-left{display:flex;flex-direction:column;gap:3px;}
  .plain-title{font-family:var(--font-display);font-size:16px;color:var(--ink);}
  .plain-ctx-label{font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);}
  .projects-ctx-bar{display:flex;align-items:center;gap:6px;flex-shrink:0;}
  .ctx-toggle-dark{display:flex;background:rgba(16,42,67,0.08);border-radius:var(--radius-pill);padding:3px;gap:2px;}
  .ctx-btn-dark{font-family:var(--font-sans);font-size:11px;font-weight:700;letter-spacing:0.03em;padding:5px 12px;border-radius:var(--radius-pill);border:none;background:transparent;color:var(--muted);cursor:pointer;transition:all 200ms var(--ease);white-space:nowrap;}
  .btn-new-ink{display:flex;align-items:center;padding:0 14px;height:30px;border-radius:var(--radius-pill);border:none;color:var(--white);font-family:var(--font-sans);font-size:12px;font-weight:700;cursor:pointer;transition:opacity 200ms;}
  .btn-new-ink:hover{opacity:0.85;}

  /* Project header */
  .proj-header{flex-shrink:0;background:var(--white);padding:14px 20px;border-bottom:1px solid var(--rule);display:flex;align-items:center;gap:12px;box-shadow:var(--shadow-1);}
  .proj-back{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:1.5px solid var(--rule-med);border-radius:var(--radius);background:transparent;color:var(--ink-soft);cursor:pointer;font-size:14px;transition:all 200ms var(--ease);}
  .proj-back:hover{border-color:var(--blue);color:var(--blue);}
  .proj-header-info{flex:1;min-width:0;}
  .proj-header-name{font-size:15px;font-weight:800;line-height:1.2;}
  .proj-header-sub{font-size:11px;font-weight:500;color:var(--muted);margin-top:2px;}

  /* Lists */
  .list-wrap{flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(16,42,67,0.15) transparent;padding:0 0 calc(var(--tab-h) + env(safe-area-inset-bottom) + 16px);}

  /* Overdue */
  .overdue-block{background:var(--overdue-bg);border-bottom:1px solid var(--overdue-border);padding:0 20px;}
  .overdue-header{display:flex;align-items:center;gap:8px;padding:12px 0 10px;border-bottom:1px solid var(--overdue-border);}
  .overdue-icon{width:18px;height:18px;border-radius:50%;background:var(--overdue-accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .overdue-icon::after{content:'!';color:white;font-size:11px;font-weight:800;}
  .overdue-title-label{font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:var(--overdue-text);flex:1;}
  .overdue-count{font-size:10px;font-weight:700;color:var(--overdue-accent);background:rgba(231,76,60,0.12);padding:2px 8px;border-radius:var(--radius-pill);}

  /* Sections */
  .section-block{padding:0 20px;border-bottom:1px solid var(--rule);}
  .section-block:last-child{border-bottom:none;}
  .section-header{display:flex;align-items:center;justify-content:space-between;padding:14px 0 2px;}
  .section-title{font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);}
  .section-show-more{font-size:10px;font-weight:700;color:var(--blue);background:none;border:none;cursor:pointer;padding:0;}

  /* Task rows */
  .task-row{display:flex;align-items:flex-start;gap:12px;padding:11px 0;border-bottom:1px solid var(--rule);animation:rowIn 0.2s var(--ease);}
  .task-row:last-child{border-bottom:none;}
  .overdue-block .task-row{border-bottom-color:var(--overdue-border);}
  .overdue-block .task-row:last-child{border-bottom:none;}
  @keyframes rowIn{from{opacity:0;transform:translateY(-3px);}to{opacity:1;transform:translateY(0);}}

  /* Subtask rows — indented */
  .subtask-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0 8px 28px;border-bottom:1px solid var(--rule);animation:rowIn 0.2s var(--ease);}
  .subtask-row:last-child{border-bottom:none;}

  .check-btn{width:19px;height:19px;border-radius:50%;border:2px solid var(--rule-med);background:transparent;cursor:pointer;flex-shrink:0;margin-top:1px;transition:all 200ms var(--ease);display:flex;align-items:center;justify-content:center;}
  .check-btn:hover{border-color:var(--leaf);}
  .check-btn.checked{background:var(--leaf);border-color:var(--leaf);}
  .check-btn.checked::after{content:'';width:5px;height:8px;border:2px solid #fff;border-top:none;border-left:none;transform:rotate(45deg) translateY(-1px);display:block;}
  .check-btn.urgent{border-color:var(--overdue-accent);}
  .check-btn.urgent:hover{background:var(--overdue-accent);border-color:var(--overdue-accent);}
  .check-btn.small{width:15px;height:15px;margin-top:2px;}

  .task-body{flex:1;min-width:0;cursor:pointer;}
  .task-title{font-size:14px;font-weight:600;line-height:1.4;color:var(--ink);word-break:break-word;}
  .task-title.done{text-decoration:line-through;color:var(--muted);font-weight:500;}
  .task-title.overdue-title-text{color:var(--overdue-text);}
  .task-title.subtask{font-size:13px;font-weight:500;}

  .task-meta{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:4px;}
  .p-indicator{font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;padding:2px 7px;border-radius:var(--radius-pill);}
  .p-indicator.high{color:var(--high);background:var(--high-bg);}
  .p-indicator.medium{color:var(--med);background:var(--med-bg);}
  .p-indicator.low{color:var(--low);background:var(--low-bg);}
  .overdue-days{font-size:10px;font-weight:800;color:var(--overdue-accent);letter-spacing:0.04em;}
  .meta-txt{font-size:11px;font-weight:500;color:var(--muted);}
  .proj-pill{font-size:10px;font-weight:700;padding:2px 8px;border-radius:var(--radius-pill);letter-spacing:0.03em;cursor:pointer;transition:filter 150ms;border:none;font-family:inherit;}
  .proj-pill:hover{filter:brightness(0.88);text-decoration:underline;}
  .tag-chip{font-size:10px;font-weight:600;padding:2px 8px;border-radius:var(--radius-pill);background:var(--blue-pale);color:var(--blue-deep);border:1px solid rgba(77,163,201,0.22);}

  /* Parent label on subtask in Today view */
  .parent-label{font-size:10px;font-weight:700;color:var(--muted);letter-spacing:0.03em;display:flex;align-items:center;gap:4px;margin-top:3px;}
  .parent-label-arrow{opacity:0.5;font-size:9px;}

  /* Subtask progress on parent */
  .subtask-progress{font-size:10px;font-weight:700;color:var(--muted);display:flex;align-items:center;gap:5px;}
  .subtask-progress-bar{height:3px;background:var(--rule);border-radius:2px;overflow:hidden;width:40px;}
  .subtask-progress-fill{height:100%;border-radius:2px;background:var(--leaf);transition:width 0.3s var(--ease);}

  .row-actions{display:flex;gap:2px;opacity:0;transition:opacity 0.14s;}
  .task-row:hover .row-actions{opacity:1;}
  .subtask-row:hover .row-actions{opacity:1;}
  @media(hover:none){.row-actions{opacity:1;}}

  .act-btn{width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--muted);cursor:pointer;border-radius:var(--radius);font-size:13px;transition:all 0.14s;}
  .act-btn:hover{background:var(--blue-pale);color:var(--blue-deep);}
  .act-btn.del:hover{background:var(--high-bg);color:var(--high);}

  .completed-strip{padding:0 20px;}
  .arch-toggle{display:inline-flex;align-items:center;gap:7px;padding:12px 0 4px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);cursor:pointer;user-select:none;}
  .arch-toggle:hover{color:var(--ink-soft);}

  /* Empty */
  .empty-today{padding:40px 20px;text-align:center;}
  .empty-today-icon{width:52px;height:52px;border-radius:50%;background:var(--low-bg);border:2px solid var(--low);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:22px;color:var(--low);}
  .empty-today-msg{font-size:15px;font-weight:800;color:var(--ink);margin-bottom:5px;}
  .empty-today-sub{font-size:12px;font-weight:500;color:var(--muted);}
  .empty{padding:52px 20px;text-align:center;font-size:13px;font-weight:600;color:var(--muted);}

  /* Projects */
  .projects-wrap{flex:1;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:rgba(16,42,67,0.15) transparent;padding:16px 16px calc(var(--tab-h) + env(safe-area-inset-bottom) + 16px);}
  .projects-eyebrow{font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);margin-bottom:14px;}
  .projects-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;}
  .proj-tile{border-radius:var(--radius);border:1px solid var(--rule);background:var(--white);padding:18px 16px 16px;cursor:pointer;transition:all 200ms var(--ease);position:relative;overflow:hidden;box-shadow:var(--shadow-1);}
  .proj-tile::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--tile-accent,var(--blue));border-radius:var(--radius) var(--radius) 0 0;}
  .proj-tile:hover{box-shadow:var(--shadow-2);transform:translateY(-2px);}
  .proj-tile:active{transform:translateY(0);box-shadow:var(--shadow-1);}
  .proj-tile-name{font-size:13px;font-weight:800;color:var(--ink);line-height:1.25;margin-bottom:10px;word-break:break-word;}
  .proj-tile-stats{display:flex;gap:12px;margin-bottom:12px;}
  .proj-tile-stat{font-size:10px;font-weight:600;color:var(--muted);}
  .proj-tile-stat strong{display:block;font-size:18px;font-weight:800;color:var(--ink);line-height:1;margin-bottom:1px;}
  .proj-tile-bar{height:3px;background:var(--rule);border-radius:2px;overflow:hidden;}
  .proj-tile-bar-fill{height:100%;border-radius:2px;transition:width 0.5s var(--ease);}
  .proj-overdue{position:absolute;top:12px;right:12px;font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--overdue-text);background:var(--high-bg);padding:2px 6px;border-radius:var(--radius-pill);}
  .solo-section{margin-top:24px;}
  .solo-label{font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;padding-bottom:8px;border-bottom:1px solid var(--rule);}

  /* Tab bar */
  .tab-bar{position:absolute;bottom:0;left:0;right:0;height:calc(var(--tab-h) + env(safe-area-inset-bottom));background:var(--white);border-top:1px solid var(--rule);display:flex;z-index:100;box-shadow:0 -4px 16px rgba(16,42,67,0.06);padding-bottom:env(safe-area-inset-bottom);}
  .tab-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:none;background:transparent;cursor:pointer;color:var(--muted);transition:color 200ms var(--ease);padding-bottom:4px;position:relative;}
  .tab-btn::after{content:'';position:absolute;top:0;left:50%;transform:translateX(-50%);width:0;height:2px;background:var(--blue);border-radius:0 0 2px 2px;transition:width 200ms var(--ease);}
  .tab-btn.active{color:var(--blue-deep);}
  .tab-btn.active::after{width:32px;}
  .tab-icon{font-size:26px;line-height:1;}
  .tab-label{font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;}
  .tab-badge{position:absolute;top:8px;right:calc(50% - 16px);width:7px;height:7px;border-radius:50%;background:var(--overdue-accent);border:1.5px solid var(--white);}

  /* Task detail modal */
  .overlay{position:fixed;inset:0;background:rgba(16,42,67,0.45);backdrop-filter:blur(4px);z-index:300;display:flex;align-items:flex-end;justify-content:center;animation:ovIn 0.18s ease;}
  @keyframes ovIn{from{opacity:0;}to{opacity:1;}}
  .modal{background:var(--white);border-radius:16px 16px 0 0;width:100%;max-width:640px;max-height:88vh;overflow-y:auto;padding:24px 24px 40px;animation:modUp 0.25s var(--ease);box-shadow:var(--shadow-3);}
  @keyframes modUp{from{transform:translateY(32px);opacity:0;}to{transform:translateY(0);opacity:1;}}
  .modal-head{font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--rule);}
  .field{margin-bottom:16px;}
  .field-label{display:block;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:6px;}
  .field-input{width:100%;font-family:var(--font-sans);font-size:14px;font-weight:500;color:var(--ink);background:var(--paper);border:1px solid rgba(16,42,67,0.18);border-radius:var(--radius);padding:10px 12px;outline:none;transition:border-color 200ms,box-shadow 200ms;appearance:none;}
  .field-input:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(77,163,201,0.18);background:var(--white);}
  .field-input::placeholder{color:var(--muted);font-weight:400;}
  textarea.field-input{resize:vertical;min-height:72px;line-height:1.5;}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .p-opts{display:flex;gap:8px;}
  .p-opt{flex:1;padding:9px 0;border-radius:var(--radius-pill);border:1.5px solid var(--rule-med);background:transparent;font-family:var(--font-sans);font-size:11px;font-weight:700;cursor:pointer;text-align:center;color:var(--muted);transition:all 200ms var(--ease);}
  .p-opt:hover{border-color:var(--ink-soft);color:var(--ink);}
  .p-opt.high.on{border-color:var(--high);background:var(--high-bg);color:var(--high);}
  .p-opt.medium.on{border-color:var(--med);background:var(--med-bg);color:var(--med);}
  .p-opt.low.on{border-color:var(--low);background:var(--low-bg);color:var(--low);}
  .ctx-opts{display:flex;gap:8px;}
  .ctx-opt{flex:1;padding:9px 0;border-radius:var(--radius-pill);border:1.5px solid var(--rule-med);background:transparent;font-family:var(--font-sans);font-size:11px;font-weight:700;cursor:pointer;text-align:center;color:var(--muted);transition:all 200ms var(--ease);}
  .ctx-opt.orinoco.on{border-color:#4DA3C9;background:rgba(77,163,201,0.10);color:#1E5C91;}
  .ctx-opt.personal.on{border-color:#5B7FA6;background:rgba(91,127,166,0.10);color:#2D4F72;}
  .modal-actions{display:flex;gap:10px;margin-top:22px;}
  .btn-primary{flex:1;padding:12px;border-radius:var(--radius-pill);border:none;color:var(--white);font-family:var(--font-sans);font-size:13px;font-weight:700;cursor:pointer;transition:opacity 200ms;box-shadow:var(--shadow-1);}
  .btn-primary:hover{opacity:0.85;}
  .btn-primary:disabled{opacity:0.38;cursor:not-allowed;}
  .btn-cancel{padding:12px 18px;border-radius:var(--radius-pill);border:1.5px solid var(--rule-med);background:transparent;color:var(--ink-soft);font-family:var(--font-sans);font-size:13px;font-weight:600;cursor:pointer;transition:all 200ms var(--ease);}
  .btn-cancel:hover{border-color:var(--ink-soft);color:var(--ink);}

  /* Subtask section inside task detail */
  .subtasks-section{margin-top:20px;padding-top:16px;border-top:1px solid var(--rule);}
  .subtasks-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
  .subtasks-title{font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--ink-soft);}
  .btn-add-subtask{font-family:var(--font-sans);font-size:11px;font-weight:700;color:var(--blue);background:none;border:none;cursor:pointer;padding:0;letter-spacing:0.02em;}
  .btn-add-subtask:hover{color:var(--blue-deep);}
  .subtask-item{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--rule);}
  .subtask-item:last-child{border-bottom:none;}
  .subtask-item-body{flex:1;min-width:0;}
  .subtask-item-title{font-size:13px;font-weight:500;color:var(--ink);line-height:1.35;}
  .subtask-item-title.done{text-decoration:line-through;color:var(--muted);}
  .subtask-item-meta{display:flex;gap:6px;align-items:center;margin-top:3px;}
  .subtask-date{font-size:10px;font-weight:600;color:var(--muted);}
  .subtask-date.overdue{color:var(--overdue-accent);}
  .subtask-form{background:var(--paper);border-radius:var(--radius);padding:12px;margin-top:8px;}
  .subtask-form-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;}

  /* Inline subtask expand in project view */
  .expand-btn{background:var(--blue-pale);border:1px solid rgba(77,163,201,0.3);border-radius:var(--radius-pill);cursor:pointer;font-family:var(--font-sans);font-size:11px;font-weight:700;color:var(--blue-deep);padding:4px 10px;letter-spacing:0.03em;display:flex;align-items:center;gap:5px;min-height:28px;transition:all 0.14s;}
  .expand-btn:hover{background:var(--blue-pale);border-color:var(--blue);}
  .inline-subtasks{padding-left:32px;border-top:1px solid var(--rule);animation:rowIn 0.18s var(--ease);}
  .inline-subtask-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--rule);}
  .inline-subtask-row:last-child{border-bottom:none;}
  .inline-subtask-body{flex:1;min-width:0;}
  .inline-subtask-title{font-size:13px;font-weight:500;color:var(--ink);line-height:1.35;}
  .inline-subtask-title.done{text-decoration:line-through;color:var(--muted);}
  .inline-subtask-meta{display:flex;gap:5px;align-items:center;margin-top:2px;}
  .inline-add-subtask{display:flex;align-items:center;gap:6px;padding:8px 0;font-family:var(--font-sans);font-size:12px;font-weight:600;color:var(--blue);background:none;border:none;cursor:pointer;}
  .inline-add-subtask:hover{color:var(--blue-deep);}
  .inline-subtask-form{background:var(--paper);border-radius:var(--radius);padding:10px;margin:4px 0 8px;}
`;

// ── TaskForm ──────────────────────────────────────────────────────────────────
function TaskForm({ task, defaultProject, defaultContext, onSave, onCancel }) {
  const [title, setTitle] = useState(task?.title || "");
  const [priority, setPriority] = useState(task?.priority || "medium");
  const [context, setContext] = useState(task?.context || defaultContext || "orinoco");
  const [dueDate, setDueDate] = useState(task?.due_date || "");
  const [estMins, setEstMins] = useState(task?.estimated_minutes || "");
  const [project, setProject] = useState(task?.project || defaultProject || "");
  const [tagsInput, setTagsInput] = useState((task?.tags || []).join(", "));
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); }, []);
  function submit() {
    if (!title.trim()) return;
    const tags = tagsInput.split(",").map(t => t.trim()).filter(Boolean);
    onSave({ title:title.trim(), priority, context, due_date:dueDate||null, estimated_minutes:estMins?parseInt(estMins):null, project:project.trim()||null, tags, parent_id:null });
  }
  function onKey(e) { if ((e.metaKey||e.ctrlKey)&&e.key==="Enter") submit(); if (e.key==="Escape") onCancel(); }
  const ctxC = CTX[context];
  const tl = estMins ? (Number(estMins)<60 ? estMins+"m" : Math.floor(estMins/60)+"h"+(estMins%60?" "+estMins%60+"m":"")) : null;
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="modal" style={{borderTop:`3px solid ${ctxC.bg}`}} onKeyDown={onKey}>
        <div className="modal-head">{task?"Edit task":"New task"}</div>
        <div className="field"><label className="field-label">Title</label>
          <textarea ref={ref} className="field-input" placeholder="What needs doing?" value={title} onChange={e=>setTitle(e.target.value)} rows={2} /></div>
        <div className="two-col">
          <div className="field"><label className="field-label">Priority</label>
            <div className="p-opts">{["high","medium","low"].map(p=>(
              <button key={p} type="button" className={`p-opt ${p} ${priority===p?"on":""}`} onClick={()=>setPriority(p)}>
                {p==="medium"?"Med":p[0].toUpperCase()+p.slice(1)}</button>))}</div></div>
          <div className="field"><label className="field-label">Context</label>
            <div className="ctx-opts">{["orinoco","personal"].map(c=>(
              <button key={c} type="button" className={`ctx-opt ${c} ${context===c?"on":""}`} onClick={()=>setContext(c)}>
                {c==="orinoco"?"Orinoco":"Personal"}</button>))}</div></div>
        </div>
        <div className="field"><label className="field-label">Project</label>
          <input type="text" className="field-input" placeholder="Leave blank if none" value={project} onChange={e=>setProject(e.target.value)} /></div>
        <div className="two-col">
          <div className="field"><label className="field-label">Due date</label>
            <input type="date" className="field-input" value={dueDate} onChange={e=>setDueDate(e.target.value)} /></div>
          <div className="field"><label className="field-label">Est. mins{tl&&<span style={{color:"var(--blue)",fontWeight:600,letterSpacing:0,textTransform:"none"}}> ({tl})</span>}</label>
            <input type="number" className="field-input" placeholder="30" min="1" value={estMins} onChange={e=>setEstMins(e.target.value)} /></div>
        </div>
        <div className="field"><label className="field-label">Tags</label>
          <input type="text" className="field-input" placeholder="admin, finance, urgent" value={tagsInput} onChange={e=>setTagsInput(e.target.value)} /></div>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" style={{background:ctxC.bgDeep}} onClick={submit} disabled={!title.trim()}>{task?"Save changes":"Add task"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Task Detail Modal (with subtasks) ─────────────────────────────────────────
function SubtaskEditRow({ st, index, total, onToggle, onDelete, onUpdate, onMove, ctxC }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(st.title);
  const [due, setDue] = useState(st.due_date || "");
  const [priority, setPriority] = useState(st.priority || "medium");
  const editRef = useRef();

  useEffect(() => { if (editing) editRef.current?.focus(); }, [editing]);

  function formatDateShort(s) {
    if (!s) return null;
    const d = new Date(s+"T00:00:00"), t = new Date(); t.setHours(0,0,0,0);
    const diff = Math.round((d-t)/86400000);
    if (diff===0) return "today"; if (diff===1) return "tomorrow";
    if (diff<0) return `${Math.abs(diff)}d overdue`;
    return d.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
  }

  function saveEdit() {
    if (!title.trim()) return;
    onUpdate(st.id, { title: title.trim(), due_date: due || null, priority });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="subtask-item" style={{flexDirection:"column",alignItems:"stretch",gap:8,background:"var(--paper)",borderRadius:"var(--radius)",padding:"10px"}}>
        <input type="text" ref={editRef} className="field-input" value={title} onChange={e=>setTitle(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter")saveEdit();if(e.key==="Escape")setEditing(false);}} />
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <input type="date" className="field-input" value={due} onChange={e=>setDue(e.target.value)} />
          <div className="p-opts">
            {["high","medium","low"].map(p=>(
              <button key={p} type="button" className={`p-opt ${p} ${priority===p?"on":""}`} onClick={()=>setPriority(p)} style={{fontSize:10,padding:"5px 0"}}>
                {p==="medium"?"Med":p[0].toUpperCase()+p.slice(1)}</button>))}
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn-cancel" style={{padding:"7px 12px",fontSize:12}} onClick={()=>setEditing(false)}>Cancel</button>
          <button className="btn-primary" style={{background:ctxC?.bgDeep||"var(--blue-deep)",padding:"7px",fontSize:12,flex:1}} onClick={saveEdit} disabled={!title.trim()}>Save</button>
        </div>
      </div>
    );
  }

  return (
    <div className="subtask-item">
      <button className={`check-btn small${st.archived?" checked":""}`} onClick={()=>onToggle(st.id)} />
      <div className="subtask-item-body" style={{cursor:"pointer"}} onClick={()=>setEditing(true)}>
        <div className={`subtask-item-title${st.archived?" done":""}`}>{st.title}</div>
        <div className="subtask-item-meta">
          {st.due_date && <span className={`subtask-date${isOverdue(st.due_date)&&!st.archived?" overdue":""}`}>{formatDateShort(st.due_date)}</span>}
          <span className={`p-indicator ${st.priority}`} style={{fontSize:9,padding:"1px 5px"}}>{st.priority==="medium"?"Med":st.priority}</span>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0}}>
        <button className="act-btn" style={{opacity:index===0?0.25:1,fontSize:11,height:20}} disabled={index===0} onClick={()=>onMove(index,-1)}>↑</button>
        <button className="act-btn" style={{opacity:index===total-1?0.25:1,fontSize:11,height:20}} disabled={index===total-1} onClick={()=>onMove(index,1)}>↓</button>
      </div>
      <button className="act-btn del" style={{opacity:1}} onClick={()=>onDelete(st.id)}>✕</button>
    </div>
  );
}

function TaskDetail({ task, subtasks, onClose, onEdit, onToggle, onDelete, onAddSubtask, onToggleSubtask, onDeleteSubtask, onUpdateSubtask, onReorderSubtasks }) {
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const [stTitle, setStTitle] = useState("");
  const [stDue, setStDue] = useState("");
  const [stPriority, setStPriority] = useState("medium");
  const stRef = useRef();

  useEffect(() => { if (showSubtaskForm) stRef.current?.focus(); }, [showSubtaskForm]);

  // Local ordered list of subtasks
  const [ordered, setOrdered] = useState(subtasks);
  useEffect(() => { setOrdered(subtasks); }, [subtasks]);

  function moveSubtask(index, dir) {
    const newOrder = [...ordered];
    const [item] = newOrder.splice(index, 1);
    newOrder.splice(index + dir, 0, item);
    setOrdered(newOrder);
    onReorderSubtasks(newOrder.map(s => s.id));
  }

  function submitSubtask() {
    if (!stTitle.trim()) return;
    onAddSubtask({ title: stTitle.trim(), due_date: stDue || null, priority: stPriority });
    setStTitle(""); setStDue(""); setStPriority("medium"); setShowSubtaskForm(false);
  }

  const doneCount = ordered.filter(s => s.archived).length;
  const totalCount = ordered.length;
  const ctxC = CTX[task.context] || CTX.orinoco;

  function formatDateShort(s) {
    if (!s) return null;
    const d = new Date(s+"T00:00:00"), t = new Date(); t.setHours(0,0,0,0);
    const diff = Math.round((d-t)/86400000);
    if (diff===0) return "today"; if (diff===1) return "tomorrow";
    if (diff<0) return `${Math.abs(diff)}d overdue`;
    return d.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
  }

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{borderTop:`3px solid ${ctxC.bg}`}}>
        <div className="modal-head">Task detail</div>

        <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:16}}>
          <button className={`check-btn${task.archived?" checked":""}`} style={{marginTop:2,flexShrink:0}} onClick={()=>onToggle(task.id)} />
          <div style={{flex:1}}>
            <div style={{fontSize:16,fontWeight:700,color:task.archived?"var(--muted)":"var(--ink)",textDecoration:task.archived?"line-through":"none",lineHeight:1.35}}>{task.title}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:5}}>
              <span className={`p-indicator ${task.priority}`}>{task.priority==="medium"?"Med":task.priority}</span>
              {task.due_date && <span className="meta-txt" style={isOverdue(task.due_date)?{color:"var(--overdue-accent)",fontWeight:700}:{}}>{formatDateShort(task.due_date)}</span>}
              {task.project && <span className="meta-txt">· {task.project}</span>}
              {(task.tags||[]).map(t=><span key={t} className="tag-chip">#{t}</span>)}
            </div>
          </div>
        </div>

        <div style={{display:"flex",gap:8,marginBottom:4}}>
          <button className="btn-primary" style={{background:ctxC.bgDeep,flex:1}} onClick={()=>onEdit(task)}>Edit task</button>
          <button className="btn-cancel" style={{color:"var(--high)",borderColor:"rgba(192,57,43,0.2)"}} onClick={()=>{onDelete(task.id);onClose();}}>Delete</button>
        </div>

        <div className="subtasks-section">
          <div className="subtasks-head">
            <span className="subtasks-title">
              Subtasks {totalCount>0 && <span style={{color:"var(--muted)",fontWeight:500}}>({doneCount}/{totalCount})</span>}
            </span>
            {!showSubtaskForm && <button className="btn-add-subtask" onClick={()=>setShowSubtaskForm(true)}>+ Add subtask</button>}
          </div>

          {ordered.map((st, i) => (
            <SubtaskEditRow key={st.id} st={st} index={i} total={ordered.length} ctxC={ctxC}
              onToggle={onToggleSubtask}
              onDelete={onDeleteSubtask}
              onUpdate={onUpdateSubtask}
              onMove={moveSubtask} />
          ))}

          {totalCount === 0 && !showSubtaskForm && (
            <div style={{fontSize:12,color:"var(--muted)",padding:"8px 0"}}>No subtasks yet — add one to break this task down.</div>
          )}

          {showSubtaskForm && (
            <div className="subtask-form">
              <input type="text" ref={stRef} className="field-input" placeholder="Subtask title" value={stTitle}
                onChange={e=>setStTitle(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter")submitSubtask();if(e.key==="Escape")setShowSubtaskForm(false);}} />
              <div className="subtask-form-row">
                <input type="date" className="field-input" value={stDue} onChange={e=>setStDue(e.target.value)} />
                <div className="p-opts">
                  {["high","medium","low"].map(p=>(
                    <button key={p} type="button" className={`p-opt ${p} ${stPriority===p?"on":""}`} onClick={()=>setStPriority(p)} style={{fontSize:10,padding:"6px 0"}}>
                      {p==="medium"?"Med":p[0].toUpperCase()+p.slice(1)}</button>))}
                </div>
              </div>
              <div className="modal-actions" style={{marginTop:10}}>
                <button className="btn-cancel" style={{padding:"8px 14px"}} onClick={()=>setShowSubtaskForm(false)}>Cancel</button>
                <button className="btn-primary" style={{background:ctxC.bgDeep,padding:"8px"}} onClick={submitSubtask} disabled={!stTitle.trim()}>Add subtask</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── TaskRow ───────────────────────────────────────────────────────────────────
function TaskRow({ task, subtasks, onToggle, onOpenDetail, onDelete, showProject, projectAccents, onNavigateProject, urgent }) {
  const tl = formatTime(task.estimated_minutes);
  const accent = task.project&&projectAccents ? projectAccents[task.project] : null;
  const days = urgent ? daysOverdue(task.due_date) : 0;
  const subDone = (subtasks||[]).filter(s=>s.archived).length;
  const subTotal = (subtasks||[]).length;
  const pct = subTotal > 0 ? Math.round((subDone/subTotal)*100) : 0;

  return (
    <div className={`task-row${urgent?" is-overdue":""}`}>
      <button className={`check-btn${task.archived?" checked":""}${urgent?" urgent":""}`} onClick={onToggle} />
      <div className="task-body" onClick={onOpenDetail}>
        <div className={`task-title${task.archived?" done":""}${urgent?" overdue-title-text":""}`}>{task.title}</div>
        <div className="task-meta">
          {!urgent&&<span className={`p-indicator ${task.priority}`}>{task.priority==="medium"?"Med":task.priority}</span>}
          {urgent&&<span className="overdue-days">{days===1?"1 day overdue":`${days} days overdue`}</span>}
          {tl&&<span className="meta-txt">· {tl}</span>}
          {subTotal>0&&(
            <span className="subtask-progress">
              <span style={{fontSize:10,fontWeight:700,color:subDone===subTotal?"var(--leaf)":"var(--muted)"}}>{subDone}/{subTotal}</span>
              <span className="subtask-progress-bar"><span className="subtask-progress-fill" style={{width:`${pct}%`}}/></span>
            </span>
          )}
          {showProject&&task.project&&accent&&(
            <button className="proj-pill" style={{background:accent.bg,color:accent.dot,border:`1px solid ${accent.border}`}}
              onClick={e=>{e.stopPropagation();onNavigateProject&&onNavigateProject(task.project);}}>
              {task.project}</button>)}
          {(task.tags||[]).map(t=><span key={t} className="tag-chip">#{t}</span>)}
        </div>
      </div>
      <div className="row-actions">
        <button className="act-btn" onClick={onOpenDetail}>✎</button>
        <button className="act-btn del" onClick={onDelete}>✕</button>
      </div>
    </div>
  );
}

// ── ExpandableTaskRow — used in project detail view ───────────────────────────
function ExpandableTaskRow({ task, subtasks, onToggle, onOpenDetail, onDelete, onToggleSubtask, onDeleteSubtask, onAddSubtask, ctxC }) {
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [stTitle, setStTitle] = useState("");
  const [stDue, setStDue] = useState("");
  const [stPriority, setStPriority] = useState("medium");
  const stRef = useRef();
  useEffect(() => { if (showForm) stRef.current?.focus(); }, [showForm]);

  const subDone = subtasks.filter(s=>s.archived).length;
  const subTotal = subtasks.length;
  const pct = subTotal > 0 ? Math.round((subDone/subTotal)*100) : 0;

  function formatDateShort(s) {
    if (!s) return null;
    const d = new Date(s+"T00:00:00"), t = new Date(); t.setHours(0,0,0,0);
    const diff = Math.round((d-t)/86400000);
    if (diff===0) return "today"; if (diff===1) return "tomorrow";
    if (diff<0) return `${Math.abs(diff)}d overdue`;
    return d.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
  }

  function submitSubtask() {
    if (!stTitle.trim()) return;
    onAddSubtask(task, { title: stTitle.trim(), due_date: stDue || null, priority: stPriority });
    setStTitle(""); setStDue(""); setStPriority("medium"); setShowForm(false);
  }

  return (
    <div style={{borderBottom:"1px solid var(--rule)"}}>
      {/* Main task row */}
      <div className="task-row" style={{borderBottom:"none"}}>
        <button className={`check-btn${task.archived?" checked":""}`} onClick={()=>onToggle(task.id)} />
        <div className="task-body" style={{cursor:"default"}}>
          <div className={`task-title${task.archived?" done":""}`} style={{cursor:"pointer"}} onClick={()=>onOpenDetail(task)}>{task.title}</div>
          <div className="task-meta">
            <span className={`p-indicator ${task.priority}`}>{task.priority==="medium"?"Med":task.priority}</span>
            {task.due_date&&<span className="meta-txt" style={isOverdue(task.due_date)?{color:"var(--overdue-accent)",fontWeight:700}:{}}>{formatDateShort(task.due_date)}</span>}
            {subTotal>0&&(
              <button className="expand-btn" onClick={()=>setExpanded(v=>!v)}>
                <span>{expanded?"▾":"▸"}</span>
                <span style={{color:subDone===subTotal?"var(--leaf)":"var(--muted)"}}>{subDone}/{subTotal}</span>
                <span className="subtask-progress-bar" style={{display:"inline-block",verticalAlign:"middle"}}>
                  <span className="subtask-progress-fill" style={{width:`${pct}%`,display:"block",height:"100%"}}/>
                </span>
              </button>
            )}
            {subTotal===0&&(
              <button className="expand-btn" onClick={()=>{setExpanded(true);setShowForm(true);}}>
                + subtask
              </button>
            )}
          </div>
        </div>
        <div className="row-actions">
          <button className="act-btn" onClick={()=>onOpenDetail(task)}>✎</button>
          <button className="act-btn del" onClick={()=>onDelete(task.id)}>✕</button>
        </div>
      </div>

      {/* Inline subtasks */}
      {expanded && (
        <div className="inline-subtasks">
          {subtasks.map(st=>(
            <div key={st.id} className="inline-subtask-row">
              <button className={`check-btn small${st.archived?" checked":""}`} onClick={()=>onToggleSubtask(st.id)} />
              <div className="inline-subtask-body">
                <div className={`inline-subtask-title${st.archived?" done":""}`}>{st.title}</div>
                {st.due_date&&(
                  <div className="inline-subtask-meta">
                    <span className={`subtask-date${isOverdue(st.due_date)&&!st.archived?" overdue":""}`}>{formatDateShort(st.due_date)}</span>
                    <span className={`p-indicator ${st.priority}`} style={{fontSize:9,padding:"1px 5px"}}>{st.priority==="medium"?"Med":st.priority}</span>
                  </div>
                )}
              </div>
              <button className="act-btn del" style={{opacity:1,flexShrink:0}} onClick={()=>onDeleteSubtask(st.id)}>✕</button>
            </div>
          ))}

          {!showForm && (
            <button className="inline-add-subtask" onClick={()=>setShowForm(true)}>+ Add subtask</button>
          )}

          {showForm && (
            <div className="inline-subtask-form">
              <input type="text" ref={stRef} className="field-input" placeholder="Subtask title"
                value={stTitle} onChange={e=>setStTitle(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter")submitSubtask();if(e.key==="Escape")setShowForm(false);}}
                style={{marginBottom:8}} />
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <input type="date" className="field-input" value={stDue} onChange={e=>setStDue(e.target.value)} />
                <div className="p-opts">
                  {["high","medium","low"].map(p=>(
                    <button key={p} type="button" className={`p-opt ${p} ${stPriority===p?"on":""}`}
                      onClick={()=>setStPriority(p)} style={{fontSize:10,padding:"6px 0"}}>
                      {p==="medium"?"Med":p[0].toUpperCase()+p.slice(1)}</button>))}
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn-cancel" style={{padding:"7px 12px",fontSize:12}} onClick={()=>setShowForm(false)}>Cancel</button>
                <button className="btn-primary" style={{background:ctxC?.bgDeep||"var(--blue-deep)",padding:"7px",fontSize:12}} onClick={submitSubtask} disabled={!stTitle.trim()}>Add</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function SubtaskTodayRow({ subtask, parentTitle, parentProject, onToggle, onOpenParent, urgent }) {
  const days = urgent ? daysOverdue(subtask.due_date) : 0;
  return (
    <div className="subtask-row">
      <button className={`check-btn small${subtask.archived?" checked":""}${urgent?" urgent":""}`} onClick={onToggle} />
      <div className="task-body" onClick={onOpenParent}>
        <div className={`task-title subtask${subtask.archived?" done":""}${urgent?" overdue-title-text":""}`}>{subtask.title}</div>
        <div className="task-meta">
          {!urgent&&<span className={`p-indicator ${subtask.priority}`} style={{fontSize:9,padding:"1px 5px"}}>{subtask.priority==="medium"?"Med":subtask.priority}</span>}
          {urgent&&<span className="overdue-days">{days===1?"1 day overdue":`${days} days overdue`}</span>}
          <span className="parent-label">
            <span className="parent-label-arrow">↳</span>
            {parentProject && <span style={{color:"var(--blue)",fontWeight:700}}>{parentProject} · </span>}
            {parentTitle}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── TodayView ─────────────────────────────────────────────────────────────────
function TodayView({ tasks, context, projectAccents, onAdd, onOpenDetail, onToggle, onDelete, onNavigateProject, onCtxChange }) {
  const [showMoreWeek, setShowMoreWeek] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  // Separate parents and subtasks
  const allCtx = tasks.filter(t=>t.context===context);
  const parents = allCtx.filter(t=>!t.parent_id);
  const subtasksMap = useMemo(()=>{
    const m={};
    allCtx.filter(t=>t.parent_id).forEach(s=>{
      if(!m[s.parent_id]) m[s.parent_id]=[];
      m[s.parent_id].push(s);
    });
    return m;
  },[tasks,context]);

  const activeParents = parents.filter(t=>!t.archived);
  const activeSubtasks = allCtx.filter(t=>t.parent_id&&!t.archived);

  // For Today view — include subtasks with due dates in their own sections
  const overdueParents = useMemo(()=>sortTasks(activeParents.filter(t=>isOverdue(t.due_date))),[tasks,context]);
  const overdueSubtasks = useMemo(()=>sortTasks(activeSubtasks.filter(t=>isOverdue(t.due_date))),[tasks,context]);

  const dueTodayParents = useMemo(()=>sortTasks(activeParents.filter(t=>isToday(t.due_date))),[tasks,context]);
  const dueTodaySubtasks = useMemo(()=>sortTasks(activeSubtasks.filter(t=>isToday(t.due_date))),[tasks,context]);

  const dueTomorrowParents = useMemo(()=>sortTasks(activeParents.filter(t=>isTomorrow(t.due_date))),[tasks,context]);
  const dueTomorrowSubtasks = useMemo(()=>sortTasks(activeSubtasks.filter(t=>isTomorrow(t.due_date))),[tasks,context]);

  const thisWeekParents = useMemo(()=>sortTasks(activeParents.filter(t=>t.due_date&&isThisWeek(t.due_date)&&!isToday(t.due_date)&&!isTomorrow(t.due_date))),[tasks,context]);
  const thisWeekSubtasks = useMemo(()=>sortTasks(activeSubtasks.filter(t=>t.due_date&&isThisWeek(t.due_date)&&!isToday(t.due_date)&&!isTomorrow(t.due_date))),[tasks,context]);

  const completedToday = useMemo(()=>allCtx.filter(t=>!t.parent_id&&t.archived&&t.completed_at&&t.completed_at.slice(0,10)===todayStr())
    .sort((a,b)=>b.completed_at.localeCompare(a.completed_at)),[tasks,context]);

  const doneCount = completedToday.length;
  const totalOverdue = overdueParents.length + overdueSubtasks.length;
  // Each section shows only items whose own due_date matches — no mixing
  const todayItems = useMemo(()=>sortTasks([
    ...activeParents.filter(t=>isToday(t.due_date)),
    ...activeSubtasks.filter(t=>isToday(t.due_date))
  ]),[tasks,context]);
  const tomorrowItems = useMemo(()=>sortTasks([
    ...activeParents.filter(t=>isTomorrow(t.due_date)),
    ...activeSubtasks.filter(t=>isTomorrow(t.due_date))
  ]),[tasks,context]);
  const weekItems = useMemo(()=>sortTasks([
    ...activeParents.filter(t=>t.due_date&&isThisWeek(t.due_date)&&!isToday(t.due_date)&&!isTomorrow(t.due_date)),
    ...activeSubtasks.filter(t=>t.due_date&&isThisWeek(t.due_date)&&!isToday(t.due_date)&&!isTomorrow(t.due_date))
  ]),[tasks,context]);
  const wv = showMoreWeek ? weekItems : weekItems.slice(0,3);
  const wh = weekItems.length - 3;

  const todayFmt = new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
  const activeCount = activeParents.length;
  const allClear = totalOverdue===0&&todayItems.length===0&&tomorrowItems.length===0&&weekItems.length===0;
  const ctxC = CTX[context];

  function getParent(parentId) {
    return tasks.find(t=>t.id===parentId);
  }

  function renderItem(t) {
    if (t.parent_id) {
      const parent = getParent(t.parent_id);
      return <SubtaskTodayRow key={t.id} subtask={t} parentTitle={parent?.title||""} parentProject={parent?.project||null}
        onToggle={()=>onToggle(t.id)}
        onOpenParent={()=>{if(parent)onOpenDetail(parent);}} />;
    }
    return <TaskRow key={t.id} task={t} subtasks={subtasksMap[t.id]||[]} showProject projectAccents={projectAccents}
      onToggle={()=>onToggle(t.id)} onOpenDetail={()=>onOpenDetail(t)} onDelete={()=>onDelete(t.id)}
      onNavigateProject={onNavigateProject} />;
  }

  function renderUrgentItem(t) {
    if (t.parent_id) {
      const parent = getParent(t.parent_id);
      return <SubtaskTodayRow key={t.id} subtask={t} urgent parentTitle={parent?.title||""} parentProject={parent?.project||null}
        onToggle={()=>onToggle(t.id)}
        onOpenParent={()=>{if(parent)onOpenDetail(parent);}} />;
    }
    return <TaskRow key={t.id} task={t} subtasks={subtasksMap[t.id]||[]} urgent showProject projectAccents={projectAccents}
      onToggle={()=>onToggle(t.id)} onOpenDetail={()=>onOpenDetail(t)} onDelete={()=>onDelete(t.id)}
      onNavigateProject={onNavigateProject} />;
  }

  return (
    <>
      <div className="today-header" style={{background:ctxC.bg}}>
        <div className="today-header-top">
          <span className="wordmark-name">{ctxC.label}</span>
          <div className="ctx-toggle">
            <button className={`ctx-btn ${context==="orinoco"?"active":""}`} style={context==="orinoco"?{color:ctxC.bgDeep}:{}} onClick={()=>onCtxChange("orinoco")}>Orinoco</button>
            <button className={`ctx-btn ${context==="personal"?"active":""}`} style={context==="personal"?{color:CTX.personal.bgDeep}:{}} onClick={()=>onCtxChange("personal")}>Personal</button>
          </div>
        </div>
        <div className="header-bottom">
          <div className="date-info">
            <span className="date-label">{todayFmt}</span>
            {activeCount>0&&<span className="date-remaining">{activeCount} task{activeCount!==1?"s":""} remaining</span>}
          </div>
          <div className="header-right">
            {doneCount>0&&<span className={`done-badge${doneCount>0?" has-done":""}`}>{doneCount} done</span>}
            <button className="btn-new-white" style={{color:ctxC.bgDeep}} onClick={()=>onAdd(null)}>+ New task</button>
          </div>
        </div>
      </div>
      <div className="list-wrap">
        {totalOverdue>0&&<div className="overdue-block">
          <div className="overdue-header"><div className="overdue-icon"/><span className="overdue-title-label">Needs attention</span><span className="overdue-count">{totalOverdue}</span></div>
          {[...overdueParents,...overdueSubtasks].map(t=>renderUrgentItem(t))}
        </div>}
        {todayItems.length>0&&<div className="section-block">
          <div className="section-header"><span className="section-title">Due today</span></div>
          {todayItems.map(t=>renderItem(t))}
        </div>}
        {tomorrowItems.length>0&&<div className="section-block">
          <div className="section-header"><span className="section-title">Tomorrow</span></div>
          {tomorrowItems.map(t=>renderItem(t))}
        </div>}
        {weekItems.length>0&&<div className="section-block">
          <div className="section-header">
            <span className="section-title">This week</span>
            {!showMoreWeek&&wh>0&&<button className="section-show-more" onClick={()=>setShowMoreWeek(true)}>+{wh} more</button>}
          </div>
          {wv.map(t=>renderItem(t))}
          {showMoreWeek&&wh>0&&<button className="section-show-more" style={{padding:"8px 0",display:"block"}} onClick={()=>setShowMoreWeek(false)}>Show less</button>}
        </div>}
        {allClear&&<div className="empty-today">
          <div className="empty-today-icon">✓</div>
          <div className="empty-today-msg">You're on top of it.</div>
          <div className="empty-today-sub">Nothing due today or this week.</div>
        </div>}
        {completedToday.length>0&&<div className="completed-strip">
          <div className="arch-toggle" onClick={()=>setShowCompleted(v=>!v)}>
            <span>{showCompleted?"▾":"▸"}</span> Completed today ({doneCount})
          </div>
          {showCompleted&&completedToday.map(t=><TaskRow key={t.id} task={t} subtasks={subtasksMap[t.id]||[]} showProject projectAccents={projectAccents}
            onToggle={()=>onToggle(t.id)} onOpenDetail={()=>onOpenDetail(t)} onDelete={()=>onDelete(t.id)} onNavigateProject={onNavigateProject}/>)}
        </div>}
      </div>
    </>
  );
}

// ── ProjectsView ──────────────────────────────────────────────────────────────
function ProjectsView({ tasks, context, projectAccents, onAdd, onSelectProject, onCtxChange, onOpenDetail, onToggle, onDelete }) {
  const ctxTasks = tasks.filter(t=>t.context===context&&!t.parent_id);
  const projects = useMemo(()=>{
    const map={};
    ctxTasks.filter(t=>t.project).forEach(t=>{
      if(!map[t.project]) map[t.project]={name:t.project,total:0,done:0,overdue:0};
      map[t.project].total++;
      if(t.archived) map[t.project].done++;
      else if(isOverdue(t.due_date)) map[t.project].overdue++;
    });
    return Object.values(map).sort((a,b)=>a.name.localeCompare(b.name));
  },[tasks,context]);
  const noProject = useMemo(()=>sortTasks(ctxTasks.filter(t=>!t.project&&!t.archived)),[tasks,context]);
  const ctxC = CTX[context];
  const subtasksMap = useMemo(()=>{
    const m={};
    tasks.filter(t=>t.parent_id).forEach(s=>{if(!m[s.parent_id])m[s.parent_id]=[];m[s.parent_id].push(s);});
    return m;
  },[tasks]);

  return (
    <>
      <div className="plain-header">
        <div className="plain-header-left">
          <span className="plain-title">Projects</span>
          <span className="plain-ctx-label">{ctxC.label}</span>
        </div>
        <div className="projects-ctx-bar">
          <div className="ctx-toggle-dark">
            <button className="ctx-btn-dark" style={context==="orinoco"?{background:CTX.orinoco.bg,color:"white"}:{}} onClick={()=>onCtxChange("orinoco")}>Orinoco</button>
            <button className="ctx-btn-dark" style={context==="personal"?{background:CTX.personal.bg,color:"white"}:{}} onClick={()=>onCtxChange("personal")}>Personal</button>
          </div>
          <button className="btn-new-ink" style={{background:ctxC.bgDeep}} onClick={()=>onAdd(null)}>+ New</button>
        </div>
      </div>
      <div className="projects-wrap">
        {projects.length===0&&noProject.length===0
          ? <div className="empty">No projects in this context yet.</div>
          : <>
            {projects.length>0&&<>
              <div className="projects-eyebrow">Active projects</div>
              <div className="projects-grid">
                {projects.map(p=>{
                  const accent=projectAccents[p.name]||PROJ_ACCENTS[0];
                  const active=p.total-p.done;
                  const pct=p.total>0?Math.round((p.done/p.total)*100):0;
                  return <div key={p.name} className="proj-tile" style={{"--tile-accent":accent.dot}} onClick={()=>onSelectProject(p.name)}>
                    {p.overdue>0&&<div className="proj-overdue">{p.overdue} overdue</div>}
                    <div className="proj-tile-name">{p.name}</div>
                    <div className="proj-tile-stats">
                      <div className="proj-tile-stat"><strong>{active}</strong>active</div>
                      <div className="proj-tile-stat"><strong>{p.done}</strong>done</div>
                    </div>
                    <div className="proj-tile-bar"><div className="proj-tile-bar-fill" style={{width:`${pct}%`,background:accent.dot}}/></div>
                  </div>;
                })}
              </div>
            </>}
            {noProject.length>0&&<div className="solo-section">
              <div className="solo-label">No project</div>
              {noProject.map(t=><TaskRow key={t.id} task={t} subtasks={subtasksMap[t.id]||[]} showProject={false}
                onToggle={()=>onToggle(t.id)} onOpenDetail={()=>onOpenDetail(t)} onDelete={()=>onDelete(t.id)}/>)}
            </div>}
          </>}
      </div>
    </>
  );
}

// ── ProjectDetailView ─────────────────────────────────────────────────────────
function ProjectDetailView({ projectName, tasks, context, projectAccents, onBack, onAdd, onOpenDetail, onToggle, onDelete, onToggleSubtask, onDeleteSubtask, onAddSubtask }) {
  const [showArchived, setShowArchived] = useState(false);
  const accent = projectAccents[projectName];
  const ctxC = CTX[context];
  const subtasksMap = useMemo(()=>{
    const m={};
    tasks.filter(t=>t.parent_id).forEach(s=>{if(!m[s.parent_id])m[s.parent_id]=[];m[s.parent_id].push(s);});
    return m;
  },[tasks]);
  const active = useMemo(()=>sortTasks(tasks.filter(t=>t.project===projectName&&t.context===context&&!t.archived&&!t.parent_id)),[tasks,projectName,context]);
  const archived = useMemo(()=>tasks.filter(t=>t.project===projectName&&t.context===context&&t.archived&&!t.parent_id)
    .sort((a,b)=>(b.completed_at||"").localeCompare(a.completed_at||"")),[tasks,projectName,context]);
  return (
    <>
      <div className="proj-header">
        <button className="proj-back" onClick={onBack}>←</button>
        <div className="proj-header-info">
          <div className="proj-header-name" style={{color:accent?.dot||"var(--ink)"}}>{projectName}</div>
          <div className="proj-header-sub">{active.length} active · {archived.length} done · {ctxC.label}</div>
        </div>
        <button className="btn-new-ink" style={{background:ctxC.bgDeep}} onClick={()=>onAdd(projectName)}>+ Add</button>
      </div>
      <div className="list-wrap" style={{padding:`0 20px calc(var(--tab-h) + env(safe-area-inset-bottom) + 16px)`}}>
        {active.length===0?<div className="empty">No active tasks in this project.</div>
          :active.map(t=><ExpandableTaskRow key={t.id} task={t} subtasks={subtasksMap[t.id]||[]} ctxC={CTX[context]}
              onToggle={onToggle} onOpenDetail={onOpenDetail} onDelete={onDelete}
              onToggleSubtask={onToggleSubtask} onDeleteSubtask={onDeleteSubtask}
              onAddSubtask={onAddSubtask}/>)}
        {archived.length>0&&<>
          <div className="arch-toggle" onClick={()=>setShowArchived(v=>!v)}>
            <span>{showArchived?"▾":"▸"}</span> Completed ({archived.length})
          </div>
          {showArchived&&archived.map(t=><TaskRow key={t.id} task={t} subtasks={subtasksMap[t.id]||[]} showProject={false}
            onToggle={()=>onToggle(t.id)} onOpenDetail={()=>onOpenDetail(t)} onDelete={()=>onDelete(t.id)}/>)}
        </>}
      </div>
    </>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [context, setContext] = useState("orinoco");
  const [tab, setTab] = useState("today");
  const [selectedProject, setSelectedProject] = useState(null);
  const [modal, setModal] = useState(null); // 'form' | 'detail'
  const [editTarget, setEditTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [defaultProject, setDefaultProject] = useState(null);

  useEffect(()=>{
    async function load() {
      if (supabase) {
        const {data,error} = await supabase.from("tasks").select("*").order("created_at",{ascending:false});
        if (!error&&data) { setTasks(data); saveLocal(data); }
        else { setTasks(loadLocal()); }
      } else { setTasks(loadLocal()); }
      setLoaded(true);
    }
    load();
  },[]);

  useEffect(()=>{
    if (!supabase) return;
    const ch = supabase.channel("tasks-changes")
      .on("postgres_changes",{event:"*",schema:"public",table:"tasks"},()=>{
        supabase.from("tasks").select("*").order("created_at",{ascending:false}).then(({data})=>{
          if (data) { setTasks(data); saveLocal(data); }
        });
      }).subscribe();
    return ()=>supabase.removeChannel(ch);
  },[]);

  useEffect(()=>{ if (loaded) saveLocal(tasks); },[tasks,loaded]);

  const projectAccents = useMemo(()=>{
    const names=[...new Set(tasks.filter(t=>t.project).map(t=>t.project))].sort();
    const map={};
    names.forEach((name,i)=>{ map[name]=PROJ_ACCENTS[i%PROJ_ACCENTS.length]; });
    return map;
  },[tasks]);

  const hasOverdue = useMemo(()=>tasks.some(t=>!t.archived&&!t.parent_id&&t.context===context&&isOverdue(t.due_date)),[tasks,context]);

  function updateTasks(fn) { setTasks(prev=>fn(prev)); }
  function openAdd(proj) { setDefaultProject(proj); setEditTarget(null); setModal("form"); }
  function openDetail(task) { setDetailTarget(task); setModal("detail"); }
  function openEdit(task) { setDetailTarget(null); setEditTarget(task); setModal("form"); }

  async function handleSave(data) {
    if (editTarget) {
      updateTasks(prev=>prev.map(t=>t.id===editTarget.id?{...t,...data}:t));
      if (supabase) await supabase.from("tasks").update(data).eq("id",editTarget.id);
    } else {
      const t={id:genId(),...data,completed:false,archived:false,created_at:new Date().toISOString()};
      updateTasks(prev=>[t,...prev]);
      if (supabase) await supabase.from("tasks").insert(t);
    }
    setModal(null); setEditTarget(null); setDefaultProject(null);
  }

  async function handleAddSubtask(parentTask, data) {
    const st = {
      id: genId(),
      title: data.title,
      priority: data.priority || "medium",
      due_date: data.due_date || null,
      estimated_minutes: null,
      tags: [],
      project: parentTask.project,
      context: parentTask.context,
      parent_id: parentTask.id,
      completed: false,
      archived: false,
      created_at: new Date().toISOString(),
    };
    updateTasks(prev=>[...prev, st]);
    if (supabase) await supabase.from("tasks").insert(st);
    // Keep detail open and refresh detailTarget
    setDetailTarget(prev => prev ? {...prev} : prev);
  }

  async function handleToggle(id) {
    const task=tasks.find(t=>t.id===id);
    const changes={completed:!task.archived,archived:!task.archived,completed_at:!task.archived?new Date().toISOString():null};
    updateTasks(prev=>prev.map(t=>t.id===id?{...t,...changes}:t));
    if (supabase) await supabase.from("tasks").update(changes).eq("id",id);
  }

  async function handleDelete(id) {
    // Also delete subtasks
    const subtaskIds = tasks.filter(t=>t.parent_id===id).map(t=>t.id);
    updateTasks(prev=>prev.filter(t=>t.id!==id&&t.parent_id!==id));
    if (supabase) {
      await supabase.from("tasks").delete().eq("id",id);
      if (subtaskIds.length) await supabase.from("tasks").delete().in("id",subtaskIds);
    }
  }

  async function handleUpdateSubtask(id, data) {
    updateTasks(prev=>prev.map(t=>t.id===id?{...t,...data}:t));
    if (supabase) await supabase.from("tasks").update(data).eq("id",id);
  }

  async function handleReorderSubtasks(orderedIds) {
    const orderMap = {};
    orderedIds.forEach((id,i)=>{ orderMap[id]=i; });
    updateTasks(prev=>prev.map(t=>t.id in orderMap?{...t,sort_order:orderMap[t.id]}:t));
    if (supabase) {
      await Promise.all(orderedIds.map((id,i)=>supabase.from("tasks").update({sort_order:i}).eq("id",id)));
    }
  }

  function handleCtxChange(c) { setContext(c); setSelectedProject(null); }
  function handleTabChange(t) { setTab(t); setSelectedProject(null); }
  function handleNavigateProject(proj) { setTab("projects"); setSelectedProject(proj); }

  // Get live subtasks for the detail target, sorted by sort_order then created_at
  const detailSubtasks = useMemo(()=>
    detailTarget ? tasks.filter(t=>t.parent_id===detailTarget.id)
      .sort((a,b)=>(a.sort_order??999)-(b.sort_order??999)||(a.created_at.localeCompare(b.created_at))) : []
  ,[tasks, detailTarget]);

  // Get live version of detail target
  const liveDetailTarget = useMemo(()=>
    detailTarget ? tasks.find(t=>t.id===detailTarget.id) || detailTarget : null
  ,[tasks, detailTarget]);

  function renderMain() {
    if (tab==="today") return <TodayView tasks={tasks} context={context} projectAccents={projectAccents}
      onAdd={openAdd} onOpenDetail={openDetail} onToggle={handleToggle} onDelete={handleDelete}
      onNavigateProject={handleNavigateProject} onCtxChange={handleCtxChange}/>;
    if (selectedProject) return <ProjectDetailView projectName={selectedProject} tasks={tasks} context={context} projectAccents={projectAccents}
      onBack={()=>setSelectedProject(null)} onAdd={openAdd} onOpenDetail={openDetail} onToggle={handleToggle} onDelete={handleDelete}
      onToggleSubtask={handleToggle} onDeleteSubtask={handleDelete} onAddSubtask={handleAddSubtask}/>;
    return <ProjectsView tasks={tasks} context={context} projectAccents={projectAccents}
      onAdd={openAdd} onSelectProject={setSelectedProject} onCtxChange={handleCtxChange}
      onOpenDetail={openDetail} onToggle={handleToggle} onDelete={handleDelete}/>;
  }

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        {renderMain()}
        <div className="tab-bar">
          <button className={`tab-btn ${tab==="today"?"active":""}`} onClick={()=>handleTabChange("today")}>
            {hasOverdue&&tab!=="today"&&<span className="tab-badge"/>}
            <span className="tab-icon">◎</span>
            <span className="tab-label">Today</span>
          </button>
          <button className={`tab-btn ${tab==="projects"?"active":""}`} onClick={()=>handleTabChange("projects")}>
            <span className="tab-icon">⊞</span>
            <span className="tab-label">Projects</span>
          </button>
        </div>

        {modal==="form"&&<TaskForm task={editTarget} defaultProject={defaultProject} defaultContext={context}
          onSave={handleSave} onCancel={()=>{setModal(null);setEditTarget(null);}}/>}

        {modal==="detail"&&liveDetailTarget&&<TaskDetail
          task={liveDetailTarget}
          subtasks={detailSubtasks}
          onClose={()=>{setModal(null);setDetailTarget(null);}}
          onEdit={t=>{setModal(null);openEdit(t);}}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onAddSubtask={data=>handleAddSubtask(liveDetailTarget,data)}
          onToggleSubtask={handleToggle}
          onDeleteSubtask={handleDelete}
          onUpdateSubtask={handleUpdateSubtask}
          onReorderSubtasks={handleReorderSubtasks}
        />}
      </div>
    </>
  );
}
