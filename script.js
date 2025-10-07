import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070b);

const camera = new THREE.PerspectiveCamera(55, 2, 0.1, 1000);
camera.position.set(20, 18, 20);

const controls = new OrbitControls(camera, canvas);
controls.enablePan = false;
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.9;
controls.minDistance = 12;
controls.maxDistance = 42;
controls.target.set(0, 0, 0);

const ambientLight = new THREE.AmbientLight(0x6c7bb0, 0.35);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0x9bc9ff, 0.8);
keyLight.position.set(12, 18, 8);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffb680, 0.4);
fillLight.position.set(-10, 8, -6);
scene.add(fillLight);

const boardSize = 12;
const cellSize = 1;
const offset = (boardSize - 1) / 2;
const baseStep = 320;

const frameGroup = new THREE.LineSegments(
  new THREE.BoxLineGeometry(
    boardSize * cellSize,
    boardSize * cellSize,
    boardSize * cellSize,
    boardSize,
    boardSize,
    boardSize
  ),
  new THREE.LineBasicMaterial({ color: 0x1e2a60, transparent: true, opacity: 0.45 })
);
scene.add(frameGroup);

const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(boardSize * cellSize, boardSize * cellSize, boardSize, boardSize),
  new THREE.MeshStandardMaterial({
    color: 0x0b1023,
    transparent: true,
    opacity: 0.55,
    metalness: 0.1,
    roughness: 0.9,
    side: THREE.DoubleSide,
  })
);
plane.rotateX(-Math.PI / 2);
plane.position.y = -offset * cellSize - cellSize * 0.5;
scene.add(plane);

const segmentGeometry = new THREE.BoxGeometry(cellSize * 0.82, cellSize * 0.82, cellSize * 0.82);
const headMaterial = new THREE.MeshStandardMaterial({
  color: 0x6ef4ff,
  emissive: 0x194e9f,
  metalness: 0.35,
  roughness: 0.25,
});
const bodyMaterial = new THREE.MeshStandardMaterial({
  color: 0x73ff8a,
  emissive: 0x0f552d,
  metalness: 0.25,
  roughness: 0.4,
});

const foodGeometry = new THREE.OctahedronGeometry(cellSize * 0.55);
const foodMaterial = new THREE.MeshStandardMaterial({
  color: 0xff6978,
  emissive: 0xa2343f,
  roughness: 0.35,
  metalness: 0.3,
});
const foodMesh = new THREE.Mesh(foodGeometry, foodMaterial);
scene.add(foodMesh);

const scoreEl = document.getElementById("score");
const lengthEl = document.getElementById("length");
const speedEl = document.getElementById("speed");
const messageEl = document.getElementById("message");

let snake = [];
let snakeMeshes = [];
let directionQueue = [];
let currentDirection = { x: 1, y: 0, z: 0 };
let food = null;
let isPaused = true;
let isGameOver = false;
let stepInterval = baseStep;
let accumulator = 0;
let previousTimestamp = 0;
let score = 0;

function resizeRendererToDisplaySize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  return needResize;
}

function toWorldPosition({ x, y, z }) {
  return new THREE.Vector3(
    (x - offset) * cellSize,
    (y - offset) * cellSize,
    (z - offset) * cellSize
  );
}

function initSnake() {
  const center = Math.floor(boardSize / 2);
  snake = [
    { x: center + 1, y: center, z: center },
    { x: center, y: center, z: center },
    { x: center - 1, y: center, z: center },
  ];
  directionQueue = [];
  currentDirection = { x: 1, y: 0, z: 0 };
  stepInterval = baseStep;
  accumulator = 0;
  score = 0;
  isGameOver = false;
  isPaused = true;
  messageEl.textContent = "按任意方向键开始";
  syncSnakeMeshes();
  placeFood();
  updateStatus();
}

function syncSnakeMeshes() {
  while (snakeMeshes.length < snake.length) {
    const mesh = new THREE.Mesh(segmentGeometry, bodyMaterial.clone());
    snakeMeshes.push(mesh);
    scene.add(mesh);
  }
  while (snakeMeshes.length > snake.length) {
    const mesh = snakeMeshes.pop();
    scene.remove(mesh);
  }

  snake.forEach((segment, index) => {
    const mesh = snakeMeshes[index];
    mesh.material = index === 0 ? headMaterial : bodyMaterial;
    const worldPos = toWorldPosition(segment);
    mesh.position.copy(worldPos);
  });
}

function placeFood() {
  const occupied = new Set(snake.map((segment) => `${segment.x}-${segment.y}-${segment.z}`));
  let candidate;
  let attempts = 0;
  do {
    candidate = {
      x: Math.floor(Math.random() * boardSize),
      y: Math.floor(Math.random() * boardSize),
      z: Math.floor(Math.random() * boardSize),
    };
    attempts += 1;
    if (attempts > 500) {
      break;
    }
  } while (occupied.has(`${candidate.x}-${candidate.y}-${candidate.z}`));
  food = candidate;
  const worldPos = toWorldPosition(food);
  foodMesh.position.copy(worldPos);
}

function updateStatus() {
  scoreEl.textContent = score.toString();
  lengthEl.textContent = snake.length.toString();
  const multiplier = (baseStep / stepInterval).toFixed(1);
  speedEl.textContent = `${multiplier}x`;
}

function queueDirection(nextDir) {
  const lastDir = directionQueue.length ? directionQueue[directionQueue.length - 1] : currentDirection;
  if (lastDir.x + nextDir.x === 0 && lastDir.y + nextDir.y === 0 && lastDir.z + nextDir.z === 0) {
    return;
  }
  directionQueue.push(nextDir);
}

function handleKeyDown(event) {
  if (event.repeat) return;
  const key = event.key.toLowerCase();

  if (key === " " || event.code === "Space") {
    if (isGameOver) {
      restartGame();
      return;
    }
    togglePause();
    event.preventDefault();
    return;
  }

  if (key === "r") {
    restartGame();
    return;
  }

  const directionMap = {
    arrowleft: { x: -1, y: 0, z: 0 },
    arrowright: { x: 1, y: 0, z: 0 },
    arrowup: { x: 0, y: 0, z: -1 },
    arrowdown: { x: 0, y: 0, z: 1 },
    w: { x: 0, y: 1, z: 0 },
    s: { x: 0, y: -1, z: 0 },
  };

  if (directionMap[key]) {
    queueDirection(directionMap[key]);
    if (isPaused && !isGameOver) {
      isPaused = false;
      messageEl.textContent = "";
    }
    event.preventDefault();
  }
}

document.addEventListener("keydown", handleKeyDown);

function togglePause() {
  if (isGameOver) return;
  isPaused = !isPaused;
  messageEl.textContent = isPaused ? "已暂停，按空格继续" : "";
}

function restartGame() {
  initSnake();
}

function advanceGame() {
  if (isPaused || isGameOver) {
    return;
  }

  const nextDir = directionQueue.length ? directionQueue.shift() : currentDirection;
  currentDirection = nextDir;
  const head = snake[0];
  const nextHead = {
    x: head.x + currentDirection.x,
    y: head.y + currentDirection.y,
    z: head.z + currentDirection.z,
  };

  if (
    nextHead.x < 0 ||
    nextHead.x >= boardSize ||
    nextHead.y < 0 ||
    nextHead.y >= boardSize ||
    nextHead.z < 0 ||
    nextHead.z >= boardSize
  ) {
    endGame("撞到了边界");
    return;
  }

  if (snake.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y && segment.z === nextHead.z)) {
    endGame("咬到了自己");
    return;
  }

  snake.unshift(nextHead);

  if (food && nextHead.x === food.x && nextHead.y === food.y && nextHead.z === food.z) {
    score += 10;
    stepInterval = Math.max(110, stepInterval - 8);
    placeFood();
  } else {
    snake.pop();
  }

  syncSnakeMeshes();
  updateStatus();
}

function endGame(reason) {
  isGameOver = true;
  isPaused = true;
  messageEl.textContent = `游戏结束：${reason}，按 R 重来`;
}

function render(timestamp) {
  if (!previousTimestamp) {
    previousTimestamp = timestamp;
  }
  const delta = timestamp - previousTimestamp;
  previousTimestamp = timestamp;

  resizeRendererToDisplaySize();
  controls.update();

  accumulator += delta;
  while (accumulator >= stepInterval) {
    accumulator -= stepInterval;
    advanceGame();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

initSnake();
requestAnimationFrame(render);
