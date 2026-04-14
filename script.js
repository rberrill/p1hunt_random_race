const nameInput = document.getElementById('nameInput');
const lapsInput = document.getElementById('lapsInput');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const statusEl = document.getElementById('status');
const leaderboardEl = document.getElementById('leaderboard');
const winnerEl = document.getElementById('winner');
const lanePath = document.getElementById('lanePath');
const carsLayer = document.getElementById('carsLayer');

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
let raceState = null;
let animationId = null;
let lastTime = null;

function parseNames() {
  return nameInput.value
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function makeCar(name, index) {
  return {
    name,
    lap: 0,
    progress: 0,
    speed: 0.12 + Math.random() * 0.11,
    targetSpeed: 0,
    color: carColors[index % carColors.length],
    element: null
  };
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

function pickTargetSpeeds(cars) {
  for (const car of cars) {
    const variance = 0.075 + Math.random() * 0.11;
    const wave = Math.sin(performance.now() / 1300 + car.name.length) * 0.03;
    car.targetSpeed = Math.max(0.08, variance + wave);
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

  if (Math.random() < 0.07) {
    pickTargetSpeeds(cars);
  }

  for (const car of cars) {
    car.speed += (car.targetSpeed - car.speed) * 0.055;
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
  const names = parseNames();
  const laps = Number(lapsInput.value);

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
