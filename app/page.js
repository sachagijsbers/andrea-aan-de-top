"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, saveActivity, getActivities, deleteActivity } from "@/lib/supabase";
import { parseGPX, parseFIT } from "@/lib/parsers";
import { getMotivation } from "@/lib/motivation";
import { compareWithFamousClimbs, matchClimbProfile } from "@/lib/famous-climbs";
import { calculateVAM, estimatePowerPerKg, analyzePacing, analyzeFatigue, analyzeRecovery, getHRZones, calculateEffortScore, getHRZoneColor } from "@/lib/insights";

// ==================== LOGIN ====================
function LoginScreen({ onLogin }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);
  const appPassword = process.env.NEXT_PUBLIC_APP_PASSWORD || "andrea2026";

  function handleLogin(e) {
    e.preventDefault();
    if (pw === appPassword) {
      if (typeof window !== "undefined") localStorage.setItem("andrea-auth", "true");
      onLogin();
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>{"\u{1F3D4}\uFE0F"}</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, background: "linear-gradient(135deg, #2ecc71, #1abc9c)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Andrea Aan De Top
        </h1>
        <p style={{ color: "var(--text-dim)", fontSize: 14, marginTop: 6 }}>Fietsen, hardlopen & bergbeklimmen</p>
      </div>
      <form onSubmit={handleLogin} style={{ width: "100%", maxWidth: 320 }}>
        <input
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          placeholder="Wachtwoord"
          autoFocus
          style={{
            width: "100%", padding: "14px 18px", borderRadius: 12,
            border: error ? "2px solid #e74c3c" : "2px solid #e0e0e0",
            fontSize: 16, fontFamily: "inherit", outline: "none",
            background: "white", color: "var(--text)", textAlign: "center",
            transition: "border 0.3s"
          }}
        />
        {error && <p style={{ color: "#e74c3c", fontSize: 13, textAlign: "center", marginTop: 8 }}>Verkeerd wachtwoord</p>}
        <button
          type="submit"
          style={{
            width: "100%", marginTop: 12, padding: "14px",
            background: "linear-gradient(135deg, #2ecc71, #1abc9c)",
            color: "white", border: "none", borderRadius: 12,
            fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit"
          }}
        >
          Inloggen
        </button>
      </form>
    </div>
  );
}

// ==================== QUOTES & MOPPEN ====================
const homeQuotes = [
  "De berg roept. En Andrea luistert.",
  "Elke stap brengt je dichter bij de top.",
  "Niet de berg die je beklimt maakt je moe, maar het steentje in je schoen.",
  "Life is like riding a bicycle. To keep your balance, you must keep moving. — Einstein",
  "De beste uitzichten komen na de zwaarste klimmen.",
  "Het gaat niet om hoe snel je gaat, maar dat je gaat.",
  "Bergen zijn stille leraren.",
  "Avontuur begint waar het asfalt eindigt.",
  "Benen van staal, hart van goud.",
  "Het pad omhoog is nooit makkelijk, maar altijd de moeite waard.",
];

const tripJokes = [
  "Waarom nemen bergbeklimmers nooit de lift? Omdat ze bang zijn voor de hoogtepunten!",
  "Wat zei de berg tegen de wandelaar? Niks, bergen zijn stil. Maar de wind fluisterde: 'Ga door!'",
  "Twee fietsers op een col. Zegt de ene: 'Ik kan niet meer.' Zegt de andere: 'Ik ook niet, maar mijn benen weten het nog niet.'",
  "Waarom was de hardloper zo blij? Omdat het parcours rondliep!",
  "Ken je die grap over de berg? Laat maar, die gaat over je hoofd.",
  "Wat is het verschil tussen een wandelaar en een toerist? De wandelaar heeft blaren, de toerist heeft selfies.",
  "Waarom gaan bergen nooit naar de kapper? Ze hebben al pieken!",
  "Een wandelaar vraagt aan een herder: 'Hoe ver is het naar de top?' De herder: 'Vanaf hier een uur. Vanaf de top vijf minuten.'",
];

function getRandomQuote() {
  return homeQuotes[Math.floor(Math.random() * homeQuotes.length)];
}

function getRandomJoke() {
  return tripJokes[Math.floor(Math.random() * tripJokes.length)];
}

// LocalStorage helpers for trips
function loadTrips() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("andrea-trips") || "[]");
  } catch { return []; }
}

function saveTrips(trips) {
  if (typeof window === "undefined") return;
  localStorage.setItem("andrea-trips", JSON.stringify(trips));
}

export default function Home() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("andrea-auth") === "true") {
      setAuthed(true);
    }
  }, []);

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  return <Dashboard />;
}

function Dashboard() {
  const [trips, setTrips] = useState([]);
  const [currentTrip, setCurrentTrip] = useState(null); // trip index or null (home)
  const [currentView, setCurrentView] = useState("summary");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Laden...");
  const [dragover, setDragover] = useState(false);
  const [editingTrip, setEditingTrip] = useState(false);
  const [newTripName, setNewTripName] = useState("");
  const [newTripType, setNewTripType] = useState("hiking");
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [joke, setJoke] = useState("");
  const [quote] = useState(getRandomQuote);
  const fileRef = useRef(null);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = loadTrips();
    if (saved.length > 0) setTrips(saved);
  }, []);

  // Save to localStorage when trips change
  useEffect(() => {
    if (trips.length > 0) saveTrips(trips);
  }, [trips]);

  // Also try Supabase
  useEffect(() => {
    (async () => {
      try {
        const data = await getActivities();
        if (data && data.length > 0 && trips.length === 0) {
          setTrips([{ id: crypto.randomUUID(), name: "Mijn activiteiten", activities: data }]);
        }
      } catch {}
    })();
  }, []);

  const TRIP_TYPES = {
    hiking: { label: "Bergwandelen", icon: "\u{1F3D4}\uFE0F", unit: "wandeling" },
    cycling: { label: "Fietsen", icon: "\u{1F6B4}\u200D\u2640\uFE0F", unit: "rit" },
    running: { label: "Hardlopen", icon: "\u{1F3C3}\u200D\u2640\uFE0F", unit: "loop" },
    trail: { label: "Trailrunning", icon: "\u26F0\uFE0F", unit: "trail" },
  };

  function createTrip(name, type) {
    const trip = { id: crypto.randomUUID(), name: name || "Nieuw avontuur", type: type || "hiking", activities: [] };
    const updated = [...trips, trip];
    setTrips(updated);
    setCurrentTrip(updated.length - 1);
    setCurrentView("summary");
    setShowNewTrip(false);
    setNewTripName("");
    setNewTripType("hiking");
  }

  function renameTrip(idx, name) {
    setTrips(prev => prev.map((t, i) => i === idx ? { ...t, name } : t));
  }

  function deleteTrip(idx) {
    if (!confirm("Avontuur verwijderen inclusief alle activiteiten?")) return;
    setTrips(prev => prev.filter((_, i) => i !== idx));
    setCurrentTrip(null);
  }

  async function handleFiles(files) {
    if (currentTrip === null) return;
    setLoading(true);
    setLoadingMsg("Bestanden verwerken...");
    const newActivities = [];

    for (const file of files) {
      try {
        const ext = file.name.split(".").pop().toLowerCase();
        let parsed;

        if (ext === "gpx") {
          const text = await file.text();
          parsed = parseGPX(text);
        } else if (ext === "fit") {
          const buffer = await file.arrayBuffer();
          parsed = parseFIT(buffer);
        } else continue;

        parsed.fileName = file.name;

        // Try Supabase
        try {
          const saved = await saveActivity(parsed);
          newActivities.push(saved);
        } catch {
          newActivities.push({
            id: crypto.randomUUID(),
            name: parsed.name,
            date: parsed.date?.toISOString(),
            distance: parsed.totalDistance,
            duration: parsed.totalTime,
            elevation_gain: parsed.elevationGain,
            elevation_loss: parsed.elevationLoss,
            avg_speed: parsed.avgSpeed,
            max_speed: parsed.maxSpeed,
            avg_hr: parsed.avgHR,
            max_hr: parsed.maxHR,
            avg_cadence: parsed.avgCadence,
            avg_power: parsed.avgPower,
            file_name: file.name,
            route_data: parsed.points.map(p => ({
              lat: p.lat, lon: p.lon, ele: p.elevation,
              dist: p.distance, spd: p.speed,
              hr: p.hr, cad: p.cadence, pwr: p.power,
              t: p.time?.toISOString()
            })),
            climbs: parsed.climbs,
          });
        }
      } catch (err) {
        alert("Kon bestand niet laden: " + file.name + "\n" + err.message);
      }
    }

    if (newActivities.length > 0) {
      setTrips(prev => prev.map((t, i) =>
        i === currentTrip ? { ...t, activities: [...t.activities, ...newActivities] } : t
      ));
      setCurrentView(0);
    }
    setLoading(false);
  }

  function handleDeleteActivity(actId) {
    if (!confirm("Activiteit verwijderen?")) return;
    setTrips(prev => prev.map((t, i) =>
      i === currentTrip ? { ...t, activities: t.activities.filter(a => a.id !== actId) } : t
    ));
    setCurrentView("summary");
  }

  const trip = currentTrip !== null ? trips[currentTrip] : null;
  const activities = trip?.activities || [];
  const currentActivity = typeof currentView === "number" ? activities[currentView] : null;
  const motivationMsgs = currentActivity ? getMotivation(currentActivity, activities) : [];

  // ===== HOME SCREEN (trip list) =====
  if (currentTrip === null) {
    return (
      <>
        {loading && <div className="loading-overlay"><div className="spinner" /><p>{loadingMsg}</p></div>}

        <header className="header">
          <div className="header-row">
            <div>
              <h1>Andrea Aan De Top</h1>
              <p className="sub">Fietsen, hardlopen & bergbeklimmen</p>
            </div>
          </div>
        </header>

        {/* Quote */}
        <div className="motivation" style={{ margin: "20px 20px 16px" }}>
          <p style={{ fontStyle: "italic" }}>{quote}</p>
        </div>

        <div className="section">
          <h3 className="section-title">Mijn avonturen</h3>

          {trips.length === 0 && !showNewTrip && (
            <div style={{ textAlign: "center", padding: "30px 20px", color: "var(--text-dim)" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>&#x1F3D4;&#xFE0F;</div>
              <p style={{ fontSize: 15, marginBottom: 4 }}>Nog geen avonturen</p>
              <p style={{ fontSize: 13 }}>Maak je eerste avontuur aan en upload je Garmin bestanden!</p>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {trips.map((t, i) => {
              const acts = t.activities || [];
              const totalDist = acts.reduce((s, a) => s + (a.distance || 0), 0);
              const totalElev = acts.reduce((s, a) => s + (a.elevation_gain || 0), 0);
              const tt = TRIP_TYPES[t.type] || TRIP_TYPES.hiking;
              return (
                <div
                  key={t.id}
                  className="record-card"
                  style={{ cursor: "pointer" }}
                  onClick={() => { setCurrentTrip(i); setCurrentView("summary"); }}
                >
                  <span className="trophy" style={{ fontSize: 32 }}>{tt.icon}</span>
                  <div className="record-info" style={{ flex: 1 }}>
                    <h4>{t.name}</h4>
                    <p>
                      {tt.label} &middot; {acts.length} {acts.length === 1 ? "activiteit" : "activiteiten"}
                      {totalDist > 0 && <> &middot; {totalDist.toFixed(0)} km</>}
                      {totalElev > 0 && <> &middot; {totalElev.toLocaleString()}m hoogte</>}
                    </p>
                  </div>
                  <span style={{ color: "var(--text-dim)", fontSize: 20 }}>&rsaquo;</span>
                </div>
              );
            })}
          </div>

          {/* New trip form */}
          {showNewTrip ? (
            <div className="chart-box" style={{ marginTop: 12 }}>
              {joke && (
                <p style={{ fontSize: 13, color: "#7f8c8d", fontStyle: "italic", marginBottom: 12, lineHeight: 1.5, padding: "10px 12px", background: "#f0faf0", borderRadius: 10 }}>
                  {joke}
                </p>
              )}
              <h4 style={{ color: "var(--text)", fontWeight: 600, marginBottom: 10 }}>Nieuw avontuur</h4>

              {/* Type keuze */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 12 }}>
                {Object.entries(TRIP_TYPES).map(([key, val]) => (
                  <button
                    key={key}
                    onClick={() => setNewTripType(key)}
                    style={{
                      padding: "12px 10px", borderRadius: 10, border: newTripType === key ? "2px solid var(--accent)" : "2px solid #e0e0e0",
                      background: newTripType === key ? "rgba(46,204,113,0.08)" : "white",
                      cursor: "pointer", fontFamily: "inherit", textAlign: "center", transition: "all 0.2s"
                    }}
                  >
                    <div style={{ fontSize: 24 }}>{val.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginTop: 4 }}>{val.label}</div>
                  </button>
                ))}
              </div>

              <input
                value={newTripName}
                onChange={e => setNewTripName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createTrip(newTripName, newTripType)}
                placeholder={newTripType === "hiking" ? "Bijv. Dolomieten augustus" : newTripType === "cycling" ? "Bijv. Alpen fietstocht" : "Bijv. Hardlooptraining zomer"}
                autoFocus
                style={{
                  width: "100%", padding: "10px 14px", border: "2px solid #e0e0e0",
                  borderRadius: 10, fontSize: 14, fontFamily: "inherit", outline: "none",
                  background: "white", color: "var(--text)", marginBottom: 10
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => createTrip(newTripName, newTripType)}
                  style={{
                    flex: 1, padding: "10px", background: "var(--accent)", color: "white",
                    border: "none", borderRadius: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit"
                  }}
                >
                  Aanmaken
                </button>
                <button
                  onClick={() => { setShowNewTrip(false); setNewTripName(""); }}
                  style={{
                    padding: "10px 16px", background: "none", color: "var(--text-dim)",
                    border: "1px solid #ddd", borderRadius: 10, cursor: "pointer", fontFamily: "inherit"
                  }}
                >
                  Annuleer
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setShowNewTrip(true); setJoke(getRandomJoke()); }}
              style={{
                width: "100%", marginTop: 12, padding: "14px", background: "var(--accent)",
                color: "white", border: "none", borderRadius: 12, fontSize: 15,
                fontWeight: 600, cursor: "pointer", fontFamily: "inherit"
              }}
            >
              + Nieuw avontuur
            </button>
          )}
        </div>
        <div className="bottom-spacer" />
      </>
    );
  }

  // ===== TRIP VIEW =====
  return (
    <>
      {loading && <div className="loading-overlay"><div className="spinner" /><p>{loadingMsg}</p></div>}

      <header className="header">
        <div className="header-row">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => setCurrentTrip(null)}
              style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 16 }}
            >
              &larr;
            </button>
            <div>
              <h1>Andrea Aan De Top</h1>
              {!editingTrip ? (
                <p className="sub" onClick={() => setEditingTrip(true)} style={{ cursor: "pointer" }}>
                  {trip.name} &#x270E;
                </p>
              ) : (
                <input
                  value={trip.name}
                  onChange={e => renameTrip(currentTrip, e.target.value)}
                  onBlur={() => setEditingTrip(false)}
                  onKeyDown={e => e.key === "Enter" && setEditingTrip(false)}
                  autoFocus
                  style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", fontSize: 12, padding: "2px 6px", borderRadius: 4, outline: "none", fontFamily: "inherit" }}
                />
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="upload-section">
        <div
          className={`upload-zone ${dragover ? "dragover" : ""}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragover(true); }}
          onDragLeave={() => setDragover(false)}
          onDrop={e => { e.preventDefault(); setDragover(false); handleFiles(e.dataTransfer.files); }}
        >
          <div className="upload-icon">{(TRIP_TYPES[trip.type] || TRIP_TYPES.hiking).icon}</div>
          <h2>Activiteit toevoegen</h2>
          <p>Sleep .GPX / .FIT bestanden of tik hier</p>
          <input
            ref={fileRef}
            type="file"
            accept=".gpx,.fit"
            multiple
            style={{ display: "none" }}
            onChange={e => { handleFiles(e.target.files); e.target.value = ""; }}
          />
        </div>
      </div>

      {activities.length > 0 && (
        <>
          <div className="tabs">
            <button className={`tab ${currentView === "summary" ? "active" : ""}`} onClick={() => setCurrentView("summary")}>Overzicht</button>
            {activities.length >= 2 && (
              <button className={`tab ${currentView === "compare" ? "active" : ""}`} onClick={() => setCurrentView("compare")}>Vergelijk</button>
            )}
            {activities.map((act, i) => (
              <button key={act.id} className={`tab ${currentView === i ? "active" : ""}`} onClick={() => setCurrentView(i)}>
                {act.date ? new Date(act.date).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" }) : `#${i + 1}`}
              </button>
            ))}
          </div>

          {currentView === "summary" && <SummaryView activities={activities} tripName={trip.name} />}
          {currentView === "compare" && <CompareView activities={activities} />}

          {currentActivity && (
            <>
              {motivationMsgs.length > 0 && (
                <div className="motivation">
                  {motivationMsgs.map((msg, i) => <p key={i}>{msg}</p>)}
                </div>
              )}
              <ActivityView
                activity={currentActivity}
                allActivities={activities}
                onDelete={() => handleDeleteActivity(currentActivity.id)}
              />
            </>
          )}
        </>
      )}

      {/* Delete trip button at bottom */}
      <div className="section" style={{ textAlign: "center", marginTop: 20 }}>
        <button className="delete-btn" onClick={() => deleteTrip(currentTrip)}>Avontuur verwijderen</button>
      </div>

      <div className="bottom-spacer" />
    </>
  );
}

// ==================== SUMMARY VIEW ====================
function SummaryView({ activities }) {
  const totalDist = activities.reduce((s, a) => s + (a.distance || 0), 0);
  const totalElev = activities.reduce((s, a) => s + (a.elevation_gain || 0), 0);
  const totalTime = activities.reduce((s, a) => s + (a.duration || 0), 0);
  const totalClimbs = activities.reduce((s, a) => s + (a.climbs?.length || 0), 0);
  const avgSpd = totalTime > 0 ? (totalDist / totalTime) * 3600 : 0;
  const avgDist = activities.length > 0 ? totalDist / activities.length : 0;
  const avgElev = activities.length > 0 ? totalElev / activities.length : 0;

  // HR stats across all activities
  const allHRs = activities.filter(a => a.avg_hr);
  const avgHRAll = allHRs.length > 0 ? Math.round(allHRs.reduce((s, a) => s + a.avg_hr, 0) / allHRs.length) : null;
  const maxHRAll = allHRs.length > 0 ? Math.max(...activities.filter(a => a.max_hr).map(a => a.max_hr)) : null;

  // Highest point reached
  let highestPoint = 0;
  activities.forEach(a => {
    (a.route_data || []).forEach(p => {
      if (p.ele && p.ele > highestPoint) highestPoint = p.ele;
    });
  });

  // Longest single activity duration
  const longestDuration = Math.max(...activities.map(a => a.duration || 0));

  // Famous climbs comparison for total elevation
  const climbComparisons = compareWithFamousClimbs(totalElev);

  // Records
  const records = [];
  if (activities.length >= 1) {
    const maxDist = activities.reduce((best, a) => (a.distance || 0) > (best.distance || 0) ? a : best);
    const maxElev = activities.reduce((best, a) => (a.elevation_gain || 0) > (best.elevation_gain || 0) ? a : best);
    const maxSpd = activities.reduce((best, a) => (a.avg_speed || 0) > (best.avg_speed || 0) ? a : best);
    const maxDur = activities.reduce((best, a) => (a.duration || 0) > (best.duration || 0) ? a : best);

    if (maxDist.distance > 0) records.push({ icon: "\u{1F6E3}\uFE0F", title: `Langste: ${maxDist.distance.toFixed(1)} km`, sub: fmtDate(maxDist.date) });
    if (maxElev.elevation_gain > 0) records.push({ icon: "\u26F0\uFE0F", title: `Meeste hoogtemeters: ${maxElev.elevation_gain}m`, sub: fmtDate(maxElev.date) });
    if (maxSpd.avg_speed > 0) records.push({ icon: "\u26A1", title: `Snelste gemiddelde: ${maxSpd.avg_speed.toFixed(1)} km/h`, sub: fmtDate(maxSpd.date) });
    if (maxDur.duration > 3600) records.push({ icon: "\u23F1\uFE0F", title: `Langste sessie: ${formatTime(maxDur.duration)}`, sub: fmtDate(maxDur.date) });
    if (highestPoint > 0) records.push({ icon: "\u{1F3D4}\uFE0F", title: `Hoogste punt: ${Math.round(highestPoint)}m`, sub: "" });
  }

  const allRoutePoints = activities.flatMap(a =>
    (a.route_data || []).filter(p => p.lat && p.lon).map(p => [p.lat, p.lon])
  );

  return (
    <>
      <div className="section">
        <h3 className="section-title">Totalen</h3>
        <div className="summary-grid">
          <div className="summary-card">
            <div className="big-val">{activities.length}</div>
            <div className="big-label">Activiteiten</div>
          </div>
          <div className="summary-card">
            <div className="big-val">{totalDist.toFixed(0)}</div>
            <div className="big-label">Totaal km</div>
          </div>
          <div className="summary-card">
            <div className="big-val">{totalElev.toLocaleString()}</div>
            <div className="big-label">Hoogtemeters</div>
          </div>
          <div className="summary-card">
            <div className="big-val">{formatTime(totalTime)}</div>
            <div className="big-label">Totale tijd</div>
          </div>
          <div className="summary-card">
            <div className="big-val">{avgSpd.toFixed(1)}</div>
            <div className="big-label">Gem. km/h</div>
          </div>
          <div className="summary-card">
            <div className="big-val">{totalClimbs}</div>
            <div className="big-label">Klimmen</div>
          </div>
        </div>
      </div>

      {/* Gemiddelden */}
      {activities.length >= 2 && (
        <div className="section">
          <h3 className="section-title">Gemiddeld per activiteit</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="label">Gem. afstand</div>
              <div className="value">{avgDist.toFixed(1)} <span className="unit">km</span></div>
            </div>
            <div className="stat-card">
              <div className="label">Gem. hoogtemeters</div>
              <div className="value">{Math.round(avgElev).toLocaleString()} <span className="unit">m</span></div>
            </div>
            <div className="stat-card">
              <div className="label">Gem. duur</div>
              <div className="value">{formatTime(totalTime / activities.length)}</div>
            </div>
            {avgHRAll && (
              <div className="stat-card">
                <div className="label">Gem. hartslag</div>
                <div className="value">{avgHRAll} <span className="unit">bpm</span></div>
              </div>
            )}
            {maxHRAll && (
              <div className="stat-card">
                <div className="label">Max hartslag ooit</div>
                <div className="value">{maxHRAll} <span className="unit">bpm</span></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bekende klimmen vergelijking voor totaal */}
      {climbComparisons.length > 0 && (
        <div className="section">
          <h3 className="section-title">In totaal geklommen</h3>
          <div className="records-list">
            {climbComparisons.slice(0, 3).map((comp, i) => (
              <div key={i} className="record-card">
                <span className="trophy" style={{ fontSize: 24 }}>{"\u26F0\uFE0F"}</span>
                <div className="record-info">
                  <h4>
                    {comp.times === 1 ? "" : comp.times < 1 ? `${Math.round(comp.times * 100)}% van ` : `${comp.times}x `}
                    {comp.climb.name}
                  </h4>
                  <p>{comp.climb.country} &middot; {comp.climb.gain}m per keer &middot; {comp.climb.gradient}% gemiddeld</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {records.length > 0 && (
        <div className="section">
          <h3 className="section-title">Records & hoogtepunten</h3>
          <div className="records-list">
            {records.map((r, i) => (
              <div key={i} className="record-card">
                <span className="trophy" style={{ fontSize: 24 }}>{r.icon}</span>
                <div className="record-info">
                  <h4>{r.title}</h4>
                  {r.sub && <p>{r.sub}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {allRoutePoints.length > 0 && (
        <div className="section">
          <h3 className="section-title">Alle routes</h3>
          <HeatMap activities={activities} />
        </div>
      )}
    </>
  );
}

// ==================== COMPARE VIEW ====================
function CompareView({ activities }) {
  if (activities.length < 2) return null;

  const sorted = [...activities].sort((a, b) => new Date(a.date) - new Date(b.date));
  const maxVals = {
    distance: Math.max(...sorted.map(a => a.distance || 0)),
    elevation_gain: Math.max(...sorted.map(a => a.elevation_gain || 0)),
    avg_speed: Math.max(...sorted.map(a => a.avg_speed || 0)),
    avg_hr: Math.max(...sorted.map(a => a.avg_hr || 0)),
    duration: Math.max(...sorted.map(a => a.duration || 0)),
  };

  const bestDay = sorted.reduce((best, a) => (a.distance || 0) > (best.distance || 0) ? a : best);
  const hardestDay = sorted.reduce((best, a) => (a.elevation_gain || 0) > (best.elevation_gain || 0) ? a : best);
  const fastestDay = sorted.reduce((best, a) => (a.avg_speed || 0) > (best.avg_speed || 0) ? a : best);

  // Trends
  const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
  const secondHalf = sorted.slice(Math.floor(sorted.length / 2));
  const avgSpdFirst = firstHalf.reduce((s, a) => s + (a.avg_speed || 0), 0) / firstHalf.length;
  const avgSpdSecond = secondHalf.reduce((s, a) => s + (a.avg_speed || 0), 0) / secondHalf.length;
  const spdTrend = avgSpdSecond - avgSpdFirst;

  const avgHRFirst = firstHalf.filter(a => a.avg_hr).reduce((s, a) => s + a.avg_hr, 0) / (firstHalf.filter(a => a.avg_hr).length || 1);
  const avgHRSecond = secondHalf.filter(a => a.avg_hr).reduce((s, a) => s + a.avg_hr, 0) / (secondHalf.filter(a => a.avg_hr).length || 1);
  const hrTrend = avgHRSecond - avgHRFirst;

  // Consistentie score: hoe gelijkmatig zijn de activiteiten?
  const dists = sorted.map(a => a.distance || 0).filter(d => d > 0);
  const avgDist = dists.reduce((s, d) => s + d, 0) / (dists.length || 1);
  const variance = dists.length > 1 ? Math.sqrt(dists.reduce((s, d) => s + (d - avgDist) ** 2, 0) / dists.length) / avgDist : 0;
  const consistencyScore = Math.max(0, Math.round((1 - variance) * 100));

  // Progressie: nemen de activiteiten toe in moeilijkheid?
  const elevFirst = firstHalf.reduce((s, a) => s + (a.elevation_gain || 0), 0) / firstHalf.length;
  const elevSecond = secondHalf.reduce((s, a) => s + (a.elevation_gain || 0), 0) / secondHalf.length;
  const elevTrend = elevSecond - elevFirst;

  // Efficiency: snelheid per hartslag (als beschikbaar)
  const withEfficiency = sorted.filter(a => a.avg_speed && a.avg_hr).map(a => ({
    date: a.date, efficiency: (a.avg_speed / a.avg_hr * 100).toFixed(1)
  }));

  return (
    <>
      {/* Vakantie verhaal */}
      <div className="section">
        <h3 className="section-title">Vakantie-analyse</h3>
        <div className="chart-box" style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#2c3e50" }}>
            In <strong>{sorted.length} activiteiten</strong> heeft Andrea{" "}
            <strong>{sorted.reduce((s, a) => s + (a.distance || 0), 0).toFixed(0)} km</strong> afgelegd
            met <strong>{sorted.reduce((s, a) => s + (a.elevation_gain || 0), 0).toLocaleString()} hoogtemeters</strong>.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#2c3e50", marginTop: 8 }}>
            De langste was <strong>{fmtDate(bestDay.date)}</strong> met {(bestDay.distance || 0).toFixed(1)} km.
            De zwaarste was <strong>{fmtDate(hardestDay.date)}</strong> met {hardestDay.elevation_gain || 0}m hoogtemeters.
            {fastestDay.avg_speed > 0 && <> Het snelste gemiddelde was op <strong>{fmtDate(fastestDay.date)}</strong> met {(fastestDay.avg_speed || 0).toFixed(1)} km/h.</>}
          </p>
          {spdTrend !== 0 && (
            <p style={{ fontSize: 14, lineHeight: 1.7, color: spdTrend > 0 ? "#27ae60" : "#e67e22", marginTop: 8, fontWeight: 600 }}>
              {spdTrend > 0.5
                ? "Andrea werd sneller over tijd — de benen werden sterker!"
                : spdTrend < -0.5
                ? "Het tempo nam af over tijd — de vermoeidheid sloop erin."
                : "Het tempo bleef constant — stabiele inspanning!"}
            </p>
          )}
          {avgHRFirst > 0 && avgHRSecond > 0 && Math.abs(hrTrend) > 2 && (
            <p style={{ fontSize: 13, color: "#7f8c8d", marginTop: 4 }}>
              {hrTrend < -2
                ? `Gemiddelde hartslag daalde van ${Math.round(avgHRFirst)} naar ${Math.round(avgHRSecond)} bpm — teken van betere conditie of acclimatisatie.`
                : `Gemiddelde hartslag steeg van ${Math.round(avgHRFirst)} naar ${Math.round(avgHRSecond)} bpm — mogelijk opgestapelde vermoeidheid.`}
            </p>
          )}
        </div>
      </div>

      {/* Day-by-day comparison bars */}
      <div className="section">
        <h3 className="section-title">Per activiteit</h3>

        {/* Distance comparison */}
        <div className="chart-box" style={{ marginBottom: 12 }}>
          <h4 style={{ color: "#2c3e50", fontWeight: 600 }}>Afstand (km)</h4>
          {sorted.map((a, i) => (
            <div key={a.id} style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                <span>{fmtDate(a.date) || `Dag ${i+1}`}</span>
                <span style={{ fontWeight: 700 }}>{(a.distance || 0).toFixed(1)} km</span>
              </div>
              <div style={{ background: "#f0f0f0", borderRadius: 6, height: 16, overflow: "hidden" }}>
                <div style={{ background: "linear-gradient(90deg, #2ecc71, #1abc9c)", height: "100%", width: `${maxVals.distance > 0 ? ((a.distance || 0) / maxVals.distance * 100) : 0}%`, borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Elevation comparison */}
        <div className="chart-box" style={{ marginBottom: 12 }}>
          <h4 style={{ color: "#2c3e50", fontWeight: 600 }}>Hoogtemeters (m)</h4>
          {sorted.map((a, i) => (
            <div key={a.id} style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                <span>{fmtDate(a.date) || `Dag ${i+1}`}</span>
                <span style={{ fontWeight: 700 }}>{(a.elevation_gain || 0).toLocaleString()}m</span>
              </div>
              <div style={{ background: "#f0f0f0", borderRadius: 6, height: 16, overflow: "hidden" }}>
                <div style={{ background: "linear-gradient(90deg, #f39c12, #e67e22)", height: "100%", width: `${maxVals.elevation_gain > 0 ? ((a.elevation_gain || 0) / maxVals.elevation_gain * 100) : 0}%`, borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Speed comparison */}
        <div className="chart-box" style={{ marginBottom: 12 }}>
          <h4 style={{ color: "#2c3e50", fontWeight: 600 }}>Gem. snelheid (km/h)</h4>
          {sorted.map((a, i) => (
            <div key={a.id} style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                <span>{fmtDate(a.date) || `Dag ${i+1}`}</span>
                <span style={{ fontWeight: 700 }}>{(a.avg_speed || 0).toFixed(1)} km/h</span>
              </div>
              <div style={{ background: "#f0f0f0", borderRadius: 6, height: 16, overflow: "hidden" }}>
                <div style={{ background: "linear-gradient(90deg, #3498db, #2980b9)", height: "100%", width: `${maxVals.avg_speed > 0 ? ((a.avg_speed || 0) / maxVals.avg_speed * 100) : 0}%`, borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>

        {/* HR comparison (if available) */}
        {sorted.some(a => a.avg_hr) && (
          <div className="chart-box" style={{ marginBottom: 12 }}>
            <h4 style={{ color: "#2c3e50", fontWeight: 600 }}>Gem. hartslag (bpm)</h4>
            {sorted.map((a, i) => (
              <div key={a.id} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                  <span>{fmtDate(a.date) || `Dag ${i+1}`}</span>
                  <span style={{ fontWeight: 700 }}>{a.avg_hr || "-"} bpm</span>
                </div>
                <div style={{ background: "#f0f0f0", borderRadius: 6, height: 16, overflow: "hidden" }}>
                  <div style={{ background: "linear-gradient(90deg, #e74c3c, #c0392b)", height: "100%", width: `${maxVals.avg_hr > 0 ? ((a.avg_hr || 0) / maxVals.avg_hr * 100) : 0}%`, borderRadius: 6 }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Analyse kaarten */}
      <div className="section">
        <h3 className="section-title">Analyse</h3>

        {/* Consistentie */}
        <div className="chart-box" style={{ marginBottom: 12, textAlign: "center" }}>
          <div style={{ fontSize: 42, fontWeight: 800, background: "linear-gradient(135deg, #2ecc71, #1abc9c)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {consistencyScore}%
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#2c3e50", marginTop: 4 }}>Consistentie score</div>
          <p style={{ fontSize: 12, color: "#7f8c8d", marginTop: 4 }}>
            {consistencyScore >= 80 ? "Zeer consistent — nagenoeg dezelfde inspanning elke keer." :
             consistencyScore >= 50 ? "Redelijk gevarieerd — een mix van korte en lange sessies." :
             "Heel gevarieerd — van korte tot lange uitschieters."}
          </p>
        </div>

        {/* Progressie */}
        <div className="chart-box" style={{ marginBottom: 12 }}>
          <h4 style={{ color: "#2c3e50", fontWeight: 600, marginBottom: 6 }}>Progressie</h4>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 120, background: "#f0f0f0", borderRadius: 10, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#7f8c8d" }}>Tempo trend</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: spdTrend > 0.3 ? "#27ae60" : spdTrend < -0.3 ? "#e74c3c" : "#2c3e50" }}>
                {spdTrend > 0.3 ? "\u2191" : spdTrend < -0.3 ? "\u2193" : "\u2192"} {Math.abs(spdTrend).toFixed(1)} km/h
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 120, background: "#f0f0f0", borderRadius: 10, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#7f8c8d" }}>Zwaarte trend</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: elevTrend > 50 ? "#e67e22" : "#2c3e50" }}>
                {elevTrend > 50 ? "\u2191" : elevTrend < -50 ? "\u2193" : "\u2192"} {Math.abs(Math.round(elevTrend))}m
              </div>
            </div>
            {avgHRFirst > 0 && avgHRSecond > 0 && (
              <div style={{ flex: 1, minWidth: 120, background: "#f0f0f0", borderRadius: 10, padding: 12, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#7f8c8d" }}>HR trend</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: hrTrend < -2 ? "#27ae60" : hrTrend > 2 ? "#e74c3c" : "#2c3e50" }}>
                  {hrTrend < -2 ? "\u2193" : hrTrend > 2 ? "\u2191" : "\u2192"} {Math.abs(Math.round(hrTrend))} bpm
                </div>
              </div>
            )}
          </div>
          <p style={{ fontSize: 12, color: "#7f8c8d", marginTop: 8 }}>
            {spdTrend > 0.3 && hrTrend < -2 ? "Sneller met een lagere hartslag — de conditie is duidelijk verbeterd!" :
             spdTrend > 0.3 ? "Het tempo gaat omhoog — Andrea wordt sterker." :
             spdTrend < -0.3 && hrTrend > 2 ? "Langzamer met hogere hartslag — vermoeidheid stapelt op. Rustdag?" :
             elevTrend > 50 ? "De routes worden zwaarder — Andrea zoekt de uitdaging op!" :
             "Stabiele inspanning over de activiteiten heen."}
          </p>
        </div>

        {/* Efficiency trend */}
        {withEfficiency.length >= 2 && (
          <div className="chart-box" style={{ marginBottom: 12 }}>
            <h4 style={{ color: "#2c3e50", fontWeight: 600, marginBottom: 6 }}>
              Efficiency (snelheid/hartslag)
            </h4>
            <p style={{ fontSize: 12, color: "#7f8c8d", marginBottom: 8 }}>
              Hoger = meer snelheid per hartslag = fittere prestatie
            </p>
            {withEfficiency.map((e, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ fontSize: 12 }}>{fmtDate(e.date)}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#2ecc71" }}>{e.efficiency}</span>
              </div>
            ))}
          </div>
        )}

        {/* Duration comparison */}
        <div className="chart-box" style={{ marginBottom: 12 }}>
          <h4 style={{ color: "#2c3e50", fontWeight: 600 }}>Duur per activiteit</h4>
          {sorted.map((a, i) => (
            <div key={a.id} style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                <span>{fmtDate(a.date) || `#${i+1}`}</span>
                <span style={{ fontWeight: 700 }}>{formatTime(a.duration || 0)}</span>
              </div>
              <div style={{ background: "#f0f0f0", borderRadius: 6, height: 16, overflow: "hidden" }}>
                <div style={{ background: "linear-gradient(90deg, #9b59b6, #8e44ad)", height: "100%", width: `${maxVals.duration > 0 ? ((a.duration || 0) / maxVals.duration * 100) : 0}%`, borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ==================== HEATMAP ====================
function HeatMap({ activities }) {
  const ref = useRef(null);
  const mapInst = useRef(null);

  useEffect(() => {
    if (!ref.current || typeof window === "undefined") return;

    const L = require("leaflet");
    if (!mapInst.current) {
      mapInst.current = L.map(ref.current, { zoomControl: false, attributionControl: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mapInst.current);
    }
    const map = mapInst.current;

    // Clear old layers
    map.eachLayer(l => { if (l instanceof L.Polyline) map.removeLayer(l); });

    const colors = ["#2ecc71", "#e74c3c", "#3498db", "#9b59b6", "#f39c12", "#1abc9c", "#e67e22", "#2980b9"];
    const allBounds = [];

    activities.forEach((act, idx) => {
      const pts = (act.route_data || []).filter(p => p.lat && p.lon).map(p => [p.lat, p.lon]);
      if (pts.length < 2) return;
      allBounds.push(...pts);
      L.polyline(pts, { color: colors[idx % colors.length], weight: 3, opacity: 0.8 }).addTo(map);
    });

    if (allBounds.length > 0) {
      map.fitBounds(L.latLngBounds(allBounds), { padding: [20, 20] });
    }
  }, [activities]);

  return <div ref={ref} className="heatmap-wrap" style={{ background: "#f4f9f4" }} />;
}

// ==================== ACTIVITY VIEW ====================
function ActivityView({ activity, allActivities, onDelete }) {
  const [mapMode, setMapMode] = useState("elevation"); // "elevation" or "effort"
  const act = activity;
  const routeData = act.route_data || [];
  const climbs = act.climbs || [];
  const hasHR = routeData.some(p => p.hr);
  const hasCadence = routeData.some(p => p.cad);
  const hasPower = routeData.some(p => p.pwr);

  // Advanced insights
  const pacing = analyzePacing(routeData);
  const fatigue = hasHR ? analyzeFatigue(routeData) : null;
  const recovery = hasHR ? analyzeRecovery(routeData) : null;
  const hrZones = hasHR ? getHRZones(routeData) : null;
  const effortScore = hasHR ? calculateEffortScore(routeData) : null;
  const climbComparisons = compareWithFamousClimbs(act.elevation_gain || 0);

  // VAM & power for each climb
  const climbInsights = climbs.map(c => ({
    vam: calculateVAM(c, routeData),
    power: estimatePowerPerKg(c, routeData),
    match: matchClimbProfile(c),
  }));

  return (
    <>
      {/* Stats */}
      <div className="section">
        <h3 className="section-title">
          {fmtDate(act.date)} {act.name && `\u2014 ${act.name}`}
        </h3>
        <div className="stats-grid">
          <div className="stat-card highlight">
            <div className="label">Afstand</div>
            <div className="value">{(act.distance || 0).toFixed(1)} <span className="unit">km</span></div>
          </div>
          <div className="stat-card highlight">
            <div className="label">Hoogtemeters</div>
            <div className="value">{(act.elevation_gain || 0).toLocaleString()} <span className="unit">m</span></div>
          </div>
          <div className="stat-card">
            <div className="label">Tijd</div>
            <div className="value">{formatTime(act.duration || 0)}</div>
          </div>
          <div className="stat-card">
            <div className="label">Gem. snelheid</div>
            <div className="value">{(act.avg_speed || 0).toFixed(1)} <span className="unit">km/h</span></div>
          </div>
          <div className="stat-card">
            <div className="label">Max snelheid</div>
            <div className="value">{(act.max_speed || 0).toFixed(1)} <span className="unit">km/h</span></div>
          </div>
          {act.avg_hr && (
            <div className="stat-card">
              <div className="label">Gem. hartslag</div>
              <div className="value">{act.avg_hr} <span className="unit">bpm</span></div>
            </div>
          )}
          {effortScore && (
            <div className="stat-card">
              <div className="label">Effort score</div>
              <div className="value">{effortScore.score} <span className="unit">/ 100</span></div>
            </div>
          )}
          {act.avg_power && (
            <div className="stat-card">
              <div className="label">Gem. vermogen</div>
              <div className="value">{act.avg_power} <span className="unit">W</span></div>
            </div>
          )}
        </div>
      </div>

      {/* Route map with toggle */}
      {routeData.length > 0 && (
        <div className="section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 className="section-title" style={{ marginBottom: 0 }}>Route</h3>
            {hasHR && (
              <div className="tabs" style={{ margin: 0, background: "white", display: "inline-flex" }}>
                <button className={`tab ${mapMode === "elevation" ? "active" : ""}`} onClick={() => setMapMode("elevation")} style={{ padding: "6px 12px", fontSize: 12 }}>Hoogte</button>
                <button className={`tab ${mapMode === "effort" ? "active" : ""}`} onClick={() => setMapMode("effort")} style={{ padding: "6px 12px", fontSize: 12 }}>Inspanning</button>
              </div>
            )}
          </div>
          <RouteMap routeData={routeData} mode={mapMode} />
        </div>
      )}

      {/* Elevation profile */}
      {routeData.some(p => p.ele != null) && (
        <div className="section">
          <h3 className="section-title">Hoogteprofiel</h3>
          <div className="chart-box">
            <div className="chart-wrap">
              <CanvasChart
                data={routeData.filter(p => p.ele != null).map(p => ({ x: p.dist, y: p.ele }))}
                color="#2ecc71"
                unit="m"
                xUnit="km"
              />
            </div>
          </div>
        </div>
      )}

      {/* Climbs with VAM, power, and famous climb match */}
      {climbs.length > 0 && (
        <div className="section">
          <h3 className="section-title">Klimmen ({climbs.length})</h3>
          <div className="climb-list">
            {climbs.map((c, i) => {
              const ins = climbInsights[i];
              return (
                <div key={i} className="climb-card" style={{ borderLeftColor: climbColor(c.category), flexDirection: "column", alignItems: "stretch" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div className="climb-info">
                      <h4>Klim {i + 1}</h4>
                      <p>{c.distance} km &middot; {c.gain}m stijging &middot; {c.startEle}m &rarr; {c.endEle}m</p>
                    </div>
                    <div className="climb-grade">
                      <div className="pct">{c.gradient}%</div>
                      <div className="cat">{c.category}</div>
                    </div>
                  </div>
                  {/* Extra insights per climb */}
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {ins.vam && (
                      <span className="insight-badge" style={{ background: "#e8f5e9", color: "#27ae60" }}>
                        VAM: {ins.vam.vam} m/u ({ins.vam.level})
                      </span>
                    )}
                    {ins.power && (
                      <span className="insight-badge" style={{ background: "#fff3e0", color: "#e67e22" }}>
                        ~{ins.power.wpkg} W/kg ({ins.power.level})
                      </span>
                    )}
                    {ins.match && ins.match.similarity > 40 && (
                      <span className="insight-badge" style={{ background: "#e3f2fd", color: "#2980b9" }}>
                        Lijkt op: {ins.match.name} ({ins.match.similarity}%)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Famous climb comparison */}
      {climbComparisons.length > 0 && (
        <div className="section">
          <h3 className="section-title">Vergelijking met bekende klimmen</h3>
          <div className="climb-list">
            {climbComparisons.slice(0, 4).map((comp, i) => (
              <div key={i} className="record-card">
                <span className="trophy" style={{ fontSize: 24 }}>{comp.times >= 1 ? "\u26F0\uFE0F" : "\u{1F3D4}\uFE0F"}</span>
                <div className="record-info">
                  <h4>
                    {comp.times === 1 ? "" : comp.times < 1 ? `${Math.round(comp.times * 100)}% van ` : `${comp.times}x `}
                    {comp.climb.name}
                  </h4>
                  <p>{comp.climb.country} &middot; {comp.climb.gain}m &middot; {comp.climb.distance}km &middot; {comp.climb.gradient}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HR Zones */}
      {hrZones && (
        <div className="section">
          <h3 className="section-title">Hartslag zones</h3>
          <div className="chart-box">
            {hrZones.map((z, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: "#2c3e50" }}>{z.name}</span>
                  <span style={{ color: "#7f8c8d" }}>{z.percentage}% &middot; {formatTime(z.seconds)}</span>
                </div>
                <div style={{ background: "#f0f0f0", borderRadius: 6, height: 20, overflow: "hidden" }}>
                  <div style={{ background: z.color, height: "100%", width: `${z.percentage}%`, borderRadius: 6, transition: "width 0.5s" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Advanced Insights */}
      {(pacing || fatigue || recovery) && (
        <div className="section">
          <h3 className="section-title">Analyse & inzichten</h3>

          {effortScore && (
            <div className="chart-box" style={{ marginBottom: 12, textAlign: "center" }}>
              <div style={{ fontSize: 48, fontWeight: 800, background: "linear-gradient(135deg, #2ecc71, #1abc9c)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                {effortScore.score}
              </div>
              <div style={{ fontSize: 14, color: "#7f8c8d", marginTop: 4 }}>{effortScore.label}</div>
            </div>
          )}

          {pacing && (
            <div className="chart-box" style={{ marginBottom: 12 }}>
              <h4 style={{ color: "#2c3e50", fontWeight: 600, marginBottom: 6 }}>Pacing: {pacing.verdict}</h4>
              <p style={{ fontSize: 13, color: "#7f8c8d", lineHeight: 1.5 }}>{pacing.detail}</p>
              <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                <div>
                  <span style={{ fontSize: 11, color: "#7f8c8d" }}>1e helft</span>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{pacing.avgFirst} <span style={{ fontSize: 12, color: "#7f8c8d" }}>km/h</span></div>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: "#7f8c8d" }}>2e helft</span>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{pacing.avgSecond} <span style={{ fontSize: 12, color: "#7f8c8d" }}>km/h</span></div>
                </div>
              </div>
            </div>
          )}

          {fatigue && (
            <div className="chart-box" style={{ marginBottom: 12 }}>
              <h4 style={{ color: "#2c3e50", fontWeight: 600, marginBottom: 6 }}>Vermoeidheid: {fatigue.verdict}</h4>
              <p style={{ fontSize: 13, color: "#7f8c8d", lineHeight: 1.5 }}>{fatigue.detail}</p>
              <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                <div>
                  <span style={{ fontSize: 11, color: "#7f8c8d" }}>HR begin</span>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{fatigue.hrFirst} <span style={{ fontSize: 12, color: "#7f8c8d" }}>bpm</span></div>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: "#7f8c8d" }}>HR eind</span>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{fatigue.hrLast} <span style={{ fontSize: 12, color: "#7f8c8d" }}>bpm</span></div>
                </div>
              </div>
            </div>
          )}

          {recovery && (
            <div className="chart-box" style={{ marginBottom: 12 }}>
              <h4 style={{ color: "#2c3e50", fontWeight: 600, marginBottom: 6 }}>Herstel: {recovery.verdict}</h4>
              <p style={{ fontSize: 13, color: "#7f8c8d", lineHeight: 1.5 }}>
                Na piek van {recovery.peakHR} bpm daalde je hartslag naar {recovery.hrAfter60} bpm binnen 60 seconden.
                Dat is een daling van <strong>{recovery.drop} slagen</strong>.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Speed/HR/Cadence/Power charts */}
      {routeData.some(p => p.spd) && (
        <div className="section">
          <h3 className="section-title">Grafieken</h3>
          <div className="chart-box">
            <h4>Snelheid (km/h)</h4>
            <div className="mini-wrap">
              <CanvasChart
                data={smooth(routeData.filter(p => p.spd && p.spd > 1 && p.spd < 120).map(p => ({ x: p.dist, y: p.spd })), 15)}
                color="#3498db"
                unit=" km/h"
              />
            </div>
          </div>
          {hasHR && (
            <div className="chart-box">
              <h4>Hartslag (bpm)</h4>
              <div className="mini-wrap">
                <CanvasChart
                  data={routeData.filter(p => p.hr).map(p => ({ x: p.dist, y: p.hr }))}
                  color="#e74c3c"
                  unit=" bpm"
                />
              </div>
            </div>
          )}
          {hasCadence && (
            <div className="chart-box">
              <h4>Cadans (rpm)</h4>
              <div className="mini-wrap">
                <CanvasChart
                  data={routeData.filter(p => p.cad && p.cad > 0).map(p => ({ x: p.dist, y: p.cad }))}
                  color="#ffc107"
                  unit=" rpm"
                />
              </div>
            </div>
          )}
          {hasPower && (
            <div className="chart-box">
              <h4>Vermogen (W)</h4>
              <div className="mini-wrap">
                <CanvasChart
                  data={smooth(routeData.filter(p => p.pwr).map(p => ({ x: p.dist, y: p.pwr })), 15)}
                  color="#9b59b6"
                  unit=" W"
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="section" style={{ textAlign: "center" }}>
        <button className="delete-btn" onClick={onDelete}>Activiteit verwijderen</button>
      </div>
    </>
  );
}

// ==================== ROUTE MAP ====================
function RouteMap({ routeData, mode = "elevation" }) {
  const ref = useRef(null);
  const mapInst = useRef(null);

  useEffect(() => {
    if (!ref.current || typeof window === "undefined") return;
    const L = require("leaflet");

    if (!mapInst.current) {
      mapInst.current = L.map(ref.current, { zoomControl: false, attributionControl: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mapInst.current);
    }
    const map = mapInst.current;

    // Clear
    map.eachLayer(l => { if (l instanceof L.Polyline || l instanceof L.CircleMarker) map.removeLayer(l); });

    const pts = routeData.filter(p => p.lat && p.lon);
    if (pts.length < 2) return;

    if (mode === "effort") {
      // Color by HR zones
      const hrs = pts.filter(p => p.hr).map(p => p.hr);
      const maxHR = hrs.length > 0 ? Math.max(...hrs) : 190;

      for (let i = 1; i < pts.length; i++) {
        const color = pts[i].hr ? getHRZoneColor(pts[i].hr, maxHR) : "#95a5a6";
        L.polyline([[pts[i-1].lat, pts[i-1].lon], [pts[i].lat, pts[i].lon]], {
          color, weight: 5, opacity: 0.9
        }).addTo(map);
      }
    } else {
      // Color by elevation
      const eles = pts.map(p => p.ele).filter(e => e != null);
      const minE = Math.min(...eles);
      const maxE = Math.max(...eles);
      const range = maxE - minE || 1;

      for (let i = 1; i < pts.length; i++) {
        const ratio = pts[i].ele != null ? (pts[i].ele - minE) / range : 0.5;
        L.polyline([[pts[i-1].lat, pts[i-1].lon], [pts[i].lat, pts[i].lon]], {
          color: eleColor(ratio), weight: 4, opacity: 0.9
        }).addTo(map);
      }
    }

    // Start/end
    L.circleMarker([pts[0].lat, pts[0].lon], {
      radius: 6, fillColor: "#2ecc71", fillOpacity: 1, color: "#fff", weight: 2
    }).addTo(map);
    L.circleMarker([pts[pts.length-1].lat, pts[pts.length-1].lon], {
      radius: 6, fillColor: "#e74c3c", fillOpacity: 1, color: "#fff", weight: 2
    }).addTo(map);

    const coords = pts.map(p => [p.lat, p.lon]);
    map.fitBounds(L.latLngBounds(coords), { padding: [20, 20] });
    setTimeout(() => map.invalidateSize(), 100);
  }, [routeData, mode]);

  return <div ref={ref} className="map-wrap" />;
}

// ==================== CANVAS CHART ====================
function CanvasChart({ data, color, unit, xUnit }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;

    ctx.clearRect(0, 0, W, H);

    const vals = data.map(d => d.y);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const range = maxV - minV || 1;
    const maxX = data[data.length - 1].x || 1;

    // Grid
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = H - (i / 4) * H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Labels
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "left";
    for (let i = 0; i <= 4; i++) {
      const raw = minV + (i / 4) * range;
      const val = range < 5 ? raw.toFixed(1) : Math.round(raw);
      ctx.fillText(val + (unit || ""), 4, H - (i / 4) * H - 3);
    }

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, color + "60");
    grad.addColorStop(1, color + "08");

    const step = Math.max(1, Math.floor(data.length / W));
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i < data.length; i += step) {
      const x = (data[i].x / maxX) * W;
      const y = H - ((data[i].y - minV) / range) * (H * 0.88);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < data.length; i += step) {
      const x = (data[i].x / maxX) * W;
      const y = H - ((data[i].y - minV) / range) * (H * 0.88);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // X labels
    if (xUnit) {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.textAlign = "center";
      const n = Math.min(5, Math.floor(maxX / 10) + 1);
      for (let i = 0; i <= n; i++) {
        const d = (i / n) * maxX;
        ctx.fillText(d.toFixed(0) + xUnit, (d / maxX) * W, H - 3);
      }
    }
  }, [data, color, unit, xUnit]);

  return <canvas ref={canvasRef} />;
}

// ==================== HELPERS ====================
function formatTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
}

function eleColor(ratio) {
  if (ratio < 0.5) {
    const r = Math.round(255 * ratio * 2);
    return `rgb(${r},200,80)`;
  }
  const g = Math.round(200 * (1 - (ratio - 0.5) * 2));
  return `rgb(233,${g},${Math.round(80 - (ratio - 0.5) * 100)})`;
}

function climbColor(cat) {
  const m = { HC: "#e74c3c", "Cat 1": "#e67e22", "Cat 2": "#f39c12", "Cat 3": "#2ecc71", "Cat 4": "#3498db", Heuvel: "#95a5a6" };
  return m[cat] || "#2ecc71";
}

function smooth(data, w) {
  if (data.length === 0) return data;
  return data.map((_, i) => {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(data.length - 1, i + w); j++) {
      sum += data[j].y; count++;
    }
    return { x: data[i].x, y: sum / count };
  });
}
