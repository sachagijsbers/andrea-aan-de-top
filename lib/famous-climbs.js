// Database van bekende klimmen voor vergelijking
export const famousClimbs = [
  { name: "Alpe d'Huez", country: "Frankrijk", distance: 13.8, gain: 1071, gradient: 7.9 },
  { name: "Mont Ventoux (Bedoin)", country: "Frankrijk", distance: 21.5, gain: 1617, gradient: 7.5 },
  { name: "Col du Tourmalet", country: "Frankrijk", distance: 17.1, gain: 1268, gradient: 7.4 },
  { name: "Col du Galibier", country: "Frankrijk", distance: 18.1, gain: 1245, gradient: 6.9 },
  { name: "Stelvio (Prato)", country: "Italie", distance: 24.3, gain: 1808, gradient: 7.4 },
  { name: "Mortirolo", country: "Italie", distance: 12.4, gain: 1300, gradient: 10.5 },
  { name: "Angliru", country: "Spanje", distance: 12.5, gain: 1266, gradient: 10.1 },
  { name: "Sa Calobra", country: "Mallorca", distance: 9.4, gain: 682, gradient: 7.1 },
  { name: "Monte Zoncolan", country: "Italie", distance: 10.1, gain: 1210, gradient: 12.0 },
  { name: "Col de la Madeleine", country: "Frankrijk", distance: 19.2, gain: 1520, gradient: 7.9 },
  { name: "Passo Gavia", country: "Italie", distance: 17.3, gain: 1363, gradient: 7.9 },
  { name: "Cauberg", country: "Nederland", distance: 0.8, gain: 54, gradient: 6.5 },
  { name: "Muur van Geraardsbergen", country: "Belgie", distance: 1.1, gain: 92, gradient: 8.1 },
  { name: "Koppenberg", country: "Belgie", distance: 0.6, gain: 64, gradient: 11.6 },
  { name: "Paterberg", country: "Belgie", distance: 0.4, gain: 45, gradient: 12.9 },
  { name: "Oude Kwaremont", country: "Belgie", distance: 2.2, gain: 90, gradient: 4.1 },
  { name: "Col d'Izoard", country: "Frankrijk", distance: 14.1, gain: 1105, gradient: 7.3 },
  { name: "Puy de Dome", country: "Frankrijk", distance: 13.0, gain: 1015, gradient: 7.8 },
  { name: "Blockhaus", country: "Italie", distance: 13.6, gain: 1210, gradient: 8.4 },
  { name: "Etna (Nicolosi)", country: "Italie", distance: 18.5, gain: 1340, gradient: 7.2 },
];

// Vergelijk de totale hoogtemeters van een activiteit met bekende klimmen
export function compareWithFamousClimbs(elevationGain) {
  if (!elevationGain || elevationGain < 20) return [];

  const comparisons = [];

  for (const climb of famousClimbs) {
    const times = elevationGain / climb.gain;
    if (times >= 0.3 && times <= 20) {
      comparisons.push({
        climb,
        times: Math.round(times * 10) / 10,
        exact: Math.abs(times - Math.round(times)) < 0.15,
      });
    }
  }

  // Sorteer: eerst de beste matches (dichtst bij een heel getal)
  comparisons.sort((a, b) => {
    const aRound = Math.abs(a.times - Math.round(a.times));
    const bRound = Math.abs(b.times - Math.round(b.times));
    return aRound - bRound;
  });

  return comparisons.slice(0, 5);
}

// Vergelijk individuele klimmen met bekende klimmen op basis van profiel
export function matchClimbProfile(climb) {
  if (!climb) return null;

  let bestMatch = null;
  let bestScore = Infinity;

  for (const famous of famousClimbs) {
    // Score op basis van verschil in gradient en lengte
    const gradDiff = Math.abs(climb.gradient - famous.gradient) / famous.gradient;
    const gainDiff = Math.abs(climb.gain - famous.gain) / famous.gain;
    const score = gradDiff + gainDiff;

    if (score < bestScore) {
      bestScore = score;
      bestMatch = { ...famous, similarity: Math.max(0, Math.round((1 - score / 2) * 100)) };
    }
  }

  return bestMatch;
}
