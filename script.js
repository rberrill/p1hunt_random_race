const nameInput = document.getElementById('nameInput');
const lapsInput = document.getElementById('lapsInput');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const statusEl = document.getElementById('status');
const leaderboardEl = document.getElementById('leaderboard');
const winnerEl = document.getElementById('winner');
const lanePath = document.getElementById('lanePath');
const carsLayer = document.getElementById('carsLayer');
const MAX_RACERS = 100;
const TURN_SAMPLE_COUNT = 720;
const CURVATURE_STEP = 3;

const carColors = [
  '#ff4b2b',
  '#00c2ff',
  '#ffd400',
  '#af52de',
  '#3ddc84',
  '#ff8f00',
  '#f72585',
  '#7ae582',
  '#4cc9f0',
  '#f94144'
];

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
  const corneringGrip = 0.1 + Math.random() * 0.04;
  const topStraightSpeed = corneringGrip + 0.08 + Math.random() * 0.05;
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
    element: null
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(radians) {
  let angle = radians;
  while (angle > Math.PI) {
    angle -= Math.PI * 2;
  }
  while (angle < -Math.PI) {
    angle += Math.PI * 2;
  }
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
    intensities[i] = clamp(delta / 0.22, 0, 1);
  }

  const smoothed = intensities.map((_, i) => {
    let sum = 0;
    const window = 5;
    for (let step = -window; step <= window; step += 1) {
      const idx = (i + step + TURN_SAMPLE_COUNT) % TURN_SAMPLE_COUNT;
      sum += intensities[idx];
    }
    return sum / (window * 2 + 1);
  });

  return smoothed;
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
  body.setAttribute('x', '-16');
  body.setAttribute('y', '-6');
  body.setAttribute('width', '32');
  body.setAttribute('height', '12');
  body.setAttribute('rx', '4');
  body.setAttribute('fill', car.color);

  const nose = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  nose.setAttribute('points', '16,-5 25,0 16,5');
  nose.setAttribute('fill', '#ecf2ff');

  const nameText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  nameText.setAttribute('x', '0');
  nameText.setAttribute('y', '-11');
  nameText.textContent = car.name.length > 8 ? `${car.name.slice(0, 8)}…` : car.name;

  group.append(body, nose, nameText);
  carsLayer.append(group);
  car.element = group;
}

function updateCarTransform(car) {
  const totalProgress = car.lap + car.progress;
  const distance = (car.progress % 1) * pathLength;
  const point = lanePath.getPointAtLength(distance);
  const ahead = lanePath.getPointAtLength((distance + 1.2) % pathLength);
  const angle = (Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180) / Math.PI;
  car.element.setAttribute('transform', `translate(${point.x} ${point.y}) rotate(${angle})`);
  car.totalProgress = totalProgress;
}

function sortCars(cars) {
  return [...cars].sort((a, b) => b.totalProgress - a.totalProgress || a.name.localeCompare(b.name));
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
    statusEl.textContent = `Leader: ${sorted[0].name}`;
  }
}

function resetRace(clearNames = false) {
  cancelAnimationFrame(animationId);
  animationId = null;
  raceState = null;
  lastTime = null;
  carsLayer.innerHTML = '';
  leaderboardEl.innerHTML = '';
  statusEl.textContent = 'Add at least 2 racers to begin.';
  winnerEl.textContent = '';
  startBtn.disabled = false;
  if (clearNames) {
    nameInput.value = '';
  }
}

function animate(timestamp) {
  if (!raceState) {
    return;
  }

  if (!lastTime) {
    lastTime = timestamp;
  }

  const delta = Math.min(0.05, (timestamp - lastTime) / 1000);
  lastTime = timestamp;

  const { cars, laps } = raceState;

  for (const car of cars) {
    const turnIntensity = getTurnIntensity(car.progress);
    const straightPortion = 1 - turnIntensity;
    const pulse = Math.sin(timestamp / 500 + car.phase) * 0.006;
    const desiredSpeed =
      car.corneringGrip + (car.topStraightSpeed - car.corneringGrip) * straightPortion + pulse;

    car.targetSpeed = clamp(desiredSpeed, car.corneringGrip * 0.92, car.topStraightSpeed * 1.04);
    const response = car.speed > car.targetSpeed ? 0.14 : 0.045;
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
    statusEl.textContent = 'Race finished!';
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
    statusEl.textContent = `Only the first ${MAX_RACERS} racers will be used.`;
  }

  if (names.length < 2) {
    statusEl.textContent = 'Please enter at least 2 racer names.';
    return;
  }

  if (!Number.isFinite(laps) || laps < 1 || laps > 50) {
    statusEl.textContent = 'Laps must be between 1 and 50.';
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
  winnerEl.textContent = '';
  statusEl.textContent = 'Race in progress...';
  animationId = requestAnimationFrame(animate);
}

startBtn.addEventListener('click', startRace);
resetBtn.addEventListener('click', () => resetRace(true));

nameInput.value = ['Alex', 'Jordan', 'Casey', 'Taylor'].join('\n');
