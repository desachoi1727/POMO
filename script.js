const DURATIONS = {
  focus: 60 * 60,
  focus45: 45 * 60,
  focus10: 10 * 60,
  longBreak: 30 * 60,
};

const MODE_LABEL = {
  focus: "집중",
  focus45: "집중 45",
  focus10: "집중 10",
  longBreak: "휴식",
};

const FOCUS_MODES = new Set(["focus", "focus45", "focus10"]);

const STORAGE_KEY = "pomo_state_v1";
const WEEKDAYS_KR = ["일", "월", "화", "수", "목", "금", "토"];

const $ = (id) => document.getElementById(id);

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadState() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    saved = null;
  }

  const defaults = {
    date: todayStr(),
    sessionsToday: 0,
    completedSessions: 0,
    focusMinutes: 0,
    cycleIndex: 0,
    routines: [
      { id: 1, text: "Workout", done: false },
      { id: 2, text: "Meeting - Group A", done: false },
    ],
  };

  if (!saved) return defaults;

  if (saved.date !== todayStr()) {
    return {
      ...defaults,
      routines: (saved.routines || defaults.routines).map((r) => ({ ...r, done: false })),
    };
  }

  return { ...defaults, ...saved };
}

let state = loadState();

let currentMode = "focus";
let remaining = DURATIONS.focus;
let running = false;
let intervalId = null;

const ringProgress = $("ringProgress");
const RING_CIRCUMFERENCE = 2 * Math.PI * 130;
ringProgress.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;

const timerCard = document.querySelector(".timer-card");
const timeDisplay = $("timeDisplay");
const modeTag = $("modeTag");
const startBtn = $("startBtn");
const resetBtn = $("resetBtn");
const dots = document.querySelectorAll(".dot-mark");
const modeBoxes = document.querySelectorAll(".mode-box");

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function renderDate() {
  const d = new Date();
  $("date").textContent = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")} ${WEEKDAYS_KR[d.getDay()]}`;
}

function updateRing() {
  const total = DURATIONS[currentMode];
  const fraction = remaining / total;
  ringProgress.style.strokeDashoffset = `${RING_CIRCUMFERENCE * fraction}`;
}

function updateDots() {
  dots.forEach((dot, i) => {
    dot.classList.toggle("filled", i < state.cycleIndex);
  });
}

function updateStats() {
  $("sessionsCount").textContent = state.sessionsToday;
  $("statSessions").textContent = state.completedSessions;
  $("statMinutes").textContent = state.focusMinutes;
  const total = state.routines.length;
  const done = state.routines.filter((r) => r.done).length;
  $("statRoutine").textContent = total === 0 ? 0 : Math.round((done / total) * 100);
}

function setStartBtnLabel() {
  startBtn.textContent = running ? "일시정지" : "시작";
  startBtn.classList.toggle("running", running);
}

function applyModeUI() {
  modeBoxes.forEach((box) => box.classList.toggle("active", box.dataset.mode === currentMode));
  timerCard.classList.toggle("mode-longBreak", currentMode === "longBreak");
  modeTag.textContent = MODE_LABEL[currentMode];
  timeDisplay.textContent = formatTime(remaining);
  updateRing();
}

function switchMode(mode) {
  stopTimer();
  currentMode = mode;
  remaining = DURATIONS[mode];
  applyModeUI();
  setStartBtnLabel();
}

function stopTimer() {
  running = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function playAlarm() {
  const audio = $("alarmSound");
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function onSessionComplete() {
  stopTimer();
  playAlarm();

  if (FOCUS_MODES.has(currentMode)) {
    state.sessionsToday += 1;
    state.completedSessions += 1;
    state.focusMinutes += Math.round(DURATIONS[currentMode] / 60);
    state.cycleIndex = (state.cycleIndex + 1) % 4;
    saveState();
    updateStats();
    updateDots();
    switchMode("longBreak");
  } else {
    switchMode("focus");
  }
}

function tick() {
  remaining -= 1;
  timeDisplay.textContent = formatTime(remaining);
  updateRing();
  if (remaining <= 0) {
    onSessionComplete();
  }
}

function toggleStart() {
  if (running) {
    stopTimer();
    setStartBtnLabel();
    return;
  }
  running = true;
  setStartBtnLabel();
  intervalId = setInterval(tick, 1000);
}

function resetTimer() {
  stopTimer();
  remaining = DURATIONS[currentMode];
  applyModeUI();
  setStartBtnLabel();
}

modeBoxes.forEach((box) => {
  box.addEventListener("click", () => switchMode(box.dataset.mode));
});

startBtn.addEventListener("click", toggleStart);
resetBtn.addEventListener("click", resetTimer);

// tabs
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(`${btn.dataset.tab}-panel`).classList.add("active");
  });
});

// routines
const routineList = $("routineList");
const routineInput = $("routineInput");

let dragState = null;

function attachDragHandlers(li, handle) {
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragState = { pointerId: e.pointerId, li, startY: e.clientY };
    li.classList.add("dragging");
    document.body.style.userSelect = "none";

    const onMove = (ev) => {
      if (!dragState || dragState.pointerId !== ev.pointerId) return;
      const deltaY = ev.clientY - dragState.startY;
      li.style.transform = `translateY(${deltaY}px)`;

      const liRect = li.getBoundingClientRect();
      const liMid = liRect.top + liRect.height / 2;

      const prev = li.previousElementSibling;
      if (prev && prev.classList.contains("routine-item")) {
        const prevRect = prev.getBoundingClientRect();
        if (liMid < prevRect.top + prevRect.height / 2) {
          routineList.insertBefore(li, prev);
          dragState.startY = ev.clientY;
          li.style.transform = "translateY(0px)";
          return;
        }
      }

      const next = li.nextElementSibling;
      if (next && next.classList.contains("routine-item")) {
        const nextRect = next.getBoundingClientRect();
        if (liMid > nextRect.top + nextRect.height / 2) {
          routineList.insertBefore(li, next.nextSibling);
          dragState.startY = ev.clientY;
          li.style.transform = "translateY(0px)";
        }
      }
    };

    const onUp = (ev) => {
      if (!dragState || dragState.pointerId !== ev.pointerId) return;
      li.style.transform = "";
      li.classList.remove("dragging");
      document.body.style.userSelect = "";
      dragState = null;

      const newOrder = [...routineList.children]
        .filter((el) => el.classList.contains("routine-item"))
        .map((el) => Number(el.dataset.id));
      state.routines.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
      saveState();

      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  });
}

function renderRoutines() {
  routineList.innerHTML = "";

  if (state.routines.length === 0) {
    const empty = document.createElement("li");
    empty.className = "routine-empty";
    empty.textContent = "오늘의 루틴을 추가해보세요";
    routineList.appendChild(empty);
  }

  state.routines.forEach((routine) => {
    const li = document.createElement("li");
    li.className = "routine-item" + (routine.done ? " done" : "");
    li.dataset.id = routine.id;

    const dragHandle = document.createElement("button");
    dragHandle.className = "routine-drag";
    dragHandle.type = "button";
    dragHandle.setAttribute("aria-label", "순서 변경");
    dragHandle.innerHTML =
      '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';

    const checkBtn = document.createElement("button");
    checkBtn.className = "routine-check";
    checkBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    checkBtn.addEventListener("click", () => {
      routine.done = !routine.done;
      saveState();
      renderRoutines();
      updateStats();
    });

    const text = document.createElement("span");
    text.className = "routine-text";
    text.textContent = routine.text;

    const delBtn = document.createElement("button");
    delBtn.className = "routine-delete";
    delBtn.textContent = "×";
    delBtn.addEventListener("click", () => {
      state.routines = state.routines.filter((r) => r.id !== routine.id);
      saveState();
      renderRoutines();
      updateStats();
    });

    li.appendChild(dragHandle);
    li.appendChild(checkBtn);
    li.appendChild(text);
    li.appendChild(delBtn);
    routineList.appendChild(li);

    attachDragHandlers(li, dragHandle);
  });

  const total = state.routines.length;
  const done = state.routines.filter((r) => r.done).length;
  $("routineDone").textContent = done;
  $("routineTotal").textContent = total;
  $("routineProgressFill").style.width = total === 0 ? "0%" : `${(done / total) * 100}%`;
}

function addRoutine() {
  const text = routineInput.value.trim();
  if (!text) return;
  state.routines.push({ id: Date.now(), text, done: false });
  routineInput.value = "";
  saveState();
  renderRoutines();
  updateStats();
}

$("routineAddBtn").addEventListener("click", addRoutine);
routineInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addRoutine();
});

// init
renderDate();
applyModeUI();
setStartBtnLabel();
updateDots();
updateStats();
renderRoutines();
saveState();
