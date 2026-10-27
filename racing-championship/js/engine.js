/* ============================================================
   ENGINE.JS — Lap-by-lap race simulation
   ============================================================
   Flow for each lap (driven by main.js):
     1. engine.prepareLap()        -> rolls weather/incidents, figures out
                                       whether the PLAYER needs to make a
                                       decision this lap, returns a context.
     2. (if decision needed)        main.js shows a modal, player answers,
         engine.resolvePlayerDecision(choice)
     3. engine.computeLap()        -> finalizes lap times, wear, order;
                                       returns a lap report for the UI log.
   AI drivers always decide for themselves inside prepareLap/computeLap.
*/

const BASE_WEAR_PER_LAP = 4.2;   // % wear per lap at wearRate 1.0, tempFactor 1.0, normal pace
const WEATHER_STATES = ['dry', 'light', 'heavy'];

function rand(min, max) { return min + Math.random() * (max - min); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

class RaceEngine {
  constructor(track, driverList, playerId, championshipPoints) {
    this.track = track;
    this.playerId = playerId;
    this.lap = 0;
    this.totalLaps = track.laps;
    this.weather = 'dry';
    this.weatherLaps = 0; // laps spent in current weather state (for stability)
    this.safetyCar = { active: false, lapsRemaining: 0, justDeployed: false };
    this.finished = false;
    this.log = [];
    this.championshipPoints = championshipPoints || {}; // id -> points so far (for AI "title fight" flavor only)

    // Per-driver running state
    this.drivers = driverList.map(d => ({
      ...d,
      compound: 'medium',
      tireWear: 0,
      totalTime: 0,
      lastLapTime: null,
      pitStops: 0,
      status: 'running',      // running | dnf | finished
      dnfReason: null,
      paceMode: 'normal',      // push | normal | conserve
      position: 0,
      startingCompoundChosen: false,
    }));

    this._pendingDecision = null; // decision context for the player, if any
    this._pendingCrashEvents = []; // AI incidents resolved this lap
    this._pendingPlayerChoice = null;
  }

  getDriver(id) { return this.drivers.find(d => d.id === id); }
  getPlayer() { return this.getDriver(this.playerId); }
  runningDrivers() { return this.drivers.filter(d => d.status === 'running'); }

  // Call once before lap 1 to set the player's starting compound (and auto-assign AI).
  setStartingCompound(playerCompoundId) {
    for (const d of this.drivers) {
      if (d.id === this.playerId) {
        d.compound = playerCompoundId;
      } else {
        d.compound = this._aiStartCompoundChoice(d);
      }
      d.startingCompoundChosen = true;
    }
  }

  _aiStartCompoundChoice(driver) {
    // Forecast-aware heuristic: riskier (more aggressive) drivers gamble more on borderline calls.
    const rainChance = this.track.rainChanceBase;
    if (rainChance > 0.55 && Math.random() < 0.3) return 'intermediate';
    if (rainChance > 0.35 && driver.aggression > 70 && Math.random() < 0.25) return 'intermediate';
    return Math.random() < 0.5 ? 'medium' : 'soft';
  }

  // ---------------- LAP PREP ----------------
  prepareLap() {
    this.lap += 1;
    this._pendingDecision = null;
    this._pendingCrashEvents = [];
    this.safetyCar.justDeployed = false;

    const lapEvents = [];

    // 1. Weather evolution (simple Markov walk, biased by track rainChanceBase)
    const weatherEvent = this._rollWeather();
    if (weatherEvent) lapEvents.push(weatherEvent);

    // 2. End safety car if its laps have elapsed
    if (this.safetyCar.active) {
      this.safetyCar.lapsRemaining -= 1;
      if (this.safetyCar.lapsRemaining <= 0) {
        this.safetyCar.active = false;
        lapEvents.push({ type: 'sc_end', text: 'The safety car heads back in — green flag, racing resumes!' });
      }
    }

    // 3. Incident rolls for AI (and tiny ambient chance for player)
    const incidentEvents = this._rollIncidents();
    lapEvents.push(...incidentEvents);

    // 4. Decide if the PLAYER needs a prompt this lap (priority order)
    const player = this.getPlayer();
    let decision = null;
    if (player.status === 'running') {
      if (weatherEvent && weatherEvent.significant) {
        decision = this._buildWeatherDecision(player, weatherEvent);
      } else if (this.safetyCar.justDeployed) {
        decision = this._buildSafetyCarDecision(player);
      } else if (player.tireWear >= 78 && player.compound !== 'pitting') {
        decision = this._buildTireDecision(player);
      } else {
        const overtake = this._maybeOvertakeOpportunity(player);
        if (overtake) {
          decision = overtake;
        } else if (this.lap % 5 === 0) {
          decision = this._buildPaceCheckIn(player);
        }
      }
    }

    this._pendingDecision = decision;
    this._pendingLapEvents = lapEvents;
    return {
      lap: this.lap,
      totalLaps: this.totalLaps,
      weather: this.weather,
      safetyCar: { ...this.safetyCar },
      events: lapEvents,
      decision,
    };
  }

  resolvePlayerDecision(choiceObj) {
    this._pendingPlayerChoice = choiceObj;
  }

  // ---------------- LAP COMPUTE ----------------
  computeLap() {
    const events = [...this._pendingLapEvents];
    const player = this.getPlayer();

    // Apply player's decision (if any was pending)
    if (this._pendingDecision && this._pendingPlayerChoice) {
      events.push(...this._applyPlayerChoice(player, this._pendingDecision, this._pendingPlayerChoice));
    }
    this._pendingPlayerChoice = null;

    // AI drivers: strategy decisions (pit calls, pace, overtake attempts)
    for (const d of this.drivers) {
      if (d.id === this.playerId || d.status !== 'running') continue;
      events.push(...this._aiLapDecisions(d));
    }

    // Compute lap times + wear for every running driver
    for (const d of this.drivers) {
      if (d.status !== 'running') continue;
      const result = this._computeLapTime(d);
      d.lastLapTime = result.lapTime;
      d.totalTime += result.lapTime;
      d.tireWear = clamp(d.tireWear + result.wearGain, 0, 100);
      if (result.pitted) d.pitStops += 1;
    }

    // Mechanical DNF rolls (rare)
    for (const d of this.drivers) {
      if (d.status !== 'running') continue;
      const failChance = (100 - d.reliability) / 100 * 0.0022;
      if (Math.random() < failChance) {
        d.status = 'dnf';
        d.dnfReason = 'mechanical failure';
        events.push({ type: 'dnf', text: `${d.name} pulls off track — smoke from the engine. Mechanical DNF.`, driverId: d.id });
      }
    }

    // Safety-car bunching: compress the field's gaps if SC is active
    if (this.safetyCar.active) {
      this._applySafetyCarBunching();
    }

    this._updatePositions();

    if (this.lap >= this.totalLaps) {
      this.finished = true;
      for (const d of this.drivers) {
        if (d.status === 'running') d.status = 'finished';
      }
      events.push({ type: 'finish', text: 'CHECKERED FLAG! The race is over.' });
    }

    const standings = this.drivers
      .slice()
      .sort((a, b) => this._finishOrderValue(a) - this._finishOrderValue(b))
      .map(d => ({
        id: d.id, name: d.name, team: d.team, teamColor: d.teamColor,
        position: d.position, gap: d.gapText, compound: d.compound,
        tireWear: Math.round(d.tireWear), status: d.status, isPlayer: d.id === this.playerId,
      }));

    this.log.push({ lap: this.lap, events, standings });

    return {
      lap: this.lap,
      totalLaps: this.totalLaps,
      finished: this.finished,
      weather: this.weather,
      safetyCar: { ...this.safetyCar },
      events,
      standings,
      player: {
        position: player.position, compound: player.compound, tireWear: Math.round(player.tireWear),
        lastLapTime: player.lastLapTime, status: player.status, gap: player.gapText,
      },
    };
  }

  // ---------------- WEATHER ----------------
  _rollWeather() {
    this.weatherLaps += 1;
    const base = this.track.rainChanceBase;
    // Probability of a transition attempt this lap, scaled so the whole-race chance roughly matches rainChanceBase
    const transitionChance = (base / this.totalLaps) * 2.6;
    if (Math.random() > transitionChance) return null;

    const idx = WEATHER_STATES.indexOf(this.weather);
    let newIdx;
    if (idx === 0) {
      newIdx = 1; // dry -> light
    } else if (idx === WEATHER_STATES.length - 1) {
      newIdx = Math.random() < 0.6 ? idx - 1 : idx; // heavy tends back toward light
    } else {
      newIdx = Math.random() < 0.5 ? idx - 1 : idx + 1;
    }
    if (newIdx === idx) return null;

    this.weather = WEATHER_STATES[newIdx];
    this.weatherLaps = 0;
    const gettingWorse = newIdx > idx;
    const text = gettingWorse
      ? (this.weather === 'light' ? 'Spots of rain are starting to fall on the circuit!' : 'The rain is intensifying — this is a proper downpour now!')
      : (this.weather === 'light' ? 'The rain is easing off to a light drizzle.' : 'The track is drying out — conditions are clearing up.');
    return { type: 'weather', text, significant: true, weather: this.weather, gettingWorse };
  }

  // ---------------- INCIDENTS / SAFETY CAR ----------------
  _rollIncidents() {
    const events = [];
    const wetMult = this.weather === 'dry' ? 1.0 : (this.weather === 'light' ? this.track.wetSafetyCarMult * 0.6 : this.track.wetSafetyCarMult);
    const perLapBase = (this.track.safetyCarBase / this.totalLaps) * 1.05;

    for (const d of this.drivers) {
      if (d.status !== 'running') continue;
      const isPlayer = d.id === this.playerId;
      const pushMult = d.paceMode === 'push' ? 1.35 : (d.paceMode === 'conserve' ? 0.65 : 1.0);
      const aggressionFactor = isPlayer ? 1.0 : (1 + (d.aggression - 50) / 240);
      const consistencyFactor = 1 + (100 - d.consistency) / 280;
      const wearFactor = 1 + d.tireWear / 220;
      const playerDamp = isPlayer ? 0.22 : 1.0; // player's ambient bad-luck is lower; explicit choices carry the real risk

      const chance = perLapBase * wetMult * pushMult * aggressionFactor * consistencyFactor * wearFactor * playerDamp;
      if (Math.random() < chance) {
        const severity = Math.random();
        if (severity < 0.62) {
          // Minor off — time loss only
          const penalty = rand(4, 9);
          d._offTrackPenalty = (d._offTrackPenalty || 0) + penalty;
          events.push({ type: 'off', text: `${isPlayer ? 'You run' : d.name + ' runs'} wide and loses time rejoining the track.`, driverId: d.id });
        } else {
          // Crash — DNF + safety car
          d.status = 'dnf';
          d.dnfReason = 'crash';
          events.push({ type: 'crash', text: `${isPlayer ? 'You crash out!' : d.name + ' crashes out!'} ${isPlayer ? 'Your race is over.' : 'Their race is over.'}`, driverId: d.id });
          if (!this.safetyCar.active) {
            this.safetyCar.active = true;
            this.safetyCar.justDeployed = true;
            this.safetyCar.lapsRemaining = Math.floor(rand(2, 5));
            events.push({ type: 'sc_start', text: 'SAFETY CAR DEPLOYED! The field bunches up behind it.' });
          }
        }
      }
    }
    return events;
  }

  // ---------------- DECISION BUILDERS ----------------
  _buildWeatherDecision(player, weatherEvent) {
    return {
      type: 'weather',
      title: weatherEvent.gettingWorse ? 'Rain is Falling' : 'Track is Drying',
      prompt: weatherEvent.gettingWorse
        ? `The ${this.weather === 'light' ? 'drizzle' : 'downpour'} is changing the grip levels. Your current tires are ${player.compound}. What do you want to do?`
        : `Conditions are improving. You're on ${player.compound} tires. What's the call?`,
      options: this._tireOptions(player, true),
    };
  }

  _buildSafetyCarDecision(player) {
    return {
      type: 'safety_car',
      title: 'Safety Car Deployed!',
      prompt: `The pit window is effectively free right now — a stop under the safety car costs far less time than a green-flag stop. Your tires are at ${Math.round(player.tireWear)}% wear. Box, or stay out and track position?`,
      options: [
        { id: 'stay', label: 'Stay out — keep track position', detail: 'No pit stop this lap.' },
        ...this._compoundPitOptions(player, true),
      ],
    };
  }

  _buildTireDecision(player) {
    return {
      type: 'tire_window',
      title: 'Pit Window Open',
      prompt: `Your ${COMPOUNDS[player.compound].name} tires are at ${Math.round(player.tireWear)}% wear and dropping off fast. Box this lap, or push on and stretch the stint?`,
      options: [
        { id: 'stay', label: 'Push on — stretch the stint', detail: 'Risk further degradation and a slower lap.' },
        ...this._compoundPitOptions(player, false),
      ],
    };
  }

  _maybeOvertakeOpportunity(player) {
    const order = this.runningDrivers().sort((a, b) => a.totalTime - b.totalTime);
    const idx = order.findIndex(d => d.id === player.id);
    if (idx <= 0) return null; // already leading
    const ahead = order[idx - 1];
    const gapEstimate = Math.max(0, (player.totalTime - ahead.totalTime));
    // Only occasionally offer this, and only when genuinely close
    if (gapEstimate < 1.3 && Math.random() < 0.35) {
      return {
        type: 'overtake',
        title: 'Overtake Chance!',
        prompt: `You're right on the gearbox of ${ahead.name} (${ahead.team}). Send it down the inside, or hold station and wait for a cleaner shot?`,
        options: [
          { id: 'attempt', label: 'Go for the move', detail: 'Chance to gain a position — also a chance of contact.' },
          { id: 'hold', label: 'Hold position', detail: 'Play it safe, look for a better opportunity.' },
        ],
      };
    }
    return null;
  }

  _buildPaceCheckIn(player) {
    return {
      type: 'pace',
      title: 'Pit Wall Radio',
      prompt: `Status check: P${player.position || '-'}, tires at ${Math.round(player.tireWear)}%. How do you want to run this stint?`,
      options: [
        { id: 'push', label: 'Push', detail: 'Faster pace, but tires wear quicker and risk goes up.' },
        { id: 'normal', label: 'Normal pace', detail: 'Balanced approach.' },
        { id: 'conserve', label: 'Conserve', detail: 'Protect the tires, give up a bit of pace.' },
      ],
    };
  }

  _tireOptions(player, urgentWeather) {
    return [
      { id: 'stay', label: `Stay out on ${COMPOUNDS[player.compound].name}`, detail: urgentWeather ? 'Risky if the mismatch gets worse.' : 'No stop this lap.' },
      ...this._compoundPitOptions(player, false),
    ];
  }

  _compoundPitOptions(player, isFreeStop) {
    const opts = [];
    for (const key of ['soft', 'medium', 'hard', 'intermediate', 'wet']) {
      if (key === player.compound) continue;
      opts.push({
        id: `pit_${key}`,
        label: `Box for ${COMPOUNDS[key].name}${isFreeStop ? ' (cheap stop)' : ''}`,
        detail: `${key === 'intermediate' || key === 'wet' ? 'Wet-weather tire.' : 'Slick tire.'}`,
        compound: key,
      });
    }
    return opts;
  }

  // ---------------- APPLY CHOICES ----------------
  _applyPlayerChoice(player, decision, choiceObj) {
    const events = [];
    const id = choiceObj.id;

    if (decision.type === 'overtake') {
      if (id === 'attempt') {
        const order = this.runningDrivers().sort((a, b) => a.totalTime - b.totalTime);
        const idx = order.findIndex(d => d.id === player.id);
        const ahead = order[idx - 1];
        const wetPenalty = this.weather !== 'dry' ? 0.18 : 0;
        const successChance = 0.55 + (player.pace - ahead.pace) / 200 - wetPenalty;
        const crashChance = 0.05 + wetPenalty * 0.4;
        const roll = Math.random();
        if (roll < crashChance) {
          player._offTrackPenalty = (player._offTrackPenalty || 0) + rand(6, 11);
          events.push({ type: 'overtake_fail', text: `Contact! You clip ${ahead.name} and spin — big time loss recovering.` });
        } else if (roll < crashChance + successChance) {
          player.totalTime -= rand(1.0, 2.2); // decisive swing in the gap
          events.push({ type: 'overtake_success', text: `You pull off a brilliant move around the outside of ${ahead.name}!` });
        } else {
          events.push({ type: 'overtake_hold', text: `You can't make it stick — ${ahead.name} defends into the next corner.` });
        }
      } else {
        events.push({ type: 'info', text: 'You hold station, keeping the tires and the car clean for now.' });
      }
      return events;
    }

    if (decision.type === 'pace') {
      player.paceMode = id;
      events.push({ type: 'info', text: `Radio: "Copy that, switching to ${id} pace."` });
      return events;
    }

    // Pit-related decisions (weather / tire_window / safety_car)
    if (id === 'stay') {
      events.push({ type: 'info', text: 'You stay out, holding track position.' });
      return events;
    }
    if (id.startsWith('pit_')) {
      const compound = choiceObj.compound;
      player._pitThisLap = compound;
      player._pitUnderSC = decision.type === 'safety_car' && this.safetyCar.active;
      events.push({ type: 'pit_call', text: `Box, box! Pitting for ${COMPOUNDS[compound].name} tires.` });
    }
    return events;
  }

  // ---------------- AI LOGIC ----------------
  _aiLapDecisions(d) {
    const events = [];

    // Pace mode: lightly randomized, biased by aggression and tire health
    if (Math.random() < 0.3) {
      if (d.tireWear > 70) d.paceMode = 'conserve';
      else if (d.aggression > 68 && Math.random() < 0.5) d.paceMode = 'push';
      else d.paceMode = 'normal';
    }

    // Pit decision
    const criticalWear = 80 - (d.aggression - 50) / 10; // aggressive drivers push stints further
    const weatherMismatch = this._compoundMismatch(d.compound, this.weather);
    const wantsPit = d.tireWear >= criticalWear || weatherMismatch > 0.4;

    if (wantsPit && !d._pitThisLap) {
      const newCompound = this._aiPitCompoundChoice(d);
      d._pitThisLap = newCompound;
      d._pitUnderSC = this.safetyCar.active;
      events.push({ type: 'ai_pit', text: `${d.name} dives into the pits for ${COMPOUNDS[newCompound].name} tires.`, driverId: d.id });
    }

    // Overtake attempts between AI cars (flavor only, no UI needed)
    if (Math.random() < d.aggression / 900) {
      const order = this.runningDrivers().sort((a, b) => a.totalTime - b.totalTime);
      const idx = order.findIndex(x => x.id === d.id);
      if (idx > 0) {
        const ahead = order[idx - 1];
        const gap = Math.abs(d.totalTime - ahead.totalTime);
        if (gap < 1.5) {
          const roll = Math.random();
          if (roll < 0.1) {
            d._offTrackPenalty = (d._offTrackPenalty || 0) + rand(5, 9);
            events.push({ type: 'ai_overtake_fail', text: `${d.name} dives up the inside of ${ahead.name} but runs wide!`, driverId: d.id });
          } else if (roll < 0.55) {
            d.totalTime -= rand(0.8, 1.8);
            events.push({ type: 'ai_overtake', text: `${d.name} gets a great run and passes ${ahead.name}!`, driverId: d.id });
          }
        }
      }
    }

    return events;
  }

  _aiPitCompoundChoice(d) {
    if (this.weather === 'heavy') return 'wet';
    if (this.weather === 'light') return Math.random() < 0.6 ? 'intermediate' : 'medium';
    const lapsLeft = this.totalLaps - this.lap;
    if (lapsLeft < 15) return 'soft';
    return Math.random() < 0.5 ? 'medium' : 'hard';
  }

  _compoundMismatch(compoundId, weather) {
    const c = COMPOUNDS[compoundId];
    const isWetTire = compoundId === 'intermediate' || compoundId === 'wet';
    if (weather === 'dry') return isWetTire ? 0.5 : 0;
    if (weather === 'light') return isWetTire ? (compoundId === 'wet' ? 0.2 : 0) : 0.45;
    return isWetTire ? (compoundId === 'intermediate' ? 0.35 : 0) : 0.9; // heavy rain
  }

  // ---------------- LAP TIME MODEL ----------------
  _computeLapTime(d) {
    let pitted = false;
    let wearGain;

    // Handle a pit stop this lap (resets tires, adds time)
    if (d._pitThisLap) {
      const newCompound = d._pitThisLap;
      let pitLoss = this.track.pitLoss + rand(-1.2, 1.5);
      if (d._pitUnderSC) pitLoss *= 0.42;
      if (Math.random() < 0.08) pitLoss += rand(3, 6); // fumbled stop
      d.compound = newCompound;
      d.tireWear = rand(0, 4);
      d._pitStopTimeLoss = pitLoss;
      pitted = true;
      d._pitThisLap = null;
      d._pitUnderSC = null;
    } else {
      d._pitStopTimeLoss = 0;
    }

    const compound = COMPOUNDS[d.compound];

    if (this.safetyCar.active) {
      // Safety-car lap: everyone trundles around at a fixed, slow pace
      const scLap = this.track.baseLapTime * (1.55 + rand(-0.03, 0.03)) + (d._pitStopTimeLoss || 0);
      wearGain = BASE_WEAR_PER_LAP * 0.25 * compound.wearRate; // tires cool down, wear slows a lot
      d.tireWear = clamp(d.tireWear, 0, 100);
      return { lapTime: scLap, wearGain };
    }

    let lapTime = this.track.baseLapTime;

    // Driver raw pace
    lapTime += (100 - d.pace) * 0.045;

    // Compound pace delta
    lapTime += compound.paceDelta;

    // Tire wear penalty (accelerating with wear)
    const wearFrac = d.tireWear / 100;
    lapTime += Math.pow(wearFrac, 1.6) * 7.5 * this.track.tempFactor;

    // Weather / compound grip mismatch
    const grip = this.weather === 'dry' ? compound.dryGrip : (this.weather === 'light' ? (compound.dryGrip + compound.wetGrip) / 2 : compound.wetGrip);
    lapTime += (1 - grip) * this.track.baseLapTime * 0.55;

    // Pace mode
    let wearMult = 1.0;
    if (d.paceMode === 'push') { lapTime -= 0.45; wearMult = 1.3; }
    else if (d.paceMode === 'conserve') { lapTime += 0.4; wearMult = 0.72; }

    // Consistency-driven random variance
    const varianceRange = 0.3 + (100 - d.consistency) / 60;
    lapTime += rand(-varianceRange, varianceRange);

    // Off-track penalty rolled earlier this lap (incidents)
    if (d._offTrackPenalty) {
      lapTime += d._offTrackPenalty;
      d._offTrackPenalty = 0;
    }

    // Pit stop time loss
    lapTime += d._pitStopTimeLoss || 0;

    wearGain = BASE_WEAR_PER_LAP * compound.wearRate * this.track.tempFactor * wearMult * (this.weather !== 'dry' ? 0.75 : 1.0);

    return { lapTime: Math.max(lapTime, this.track.baseLapTime * 0.75), wearGain };
  }

  _applySafetyCarBunching() {
    const running = this.runningDrivers().sort((a, b) => a.totalTime - b.totalTime);
    if (running.length === 0) return;
    const leaderTime = running[0].totalTime;
    running.forEach((d, i) => {
      // Compress gaps toward ~1.0-1.6s increments, but never let anyone move ahead of their real order
      const target = leaderTime + i * rand(1.0, 1.6);
      if (d.totalTime > target) d.totalTime = target;
    });
  }

  _finishOrderValue(d) {
    if (d.status === 'dnf') return 100000 + (this.totalLaps - (d._lastLapCompleted || this.lap)); // DNFs sorted after runners, earlier DNF = worse
    return d.totalTime;
  }

  _updatePositions() {
    const ranked = this.drivers.slice().sort((a, b) => this._finishOrderValue(a) - this._finishOrderValue(b));
    const leaderTime = ranked.find(d => d.status !== 'dnf')?.totalTime || 0;
    ranked.forEach((d, i) => {
      d.position = i + 1;
      if (d.status === 'dnf') {
        d.gapText = 'DNF';
      } else if (i === 0) {
        d.gapText = 'Leader';
      } else {
        const gap = d.totalTime - leaderTime;
        d.gapText = `+${gap.toFixed(1)}s`;
      }
    });
  }

  // ---------------- RESULTS ----------------
  getFinalResults() {
    const ranked = this.drivers.slice().sort((a, b) => this._finishOrderValue(a) - this._finishOrderValue(b));
    return ranked.map((d, i) => ({
      id: d.id, name: d.name, team: d.team, teamColor: d.teamColor,
      position: i + 1, status: d.status, points: d.status === 'dnf' ? 0 : pointsForPosition(i + 1),
      isPlayer: d.id === this.playerId,
    }));
  }
}

if (typeof module !== 'undefined') {
  module.exports = { RaceEngine };
}
