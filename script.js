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
    ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {}),
    ...(options.headers || {})
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
        availability: emp.availability || { seg: [], ter: [], qua: [], qui: [], sex: [], sab: [], dom: [] }
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
    const dayAvail = currentAvailability[day.key] || [];
    const dayChecked = dayAvail.includes("day");
    const nightChecked = dayAvail.includes("night");

    const row = document.createElement("div");
    row.className = "matrix-row";
    row.innerHTML = `
      <span class="matrix-day-name">${day.label}</span>
      <label class="matrix-check">
        <input type="checkbox" name="avail-${day.key}" value="day" ${dayChecked ? "checked" : ""}>
        <span>Dia</span>
      </label>
      <label class="matrix-check">
        <input type="checkbox" name="avail-${day.key}" value="night" ${nightChecked ? "checked" : ""}>
        <span>Noite</span>
      </label>
    `;
    container.appendChild(row);
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
      seg: ["day", "night"],
      ter: ["day", "night"],
      qua: ["day", "night"],
      qui: ["day", "night"],
      sex: ["day", "night"],
      sab: ["day", "night"],
      dom: ["day", "night"]
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
    const checkboxes = document.querySelectorAll(`input[name="avail-${day.key}"]:checked`);
    availability[day.key] = Array.from(checkboxes).map((cb) => cb.value);
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
      .filter((day) => employee.availability?.[day.key]?.length)
      .map((day) => `<span>${day.label.slice(0, 3)}</span>`)
      .join("");

    card.innerHTML = `
      <div class="member-top">
        <div class="member-info">
          <div class="avatar">${employee.name.slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>${employee.name}</strong>
            <small>${employee.role} · ${employee.maxHours}h/sem</small>
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
      <div class="availability-tags">${availableDays || '<span>Sem disponibilidade</span>'}</div>
    `;
    grid.append(card);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function pickEmployees(dayKey, shift, required) {
  const available = employees
    .filter((employee) => employee.availability?.[dayKey]?.includes(shift))
    .sort((a, b) => (assignedHours.get(a.name) || 0) - (assignedHours.get(b.name) || 0));

  const selected = [];

  for (const employee of available) {
    const currentHours = assignedHours.get(employee.name) || 0;
    if (currentHours + 7.25 <= employee.maxHours && selected.length < required) {
      selected.push(employee);
      assignedHours.set(employee.name, currentHours + 7.25);
    }
  }

  return selected;
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

  weekDays.forEach((day) => {
    const salesDemand = demandLabel(day.sales);
    const dayRequired = baseDayRequired;
    const nightRequired = baseNightRequired;
    totalRequired += (dayRequired + nightRequired);

    const dayPeople = pickEmployees(day.key, "day", dayRequired);
    const nightPeople = pickEmployees(day.key, "night", nightRequired);

    totalAssigned += (dayPeople.length + nightPeople.length);
    conflicts += Math.max(0, dayRequired - dayPeople.length);
    conflicts += Math.max(0, nightRequired - nightPeople.length);

    // Count available slots for day slot availability metric
    employees.forEach((emp) => {
      if (emp.availability?.[day.key]?.includes("day")) totalAvailableSlots++;
      if (emp.availability?.[day.key]?.includes("night")) totalAvailableSlots++;
    });

    const column = document.createElement("article");
    column.className = "day-column";
    column.innerHTML = `
      <div class="day-head">
        <strong>${day.label}</strong>
        <span>${day.sales.toLocaleString("pt-PT")}€ · ${salesDemand}</span>
      </div>
      ${renderShift("Dia", shiftHours("day", openTime, closeTime), dayPeople, dayRequired)}
      ${renderShift("Noite", shiftHours("night", openTime, closeTime), nightPeople, nightRequired)}
    `;
    grid.append(column);
  });

  // Dynamic Tile Updates
  const conflictCountEl = document.querySelector("#conflict-count");
  if (conflictCountEl) conflictCountEl.textContent = conflicts;

  const coverageStatusEl = document.querySelector("#coverage-status");
  if (coverageStatusEl) {
    coverageStatusEl.textContent =
      conflicts === 0 ? "Cobertura completa" : `${conflicts} vagas por preencher`;
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
    .map((person) => `<div class="person-chip">${person.name}</div>`)
    .join("");
  const missing = Array.from({ length: Math.max(0, required - people.length) })
    .map(() => `<div class="person-chip missing">Por preencher</div>`)
    .join("");

  return `
    <div class="shift">
      <div class="shift-title">
        <span>${name}</span>
        <span>${hours} · ${required}</span>
      </div>
      ${chips}${missing}
    </div>
  `;
}

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

document.querySelectorAll(".dock a").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".dock a").forEach((item) => item.classList.remove("active"));
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
  renderSales();
  renderTeam();
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
