// Motiverende berichten engine voor Andrea

const messages = {
  longActivity: [
    "Wat een tocht! De meeste mensen doen dit niet eens in een week.",
    "80+ kilometer? Andrea, je bent een machine!",
    "Die benen stoppen niet. Chapeau!",
    "Lang, langer, langst. Wat een uithoudingsvermogen!",
  ],
  bigClimbing: [
    "Meer dan 1000 hoogtemeters! De bergen zijn van jou.",
    "Klimkoningin! Zoveel hoogtemeters, wauw.",
    "Niks houdt jou tegen op die berg.",
    "Je hebt letterlijk bergen verzet vandaag.",
  ],
  epicClimbing: [
    "2000+ hoogtemeters?! Andrea, dit is profniveau.",
    "Even voor de duidelijkheid: dit is ABSURD goed.",
    "Stalen benen! Dit vergeet je nooit meer.",
    "De bergen buigen voor jou. Respect.",
  ],
  fastCycling: [
    "25+ gemiddeld! Was er een motor aan je fiets?",
    "Snelheidsduivel! Wat een tempo.",
    "Die gemiddelde snelheid is echt indrukwekkend.",
  ],
  longRun: [
    "Wat een afstand gelopen! Respect.",
    "Die kilometers vlogen voorbij. Sterke loop!",
    "Wat een doorzetter. Lekker gelopen!",
  ],
  fastRun: [
    "Dat tempo! Je vliegt over het pad.",
    "Wat een pace! Andrea is on fire.",
    "Snelle benen vandaag! Top gelopen.",
  ],
  hiking: [
    "De bergen op! Wat een uitzicht moet dat zijn geweest.",
    "Weer een top bereikt. Andrea aan de top!",
    "Stap voor stap naar boven. Wat een prestatie.",
    "Die berg had geen schijn van kans.",
  ],
  highEffort: [
    "Je hebt er ALLES aan gegeven. Respect.",
    "Die hartslag zegt genoeg. Vol gas!",
    "Maximum effort! Daar word je sterker van.",
  ],
  shortActivity: [
    "Soms is een korte sessie precies wat je nodig hebt.",
    "Kwaliteit boven kwantiteit. Goed bezig!",
    "Lekker bewogen! Elke kilometer telt.",
  ],
  streak: [
    "Dag {days} op rij! Die benen kennen geen rust.",
    "{days} dagen achter elkaar. Stalen discipline!",
    "Dag {days}! Niks houdt jou tegen.",
  ],
  newRecord: [
    "NIEUW RECORD! {what}! Je wordt steeds beter.",
    "Personal best: {what}! De vorm is er.",
    "Record gebroken! {what} - Andrea aan de top!",
  ],
  steepClimb: [
    "Een klim van {pct}%?! Gewoon doen, niet nadenken.",
    "{pct}% gemiddeld. Sommige mensen lopen dit niet eens op.",
    "Die {pct}% klim was STEIL. Maar jij ging gewoon door.",
  ],
  bigCatClimb: [
    "Een {cat} klim afgevinkt! Dat is profniveau.",
    "{cat} beklimming voltooid. De groten doen dit.",
    "Officieel een {cat} beklimming. Andrea aan de top!",
  ],
  firstActivity: [
    "De eerste activiteit is binnen! Laat de data maar stromen.",
    "Welkom Andrea! Je avontuur begint hier.",
    "Nummer 1 staat erin. Op naar de volgende!",
  ],
  general: [
    "Weer een dag, weer een prestatie. Lekker bezig!",
    "De vakantie gaat goed! Blijven bewegen.",
    "Andrea stopt niet. Niets houdt haar tegen.",
    "Goed bezig! Elke sessie maakt je sterker.",
    "Wat een energie! Blijven gaan.",
  ],
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getMotivation(activity, allActivities = []) {
  const msgs = [];
  const dist = activity.distance || activity.totalDistance || 0;
  const elev = activity.elevation_gain || activity.elevationGain || 0;
  const spd = activity.avg_speed || activity.avgSpeed || 0;
  const maxHr = activity.max_hr || activity.maxHR || 0;
  const climbs = activity.climbs || [];
  const sport = (activity.sport || activity.name || "").toLowerCase();
  const isRun = sport.includes("run") || sport.includes("trail") || sport.includes("hardlo");
  const isHike = sport.includes("hik") || sport.includes("walk") || sport.includes("wander") || sport.includes("berg");

  // First activity
  if (allActivities.length <= 1) {
    msgs.push(pickRandom(messages.firstActivity));
  }

  // Elevation based
  if (elev >= 2000) {
    msgs.push(pickRandom(messages.epicClimbing));
  } else if (elev >= 1000) {
    msgs.push(pickRandom(messages.bigClimbing));
  }

  // Sport-specific
  if (isHike && elev >= 300) {
    msgs.push(pickRandom(messages.hiking));
  } else if (isRun) {
    if (dist >= 15) msgs.push(pickRandom(messages.longRun));
    if (spd >= 12) msgs.push(pickRandom(messages.fastRun));
  } else {
    // Cycling
    if (dist >= 80) msgs.push(pickRandom(messages.longActivity));
    if (spd >= 25) msgs.push(pickRandom(messages.fastCycling));
  }

  if (dist < 10 && !isHike) {
    msgs.push(pickRandom(messages.shortActivity));
  }

  if (maxHr >= 180) {
    msgs.push(pickRandom(messages.highEffort));
  }

  // Climb cards
  for (const climb of climbs) {
    if (climb.gradient >= 10) {
      msgs.push(pickRandom(messages.steepClimb).replace("{pct}", climb.gradient));
      break;
    }
  }
  for (const climb of climbs) {
    if (climb.category === "HC" || climb.category === "Cat 1") {
      msgs.push(pickRandom(messages.bigCatClimb).replace("{cat}", climb.category));
      break;
    }
  }

  // Streak
  if (allActivities.length >= 2) {
    const streak = calculateStreak(allActivities);
    if (streak >= 3) msgs.push(pickRandom(messages.streak).replace("{days}", streak));
  }

  // Records
  if (allActivities.length >= 2) {
    for (const rec of checkRecords(activity, allActivities)) {
      msgs.push(pickRandom(messages.newRecord).replace("{what}", rec));
    }
  }

  if (msgs.length === 0) msgs.push(pickRandom(messages.general));

  return msgs.slice(0, 3);
}

function calculateStreak(activities) {
  const sorted = [...activities].filter(a => a.date).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (sorted.length < 2) return 1;
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = Math.round((new Date(sorted[i-1].date) - new Date(sorted[i].date)) / 86400000);
    if (diff <= 1.5) streak++;
    else break;
  }
  return streak;
}

function checkRecords(activity, allActivities) {
  const records = [];
  const others = allActivities.filter(a => a.id !== activity.id);
  if (others.length === 0) return records;

  const dist = activity.distance || 0;
  const elev = activity.elevation_gain || 0;
  const spd = activity.avg_speed || 0;

  const maxDist = Math.max(...others.map(a => a.distance || 0));
  const maxElev = Math.max(...others.map(a => a.elevation_gain || 0));
  const maxSpd = Math.max(...others.map(a => a.avg_speed || 0));

  if (dist > maxDist && dist > 0) records.push(`Langste tocht: ${dist.toFixed(1)} km`);
  if (elev > maxElev && elev > 0) records.push(`Meeste hoogtemeters: ${elev}m`);
  if (spd > maxSpd && spd > 0) records.push(`Snelste gemiddelde: ${spd.toFixed(1)} km/h`);

  return records;
}
