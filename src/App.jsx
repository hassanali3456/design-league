import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, get } from "firebase/database";

// ─── PASTE YOUR FIREBASE CONFIG HERE ───────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAinqIr5AAedlMX7lOGq2SgBh94HDDxNsE",
  authDomain: "design-league-9be60.firebaseapp.com",
  databaseURL: "https://design-league-9be60-default-rtdb.firebaseio.com",
  projectId: "design-league-9be60",
  storageBucket: "design-league-9be60.firebasestorage.app",
  messagingSenderId: "994579850885",
  appId: "1:994579850885:web:fbf488697d00a2f7b02bec"
};
// ───────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

const ADMIN_PASSWORD = "design2025";

const RANK_STYLE = [
  { color: "#FFD700", glow: "rgba(255,215,0,0.18)", medal: "🥇" },
  { color: "#C0C0C0", glow: "rgba(192,192,192,0.10)", medal: "🥈" },
  { color: "#CD7F32", glow: "rgba(205,127,50,0.12)", medal: "🥉" },
];

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${String(m % 60).padStart(2,"0")}m ${String(s % 60).padStart(2,"0")}s`;
  return `${String(m).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
}

function fmtMs(ms) {
  const s      = Math.floor(ms / 1000);
  const m      = Math.floor(s / 60);
  const centis = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}.${String(centis).padStart(2,"0")}`;
}

// ── Firebase helpers ────────────────────────────────────────────────────────
function dbRef(cat) { return ref(db, `races/${cat}`); }

async function readCat(cat) {
  const snap = await get(dbRef(cat));
  return snap.exists() ? snap.val() : { active: null, history: [] };
}

async function writeCat(cat, data) {
  await set(dbRef(cat), data);
}
// ───────────────────────────────────────────────────────────────────────────

export default function App() {
  const [starter, setStarter] = useState(null);
  const [pro,     setPro]     = useState(null);
  const [tab,         setTab]         = useState("starter");
  const [view,        setView]        = useState("board");
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [pw,          setPw]          = useState("");
  const [pwErr,       setPwErr]       = useState(false);
  const [now,         setNow]         = useState(Date.now());
  const [nameInput,   setNameInput]   = useState("");
  const [submitMsg,   setSubmitMsg]   = useState("");
  const [adminCat,    setAdminCat]    = useState("starter");
  const [raceLabel,   setRaceLabel]   = useState("");
  const [busy,        setBusy]        = useState(false);
  const [loading,     setLoading]     = useState(true);

  // Live timer tick
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(id);
  }, []);

  // Subscribe to Firebase in real-time
  useEffect(() => {
    const unsubStarter = onValue(dbRef("starter"), snap => {
      setStarter(snap.exists() ? snap.val() : { active: null, history: [] });
      setLoading(false);
    });
    const unsubPro = onValue(dbRef("pro"), snap => {
      setPro(snap.exists() ? snap.val() : { active: null, history: [] });
    });
    return () => { unsubStarter(); unsubPro(); };
  }, []);

  function setCatData(cat, data) {
    if (cat === "starter") setStarter(data);
    else setPro(data);
  }

  function getCatData(cat) {
    return cat === "starter" ? starter : pro;
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  async function startRace(cat) {
    if (!raceLabel.trim() || busy) return;
    setBusy(true);
    const current = await readCat(cat);
    await writeCat(cat, {
      ...current,
      active: { id: Date.now().toString(), label: raceLabel.trim(), startedAt: Date.now(), entries: [] },
    });
    setRaceLabel("");
    setBusy(false);
  }

  async function endRace(cat) {
    if (busy) return;
    setBusy(true);
    const current = await readCat(cat);
    if (!current.active) { setBusy(false); return; }
    await writeCat(cat, {
      active: null,
      history: [current.active, ...(current.history || [])],
    });
    setBusy(false);
  }

  async function handleSubmit(cat) {
    const catData = getCatData(cat);
    if (!catData?.active || !nameInput.trim() || busy) return;
    setBusy(true);

    // Re-read from DB to avoid race conditions
    const current = await readCat(cat);
    if (!current.active) { setBusy(false); setSubmitMsg("Race has ended."); setTimeout(() => setSubmitMsg(""), 3000); return; }

    const elapsed  = Date.now() - current.active.startedAt;
    const existing = (current.active.entries || []).find(
      e => e.name.toLowerCase() === nameInput.trim().toLowerCase()
    );
    if (existing) {
      setBusy(false);
      setSubmitMsg("You already submitted!");
      setTimeout(() => setSubmitMsg(""), 3000);
      return;
    }

    const entry  = { id: Date.now().toString(), name: nameInput.trim(), elapsed };
    const sorted = [...(current.active.entries || []), entry].sort((a, b) => a.elapsed - b.elapsed);
    await writeCat(cat, { ...current, active: { ...current.active, entries: sorted } });

    setNameInput("");
    setSubmitMsg(`✓ Recorded! Your time: ${fmtMs(elapsed)}`);
    setTimeout(() => setSubmitMsg(""), 4000);
    setBusy(false);
  }

  async function removeEntry(cat, id) {
    if (busy) return;
    setBusy(true);
    const current = await readCat(cat);
    await writeCat(cat, {
      ...current,
      active: { ...current.active, entries: (current.active.entries || []).filter(e => e.id !== id) },
    });
    setBusy(false);
  }

  async function deleteHistory(cat, id) {
    if (busy) return;
    setBusy(true);
    const current = await readCat(cat);
    await writeCat(cat, { ...current, history: (current.history || []).filter(h => h.id !== id) });
    setBusy(false);
  }

  function handleLogin() {
    if (pw === ADMIN_PASSWORD) { setAdminAuthed(true); setView("admin"); setPwErr(false); }
    else setPwErr(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"#080808" }}>
      <div style={{ width:32, height:32, border:"3px solid #1a1a1a", borderTop:"3px solid #FFD700", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const catData = getCatData(tab);
  const active  = catData?.active;
  const elapsed = active ? now - active.startedAt : 0;
  const entries = active?.entries || [];

  return (
    <div style={s.root}>
      <div style={s.bgGlow} />

      {/* HEADER */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <div>
            <div style={s.logo}>DESIGN<span style={{ color:"#FFD700" }}> LEAGUE</span></div>
            <div style={s.logoSub}>UET Lahore · CAD Speed Trials</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={s.tabRow}>
              {["starter","pro"].map(c => (
                <button key={c} style={{ ...s.catTab, ...(tab===c ? s.catTabActive : {}) }}
                  onClick={() => { setTab(c); setView("board"); }}>
                  {c === "starter" ? "⚡ Starter" : "🔥 Pro"}
                </button>
              ))}
            </div>
            <button style={{ ...s.navBtn, ...(view!=="board" ? s.navBtnActive : {}) }}
              onClick={() => setView(adminAuthed ? "admin" : "login")}>Admin</button>
          </div>
        </div>
      </header>

      <main style={s.main}>

        {/* ── BOARD ── */}
        {view === "board" && (
          <div style={s.fadeUp}>
            {active ? (
              <div style={s.raceBanner}>
                <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                  <div style={s.raceDot} />
                  <div>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:16, color:"#fff" }}>{active.label}</div>
                    <div style={{ fontSize:10, color:"#FFD700", letterSpacing:2, marginTop:2 }}>{tab.toUpperCase()} · LIVE NOW</div>
                  </div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:9, color:"#555", letterSpacing:2 }}>ELAPSED</div>
                  <div style={s.timerValue}>{fmtTime(elapsed)}</div>
                </div>
              </div>
            ) : (
              <div style={s.noRaceBanner}>
                <div style={{ fontSize:26, opacity:0.4 }}>⏸</div>
                <div>
                  <div style={{ fontWeight:700, color:"#444" }}>No active race</div>
                  <div style={{ fontSize:12, color:"#2a2a2a", marginTop:3 }}>Waiting for admin to start the {tab} competition</div>
                </div>
              </div>
            )}

            {active && (
              <div style={s.submitCard}>
                <div style={{ fontSize:12, color:"#666", letterSpacing:0.5, marginBottom:10 }}>
                  Done with your model? Enter your name to record your finish time.
                </div>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  <input style={s.input} placeholder="Your full name" value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSubmit(tab)} />
                  <button style={{ ...s.btnGold, opacity: busy ? 0.5 : 1 }} onClick={() => handleSubmit(tab)} disabled={busy}>
                    {busy ? "..." : "Submit Time"}
                  </button>
                </div>
                {submitMsg && <div style={{ marginTop:10, fontSize:13, color:"#FFD700" }}>{submitMsg}</div>}
              </div>
            )}

            {active && (
              <div style={{ marginBottom:32 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                  <span style={s.pill}>Live Rankings</span>
                  <span style={s.badge}>{entries.length} submission{entries.length !== 1 ? "s" : ""}</span>
                </div>
                {entries.length === 0
                  ? <div style={s.empty}>No submissions yet — be the first to finish!</div>
                  : <Board entries={entries} />}
              </div>
            )}

            {catData?.history?.length > 0 && (
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                  <span style={{ ...s.pill, color:"#444" }}>Past Races</span>
                </div>
                {catData.history.map(h => (
                  <div key={h.id} style={s.pastCard}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                      <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:14, color:"#888" }}>{h.label}</span>
                      <span style={s.badge}>{h.entries?.length || 0} finishers</span>
                    </div>
                    {h.entries?.length > 0 && <Board entries={h.entries} compact />}
                  </div>
                ))}
              </div>
            )}

            {!active && !catData?.history?.length && (
              <div style={s.empty}>No races yet for the {tab} category.</div>
            )}
          </div>
        )}

        {/* ── LOGIN ── */}
        {view === "login" && (
          <div style={{ display:"flex", justifyContent:"center", paddingTop:80 }}>
            <div style={s.loginCard}>
              <div style={s.loginTitle}>ADMIN ACCESS</div>
              <div style={{ fontSize:12, color:"#444", marginBottom:4 }}>Enter password to manage races</div>
              <input style={{ ...s.input, ...(pwErr ? { border:"1px solid #8B0000" } : {}) }}
                type="password" placeholder="Password" value={pw}
                onChange={e => { setPw(e.target.value); setPwErr(false); }}
                onKeyDown={e => e.key === "Enter" && handleLogin()} />
              {pwErr && <div style={{ fontSize:12, color:"#c0392b" }}>Wrong password</div>}
              <button style={s.btnGold} onClick={handleLogin}>Enter</button>
            </div>
          </div>
        )}

        {/* ── ADMIN ── */}
        {view === "admin" && adminAuthed && (
          <div style={s.fadeUp}>
            <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
              <span style={s.pill}>Admin Panel</span>
            </div>

            <div style={s.tabRow}>
              {["starter","pro"].map(c => (
                <button key={c} style={{ ...s.catTab, ...(adminCat===c ? s.catTabActive : {}) }} onClick={() => setAdminCat(c)}>
                  {c === "starter" ? "⚡ Starter" : "🔥 Pro"}
                </button>
              ))}
            </div>

            {/* Race control */}
            <div style={{ ...s.adminCard, marginTop:20 }}>
              <div style={s.adminCardTitle}>Race Control · {adminCat.toUpperCase()}</div>

              {getCatData(adminCat)?.active ? (
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                    <div style={s.raceDot} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, color:"#fff" }}>{getCatData(adminCat).active.label}</div>
                      <div style={s.timerValue}>{fmtTime(now - getCatData(adminCat).active.startedAt)}</div>
                    </div>
                    <button style={s.btnDanger} onClick={() => endRace(adminCat)} disabled={busy}>End Race</button>
                  </div>

                  <div style={{ marginTop:18 }}>
                    <div style={s.smallLabel}>Submissions ({getCatData(adminCat).active.entries?.length || 0})</div>
                    {!getCatData(adminCat).active.entries?.length
                      ? <div style={s.empty}>Waiting for participants...</div>
                      : (getCatData(adminCat).active.entries || []).map((e, i) => (
                        <div key={e.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 0", borderBottom:"1px solid #141414" }}>
                          <span style={{ color:RANK_STYLE[i]?.color||"#555", fontFamily:"'Bebas Neue',sans-serif", fontSize:13, minWidth:28 }}>
                            {RANK_STYLE[i]?.medal || `#${i+1}`}
                          </span>
                          <span style={{ flex:1, fontSize:14, color:"#ccc" }}>{e.name}</span>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:"#666" }}>{fmtMs(e.elapsed)}</span>
                          <button style={s.btnXS} onClick={() => removeEntry(adminCat, e.id)} disabled={busy}>✕</button>
                        </div>
                      ))
                    }
                  </div>
                </div>
              ) : (
                <div>
                  <div style={s.smallLabel}>Start a new race</div>
                  <div style={{ display:"flex", gap:10, marginTop:8, flexWrap:"wrap" }}>
                    <input style={s.input} placeholder={`e.g. "Week 4 — Bracket Assembly"`}
                      value={raceLabel} onChange={e => setRaceLabel(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && startRace(adminCat)} />
                    <button style={{ ...s.btnGold, opacity: busy||!raceLabel.trim() ? 0.5 : 1 }}
                      onClick={() => startRace(adminCat)} disabled={busy || !raceLabel.trim()}>
                      {busy ? "..." : "Start Timer"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* History */}
            {getCatData(adminCat)?.history?.length > 0 && (
              <div style={s.adminCard}>
                <div style={s.adminCardTitle}>Race History</div>
                {getCatData(adminCat).history.map(h => (
                  <div key={h.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 0", borderBottom:"1px solid #141414" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, color:"#bbb" }}>{h.label}</div>
                      <div style={s.smallLabel}>{h.entries?.length || 0} finishers</div>
                    </div>
                    <button style={s.btnXS} onClick={() => deleteHistory(adminCat, h.id)} disabled={busy}>Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Syne:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 8px #FF4444}50%{opacity:.4;box-shadow:0 0 2px #FF4444}}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:#080808}
        ::-webkit-scrollbar-thumb{background:#222;border-radius:3px}
        button:disabled{opacity:0.4 !important;cursor:not-allowed}
      `}</style>
    </div>
  );
}

function Board({ entries, compact }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap: compact ? 6 : 10 }}>
      {entries.map((e, i) => {
        const rs = RANK_STYLE[i] || null;
        return (
          <div key={e.id} style={{
            display:"flex", alignItems:"center", gap:14,
            background: rs ? `linear-gradient(90deg,${rs.glow},transparent 70%)` : "#0d0d0d",
            border:`1px solid ${rs ? rs.color+"55" : "#161616"}`,
            borderRadius: compact ? 8 : 12,
            padding: compact ? "10px 14px" : "14px 20px",
            animation:"fadeUp 0.3s ease both",
            animationDelay:`${i*40}ms`,
          }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: compact ? 15 : 20, color: rs ? rs.color : "#333", minWidth:30, textAlign:"center" }}>
              {rs ? rs.medal : `#${i+1}`}
            </div>
            <div style={{ flex:1, fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize: compact ? 13 : 15, color: rs ? "#fff" : "#555" }}>
              {e.name}
            </div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize: compact ? 13 : 17, color: rs ? rs.color : "#333", fontWeight:600, letterSpacing:1 }}>
              {fmtMs(e.elapsed)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const s = {
  root:         { minHeight:"100vh", background:"#080808", color:"#ddd", fontFamily:"'Syne',sans-serif", position:"relative" },
  bgGlow:       { position:"fixed", inset:0, pointerEvents:"none", zIndex:0, background:"radial-gradient(ellipse 70% 30% at 50% 0%,rgba(255,180,0,0.05),transparent)" },
  header:       { position:"sticky", top:0, zIndex:100, background:"rgba(8,8,8,0.96)", backdropFilter:"blur(14px)", borderBottom:"1px solid #121212" },
  headerInner:  { maxWidth:860, margin:"0 auto", padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 },
  logo:         { fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:3, color:"#fff" },
  logoSub:      { fontSize:10, color:"#3a3a3a", letterSpacing:2, textTransform:"uppercase" },
  tabRow:       { display:"flex", gap:6 },
  catTab:       { background:"transparent", border:"1px solid #1c1c1c", color:"#555", padding:"6px 16px", borderRadius:6, cursor:"pointer", fontSize:13, fontFamily:"'Syne',sans-serif", fontWeight:600, transition:"all 0.2s" },
  catTabActive: { background:"#111400", border:"1px solid #FFD70060", color:"#FFD700" },
  navBtn:       { background:"transparent", border:"1px solid #1c1c1c", color:"#555", padding:"6px 14px", borderRadius:6, cursor:"pointer", fontSize:13, fontFamily:"'Syne',sans-serif" },
  navBtnActive: { border:"1px solid #444", color:"#ccc" },
  main:         { maxWidth:860, margin:"0 auto", padding:"28px 24px 80px", position:"relative", zIndex:1 },
  fadeUp:       { animation:"fadeUp 0.35s ease both" },
  raceBanner:   { display:"flex", alignItems:"center", justifyContent:"space-between", background:"linear-gradient(100deg,#0f0c00,#0a0a0a)", border:"1px solid #2e2400", borderRadius:14, padding:"18px 22px", marginBottom:20, gap:16 },
  raceDot:      { width:10, height:10, borderRadius:"50%", background:"#FF4444", flexShrink:0, animation:"pulse 1.4s ease-in-out infinite" },
  timerValue:   { fontFamily:"'JetBrains Mono',monospace", fontSize:26, color:"#FFD700", fontWeight:600, letterSpacing:2, marginTop:2 },
  noRaceBanner: { display:"flex", alignItems:"center", gap:16, background:"#0b0b0b", border:"1px solid #161616", borderRadius:14, padding:"18px 22px", marginBottom:20 },
  submitCard:   { background:"#0d0d0d", border:"1px solid #1e1e1e", borderRadius:12, padding:"18px 20px", marginBottom:24 },
  input:        { background:"#0a0a0a", border:"1px solid #1e1e1e", borderRadius:8, padding:"10px 14px", color:"#ccc", fontSize:14, fontFamily:"'Syne',sans-serif", outline:"none", flex:1, minWidth:180 },
  btnGold:      { background:"#FFD700", color:"#000", border:"none", borderRadius:8, padding:"10px 22px", cursor:"pointer", fontSize:14, fontWeight:700, fontFamily:"'Syne',sans-serif", whiteSpace:"nowrap", flexShrink:0 },
  btnDanger:    { background:"transparent", border:"1px solid #8B0000", color:"#c0392b", borderRadius:7, padding:"7px 14px", cursor:"pointer", fontSize:13, fontFamily:"'Syne',sans-serif" },
  btnXS:        { background:"transparent", border:"1px solid #1e1e1e", color:"#555", borderRadius:5, padding:"4px 10px", cursor:"pointer", fontSize:12, fontFamily:"'Syne',sans-serif" },
  pill:         { fontFamily:"'Bebas Neue',sans-serif", fontSize:18, letterSpacing:2, color:"#fff" },
  badge:        { fontSize:11, color:"#333", background:"#111", padding:"3px 10px", borderRadius:20 },
  pastCard:     { background:"#0c0c0c", border:"1px solid #151515", borderRadius:12, padding:"16px 18px", marginBottom:12 },
  loginCard:    { background:"#0e0e0e", border:"1px solid #1e1e1e", borderRadius:14, padding:"40px 36px", width:"100%", maxWidth:360, display:"flex", flexDirection:"column", gap:12 },
  loginTitle:   { fontFamily:"'Bebas Neue',sans-serif", fontSize:30, letterSpacing:3, color:"#fff" },
  adminCard:    { background:"#0e0e0e", border:"1px solid #1a1a1a", borderRadius:12, padding:"20px 22px", marginBottom:16 },
  adminCardTitle:{ fontFamily:"'Bebas Neue',sans-serif", fontSize:15, letterSpacing:2, color:"#444", marginBottom:16 },
  smallLabel:   { fontSize:10, color:"#3a3a3a", letterSpacing:1.5, textTransform:"uppercase", marginBottom:8 },
  empty:        { color:"#2e2e2e", fontSize:13, padding:"20px 0", textAlign:"center" },
};
