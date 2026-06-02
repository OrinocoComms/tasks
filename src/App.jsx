import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase.js";

const LOCAL_KEY = "tasks_orinoco_v4";
function loadLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch { return []; } }
function saveLocal(t) { localStorage.setItem(LOCAL_KEY, JSON.stringify(t)); }
function genId() { return crypto.randomUUID(); }

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
function todayStr() { return new Date().toISOString().slice(0, 10); }
function formatTime(m) { if (!m) return null; if (m < 60) return `${m}m`; const h = Math.floor(m/60), r = m%60; return r ? `${h}h ${r}m` : `${h}h`; }
function isThisWeek(s) { if (!s) return false; const d = new Date(s+"T00:00:00"), t = new Date(); t.setHours(0,0,0,0); const e = new Date(t); e.setDate(t.getDate()+7); return d >= t && d < e; }
function isToday(s) { return s === todayStr(); }
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
    --radius:6px;--radius-pill:999px;--tab-h:62px;
    --ease:cubic-bezier(0.22,1,0.36,1);
  }
  html,body,#root{height:100%;}
  body{font-family:var(--font-sans);background:var(--paper);color:var(--ink);-webkit-font-smoothing:antialiased;overflow:hidden;}
  .app{display:flex;flex-direction:column;height:100vh;max-width:640px;margin:0 auto;position:relative;background:var(--paper);}
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
  .plain-header{flex-shrink:0;background:var(--white);padding:16px 20px 15px;border-bottom:1px solid var(--rule);display:flex;align-items:center;justify-content:space-between;box-shadow:var(--shadow-1);}
  .plain-header-left{display:flex;flex-direction:column;gap:3px;}
  .plain-title{font-family:var(--font-display);font-size:16px;color:var(--ink);}
  .plain-ctx-label{font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);}
  .projects-ctx-bar{display:flex;align-items:center;gap:8px;}
  .ctx-toggle-dark{display:flex;background:rgba(16,42,67,0.08);border-radius:var(--radius-pill);padding:3px;gap:2px;}
  .ctx-btn-dark{font-family:var(--font-sans);font-size:11px;font-weight:700;letter-spacing:0.03em;padding:5px 12px;border-radius:var(--radius-pill);border:none;background:transparent;color:var(--muted);cursor:pointer;transition:all 200ms var(--ease);white-space:nowrap;}
  .btn-new-ink{display:flex;align-items:center;padding:0 14px;height:30px;border-radius:var(--radius-pill);border:none;color:var(--white);font-family:var(--font-sans);font-size:12px;font-weight:700;cursor:pointer;transition:opacity 200ms;}
  .btn-new-ink:hover{opacity:0.85;}
  .proj-header{flex-shrink:0;background:var(--white);padding:14px 20px;border-bottom:1px solid var(--rule);display:flex;align-items:center;gap:12px;box-shadow:var(--shadow-1);}
  .proj-back{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:1.5px solid var(--rule-med);border-radius:var(--radius);background:transparent;color:var(--ink-soft);cursor:pointer;font-size:14px;transition:all 200ms var(--ease);}
  .proj-back:hover{border-color:var(--blue);color:var(--blue);}
  .proj-header-info{flex:1;min-width:0;}
  .proj-header-name{font-size:15px;font-weight:800;line-height:1.2;}
  .proj-header-sub{font-size:11px;font-weight:500;color:var(--muted);margin-top:2px;}
  .list-wrap{flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(16,42,67,0.15) transparent;padding:0 0 calc(var(--tab-h) + env(safe-area-inset-bottom) + 16px);}
  .overdue-block{background:var(--overdue-bg);border-bottom:1px solid var(--overdue-border);padding:0 20px;}
  .overdue-header{display:flex;align-items:center;gap:8px;padding:12px 0 10px;border-bottom:1px solid var(--overdue-border);}
  .overdue-icon{width:18px;height:18px;border-radius:50%;background:var(--overdue-accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .overdue-icon::after{content:'!';color:white;font-size:11px;font-weight:800;}
  .overdue-title-label{font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:var(--overdue-text);flex:1;}
  .overdue-count{font-size:10px;font-weight:700;color:var(--overdue-accent);background:rgba(231,76,60,0.12);padding:2px 8px;border-radius:var(--radius-pill);}
  .section-block{padding:0 20px;border-bottom:1px solid var(--rule);}
  .section-block:last-child{border-bottom:none;}
  .section-header{display:flex;align-items:center;justify-content:space-between;padding:14px 0 2px;}
  .section-title{font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);}
  .section-show-more{font-size:10px;font-weight:700;color:var(--blue);background:none;border:none;cursor:pointer;padding:0;}
  .task-row{display:flex;align-items:flex-start;gap:12px;padding:11px 0;border-bottom:1px solid var(--rule);animation:rowIn 0.2s var(--ease);}
  .task-row:last-child{border-bottom:none;}
  .overdue-block .task-row{border-bottom-color:var(--overdue-border);}
  .overdue-block .task-row:last-child{border-bottom:none;}
  @keyframes rowIn{from{opacity:0;transform:translateY(-3px);}to{opacity:1;transform:translateY(0);}}
  .check-btn{width:19px;height:19px;border-radius:50%;border:2px solid var(--rule-med);background:transparent;cursor:pointer;flex-shrink:0;margin-top:1px;transition:all 200ms var(--ease);display:flex;align-items:center;justify-content:center;}
  .check-btn:hover{border-color:var(--leaf);}
  .check-btn.checked{background:var(--leaf);border-color:var(--leaf);}
  .check-btn.checked::after{content:'';width:5px;height:8px;border:2px solid #fff;border-top:none;border-left:none;transform:rotate(45deg) translateY(-1px);display:block;}
  .check-btn.urgent{border-color:var(--overdue-accent);}
  .check-btn.urgent:hover{background:var(--overdue-accent);border-color:var(--overdue-accent);}
  .task-body{flex:1;min-width:0;cursor:pointer;}
  .task-title{font-size:14px;font-weight:600;line-height:1.4;color:var(--ink);word-break:break-word;}
  .task-title.done{text-decoration:line-through;color:var(--muted);font-weight:500;}
  .task-title.overdue-title-text{color:var(--overdue-text);}
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
  .row-actions{display:flex;gap:2px;opacity:0;transition:opacity 0.14s;}
  .task-row:hover .row-actions{opacity:1;}
  @media(hover:none){.row-actions{opacity:1;}}
  .act-btn{width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--muted);cursor:pointer;border-radius:var(--radius);font-size:13px;transition:all 0.14s;}
  .act-btn:hover{background:var(--blue-pale);color:var(--blue-deep);}
  .act-btn.del:hover{background:var(--high-bg);color:var(--high);}
  .completed-strip{padding:0 20px;}
  .arch-toggle{display:inline-flex;align-items:center;gap:7px;padding:12px 0 4px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);cursor:pointer;user-select:none;}
  .arch-toggle:hover{color:var(--ink-soft);}
  .empty-today{padding:40px 20px;text-align:center;}
  .empty-today-icon{width:52px;height:52px;border-radius:50%;background:var(--low-bg);border:2px solid var(--low);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:22px;color:var(--low);}
  .empty-today-msg{font-size:15px;font-weight:800;color:var(--ink);margin-bottom:5px;}
  .empty-today-sub{font-size:12px;font-weight:500;color:var(--muted);}
  .empty{padding:52px 20px;text-align:center;font-size:13px;font-weight:600;color:var(--muted);}
  .projects-wrap{flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(16,42,67,0.15) transparent;padding:16px 20px calc(var(--tab-h)+16px);}
  .projects-eyebrow{font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);margin-bottom:14px;}
  .projects-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
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
  .tab-bar{position:absolute;bottom:0;left:0;right:0;height:calc(var(--tab-h) + env(safe-area-inset-bottom));background:var(--white);border-top:1px solid var(--rule);display:flex;z-index:100;box-shadow:0 -4px 16px rgba(16,42,67,0.06);padding-bottom:env(safe-area-inset-bottom);}
  .tab-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:none;background:transparent;cursor:pointer;color:var(--muted);transition:color 200ms var(--ease);padding-bottom:4px;position:relative;}
  .tab-btn::after{content:'';position:absolute;top:0;left:50%;transform:translateX(-50%);width:0;height:2px;background:var(--blue);border-radius:0 0 2px 2px;transition:width 200ms var(--ease);}
  .tab-btn.active{color:var(--blue-deep);}
  .tab-btn.active::after{width:32px;}
  .tab-icon{font-size:18px;line-height:1;}
  .tab-label{font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;}
  .tab-badge{position:absolute;top:8px;right:calc(50% - 16px);width:7px;height:7px;border-radius:50%;background:var(--overdue-accent);border:1.5px solid var(--white);}
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
`;

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
    onSave({ title:title.trim(), priority, context, due_date:dueDate||null, estimated_minutes:estMins?parseInt(estMins):null, project:project.trim()||null, tags });
  }
  function onKey(e) { if ((e.metaKey||e.ctrlKey)&&e.key==="Enter") submit(); if (e.key==="Escape") onCancel(); }
  const ctxC = CTX[context];
  const tl = estMins ? (Number(estMins)<60?`${estMins}m`:`${Math.floor(estMins/60)}h${estMins%60?` ${estMins%60}m`:""}`) : null;
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

function TaskRow({ task, onToggle, onEdit, onDelete, showProject, projectAccents, onNavigateProject, urgent }) {
  const tl = formatTime(task.estimated_minutes);
  const accent = task.project&&projectAccents ? projectAccents[task.project] : null;
  const days = urgent ? daysOverdue(task.due_date) : 0;
  return (
    <div className={`task-row${urgent?" is-overdue":""}`}>
      <button className={`check-btn${task.archived?" checked":""}${urgent?" urgent":""}`} onClick={onToggle} />
      <div className="task-body" onClick={onEdit}>
        <div className={`task-title${task.archived?" done":""}${urgent?" overdue-title-text":""}`}>{task.title}</div>
        <div className="task-meta">
          {!urgent&&<span className={`p-indicator ${task.priority}`}>{task.priority==="medium"?"Med":task.priority}</span>}
          {urgent&&<span className="overdue-days">{days===1?"1 day overdue":`${days} days overdue`}</span>}
          {tl&&<span className="meta-txt">· {tl}</span>}
          {showProject&&task.project&&accent&&(
            <button className="proj-pill" style={{background:accent.bg,color:accent.dot,border:`1px solid ${accent.border}`}}
              onClick={e=>{e.stopPropagation();onNavigateProject&&onNavigateProject(task.project);}}>
              {task.project}</button>)}
          {(task.tags||[]).map(t=><span key={t} className="tag-chip">#{t}</span>)}
        </div>
      </div>
      <div className="row-actions">
        <button className="act-btn" onClick={onEdit}>✎</button>
        <button className="act-btn del" onClick={onDelete}>✕</button>
      </div>
    </div>
  );
}

function TodayView({ tasks, context, projectAccents, onAdd, onEdit, onToggle, onDelete, onNavigateProject, onCtxChange }) {
  const [showMoreWeek, setShowMoreWeek] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const ctx = tasks.filter(t=>t.context===context);
  const active = ctx.filter(t=>!t.archived);
  const overdue = useMemo(()=>sortTasks(active.filter(t=>isOverdue(t.due_date))),[tasks,context]);
  const dueToday = useMemo(()=>sortTasks(active.filter(t=>isToday(t.due_date))),[tasks,context]);
  const thisWeek = useMemo(()=>sortTasks(active.filter(t=>t.due_date&&isThisWeek(t.due_date)&&!isToday(t.due_date))),[tasks,context]);
  const completedToday = useMemo(()=>ctx.filter(t=>t.archived&&t.completed_at&&t.completed_at.slice(0,10)===todayStr())
    .sort((a,b)=>b.completed_at.localeCompare(a.completed_at)),[tasks,context]);
  const doneCount = completedToday.length;
  const wv = showMoreWeek ? thisWeek : thisWeek.slice(0,3);
  const wh = thisWeek.length - 3;
  const todayFmt = new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
  const allClear = overdue.length===0&&dueToday.length===0&&thisWeek.length===0;
  const ctxC = CTX[context];
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
            {active.length>0&&<span className="date-remaining">{active.length} task{active.length!==1?"s":""} remaining</span>}
          </div>
          <div className="header-right">
            {doneCount>0&&<span className={`done-badge${doneCount>0?" has-done":""}`}>{doneCount} done</span>}
            <button className="btn-new-white" style={{color:ctxC.bgDeep}} onClick={()=>onAdd(null)}>+ New task</button>
          </div>
        </div>
      </div>
      <div className="list-wrap">
        {overdue.length>0&&<div className="overdue-block">
          <div className="overdue-header"><div className="overdue-icon"/><span className="overdue-title-label">Needs attention</span><span className="overdue-count">{overdue.length}</span></div>
          {overdue.map(t=><TaskRow key={t.id} task={t} urgent showProject projectAccents={projectAccents}
            onToggle={()=>onToggle(t.id)} onEdit={()=>onEdit(t)} onDelete={()=>onDelete(t.id)} onNavigateProject={onNavigateProject}/>)}
        </div>}
        {dueToday.length>0&&<div className="section-block">
          <div className="section-header"><span className="section-title">Due today</span></div>
          {dueToday.map(t=><TaskRow key={t.id} task={t} showProject projectAccents={projectAccents}
            onToggle={()=>onToggle(t.id)} onEdit={()=>onEdit(t)} onDelete={()=>onDelete(t.id)} onNavigateProject={onNavigateProject}/>)}
        </div>}
        {thisWeek.length>0&&<div className="section-block">
          <div className="section-header">
            <span className="section-title">This week</span>
            {!showMoreWeek&&wh>0&&<button className="section-show-more" onClick={()=>setShowMoreWeek(true)}>+{wh} more</button>}
          </div>
          {wv.map(t=><TaskRow key={t.id} task={t} showProject projectAccents={projectAccents}
            onToggle={()=>onToggle(t.id)} onEdit={()=>onEdit(t)} onDelete={()=>onDelete(t.id)} onNavigateProject={onNavigateProject}/>)}
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
          {showCompleted&&completedToday.map(t=><TaskRow key={t.id} task={t} showProject projectAccents={projectAccents}
            onToggle={()=>onToggle(t.id)} onEdit={()=>onEdit(t)} onDelete={()=>onDelete(t.id)} onNavigateProject={onNavigateProject}/>)}
        </div>}
      </div>
    </>
  );
}

function ProjectsView({ tasks, context, projectAccents, onAdd, onSelectProject, onCtxChange, onEdit, onToggle, onDelete }) {
  const ctxTasks = tasks.filter(t=>t.context===context);
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
              {noProject.map(t=><TaskRow key={t.id} task={t} showProject={false} onToggle={()=>onToggle(t.id)} onEdit={()=>onEdit(t)} onDelete={()=>onDelete(t.id)}/>)}
            </div>}
          </>}
      </div>
    </>
  );
}

function ProjectDetailView({ projectName, tasks, context, projectAccents, onBack, onAdd, onEdit, onToggle, onDelete }) {
  const [showArchived, setShowArchived] = useState(false);
  const accent = projectAccents[projectName];
  const ctxC = CTX[context];
  const active = useMemo(()=>sortTasks(tasks.filter(t=>t.project===projectName&&t.context===context&&!t.archived)),[tasks,projectName,context]);
  const archived = useMemo(()=>tasks.filter(t=>t.project===projectName&&t.context===context&&t.archived)
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
          :active.map(t=><TaskRow key={t.id} task={t} showProject={false}
              onToggle={()=>onToggle(t.id)} onEdit={()=>onEdit(t)} onDelete={()=>onDelete(t.id)}/>)}
        {archived.length>0&&<>
          <div className="arch-toggle" onClick={()=>setShowArchived(v=>!v)}>
            <span>{showArchived?"▾":"▸"}</span> Completed ({archived.length})
          </div>
          {showArchived&&archived.map(t=><TaskRow key={t.id} task={t} showProject={false}
            onToggle={()=>onToggle(t.id)} onEdit={()=>onEdit(t)} onDelete={()=>onDelete(t.id)}/>)}
        </>}
      </div>
    </>
  );
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [context, setContext] = useState("orinoco");
  const [tab, setTab] = useState("today");
  const [selectedProject, setSelectedProject] = useState(null);
  const [modal, setModal] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
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

  const hasOverdue = useMemo(()=>tasks.some(t=>!t.archived&&t.context===context&&isOverdue(t.due_date)),[tasks,context]);

  function updateTasks(fn) { setTasks(prev=>fn(prev)); }
  function openAdd(proj) { setDefaultProject(proj); setEditTarget(null); setModal("form"); }
  function openEdit(task) { setEditTarget(task); setDefaultProject(null); setModal("form"); }

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

  async function handleToggle(id) {
    const task=tasks.find(t=>t.id===id);
    const changes={completed:!task.archived,archived:!task.archived,completed_at:!task.archived?new Date().toISOString():null};
    updateTasks(prev=>prev.map(t=>t.id===id?{...t,...changes}:t));
    if (supabase) await supabase.from("tasks").update(changes).eq("id",id);
  }

  async function handleDelete(id) {
    updateTasks(prev=>prev.filter(t=>t.id!==id));
    if (supabase) await supabase.from("tasks").delete().eq("id",id);
  }

  function handleCtxChange(c) { setContext(c); setSelectedProject(null); }
  function handleTabChange(t) { setTab(t); setSelectedProject(null); }
  function handleNavigateProject(proj) { setTab("projects"); setSelectedProject(proj); }

  function renderMain() {
    if (tab==="today") return <TodayView tasks={tasks} context={context} projectAccents={projectAccents}
      onAdd={openAdd} onEdit={openEdit} onToggle={handleToggle} onDelete={handleDelete}
      onNavigateProject={handleNavigateProject} onCtxChange={handleCtxChange}/>;
    if (selectedProject) return <ProjectDetailView projectName={selectedProject} tasks={tasks} context={context} projectAccents={projectAccents}
      onBack={()=>setSelectedProject(null)} onAdd={openAdd} onEdit={openEdit} onToggle={handleToggle} onDelete={handleDelete}/>;
    return <ProjectsView tasks={tasks} context={context} projectAccents={projectAccents}
      onAdd={openAdd} onSelectProject={setSelectedProject} onCtxChange={handleCtxChange}
      onEdit={openEdit} onToggle={handleToggle} onDelete={handleDelete}/>;
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
      </div>
    </>
  );
}
