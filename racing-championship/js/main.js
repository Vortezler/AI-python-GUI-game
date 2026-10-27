/* ============================================================
   MAIN.JS — UI controller: screens, race loop, rendering
   ============================================================ */

const PLAYER_ID = 'charles';
const WEATHER_LABEL = { dry: 'Dry', light: 'Light Rain', heavy: 'Heavy Rain' };
const WEATHER_ICON = { dry: '☀️', light: '🌦️', heavy: '⛈️' };
const SPEED_DELAYS = { slow: 1500, normal: 800, fast: 300 };

const state = {
  roundIndex: 0,          // 0..4 -> TRACKS
  championship: {},       // driverId -> points
  engine: null,
  isPlaying: false,
  isAdvancing: false,
  speed: 'normal',
  raceHistory: [],        // per-race final results, for the championship screen
};

function $(sel) { return document.querySelector(sel); }
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function initChampionship() {
  DRIVERS.forEach(d => { state.championship[d.id] = 0; });
}

function standingsArray() {
  return DRIVERS
    .map(d => ({ id: d.id, name: d.name, team: d.team, teamColor: d.teamColor, points: state.championship[d.id] }))
    .sort((a, b) => b.points - a.points);
}

/* ---------------- SCREEN SWITCHING ---------------- */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

/* ---------------- START SCREEN ---------------- */
function renderStart() {
  $('#start-story').textContent = STORY.prologue;
  showScreen('#screen-start');
}

/* ---------------- BRIEFING SCREEN ---------------- */
function renderBriefing() {
  const track = TRACKS[state.roundIndex];
  $('#briefing-round').textContent = `Round ${track.raceNumber} of 5`;
  $('#briefing-track-name').textContent = `${track.name} — ${track.country}`;
  $('#briefing-story').textContent = STORY.raceIntros[track.id];
  $('#briefing-climate').textContent = track.climate;
  $('#briefing-forecast').textContent = track.forecastText;
  $('#briefing-laps').textContent = `${track.laps} laps`;

  // Championship context (skip before round 1)
  const standBox = $('#briefing-standings');
  standBox.innerHTML = '';
  if (state.roundIndex > 0) {
    const standings = standingsArray();
    standBox.appendChild(el('h4', null, 'Championship Standings'));
    standBox.appendChild(buildStandingsTable(standings, 'points'));
  }

  // Tire choice buttons
  const tireBox = $('#briefing-tire-choice');
  tireBox.innerHTML = '';
  ['soft', 'medium', 'hard', 'intermediate', 'wet'].forEach(key => {
    const c = COMPOUNDS[key];
    const btn = el('button', 'tire-btn');
    btn.style.setProperty('--tire-color', c.color);
    btn.innerHTML = `<span class="tire-chip" style="background:${c.color}">${c.short}</span><span>${c.name}</span>`;
    btn.onclick = () => startRace(key);
    tireBox.appendChild(btn);
  });

  showScreen('#screen-briefing');
}

function buildStandingsTable(standings, valueKey) {
  const table = el('table', 'standings-table');
  const thead = el('thead', null, '<tr><th>#</th><th>Driver</th><th>Team</th><th>Pts</th></tr>');
  table.appendChild(thead);
  const tbody = el('tbody');
  standings.forEach((s, i) => {
    const row = el('tr', s.id === PLAYER_ID ? 'is-player' : '');
    row.innerHTML = `<td>${i + 1}</td><td><span class="dot" style="background:${s.teamColor}"></span>${s.name}</td><td>${s.team}</td><td>${s[valueKey]}</td>`;
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  return table;
}

/* ---------------- RACE SCREEN ---------------- */
function startRace(playerCompound) {
  const track = TRACKS[state.roundIndex];
  state.engine = new RaceEngine(track, DRIVERS, PLAYER_ID, state.championship);
  state.engine.setStartingCompound(playerCompound);

  $('#race-track-name').textContent = `${track.name}`;
  $('#race-total-laps').textContent = track.laps;
  $('#race-log').innerHTML = '';
  $('#sc-banner').classList.add('hidden');
  renderRaceHUD(1, 'dry', { active: false });
  renderStandingsPanel(initialStandingsSnapshot());

  showScreen('#screen-race');
  state.isPlaying = true;
  $('#btn-play-pause').textContent = '⏸ Pause';
  raceLoop();
}

function initialStandingsSnapshot() {
  return state.engine.drivers.map((d, i) => ({
    id: d.id, name: d.name, team: d.team, teamColor: d.teamColor,
    position: i + 1, gap: i === 0 ? 'Leader' : '—', compound: d.compound,
    tireWear: 0, status: 'running', isPlayer: d.id === PLAYER_ID,
  }));
}

async function raceLoop() {
  while (state.isPlaying && state.engine && !state.engine.finished) {
    await advanceOneLap();
    if (!state.engine || state.engine.finished) break;
    await delay(SPEED_DELAYS[state.speed]);
  }
}

async function advanceOneLap() {
  if (state.isAdvancing || !state.engine || state.engine.finished) return;
  state.isAdvancing = true;
  try {
    const prep = state.engine.prepareLap();
    logEvents(prep.events);
    renderRaceHUD(prep.lap, prep.weather, prep.safetyCar);

    if (prep.decision) {
      const wasPlaying = state.isPlaying;
      state.isPlaying = false;
      $('#btn-play-pause').textContent = '▶ Resume';
      const chosen = await showDecisionModal(prep.decision, state.engine.getPlayer());
      state.engine.resolvePlayerDecision(chosen);
      if (wasPlaying) {
        state.isPlaying = true;
        $('#btn-play-pause').textContent = '⏸ Pause';
      }
    }

    const result = state.engine.computeLap();
    logEvents(result.events.filter(e => !prep.events.includes(e)));
    renderRaceHUD(result.lap, result.weather, result.safetyCar);
    renderStandingsPanel(result.standings);
    renderPlayerStatus(result);

    if (result.finished) {
      state.isPlaying = false;
      await delay(900);
      finishRace();
    }
  } finally {
    state.isAdvancing = false;
  }
}

function renderRaceHUD(lap, weather, safetyCar) {
  $('#race-lap-counter').textContent = `Lap ${lap} / ${state.engine.totalLaps}`;
  $('#race-weather').textContent = `${WEATHER_ICON[weather]} ${WEATHER_LABEL[weather]}`;
  const banner = $('#sc-banner');
  if (safetyCar.active) {
    banner.classList.remove('hidden');
    banner.textContent = `🚨 SAFETY CAR — ${safetyCar.lapsRemaining} lap${safetyCar.lapsRemaining === 1 ? '' : 's'} remaining`;
  } else {
    banner.classList.add('hidden');
  }
}

function renderPlayerStatus(result) {
  const p = result.player;
  $('#player-position').textContent = p.status === 'dnf' ? 'DNF' : `P${p.position}`;
  $('#player-compound').innerHTML = `<span class="tire-chip" style="background:${COMPOUNDS[p.compound].color}">${COMPOUNDS[p.compound].short}</span> ${COMPOUNDS[p.compound].name}`;
  $('#player-wear').style.width = `${p.tireWear}%`;
  $('#player-wear').className = 'wear-fill ' + (p.tireWear > 80 ? 'wear-critical' : p.tireWear > 55 ? 'wear-warn' : 'wear-ok');
  $('#player-wear-label').textContent = `${p.tireWear}%`;
  $('#player-gap').textContent = p.gap || '';
}

function renderStandingsPanel(standings) {
  const box = $('#race-standings');
  box.innerHTML = '';
  const table = el('table', 'standings-table compact');
  const tbody = el('tbody');
  standings.forEach(s => {
    const row = el('tr', s.isPlayer ? 'is-player' : (s.status === 'dnf' ? 'is-dnf' : ''));
    row.innerHTML = `<td>${s.position}</td><td><span class="dot" style="background:${s.teamColor}"></span>${s.name}</td>
      <td><span class="tire-chip small" style="background:${COMPOUNDS[s.compound].color}">${COMPOUNDS[s.compound].short}</span></td>
      <td>${s.status === 'dnf' ? 'DNF' : s.gap}</td>`;
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  box.appendChild(table);
}

function logEvents(events) {
  if (!events || !events.length) return;
  const logBox = $('#race-log');
  events.forEach(evt => {
    const line = el('div', `log-line log-${evt.type}`, evt.text);
    logBox.appendChild(line);
  });
  logBox.scrollTop = logBox.scrollHeight;
}

/* ---------------- DECISION MODAL ---------------- */
function showDecisionModal(decision, player) {
  return new Promise(resolve => {
    const overlay = $('#decision-overlay');
    $('#decision-title').textContent = decision.title;
    $('#decision-prompt').textContent = decision.prompt;
    const optsBox = $('#decision-options');
    optsBox.innerHTML = '';
    decision.options.forEach(opt => {
      const btn = el('button', 'decision-btn');
      btn.innerHTML = `<strong>${opt.label}</strong>${opt.detail ? `<span>${opt.detail}</span>` : ''}`;
      btn.onclick = () => {
        overlay.classList.add('hidden');
        resolve(opt);
      };
      optsBox.appendChild(btn);
    });
    overlay.classList.remove('hidden');
  });
}

/* ---------------- CONTROLS ---------------- */
function wireRaceControls() {
  $('#btn-play-pause').onclick = () => {
    state.isPlaying = !state.isPlaying;
    $('#btn-play-pause').textContent = state.isPlaying ? '⏸ Pause' : '▶ Resume';
    if (state.isPlaying) raceLoop();
  };
  $('#btn-step').onclick = () => { state.isPlaying = false; $('#btn-play-pause').textContent = '▶ Resume'; advanceOneLap(); };
  $('#speed-select').onchange = (e) => { state.speed = e.target.value; };
}

/* ---------------- RESULTS SCREEN ---------------- */
function finishRace() {
  const track = TRACKS[state.roundIndex];
  const results = state.engine.getFinalResults();
  state.raceHistory.push({ track: track.name, results });

  results.forEach(r => { state.championship[r.id] += r.points; });

  $('#results-track-name').textContent = track.name;
  const playerResult = results.find(r => r.isPlayer);
  const storyLine = playerResult.status === 'dnf' ? STORY.dnfLine(track.name) : STORY.resultLine(playerResult.position, track.name);
  $('#results-story').textContent = storyLine;

  const resultsTable = $('#results-table');
  resultsTable.innerHTML = '';
  const table = el('table', 'standings-table');
  table.appendChild(el('thead', null, '<tr><th>Pos</th><th>Driver</th><th>Team</th><th>Pts</th></tr>'));
  const tbody = el('tbody');
  results.forEach(r => {
    const row = el('tr', r.isPlayer ? 'is-player' : '');
    row.innerHTML = `<td>${r.status === 'dnf' ? 'DNF' : r.position}</td><td><span class="dot" style="background:${r.teamColor}"></span>${r.name}</td><td>${r.team}</td><td>+${r.points}</td>`;
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  resultsTable.appendChild(table);

  const standings = standingsArray();
  const champBox = $('#results-championship');
  champBox.innerHTML = '';
  champBox.appendChild(el('h4', null, 'Championship Standings'));
  champBox.appendChild(buildStandingsTable(standings, 'points'));

  const isFinalRound = state.roundIndex === TRACKS.length - 1;
  $('#results-blurb').textContent = STORY.standingsBlurb(standings, PLAYER_ID, state.roundIndex + 1, TRACKS.length);
  $('#btn-continue').textContent = isFinalRound ? 'See Final Championship' : 'Continue to Next Race';
  $('#btn-continue').onclick = () => {
    if (isFinalRound) {
      renderChampionshipScreen();
    } else {
      state.roundIndex += 1;
      renderBriefing();
    }
  };

  showScreen('#screen-results');
}

/* ---------------- FINAL CHAMPIONSHIP SCREEN ---------------- */
function renderChampionshipScreen() {
  const standings = standingsArray();
  $('#champ-title').textContent = standings[0].id === PLAYER_ID ? '🏆 World Champion!' : 'Season Complete';
  $('#champ-blurb').textContent = STORY.standingsBlurb(standings, PLAYER_ID, TRACKS.length, TRACKS.length);
  const box = $('#champ-standings');
  box.innerHTML = '';
  box.appendChild(buildStandingsTable(standings, 'points'));
  showScreen('#screen-championship');
}

/* ---------------- INIT ---------------- */
function newCareer() {
  state.roundIndex = 0;
  state.championship = {};
  state.raceHistory = [];
  initChampionship();
  renderBriefing();
}

window.addEventListener('DOMContentLoaded', () => {
  initChampionship();
  renderStart();
  wireRaceControls();
  $('#btn-start-career').onclick = () => renderBriefing();
  $('#btn-play-again').onclick = () => newCareer();
});
