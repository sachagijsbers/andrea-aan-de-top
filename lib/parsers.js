// ==================== GPX PARSER ====================
export function parseGPX(xmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'text/xml');
  const points = [];

  let trkpts = xml.querySelectorAll('trkpt');
  if (trkpts.length === 0) trkpts = xml.querySelectorAll('rtept');

  trkpts.forEach(pt => {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lon = parseFloat(pt.getAttribute('lon'));
    const ele = pt.querySelector('ele');
    const time = pt.querySelector('time');

    let hr = null, cad = null, power = null;

    // Check extensions (Garmin format)
    const extensions = pt.querySelector('extensions');
    if (extensions) {
      const allEls = extensions.querySelectorAll('*');
      allEls.forEach(el => {
        const name = el.localName.toLowerCase();
        if (name === 'hr' || name === 'heartrate') hr = parseFloat(el.textContent);
        if (name === 'cad' || name === 'cadence') cad = parseFloat(el.textContent);
        if (name === 'power' || name === 'watts') power = parseFloat(el.textContent);
      });
    }

    points.push({
      lat, lon,
      elevation: ele ? parseFloat(ele.textContent) : null,
      time: time ? new Date(time.textContent) : null,
      hr, cadence: cad, power
    });
  });

  const nameEl = xml.querySelector('trk > name') || xml.querySelector('metadata > name');
  const name = nameEl ? nameEl.textContent : 'Activiteit';

  return processPoints(points, name);
}

// ==================== FIT PARSER ====================
export function parseFIT(buffer) {
  // Dynamic import won't work, use global FitParser
  const FitParserLib = require('fit-file-parser').default || require('fit-file-parser');
  const fitParser = new FitParserLib({
    force: true,
    speedUnit: 'km/h',
    lengthUnit: 'km',
    elapsedRecordField: true
  });

  fitParser.parse(new Uint8Array(buffer));

  const records = fitParser.records || [];
  const points = [];

  for (const rec of records) {
    if (rec.position_lat != null && rec.position_long != null) {
      points.push({
        lat: rec.position_lat,
        lon: rec.position_long,
        elevation: rec.altitude || rec.enhanced_altitude || null,
        time: rec.timestamp ? new Date(rec.timestamp) : null,
        hr: rec.heart_rate || null,
        cadence: rec.cadence || null,
        power: rec.power || null,
        speed: rec.speed || rec.enhanced_speed || null
      });
    }
  }

  const sessions = fitParser.sessions || [];
  const session = sessions[0] || {};
  const name = session.sport ? capitalizeFirst(session.sport) : 'Activiteit';

  return processPoints(points, name);
}

// ==================== PROCESS POINTS ====================
function processPoints(points, name) {
  if (points.length === 0) throw new Error('Geen GPS punten gevonden');

  // Calculate distances
  let totalDist = 0;
  points[0].distance = 0;
  for (let i = 1; i < points.length; i++) {
    totalDist += haversine(points[i-1].lat, points[i-1].lon, points[i].lat, points[i].lon);
    points[i].distance = totalDist;
  }

  // Calculate speed if not present
  for (let i = 1; i < points.length; i++) {
    if (!points[i].speed && points[i].time && points[i-1].time) {
      const dt = (points[i].time - points[i-1].time) / 1000;
      const dd = points[i].distance - points[i-1].distance;
      points[i].speed = dt > 0 ? (dd / dt) * 3600 : 0;
    }
  }

  // Time
  let totalTime = 0;
  if (points[0].time && points[points.length-1].time) {
    totalTime = (points[points.length-1].time - points[0].time) / 1000;
  }

  // Smoothed elevation
  const smoothedEle = smoothArray(points.map(p => p.elevation), 5);

  // Elevation gain/loss
  let elevGain = 0, elevLoss = 0;
  for (let i = 1; i < smoothedEle.length; i++) {
    if (smoothedEle[i] != null && smoothedEle[i-1] != null) {
      const diff = smoothedEle[i] - smoothedEle[i-1];
      if (diff > 0) elevGain += diff;
      else elevLoss += Math.abs(diff);
    }
  }

  // Stats
  const hrValues = points.filter(p => p.hr).map(p => p.hr);
  const speedValues = points.filter(p => p.speed && p.speed > 1 && p.speed < 120).map(p => p.speed);
  const cadValues = points.filter(p => p.cadence && p.cadence > 0).map(p => p.cadence);
  const powerValues = points.filter(p => p.power && p.power > 0).map(p => p.power);

  const avg = arr => arr.length > 0 ? arr.reduce((a,b) => a+b, 0) / arr.length : 0;
  const max = arr => arr.length > 0 ? Math.max(...arr) : 0;

  const avgSpeed = speedValues.length > 0 ? avg(speedValues) : (totalTime > 0 ? (totalDist / totalTime) * 3600 : 0);

  // Detect climbs
  const climbs = detectClimbs(points, smoothedEle);

  return {
    name,
    date: points[0].time,
    points,
    smoothedEle,
    totalDistance: totalDist,
    totalTime,
    elevationGain: Math.round(elevGain),
    elevationLoss: Math.round(elevLoss),
    avgSpeed,
    maxSpeed: max(speedValues),
    avgHR: hrValues.length > 0 ? Math.round(avg(hrValues)) : null,
    maxHR: hrValues.length > 0 ? max(hrValues) : null,
    avgCadence: cadValues.length > 0 ? Math.round(avg(cadValues)) : null,
    avgPower: powerValues.length > 0 ? Math.round(avg(powerValues)) : null,
    hasHR: hrValues.length > 0,
    hasCadence: cadValues.length > 0,
    hasPower: powerValues.length > 0,
    climbs
  };
}

// ==================== CLIMB DETECTION ====================
function detectClimbs(points, smoothedEle) {
  const climbs = [];
  const MIN_GAIN = 30;
  const MIN_GRADIENT = 3;

  let climbStart = null;
  let climbGain = 0;
  let runningLoss = 0;

  for (let i = 1; i < smoothedEle.length; i++) {
    if (smoothedEle[i] == null || smoothedEle[i-1] == null) continue;
    const diff = smoothedEle[i] - smoothedEle[i-1];

    if (diff > 0) {
      if (climbStart === null) {
        climbStart = i - 1;
        climbGain = 0;
        runningLoss = 0;
      }
      climbGain += diff;
      runningLoss = 0;
    } else {
      runningLoss += Math.abs(diff);
      if (runningLoss > 30 && climbStart !== null) {
        finishClimb(i);
      }
    }
  }
  if (climbStart !== null) finishClimb(points.length - 1);

  function finishClimb(endIdx) {
    const dist = points[endIdx].distance - points[climbStart].distance;
    const gradient = dist > 0 ? (climbGain / (dist * 1000)) * 100 : 0;

    if (climbGain >= MIN_GAIN && gradient >= MIN_GRADIENT) {
      climbs.push({
        startIdx: climbStart,
        endIdx,
        gain: Math.round(climbGain),
        distance: Math.round(dist * 100) / 100,
        gradient: Math.round(gradient * 10) / 10,
        startEle: Math.round(smoothedEle[climbStart]),
        endEle: Math.round(smoothedEle[climbStart] + climbGain),
        category: getClimbCategory(climbGain, dist)
      });
    }
    climbStart = null;
    climbGain = 0;
    runningLoss = 0;
  }

  return climbs.sort((a, b) => b.gain - a.gain);
}

function getClimbCategory(gain, distKm) {
  const score = gain * gain / (distKm * 1000 / 10);
  if (score >= 800) return 'HC';
  if (score >= 400) return 'Cat 1';
  if (score >= 200) return 'Cat 2';
  if (score >= 100) return 'Cat 3';
  if (score >= 50) return 'Cat 4';
  return 'Heuvel';
}

// ==================== UTILITIES ====================
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function smoothArray(arr, window) {
  return arr.map((_, i) => {
    if (arr[i] == null) return null;
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - window); j <= Math.min(arr.length - 1, i + window); j++) {
      if (arr[j] != null) { sum += arr[j]; count++; }
    }
    return count > 0 ? sum / count : null;
  });
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
