const cfg = window.HASTREITER_CONFIG || {
  supabaseUrl: "https://wjxppqxudiomfgfbeyav.supabase.co",
  supabaseAnonKey: "sb_publishable_vSd_ftJq3_fNylpQ6pbVSQ_r7XChVQP",
  adminEmail: "hastreiter-dienstleistungen@gmx.de",
  sheetsWebAppUrl: "https://script.google.com/macros/s/AKfycbyjbSyfJEbRAx4LA1Es_0xNzWAAYA709QGf7Q2iYKfwUF1-6GlixAz2YrWuO4Z1-Qmf/exec"
};

let sb = null;
let dataCache = {
  income: [], expense: [], orders: [], requests: [],
  appointments: [], cleaning: [], receipts: []
};

const toNumber = value => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let s = String(value ?? "").trim();
  if (!s) return 0;
  s = s.replace(/€/g, "").replace(/\s/g, "");
  // Deutsche Schreibweise: 1.234,56 -> 1234.56
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const euro = n => new Intl.NumberFormat("de-DE", {
  style: "currency", currency: "EUR"
}).format(toNumber(n));

const amountOf = row => {
  if (!row) return 0;
  if (row.betrag !== null && row.betrag !== undefined && String(row.betrag).trim() !== "") return toNumber(row.betrag);
  if (row.brutto !== null && row.brutto !== undefined && String(row.brutto).trim() !== "") return toNumber(row.brutto);
  return 0;
};

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[c]));

function showSection(id){
  document.querySelectorAll(".section").forEach(x => x.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
  document.querySelectorAll(".nav-item").forEach(x =>
    x.classList.toggle("active", x.dataset.section === id)
  );
  const titles = {
    dashboard:"Dashboard", anfragen:"Anfragen", einnahmen:"Einnahmen",
    ausgaben:"Ausgaben", belege:"Belege", auftraege:"Aufträge",
    reinigung:"Reinigung", kalender:"Kalender", auswertungen:"Auswertungen"
  };
  const title = document.getElementById("pageTitle");
  if (title) title.textContent = titles[id] || "Hastreiter";
  document.querySelector(".sidebar")?.classList.remove("open");
}

document.querySelectorAll("[data-section]").forEach(b =>
  b.addEventListener("click", () => showSection(b.dataset.section))
);
document.querySelectorAll("[data-section-link]").forEach(b =>
  b.addEventListener("click", () => showSection(b.dataset.sectionLink))
);
document.getElementById("menuBtn")?.addEventListener("click", () =>
  document.querySelector(".sidebar")?.classList.toggle("open")
);

async function init(){
  if(!window.supabase){
    setConnectionError("Supabase-Bibliothek nicht geladen",
      "Die Supabase-Bibliothek konnte nicht geladen werden. Bitte Seite mit Strg+F5 neu laden.");
    return;
  }

  if(!cfg.supabaseUrl || !cfg.supabaseAnonKey || cfg.supabaseAnonKey.includes("HIER_")){
    setConnectionError("Supabase-Konfiguration fehlt",
      "Die Supabase-Konfiguration wurde nicht geladen.");
    return;
  }

  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  const { data: { session } } = await sb.auth.getSession();

  if(session) enterApp(session);
  else document.getElementById("loginScreen")?.classList.remove("hidden");

  sb.auth.onAuthStateChange((_event, session) => {
    if(session) enterApp(session);
  });
}

function setConnectionError(status, message){
  const s = document.getElementById("connectionStatus");
  const e = document.getElementById("loginError");
  if(s) s.textContent = status;
  if(e) e.textContent = message;
}

async function login(e){
  e.preventDefault();

  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;
  const err = document.getElementById("loginError");

  err.textContent = "";

  if(email !== String(cfg.adminEmail || "").toLowerCase()){
    err.textContent = "Diese E-Mail ist für den internen Hastreiter-Login nicht freigeschaltet.";
    return;
  }

  if(!sb){
    err.textContent = "Supabase ist noch nicht verbunden.";
    return;
  }

  const { error } = await sb.auth.signInWithPassword({ email, password });

  if(error) err.textContent = error.message;
}

document.getElementById("loginForm")?.addEventListener("submit", login);

async function enterApp(){
  document.getElementById("loginScreen")?.classList.add("hidden");
  document.getElementById("app")?.classList.remove("hidden");

  const status = document.getElementById("connectionStatus");
  if(status) status.textContent = "Verbunden";

  await loadData();
}

document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  if(sb) await sb.auth.signOut();
  location.reload();
});

async function loadData(){
  if(!sb) return;

  const results = await Promise.all([
    sb.from("einnahmen").select("*").order("datum",{ascending:false}),
    sb.from("ausgaben").select("*").order("datum",{ascending:false}),
    sb.from("auftraege").select("*").order("startdatum",{ascending:true}),
    sb.from("anfragen").select("*").order("erstellt_am",{ascending:false}),
    sb.from("termine").select("*").order("datum",{ascending:true}).limit(10),
    sb.from("reinigungsauftraege").select("*").order("datum",{ascending:true}),
    sb.from("belege").select("*").order("erstellt_am",{ascending:false})
  ]);

  const [income, expense, orders, requests, appointments, cleaning, receipts] = results;

  dataCache = {
    income: income.data || [],
    expense: expense.data || [],
    orders: orders.data || [],
    requests: requests.data || [],
    appointments: appointments.data || [],
    cleaning: cleaning.data || [],
    receipts: receipts.data || []
  };

  render();
}

function render(){
  const currentYear = new Date().getFullYear();
  const yearText = String(currentYear);

  const openOrders = dataCache.orders
    .filter(x => !["Erledigt","Storniert"].includes(x.status)).length;

  const newRequests = dataCache.requests
    .filter(x => (x.status || "Neu") === "Neu").length;

  const yearIncome = dataCache.income
    .filter(x => String(x.datum || "").slice(0,4) === yearText)
    .reduce((s,x) => s + amountOf(x), 0);
  const yearExpense = dataCache.expense
    .filter(x => String(x.datum || "").slice(0,4) === yearText)
    .reduce((s,x) => s + amountOf(x), 0);

  setText("statIncome", euro(yearIncome));
  setText("statExpense", euro(yearExpense));
  setText("statResult", euro(yearIncome - yearExpense));
  setText("statOrders", openOrders);
  setText("statRequests", newRequests);
  setText("requestBadge", newRequests);
  setText("dashboardYear", currentYear);
  setText("dashboardYearExpense", currentYear);
  setText("dashboardYearResult", currentYear);

  const totalIncome = dataCache.income.reduce((s,x) => s + amountOf(x), 0);
  const totalExpense = dataCache.expense.reduce((s,x) => s + amountOf(x), 0);

  setText("totalIncome", euro(totalIncome));
  setText("totalExpense", euro(totalExpense));
  setText("totalResult", euro(totalIncome - totalExpense));

  setupEvaluationControls();
  renderEvaluation(currentYear);
  renderRequests();
  list("incomeList", dataCache.income, r => {
    const id = r.id || r.rechnungsnummer || r.drive_datei_id || "";
    return `<div class="item-card">
      <div><b>${esc(r.datum)}</b><div>${esc(r.beschreibung || "Einnahme")}</div></div>
      <div class="finance-row-actions">
        <strong>${euro(amountOf(r))}</strong>
        <button type="button" class="btn-danger income-delete" data-income-id="${esc(id)}">🗑️ Löschen</button>
      </div>
    </div>`;
  });
  bindIncomeDeleteActions();

  list("expenseList", dataCache.expense, r => {
    const id = r.id || r.rechnungsnummer || r.drive_datei_id || "";
    return `<div class="item-card">
      <div><b>${esc(r.datum)}</b><div>${esc(r.lieferant || r.beschreibung || "Ausgabe")}</div></div>
      <div class="finance-row-actions">
        <strong>${euro(amountOf(r))}</strong>
        <button type="button" class="btn-danger expense-delete" data-expense-id="${esc(id)}">🗑️ Löschen</button>
      </div>
    </div>`;
  });
  bindExpenseDeleteActions();

  list("ordersList", dataCache.orders, r =>
    `<div class="item-card">
      <div><b>${esc(r.titel)}</b><div>${esc(r.leistung || "")}</div></div>
      <span class="badge">${esc(r.status || "Offen")}</span>
    </div>`
  );

  list("cleaningList", dataCache.cleaning, r =>
    `<div class="item-card">
      <div><b>${esc(r.art_der_reinigung || "Reinigung")}</b><div>${esc(r.objekt || "")}</div></div>
      <span class="badge">${esc(r.status || "Offen")}</span>
    </div>`
  );

  list("receiptList", dataCache.receipts, r => {
    const id = r.id || "";
    return `<div class="item-card receipt-card">
      <div>
        <b>${esc(r.lieferant || "Beleg")}</b>
        <div>${esc(r.belegdatum || "")}</div>
        ${r.rechnungsnummer ? `<small>Nr. ${esc(r.rechnungsnummer)}</small>` : ""}
      </div>
      <div class="receipt-actions-list">
        <strong>${r.betrag != null ? euro(r.betrag) : "—"}</strong>
        <button type="button" class="btn-danger receipt-delete" data-receipt-id="${esc(id)}">🗑️ Löschen</button>
      </div>
    </div>`;
  });
  bindReceiptDeleteActions();

  list("calendarList", dataCache.appointments, r =>
    `<div class="calendar-row">
      <b>${esc(r.datum)} · ${esc(r.startzeit || "")}</b>
      <div>${esc(r.titel)}</div>
    </div>`
  );

  list("nextAppointments", dataCache.appointments.slice(0,4), r =>
    `<div class="list-row">
      <div><b>${esc(r.titel)}</b><small>${esc(r.datum)} · ${esc(r.startzeit || "")}</small></div>
      <span>›</span>
    </div>`
  );

  drawChart();
}

function renderEvaluation(year){
  const yearText = String(year);
  const income = dataCache.income.filter(x => String(x.datum || "").slice(0,4) === yearText);
  const expense = dataCache.expense.filter(x => String(x.datum || "").slice(0,4) === yearText);

  const totalIncome = income.reduce((s,x) => s + amountOf(x), 0);
  const totalExpense = expense.reduce((s,x) => s + amountOf(x), 0);

  setText("evaluationYear", yearText);
  setText("evaluationYearExpense", yearText);
  setText("evaluationTotalIncome", euro(totalIncome));
  setText("evaluationTotalExpense", euro(totalExpense));
  setText("evaluationTotalResult", euro(totalIncome - totalExpense));

  const monthNames = [
    "Januar","Februar","März","April","Mai","Juni",
    "Juli","August","September","Oktober","November","Dezember"
  ];

  const rows = monthNames.map((name, index) => {
    const month = `${yearText}-${String(index + 1).padStart(2,"0")}`;
    const mi = income.filter(x => String(x.datum || "").slice(0,7) === month)
      .reduce((s,x) => s + amountOf(x), 0);
    const me = expense.filter(x => String(x.datum || "").slice(0,7) === month)
      .reduce((s,x) => s + amountOf(x), 0);
    return `<tr>
      <td>${name}</td>
      <td>${euro(mi)}</td>
      <td>${euro(me)}</td>
      <td>${euro(mi - me)}</td>
    </tr>`;
  }).join("");

  const table = document.getElementById("evaluationMonthlyBody");
  if(table) table.innerHTML = rows;
}

function bindIncomeDeleteActions(){
  document.querySelectorAll(".income-delete").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.dataset.incomeId;
      if(!id) return;
      if(!confirm("Möchtest du diese Einnahme wirklich löschen? Die Originaldatei in Google Drive bleibt erhalten.")) return;
      await deleteIncome(id);
    });
  });
}

async function deleteIncome(id){
  if(!sb || !id) return;
  try {
    const { error } = await sb.from("einnahmen").delete().eq("id", id);
    if(error) throw new Error("Einnahme konnte nicht gelöscht werden: " + error.message);
    await loadData();
  } catch(error){
    console.error(error);
    alert(error.message);
  }
}

function bindExpenseDeleteActions(){
  document.querySelectorAll(".expense-delete").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.dataset.expenseId;
      if(!id) return;
      if(!confirm("Möchtest du diese Ausgabe wirklich löschen? Der zugehörige Beleg bleibt erhalten.")) return;
      await deleteExpense(id);
    });
  });
}

async function deleteExpense(id){
  if(!sb || !id) return;
  try {
    const { error } = await sb.from("ausgaben").delete().eq("id", id);
    if(error) throw new Error("Ausgabe konnte nicht gelöscht werden: " + error.message);
    await loadData();
  } catch(error){
    console.error(error);
    alert(error.message);
  }
}

function bindReceiptDeleteActions(){
  document.querySelectorAll(".receipt-delete").forEach(button => {
    button.addEventListener("click", async () => {
      const id = button.dataset.receiptId;
      if(!id) return;
      if(!confirm("Möchtest du diesen Beleg wirklich löschen? Die zugehörige Ausgabe wird ebenfalls aus der App gelöscht.")) return;
      await deleteReceipt(id);
    });
  });
}

async function deleteReceipt(id){
  if(!sb || !id) return;

  const receipt = dataCache.receipts.find(x => String(x.id) === String(id));
  if(!receipt){
    alert("Beleg wurde nicht gefunden.");
    return;
  }

  try {
    // Die zugehörige Ausgabe wird anhand der beim Speichern gesetzten
    // Drive-Datei-ID gefunden. Fallback: Rechnungsnummer + Datum.
    if(receipt.drive_datei_id){
      const { error: expenseError } = await sb.from("ausgaben")
        .delete().eq("drive_datei_id", receipt.drive_datei_id);
      if(expenseError) throw new Error("Zugehörige Ausgabe konnte nicht gelöscht werden: " + expenseError.message);
    } else if(receipt.rechnungsnummer){
      const { error: expenseError } = await sb.from("ausgaben")
        .delete()
        .eq("rechnungsnummer", receipt.rechnungsnummer)
        .eq("datum", receipt.belegdatum);
      if(expenseError) throw new Error("Zugehörige Ausgabe konnte nicht gelöscht werden: " + expenseError.message);
    }

    const { error } = await sb.from("belege").delete().eq("id", id);
    if(error) throw new Error("Beleg konnte nicht gelöscht werden: " + error.message);

    await loadData();
    alert("Beleg wurde gelöscht.");
  } catch(error){
    console.error(error);
    alert(error.message);
  }
}

function renderRequests(){
  const el = document.getElementById("requestsList");
  if(!el) return;

  if(!dataCache.requests.length){
    el.innerHTML = `<div class="empty">Noch keine Anfragen vorhanden.</div>`;
    return;
  }

  el.innerHTML = dataCache.requests.map(r => {
    const id = r.id || r.anfrage_id || "";
    const status = r.status || "Neu";

    return `
      <div class="item-card request-card" data-request-id="${esc(id)}">
        <div class="request-main">
          <div>
            <b>${esc(r.leistung || "Anfrage")}</b>
            <div>${esc(r.name || "")} · ${esc(r.ort || "")}</div>
            <small>${esc(r.beschreibung || "Keine Beschreibung")}</small>
          </div>

          <select class="request-status" data-request-id="${esc(id)}">
            ${requestStatuses(status)}
          </select>
        </div>

        <div class="request-actions">
          <button type="button" class="btn-danger request-delete"
                  data-request-id="${esc(id)}">
            🗑️ Löschen
          </button>
        </div>
      </div>
    `;
  }).join("");

  bindRequestActions();
}

function requestStatuses(current){
  const statuses = [
    "Neu",
    "In Bearbeitung",
    "Angenommen",
    "Abgelehnt",
    "Erledigt"
  ];

  return statuses.map(s =>
    `<option value="${esc(s)}" ${s === current ? "selected" : ""}>${esc(s)}</option>`
  ).join("");
}

function bindRequestActions(){
  document.querySelectorAll(".request-status").forEach(select => {
    select.addEventListener("change", async e => {
      const id = e.target.dataset.requestId;
      const status = e.target.value;
      await changeRequestStatus(id, status);
    });
  });

  document.querySelectorAll(".request-delete").forEach(button => {
    button.addEventListener("click", async e => {
      const id = e.target.dataset.requestId;

      if(!confirm("Möchtest du diese Anfrage wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.")){
        return;
      }

      await deleteRequest(id);
    });
  });
}

async function changeRequestStatus(id, status){
  if(!id || !sb) return;

  const { error } = await sb
    .from("anfragen")
    .update({ status })
    .eq("id", id);

  if(error){
    alert("Status konnte nicht gespeichert werden: " + error.message);
    await loadData();
    return;
  }

  const r = dataCache.requests.find(x => String(x.id) === String(id));

  await syncToSheets("updateRequest", {
    anfrage_id: id,
    name: r?.name,
    telefon: r?.telefon,
    email: r?.email,
    strasse: r?.strasse,
    plz: r?.plz,
    ort: r?.ort,
    leistung: r?.leistung,
    beschreibung: r?.beschreibung,
    gewuenschter_termin: r?.gewuenschter_termin,
    uhrzeit: r?.uhrzeit,
    haeufigkeit: r?.haeufigkeit,
    status
  });

  await loadData();
}

async function deleteRequest(id){
  if(!id || !sb) return;

  const { error } = await sb
    .from("anfragen")
    .delete()
    .eq("id", id);

  if(error){
    alert("Anfrage konnte nicht gelöscht werden: " + error.message);
    return;
  }

  const result = await syncToSheets("deleteRequest", {
    anfrage_id: id
  });

  if(!result.sent){
    alert("Die Anfrage wurde aus der App gelöscht. Die Google-Sheets-Synchronisierung konnte nicht bestätigt werden.");
  } else {
    alert("Anfrage wurde gelöscht.");
  }

  await loadData();
}

/**
 * Wird später von der öffentlichen Anfrage-Seite verwendet.
 * Speichert eine neue Anfrage zuerst in Supabase und anschließend in Google Sheets.
 */
async function createRequest(requestData){
  if(!sb) throw new Error("Supabase ist nicht verbunden.");

  const payload = {
    name: requestData.name || "",
    telefon: requestData.telefon || "",
    email: requestData.email || "",
    strasse: requestData.strasse || "",
    plz: requestData.plz || "",
    ort: requestData.ort || "",
    leistung: requestData.leistung || "",
    beschreibung: requestData.beschreibung || "",
    gewuenschter_termin: requestData.gewuenschter_termin || "",
    uhrzeit: requestData.uhrzeit || "",
    haeufigkeit: requestData.haeufigkeit || "Einmalig",
    status: "Neu"
  };

  const { data, error } = await sb
    .from("anfragen")
    .insert(payload)
    .select()
    .single();

  if(error) throw error;

  const sheetResult = await syncToSheets("createRequest", {
    anfrage_id: data.id,
    ...data
  });

  return { data, sheetResult };
}

/**
 * Überträgt Daten an Google Apps Script.
 * text/plain vermeidet eine unnötige CORS-Preflight-Anfrage.
 */
async function syncToSheets(action, payload){
  const url = cfg.sheetsWebAppUrl;

  if(!url){
    console.warn("Keine Google-Sheets-Web-App-URL konfiguriert.");
    return { sent:false, reason:"missing_url" };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        action,
        ...payload
      })
    });

    let result = null;

    try {
      result = await response.json();
    } catch (_) {}

    console.log("Google Sheets:", action, result || response.status);

    return {
      sent: true,
      ok: response.ok,
      result
    };

  } catch(error) {
    console.error("Google-Sheets-Synchronisierung fehlgeschlagen:", error);
    return {
      sent: false,
      error: error.message
    };
  }
}

function list(id,items,fn){
  const el = document.getElementById(id);
  if(!el) return;
  el.innerHTML = items.length
    ? items.map(fn).join("")
    : `<div class="empty">Noch keine Daten vorhanden.</div>`;
}

function setText(id,value){
  const el = document.getElementById(id);
  if(el) el.textContent = value;
}

function drawChart(){
  const c = document.getElementById("financeChart");
  if(!c) return;

  const ctx = c.getContext("2d");
  const w = c.width, h = c.height;

  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle = "#dce5df";
  ctx.fillStyle = "#6c7770";
  ctx.font = "12px Arial";

  const year = new Date().getFullYear();
  const months = [...Array(12)].map((_,i) =>
    `${year}-${String(i+1).padStart(2,"0")}`
  );

  const vals = months.map(m => [
    dataCache.income.filter(x => String(x.datum || "").slice(0,7) === m)
      .reduce((s,x) => s + amountOf(x),0),
    dataCache.expense.filter(x => String(x.datum || "").slice(0,7) === m)
      .reduce((s,x) => s + amountOf(x),0)
  ]);

  const max = Math.max(100,...vals.flat()) * 1.15;
  const base = h - 35;
  const plotH = h - 60;
  const bw = 13;
  const gap = (w - 80) / 12;

  ctx.beginPath();
  ctx.moveTo(35,15);
  ctx.lineTo(35,base);
  ctx.lineTo(w-10,base);
  ctx.stroke();

  vals.forEach((v,i) => {
    const x = 45 + i * gap;
    const hi = (v[0]/max) * plotH;
    const he = (v[1]/max) * plotH;

    ctx.fillStyle = "#1b9149";
    ctx.fillRect(x,base-hi,bw,hi);

    ctx.fillStyle = "#ed7412";
    ctx.fillRect(x+bw+3,base-he,bw,he);

    ctx.fillStyle = "#6c7770";
    ctx.fillText(
      new Date(year, i, 1).toLocaleDateString("de-DE",{month:"short"}),
      x,
      base+18
    );
  });
}

/* ================================================================
 * BELEGSCANNER
 * ================================================================ */

function setupReceiptScanner(){
  const section = document.getElementById("belege");
  if(!section) return;

  const card = section.querySelector(".upload-card");
  if(card){
    card.innerHTML = `
      <div class="upload-icon">📷</div>
      <h2>Beleg erfassen</h2>
      <p>Beleg fotografieren oder PDF/Bild auswählen. Die Daten werden automatisch per OCR erkannt und können vor dem Speichern korrigiert werden.</p>
      <div class="receipt-actions" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:18px;">
        <button type="button" id="receiptCameraBtn" class="btn-primary" style="min-height:64px;font-size:16px;">
          📷 Beleg fotografieren
        </button>
        <button type="button" id="receiptUploadBtn" class="btn-secondary" style="min-height:64px;font-size:16px;">
          📁 Datei hochladen
        </button>
      </div>
      <input id="receiptCamera" type="file" accept="image/*" capture="environment" hidden>
      <input id="receiptFile" type="file" accept="image/*,.pdf" hidden>
      <div id="receiptScanStatus" style="margin-top:14px;"></div>
    `;
  } else {
    // Falls die HTML-Datei bereits angepasst wurde, vorhandene Inputs weiterverwenden.
    if(!document.getElementById("receiptCamera")){
      const input = document.createElement("input");
      input.id = "receiptCamera";
      input.type = "file";
      input.accept = "image/*";
      input.capture = "environment";
      input.hidden = true;
      section.appendChild(input);
    }
  }

  document.getElementById("receiptCameraBtn")?.addEventListener("click", () =>
    document.getElementById("receiptCamera")?.click()
  );

  document.getElementById("receiptUploadBtn")?.addEventListener("click", () =>
    document.getElementById("receiptFile")?.click()
  );

  document.getElementById("receiptCamera")?.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if(file) processReceiptFile(file);
    e.target.value = "";
  });

  document.getElementById("receiptFile")?.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if(file) processReceiptFile(file);
    e.target.value = "";
  });
}

function setReceiptStatus(message, isError=false){
  const el = document.getElementById("receiptScanStatus");
  if(!el) return;
  el.textContent = message;
  el.style.color = isError ? "#b42318" : "#267a45";
}

async function processReceiptFile(file){
  if(!sb){
    setReceiptStatus("Supabase ist noch nicht verbunden.", true);
    return;
  }

  const maxBytes = 12 * 1024 * 1024;
  if(file.size > maxBytes && file.type !== "application/pdf"){
    setReceiptStatus("Das Bild ist zu groß. Bitte ein kleineres Foto verwenden.", true);
    return;
  }

  setReceiptStatus("Beleg wird hochgeladen und automatisch erkannt …");

  try {
    const { data:{ session } } = await sb.auth.getSession();
    if(!session?.access_token) throw new Error("Keine aktive Anmeldung vorhanden.");

    const prepared = file.type === "application/pdf"
      ? await fileToBase64(file)
      : await imageToBase64(file);

    const response = await fetch(cfg.sheetsWebAppUrl, {
      method: "POST",
      headers: { "Content-Type":"text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "processReceipt",
        accessToken: session.access_token,
        fileName: file.name,
        mimeType: prepared.mimeType,
        fileData: prepared.base64
      })
    });

    const result = await response.json();
    if(!result.success) throw new Error(result.error || "Beleg konnte nicht verarbeitet werden.");

    setReceiptStatus(result.message || "Beleg erkannt.");
    openReceiptReview(result.receipt || {}, file);

  } catch(error){
    console.error(error);
    setReceiptStatus("Fehler: " + error.message, true);
  }
}

function fileToBase64(file){
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      resolve({
        mimeType: file.type || "application/octet-stream",
        base64: dataUrl.split(",")[1] || ""
      });
    };
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

function imageToBase64(file){
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 1800;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        resolve({
          mimeType: "image/jpeg",
          base64: dataUrl.split(",")[1] || ""
        });
      };
      img.onerror = () => reject(new Error("Bild konnte nicht verarbeitet werden."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

function openReceiptReview(receipt, originalFile){
  document.getElementById("receiptReviewModal")?.remove();

  const modal = document.createElement("div");
  modal.id = "receiptReviewModal";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto;";

  modal.innerHTML = `
    <div style="background:#fff;border-radius:18px;max-width:720px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.25);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;">
        <div>
          <h2 style="margin:0;">Beleg prüfen</h2>
          <p style="margin:5px 0 0;color:#6c7770;">OCR-Ergebnis vor dem Speichern kontrollieren.</p>
        </div>
        <button type="button" id="receiptReviewClose" class="btn-secondary">✕</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${receiptField("receiptSupplier","Lieferant",receipt.lieferant || "")}
        ${receiptField("receiptNumber","Rechnungs-/Belegnummer",receipt.rechnungsnummer || "")}
        ${receiptField("receiptDate","Belegdatum",dateInputValue(receipt.belegdatum),"date")}
        ${receiptCategoryField(receipt.kategorie || "")}
        ${receiptField("receiptNet","Netto",moneyInputValue(receipt.netto))}
        ${receiptField("receiptVat","MwSt.",moneyInputValue(receipt.mwst ?? 0))}
        ${receiptField("receiptGross","Brutto",moneyInputValue(receipt.brutto ?? receipt.betrag))}
        ${receiptField("receiptDescription","Beschreibung",receipt.beschreibung || "")}
      </div>

      <div style="margin-top:14px;padding:12px;background:#f5f7f5;border-radius:12px;font-size:13px;">
        <b>Originaldatei:</b> ${esc(receipt.dateiname || originalFile?.name || "Beleg")}
        ${receipt.drive_url ? ` · <a href="${esc(receipt.drive_url)}" target="_blank" rel="noopener">In Drive öffnen</a>` : ""}
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;">
        <button type="button" id="receiptCancel" class="btn-secondary">Abbrechen</button>
        <button type="button" id="receiptSave" class="btn-primary">💾 Beleg speichern</button>
      </div>
      <div id="receiptSaveStatus" style="margin-top:12px;"></div>
    </div>
  `;

  document.body.appendChild(modal);

  // Datum nach dem Einfügen nochmals explizit setzen. Dadurch bleibt es
  // auch in Browsern mit deutscher Datumsdarstellung als echtes ISO-Datum erhalten.
  const dateEl = document.getElementById("receiptDate");
  if(dateEl){
    const isoDate = dateInputValue(receipt.belegdatum);
    if(isoDate) dateEl.value = isoDate;
  }

  document.getElementById("receiptReviewClose")?.addEventListener("click", () => modal.remove());
  document.getElementById("receiptCancel")?.addEventListener("click", () => modal.remove());
  document.getElementById("receiptSave")?.addEventListener("click", () => saveReviewedReceipt(receipt));
}

function receiptCategoryField(value){
  const categories = [
    "Fahrzeug",
    "Kraftstoff",
    "Material",
    "Werkzeug",
    "Büro",
    "Versicherung",
    "Telefon / Internet",
    "Werbung",
    "Fremdleistungen",
    "Sonstiges"
  ];

  return `
    <label style="display:flex;flex-direction:column;gap:5px;">
      <span style="font-weight:600;">Kategorie</span>
      <select id="receiptCategory" style="width:100%;box-sizing:border-box;padding:11px;border:1px solid #d7ddd8;border-radius:10px;background:#fff;">
        <option value="">Bitte auswählen</option>
        ${categories.map(category => `
          <option value="${esc(category)}" ${category === value ? "selected" : ""}>${esc(category)}</option>
        `).join("")}
      </select>
    </label>
  `;
}

function dateInputValue(value){
  const s = String(value || "").trim();
  if(!s) return "";

  // Bereits korrektes HTML-Datumsformat
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Deutsches Format: TT.MM.JJJJ
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if(m){
    return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
  }

  // Weitere häufige OCR-Formate
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if(m){
    return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
  }

  return s;
}

function receiptField(id,label,value,type="text"){
  return `
    <label style="display:flex;flex-direction:column;gap:5px;">
      <span style="font-weight:600;">${esc(label)}</span>
      <input id="${id}" type="${type}" value="${esc(value)}" style="width:100%;box-sizing:border-box;padding:11px;border:1px solid #d7ddd8;border-radius:10px;">
    </label>
  `;
}

function getReceiptDateForSave(){
  const el = document.getElementById("receiptDate");
  if(!el) return "";

  // Bei type=date liefert .value normalerweise YYYY-MM-DD.
  // Falls der Browser/Cache hier trotzdem leer liefert, greifen wir auf
  // den gesetzten value-Attributwert zurück.
  let value = String(el.value || el.getAttribute("value") || "").trim();

  if(/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  // Deutsches Anzeigeformat sicherheitshalber ebenfalls akzeptieren.
  const m = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if(m){
    return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
  }

  const m2 = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if(m2){
    return `${m2[3]}-${String(m2[2]).padStart(2,"0")}-${String(m2[1]).padStart(2,"0")}`;
  }

  return value;
}

function moneyInputValue(value){
  if(value === null || value === undefined || value === "") return "";
  return String(Number(value)).replace(".",",");
}

function parseUiMoney(value){
  const s = String(value || "").trim().replace(/\./g,"").replace(",",".");
  const n = Number(s);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
}

async function saveReviewedReceipt(originalReceipt){
  const status = document.getElementById("receiptSaveStatus");
  const saveBtn = document.getElementById("receiptSave");
  if(saveBtn) saveBtn.disabled = true;
  if(status) status.textContent = "Beleg wird gespeichert …";

  try {
    const { data:{ session } } = await sb.auth.getSession();
    if(!session?.access_token) throw new Error("Keine aktive Anmeldung vorhanden.");

    const receipt = {
      ...originalReceipt,
      lieferant: document.getElementById("receiptSupplier")?.value.trim() || "",
      rechnungsnummer: document.getElementById("receiptNumber")?.value.trim() || "",
      // Das Datum aus dem OCR-Ergebnis ist die sichere Fallback-Quelle.
      // Damit ist das Speichern nicht davon abhängig, wie der Browser ein
      // type=date-Feld intern behandelt.
      belegdatum: getReceiptDateForSave() || dateInputValue(originalReceipt?.belegdatum),
      kategorie: document.getElementById("receiptCategory")?.value.trim() || "",
      netto: parseUiMoney(document.getElementById("receiptNet")?.value),
      mwst: parseUiMoney(document.getElementById("receiptVat")?.value) ?? 0,
      brutto: parseUiMoney(document.getElementById("receiptGross")?.value),
      beschreibung: document.getElementById("receiptDescription")?.value.trim() || "Beleg"
    };

    receipt.betrag = receipt.brutto;

    if(!receipt.belegdatum){
      // Letzter Fallback: OCR-Datum direkt übernehmen.
      receipt.belegdatum = dateInputValue(originalReceipt?.belegdatum);
    }
    if(!receipt.belegdatum) throw new Error("Bitte ein Belegdatum eintragen.");
    if(receipt.brutto === null) throw new Error("Bitte einen Bruttobetrag eintragen.");

    const { data: saved, error } = await sb.from("belege").insert({
      lieferant: receipt.lieferant,
      rechnungsnummer: receipt.rechnungsnummer || null,
      beschreibung: receipt.beschreibung,
      belegdatum: receipt.belegdatum,
      netto: receipt.netto,
      mwst: receipt.mwst,
      brutto: receipt.brutto,
      betrag: receipt.brutto,
      kategorie: receipt.kategorie,
      dateiname: receipt.dateiname || null,
      mime_type: receipt.mime_type || null,
      drive_datei_id: receipt.drive_datei_id || null,
      drive_url: receipt.drive_url || null,
      erstellt_am: new Date().toISOString()
    }).select().single();

    if(error) throw new Error("Beleg konnte in Supabase nicht gespeichert werden: " + error.message);

    const expensePayload = {
      datum: receipt.belegdatum,
      lieferant: receipt.lieferant,
      beschreibung: receipt.beschreibung,
      betrag: receipt.brutto,
      netto: receipt.netto,
      mwst: receipt.mwst,
      brutto: receipt.brutto,
      kategorie: receipt.kategorie,
      quelle: receipt.dateiname || null,
      rechnungsnummer: receipt.rechnungsnummer || null,
      drive_datei_id: receipt.drive_datei_id || null
    };

    const expenseResult = await sb.from("ausgaben").insert(expensePayload).select("*").single();
    if(expenseResult.error){
      throw new Error("Beleg gespeichert, aber Ausgabe konnte nicht gespeichert werden: " + expenseResult.error.message);
    }

    // Sicherheitskorrektur: Bei älteren/abweichenden Ausgaben-Schemata kann
    // der Betrag durch einen Default/Trigger als 0 zurückkommen. Deshalb
    // setzen wir die finanziellen Werte nach dem Insert nochmals explizit.
    if(expenseResult.data?.id){
      const { error: expenseUpdateError } = await sb
        .from("ausgaben")
        .update({
          datum: receipt.belegdatum,
          lieferant: receipt.lieferant,
          beschreibung: receipt.beschreibung,
          betrag: Number(receipt.brutto),
          netto: receipt.netto == null ? null : Number(receipt.netto),
          mwst: Number(receipt.mwst || 0),
          brutto: Number(receipt.brutto),
          kategorie: receipt.kategorie,
          quelle: receipt.dateiname || null,
          rechnungsnummer: receipt.rechnungsnummer || null,
          drive_datei_id: receipt.drive_datei_id || null
        })
        .eq("id", expenseResult.data.id);

      if(expenseUpdateError){
        throw new Error("Ausgabe wurde angelegt, konnte aber nicht mit dem Bruttobetrag aktualisiert werden: " + expenseUpdateError.message);
      }
    }

    const sheetResponse = await fetch(cfg.sheetsWebAppUrl, {
      method: "POST",
      headers: { "Content-Type":"text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "saveReceipt",
        accessToken: session.access_token,
        receipt
      })
    });

    const sheetResult = await sheetResponse.json();
    if(!sheetResult.success){
      throw new Error("Beleg und Ausgabe gespeichert, aber Google Sheets meldet einen Fehler: " + (sheetResult.error || "unbekannter Fehler"));
    }

    if(status) status.textContent = "Beleg erfolgreich gespeichert.";
    await loadData();

    setTimeout(() => document.getElementById("receiptReviewModal")?.remove(), 700);

  } catch(error){
    console.error(error);
    if(status) status.textContent = "Fehler: " + error.message;
    if(saveBtn) saveBtn.disabled = false;
  }
}

function setupEvaluationControls(){
  const select = document.getElementById("evaluationYearSelect");
  if(!select) return;

  const years = new Set([new Date().getFullYear()]);
  [...dataCache.income, ...dataCache.expense].forEach(row => {
    const year = String(row.datum || "").slice(0,4);
    if(/^\d{4}$/.test(year)) years.add(Number(year));
  });

  const current = Number(select.value) || new Date().getFullYear();
  select.innerHTML = [...years].sort((a,b) => b-a)
    .map(year => `<option value="${year}">${year}</option>`).join("");
  select.value = years.has(current) ? String(current) : String(Math.max(...years));

  select.onchange = () => renderEvaluation(Number(select.value));
}

setupReceiptScanner();
setupEvaluationControls();
init();