const nameInput = document.getElementById('nameInput');
const lapsInput = document.getElementById('lapsInput');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const statusEl = document.getElementById('status');
const leaderboardEl = document.getElementById('leaderboard');
const winnerEl = document.getElementById('winner');
const lanePath = document.getElementById('lanePath');
const carsLayer = document.getElementById('carsLayer');
const raceStateChip = document.getElementById('raceStateChip');
const leaderChip = document.getElementById('leaderChip');
const speedChip = document.getElementById('speedChip');

const MAX_RACERS = 100;
const TURN_SAMPLE_COUNT = 900;
const CURVATURE_STEP = 3;

const carColors = ['#00d1ff', '#ff5c5c', '#ffd166', '#9b5de5', '#06d6a0', '#f15bb5', '#4cc9f0', '#ff924c'];

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
    intensities[i] = clamp(delta / 0.2, 0, 1);
  }

  return intensities.map((_, i) => {
    let sum = 0;
    const window = 6;
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

function makeCar(name, index) {
  const corneringGrip = 0.11 + Math.random() * 0.04;
  const topStraightSpeed = corneringGrip + 0.15 + Math.random() * 0.07;
  return {
    name,
    lap: 0,
    progress: 0,
    speed: corneringGrip + 0.01,
    targetSpeed: 0,
    corneringGrip,
    topStraightSpeed,
    phase: Math.random() * Math.PI * 2,
    color: carColors[index % carColors.length],
    element: null,
    totalProgress: 0,
    lastTurnIntensity: 0
  };
}

function createCarElement(car) {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.classList.add('car');

  const body = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  body.setAttribute('x', '-18');
  body.setAttribute('y', '-6');
  body.setAttribute('width', '36');
  body.setAttribute('height', '12');
  body.setAttribute('rx', '3');
  body.setAttribute('fill', car.color);

  const halo = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  halo.setAttribute('x', '-6');
  halo.setAttribute('y', '-3');
  halo.setAttribute('width', '12');
  halo.setAttribute('height', '6');
  halo.setAttribute('fill', '#111827');

  const nose = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  nose.setAttribute('points', '18,-4 26,0 18,4');
  nose.setAttribute('fill', '#f1f5f9');

  const nameText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  nameText.setAttribute('x', '0');
  nameText.setAttribute('y', '-11');
  nameText.textContent = car.name.length > 8 ? `${car.name.slice(0, 8)}…` : car.name;

  group.append(body, halo, nose, nameText);
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

function speedToKmh(simSpeed) {
  return Math.round(simSpeed * 980);
}

function getSectorLabel(turnIntensity) {
  if (turnIntensity > 0.58) return 'Heavy Corner';
  if (turnIntensity > 0.3) return 'Medium Corner';
  return 'Straight';
}

function renderLeaderboard(cars, laps) {
  const sorted = sortCars(cars);
  leaderboardEl.innerHTML = '';

  sorted.forEach((car, index) => {
    const item = document.createElement('li');
    const pct = Math.min(100, ((car.progress + car.lap) / laps) * 100).toFixed(1);
    item.textContent = `P${index + 1} ${car.name} — Lap ${Math.min(car.lap + 1, laps)}/${laps} (${pct}%)`;
    leaderboardEl.append(item);
  });

  const leader = sorted[0];
  if (leader) {
    const sector = getSectorLabel(leader.lastTurnIntensity);
    leaderChip.textContent = `${leader.name} (${sector})`;
    speedChip.textContent = `${speedToKmh(leader.speed)} km/h`;
    statusEl.textContent = `Leader is pushing through: ${sector}`;
  }
}

function resetRace(clearNames = false) {
  cancelAnimationFrame(animationId);
  animationId = null;
  raceState = null;
  lastTime = null;
  carsLayer.innerHTML = '';
  leaderboardEl.innerHTML = '';
  statusEl.textContent = 'Add at least 2 drivers to begin.';
  winnerEl.textContent = '';
  raceStateChip.textContent = 'Idle';
  leaderChip.textContent = '—';
  speedChip.textContent = '0 km/h';
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
    car.lastTurnIntensity = turnIntensity;
    const straightPortion = 1 - turnIntensity;
    const pulse = Math.sin(timestamp / 520 + car.phase) * 0.006;

    const desiredSpeed =
      car.corneringGrip + (car.topStraightSpeed - car.corneringGrip) * straightPortion + pulse;

    car.targetSpeed = clamp(desiredSpeed, car.corneringGrip * 0.92, car.topStraightSpeed * 1.03);
    const response = car.speed > car.targetSpeed ? 0.16 : 0.048;
    car.speed += (car.targetSpeed - car.speed) * response;
    car.progress += car.speed * delta;

    while (car.progress >= 1) {
      car.progress -= 1;
      car.lap += 1;
    }

    updateCarTransform(car);
  }

  renderLeaderboard(cars, laps);

  const finished = cars.filter((car) => car.lap >= laps);
  if (finished.length > 0) {
    const winner = sortCars(finished)[0];
    winnerEl.textContent = `🏁 Winner: ${winner.name}!`;
    statusEl.textContent = 'Race complete.';
    raceStateChip.textContent = 'Finished';
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
    statusEl.textContent = 'Please enter at least 2 driver names.';
    return;
  }

  if (!Number.isFinite(laps) || laps < 1 || laps > 80) {
    statusEl.textContent = 'Laps must be between 1 and 80.';
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
  raceStateChip.textContent = 'Racing';
  winnerEl.textContent = '';
  statusEl.textContent = 'Race in progress...';
  startBtn.disabled = true;
  animationId = requestAnimationFrame(animate);
}

startBtn.addEventListener('click', startRace);
resetBtn.addEventListener('click', () => resetRace(true));

nameInput.value = ['Alex', 'Jordan', 'Casey', 'Taylor', 'Riley', 'Morgan'].join('\n');
