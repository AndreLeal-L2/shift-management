const weekDays = [
  { key: "seg", label: "Segunda", sales: 0 },
  { key: "ter", label: "Terça", sales: 0 },
  { key: "qua", label: "Quarta", sales: 0 },
  { key: "qui", label: "Quinta", sales: 0 },
  { key: "sex", label: "Sexta", sales: 0 },
  { key: "sab", label: "Sábado", sales: 0 },
  { key: "dom", label: "Domingo", sales: 0 },
];

let employees = [];
let salesHistory = [];
let currentSchedule = null;
const assignedHours = new Map();
const API_BASE = "/api";
const LOCAL_EMPLOYEES_KEY = "rellenoShiftsEmployees";
const LOCAL_SALES_KEY = "rellenoShiftsSalesHistory";
const LOCAL_MIGRATION_KEY = "rellenoShiftsRemoteMigrationDone";
const memoryStore = {};

// State for active page, view mode and selected day
let currentPage = "escala";
let currentViewMode = window.innerWidth <= 760 ? "daily" : "weekly";
let selectedDayKey = "seg";

const iconFallbacks = {
  "alert-triangle": "!",
  "bar-chart-3": "▥",
  "calendar-days": "▦",
  "chart-no-axes-combined": "↗",
  "check-circle-2": "✓",
  "clock": "◷",
  euro: "€",
  history: "↺",
  "log-in": "↪",
  "log-out": "↩",
  pencil: "✎",
  percent: "%",
  save: "▣",
  "sliders-horizontal": "☷",
  "trash-2": "⌫",
  "user-minus": "−",
  "user-plus": "+",
  users: "◌",
  "wand-sparkles": "✦",
  x: "×",
};

window.lucide = window.lucide || {
  createIcons() {
    document.querySelectorAll("i[data-lucide]").forEach((icon) => {
      if (!icon.textContent) {
        icon.textContent = iconFallbacks[icon.dataset.lucide] || "";
      }
    });
  },
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function isLoggedIn() {
  try {
    const response = await fetch(`${API_BASE}/auth`, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => ({}));
    return data.authenticated === true;
  } catch (_) {
    return false;
  }
}

async function updateAuthView() {
  const loggedIn = await isLoggedIn();
  document.body.classList.toggle("locked", !loggedIn);
  return loggedIn;
}

async function apiFetch(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(options.headers || {}),
  };
  return fetch(`${API_BASE}${endpoint}`, { ...options, credentials: "same-origin", headers });
}

function readLocalJson(key, fallback) {
  try {
    const raw = readStorageValue(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function readStorageValue(key) {
  if (Object.prototype.hasOwnProperty.call(memoryStore, key)) {
    return memoryStore[key];
  }

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch (_) {}

  return null;
}

function writeStorageValue(key, value) {
  memoryStore[key] = value;

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch (_) {}
}

function localId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function readApiError(response) {
  try {
    const body = await response.json();
    if (typeof body?.error === "string") return body.error;
    if (body?.error?.message) return body.error.message;
    return JSON.stringify(body);
  } catch (_) {
    return response.statusText || "Erro desconhecido";
  }
}

function normalizeEmployeeRecord(emp) {
  return {
    id: emp.id,
    name: emp.name,
    role: emp.role,
    maxHours: emp.max_hours || emp.maxHours || 40,
    availability: emp.availability || {}
  };
}

// Page Navigation System
function switchPage(pageId) {
  const targetPage = pageId.replace("#", "");
  const validPages = ["escala", "equipa", "regras", "vendas", "estatisticas"];
  if (!validPages.includes(targetPage)) return;

  currentPage = targetPage;

  // Toggle page section visibility
  document.querySelectorAll(".page-section").forEach((sec) => {
    sec.classList.toggle("active", sec.id === `page-${targetPage}`);
  });

  // Update active state in navigation dock
  document.querySelectorAll(".dock-item").forEach((item) => {
    const isTarget = item.dataset.page === targetPage;
    item.classList.toggle("active", isTarget);
  });

  // Smooth scroll to top of page section
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (targetPage === "estatisticas") {
    renderStatistics();
  }

  if (window.lucide) window.lucide.createIcons();
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.querySelector("#login-email").value.trim().toLowerCase();
  const password = document.querySelector("#login-password").value;
  const error = document.querySelector("#login-error");

  const response = await apiFetch("/auth", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    error.textContent = "Email ou palavra-passe inválidos.";
    return;
  }

  error.textContent = "";
  await updateAuthView();
  await migrateLocalDataToServer();
  await loadEmployees();
  await loadSalesHistory();
}

async function logout() {
  await apiFetch("/auth", { method: "DELETE" });
  await updateAuthView();
}

function demandLabel(value) {
  if (value >= 2100) return "Alta";
  if (value >= 1300) return "Média";
  if (value > 0) return "Baixa";
  return "Sem dados";
}

function shiftHours(shift, openTime, closeTime) {
  if (shift === "day") return `${openTime}-16:00`;
  const closeMins = normalizeEndMinutes("16:00", closeTime);
  return `${minutesToTime(closeMins - 8 * 60)}-${closeTime}`;
}

function splitRoles(role) {
  return String(role || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function roleLabel(role) {
  const roles = splitRoles(role);
  return roles.length ? roles.join(", ") : "Sem cargo";
}

function getRoleBadgeClass(role) {
  const r = (role || "").toLowerCase();
  if (r.includes("cozinha")) return "badge-cozinha";
  if (r.includes("caixa")) return "badge-caixa";
  if (r.includes("gerente")) return "badge-gerente";
  return "badge-gerente";
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function normalizeEndMinutes(start, end) {
  const startMins = timeToMinutes(start);
  let endMins = timeToMinutes(end);
  if (endMins <= startMins) endMins += 24 * 60;
  return endMins;
}

function minutesToTime(totalMinutes) {
  const normalized = ((Math.round(totalMinutes) % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = String(Math.floor(normalized / 60)).padStart(2, "0");
  const minutes = String(normalized % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getAvailabilityIntervals(dayData) {
  if (!dayData || typeof dayData !== "object" || Array.isArray(dayData)) return [];
  const rawIntervals = Array.isArray(dayData.intervals)
    ? dayData.intervals
    : dayData.custom && dayData.start && dayData.end
      ? [{ start: dayData.start, end: dayData.end }]
      : [];

  return rawIntervals
    .filter((interval) => interval && interval.start && interval.end)
    .map((interval) => ({
      start: interval.start,
      end: interval.end,
      startMins: timeToMinutes(interval.start),
      endMins: normalizeEndMinutes(interval.start, interval.end),
    }))
    .filter((interval) => interval.endMins > interval.startMins);
}

function getShiftWindow(shift, openTime = "08:30", closeTime = "23:00") {
  const closeMins = normalizeEndMinutes("16:00", closeTime);
  const start = shift === "day" ? timeToMinutes(openTime) : closeMins - 8 * 60;
  const storeClose = shift === "day" ? timeToMinutes("16:00") : normalizeEndMinutes("16:00", closeTime);
  return { start, end: storeClose };
}

function getEmployeeShiftDetails(employee, dayKey, shift, openTime = "08:30", closeTime = "23:00") {
  const avail = employee.availability?.[dayKey];
  const defaultWindow = getShiftWindow(shift, openTime, closeTime, false);
  const shiftStartMins = defaultWindow.start;
  const shiftEndMins = defaultWindow.end;
  const defaultDuration = Math.max(0.5, (shiftEndMins - shiftStartMins) / 60);

  if (!avail) {
    return {
      duration: defaultDuration,
      display: shiftHours(shift, openTime, closeTime),
      start: minutesToTime(shiftStartMins),
      end: minutesToTime(shiftEndMins),
    };
  }

  if (Array.isArray(avail)) {
    return {
      duration: defaultDuration,
      display: shiftHours(shift, openTime, closeTime),
      start: minutesToTime(shiftStartMins),
      end: minutesToTime(shiftEndMins),
    };
  }

  const intervals = getAvailabilityIntervals(avail);
  if (intervals.length) {
    const targetWindow = getShiftWindow(shift, openTime, closeTime);
    const best = intervals
      .map((interval) => {
        const start = Math.max(interval.startMins, targetWindow.start);
        const end = Math.min(interval.endMins, targetWindow.end, start + 8 * 60);
        return { start, end, duration: Math.max(0, (end - start) / 60) };
      })
      .filter((interval) => interval.duration > 0)
      .sort((a, b) => b.duration - a.duration)[0];

    if (best) {
      return {
        duration: Math.max(0.5, best.duration),
        display: `${minutesToTime(best.start)}-${minutesToTime(best.end)}`,
        start: minutesToTime(best.start),
        end: minutesToTime(best.end),
      };
    }
  }

  return {
    duration: defaultDuration,
    display: shiftHours(shift, openTime, closeTime),
    start: minutesToTime(shiftStartMins),
    end: minutesToTime(shiftEndMins),
  };
}

function isEmployeeAvailable(employee, dayKey, shift, openTime = "08:30", closeTime = "23:00") {
  const avail = employee.availability?.[dayKey];
  if (!avail) return false;

  const intervals = getAvailabilityIntervals(avail);
  if (intervals.length) {
    const shiftWindow = getShiftWindow(shift, openTime, closeTime);
    return intervals.some((interval) => interval.startMins < shiftWindow.end && interval.endMins > shiftWindow.start);
  }

  // Se tiver shifts definidos (day/night)
  if (typeof avail === "object" && avail.shifts && avail.shifts.length > 0) {
    return avail.shifts.includes(shift);
  }

  // Se for array antigo (compatibilidade)
  if (Array.isArray(avail)) {
    return avail.includes(shift);
  }

  return false;
}

async function loadSalesHistory() {
  try {
    const response = await apiFetch("/sales");
    if (!response.ok) throw new Error(await readApiError(response));

    salesHistory = await response.json();
    if (salesHistory.length > 0 && weekDays.every((d) => d.sales === 0)) {
      const latestWeek = salesHistory[0];
      if (latestWeek && latestWeek.sales) {
        weekDays.forEach((day) => {
          if (latestWeek.sales[day.key] !== undefined) {
            day.sales = Number(latestWeek.sales[day.key]);
          }
        });
      }
    }
    renderSales();
    renderMobileDaySelector();
    generateSchedule();
    renderStatistics();
  } catch (err) {
    console.error("Erro ao carregar histórico de vendas:", err);
    salesHistory = [];
    renderSales();
    renderMobileDaySelector();
    generateSchedule();
    renderStatistics();
  }
}

async function saveSalesHistory() {
  const entry = {
    id: localId(),
    recorded_at: new Date().toISOString(),
    sales: Object.fromEntries(weekDays.map((day) => [day.key, Number(day.sales || 0)])),
    created_at: new Date().toISOString(),
  };

  const response = await apiFetch("/sales", {
    method: "POST",
    body: JSON.stringify({
      sales: entry.sales
    }),
  });
  if (!response.ok) throw new Error(await readApiError(response));
  await loadSalesHistory();
}

async function migrateLocalDataToServer() {
  if (readStorageValue(LOCAL_MIGRATION_KEY) === "true") return;

  const localEmployees = readLocalJson(LOCAL_EMPLOYEES_KEY, []).map(normalizeEmployeeRecord);
  const localSalesHistory = readLocalJson(LOCAL_SALES_KEY, []);
  if (!localEmployees.length && !localSalesHistory.length) {
    writeStorageValue(LOCAL_MIGRATION_KEY, "true");
    return;
  }

  try {
    const currentResponse = await apiFetch("/employees");
    if (!currentResponse.ok) throw new Error(await readApiError(currentResponse));

    const currentEmployees = (await currentResponse.json()).map(normalizeEmployeeRecord);
    const existing = new Set(
      currentEmployees.map((employee) => `${employee.name}|${employee.role}`.toLowerCase()),
    );

    for (const employee of localEmployees) {
      const signature = `${employee.name}|${employee.role}`.toLowerCase();
      if (existing.has(signature)) continue;

      const response = await apiFetch("/employees", {
        method: "POST",
        body: JSON.stringify({
          name: employee.name,
          role: employee.role,
          maxHours: employee.maxHours,
          availability: employee.availability,
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      existing.add(signature);
    }

    for (const week of localSalesHistory) {
      if (!week || !week.sales) continue;
      const response = await apiFetch("/sales", {
        method: "POST",
        body: JSON.stringify({ sales: week.sales }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
    }

    writeStorageValue(LOCAL_MIGRATION_KEY, "true");
  } catch (err) {
    console.error("Erro ao migrar dados locais para Supabase:", err);
  }
}

function salesSuggestions() {
  if (salesHistory.length < 1) return null;

  return Object.fromEntries(
    weekDays.map((day) => {
      const values = salesHistory
        .map((week) => Number(week.sales?.[day.key] || 0))
        .filter((value) => value > 0);
      const average =
        values.length > 0
          ? Math.round(values.reduce((total, value) => total + value, 0) / values.length)
          : day.sales;
      return [day.key, average];
    }),
  );
}

function updateSalesHistoryStatus() {
  const status = document.querySelector("#sales-history-status");
  const applyButton = document.querySelector("#apply-sales-suggestion");
  const weekCount = salesHistory.length;

  if (status) {
    status.textContent =
      weekCount === 0
        ? "Sem histórico"
        : `${weekCount} semana${weekCount > 1 ? "s" : ""} no histórico`;
  }
  if (applyButton) {
    applyButton.disabled = weekCount < 1;
  }
}

function renderSales() {
  const list = document.querySelector("#sales-list");
  if (!list) return;
  const suggestions = salesSuggestions();
  list.innerHTML = "";

  weekDays.forEach((day) => {
    const row = document.createElement("label");
    row.className = "sale-row";
    row.innerHTML = `
      <span>${day.label.slice(0, 3)}</span>
      <input type="number" min="0" step="50" value="${day.sales}" data-sales="${day.key}" />
      <strong class="demand">${demandLabel(day.sales)}</strong>
      <small class="sale-hint">${
        suggestions
          ? `Sugestão pelo histórico: ${suggestions[day.key].toLocaleString("pt-PT")}€`
          : "Registe uma semana completa para ativar sugestão"
      }</small>
    `;
    list.append(row);
  });

  updateSalesHistoryStatus();

  list.oninput = (event) => {
    const input = event.target.closest("[data-sales]");
    if (!input) return;
    const day = weekDays.find((item) => item.key === input.dataset.sales);
    day.sales = Number(input.value || 0);
    const demandEl = input.nextElementSibling;
    if (demandEl) demandEl.textContent = demandLabel(day.sales);
    renderMobileDaySelector();
    generateSchedule();
    renderStatistics();
  };
}

async function registerSalesWeek() {
  try {
    await saveSalesHistory();
    renderSales();
    generateSchedule();
    renderStatistics();
  } catch (err) {
    console.error("Erro ao guardar histórico de vendas:", err);
    alert(`Erro ao guardar vendas: ${err.message}`);
  }
}

function applySalesSuggestion() {
  const suggestions = salesSuggestions();
  if (!suggestions) return;

  weekDays.forEach((day) => {
    day.sales = suggestions[day.key];
  });
  renderSales();
  renderMobileDaySelector();
  generateSchedule();
  renderStatistics();
}

async function loadEmployees() {
  try {
    const response = await apiFetch("/employees");
    if (!response.ok) throw new Error(await readApiError(response));

    const data = await response.json();
    employees = data.map(normalizeEmployeeRecord);
    renderTeam();
    generateSchedule();
    renderStatistics();
  } catch (err) {
    console.error("Erro ao carregar colaboradores:", err);
    employees = [];
    renderTeam();
    generateSchedule();
    renderStatistics();
  }
}

function renderMatrixGrid(currentAvailability = {}) {
  const container = document.querySelector("#availability-matrix-grid");
  if (!container) return;
  const openTime = document.querySelector("#open-time")?.value || "08:30";
  const closeTime = document.querySelector("#close-time")?.value || "23:00";
  container.innerHTML = "";

  weekDays.forEach((day) => {
    const dayData = currentAvailability[day.key];
    let hasDay = false;
    let hasNight = false;
    let intervals = [];

    if (Array.isArray(dayData)) {
      hasDay = dayData.includes("day");
      hasNight = dayData.includes("night");
    } else if (typeof dayData === "object" && dayData !== null) {
      hasDay = (dayData.shifts || []).includes("day");
      hasNight = (dayData.shifts || []).includes("night");
      intervals = getAvailabilityIntervals(dayData).map((interval) => ({
        start: interval.start,
        end: interval.end,
      }));
    }

    if (!intervals.length) intervals = [{ start: "09:00", end: "17:00" }];
    const hasSpecificHours = getAvailabilityIntervals(dayData).length > 0;

    const row = document.createElement("div");
    row.className = "matrix-row";
    row.innerHTML = `
      <span class="matrix-day-name">${day.label}</span>
      <div class="matrix-options">
        <label class="matrix-check">
          <input type="checkbox" name="avail-shift-${day.key}" value="day" ${hasDay ? "checked" : ""}>
          <span>Dia (${escapeHtml(shiftHours("day", openTime, closeTime))})</span>
        </label>
        <label class="matrix-check">
          <input type="checkbox" name="avail-shift-${day.key}" value="night" ${hasNight ? "checked" : ""}>
          <span>Noite (${escapeHtml(shiftHours("night", openTime, closeTime))})</span>
        </label>
        <div class="custom-hours-box">
          <label class="matrix-check custom-toggle">
            <input type="checkbox" name="avail-custom-toggle-${day.key}" value="1" ${hasSpecificHours ? "checked" : ""} data-day-toggle="${day.key}">
            <span>Horários Específicos</span>
          </label>
          <div class="custom-time-inputs ${hasSpecificHours ? '' : 'hidden'}" id="custom-inputs-${day.key}" data-interval-list="${day.key}">
            ${intervals.map((interval, index) => `
              <div class="availability-interval-row">
                <input type="time" name="avail-start-${day.key}" value="${escapeHtml(interval.start)}">
                <span>até</span>
                <input type="time" name="avail-end-${day.key}" value="${escapeHtml(interval.end)}">
                <button class="icon-btn remove-interval" type="button" data-remove-interval="${day.key}" aria-label="Remover horário" ${index === 0 ? "disabled" : ""}>
                  <i data-lucide="trash-2"></i>
                </button>
              </div>
            `).join("")}
            <button class="secondary-action compact-action add-interval" type="button" data-add-interval="${day.key}">
              <i data-lucide="user-plus"></i>
              Adicionar horário
            </button>
          </div>
        </div>
      </div>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll("[data-day-toggle]").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const dayKey = e.target.dataset.dayToggle;
      const inputsBox = container.querySelector(`#custom-inputs-${dayKey}`);
      if (inputsBox) {
        inputsBox.classList.toggle("hidden", !e.target.checked);
      }
    });
  });

  container.querySelectorAll("[data-add-interval]").forEach((button) => {
    button.addEventListener("click", () => {
      const dayKey = button.dataset.addInterval;
      const list = container.querySelector(`[data-interval-list="${dayKey}"]`);
      if (!list) return;
      const [nightStart, nightEnd] = shiftHours("night", openTime, closeTime).split("-");
      const row = document.createElement("div");
      row.className = "availability-interval-row";
      row.innerHTML = `
        <input type="time" name="avail-start-${dayKey}" value="${escapeHtml(nightStart)}">
        <span>até</span>
        <input type="time" name="avail-end-${dayKey}" value="${escapeHtml(nightEnd)}">
        <button class="icon-btn remove-interval" type="button" data-remove-interval="${dayKey}" aria-label="Remover horário">
          <i data-lucide="trash-2"></i>
        </button>
      `;
      list.insertBefore(row, button);
      if (window.lucide) window.lucide.createIcons();
    });
  });

  container.onclick = (event) => {
    const removeButton = event.target.closest("[data-remove-interval]");
    if (!removeButton || removeButton.disabled) return;
    removeButton.closest(".availability-interval-row")?.remove();
  };

  if (window.lucide) window.lucide.createIcons();
}

function openEmployeeModal(employeeToEdit = null) {
  const modal = document.querySelector("#employee-modal");
  const title = document.querySelector("#modal-title");
  const empIdInput = document.querySelector("#emp-id");
  const nameInput = document.querySelector("#emp-name");
  const roleInput = document.querySelector("#emp-role");
  const hoursInput = document.querySelector("#emp-max-hours");

  if (employeeToEdit) {
    title.textContent = "Editar Colaborador";
    empIdInput.value = employeeToEdit.id;
    nameInput.value = employeeToEdit.name;
    roleInput.value = employeeToEdit.role;
    hoursInput.value = employeeToEdit.maxHours;
    renderMatrixGrid(employeeToEdit.availability);
  } else {
    title.textContent = "Adicionar Colaborador";
    empIdInput.value = "";
    nameInput.value = "";
    roleInput.value = "";
    hoursInput.value = 40;
    renderMatrixGrid({
      seg: { shifts: ["day", "night"], custom: false },
      ter: { shifts: ["day", "night"], custom: false },
      qua: { shifts: ["day", "night"], custom: false },
      qui: { shifts: ["day", "night"], custom: false },
      sex: { shifts: ["day", "night"], custom: false },
      sab: { shifts: ["day", "night"], custom: false },
      dom: { shifts: ["day", "night"], custom: false }
    });
  }

  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("open");
  if (window.lucide) window.lucide.createIcons();
}

function closeEmployeeModal() {
  const modal = document.querySelector("#employee-modal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  modal.classList.remove("open");
}

async function handleEmployeeFormSubmit(event) {
  event.preventDefault();
  const id = document.querySelector("#emp-id").value;
  const name = document.querySelector("#emp-name").value.trim();
  const role = document.querySelector("#emp-role").value;
  const maxHours = Number(document.querySelector("#emp-max-hours").value || 40);

  const availability = {};
  weekDays.forEach((day) => {
    const shiftsChecked = Array.from(
      document.querySelectorAll(`input[name="avail-shift-${day.key}"]:checked`)
    ).map((cb) => cb.value);

    const isCustom = document.querySelector(`input[name="avail-custom-toggle-${day.key}"]`)?.checked || false;
    const startInputs = Array.from(document.querySelectorAll(`input[name="avail-start-${day.key}"]`));
    const endInputs = Array.from(document.querySelectorAll(`input[name="avail-end-${day.key}"]`));
    const intervals = startInputs
      .map((input, index) => ({
        start: input.value || "09:00",
        end: endInputs[index]?.value || "17:00",
      }))
      .filter((interval) => interval.start && interval.end);

    availability[day.key] = {
      shifts: shiftsChecked,
      custom: isCustom,
      start: intervals[0]?.start || "09:00",
      end: intervals[0]?.end || "17:00",
      intervals: isCustom ? intervals : []
    };
  });

  const payload = { name, role, maxHours, availability };
  const saveButton = document.querySelector("#modal-save");
  if (saveButton) saveButton.disabled = true;
  try {
    const response = await apiFetch("/employees", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(id ? { ...payload, id } : payload)
    });

    if (!response.ok) throw new Error(await readApiError(response));

    const saved = normalizeEmployeeRecord(await response.json());
    if (id) {
      employees = employees.map((employee) => String(employee.id) === String(id) ? saved : employee);
    } else {
      employees = [...employees, saved];
    }
    closeEmployeeModal();
    renderTeam();
    generateSchedule();
    renderStatistics();
  } catch (err) {
    console.error("Erro ao guardar colaborador:", err);
    alert(`Erro ao guardar colaborador: ${err.message}`);
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

function formatAvailabilityTag(dayData) {
  if (Array.isArray(dayData)) {
    return dayData.map(s => s === "day" ? "Dia" : "Noite").join("/");
  }
  if (typeof dayData === "object" && dayData !== null) {
    const intervals = getAvailabilityIntervals(dayData);
    if (intervals.length) {
      return intervals.map((interval) => `${escapeHtml(interval.start)}-${escapeHtml(interval.end)}`).join(", ");
    }
    if (dayData.shifts && dayData.shifts.length) {
      return dayData.shifts.map(s => s === "day" ? "Dia" : "Noite").join("/");
    }
  }
  return "";
}

function renderTeam() {
  const grid = document.querySelector("#team-grid");
  if (!grid) return;
  grid.innerHTML = "";

  if (employees.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <i data-lucide="users"></i>
        <p>Nenhum colaborador registado.</p>
        <button class="secondary-action compact-action" id="empty-add-emp" type="button">
          <i data-lucide="user-plus"></i> Adicionar Colaborador
        </button>
      </div>
    `;
    const emptyBtn = document.querySelector("#empty-add-emp");
    if (emptyBtn) emptyBtn.onclick = () => openEmployeeModal();
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  employees.forEach((employee) => {
    const card = document.createElement("article");
    card.className = "member-card";
    const availableDays = weekDays
      .map((day) => {
        const tagText = formatAvailabilityTag(employee.availability?.[day.key]);
        if (!tagText) return "";
        return `<span>${escapeHtml(day.label.slice(0, 3))}: ${tagText}</span>`;
      })
      .filter(Boolean)
      .join("");

    const roleBadges = splitRoles(employee.role)
      .map((role) => `<span class="role-badge ${escapeHtml(getRoleBadgeClass(role))}">${escapeHtml(role)}</span>`)
      .join("");

    card.innerHTML = `
      <div class="member-top">
        <div class="member-info">
          <div class="avatar">${escapeHtml(employee.name.slice(0, 1).toUpperCase())}</div>
          <div>
            <strong>${escapeHtml(employee.name)}</strong>
            <div class="role-group">
              ${roleBadges || `<span class="role-badge ${escapeHtml(getRoleBadgeClass(employee.role))}">${escapeHtml(roleLabel(employee.role))}</span>`}
              <small>${escapeHtml(employee.maxHours)}h/sem</small>
            </div>
          </div>
        </div>
        <div class="member-actions">
          <button class="icon-btn edit-member" type="button" data-edit-employee="${escapeHtml(employee.id)}" aria-label="Editar ${escapeHtml(employee.name)}">
            <i data-lucide="pencil"></i>
          </button>
          <button class="icon-btn remove-member" type="button" data-remove-employee="${escapeHtml(employee.id)}" aria-label="Remover ${escapeHtml(employee.name)}">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
      <div class="availability-tags">${availableDays || '<span>Sem disponibilidade configurada</span>'}</div>
    `;
    grid.append(card);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function pickEmployees(dayKey, shift, required, openTime, closeTime) {
  const available = employees
    .filter((employee) => isEmployeeAvailable(employee, dayKey, shift, openTime, closeTime))
    .sort((a, b) => {
      // Priorizar colaboradores com menos horas atribuídas
      const hoursA = assignedHours.get(a.name) || 0;
      const hoursB = assignedHours.get(b.name) || 0;

      // Se um está muito mais perto do limite, dar prioridade ao outro
      const remainingA = a.maxHours - hoursA;
      const remainingB = b.maxHours - hoursB;

      // Primeiro, ordenar por quem tem mais horas disponíveis
      if (remainingA !== remainingB) {
        return remainingB - remainingA;
      }

      // Depois, por quem tem menos horas atribuídas
      return hoursA - hoursB;
    });

  const selected = [];

  for (const employee of available) {
    const currentHours = assignedHours.get(employee.name) || 0;
    const details = getEmployeeShiftDetails(employee, dayKey, shift, openTime, closeTime);
    const duration = details.duration;

    if (currentHours + duration <= employee.maxHours) {
      selected.push({
        ...employee,
        assignedHoursText: details.display,
        assignedDuration: duration,
        assignedStart: details.start,
        assignedEnd: details.end
      });
      assignedHours.set(employee.name, currentHours + duration);
    }
  }

  return selected;
}

function renderMobileDaySelector() {
  const bar = document.querySelector("#mobile-day-selector");
  if (!bar) return;

  bar.innerHTML = "";
  weekDays.forEach((day) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `day-tab ${day.key === selectedDayKey ? "active" : ""}`;
    btn.dataset.day = day.key;
    btn.innerHTML = `
      <span class="day-tab-name">${day.label.slice(0, 3)}</span>
      <span class="day-tab-val">${day.sales ? `${day.sales}€` : "-"}</span>
    `;
    btn.onclick = () => {
      selectedDayKey = day.key;
      renderMobileDaySelector();
      if (currentSchedule) {
        renderCurrentSchedule();
      } else {
        generateSchedule();
      }
    };
    bar.appendChild(btn);
  });
}

function clearSchedule() {
  const grid = document.querySelector("#schedule-grid");
  if (!grid) return;
  grid.innerHTML = "";
  currentSchedule = null;

  const coverageStatusEl = document.querySelector("#coverage-status");
  if (coverageStatusEl) {
    coverageStatusEl.textContent = "Escala limpa";
    coverageStatusEl.className = "status-badge";
  }

  assignedHours.clear();
}

// ============================================
// CONFIGURAÇÃO E PESOS DO ALGORITMO
// ============================================
const SCHEDULE_WEIGHTS = {
  coverage: 100,           // Cobertura mínima
  filledSlots: 50,         // Vagas preenchidas
  fairness: 30,            // Equilíbrio de horas
  dailyCoverage: 25,       // Cobertura diária de 8h
  rarity: 20,              // Preservar colaboradores raros
  unfilledSlots: -100,     // Penalização por vagas vazias
  employeeOverload: -50,   // Penalização por excesso de horas
  unnecessaryMove: -10     // Penalização por movimentos desnecessários
};

const MAX_OPTIMIZATION_ITERATIONS = 50;

// ============================================
// FUNÇÕES AUXILIARES DE VALIDAÇÃO
// ============================================
function validateConfiguration(employees, baseDayRequired, baseNightRequired) {
  const errors = [];

  if (!employees || employees.length === 0) {
    errors.push("Nenhum colaborador disponível");
  }

  if (baseDayRequired < 1 || baseNightRequired < 1) {
    errors.push("Requisito mínimo deve ser pelo menos 1 pessoa por turno");
  }

  employees.forEach(emp => {
    if (emp.maxHours <= 0) {
      errors.push(`Colaborador ${emp.name} tem maxHours inválido: ${emp.maxHours}`);
    }
  });

  return { valid: errors.length === 0, errors };
}

// ============================================
// FUNÇÕES AUXILIARES DE ÍNDICES
// ============================================
function buildAvailabilityIndex(employees, openTime, closeTime) {
  const index = {};

  employees.forEach(emp => {
    index[emp.name] = {
      day: isEmployeeAvailable(emp, "seg", "day", openTime, closeTime) ||
            isEmployeeAvailable(emp, "ter", "day", openTime, closeTime) ||
            isEmployeeAvailable(emp, "qua", "day", openTime, closeTime) ||
            isEmployeeAvailable(emp, "qui", "day", openTime, closeTime) ||
            isEmployeeAvailable(emp, "sex", "day", openTime, closeTime) ||
            isEmployeeAvailable(emp, "sab", "day", openTime, closeTime) ||
            isEmployeeAvailable(emp, "dom", "day", openTime, closeTime),
      night: isEmployeeAvailable(emp, "seg", "night", openTime, closeTime) ||
             isEmployeeAvailable(emp, "ter", "night", openTime, closeTime) ||
             isEmployeeAvailable(emp, "qua", "night", openTime, closeTime) ||
             isEmployeeAvailable(emp, "qui", "night", openTime, closeTime) ||
             isEmployeeAvailable(emp, "sex", "night", openTime, closeTime) ||
             isEmployeeAvailable(emp, "sab", "night", openTime, closeTime) ||
             isEmployeeAvailable(emp, "dom", "night", openTime, closeTime)
    };
  });

  return index;
}

function buildShiftCandidates(employees, openTime, closeTime) {
  const candidates = {};

  weekDays.forEach(day => {
    candidates[day.key] = {
      day: employees.filter(emp => isEmployeeAvailable(emp, day.key, "day", openTime, closeTime)),
      night: employees.filter(emp => isEmployeeAvailable(emp, day.key, "night", openTime, closeTime))
    };
  });

  return candidates;
}

function calculateEmployeeRarity(shiftCandidates) {
  const rarity = {};

  Object.keys(shiftCandidates).forEach(dayKey => {
    shiftCandidates[dayKey].day.forEach(emp => {
      rarity[emp.name] = (rarity[emp.name] || 0) + 1;
    });
    shiftCandidates[dayKey].night.forEach(emp => {
      rarity[emp.name] = (rarity[emp.name] || 0) + 1;
    });
  });

  // Inverter: menor número = mais raro
  Object.keys(rarity).forEach(name => {
    rarity[name] = 1 / rarity[name];
  });

  return rarity;
}

function calculateShiftDifficulty(shiftCandidates, employeeRarity, assignedHours) {
  const difficulty = {};

  Object.keys(shiftCandidates).forEach(dayKey => {
    const dayCandidates = shiftCandidates[dayKey].day;
    const nightCandidates = shiftCandidates[dayKey].night;

    // Calcular dificuldade baseada em:
    // - Número de candidatos
    // - Raridade média dos candidatos
    // - Horas disponíveis dos candidatos

    const dayScore = calculateShiftScore(dayCandidates, employeeRarity, assignedHours);
    const nightScore = calculateShiftScore(nightCandidates, employeeRarity, assignedHours);

    difficulty[`${dayKey}_day`] = dayScore;
    difficulty[`${dayKey}_night`] = nightScore;
  });

  return difficulty;
}

function calculateShiftScore(candidates, employeeRarity, assignedHours) {
  if (candidates.length === 0) return Infinity;

  let totalAvailableHours = 0;
  let totalRarity = 0;

  candidates.forEach(emp => {
    const currentHours = assignedHours.get(emp.name) || 0;
    const availableHours = emp.maxHours - currentHours;
    totalAvailableHours += availableHours;
    totalRarity += employeeRarity[emp.name] || 0;
  });

  const avgAvailableHours = totalAvailableHours / candidates.length;
  const avgRarity = totalRarity / candidates.length;

  // Menor score = mais difícil
  return (candidates.length * 0.5) + (avgAvailableHours * 0.3) + (avgRarity * 0.2);
}

// ============================================
// SISTEMA DE PONTUAÇÃO
// ============================================
function calculateRelativeDeficit(assigned, required) {
  if (required === 0) return 0;
  return (required - assigned) / required;
}

function calculateShiftNeedScore(dayKey, shift, schedule, baseDayRequired, baseNightRequired, shiftCandidates, assignedHours) {
  const currentAssigned = schedule[dayKey][shift].length;
  const required = shift === "day" ? baseDayRequired : baseNightRequired;
  const relativeDeficit = calculateRelativeDeficit(currentAssigned, required);

  // Mais défice = maior necessidade
  let needScore = relativeDeficit * 100;

  // Considerar número de candidatos disponíveis
  const candidates = shiftCandidates[dayKey][shift];
  const candidateCount = candidates.length;

  // Menos candidatos = maior necessidade (turno mais difícil)
  if (candidateCount > 0) {
    needScore += (1 / candidateCount) * 50;
  } else {
    needScore += 1000; // Prioridade máxima se não há candidatos
  }

  // Considerar horas disponíveis dos candidatos
  let totalAvailableHours = 0;
  candidates.forEach(emp => {
    const currentHours = assignedHours.get(emp.name) || 0;
    totalAvailableHours += (emp.maxHours - currentHours);
  });

  if (candidateCount > 0) {
    const avgAvailableHours = totalAvailableHours / candidateCount;
    // Menos horas disponíveis = maior necessidade
    needScore += (1 / (avgAvailableHours + 1)) * 20;
  }

  return needScore;
}

function calculateFutureImpact(employee, dayKey, shift, shiftCandidates, assignedHours, openTime, closeTime) {
  // Calcular quantos turnos alternativos este colaborador pode preencher
  let alternativeShifts = 0;

  weekDays.forEach(day => {
    // Verificar se pode trabalhar em outros turnos além do atual
    if (day.key !== dayKey) {
      const dayAvailable = isEmployeeAvailable(employee, day.key, "day", openTime, closeTime);
      const nightAvailable = isEmployeeAvailable(employee, day.key, "night", openTime, closeTime);

      if (dayAvailable) alternativeShifts++;
      if (nightAvailable) alternativeShifts++;
    }
  });

  // Menos alternativas = maior impacto futuro (mais crítico)
  // Se só pode trabalhar neste turno, impacto é máximo
  if (alternativeShifts === 0) return 100;

  // Se tem muitas alternativas, impacto é menor
  return 1 / alternativeShifts;
}

function calculateAssignmentScore(employee, dayKey, shift, schedule, assignedHours, employeeRarity, shiftDifficulty, shiftNeedScore, shiftCandidates, openTime, closeTime) {
  const currentHours = assignedHours.get(employee.name) || 0;
  const remainingHours = employee.maxHours - currentHours;
  const hoursPercentage = currentHours / employee.maxHours;

  let score = 0;

  // Peso: necessidade do turno (prioridade máxima)
  score += shiftNeedScore * 2;

  // Peso: disponibilidade de horas
  score += (remainingHours / employee.maxHours) * SCHEDULE_WEIGHTS.coverage;

  // Peso: equilíbrio (preferir quem tem menos % de horas usadas)
  score += (1 - hoursPercentage) * SCHEDULE_WEIGHTS.fairness;

  // Peso: raridade (penalizar uso de colaboradores raros se houver alternativas)
  const rarity = employeeRarity[employee.name] || 0;
  score -= rarity * SCHEDULE_WEIGHTS.rarity;

  // NOVO: Peso: impacto futuro (preservar colaboradores críticos)
  const futureImpact = calculateFutureImpact(employee, dayKey, shift, shiftCandidates, assignedHours, openTime, closeTime);
  // Penalizar uso de colaboradores com alto impacto futuro (poucas alternativas)
  score -= futureImpact * SCHEDULE_WEIGHTS.rarity * 2;

  // Peso: dificuldade do turno
  const shiftKey = `${dayKey}_${shift}`;
  const difficulty = shiftDifficulty[shiftKey] || 0;
  score += (1 / (difficulty + 1)) * 10;

  return score;
}

// ============================================
// AVALIAÇÃO GLOBAL DA ESCALA
// ============================================
function evaluateSchedule(schedule, baseDayRequired, baseNightRequired, openTime, closeTime) {
  let score = 0;
  let totalSlots = 0;
  let filledSlots = 0;
  let emptyShifts = 0;
  let totalHours = 0;
  const employeeHours = {};
  const dayCoverage = {};

  weekDays.forEach(day => {
    const dayShift = schedule[day.key].day;
    const nightShift = schedule[day.key].night;

    totalSlots += baseDayRequired + baseNightRequired;
    filledSlots += dayShift.length + nightShift.length;

    if (dayShift.length === 0) emptyShifts++;
    if (nightShift.length === 0) emptyShifts++;

    // Calcular cobertura por dia
    const dayCoverageRatio = dayShift.length / baseDayRequired;
    const nightCoverageRatio = nightShift.length / baseNightRequired;
    dayCoverage[day.key] = {
      day: dayCoverageRatio,
      night: nightCoverageRatio,
      total: (dayShift.length + nightShift.length) / (baseDayRequired + baseNightRequired)
    };

    // Calcular horas por colaborador
    [...dayShift, ...nightShift].forEach(person => {
      const hours = person.assignedDuration || 7;
      totalHours += hours;
      employeeHours[person.name] = (employeeHours[person.name] || 0) + hours;
    });
  });

  // Pontuação por cobertura
  const coveragePercentage = (filledSlots / totalSlots) * 100;
  score += coveragePercentage * SCHEDULE_WEIGHTS.coverage;

  // Penalização por vagas vazias
  const unfilledSlots = totalSlots - filledSlots;
  score += unfilledSlots * SCHEDULE_WEIGHTS.unfilledSlots;

  // NOVA: Penalização por desequilíbrio entre dias
  const coverageValues = Object.values(dayCoverage).map(d => d.total);
  if (coverageValues.length > 0) {
    const avgCoverage = coverageValues.reduce((sum, v) => sum + v, 0) / coverageValues.length;
    const variance = coverageValues.reduce((sum, v) => sum + Math.pow(v - avgCoverage, 2), 0) / coverageValues.length;
    const stdDev = Math.sqrt(variance);
    // Penalização forte por desequilíbrio entre dias
    score -= stdDev * SCHEDULE_WEIGHTS.fairness * 5;
  }

  // Pontuação por equilíbrio de horas dos colaboradores
  const hoursArray = Object.values(employeeHours);
  if (hoursArray.length > 0) {
    const avgHours = totalHours / hoursArray.length;
    const variance = hoursArray.reduce((sum, h) => sum + Math.pow(h - avgHours, 2), 0) / hoursArray.length;
    score -= Math.sqrt(variance) * SCHEDULE_WEIGHTS.fairness;
  }

  // Penalização por turnos sem cobertura
  score += emptyShifts * SCHEDULE_WEIGHTS.unfilledSlots * 2;

  return { score, coveragePercentage, filledSlots, totalSlots, emptyShifts, totalHours, employeeHours, dayCoverage };
}

// ============================================
// CLONAGEM DE ESTADO
// ============================================
function cloneSchedule(schedule) {
  const cloned = {};
  Object.keys(schedule).forEach(dayKey => {
    cloned[dayKey] = {
      day: schedule[dayKey].day.map(p => ({ ...p })),
      night: schedule[dayKey].night.map(p => ({ ...p }))
    };
  });
  return cloned;
}

function cloneAssignedHours(assignedHours) {
  const cloned = new Map();
  assignedHours.forEach((value, key) => {
    cloned.set(key, value);
  });
  return cloned;
}

// ============================================
// VALIDAÇÃO DE INTEGRIDADE
// ============================================
function validateScheduleIntegrity(schedule, assignedHours, employees, openTime, closeTime) {
  const errors = [];
  const warnings = [];

  // Verificar duplicações no mesmo dia
  weekDays.forEach(day => {
    const dayShift = schedule[day.key].day;
    const nightShift = schedule[day.key].night;
    const allNames = [...dayShift, ...nightShift].map(p => p.name);

    const duplicates = allNames.filter((name, index) => allNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      errors.push(`${day.label}: Colaborador duplicado no mesmo dia: ${duplicates.join(", ")}`);
    }
  });

  // Verificar consistência de horas
  const calculatedHours = {};
  weekDays.forEach(day => {
    [...schedule[day.key].day, ...schedule[day.key].night].forEach(person => {
      calculatedHours[person.name] = (calculatedHours[person.name] || 0) + (person.assignedDuration || 7);
    });
  });

  Object.keys(calculatedHours).forEach(name => {
    const assigned = assignedHours.get(name) || 0;
    if (Math.abs(calculatedHours[name] - assigned) > 0.1) {
      errors.push(`Inconsistência de horas para ${name}: escala=${calculatedHours[name]}, assignedHours=${assigned}`);
    }
  });

  // Verificar limites de horas
  Object.keys(calculatedHours).forEach(name => {
    const emp = employees.find(e => e.name === name);
    if (emp && calculatedHours[name] > emp.maxHours) {
      errors.push(`${name} excede maxHours: ${calculatedHours[name]} > ${emp.maxHours}`);
    }
  });

  return { valid: errors.length === 0, errors, warnings };
}

function durationBetweenTimes(start, end) {
  return Math.max(0.5, (normalizeEndMinutes(start, end) - timeToMinutes(start)) / 60);
}

function recalculateAssignedHoursFromSchedule(schedule) {
  assignedHours.clear();
  if (!schedule) return;

  weekDays.forEach((day) => {
    ["day", "night"].forEach((shift) => {
      schedule[day.key][shift].forEach((person) => {
        assignedHours.set(person.name, (assignedHours.get(person.name) || 0) + (person.assignedDuration || 0));
      });
    });
  });
}

// ============================================
// FUNÇÃO PRINCIPAL DE GERAÇÃO DE ESCALA (REFATORADA)
// ============================================
function generateSchedule() {
  const grid = document.querySelector("#schedule-grid");
  if (!grid) return;

  const openTimeInput = document.querySelector("#open-time");
  const closeTimeInput = document.querySelector("#close-time");
  const dayReqInput = document.querySelector("#day-required");
  const nightReqInput = document.querySelector("#night-required");

  const openTime = openTimeInput?.value || "08:30";
  const closeTime = closeTimeInput?.value || "23:00";
  const baseDayRequired = Number(dayReqInput?.value || 3);
  const baseNightRequired = Number(nightReqInput?.value || 3);

  assignedHours.clear();
  grid.innerHTML = "";
  grid.className = `schedule-grid mode-${currentViewMode}`;

  const daysToRender = currentViewMode === "daily"
    ? weekDays.filter(d => d.key === selectedDayKey)
    : weekDays;

  // PASSO 1: Validar configurações
  const configValidation = validateConfiguration(employees, baseDayRequired, baseNightRequired);
  if (!configValidation.valid) {
    grid.innerHTML = `
      <div class="empty-state schedule-empty">
        <i data-lucide="users"></i>
        <p>Adicione colaboradores para gerar a escala.</p>
      </div>
    `;
    const coverageStatusEl = document.querySelector("#coverage-status");
    if (coverageStatusEl) {
      coverageStatusEl.textContent = "Sem colaboradores";
      coverageStatusEl.className = "status-badge warning";
    }
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // PASSO 2: Construir índices
  const shiftCandidates = buildShiftCandidates(employees, openTime, closeTime);
  const employeeRarity = calculateEmployeeRarity(shiftCandidates);
  const shiftDifficulty = calculateShiftDifficulty(shiftCandidates, employeeRarity, assignedHours);

  // PASSO 3: Criar estrutura da escala
  const schedule = {};
  weekDays.forEach(day => {
    schedule[day.key] = { day: [], night: [] };
  });

  // PASSO 4: Atribuir cobertura mínima (1 pessoa por turno) com ordem dinâmica
  // Em vez de ordenar por dificuldade estática, recalculamos necessidade dinamicamente
  let shiftsNeedingCoverage = [];
  weekDays.forEach(day => {
    shiftsNeedingCoverage.push({ dayKey: day.key, shift: "day" });
    shiftsNeedingCoverage.push({ dayKey: day.key, shift: "night" });
  });

  while (shiftsNeedingCoverage.length > 0) {
    // Recalcular necessidade de cada turno
    shiftsNeedingCoverage = shiftsNeedingCoverage.map(({ dayKey, shift }) => ({
      dayKey,
      shift,
      needScore: calculateShiftNeedScore(dayKey, shift, schedule, baseDayRequired, baseNightRequired, shiftCandidates, assignedHours)
    }));

    // Ordenar por necessidade (maior necessidade primeiro)
    shiftsNeedingCoverage.sort((a, b) => b.needScore - a.needScore);

    // Processar o turno mais necessário
    const { dayKey, shift } = shiftsNeedingCoverage.shift();

    if (schedule[dayKey][shift].length > 0) continue; // Já tem alguém

    const candidates = shiftCandidates[dayKey][shift];
    for (const employee of candidates) {
      const currentHours = assignedHours.get(employee.name) || 0;
      const details = getEmployeeShiftDetails(employee, dayKey, shift, openTime, closeTime);
      const duration = details.duration;

      // HARD CONSTRAINT: Não pode trabalhar dia e noite no mesmo dia
      const alreadyAssignedInDay = [...schedule[dayKey].day, ...schedule[dayKey].night].some(p => p.name === employee.name);

      // HARD CONSTRAINT: Não pode exceder maxHours
      if (!alreadyAssignedInDay && currentHours + duration <= employee.maxHours) {
        schedule[dayKey][shift].push({
          ...employee,
          assignedHoursText: details.display,
          assignedDuration: duration,
          assignedStart: details.start,
          assignedEnd: details.end
        });
        assignedHours.set(employee.name, currentHours + duration);
        break;
      }
    }
  }

  // PASSO 6: Preencher vagas restantes com ordem dinâmica baseada em necessidade
  let totalRemainingSlots = 0;
  weekDays.forEach(day => {
    const dayRequired = baseDayRequired;
    const nightRequired = baseNightRequired;
    const currentDayCount = schedule[day.key].day.length;
    const currentNightCount = schedule[day.key].night.length;
    totalRemainingSlots += Math.max(0, dayRequired - currentDayCount) + Math.max(0, nightRequired - currentNightCount);
  });

  // Enquanto houver vagas restantes
  while (totalRemainingSlots > 0) {
    // Calcular necessidade de todos os turnos
    let allShifts = [];
    weekDays.forEach(day => {
      const dayRequired = baseDayRequired;
      const nightRequired = baseNightRequired;
      const currentDayCount = schedule[day.key].day.length;
      const currentNightCount = schedule[day.key].night.length;

      if (currentDayCount < dayRequired) {
        allShifts.push({ dayKey: day.key, shift: "day" });
      }
      if (currentNightCount < nightRequired) {
        allShifts.push({ dayKey: day.key, shift: "night" });
      }
    });

    // Recalcular necessidade e ordenar
    allShifts = allShifts.map(({ dayKey, shift }) => ({
      dayKey,
      shift,
      needScore: calculateShiftNeedScore(dayKey, shift, schedule, baseDayRequired, baseNightRequired, shiftCandidates, assignedHours)
    })).sort((a, b) => b.needScore - a.needScore);

    if (allShifts.length === 0) break; // Não há mais vagas para preencher

    // Processar o turno mais necessário
    const { dayKey, shift } = allShifts[0];
    const required = shift === "day" ? baseDayRequired : baseNightRequired;
    const currentCount = schedule[dayKey][shift].length;

    if (currentCount >= required) {
      totalRemainingSlots--;
      continue;
    }

    const candidates = shiftCandidates[dayKey][shift];
    const shiftNeedScore = calculateShiftNeedScore(dayKey, shift, schedule, baseDayRequired, baseNightRequired, shiftCandidates, assignedHours);

    const scoredCandidates = candidates.map(emp => ({
      emp,
      score: calculateAssignmentScore(emp, dayKey, shift, schedule, assignedHours, employeeRarity, shiftDifficulty, shiftNeedScore, shiftCandidates, openTime, closeTime)
    })).sort((a, b) => b.score - a.score);

    for (const { emp } of scoredCandidates) {
      const currentHours = assignedHours.get(emp.name) || 0;
      const details = getEmployeeShiftDetails(emp, dayKey, shift, openTime, closeTime);
      const duration = details.duration;

      const alreadyAssignedInDay = [...schedule[dayKey].day, ...schedule[dayKey].night].some(p => p.name === emp.name);

      if (!alreadyAssignedInDay && currentHours + duration <= emp.maxHours) {
        schedule[dayKey][shift].push({
          ...emp,
          assignedHoursText: details.display,
          assignedDuration: duration,
          assignedStart: details.start,
          assignedEnd: details.end
        });
        assignedHours.set(emp.name, currentHours + duration);
        totalRemainingSlots--;
        break;
      }
    }

    // Se não conseguiu preencher, decrementar para evitar loop infinito
    totalRemainingSlots--;
  }

  // PASSO 7: Otimização controlada (com limite de iterações)
  let iteration = 0;
  let improved = true;
  while (improved && iteration < MAX_OPTIMIZATION_ITERATIONS) {
    improved = false;
    iteration++;

    const currentScore = evaluateSchedule(schedule, baseDayRequired, baseNightRequired, openTime, closeTime);

    // Tentar balancear turnos com excesso para turnos com déficit
    weekDays.forEach(day => {
      const dayShift = schedule[day.key].day;
      const nightShift = schedule[day.key].night;

      if (dayShift.length >= 3 || nightShift.length >= 3) {
        for (const targetDay of weekDays) {
          if (targetDay.key === day.key) continue;

          const targetDayShift = schedule[targetDay.key].day;
          const targetNightShift = schedule[targetDay.key].night;

          // Balancear dia
          if (dayShift.length >= 3 && targetDayShift.length === 1) {
            for (const person of dayShift) {
              const isAvailable = isEmployeeAvailable(person, targetDay.key, "day", openTime, closeTime);
              const alreadyInTarget = targetDayShift.some(p => p.name === person.name);

              if (isAvailable && !alreadyInTarget) {
                const candidateSchedule = cloneSchedule(schedule);
                const candidateHours = cloneAssignedHours(assignedHours);

                // Simular movimento
                const idx = candidateSchedule[day.key].day.findIndex(p => p.name === person.name);
                if (idx !== -1) {
                  candidateSchedule[day.key].day.splice(idx, 1);
                  const currentHours = candidateHours.get(person.name) || 0;
                  candidateHours.set(person.name, currentHours - person.assignedDuration);

                  const details = getEmployeeShiftDetails(person, targetDay.key, "day", openTime, closeTime);
                  if (currentHours - person.assignedDuration + details.duration <= person.maxHours) {
                    candidateSchedule[targetDay.key].day.push({
                      ...person,
                      assignedHoursText: details.display,
                      assignedDuration: details.duration,
                      assignedStart: details.start,
                      assignedEnd: details.end
                    });
                    candidateHours.set(person.name, currentHours - person.assignedDuration + details.duration);

                    // Avaliar nova escala
                    const newScore = evaluateSchedule(candidateSchedule, baseDayRequired, baseNightRequired, openTime, closeTime);
                    if (newScore.score > currentScore.score) {
                      schedule[day.key].day.splice(idx, 1);
                      assignedHours.set(person.name, currentHours - person.assignedDuration);
                      schedule[targetDay.key].day.push({
                        ...person,
                        assignedHoursText: details.display,
                        assignedDuration: details.duration,
                        assignedStart: details.start,
                        assignedEnd: details.end
                      });
                      assignedHours.set(person.name, currentHours - person.assignedDuration + details.duration);
                      improved = true;
                      break;
                    }
                  }
                }
              }
              if (improved) break;
            }
          }

          // Balancear noite
          if (!improved && nightShift.length >= 3 && targetNightShift.length === 1) {
            for (const person of nightShift) {
              const isAvailable = isEmployeeAvailable(person, targetDay.key, "night", openTime, closeTime);
              const alreadyInTarget = targetNightShift.some(p => p.name === person.name);

              if (isAvailable && !alreadyInTarget) {
                const candidateSchedule = cloneSchedule(schedule);
                const candidateHours = cloneAssignedHours(assignedHours);

                const idx = candidateSchedule[day.key].night.findIndex(p => p.name === person.name);
                if (idx !== -1) {
                  candidateSchedule[day.key].night.splice(idx, 1);
                  const currentHours = candidateHours.get(person.name) || 0;
                  candidateHours.set(person.name, currentHours - person.assignedDuration);

                  const details = getEmployeeShiftDetails(person, targetDay.key, "night", openTime, closeTime);
                  if (currentHours - person.assignedDuration + details.duration <= person.maxHours) {
                    candidateSchedule[targetDay.key].night.push({
                      ...person,
                      assignedHoursText: details.display,
                      assignedDuration: details.duration,
                      assignedStart: details.start,
                      assignedEnd: details.end
                    });
                    candidateHours.set(person.name, currentHours - person.assignedDuration + details.duration);

                    const newScore = evaluateSchedule(candidateSchedule, baseDayRequired, baseNightRequired, openTime, closeTime);
                    if (newScore.score > currentScore.score) {
                      schedule[day.key].night.splice(idx, 1);
                      assignedHours.set(person.name, currentHours - person.assignedDuration);
                      schedule[targetDay.key].night.push({
                        ...person,
                        assignedHoursText: details.display,
                        assignedDuration: details.duration,
                        assignedStart: details.start,
                        assignedEnd: details.end
                      });
                      assignedHours.set(person.name, currentHours - person.assignedDuration + details.duration);
                      improved = true;
                      break;
                    }
                  }
                }
              }
              if (improved) break;
            }
          }
          if (improved) break;
        }
      }
    });
  }

  // PASSO 8: Validar integridade
  const integrityCheck = validateScheduleIntegrity(schedule, assignedHours, employees, openTime, closeTime);
  if (!integrityCheck.valid) {
    console.error("Erro de integridade:", integrityCheck.errors);
  }

  // PASSO 9: Renderizar a escala
  currentSchedule = schedule;
  let totalAssigned = 0;
  let conflicts = 0;
  let totalRequired = (baseDayRequired + baseNightRequired) * 7;

  weekDays.forEach((day) => {
    const dayPeople = schedule[day.key].day;
    const nightPeople = schedule[day.key].night;

    totalAssigned += (dayPeople.length + nightPeople.length);
    conflicts += Math.max(0, baseDayRequired - dayPeople.length);
    conflicts += Math.max(0, baseNightRequired - nightPeople.length);

    if (daysToRender.some(d => d.key === day.key)) {
      const column = document.createElement("article");
      column.className = `day-column ${day.key === selectedDayKey ? "selected" : ""}`;
      const salesDemand = demandLabel(day.sales);

      column.innerHTML = `
        <div class="day-head">
          <div class="day-head-main">
            <strong>${escapeHtml(day.label)}</strong>
            <span class="demand-pill ${salesDemand.toLowerCase()}">${salesDemand}</span>
          </div>
          <span class="day-sales-sub">${day.sales.toLocaleString("pt-PT")}€ previstos</span>
        </div>
        ${renderShift(day.key, "day", "Dia", shiftHours("day", openTime, closeTime), dayPeople, baseDayRequired)}
        ${renderShift(day.key, "night", "Noite", shiftHours("night", openTime, closeTime), nightPeople, baseNightRequired)}
      `;
      grid.append(column);
    }
  });

  // PASSO 10: Atualizar status de cobertura
  const coverageStatusEl = document.querySelector("#coverage-status");
  if (coverageStatusEl) {
    const emptyShifts = [];
    weekDays.forEach((day) => {
      if (schedule[day.key].day.length === 0) {
        emptyShifts.push(`${day.label} (manhã)`);
      }
      if (schedule[day.key].night.length === 0) {
        emptyShifts.push(`${day.label} (noite)`);
      }
    });

    if (emptyShifts.length === 0 && conflicts === 0) {
      coverageStatusEl.textContent = "Cobertura Completa";
      coverageStatusEl.className = "status-badge success";
    } else if (emptyShifts.length > 0) {
      coverageStatusEl.textContent = `Sem cobertura em: ${emptyShifts.join(", ")}`;
      coverageStatusEl.className = "status-badge error";
    } else {
      coverageStatusEl.textContent = `Não foi possível preencher ${conflicts} vaga${conflicts > 1 ? "s" : ""} - Distribuição otimizada`;
      coverageStatusEl.className = "status-badge warning";
    }
  }
}

function getInitials(name) {
  if (!name) return "";
  const parts = name.trim().split(" ");
  if (parts.length === 1) {
    return parts[0].slice(0, 3).toUpperCase();
  }
  return parts.map(part => part.slice(0, 1).toUpperCase()).join("");
}

function renderCurrentSchedule() {
  const grid = document.querySelector("#schedule-grid");
  if (!grid || !currentSchedule) return;

  const openTime = document.querySelector("#open-time")?.value || "08:30";
  const closeTime = document.querySelector("#close-time")?.value || "23:00";
  const baseDayRequired = Number(document.querySelector("#day-required")?.value || 3);
  const baseNightRequired = Number(document.querySelector("#night-required")?.value || 3);
  const daysToRender = currentViewMode === "daily"
    ? weekDays.filter((day) => day.key === selectedDayKey)
    : weekDays;

  grid.innerHTML = "";
  grid.className = `schedule-grid mode-${currentViewMode}`;

  weekDays.forEach((day) => {
    const dayPeople = currentSchedule[day.key].day;
    const nightPeople = currentSchedule[day.key].night;

    if (daysToRender.some((item) => item.key === day.key)) {
      const column = document.createElement("article");
      column.className = `day-column ${day.key === selectedDayKey ? "selected" : ""}`;
      const salesDemand = demandLabel(day.sales);

      column.innerHTML = `
        <div class="day-head">
          <div class="day-head-main">
            <strong>${escapeHtml(day.label)}</strong>
            <span class="demand-pill ${salesDemand.toLowerCase()}">${salesDemand}</span>
          </div>
          <span class="day-sales-sub">${day.sales.toLocaleString("pt-PT")}€ previstos</span>
        </div>
        ${renderShift(day.key, "day", "Dia", shiftHours("day", openTime, closeTime), dayPeople, baseDayRequired)}
        ${renderShift(day.key, "night", "Noite", shiftHours("night", openTime, closeTime), nightPeople, baseNightRequired)}
      `;
      grid.append(column);
    }
  });

  if (window.lucide) window.lucide.createIcons();
}

function renderShift(dayKey, shiftKey, name, hours, people, required) {
  const isWeekly = currentViewMode === "weekly";
  const chips = people
    .map((person) => {
      const roles = splitRoles(person.role);
      const roleBadges = roles
        .map((role) => `<span class="chip-role ${escapeHtml(getRoleBadgeClass(role))}">${escapeHtml(role)}</span>`)
        .join("");
      const hoursText = person.assignedHoursText || hours;
      const displayName = isWeekly ? getInitials(person.name) : person.name;
      const [fallbackStart, fallbackEnd] = hoursText.split("-");
      const start = person.assignedStart || fallbackStart || "";
      const end = person.assignedEnd || fallbackEnd || "";
      return `
          <div class="person-chip" title="${escapeHtml(person.name)} (${escapeHtml(roleLabel(person.role))}) · ${escapeHtml(hoursText)}">
          <div class="chip-main-row">
            <span class="chip-avatar">${escapeHtml(person.name.slice(0, 1).toUpperCase())}</span>
            <span class="chip-name">${escapeHtml(displayName)}</span>
            <span class="chip-roles">${roleBadges || `<span class="chip-role ${escapeHtml(getRoleBadgeClass(person.role))}">${escapeHtml(roleLabel(person.role))}</span>`}</span>
          </div>
          <div class="chip-edit-hours">
            <input type="time" value="${escapeHtml(start)}" data-schedule-start="${escapeHtml(person.id)}" data-day="${escapeHtml(dayKey)}" data-shift="${escapeHtml(shiftKey)}" aria-label="Entrada de ${escapeHtml(person.name)}">
            <span>até</span>
            <input type="time" value="${escapeHtml(end)}" data-schedule-end="${escapeHtml(person.id)}" data-day="${escapeHtml(dayKey)}" data-shift="${escapeHtml(shiftKey)}" aria-label="Saída de ${escapeHtml(person.name)}">
          </div>
          <div class="chip-hours-badge">${escapeHtml(hoursText)} · ${(person.assignedDuration || durationBetweenTimes(start, end)).toFixed(1)}h</div>
        </div>
      `;
    })
    .join("");

  const missing = Array.from({ length: Math.max(0, required - people.length) })
    .map(() => `<div class="person-chip missing"><i data-lucide="user-minus"></i> Por preencher</div>`)
    .join("");

  return `
    <div class="shift">
      <div class="shift-title">
        <span class="shift-name-tag">${escapeHtml(name)}</span>
        <span class="shift-meta-tag">${escapeHtml(hours)} · ${people.length}/${required}</span>
      </div>
      <div class="shift-chips-list">
        ${chips}${missing}
      </div>
    </div>
  `;
}

// Render Statistics Dashboard Page
function renderStatistics() {
  const openTime = document.querySelector("#open-time")?.value || "08:30";
  const closeTime = document.querySelector("#close-time")?.value || "23:00";
  const dayReq = Number(document.querySelector("#day-required")?.value || 3);
  const nightReq = Number(document.querySelector("#night-required")?.value || 3);

  let conflicts = 0;
  let totalRequired = (dayReq + nightReq) * 7;
  let totalAssigned = 0;
  let totalAvailableSlots = 0;
  const roleHoursMap = {};

  // Recalculate full week assignment and role hours
  assignedHours.clear();

  weekDays.forEach((day) => {
    const dayPeople = pickEmployees(day.key, "day", dayReq, openTime, closeTime);
    const nightPeople = pickEmployees(day.key, "night", nightReq, openTime, closeTime);

    totalAssigned += (dayPeople.length + nightPeople.length);
    conflicts += Math.max(0, dayReq - dayPeople.length);
    conflicts += Math.max(0, nightReq - nightPeople.length);

    [...dayPeople, ...nightPeople].forEach((person) => {
      const roles = splitRoles(person.role);
      const roleHours = (person.assignedDuration || 7) / Math.max(1, roles.length);
      (roles.length ? roles : ["Sem cargo"]).forEach((role) => {
        roleHoursMap[role] = (roleHoursMap[role] || 0) + roleHours;
      });
    });

    employees.forEach((emp) => {
      if (isEmployeeAvailable(emp, day.key, "day", openTime, closeTime)) totalAvailableSlots++;
      if (isEmployeeAvailable(emp, day.key, "night", openTime, closeTime)) totalAvailableSlots++;
    });
  });

  // Calculate ratio
  const ratio = totalRequired > 0 ? Math.min(100, Math.round((totalAvailableSlots / totalRequired) * 100)) : 0;
  const avgSales = Math.round(weekDays.reduce((acc, d) => acc + (d.sales || 0), 0) / weekDays.length);

  // Set metric text content
  const availabilityEl = document.querySelector("#stat-availability");
  if (availabilityEl) availabilityEl.textContent = `${ratio}%`;

  const salesEl = document.querySelector("#stat-sales-avg");
  if (salesEl) salesEl.textContent = `€${avgSales.toLocaleString("pt-PT")}`;

  const coverageEl = document.querySelector("#stat-coverage");
  if (coverageEl) coverageEl.textContent = `${totalAssigned}/${totalRequired}`;

  const teamEl = document.querySelector("#stat-team-count");
  if (teamEl) teamEl.textContent = `${employees.length}`;

  const conflictsEl = document.querySelector("#stat-conflicts");
  if (conflictsEl) conflictsEl.textContent = `${conflicts}`;

  const hoursEl = document.querySelector("#stat-hours");
  if (hoursEl) hoursEl.textContent = `${openTime}-${closeTime}`;

  // Render role hours list with progress bars
  const roleList = document.querySelector("#role-hours-list");
  if (roleList) {
    roleList.innerHTML = "";
    const totalRoleHours = Object.values(roleHoursMap).reduce((a, b) => a + b, 0) || 1;

    Object.entries(roleHoursMap).forEach(([role, hours]) => {
      const pct = Math.round((hours / totalRoleHours) * 100);
      const badge = getRoleBadgeClass(role);
      const row = document.createElement("div");
      row.className = "role-stat-row";
      row.innerHTML = `
        <div class="role-stat-info">
          <span class="role-badge ${escapeHtml(badge)}">${escapeHtml(role)}</span>
          <strong>${hours.toFixed(1)}h (${pct}%)</strong>
        </div>
        <div class="role-stat-bar-bg">
          <div class="role-stat-bar-fill" style="width: ${pct}%;"></div>
        </div>
      `;
      roleList.appendChild(row);
    });
  }
}

function handleScheduleTimeEdit(event) {
  const input = event.target.closest("[data-schedule-start], [data-schedule-end]");
  if (!input || !currentSchedule) return;

  const dayKey = input.dataset.day;
  const shiftKey = input.dataset.shift;
  const employeeId = input.dataset.scheduleStart || input.dataset.scheduleEnd;
  const person = currentSchedule[dayKey]?.[shiftKey]?.find((item) => String(item.id) === String(employeeId));
  if (!person) return;

  const chip = input.closest(".person-chip");
  const startInput = chip?.querySelector("[data-schedule-start]");
  const endInput = chip?.querySelector("[data-schedule-end]");
  const start = startInput?.value || person.assignedStart || "09:00";
  const end = endInput?.value || person.assignedEnd || "17:00";
  const duration = durationBetweenTimes(start, end);

  person.assignedStart = start;
  person.assignedEnd = end;
  person.assignedDuration = duration;
  person.assignedHoursText = `${start}-${end}`;
  recalculateAssignedHoursFromSchedule(currentSchedule);

  const badge = chip?.querySelector(".chip-hours-badge");
  if (badge) badge.textContent = `${person.assignedHoursText} · ${duration.toFixed(1)}h`;
}

// View Mode Toggle Handler
document.querySelectorAll("#view-mode-toggle .view-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#view-mode-toggle .view-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentViewMode = btn.dataset.view;

    const selectorBar = document.querySelector("#mobile-day-selector");
    if (selectorBar) {
      selectorBar.style.display = currentViewMode === "daily" ? "flex" : "none";
    }

    if (currentSchedule) {
      renderCurrentSchedule();
    } else {
      generateSchedule();
    }
  });
});

// Dock Navigation Click Handler
document.querySelectorAll(".dock-item").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const page = link.dataset.page || link.getAttribute("href");
    switchPage(page);
  });
});

// Event Listeners Setup
document.querySelector("#generate-schedule")?.addEventListener("click", generateSchedule);
document.querySelector("#clear-schedule")?.addEventListener("click", clearSchedule);
document.querySelector("#add-employee")?.addEventListener("click", () => openEmployeeModal());
document.querySelector("#save-sales-week")?.addEventListener("click", registerSalesWeek);
document.querySelector("#apply-sales-suggestion")?.addEventListener("click", applySalesSuggestion);
document.querySelector("#login-form")?.addEventListener("submit", handleLogin);
document.querySelector("#logout-button")?.addEventListener("click", logout);

document.querySelector("#modal-close")?.addEventListener("click", closeEmployeeModal);
document.querySelector("#modal-cancel")?.addEventListener("click", closeEmployeeModal);
document.querySelector("#employee-form")?.addEventListener("submit", handleEmployeeFormSubmit);
document.querySelector("#schedule-grid")?.addEventListener("input", handleScheduleTimeEdit);

// Rule input changes update schedule & stats in real time
document.querySelector("#open-time")?.addEventListener("input", () => { generateSchedule(); renderStatistics(); });
document.querySelector("#close-time")?.addEventListener("input", () => { generateSchedule(); renderStatistics(); });
document.querySelector("#day-required")?.addEventListener("input", () => { generateSchedule(); renderStatistics(); });
document.querySelector("#night-required")?.addEventListener("input", () => { generateSchedule(); renderStatistics(); });

document.querySelector("#team-grid")?.addEventListener("click", async (event) => {
  const removeBtn = event.target.closest("[data-remove-employee]");
  if (removeBtn) {
    const id = removeBtn.dataset.removeEmployee;
    const employee = employees.find(e => String(e.id) === String(id));
    if (!employee) return;

    if (confirm(`Tem a certeza que deseja remover ${employee.name}?`)) {
      try {
        const response = await apiFetch(`/employees?id=${encodeURIComponent(employee.id)}`, { method: "DELETE" });
        if (!response.ok) throw new Error(await readApiError(response));
        await loadEmployees();
      } catch (err) {
        console.error("Erro ao remover colaborador:", err);
        alert(`Erro ao remover colaborador: ${err.message}`);
      }
    }
    return;
  }

  const editBtn = event.target.closest("[data-edit-employee]");
  if (editBtn) {
    const id = editBtn.dataset.editEmployee;
    const employee = employees.find(e => String(e.id) === String(id));
    if (employee) {
      openEmployeeModal(employee);
    }
  }
});

// App Initialization
(async function init() {
  const hash = window.location.hash.replace("#", "");
  if (hash) {
    switchPage(hash);
  } else {
    switchPage("escala");
  }

  const selectorBar = document.querySelector("#mobile-day-selector");
  if (selectorBar) {
    selectorBar.style.display = currentViewMode === "daily" ? "flex" : "none";
  }

  renderSales();
  renderTeam();
  renderMobileDaySelector();
  generateSchedule();
  if (await updateAuthView()) {
    await migrateLocalDataToServer();
    await loadEmployees();
    await loadSalesHistory();
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
})();
