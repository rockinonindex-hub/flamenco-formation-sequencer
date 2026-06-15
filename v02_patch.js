// v0.2 add-on: circle formation, tablet stage input, seek-resume playback polish
(function () {
  const patch = () => {
    if (typeof state === "undefined" || typeof el === "undefined") return;
    state.rowModes ||= {};

    injectV02Styles();
    restoreRowModesFromLocal();
    bindV02Controls();

    const oldRenderFormationTable = renderFormationTable;
    renderFormationTable = function () {
      oldRenderFormationTable();
      decorateFormationTableModes();
    };

    const oldRenderStage = renderStage;
    renderStage = function () {
      el.dancersLayer.innerHTML = "";
      const displayIndex = clamp(state.currentIndex, 0, Math.max(0, state.rows.length - 1));
      renderCircleGuide(displayIndex);
      state.members.forEach(m => {
        const resolved = resolvePosition(m.id, displayIndex);
        if (!resolved || resolved.hidden) return;
        const pos = resolved.pos;
        const d = document.createElement("div");
        d.className = "dancer";
        if (resolved.offstage) d.classList.add("offstage");
        if (state.selected.memberId === m.id) d.classList.add("selected-dancer");
        d.style.left = `${coordToPercentX(pos.x)}%`;
        d.style.top = `${coordToPercentY(pos.y)}%`;
        d.style.background = m.color;
        d.textContent = m.showLabel ? (m.name || "？") : "";
        d.title = `${m.name}: ${formatPos(pos)}`;
        el.dancersLayer.appendChild(d);
      });
      updateCurrentLabels();
      highlightCurrentRow();
    };

    const oldStepTo = stepTo;
    stepTo = function (index) {
      pause();
      state.currentIndex = clamp(index, 0, Math.max(0, state.rows.length - 1));
      state.play.pausedAtIndex = state.currentIndex;
      renderStage();
    };

    const oldExportProject = exportProject;
    exportProject = function () {
      const project = oldExportProject();
      project.version = "0.2";
      project.rowModes = state.rowModes || {};
      return project;
    };

    const oldUpdateStudentOutput = updateStudentOutput;
    updateStudentOutput = function () {
      const memberId = el.studentSelect.value || state.members[0]?.id;
      const member = state.members.find(m => m.id === memberId);
      if (!member) return oldUpdateStudentOutput();
      const lines = [`${member.name}さんの立ち位置`, `曲名：${state.title}`, ""];
      state.rows.forEach((row, i) => {
        if (getRowMode(i) === "circle") {
          lines.push(`${row.partName}${row.compasInPart}：中央で輪フォーメーション`);
          return;
        }
        const raw = getCell(i, memberId);
        if (raw.trim()) lines.push(`${row.partName}${row.compasInPart}：${describeToken(raw)}`);
      });
      if (lines.length <= 3) lines.push("入力された位置・移動がまだありません。");
      el.studentOutput.value = lines.join("\n");
    };

    const oldAnalyzeWarnings = analyzeWarnings;
    analyzeWarnings = function () {
      oldAnalyzeWarnings();
      if (!el.warnings) return;
      state.rows.forEach((row, i) => {
        if (getRowMode(i) !== "circle") return;
        const item = document.createElement("div");
        item.className = "warning-item note-like";
        item.innerHTML = `<strong>輪フォーメーション</strong>：${row.partName}${row.compasInPart} は重なり確認を簡略化しています`;
        el.warnings.appendChild(item);
      });
    };

    resolvePosition = function (memberId, displayIndex) {
      const max = state.rows.length - 1;
      const t = clamp(displayIndex, 0, Math.max(0, max));
      const floor = Math.floor(t);
      const frac = t - floor;
      if (isCircleRow(floor)) {
        const current = circleDisplay(memberId, floor, frac);
        const next = floor < max && !isCircleRow(floor + 1) ? resolveAtRow(memberId, floor + 1) : null;
        if (next && !next.hidden && frac > 0.72) {
          const p = (frac - 0.72) / 0.28;
          return interpolateDisplays(circleDisplay(memberId, floor, 1), next, state.easing ? easeInOutCubic(p) : p);
        }
        return current;
      }
      if (frac < 0.001 || floor >= max) return resolveAtRow(memberId, floor);
      const from = resolveAtRow(memberId, floor);
      const to = isCircleRow(floor + 1) ? circleDisplay(memberId, floor + 1, 0) : resolveAtRow(memberId, floor + 1);
      return interpolateDisplays(from, to, state.easing ? easeInOutCubic(frac) : frac);
    };

    const oldResolveAtRow = resolveAtRow;
    resolveAtRow = function (memberId, rowIndex) {
      if (isCircleRow(rowIndex)) return circleDisplay(memberId, rowIndex, 0);
      const token = parseToken(getCell(rowIndex, memberId));
      if (isAnchor(token)) return tokenToDisplay(token);
      if (token.type === "arrow") {
        const prev = findPrevAnchorV02(memberId, rowIndex - 1);
        const next = findNextAnchorV02(memberId, rowIndex + 1);
        if (prev && next) {
          const p0 = (rowIndex - prev.index) / Math.max(1, next.index - prev.index);
          return interpolateDisplays(tokenToDisplay(prev.token), tokenToDisplay(next.token), state.easing ? easeInOutCubic(p0) : p0);
        }
        if (prev) return tokenToDisplay(prev.token);
        return { hidden: true };
      }
      const prev = findPrevAnchorV02(memberId, rowIndex);
      return prev ? tokenToDisplay(prev.token) : { hidden: true };
    };

    updateCurrentLabels = function () {
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
      const circle = getRowMode(i) === "circle" ? "（輪）" : "";
      el.currentLabel.textContent = state.play.running ? `${row.partName}${row.compasInPart}${circle} / ${beat}拍目` : `${row.partName}${row.compasInPart}${circle}`;
      el.currentSubLabel.textContent = `通し ${i + 1} / ${state.rows.length} コンパス`;
    };

    renderFormationTable();
    renderStage();
    updateStudentOutput();
    analyzeWarnings();
    updateSaveStatus("v0.2 準備完了");
  };

  document.addEventListener("DOMContentLoaded", () => setTimeout(patch, 0));

  function bindV02Controls() {
    document.querySelectorAll(".special-buttons button[data-row-mode]").forEach(btn => {
      btn.addEventListener("click", () => setSelectedRowMode(btn.dataset.rowMode));
    });
    if (el.stage) {
      el.stage.addEventListener("pointerdown", handleStagePointerV02);
      el.stage.addEventListener("click", e => e.preventDefault());
    }
  }

  function restoreRowModesFromLocal() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const project = JSON.parse(saved);
      if (project.rowModes) state.rowModes = project.rowModes;
    } catch {}
  }

  function handleStagePointerV02(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    if (state.selected.rowIndex == null || !state.selected.memberId) return;
    const rect = el.stage.getBoundingClientRect();
    const px = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const py = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    const x = snapHalf(px * 4);
    const y = snapHalf((1 - py) * 4);
    setCell(state.selected.rowIndex, state.selected.memberId, `${formatNumber(x)},${formatNumber(y)}`, true);
  }

  function decorateFormationTableModes() {
    const table = el.formationTable;
    if (!table || table.dataset.v02Decorated === "1") return;
    const headRow = table.querySelector("thead tr");
    if (headRow && !headRow.querySelector(".mode-head")) {
      const th = document.createElement("th");
      th.className = "mode-head";
      th.textContent = "形";
      headRow.insertBefore(th, headRow.children[1]);
    }
    table.querySelectorAll("tbody tr").forEach(tr => {
      const rowIndex = Number(tr.dataset.rowIndex);
      if (tr.querySelector(".mode-cell")) return;
      const td = document.createElement("td");
      td.className = `mode-cell ${getRowMode(rowIndex) === "circle" ? "circle-mode" : "normal-mode"}`;
      td.textContent = getRowMode(rowIndex) === "circle" ? "輪" : "通常";
      td.title = "行のフォーメーション種別";
      td.addEventListener("click", () => selectRowV02(rowIndex));
      tr.insertBefore(td, tr.children[1]);
    });
    table.dataset.v02Decorated = "1";
  }

  function selectRowV02(rowIndex) {
    state.selected.rowIndex = rowIndex;
    state.currentIndex = clamp(rowIndex, 0, Math.max(0, state.rows.length - 1));
    state.play.pausedAtIndex = state.currentIndex;
    updateSelectedCellLabel();
    renderStage();
  }

  function setSelectedRowMode(mode) {
    const rowIndex = state.selected.rowIndex ?? Math.floor(state.currentIndex || 0);
    const row = state.rows[rowIndex];
    if (!row) return alert("先に行を選択してください。");
    const key = rowLabel(row);
    if (mode === "circle") state.rowModes[key] = "circle";
    else delete state.rowModes[key];
    state.currentIndex = rowIndex;
    state.play.pausedAtIndex = rowIndex;
    renderFormationTable();
    renderStage();
    updateStudentOutput();
    analyzeWarnings();
    changed();
  }

  function getRowMode(rowIndex) {
    const row = state.rows[rowIndex];
    return row && state.rowModes?.[rowLabel(row)] === "circle" ? "circle" : "normal";
  }

  function isCircleRow(rowIndex) {
    return getRowMode(rowIndex) === "circle";
  }

  function rowLabel(row) {
    return row ? `${row.partName}${row.compasInPart}` : "";
  }

  function circleDisplay(memberId, rowIndex, phase = 0) {
    const count = Math.max(1, state.members.length);
    const memberIndex = Math.max(0, state.members.findIndex(m => m.id === memberId));
    const step = (Math.PI * 2) / count;
    const theta = -Math.PI / 2 + memberIndex * step + phase * step;
    const radius = count <= 3 ? 0.85 : count <= 5 ? 1.05 : 1.25;
    return {
      hidden: false,
      offstage: false,
      circle: true,
      pos: {
        x: clamp(2 + Math.cos(theta) * radius, 0, 4),
        y: clamp(2 - Math.sin(theta) * radius, 0, 4)
      }
    };
  }

  function renderCircleGuide(displayIndex) {
    const i = Math.floor(clamp(displayIndex, 0, Math.max(0, state.rows.length - 1)));
    if (!isCircleRow(i)) return;
    const guide = document.createElement("div");
    guide.className = "circle-guide";
    guide.textContent = "輪";
    el.dancersLayer.appendChild(guide);
  }

  function findPrevAnchorV02(memberId, startIndex) {
    for (let i = Math.min(startIndex, state.rows.length - 1); i >= 0; i--) {
      if (isCircleRow(i)) return { index: i, token: { type: "coord", ...circleDisplay(memberId, i, 0).pos } };
      const token = parseToken(getCell(i, memberId));
      if (isAnchor(token)) return { index: i, token };
    }
    return null;
  }

  function findNextAnchorV02(memberId, startIndex) {
    for (let i = Math.max(0, startIndex); i < state.rows.length; i++) {
      if (isCircleRow(i)) return { index: i, token: { type: "coord", ...circleDisplay(memberId, i, 0).pos } };
      const token = parseToken(getCell(i, memberId));
      if (isAnchor(token)) return { index: i, token };
    }
    return null;
  }

  function injectV02Styles() {
    if (document.getElementById("v02PatchStyles")) return;
    const style = document.createElement("style");
    style.id = "v02PatchStyles";
    style.textContent = `
      .stage { touch-action:none; user-select:none; -webkit-user-select:none; }
      table { min-width: 620px; }
      .mode-head { min-width:58px; }
      td.mode-cell { text-align:center; min-width:58px; padding:8px 6px; font-weight:800; font-size:12px; cursor:pointer; background:#fff8eb; }
      td.mode-cell.circle-mode { color:#8f271f; background:#ffe7c2; }
      tr.current-row td.mode-cell { background:#ffdba3; }
      .formation-mode-btn { border-color:#c98d4d; background:#fff3dc; font-weight:800; }
      .circle-guide { position:absolute; left:50%; top:50%; width:52%; height:52%; transform:translate(-50%,-50%); border:2px dashed rgba(155,47,36,.46); border-radius:999px; display:flex; align-items:center; justify-content:center; color:rgba(155,47,36,.7); font-weight:900; letter-spacing:.12em; background:rgba(255,231,194,.2); }
      .dancer.selected-dancer { outline:4px solid rgba(255,215,119,.95); box-shadow:0 0 0 4px rgba(155,47,36,.18), 0 9px 22px rgba(0,0,0,.28); z-index:5; }
      .warning-item.note-like strong { color:#8f271f; }
    `;
    document.head.appendChild(style);
  }
})();
