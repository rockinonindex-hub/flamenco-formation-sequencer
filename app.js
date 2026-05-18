const STORAGE_KEY = "flamencoFormationSequencer.v01";
const PRESET_PARTS_KEY = "flamencoFormationSequencer.customParts";

const defaultColors = ["#d64545", "#2f80ed", "#27ae60", "#f2c94c", "#9b51e0", "#f2994a", "#eb5757", "#56ccf2"];
const defaultPartPresets = [
  "サリーダ", "ジャマーダ", "レトラ", "1歌", "2歌", "ファルセータ", "エスコビージャ",
  "シレンシオ", "スビーダ", "ブレリア", "タンゴ", "コレオグラフィア", "パソ",
  "マルカール", "フィン・デ・フィエスタ", "退場", "その他"
];

const state = {
  title: "発表会ソレア",
  bpm: 120,
  beatsPerCompas: 12,
  speed: 1,
  metronome: false,
  easing: true,
  autoScroll: true,
  members: [
    { id: uid(), name: "Aさん", color: defaultColors[0], showLabel: true },
    { id: uid(), name: "Bさん", color: defaultColors[1], showLabel: true },
    { id: uid(), name: "Cさん", color: defaultColors[2], showLabel: true }
  ],
  parts: [
    { name: "サリーダ", compases: 2 },
    { name: "1歌", compases: 4 },
    { name: "ファルセータ", compases: 4 },
    { name: "退場", compases: 2 }
  ],
  cells: {},
  rows: [],
  selected: { rowIndex: null, memberId: null },
  currentIndex: 0,
  play: {
    running: false,
    startedAt: 0,
    pausedAtIndex: 0,
    rafId: null,
    lastTick: -1
  },
  audio: null,
  customParts: loadCustomParts()
};

const el = {};
document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheElements();
  loadInitialData();
  bindEvents();
  rebuildRows();
  renderAll();
  updateSaveStatus("準備完了");
}

function cacheElements() {
  [
    "saveStatus", "projectTitle", "bpmInput", "beatsInput", "speedInput", "metroToggle", "easingToggle",
    "autoScrollToggle", "membersList", "partsList", "addMemberBtn", "addPartBtn", "buildTableBtn",
    "saveLocalBtn", "restoreLocalBtn", "downloadJsonBtn", "loadJsonInput", "studentSelect",
    "copyOutputBtn", "studentOutput", "currentLabel", "currentSubLabel", "firstBtn", "prevBtn",
    "playBtn", "pauseBtn", "stopBtn", "nextBtn", "lastBtn", "formationTable", "tableWrap",
    "selectedCellLabel", "stage", "gridSvg", "dancersLayer", "warnings"
  ].forEach(id => el[id] = document.getElementById(id));
}

function bindEvents() {
  el.projectTitle.addEventListener("input", () => { state.title = el.projectTitle.value; changed(); });
  el.bpmInput.addEventListener("input", () => { state.bpm = clampNumber(el.bpmInput.value, 20, 260, 120); changed(false); });
  el.beatsInput.addEventListener("change", () => { state.beatsPerCompas = Number(el.beatsInput.value); changed(false); });
  el.speedInput.addEventListener("change", () => { state.speed = Number(el.speedInput.value); changed(false); });
  el.metroToggle.addEventListener("change", () => { state.metronome = el.metroToggle.checked; changed(false); });
  el.easingToggle.addEventListener("change", () => { state.easing = el.easingToggle.checked; renderStage(); changed(false); });
  el.autoScrollToggle.addEventListener("change", () => { state.autoScroll = el.autoScrollToggle.checked; changed(false); });

  el.addMemberBtn.addEventListener("click", addMember);
  el.addPartBtn.addEventListener("click", addPart);
  el.buildTableBtn.addEventListener("click", () => { rebuildRows(); renderFormationTable(); renderStage(); updateStudentOutput(); analyzeWarnings(); changed(); });

  el.firstBtn.addEventListener("click", () => stepTo(0));
  el.prevBtn.addEventListener("click", () => stepTo(Math.max(0, Math.floor(state.currentIndex) - 1)));
  el.nextBtn.addEventListener("click", () => stepTo(Math.min(state.rows.length - 1, Math.floor(state.currentIndex) + 1)));
  el.lastBtn.addEventListener("click", () => stepTo(Math.max(0, state.rows.length - 1)));
  el.playBtn.addEventListener("click", play);
  el.pauseBtn.addEventListener("click", pause);
  el.stopBtn.addEventListener("click", stop);

  el.saveLocalBtn.addEventListener("click", () => { saveLocal(); updateSaveStatus("ローカル保存済み"); });
  el.restoreLocalBtn.addEventListener("click", restoreLocal);
  el.downloadJsonBtn.addEventListener("click", downloadJson);
  el.loadJsonInput.addEventListener("change", loadJsonFile);
  el.studentSelect.addEventListener("change", updateStudentOutput);
  el.copyOutputBtn.addEventListener("click", copyStudentOutput);

  el.stage.addEventListener("click", handleStageClick);

  document.querySelectorAll(".special-buttons button").forEach(btn => {
    btn.addEventListener("click", () => setSelectedCellValue(btn.dataset.token));
  });
}

function loadInitialData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    seedCells();
    return;
  }
  try {
    const parsed = JSON.parse(saved);
    applyProject(parsed);
    updateSaveStatus("ローカルデータ復元");
  } catch {
    seedCells();
  }
}

function applyProject(project) {
  state.title = project.title || state.title;
  state.bpm = Number(project.bpm || 120);
  state.beatsPerCompas = Number(project.beatsPerCompas || 12);
  state.speed = Number(project.speed || 1);
  state.metronome = Boolean(project.metronome);
  state.easing = project.easing !== false;
  state.autoScroll = project.autoScroll !== false;
  state.members = Array.isArray(project.members) && project.members.length ? project.members : state.members;
  state.parts = Array.isArray(project.parts) && project.parts.length ? project.parts : state.parts;
  state.cells = project.cells || {};
  state.customParts = unique([...(state.customParts || []), ...((project.customParts) || [])]);
  rebuildRows();
  ensureCells();
}

function seedCells() {
  rebuildRows();
  ensureCells();
  if (state.rows.length >= 1 && state.members.length >= 3) {
    setCell(0, state.members[0].id, "2,4", false);
    setCell(0, state.members[1].id, "IN-L", false);
    setCell(0, state.members[2].id, "3,3", false);
  }
  if (state.rows.length >= 2 && state.members.length >= 2) {
    setCell(1, state.members[0].id, "→", false);
    setCell(1, state.members[1].id, "→", false);
  }
  if (state.rows.length >= 3 && state.members.length >= 2) {
    setCell(2, state.members[0].id, "3,4", false);
    setCell(2, state.members[1].id, "1,3.5", false);
  }
}

function renderAll() {
  renderSettings();
  renderMembers();
  renderParts();
  renderFormationTable();
  renderGrid();
  renderStage();
  renderStudentSelect();
  updateStudentOutput();
  updateCurrentLabels();
  analyzeWarnings();
}

function renderSettings() {
  el.projectTitle.value = state.title;
  el.bpmInput.value = state.bpm;
  el.beatsInput.value = state.beatsPerCompas;
  el.speedInput.value = state.speed;
  el.metroToggle.checked = state.metronome;
  el.easingToggle.checked = state.easing;
  el.autoScrollToggle.checked = state.autoScroll;
}

function renderMembers() {
  el.membersList.innerHTML = "";
  state.members.forEach((m, index) => {
    const row = document.createElement("div");
    row.className = "member-row";

    const name = document.createElement("input");
    name.value = m.name;
    name.placeholder = "バイレ名";
    name.addEventListener("input", () => { m.name = name.value; renderFormationTable(); renderStage(); renderStudentSelect(); updateStudentOutput(); changed(); });

    const color = document.createElement("input");
    color.type = "color";
    color.value = m.color;
    color.addEventListener("input", () => { m.color = color.value; renderFormationTable(); renderStage(); changed(); });

    const label = document.createElement("label");
    label.className = "check";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = m.showLabel;
    check.addEventListener("change", () => { m.showLabel = check.checked; renderStage(); changed(); });
    label.append(check, document.createTextNode("名前"));

    const del = document.createElement("button");
    del.className = "icon-btn";
    del.textContent = "×";
    del.title = "削除";
    del.addEventListener("click", () => {
      if (state.members.length <= 1) return;
      delete state.cells[m.id];
      state.members.splice(index, 1);
      if (state.selected.memberId === m.id) state.selected.memberId = state.members[0]?.id || null;
      renderAll();
      changed();
    });

    row.append(name, color, label, del);
    el.membersList.appendChild(row);
  });
}

function renderParts() {
  el.partsList.innerHTML = "";
  state.parts.forEach((p, index) => {
    const row = document.createElement("div");
    row.className = "part-row";

    const select = document.createElement("select");
    getPartPresets().forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
    const customOpt = document.createElement("option");
    customOpt.value = "__custom__";
    customOpt.textContent = "カスタム入力…";
    select.appendChild(customOpt);

    if (getPartPresets().includes(p.name)) {
      select.value = p.name;
    } else {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = p.name;
      select.insertBefore(opt, customOpt);
      select.value = p.name;
    }

    select.addEventListener("change", () => {
      if (select.value === "__custom__") {
        const custom = prompt("追加するパート名を入力してください", "");
        if (custom && custom.trim()) {
          p.name = custom.trim();
          saveCustomPart(p.name);
        }
      } else {
        p.name = select.value;
      }
      renderParts();
      rebuildRows();
      renderFormationTable();
      renderStage();
      updateStudentOutput();
      changed();
    });

    const compases = document.createElement("input");
    compases.type = "number";
    compases.min = "1";
    compases.max = "128";
    compases.step = "1";
    compases.value = p.compases;
    compases.addEventListener("input", () => {
      p.compases = clampNumber(compases.value, 1, 128, 1);
      rebuildRows();
      renderFormationTable();
      renderStage();
      updateStudentOutput();
      changed();
    });

    const del = document.createElement("button");
    del.className = "icon-btn";
    del.textContent = "×";
    del.addEventListener("click", () => {
      if (state.parts.length <= 1) return;
      state.parts.splice(index, 1);
      rebuildRows();
      renderFormationTable();
      renderStage();
      updateStudentOutput();
      changed();
    });

    row.append(select, compases, del);
    el.partsList.appendChild(row);
  });
}

function renderFormationTable() {
  ensureCells();
  const table = el.formationTable;
  table.innerHTML = "";

  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  const timeHead = document.createElement("th");
  timeHead.textContent = "タイミング";
  hr.appendChild(timeHead);

  state.members.forEach(m => {
    const th = document.createElement("th");
    const wrap = document.createElement("div");
    wrap.className = "member-head";
    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.background = m.color;
    const txt = document.createElement("span");
    txt.textContent = m.name || "無名";
    wrap.append(dot, txt);
    th.appendChild(wrap);
    hr.appendChild(th);
  });

  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  state.rows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    tr.dataset.rowIndex = rowIndex;
    if (Math.floor(state.currentIndex) === rowIndex) tr.classList.add("current-row");

    const time = document.createElement("td");
    time.className = "time-cell";
    time.textContent = `${row.partName}${row.compasInPart}`;
    tr.appendChild(time);

    state.members.forEach(m => {
      const td = document.createElement("td");
      td.dataset.rowIndex = rowIndex;
      td.dataset.memberId = m.id;
      if (state.selected.rowIndex === rowIndex && state.selected.memberId === m.id) td.classList.add("selected-cell");

      const input = document.createElement("input");
      input.className = "formation-input";
      input.value = getCell(rowIndex, m.id);
      input.placeholder = "";
      input.addEventListener("focus", () => selectCell(rowIndex, m.id));
      input.addEventListener("click", () => selectCell(rowIndex, m.id));
      input.addEventListener("input", () => {
        setCell(rowIndex, m.id, input.value, false);
        renderStage();
        updateStudentOutput();
        analyzeWarnings();
        changed();
      });
      input.addEventListener("blur", () => {
        const clean = normalizeToken(input.value);
        input.value = clean;
        setCell(rowIndex, m.id, clean, false);
        renderStage();
        updateStudentOutput();
        analyzeWarnings();
        changed();
      });
      td.appendChild(input);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  updateSelectedCellLabel();
}

function renderGrid() {
  const svg = el.gridSvg;
  svg.innerHTML = "";
  svg.setAttribute("viewBox", "0 0 100 100");
  for (let i = 0; i <= 8; i++) {
    const p = (i / 8) * 100;
    const v = svgLine(p, 0, p, 100);
    const h = svgLine(0, p, 100, p);
    if (i % 2 === 0) {
      v.setAttribute("stroke-width", "0.65");
      h.setAttribute("stroke-width", "0.65");
    }
    svg.append(v, h);
  }
  for (let x = 0; x <= 4; x++) {
    for (let y = 0; y <= 4; y++) {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", String((x / 4) * 100));
      c.setAttribute("cy", String(100 - (y / 4) * 100));
      c.setAttribute("r", "0.8");
      c.setAttribute("fill", "rgba(90,60,38,.45)");
      svg.appendChild(c);
    }
  }
}

function svgLine(x1, y1, x2, y2) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("stroke", "rgba(94, 67, 43, .24)");
  line.setAttribute("stroke-width", "0.35");
  return line;
}

function renderStage() {
  el.dancersLayer.innerHTML = "";
  const displayIndex = clamp(state.currentIndex, 0, Math.max(0, state.rows.length - 1));
  state.members.forEach(m => {
    const resolved = resolvePosition(m.id, displayIndex);
    if (!resolved || resolved.hidden) return;

    const pos = resolved.pos;
    const div = document.createElement("div");
    div.className = "dancer";
    if (resolved.offstage) div.classList.add("offstage");
    if (state.selected.memberId === m.id) div.classList.add("selected-dancer");
    div.style.left = `${coordToPercentX(pos.x)}%`;
    div.style.top = `${coordToPercentY(pos.y)}%`;
    div.style.background = m.color;
    div.textContent = m.showLabel ? (m.name || "？") : "";
    div.title = `${m.name}: ${formatPos(pos)}`;
    el.dancersLayer.appendChild(div);
  });
  updateCurrentLabels();
  highlightCurrentRow();
}

function renderStudentSelect() {
  el.studentSelect.innerHTML = "";
  state.members.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name || "無名";
    el.studentSelect.appendChild(opt);
  });
}

function updateStudentOutput() {
  const memberId = el.studentSelect.value || state.members[0]?.id;
  if (!memberId) {
    el.studentOutput.value = "";
    return;
  }
  const member = state.members.find(m => m.id === memberId);
  if (!member) return;

  const lines = [];
  lines.push(`${member.name}さんの立ち位置`);
  lines.push(`曲名：${state.title}`);
  lines.push("");

  state.rows.forEach((row, i) => {
    const raw = getCell(i, memberId);
    if (!raw.trim()) return;
    lines.push(`${row.partName}${row.compasInPart}：${describeToken(raw)}`);
  });

  if (lines.length <= 3) {
    lines.push("入力された位置・移動がまだありません。");
  }
  el.studentOutput.value = lines.join("\n");
}

function analyzeWarnings() {
  const items = [];
  state.rows.forEach((row, i) => {
    const positions = [];
    state.members.forEach(m => {
      const raw = getCell(i, m.id);
      const token = parseToken(raw);
      if (token.type === "coord") {
        positions.push({ member: m, key: `${token.x},${token.y}` });
      }
    });
    const grouped = positions.reduce((acc, p) => {
      acc[p.key] ||= [];
      acc[p.key].push(p.member.name);
      return acc;
    }, {});
    Object.entries(grouped).forEach(([key, names]) => {
      if (names.length > 1) {
        items.push(`<strong>重なり確認</strong>：${row.partName}${row.compasInPart} / ${names.join("・")} が ${key} にいます`);
      }
    });
  });

  el.warnings.innerHTML = "";
  if (!items.length) {
    el.warnings.innerHTML = `<div class="note">確認ポイントはありません。</div>`;
    return;
  }
  items.slice(0, 40).forEach(html => {
    const div = document.createElement("div");
    div.className = "warning-item";
    div.innerHTML = html;
    el.warnings.appendChild(div);
  });
}

function rebuildRows() {
  const oldRows = state.rows || [];
  const oldLabels = oldRows.map(r => `${r.partName}${r.compasInPart}`);
  const oldCellsByLabel = {};
  state.members.forEach(m => {
    oldCellsByLabel[m.id] = {};
    oldRows.forEach((row, index) => {
      oldCellsByLabel[m.id][`${row.partName}${row.compasInPart}`] = getCell(index, m.id);
    });
  });

  const rows = [];
  state.parts.forEach((part, partIndex) => {
    const n = Math.max(1, Number(part.compases || 1));
    for (let c = 1; c <= n; c++) {
      rows.push({
        partIndex,
        partName: part.name || "パート",
        compasInPart: c,
        globalIndex: rows.length
      });
    }
  });
  state.rows = rows;

  const newCells = {};
  state.members.forEach(m => {
    newCells[m.id] = {};
    rows.forEach((row, index) => {
      const label = `${row.partName}${row.compasInPart}`;
      const old = oldCellsByLabel[m.id]?.[label];
      newCells[m.id][index] = old || "";
    });
  });
  state.cells = newCells;
  state.currentIndex = clamp(Math.floor(state.currentIndex || 0), 0, Math.max(0, rows.length - 1));
  ensureCells();
}

function ensureCells() {
  state.members.forEach(m => {
    state.cells[m.id] ||= {};
    state.rows.forEach((_, i) => {
      if (state.cells[m.id][i] === undefined) state.cells[m.id][i] = "";
    });
  });
}

function addMember() {
  const index = state.members.length;
  const member = { id: uid(), name: `${String.fromCharCode(65 + index)}さん`, color: defaultColors[index % defaultColors.length], showLabel: true };
  state.members.push(member);
  state.cells[member.id] = {};
  state.rows.forEach((_, i) => state.cells[member.id][i] = "");
  renderAll();
  changed();
}

function addPart() {
  state.parts.push({ name: "サリーダ", compases: 2 });
  rebuildRows();
  renderAll();
  changed();
}

function selectCell(rowIndex, memberId) {
  state.selected = { rowIndex, memberId };
  state.currentIndex = clamp(rowIndex, 0, Math.max(0, state.rows.length - 1));
  state.play.pausedAtIndex = state.currentIndex;
  updateSelectedCellLabel();
  document.querySelectorAll("td.selected-cell").forEach(td => td.classList.remove("selected-cell"));
  const td = document.querySelector(`td[data-row-index="${rowIndex}"][data-member-id="${memberId}"]`);
  if (td) td.classList.add("selected-cell");
  renderStage();
}

function updateSelectedCellLabel() {
  if (state.selected.rowIndex == null || !state.selected.memberId) {
    el.selectedCellLabel.textContent = "セル未選択";
    return;
  }
  const row = state.rows[state.selected.rowIndex];
  const member = state.members.find(m => m.id === state.selected.memberId);
  el.selectedCellLabel.textContent = row && member ? `選択中：${row.partName}${row.compasInPart} / ${member.name}` : "セル未選択";
}

function setSelectedCellValue(token) {
  if (state.selected.rowIndex == null || !state.selected.memberId) {
    alert("先に表の行とバイレを選択してください。");
    return;
  }
  setCell(state.selected.rowIndex, state.selected.memberId, token, true);
}

function handleStageClick(e) {
  if (state.selected.rowIndex == null || !state.selected.memberId) {
    alert("先に表の行とバイレを選択してください。");
    return;
  }
  const rect = el.stage.getBoundingClientRect();
  const px = clamp((e.clientX - rect.left) / rect.width, 0, 1);
  const py = clamp((e.clientY - rect.top) / rect.height, 0, 1);
  const x = snapHalf(px * 4);
  const y = snapHalf((1 - py) * 4);
  setCell(state.selected.rowIndex, state.selected.memberId, `${formatNumber(x)},${formatNumber(y)}`, true);
}

function getCell(rowIndex, memberId) {
  return state.cells?.[memberId]?.[rowIndex] ?? "";
}

function setCell(rowIndex, memberId, value, rerender) {
  state.cells[memberId] ||= {};
  state.cells[memberId][rowIndex] = normalizeToken(value);
  if (rerender) {
    const input = document.querySelector(`td[data-row-index="${rowIndex}"][data-member-id="${memberId}"] input`);
    if (input) input.value = state.cells[memberId][rowIndex];
    renderStage();
    updateStudentOutput();
    analyzeWarnings();
    changed();
  }
}

function stepTo(index) {
  pause();
  state.currentIndex = clamp(index, 0, Math.max(0, state.rows.length - 1));
  renderStage();
}

function play() {
  if (!state.rows.length || state.play.running) return;
  ensureAudio();
  state.play.running = true;
  state.play.startedAt = performance.now() - state.play.pausedAtIndex * compasDurationMs();
  state.play.lastTick = Math.floor((state.play.pausedAtIndex * Number(state.beatsPerCompas || 12)));
  loop();
}

function pause() {
  if (!state.play.running) return;
  state.play.running = false;
  cancelAnimationFrame(state.play.rafId);
  state.play.pausedAtIndex = state.currentIndex;
}

function stop() {
  state.play.running = false;
  cancelAnimationFrame(state.play.rafId);
  state.play.pausedAtIndex = 0;
  state.currentIndex = 0;
  renderStage();
}

function loop() {
  if (!state.play.running) return;
  const elapsed = performance.now() - state.play.startedAt;
  const compasMs = compasDurationMs();
  const idx = elapsed / compasMs;

  if (idx >= state.rows.length) {
    state.currentIndex = state.rows.length - 1;
    state.play.running = false;
    state.play.pausedAtIndex = 0;
    renderStage();
    return;
  }

  state.currentIndex = idx;

  if (state.metronome) {
    const beatMs = beatDurationMs();
    const beatIndex = Math.floor(elapsed / beatMs);
    if (beatIndex !== state.play.lastTick) {
      const beats = Number(state.beatsPerCompas || 12);
      const beatInCompas = beatIndex % beats;
      clickSound(beatInCompas === 0 ? 980 : 620, beatInCompas === 0 ? 0.11 : 0.075);
      state.play.lastTick = beatIndex;
    }
  }

  renderStage();
  state.play.rafId = requestAnimationFrame(loop);
}

function compasDurationMs() {
  return beatDurationMs() * Number(state.beatsPerCompas || 12);
}

function beatDurationMs() {
  const bpm = clampNumber(state.bpm, 20, 260, 120);
  const speed = Number(state.speed || 1);
  return (60 / bpm) * 1000 / speed;
}

function ensureAudio() {
  if (!state.audio) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) state.audio = new AudioContext();
  }
  if (state.audio?.state === "suspended") state.audio.resume();
}

function clickSound(freq, volume = 0.08) {
  if (!state.audio) return;
  const ctx = state.audio;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  osc.type = "square";
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.07);
}

function resolvePosition(memberId, displayIndex) {
  const max = state.rows.length - 1;
  const t = clamp(displayIndex, 0, Math.max(0, max));
  const floor = Math.floor(t);
  const frac = t - floor;

  if (frac < 0.001 || floor >= max) {
    return resolveAtRow(memberId, floor);
  }

  const from = resolveAtRow(memberId, floor);
  const to = resolveAtRow(memberId, floor + 1);
  return interpolateDisplays(from, to, state.easing ? easeInOutCubic(frac) : frac);
}

function resolveAtRow(memberId, rowIndex) {
  const token = parseToken(getCell(rowIndex, memberId));

  if (isAnchor(token)) return tokenToDisplay(token);

  if (token.type === "arrow") {
    const prev = findPrevAnchor(memberId, rowIndex - 1);
    const next = findNextAnchor(memberId, rowIndex + 1);
    if (prev && next) {
      const rawP = (rowIndex - prev.index) / Math.max(1, next.index - prev.index);
      return interpolateDisplays(tokenToDisplay(prev.token), tokenToDisplay(next.token), state.easing ? easeInOutCubic(rawP) : rawP);
    }
    if (prev) return tokenToDisplay(prev.token);
    return { hidden: true };
  }

  const prev = findPrevAnchor(memberId, rowIndex);
  if (prev) return tokenToDisplay(prev.token);
  return { hidden: true };
}

function interpolateDisplays(from, to, p) {
  if ((!from || from.hidden) && (!to || to.hidden)) return { hidden: true };

  const a = (!from || from.hidden) ? hiddenFallback(to, "from") : from;
  const b = (!to || to.hidden) ? hiddenFallback(from, "to") : to;
  if (!a || !b || !a.pos || !b.pos) return { hidden: true };

  if ((!to || to.hidden) && p > 0.96) return { hidden: true };
  if ((!from || from.hidden) && p < 0.04) return { hidden: true };

  return {
    hidden: false,
    offstage: Boolean(a.offstage || b.offstage),
    pos: {
      x: lerp(a.pos.x, b.pos.x, p),
      y: lerp(a.pos.y, b.pos.y, p)
    }
  };
}

function hiddenFallback(other, direction) {
  if (!other || !other.pos) return null;
  if (direction === "from") return { hidden: false, offstage: true, pos: { x: 2, y: -0.65 } };
  return { hidden: false, offstage: true, pos: { x: 2, y: -0.65 } };
}

function findPrevAnchor(memberId, startIndex) {
  for (let i = Math.min(startIndex, state.rows.length - 1); i >= 0; i--) {
    const token = parseToken(getCell(i, memberId));
    if (isAnchor(token)) return { index: i, token };
  }
  return null;
}

function findNextAnchor(memberId, startIndex) {
  for (let i = Math.max(0, startIndex); i < state.rows.length; i++) {
    const token = parseToken(getCell(i, memberId));
    if (isAnchor(token)) return { index: i, token };
  }
  return null;
}

function isAnchor(token) {
  return token.type === "coord" || token.type === "gate" || token.type === "off";
}

function parseToken(raw) {
  const v = normalizeToken(raw);
  if (!v) return { type: "blank" };
  if (v === "→" || v === "->" || v === "⇒") return { type: "arrow" };
  if (v === "OFF") return { type: "off" };
  if (/^(IN|OUT)-(L|R|B)$/.test(v)) return { type: "gate", code: v };
  const m = v.match(/^([0-4](?:\.5)?),\s*([0-4](?:\.5)?)$/);
  if (m) return { type: "coord", x: Number(m[1]), y: Number(m[2]) };
  return { type: "unknown", raw: v };
}

function tokenToDisplay(token) {
  if (token.type === "coord") return { hidden: false, offstage: false, pos: { x: token.x, y: token.y } };
  if (token.type === "off") return { hidden: true };
  if (token.type === "gate") {
    const map = {
      "IN-L": { x: -0.65, y: 2 },
      "OUT-L": { x: -0.65, y: 2 },
      "IN-R": { x: 4.65, y: 2 },
      "OUT-R": { x: 4.65, y: 2 },
      "IN-B": { x: 2, y: -0.65 },
      "OUT-B": { x: 2, y: -0.65 }
    };
    return { hidden: false, offstage: true, pos: map[token.code] || { x: 2, y: -0.65 } };
  }
  return { hidden: true };
}

function normalizeToken(value) {
  const v = String(value ?? "").trim().replace("，", ",").replace("→", "→");
  if (!v) return "";
  if (v === "-" || v === "ー") return "→";
  const upper = v.toUpperCase();
  if (upper === "OFF") return "OFF";
  if (/^(IN|OUT)-(L|R|B)$/.test(upper)) return upper;
  if (v === "->" || v === "⇒" || v === "→") return "→";
  const m = v.match(/^\s*([0-4](?:\.0|\.5)?)\s*,\s*([0-4](?:\.0|\.5)?)\s*$/);
  if (m) {
    const x = snapHalf(Number(m[1]));
    const y = snapHalf(Number(m[2]));
    return `${formatNumber(x)},${formatNumber(y)}`;
  }
  return v;
}

function describeToken(raw) {
  const token = parseToken(raw);
  if (token.type === "coord") return `横${formatNumber(token.x)} / 前後${formatNumber(token.y)}`;
  if (token.type === "arrow") return "移動中";
  if (token.type === "off") return "舞台外";
  if (token.type === "gate") {
    const map = {
      "IN-L": "下手から入場",
      "IN-R": "上手から入場",
      "IN-B": "奥から入場",
      "OUT-L": "下手へ捌け",
      "OUT-R": "上手へ捌け",
      "OUT-B": "奥へ捌け"
    };
    return map[token.code] || token.code;
  }
  return raw;
}

function updateCurrentLabels() {
  const i = Math.min(Math.floor(state.currentIndex), Math.max(0, state.rows.length - 1));
  const row = state.rows[i];
  if (!row) {
    el.currentLabel.textContent = "未生成";
    el.currentSubLabel.textContent = "表を更新してください";
    return;
  }
  const beats = Number(state.beatsPerCompas || 12);
  const frac = clamp(state.currentIndex - Math.floor(state.currentIndex), 0, 0.999);
  const beat = state.play.running ? Math.floor(frac * beats) + 1 : null;
  el.currentLabel.textContent = state.play.running ? `${row.partName}${row.compasInPart} / ${beat}拍目` : `${row.partName}${row.compasInPart}`;
  el.currentSubLabel.textContent = `通し ${i + 1} / ${state.rows.length} コンパス`;
}

function highlightCurrentRow() {
  const idx = Math.floor(state.currentIndex);
  document.querySelectorAll("tr.current-row").forEach(tr => tr.classList.remove("current-row"));
  const tr = document.querySelector(`tr[data-row-index="${idx}"]`);
  if (tr) {
    tr.classList.add("current-row");
    if (state.autoScroll) tr.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function coordToPercentX(x) {
  return (x / 4) * 100;
}

function coordToPercentY(y) {
  return 100 - (y / 4) * 100;
}

function formatPos(pos) {
  return `${formatNumber(pos.x)},${formatNumber(pos.y)}`;
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(exportProject()));
}

function restoreLocal() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    alert("ローカル保存データがありません。");
    return;
  }
  try {
    applyProject(JSON.parse(saved));
    renderAll();
    updateSaveStatus("ローカル復元済み");
  } catch {
    alert("保存データの読込に失敗しました。");
  }
}

function downloadJson() {
  const project = exportProject();
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeTitle = (state.title || "formation").replace(/[\\/:*?"<>|]/g, "_");
  a.href = url;
  a.download = `${safeTitle}_formation.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function loadJsonFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const project = JSON.parse(String(reader.result));
      applyProject(project);
      renderAll();
      updateSaveStatus("JSON読込済み");
      saveLocal();
    } catch {
      alert("JSONの読込に失敗しました。");
    } finally {
      e.target.value = "";
    }
  };
  reader.readAsText(file);
}

function exportProject() {
  return {
    app: "Flamenco Formation Sequencer",
    version: "0.1.4",
    savedAt: new Date().toISOString(),
    title: state.title,
    bpm: state.bpm,
    beatsPerCompas: state.beatsPerCompas,
    speed: state.speed,
    metronome: state.metronome,
    easing: state.easing,
    autoScroll: state.autoScroll,
    members: state.members,
    parts: state.parts,
    cells: state.cells,
    customParts: state.customParts
  };
}

function changed(autoSave = true) {
  updateSaveStatus("編集中");
  if (autoSave) {
    clearTimeout(changed.timer);
    changed.timer = setTimeout(() => {
      saveLocal();
      updateSaveStatus("自動保存済み");
    }, 400);
  }
}

function updateSaveStatus(text) {
  el.saveStatus.textContent = text;
}

function copyStudentOutput() {
  el.studentOutput.select();
  document.execCommand("copy");
  updateSaveStatus("コピーしました");
}

function loadCustomParts() {
  try {
    return JSON.parse(localStorage.getItem(PRESET_PARTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveCustomPart(name) {
  state.customParts = unique([...(state.customParts || []), name].filter(Boolean));
  localStorage.setItem(PRESET_PARTS_KEY, JSON.stringify(state.customParts));
}

function getPartPresets() {
  return unique([...defaultPartPresets, ...(state.customParts || [])]);
}

function uid() {
  return `id_${Math.random().toString(36).slice(2, 10)}`;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function snapHalf(n) {
  return clamp(Math.round(n * 2) / 2, 0, 4);
}

function formatNumber(n) {
  return Number.isInteger(n) ? String(n) : String(n.toFixed(1));
}

function unique(arr) {
  return [...new Set(arr)];
}

function lerp(a, b, p) {
  return a + (b - a) * p;
}

function easeInOutCubic(x) {
  x = clamp(x, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
