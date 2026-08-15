const supabaseUrl = 'https://zebcriljgnwvlpgygrib.supabase.co';
const supabaseKey = 'sb_publishable_UFL7ezhY0JNI0piyKqBg1w_sBajjfJS';
const supabaseClient = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

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
const assignedHours = new Map();
const sessionKey = "rellenoShiftsSession";
const API_BASE = "/api";
let authToken = localStorage.getItem(sessionKey);

// State for mobile view and active day
let currentViewMode = window.innerWidth <= 760 ? "daily" : "weekly";
let selectedDayKey = "seg";

async function getSessionToken() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  return data?.session?.access_token || null;
}

async function isLoggedIn() {
  const token = await getSessionToken();
  return !!token;
}

async function updateAuthView() {
  const loggedIn = await isLoggedIn();
  document.body.classList.toggle("locked", !loggedIn);
  if (loggedIn) {
    authToken = await getSessionToken();
    if (authToken) localStorage.setItem(sessionKey, authToken);
  }
}

async function apiFetch(endpoint, options = {}) {
  if (!authToken) authToken = await getSessionToken();
  const headers = {
    "Content-Type": "application/json",
    ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {})
  };
  return fetch(`${API_BASE}${endpoint}`, { ...options, headers });
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.querySelector("#login-email").value.trim().toLowerCase();
  const password = document.querySelector("#login-password").value;
  const error = document.querySelector("#login-error");

  if (!supabaseClient) {
    error.textContent = "Erro de inicialização do Supabase.";
    return;
  }

  const { data, error: authError } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    error.textContent = "Email ou password inválidos.";
    return;
  }

  authToken = data.session.access_token;
  localStorage.setItem(sessionKey, data.session.access_token);
  error.textContent = "";
  await updateAuthView();
  await loadEmployees();
  await loadSalesHistory();
}

async function logout() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  authToken = null;
  localStorage.removeItem(sessionKey);
  await updateAuthView();
}

function demandLabel(value) {
  if (value >= 2100) return "Alta";
  if (value >= 1300) return "Média";
  if (value > 0) return "Baixa";
  return "Sem dados";
}

function shiftHours(shift, openTime, closeTime) {
  return shift === "day" ? `${openTime}-16:00` : `16:00-${closeTime}`;
}

function getRoleBadgeClass(role) {
  const r = (role || "").toLowerCase();
  if (r.includes("sala")) return "badge-sala";
  if (r.includes("cozinha")) return "badge-cozinha";
  if (r.includes("bar")) return "badge-bar";
  if (r.includes("caixa")) return "badge-caixa";
  return "badge-apoio";
}

// Convert HH:MM string to minutes from midnight
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Get exact duration in hours and display string for an employee's shift on a given day
function getEmployeeShiftDetails(employee, dayKey, shift, openTime = "08:30", closeTime = "23:00") {
  const avail = employee.availability?.[dayKey];
  const openMins = timeToMinutes(openTime);
  const closeMins = timeToMinutes(closeTime);
  const shiftStartMins = shift === "day" ? openMins : timeToMinutes("16:00");
  const shiftEndMins = shift === "day" ? timeToMinutes("16:00") : closeMins;
  const defaultDuration = Math.max(0.5, (shiftEndMins - shiftStartMins) / 60);

  if (!avail) {
    return { duration: defaultDuration, display: shiftHours(shift, openTime, closeTime) };
  }

  // Legacy format: array of shift names
  if (Array.isArray(avail)) {
    return { duration: defaultDuration, display: shiftHours(shift, openTime, closeTime) };
  }

  // Object format with custom hours
  if (typeof avail === "object" && avail !== null) {
    if (avail.custom && avail.start && avail.end) {
      const customStartMins = timeToMinutes(avail.start);
      const customEndMins = timeToMinutes(avail.end);
      const duration = Math.max(0.5, (customEndMins - customStartMins) / 60);
      return { duration, display: `${avail.start}-${avail.end}` };
    }
  }

  return { duration: defaultDuration, display: shiftHours(shift, openTime, closeTime) };
}

// Check if employee is available for a shift
function isEmployeeAvailable(employee, dayKey, shift, openTime = "08:30", closeTime = "23:00") {
  const avail = employee.availability?.[dayKey];
  if (!avail) return false;

  // Legacy format: array of strings ["day", "night"]
  if (Array.isArray(avail)) {
    return avail.includes(shift);
  }

  // Object format
  if (typeof avail === "object") {
    if (avail.shifts && avail.shifts.includes(shift)) {
      return true;
    }

    if (avail.custom && avail.start && avail.end) {
      const customStart = timeToMinutes(avail.start);
      const customEnd = timeToMinutes(avail.end);
      const shiftStart = shift === "day" ? timeToMinutes(openTime) : timeToMinutes("16:00");
      const shiftEnd = shift === "day" ? timeToMinutes("16:00") : timeToMinutes(closeTime);

      return customStart < shiftEnd && customEnd > shiftStart;
    }
  }

  return false;
}

async function loadSalesHistory() {
  try {
    const response = await apiFetch("/sales");
    if (response.ok) {
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
    }
  } catch (err) {
    console.error("Failed to load sales history:", err);
  }
}

async function saveSalesHistory() {
  try {
    const response = await apiFetch("/sales", {
      method: "POST",
      body: JSON.stringify({
        sales: Object.fromEntries(weekDays.map((day) => [day.key, Number(day.sales || 0)]))
      }),
    });
    if (response.ok) {
      await loadSalesHistory();
    }
  } catch (err) {
    console.error("Failed to save sales history:", err);
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
          : "Regista uma semana completa para ativar sugestão"
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
  };
}

async function registerSalesWeek() {
  await saveSalesHistory();
  renderSales();
  generateSchedule();
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
}

function toggleSalesPanel() {
  const panel = document.querySelector("#sales");
  const expanded = panel.classList.toggle("sales-collapsed") === false;
  document.querySelector("#sales-toggle").setAttribute("aria-expanded", String(expanded));
}

async function loadEmployees() {
  try {
    const response = await apiFetch("/employees");
    if (response.ok) {
      const data = await response.json();
      employees = data.map((emp) => ({
        id: emp.id,
        name: emp.name,
        role: emp.role,
        maxHours: emp.max_hours || emp.maxHours || 40,
        availability: emp.availability || {}
      }));
      renderTeam();
      generateSchedule();
    }
  } catch (err) {
    console.error("Failed to load employees:", err);
  }
}

function renderMatrixGrid(currentAvailability = {}) {
  const container = document.querySelector("#availability-matrix-grid");
  if (!container) return;
  container.innerHTML = "";

  weekDays.forEach((day) => {
    const dayData = currentAvailability[day.key];
    let hasDay = false;
    let hasNight = false;
    let isCustom = false;
    let customStart = "09:00";
    let customEnd = "17:00";

    if (Array.isArray(dayData)) {
      hasDay = dayData.includes("day");
      hasNight = dayData.includes("night");
    } else if (typeof dayData === "object" && dayData !== null) {
      hasDay = (dayData.shifts || []).includes("day");
      hasNight = (dayData.shifts || []).includes("night");
      isCustom = !!dayData.custom;
      if (dayData.start) customStart = dayData.start;
      if (dayData.end) customEnd = dayData.end;
    }

    const row = document.createElement("div");
    row.className = "matrix-row";
    row.innerHTML = `
      <span class="matrix-day-name">${day.label}</span>
      <div class="matrix-options">
        <label class="matrix-check">
          <input type="checkbox" name="avail-shift-${day.key}" value="day" ${hasDay ? "checked" : ""}>
          <span>Dia (08:30-16:00)</span>
        </label>
        <label class="matrix-check">
          <input type="checkbox" name="avail-shift-${day.key}" value="night" ${hasNight ? "checked" : ""}>
          <span>Noite (16:00-23:00)</span>
        </label>
        <div class="custom-hours-box">
          <label class="matrix-check custom-toggle">
            <input type="checkbox" name="avail-custom-toggle-${day.key}" value="1" ${isCustom ? "checked" : ""} data-day-toggle="${day.key}">
            <span>Horário Específico</span>
          </label>
          <div class="custom-time-inputs ${isCustom ? '' : 'hidden'}" id="custom-inputs-${day.key}">
            <input type="time" name="avail-start-${day.key}" value="${customStart}">
            <span>até</span>
            <input type="time" name="avail-end-${day.key}" value="${customEnd}">
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
    roleInput.value = "Sala";
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
    const startVal = document.querySelector(`input[name="avail-start-${day.key}"]`)?.value || "09:00";
    const endVal = document.querySelector(`input[name="avail-end-${day.key}"]`)?.value || "17:00";

    availability[day.key] = {
      shifts: shiftsChecked,
      custom: isCustom,
      start: startVal,
      end: endVal
    };
  });

  const payload = { name, role, maxHours, availability };

  try {
    let response;
    if (id) {
      payload.id = id;
      response = await apiFetch("/employees", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    } else {
      response = await apiFetch("/employees", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }

    if (response.ok) {
      closeEmployeeModal();
      await loadEmployees();
    } else {
      const err = await response.json();
      alert("Erro ao guardar colaborador: " + (err.error || "Tente novamente"));
    }
  } catch (err) {
    console.error("Failed to save employee:", err);
  }
}

function formatAvailabilityTag(dayData) {
  if (Array.isArray(dayData)) {
    return dayData.map(s => s === "day" ? "Dia" : "Noite").join("/");
  }
  if (typeof dayData === "object" && dayData !== null) {
    if (dayData.custom && dayData.start && dayData.end) {
      return `${dayData.start}-${dayData.end}`;
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
  const teamCountEl = document.querySelector("#team-count");
  if (teamCountEl) teamCountEl.textContent = employees.length;

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
        return `<span>${day.label.slice(0, 3)}: ${tagText}</span>`;
      })
      .filter(Boolean)
      .join("");

    const roleBadge = getRoleBadgeClass(employee.role);

    card.innerHTML = `
      <div class="member-top">
        <div class="member-info">
          <div class="avatar">${employee.name.slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>${employee.name}</strong>
            <div class="role-group">
              <span class="role-badge ${roleBadge}">${employee.role}</span>
              <small>${employee.maxHours}h/sem</small>
            </div>
          </div>
        </div>
        <div class="member-actions">
          <button class="icon-btn edit-member" type="button" data-edit-employee="${employee.id}" aria-label="Editar ${employee.name}">
            <i data-lucide="pencil"></i>
          </button>
          <button class="icon-btn remove-member" type="button" data-remove-employee="${employee.id}" aria-label="Remover ${employee.name}">
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

// Select employees calculating EXACT hours worked (not hardcoded 7.25h)
function pickEmployees(dayKey, shift, required, openTime, closeTime) {
  const available = employees
    .filter((employee) => isEmployeeAvailable(employee, dayKey, shift, openTime, closeTime))
    .sort((a, b) => (assignedHours.get(a.name) || 0) - (assignedHours.get(b.name) || 0));

  const selected = [];

  for (const employee of available) {
    const currentHours = assignedHours.get(employee.name) || 0;
    const details = getEmployeeShiftDetails(employee, dayKey, shift, openTime, closeTime);
    const duration = details.duration;

    if (currentHours + duration <= employee.maxHours && selected.length < required) {
      selected.push({
        ...employee,
        assignedHoursText: details.display,
        assignedDuration: duration
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
      generateSchedule();
    };
    bar.appendChild(btn);
  });
}

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

  let conflicts = 0;
  let totalRequired = 0;
  let totalAssigned = 0;
  let totalAvailableSlots = 0;

  assignedHours.clear();
  grid.innerHTML = "";

  // Set grid mode class
  grid.className = `schedule-grid mode-${currentViewMode}`;

  // Filter days based on view mode
  const daysToRender = currentViewMode === "daily" 
    ? weekDays.filter(d => d.key === selectedDayKey) 
    : weekDays;

  // Process all days for totals/stats
  weekDays.forEach((day) => {
    const dayRequired = baseDayRequired;
    const nightRequired = baseNightRequired;
    totalRequired += (dayRequired + nightRequired);

    const dayPeople = pickEmployees(day.key, "day", dayRequired, openTime, closeTime);
    const nightPeople = pickEmployees(day.key, "night", nightRequired, openTime, closeTime);

    totalAssigned += (dayPeople.length + nightPeople.length);
    conflicts += Math.max(0, dayRequired - dayPeople.length);
    conflicts += Math.max(0, nightRequired - nightPeople.length);

    employees.forEach((emp) => {
      if (isEmployeeAvailable(emp, day.key, "day", openTime, closeTime)) totalAvailableSlots++;
      if (isEmployeeAvailable(emp, day.key, "night", openTime, closeTime)) totalAvailableSlots++;
    });

    if (daysToRender.some(d => d.key === day.key)) {
      const column = document.createElement("article");
      column.className = `day-column ${day.key === selectedDayKey ? "selected" : ""}`;
      const salesDemand = demandLabel(day.sales);

      column.innerHTML = `
        <div class="day-head">
          <div class="day-head-main">
            <strong>${day.label}</strong>
            <span class="demand-pill ${salesDemand.toLowerCase()}">${salesDemand}</span>
          </div>
          <span class="day-sales-sub">${day.sales.toLocaleString("pt-PT")}€ previstos</span>
        </div>
        ${renderShift("Dia", shiftHours("day", openTime, closeTime), dayPeople, dayRequired)}
        ${renderShift("Noite", shiftHours("night", openTime, closeTime), nightPeople, nightRequired)}
      `;
      grid.append(column);
    }
  });

  // Dynamic Tile Updates
  const conflictCountEl = document.querySelector("#conflict-count");
  if (conflictCountEl) conflictCountEl.textContent = conflicts;

  const coverageStatusEl = document.querySelector("#coverage-status");
  if (coverageStatusEl) {
    coverageStatusEl.textContent =
      conflicts === 0 ? "Cobertura Completa" : `${conflicts} vaga${conflicts > 1 ? "s" : ""} por preencher`;
    coverageStatusEl.className = `status-badge ${conflicts === 0 ? "success" : "warning"}`;
  }

  const hoursStatEl = document.querySelector("#operation-hours-stat");
  if (hoursStatEl) hoursStatEl.textContent = `${openTime}-${closeTime}`;

  const salesStatEl = document.querySelector("#sales-stat");
  if (salesStatEl) {
    const avgSales = Math.round(weekDays.reduce((acc, d) => acc + (d.sales || 0), 0) / weekDays.length);
    salesStatEl.textContent = `€${avgSales.toLocaleString("pt-PT")}`;
  }

  const coverageStatEl = document.querySelector("#coverage-stat");
  if (coverageStatEl) {
    coverageStatEl.textContent = `${totalAssigned}/${totalRequired}`;
  }

  const availabilityStatEl = document.querySelector("#availability-stat");
  if (availabilityStatEl) {
    const ratio = totalRequired > 0 ? Math.min(100, Math.round((totalAvailableSlots / totalRequired) * 100)) : 0;
    availabilityStatEl.textContent = `${ratio}%`;
  }
}

function renderShift(name, hours, people, required) {
  const chips = people
    .map((person) => {
      const badge = getRoleBadgeClass(person.role);
      const hoursText = person.assignedHoursText || hours;
      return `
        <div class="person-chip" title="${person.name} (${person.role}) · ${hoursText}">
          <div class="chip-main-row">
            <span class="chip-avatar">${person.name.slice(0, 1).toUpperCase()}</span>
            <span class="chip-name">${person.name}</span>
            <span class="chip-role ${badge}">${person.role}</span>
          </div>
          <div class="chip-hours-badge">${hoursText}</div>
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
        <span class="shift-name-tag">${name}</span>
        <span class="shift-meta-tag">${hours} · ${people.length}/${required}</span>
      </div>
      <div class="shift-chips-list">
        ${chips}${missing}
      </div>
    </div>
  `;
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
    
    generateSchedule();
  });
});

// Event Listeners Setup
document.querySelector("#generate-schedule")?.addEventListener("click", generateSchedule);
document.querySelector("#add-employee")?.addEventListener("click", () => openEmployeeModal());
document.querySelector("#save-sales-week")?.addEventListener("click", registerSalesWeek);
document.querySelector("#apply-sales-suggestion")?.addEventListener("click", applySalesSuggestion);
document.querySelector("#sales-toggle")?.addEventListener("click", toggleSalesPanel);
document.querySelector("#login-form")?.addEventListener("submit", handleLogin);
document.querySelector("#logout-button")?.addEventListener("click", logout);

document.querySelector("#modal-close")?.addEventListener("click", closeEmployeeModal);
document.querySelector("#modal-cancel")?.addEventListener("click", closeEmployeeModal);
document.querySelector("#employee-form")?.addEventListener("submit", handleEmployeeFormSubmit);

// Rule input changes update schedule in real time
document.querySelector("#open-time")?.addEventListener("input", generateSchedule);
document.querySelector("#close-time")?.addEventListener("input", generateSchedule);
document.querySelector("#day-required")?.addEventListener("input", generateSchedule);
document.querySelector("#night-required")?.addEventListener("input", generateSchedule);

document.querySelectorAll(".dock-item").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".dock-item").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
  });
});

document.querySelector("#team-grid")?.addEventListener("click", async (event) => {
  const removeBtn = event.target.closest("[data-remove-employee]");
  if (removeBtn) {
    const id = removeBtn.dataset.removeEmployee;
    const employee = employees.find(e => String(e.id) === String(id));
    if (!employee) return;

    if (confirm(`Tem a certeza que deseja remover ${employee.name}?`)) {
      try {
        const response = await apiFetch(`/employees?id=${employee.id}`, { method: "DELETE" });
        if (response.ok) {
          await loadEmployees();
        }
      } catch (err) {
        console.error("Failed to remove employee:", err);
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
  // Sync day selector visibility with current mode
  const selectorBar = document.querySelector("#mobile-day-selector");
  if (selectorBar) {
    selectorBar.style.display = currentViewMode === "daily" ? "flex" : "none";
  }

  renderSales();
  renderTeam();
  renderMobileDaySelector();
  generateSchedule();
  await updateAuthView();

  if (await isLoggedIn()) {
    await loadEmployees();
    await loadSalesHistory();
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
})();
