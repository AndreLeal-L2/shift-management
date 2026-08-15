const supabaseUrl = 'https://zebcriljgnwvlpgygrib.supabase.co';
const supabaseKey = 'sb_publishable_UFL7ezhY0JNI0piyKqBg1w_sBajjfJS';
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

const weekDays = [
  { key: "seg", label: "Segunda", sales: 900 },
  { key: "ter", label: "Terça", sales: 850 },
  { key: "qua", label: "Quarta", sales: 1200 },
  { key: "qui", label: "Quinta", sales: 1400 },
  { key: "sex", label: "Sexta", sales: 2200 },
  { key: "sab", label: "Sábado", sales: 2800 },
  { key: "dom", label: "Domingo", sales: 1800 },
];

const employees = [
  {
    name: "Ana",
    role: "Sala",
    maxHours: 38,
    availability: {
      seg: ["day", "night"],
      ter: ["day"],
      qua: ["day", "night"],
      qui: ["day"],
      sex: ["night"],
      sab: ["day", "night"],
      dom: [],
    },
  },
  {
    name: "João",
    role: "Cozinha",
    maxHours: 40,
    availability: {
      seg: ["day"],
      ter: ["day", "night"],
      qua: ["night"],
      qui: ["day", "night"],
      sex: ["day", "night"],
      sab: ["night"],
      dom: ["day"],
    },
  },
  {
    name: "Marta",
    role: "Bar",
    maxHours: 38,
    availability: {
      seg: ["day", "night"],
      ter: ["day"],
      qua: ["day"],
      qui: ["night"],
      sex: ["night"],
      sab: ["day", "night"],
      dom: ["night"],
    },
  },
  {
    name: "Pedro",
    role: "Sala",
    maxHours: 44,
    availability: {
      seg: ["night"],
      ter: ["day", "night"],
      qua: ["day", "night"],
      qui: ["day"],
      sex: ["day", "night"],
      sab: ["day"],
      dom: ["day", "night"],
    },
  },
  {
    name: "Sofia",
    role: "Cozinha",
    maxHours: 40,
    availability: {
      seg: ["day", "night"],
      ter: ["night"],
      qua: ["day"],
      qui: ["day", "night"],
      sex: ["day", "night"],
      sab: ["day", "night"],
      dom: ["day"],
    },
  },
  {
    name: "Luís",
    role: "Sala",
    maxHours: 34,
    availability: {
      seg: ["day"],
      ter: ["day", "night"],
      qua: ["night"],
      qui: ["night"],
      sex: ["day"],
      sab: ["day", "night"],
      dom: ["night"],
    },
  },
  {
    name: "Inês",
    role: "Caixa",
    maxHours: 38,
    availability: {
      seg: ["day", "night"],
      ter: [],
      qua: ["day", "night"],
      qui: ["day"],
      sex: ["night"],
      sab: ["night"],
      dom: ["day", "night"],
    },
  },
  {
    name: "Rui",
    role: "Apoio",
    maxHours: 36,
    availability: {
      seg: ["night"],
      ter: ["day"],
      qua: ["day"],
      qui: ["day", "night"],
      sex: ["day", "night"],
      sab: [],
      dom: ["day", "night"],
    },
  },
  {
    name: "Clara",
    role: "Sala",
    maxHours: 36,
    availability: {
      seg: ["day", "night"],
      ter: ["day"],
      qua: ["day", "night"],
      qui: ["night"],
      sex: ["day", "night"],
      sab: ["day", "night"],
      dom: ["day"],
    },
  },
  {
    name: "Miguel",
    role: "Cozinha",
    maxHours: 38,
    availability: {
      seg: ["day"],
      ter: ["day", "night"],
      qua: ["day", "night"],
      qui: ["day", "night"],
      sex: ["night"],
      sab: ["day", "night"],
      dom: ["day", "night"],
    },
  },
];

const assignedHours = new Map();
const salesHistoryKey = "rellenoShiftsSalesHistory";
const sessionKey = "rellenoShiftsSession";
const adminCredentials = {
  email: "admin@relleno.pt",
  password: "admin123",
};
const API_BASE = "/api";
let salesHistory = [];
let authToken = localStorage.getItem(sessionKey);

async function isLoggedIn() {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

function updateAuthView() {
  document.body.classList.toggle("locked", !isLoggedIn());
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.querySelector("#login-email").value.trim().toLowerCase();
  const password = document.querySelector("#login-password").value;
  const error = document.querySelector("#login-error");

  const { data, error: authError } = await supabase.auth.signInWithPassword({
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
  updateAuthView();
  loadEmployees();
  loadSalesHistory();
}

async function logout() {
  await supabase.auth.signOut();
  authToken = null;
  localStorage.removeItem(sessionKey);
  updateAuthView();
}

function demandLabel(value) {
  if (value >= 2100) return "Alta";
  if (value >= 1300) return "Média";
  return "Baixa";
}

function shiftHours(shift, openTime, closeTime) {
  return shift === "day" ? `${openTime}-16:00` : `16:00-${closeTime}`;
}

async function loadSalesHistory() {
  try {
    const response = await fetch(`${API_BASE}/sales`);
    if (response.ok) {
      const data = await response.json();
      salesHistory = data;
    }
  } catch (err) {
    console.error("Failed to load sales history:", err);
  }
}

async function saveSalesHistory() {
  try {
    const response = await fetch(`${API_BASE}/sales`, {
      method: "POST",
      headers: { 
  "Content-Type": "application/json",
  "Authorization": `Bearer ${authToken}`
},
      body: JSON.stringify({ sales: Object.fromEntries(weekDays.map((day) => [day.key, Number(day.sales || 0)])) }),
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

  status.textContent =
    weekCount === 0
      ? "Sem histórico"
      : `${weekCount} semana${weekCount > 1 ? "s" : ""} no histórico`;
  applyButton.disabled = weekCount < 1;
}

function renderSales() {
  const list = document.querySelector("#sales-list");
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
    input.nextElementSibling.textContent = demandLabel(day.sales);
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
    const response = await fetch(`${API_BASE}/employees`);
    if (response.ok) {
      const data = await response.json();
      employees.length = 0;
      employees.push(...data.map((emp) => ({
        name: emp.name,
        role: emp.role,
        maxHours: emp.max_hours,
        availability: emp.availability,
        id: emp.id,
      })));
      renderTeam();
    }
  } catch (err) {
    console.error("Failed to load employees:", err);
  }
}

function renderTeam() {
  const grid = document.querySelector("#team-grid");
  grid.innerHTML = "";
  document.querySelector("#team-count").textContent = employees.length;

  employees.forEach((employee, index) => {
    const card = document.createElement("article");
    card.className = "member-card";
    const availableDays = weekDays
      .filter((day) => employee.availability[day.key].length)
      .map((day) => `<span>${day.label.slice(0, 3)}</span>`)
      .join("");

    card.innerHTML = `
      <div class="member-top">
        <div class="member-info">
          <div class="avatar">${employee.name.slice(0, 1)}</div>
          <div>
            <strong>${employee.name}</strong>
            <small>${employee.role} · ${employee.maxHours}h/sem</small>
          </div>
        </div>
        <button class="remove-member" type="button" data-remove-employee="${index}" aria-label="Remover ${employee.name}">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
      <div class="availability-tags">${availableDays}</div>
    `;
    grid.append(card);
  });
}

function pickEmployees(dayKey, shift, required) {
  const available = employees
    .filter((employee) => employee.availability[dayKey].includes(shift))
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
  const openTime = document.querySelector("#open-time").value || "08:30";
  const closeTime = document.querySelector("#close-time").value || "23:00";
  const baseDayRequired = Number(document.querySelector("#day-required").value || 3);
  const baseNightRequired = Number(document.querySelector("#night-required").value || 3);
  let conflicts = 0;

  assignedHours.clear();
  grid.innerHTML = "";

  weekDays.forEach((day) => {
    const salesDemand = demandLabel(day.sales);
    const dayRequired = baseDayRequired;
    const nightRequired = baseNightRequired;
    const dayPeople = pickEmployees(day.key, "day", dayRequired);
    const nightPeople = pickEmployees(day.key, "night", nightRequired);
    conflicts += Math.max(0, dayRequired - dayPeople.length);
    conflicts += Math.max(0, nightRequired - nightPeople.length);

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

  document.querySelector("#conflict-count").textContent = conflicts;
  document.querySelector("#coverage-status").textContent =
    conflicts === 0 ? "Cobertura completa" : `${conflicts} vagas por preencher`;
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

async function addEmployee() {
  const count = employees.length + 1;
  const newEmployee = {
    name: `Novo ${count}`,
    role: "Sala",
    maxHours: 30,
    availability: {
      seg: ["day"],
      ter: ["day"],
      qua: ["day"],
      qui: ["night"],
      sex: ["night"],
      sab: [],
      dom: [],
    },
  };

  try {
    const response = await fetch(`${API_BASE}/employees`, {
      method: "POST",
      headers: { 
  "Content-Type": "application/json",
  "Authorization": `Bearer ${authToken}`
},
      body: JSON.stringify(newEmployee),
    });

    if (response.ok) {
      await loadEmployees();
      generateSchedule();
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }
  } catch (err) {
    console.error("Failed to add employee:", err);
  }
}

document.querySelector("#generate-schedule").addEventListener("click", generateSchedule);
document.querySelector("#add-employee").addEventListener("click", addEmployee);
document.querySelector("#save-sales-week").addEventListener("click", registerSalesWeek);
document.querySelector("#apply-sales-suggestion").addEventListener("click", applySalesSuggestion);
document.querySelector("#sales-toggle").addEventListener("click", toggleSalesPanel);
document.querySelector("#login-form").addEventListener("submit", handleLogin);
document.querySelector("#logout-button").addEventListener("click", logout);
document.querySelectorAll(".dock a").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".dock a").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
  });
});
document.querySelector("#team-grid").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-employee]");
  if (!button) return;
  const employee = employees[Number(button.dataset.removeEmployee)];
  
  try {
    const response = await fetch(`${API_BASE}/employees?id=${employee.id}`, { method: "DELETE" });
    if (response.ok) {
      await loadEmployees();
      generateSchedule();
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }
  } catch (err) {
    console.error("Failed to remove employee:", err);
  }
});

renderSales();
renderTeam();
generateSchedule();
updateAuthView();

if (isLoggedIn()) {
  loadEmployees();
  loadSalesHistory();
}

if (window.lucide) {
  window.lucide.createIcons();
}
