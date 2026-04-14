const nameInput = document.getElementById('nameInput');
const lapsInput = document.getElementById('lapsInput');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const statusEl = document.getElementById('status');
const leaderboardEl = document.getElementById('leaderboard');
const winnerEl = document.getElementById('winner');
const lanePath = document.getElementById('lanePath');
const carsLayer = document.getElementById('carsLayer');
const carCountEl = document.getElementById('carCount');
const lapCountEl = document.getElementById('lapCount');
const racePhaseEl = document.getElementById('racePhase');
const topSpeedEl = document.getElementById('topSpeed');
const avgSpeedEl = document.getElementById('avgSpeed');
const fastestLapEl = document.getElementById('fastestLap');
const trackBiasEl = document.getElementById('trackBias');

const MAX_RACERS = 100;
const TURN_SAMPLE_COUNT = 900;
const CURVATURE_STEP = 3;
const FAST_KMH = 344;
const SLOW_KMH = 142;

const carColors = ['#ff5b5b', '#4ec9ff', '#ffd95b', '#9d7bff', '#53e0a0', '#ff9f43'];

const pathLength = lanePath.getTotalLength();
const turnProfile = buildTurnProfile();
let raceState = null;
let animationId = null;
let lastTime = null;

function parseNames() {
  return nameInput.value
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, MAX_RACERS);
}

function makeCar(name, index) {
  const corneringGrip = 0.095 + Math.random() * 0.03;
  const topStraightSpeed = corneringGrip + 0.095 + Math.random() * 0.04;

  return {
    name,
    lap: 0,
    progress: 0,
    speed: corneringGrip + 0.03,
    targetSpeed: 0,
    corneringGrip,
    topStraightSpeed,
    phase: Math.random() * Math.PI * 2,
    color: carColors[index % carColors.length],
    element: null,
    totalProgress: 0,
    currentKmh: SLOW_KMH,
    lapStart: null,
    fastestLapMs: Infinity
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(radians) {
  let angle = radians;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function buildTurnProfile() {
  const intensities = new Array(TURN_SAMPLE_COUNT).fill(0);

  for (let i = 0; i < TURN_SAMPLE_COUNT; i += 1) {
    const dist = (i / TURN_SAMPLE_COUNT) * pathLength;
    const before = lanePath.getPointAtLength((dist - CURVATURE_STEP + pathLength) % pathLength);
    const current = lanePath.getPointAtLength(dist);
    const after = lanePath.getPointAtLength((dist + CURVATURE_STEP) % pathLength);

    const angle1 = Math.atan2(current.y - before.y, current.x - before.x);
    const angle2 = Math.atan2(after.y - current.y, after.x - current.x);
    const delta = Math.abs(normalizeAngle(angle2 - angle1));
    intensities[i] = clamp(delta / 0.19, 0, 1);
  }

  const window = 6;
  return intensities.map((_, i) => {
    let sum = 0;
    for (let step = -window; step <= window; step += 1) {
      const idx = (i + step + TURN_SAMPLE_COUNT) % TURN_SAMPLE_COUNT;
      sum += intensities[idx];
    }
    return sum / (window * 2 + 1);
  });
}

function getTurnIntensity(progress) {
  const wrapped = ((progress % 1) + 1) % 1;
  const idx = Math.floor(wrapped * TURN_SAMPLE_COUNT) % TURN_SAMPLE_COUNT;
  return turnProfile[idx];
}

function createCarElement(car) {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.classList.add('car');

  const body = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  body.setAttribute('x', '-15');
  body.setAttribute('y', '-5');
  body.setAttribute('width', '30');
  body.setAttribute('height', '10');
  body.setAttribute('rx', '4');
  body.setAttribute('fill', car.color);

  const nose = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  nose.setAttribute('points', '15,-4 24,0 15,4');
  nose.setAttribute('fill', '#e8f0ff');

  const nameText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  nameText.setAttribute('x', '0');
  nameText.setAttribute('y', '-10');
  nameText.textContent = car.name.length > 7 ? `${car.name.slice(0, 7)}…` : car.name;

  group.append(body, nose, nameText);
  carsLayer.append(group);
  car.element = group;
}

function updateCarTransform(car) {
  const distance = (car.progress % 1) * pathLength;
  const point = lanePath.getPointAtLength(distance);
  const ahead = lanePath.getPointAtLength((distance + 1.3) % pathLength);
  const angle = (Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180) / Math.PI;
  car.element.setAttribute('transform', `translate(${point.x} ${point.y}) rotate(${angle})`);
  car.totalProgress = car.lap + car.progress;
}

function sortCars(cars) {
  return [...cars].sort((a, b) => b.totalProgress - a.totalProgress || a.name.localeCompare(b.name));
}

function formatLap(ms) {
  if (!Number.isFinite(ms)) return '--';
  const totalSec = ms / 1000;
  const minutes = Math.floor(totalSec / 60);
  const seconds = (totalSec % 60).toFixed(3).padStart(6, '0');
  return `${minutes}:${seconds}`;
}

function updateDashboard(cars, laps) {
  const sorted = sortCars(cars);
  leaderboardEl.innerHTML = '';

  sorted.forEach((car, idx) => {
    const item = document.createElement('li');
    const progressPct = Math.min(100, ((car.lap + car.progress) / laps) * 100).toFixed(1);
    item.textContent = `${idx + 1}. ${car.name} — Lap ${Math.min(car.lap + 1, laps)}/${laps} (${progressPct}%)`;
    leaderboardEl.append(item);
  });

  if (sorted[0]) {
    statusEl.textContent = `Leader: ${sorted[0].name}`;
  }

  const topKmh = Math.max(...cars.map((car) => car.currentKmh));
  const avgKmh = cars.reduce((sum, car) => sum + car.currentKmh, 0) / cars.length;
  const fastestLapMs = Math.min(...cars.map((car) => car.fastestLapMs));

  topSpeedEl.textContent = `${Math.round(topKmh)} km/h`;
  avgSpeedEl.textContent = `${Math.round(avgKmh)} km/h`;
  fastestLapEl.textContent = formatLap(fastestLapMs);

  const cornerSamples = turnProfile.filter((v) => v > 0.52).length;
  const straightSamples = turnProfile.filter((v) => v < 0.22).length;
  trackBiasEl.textContent =
    straightSamples > cornerSamples ? 'Straight heavy' : cornerSamples > straightSamples ? 'Corner heavy' : 'Balanced';
}

function resetRace(clearNames = false) {
  cancelAnimationFrame(animationId);
  animationId = null;
  raceState = null;
  lastTime = null;
  carsLayer.innerHTML = '';
  leaderboardEl.innerHTML = '';
  winnerEl.textContent = '';

  statusEl.textContent = 'Add at least 2 drivers to begin.';
  carCountEl.textContent = '0';
  lapCountEl.textContent = '0';
  racePhaseEl.textContent = 'Ready';
  topSpeedEl.textContent = '0 km/h';
  avgSpeedEl.textContent = '0 km/h';
  fastestLapEl.textContent = '--';
  trackBiasEl.textContent = 'Balanced';

  startBtn.disabled = false;
  if (clearNames) nameInput.value = '';
}

function animate(timestamp) {
  if (!raceState) return;
  if (!lastTime) lastTime = timestamp;

  const delta = Math.min(0.05, (timestamp - lastTime) / 1000);
  lastTime = timestamp;

  const { cars, laps } = raceState;

  for (const car of cars) {
    const turnIntensity = getTurnIntensity(car.progress);
    const straightPower = 1 - turnIntensity;
    const pulse = Math.sin(timestamp / 450 + car.phase) * 0.007;
    const desiredSpeed = car.corneringGrip + (car.topStraightSpeed - car.corneringGrip) * straightPower + pulse;

    car.targetSpeed = clamp(desiredSpeed, car.corneringGrip * 0.9, car.topStraightSpeed * 1.05);
    const response = car.speed > car.targetSpeed ? 0.16 : 0.055;
    car.speed += (car.targetSpeed - car.speed) * response;
    car.progress += car.speed * delta;

    car.currentKmh = SLOW_KMH + ((car.speed - car.corneringGrip) / (car.topStraightSpeed - car.corneringGrip)) * (FAST_KMH - SLOW_KMH);
    car.currentKmh = clamp(car.currentKmh, SLOW_KMH, FAST_KMH);

    if (car.lapStart === null) car.lapStart = timestamp;

    while (car.progress >= 1) {
      car.progress -= 1;
      car.lap += 1;
      if (car.lapStart !== null) {
        const lapTime = timestamp - car.lapStart;
        car.fastestLapMs = Math.min(car.fastestLapMs, lapTime);
      }
      car.lapStart = timestamp;
    }

    updateCarTransform(car);
  }

  updateDashboard(cars, laps);

  const finished = cars.filter((car) => car.lap >= laps);
  if (finished.length > 0) {
    const winner = sortCars(finished)[0];
    winnerEl.textContent = `🏁 Winner: ${winner.name}!`;
    statusEl.textContent = 'Race finished!';
    racePhaseEl.textContent = 'Finished';
    startBtn.disabled = false;
    raceState = null;
    return;
  }

  animationId = requestAnimationFrame(animate);
}

function startRace() {
  const enteredNames = nameInput.value
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);

  const names = parseNames();
  const laps = Number(lapsInput.value);

  if (enteredNames.length > MAX_RACERS) {
    statusEl.textContent = `Only the first ${MAX_RACERS} drivers will be used.`;
  }

  if (names.length < 2) {
    statusEl.textContent = 'Please enter at least 2 drivers.';
    return;
  }

  if (!Number.isFinite(laps) || laps < 1 || laps > 60) {
    statusEl.textContent = 'Laps must be between 1 and 60.';
    return;
  }

  resetRace(false);

  const cars = names.map(makeCar);
  cars.forEach((car) => {
    createCarElement(car);
    car.targetSpeed = car.speed;
    updateCarTransform(car);
  });

  raceState = { cars, laps };
  startBtn.disabled = true;
  racePhaseEl.textContent = 'Racing';
  carCountEl.textContent = String(cars.length);
  lapCountEl.textContent = String(laps);
  winnerEl.textContent = '';
  statusEl.textContent = 'Race in progress...';
  animationId = requestAnimationFrame(animate);
}

startBtn.addEventListener('click', startRace);
resetBtn.addEventListener('click', () => resetRace(true));

nameInput.value = ['Alex', 'Jordan', 'Casey', 'Taylor', 'Riley', 'Morgan'].join('\n');
