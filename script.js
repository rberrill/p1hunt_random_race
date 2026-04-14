const nameInput = document.getElementById('nameInput');
const lapsInput = document.getElementById('lapsInput');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const statusEl = document.getElementById('status');
const trackProfileEl = document.getElementById('trackProfile');
const leaderNameEl = document.getElementById('leaderName');
const leaderboardEl = document.getElementById('leaderboard');
const winnerEl = document.getElementById('winner');
const lanePath = document.getElementById('lanePath');
const carsLayer = document.getElementById('carsLayer');

const MAX_DRIVERS = 100;
const TURN_SAMPLE_COUNT = 900;
const CURVATURE_STEP = 4;

const carColors = ['#ff5630', '#36c7ff', '#ffd53d', '#7be495', '#d57bff', '#f9844a', '#4cc9f0', '#ef476f'];

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
    .slice(0, MAX_DRIVERS);
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

  return intensities.map((_, i) => {
    let sum = 0;
    const window = 7;
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
  const cornerSpeed = 0.082 + Math.random() * 0.018;
  const straightSpeed = cornerSpeed + 0.09 + Math.random() * 0.04;
  return {
    name,
    lap: 0,
    progress: 0,
    speed: cornerSpeed + 0.01,
    targetSpeed: 0,
    cornerSpeed,
    straightSpeed,
    color: carColors[index % carColors.length],
    phase: Math.random() * Math.PI * 2,
    element: null,
    totalProgress: 0
  };
}

function createCarElement(car, index) {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.classList.add('car');

  const body = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  body.setAttribute('x', '-16');
  body.setAttribute('y', '-6');
  body.setAttribute('width', '32');
  body.setAttribute('height', '12');
  body.setAttribute('rx', '4');
  body.setAttribute('fill', car.color);

  const cockpit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  cockpit.setAttribute('x', '-6');
  cockpit.setAttribute('y', '-4');
  cockpit.setAttribute('width', '12');
  cockpit.setAttribute('height', '8');
  cockpit.setAttribute('rx', '3');
  cockpit.setAttribute('fill', '#101318');

  const nose = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  nose.setAttribute('points', '16,-4.5 24,0 16,4.5');
  nose.setAttribute('fill', '#eef3ff');

  if (index < 18) {
    const nameText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    nameText.setAttribute('x', '0');
    nameText.setAttribute('y', '-10');
    nameText.textContent = car.name.length > 7 ? `${car.name.slice(0, 7)}…` : car.name;
    group.append(nameText);
  }

  group.append(body, cockpit, nose);
  carsLayer.append(group);
  car.element = group;
}

function updateCarTransform(car) {
  const distance = (car.progress % 1) * pathLength;
  const point = lanePath.getPointAtLength(distance);
  const ahead = lanePath.getPointAtLength((distance + 1.4) % pathLength);
  const angle = (Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180) / Math.PI;
  car.element.setAttribute('transform', `translate(${point.x} ${point.y}) rotate(${angle})`);
  car.totalProgress = car.lap + car.progress;
}

function sortCars(cars) {
  return [...cars].sort((a, b) => b.totalProgress - a.totalProgress || a.name.localeCompare(b.name));
}

function describeTrackAtLeader(cars) {
  if (!cars.length) return 'Waiting';
  const leader = sortCars(cars)[0];
  const intensity = getTurnIntensity(leader.progress);
  if (intensity > 0.6) return 'Heavy corner zone';
  if (intensity > 0.32) return 'Flowing corners';
  return 'Long straight push';
}

function renderLeaderboard(cars, laps) {
  const sorted = sortCars(cars);
  leaderboardEl.innerHTML = '';

  sorted.forEach((car) => {
    const item = document.createElement('li');
    const pct = Math.min(100, ((car.progress + car.lap) / laps) * 100).toFixed(1);
    item.textContent = `${car.name} — Lap ${Math.min(car.lap + 1, laps)}/${laps} (${pct}%)`;
    leaderboardEl.append(item);
  });

  if (sorted[0]) {
    leaderNameEl.textContent = sorted[0].name;
  }

  trackProfileEl.textContent = describeTrackAtLeader(cars);
}

function resetRace(clearNames = false) {
  cancelAnimationFrame(animationId);
  animationId = null;
  raceState = null;
  lastTime = null;
  carsLayer.innerHTML = '';
  leaderboardEl.innerHTML = '';
  winnerEl.textContent = '';
  leaderNameEl.textContent = '—';
  trackProfileEl.textContent = 'Waiting';
  statusEl.textContent = 'Add at least 2 drivers to begin.';
  startBtn.disabled = false;
  if (clearNames) {
    nameInput.value = '';
  }
}

function animate(timestamp) {
  if (!raceState) return;
  if (!lastTime) lastTime = timestamp;

  const delta = Math.min(0.05, (timestamp - lastTime) / 1000);
  lastTime = timestamp;

  const { cars, laps } = raceState;

  for (const car of cars) {
    const turnIntensity = getTurnIntensity(car.progress);
    const straightFactor = 1 - turnIntensity;
    const pulse = Math.sin(timestamp / 620 + car.phase) * 0.005;
    const desiredSpeed = car.cornerSpeed + (car.straightSpeed - car.cornerSpeed) * straightFactor + pulse;

    car.targetSpeed = clamp(desiredSpeed, car.cornerSpeed * 0.88, car.straightSpeed * 1.05);
    const response = car.speed > car.targetSpeed ? 0.2 : 0.06;
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
    winnerEl.textContent = `🏁 ${winner.name}`;
    statusEl.textContent = 'Race complete';
    trackProfileEl.textContent = 'Session finished';
    raceState = null;
    startBtn.disabled = false;
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

  if (enteredNames.length > MAX_DRIVERS) {
    statusEl.textContent = `Only the first ${MAX_DRIVERS} drivers will be used.`;
  }

  if (names.length < 2) {
    statusEl.textContent = 'Please enter at least 2 driver names.';
    return;
  }

  if (!Number.isFinite(laps) || laps < 1 || laps > 50) {
    statusEl.textContent = 'Laps must be between 1 and 50.';
    return;
  }

  resetRace(false);

  const cars = names.map(makeCar);
  cars.forEach((car, index) => {
    createCarElement(car, index);
    car.targetSpeed = car.speed;
    updateCarTransform(car);
  });

  raceState = { cars, laps };
  statusEl.textContent = 'Race in progress';
  winnerEl.textContent = '';
  startBtn.disabled = true;
  animationId = requestAnimationFrame(animate);
}

startBtn.addEventListener('click', startRace);
resetBtn.addEventListener('click', () => resetRace(true));

nameInput.value = ['Alex', 'Jordan', 'Casey', 'Taylor', 'Morgan', 'Riley'].join('\n');
