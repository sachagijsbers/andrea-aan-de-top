// Geavanceerde analyse-engine — inzichten die Garmin NIET geeft

// VAM — Velocita Ascensionale Media (klimsnelheid in m/uur)
// Profs halen 1500-1800 m/uur, goede amateurs 900-1200
export function calculateVAM(climb, routeData) {
  if (!climb || !routeData || routeData.length === 0) return null;

  const startPt = routeData[climb.startIdx];
  const endPt = routeData[climb.endIdx];

  if (!startPt?.t || !endPt?.t) return null;

  const timeHours = (new Date(endPt.t) - new Date(startPt.t)) / 3600000;
  if (timeHours <= 0) return null;

  const vam = climb.gain / timeHours;

  let level;
  if (vam >= 1500) level = "Profniveau";
  else if (vam >= 1200) level = "Uitstekend";
  else if (vam >= 900) level = "Sterk";
  else if (vam >= 600) level = "Gemiddeld";
  else level = "Rustig tempo";

  return { vam: Math.round(vam), level, timeMinutes: Math.round(timeHours * 60) };
}

// Geschat vermogen (W/kg) op basis van klimsnelheid
// Formule van Coggan: P/m = (g * Cg * v) + (Cd * A * rho * v³) / (2 * m)
// Vereenvoudigd: bij klimmen domineert zwaartekracht
export function estimatePowerPerKg(climb, routeData, weightKg = 65) {
  if (!climb || !routeData) return null;

  const startPt = routeData[climb.startIdx];
  const endPt = routeData[climb.endIdx];
  if (!startPt?.t || !endPt?.t) return null;

  const timeSecs = (new Date(endPt.t) - new Date(startPt.t)) / 1000;
  if (timeSecs <= 0) return null;

  const distM = climb.distance * 1000;
  const speed = distM / timeSecs; // m/s
  const grade = climb.gradient / 100;

  // Simplified power model for climbing
  const g = 9.81;
  const CdA = 0.4; // drag coefficient * frontal area
  const Crr = 0.005; // rolling resistance
  const rho = 1.225; // air density

  const Pgravity = weightKg * g * grade * speed;
  const Prolling = weightKg * g * Crr * speed;
  const Paero = 0.5 * CdA * rho * speed * speed * speed;

  const totalPower = Pgravity + Prolling + Paero;
  const wpkg = totalPower / weightKg;

  let level;
  if (wpkg >= 5.5) level = "World Tour niveau";
  else if (wpkg >= 4.5) level = "Semi-pro";
  else if (wpkg >= 3.5) level = "Sterk amateur";
  else if (wpkg >= 2.5) level = "Recreatief sterk";
  else level = "Recreatief";

  return {
    watts: Math.round(totalPower),
    wpkg: Math.round(wpkg * 10) / 10,
    level
  };
}

// Pacing analyse — was de inspanning gelijkmatig verdeeld?
export function analyzePacing(routeData) {
  if (!routeData || routeData.length < 10) return null;

  const withSpeed = routeData.filter(p => p.spd && p.spd > 0);
  if (withSpeed.length < 10) return null;

  const half = Math.floor(withSpeed.length / 2);
  const firstHalf = withSpeed.slice(0, half);
  const secondHalf = withSpeed.slice(half);

  const avgFirst = firstHalf.reduce((s, p) => s + p.spd, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, p) => s + p.spd, 0) / secondHalf.length;

  const ratio = avgSecond / avgFirst;
  const diff = ((ratio - 1) * 100).toFixed(1);

  let verdict, detail;
  if (ratio > 1.05) {
    verdict = "Negative split";
    detail = `Tweede helft ${Math.abs(diff)}% sneller — perfecte pacing! Je werd sterker naarmate de rit vorderde.`;
  } else if (ratio > 0.95) {
    verdict = "Even split";
    detail = "Hele rit nagenoeg hetzelfde tempo — zeer consistent!";
  } else if (ratio > 0.85) {
    verdict = "Lichte fade";
    detail = `Tweede helft ${Math.abs(diff)}% langzamer — normaal, maar er is ruimte om rustiger te beginnen.`;
  } else {
    verdict = "Flinke fade";
    detail = `Tweede helft ${Math.abs(diff)}% langzamer — te hard begonnen! Probeer de eerste helft rustiger aan te doen.`;
  }

  return {
    verdict,
    detail,
    avgFirst: Math.round(avgFirst * 10) / 10,
    avgSecond: Math.round(avgSecond * 10) / 10,
    ratio: Math.round(ratio * 100) / 100,
  };
}

// Vermoeidheidsindex — HR drift analyse
// Als hartslag stijgt terwijl snelheid gelijk blijft of daalt = vermoeidheid
export function analyzeFatigue(routeData) {
  if (!routeData || routeData.length < 20) return null;

  const withHR = routeData.filter(p => p.hr && p.spd);
  if (withHR.length < 20) return null;

  const quarter = Math.floor(withHR.length / 4);
  const firstQ = withHR.slice(0, quarter);
  const lastQ = withHR.slice(-quarter);

  const hrFirst = firstQ.reduce((s, p) => s + p.hr, 0) / firstQ.length;
  const hrLast = lastQ.reduce((s, p) => s + p.hr, 0) / lastQ.length;
  const spdFirst = firstQ.reduce((s, p) => s + p.spd, 0) / firstQ.length;
  const spdLast = lastQ.reduce((s, p) => s + p.spd, 0) / lastQ.length;

  const hrDrift = ((hrLast - hrFirst) / hrFirst * 100);
  const spdDrift = ((spdLast - spdFirst) / spdFirst * 100);

  // Cardiac drift: HR goes up while speed is same/lower
  const fatigueIndex = hrDrift - spdDrift;

  let verdict, detail;
  if (fatigueIndex > 15) {
    verdict = "Flinke vermoeidheid";
    detail = `Je hartslag steeg ${hrDrift.toFixed(0)}% terwijl je snelheid daalde. Je lichaam moest harder werken voor dezelfde inspanning — teken van vermoeidheid of hitte.`;
  } else if (fatigueIndex > 8) {
    verdict = "Matige vermoeidheid";
    detail = `Lichte cardiac drift gedetecteerd. Normaal voor een langere inspanning. Goed hydrateren helpt!`;
  } else if (fatigueIndex > 0) {
    verdict = "Minimale vermoeidheid";
    detail = "Nauwelijks vermoeidheid zichtbaar. Je was goed voorbereid op deze inspanning!";
  } else {
    verdict = "Fris als een hoentje";
    detail = "Geen vermoeidheid gedetecteerd. Je had waarschijnlijk nog meer in de tank!";
  }

  return {
    verdict,
    detail,
    hrDrift: Math.round(hrDrift * 10) / 10,
    spdDrift: Math.round(spdDrift * 10) / 10,
    fatigueIndex: Math.round(fatigueIndex),
    hrFirst: Math.round(hrFirst),
    hrLast: Math.round(hrLast),
  };
}

// Herstelsnelheid — hoe snel daalt HR na piek-inspanning
export function analyzeRecovery(routeData) {
  if (!routeData || routeData.length < 20) return null;

  const withHR = routeData.filter(p => p.hr && p.t);
  if (withHR.length < 20) return null;

  // Vind het punt met de hoogste hartslag
  let peakIdx = 0;
  let peakHR = 0;
  for (let i = 0; i < withHR.length; i++) {
    if (withHR[i].hr > peakHR) {
      peakHR = withHR[i].hr;
      peakIdx = i;
    }
  }

  // Zoek de HR 60 seconden na de piek
  const peakTime = new Date(withHR[peakIdx].t).getTime();
  let hr60 = null;
  for (let i = peakIdx + 1; i < withHR.length; i++) {
    const elapsed = (new Date(withHR[i].t).getTime() - peakTime) / 1000;
    if (elapsed >= 55 && elapsed <= 120) {
      hr60 = withHR[i].hr;
      break;
    }
  }

  if (!hr60) return null;

  const drop = peakHR - hr60;

  let verdict;
  if (drop >= 30) verdict = "Uitstekend herstel";
  else if (drop >= 20) verdict = "Goed herstel";
  else if (drop >= 12) verdict = "Gemiddeld herstel";
  else verdict = "Traag herstel";

  return {
    peakHR,
    hrAfter60: hr60,
    drop,
    verdict,
  };
}

// Hartslag zones berekenen (op basis van max HR uit data)
export function getHRZones(routeData) {
  if (!routeData) return null;

  const hrs = routeData.filter(p => p.hr).map(p => p.hr);
  if (hrs.length === 0) return null;

  const maxHR = Math.max(...hrs);
  // Schat max HR (als gemeten max laag is, gebruik 220-leeftijd schatting)
  const estimatedMax = Math.max(maxHR, 190); // conservatieve schatting

  const zones = [
    { name: "Zone 1 — Herstel", min: 0, max: Math.round(estimatedMax * 0.6), color: "#3498db" },
    { name: "Zone 2 — Basis", min: Math.round(estimatedMax * 0.6), max: Math.round(estimatedMax * 0.7), color: "#2ecc71" },
    { name: "Zone 3 — Tempo", min: Math.round(estimatedMax * 0.7), max: Math.round(estimatedMax * 0.8), color: "#f39c12" },
    { name: "Zone 4 — Drempel", min: Math.round(estimatedMax * 0.8), max: Math.round(estimatedMax * 0.9), color: "#e67e22" },
    { name: "Zone 5 — Maximum", min: Math.round(estimatedMax * 0.9), max: 999, color: "#e74c3c" },
  ];

  // Bereken tijd in elke zone
  let totalTime = 0;
  const zoneTimes = zones.map(() => 0);

  for (let i = 1; i < routeData.length; i++) {
    if (!routeData[i].hr || !routeData[i].t || !routeData[i-1].t) continue;
    const dt = (new Date(routeData[i].t) - new Date(routeData[i-1].t)) / 1000;
    if (dt <= 0 || dt > 300) continue; // skip gaps
    totalTime += dt;

    for (let z = zones.length - 1; z >= 0; z--) {
      if (routeData[i].hr >= zones[z].min) {
        zoneTimes[z] += dt;
        break;
      }
    }
  }

  return zones.map((z, i) => ({
    ...z,
    seconds: zoneTimes[i],
    percentage: totalTime > 0 ? Math.round((zoneTimes[i] / totalTime) * 100) : 0,
  }));
}

// Effort score — eigen berekening (gewogen op HR zones)
export function calculateEffortScore(routeData) {
  const zones = getHRZones(routeData);
  if (!zones) return null;

  const weights = [1, 2, 3, 5, 8]; // exponentieel zwaarder per zone
  let score = 0;
  let totalSecs = 0;

  zones.forEach((z, i) => {
    score += (z.seconds / 60) * weights[i];
    totalSecs += z.seconds;
  });

  // Normaliseer naar 0-100 schaal
  const normalized = Math.min(100, Math.round(score / (totalSecs / 60) * 12));

  let label;
  if (normalized >= 80) label = "Maximale inspanning";
  else if (normalized >= 60) label = "Zware inspanning";
  else if (normalized >= 40) label = "Stevige inspanning";
  else if (normalized >= 20) label = "Matige inspanning";
  else label = "Lichte inspanning";

  return { score: normalized, label };
}

// Haal HR zone kleur op voor een specifieke HR waarde
export function getHRZoneColor(hr, maxHR) {
  if (!hr || !maxHR) return "#95a5a6";
  const pct = hr / maxHR;
  if (pct >= 0.9) return "#e74c3c";
  if (pct >= 0.8) return "#e67e22";
  if (pct >= 0.7) return "#f39c12";
  if (pct >= 0.6) return "#2ecc71";
  return "#3498db";
}
