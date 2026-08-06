import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Only create client if configured
export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export async function saveActivity(activity) {
  if (!supabase) throw new Error('Supabase niet geconfigureerd');

  const maxPoints = 2000;
  let routeData = activity.points.map(p => ({
    lat: p.lat,
    lon: p.lon,
    ele: p.elevation,
    dist: Math.round(p.distance * 1000) / 1000,
    spd: p.speed ? Math.round(p.speed * 10) / 10 : null,
    hr: p.hr || null,
    cad: p.cadence || null,
    pwr: p.power || null,
    t: p.time ? p.time.toISOString() : null,
  }));

  if (routeData.length > maxPoints) {
    const step = Math.ceil(routeData.length / maxPoints);
    routeData = routeData.filter((_, i) => i % step === 0);
  }

  const { data, error } = await supabase.from('activities').insert({
    name: activity.name,
    sport: activity.sport || 'cycling',
    date: activity.date ? activity.date.toISOString() : null,
    distance: activity.totalDistance,
    duration: activity.totalTime,
    elevation_gain: activity.elevationGain,
    elevation_loss: activity.elevationLoss,
    avg_speed: activity.avgSpeed,
    max_speed: activity.maxSpeed,
    avg_hr: activity.avgHR,
    max_hr: activity.maxHR,
    avg_cadence: activity.avgCadence,
    avg_power: activity.avgPower,
    file_name: activity.fileName,
    route_data: routeData,
    climbs: activity.climbs,
  }).select().single();

  if (error) throw error;
  return data;
}

export async function getActivities() {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .order('date', { ascending: false });

  if (error) throw error;
  return data;
}

export async function deleteActivity(id) {
  if (!supabase) return;
  const { error } = await supabase.from('activities').delete().eq('id', id);
  if (error) throw error;
}
