/* ============================================================
   DATA.JS — Tracks, Drivers, Tire Compounds, Points
   ============================================================ */

// ---------- TIRE COMPOUNDS ----------
// paceDelta: seconds per lap vs. a "medium" baseline on a DRY track (negative = faster)
// wearRate: relative wear speed (1.0 = baseline)
// dryGrip / wetGrip: 0-1 effectiveness multipliers in those conditions
const COMPOUNDS = {
  soft:         { id: 'soft',         name: 'Soft',         short: 'S',  color: '#ff4d4d', paceDelta: -0.55, wearRate: 1.65, dryGrip: 1.00, wetGrip: 0.18 },
  medium:       { id: 'medium',       name: 'Medium',       short: 'M',  color: '#ffd23f', paceDelta:  0.00, wearRate: 1.00, dryGrip: 0.97, wetGrip: 0.20 },
  hard:         { id: 'hard',         name: 'Hard',         short: 'H',  color: '#f2f2f2', paceDelta:  0.55, wearRate: 0.62, dryGrip: 0.93, wetGrip: 0.22 },
  intermediate: { id: 'intermediate', name: 'Intermediate', short: 'I',  color: '#3ecf5e', paceDelta:  1.80, wearRate: 1.05, dryGrip: 0.55, wetGrip: 0.85 },
  wet:          { id: 'wet',          name: 'Wet',          short: 'W',  color: '#3b82f6', paceDelta:  3.20, wearRate: 0.85, dryGrip: 0.35, wetGrip: 1.00 },
};

// ---------- DRIVERS ----------
// pace: raw speed (0-100)      consistency: fewer bad laps (0-100)
// wetSkill: wet-weather ability (0-100)      aggression: overtake frequency / crash risk (0-100)
// reliability: resistance to mechanical DNFs (0-100)
const DRIVERS = [
  // --- Player team: Falcon Racing ---
  { id: 'charles', name: 'Charles Dumont', team: 'Falcon Racing', teamColor: '#e8112d', isPlayer: true,
    pace: 91, consistency: 85, wetSkill: 82, aggression: 60, reliability: 90 },
  { id: 'lewis', name: 'Lewis Baron', team: 'Falcon Racing', teamColor: '#e8112d', isPlayer: false,
    pace: 92, consistency: 90, wetSkill: 88, aggression: 55, reliability: 92 },

  // --- Titan GP — title rivals ---
  { id: 'viktor', name: 'Viktor Kessler', team: 'Titan GP', teamColor: '#1e3a8a', isPlayer: false,
    pace: 93, consistency: 87, wetSkill: 79, aggression: 78, reliability: 88 },
  { id: 'diego', name: 'Diego Fuentes', team: 'Titan GP', teamColor: '#1e3a8a', isPlayer: false,
    pace: 86, consistency: 83, wetSkill: 75, aggression: 65, reliability: 90 },

  // --- Phoenix Motorsport ---
  { id: 'marco', name: 'Marco Veloce', team: 'Phoenix Motorsport', teamColor: '#ea580c', isPlayer: false,
    pace: 84, consistency: 80, wetSkill: 70, aggression: 70, reliability: 85 },
  { id: 'kenji', name: 'Kenji Takahashi', team: 'Phoenix Motorsport', teamColor: '#ea580c', isPlayer: false,
    pace: 82, consistency: 86, wetSkill: 80, aggression: 48, reliability: 93 },

  // --- Vortex Racing ---
  { id: 'oliver', name: 'Oliver Hayes', team: 'Vortex Racing', teamColor: '#7c3aed', isPlayer: false,
    pace: 80, consistency: 78, wetSkill: 68, aggression: 72, reliability: 82 },
  { id: 'rafael', name: 'Rafael Costa', team: 'Vortex Racing', teamColor: '#7c3aed', isPlayer: false,
    pace: 79, consistency: 81, wetSkill: 72, aggression: 58, reliability: 87 },
];

// ---------- TRACKS ----------
// laps: race distance
// baseLapTime: seconds, a representative "medium tire, clear track" lap
// tempFactor: multiplier on tire wear from heat/track abrasion (1.0 = neutral)
// rainChanceBase: overall probability of a rain event occurring at some point in the race (0-1)
// safetyCarBase: overall probability of at least one safety car in a clean dry race (0-1)
// wetSafetyCarMult: how much wetter conditions multiply the per-lap incident chance
// pitLoss: seconds lost making a pit stop (track/pit-lane length dependent)
// description/forecast: flavor text
const TRACKS = [
  {
    id: 'sepang', name: 'Sepang International Circuit', country: 'Malaysia', raceNumber: 1,
    laps: 56, baseLapTime: 95.0, tempFactor: 1.35, rainChanceBase: 0.55, safetyCarBase: 0.30,
    wetSafetyCarMult: 2.4, pitLoss: 22,
    climate: 'Tropical heat and crushing humidity. Track temps can exceed 55°C by early afternoon, and violent monsoon downpours can arrive with almost no warning.',
    forecastText: 'Hot and humid at lights-out. Forecasters give it a 55% chance a tropical storm cell rolls over the circuit before the finish.',
  },
  {
    id: 'singapore', name: 'Marina Bay Street Circuit', country: 'Singapore', raceNumber: 2,
    laps: 61, baseLapTime: 112.0, tempFactor: 1.15, rainChanceBase: 0.30, safetyCarBase: 0.70,
    wetSafetyCarMult: 2.0, pitLoss: 26,
    climate: 'A brutal, bumpy night race under floodlights. Unforgiving concrete walls line every corner — the smallest mistake ends a race instantly.',
    forecastText: 'Warm and sticky under the lights. Walls are close all night, so expect the safety car — rain is possible but not the main concern here.',
  },
  {
    id: 'monza', name: 'Autodromo Nazionale Monza', country: 'Italy', raceNumber: 3,
    laps: 53, baseLapTime: 82.0, tempFactor: 0.80, rainChanceBase: 0.20, safetyCarBase: 0.20,
    wetSafetyCarMult: 2.6, pitLoss: 21,
    climate: 'The Temple of Speed — long flat-out straights, low downforce, and light tire wear. Mostly dry and stable, but a sudden autumn squall is not unheard of.',
    forecastText: 'Clear skies expected, low tire stress all weekend. Only a 20% chance of a late-race shower sweeping in from the north.',
  },
  {
    id: 'spa', name: 'Circuit de Spa-Francorchamps', country: 'Belgium', raceNumber: 4,
    laps: 44, baseLapTime: 107.0, tempFactor: 1.10, rainChanceBase: 0.65, safetyCarBase: 0.50,
    wetSafetyCarMult: 2.8, pitLoss: 23,
    climate: "The Ardennes forest makes its own weather. It can be bone dry at Eau Rouge and pouring rain at Pouhon — microclimates change lap to lap.",
    forecastText: 'Classic Ardennes uncertainty: 65% chance rain hits part of the lap at some point, and it may not be the same part twice.',
  },
  {
    id: 'silverstone', name: 'Silverstone Circuit', country: 'United Kingdom', raceNumber: 5,
    laps: 52, baseLapTime: 89.0, tempFactor: 1.00, rainChanceBase: 0.45, safetyCarBase: 0.30,
    wetSafetyCarMult: 2.2, pitLoss: 22,
    climate: 'Fast, flowing, and exposed to everything the British sky can throw at it — wind, drizzle, or a clean sunny afternoon, sometimes all three.',
    forecastText: 'Typical Silverstone gamble: 45% rain chance and gusty crosswinds through Copse and Stowe all weekend. Championship decider — nerves will be as much a factor as the weather.',
  },
];

// ---------- POINTS ----------
const POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

function pointsForPosition(pos) {
  return POINTS_TABLE[pos - 1] || 0;
}

if (typeof module !== 'undefined') {
  module.exports = { COMPOUNDS, DRIVERS, TRACKS, POINTS_TABLE, pointsForPosition };
}
