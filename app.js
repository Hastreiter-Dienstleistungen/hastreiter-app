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

const euro = n => new Intl.NumberFormat("de-DE", {
  style: "currency", currency: "EUR"
}).format(Number(n || 0));

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
  const month = new Date().toISOString().slice(0,7);

  const mi = dataCache.income
    .filter(x => String(x.datum || "").slice(0,7) === month)
    .reduce((s,x) => s + Number(x.betrag || 0), 0);

  const me = dataCache.expense
    .filter(x => String(x.datum || "").slice(0,7) === month)
    .reduce((s,x) => s + Number(x.betrag || 0), 0);

  const openOrders = dataCache.orders
    .filter(x => !["Erledigt","Storniert"].includes(x.status)).length;

  const newRequests = dataCache.requests
    .filter(x => (x.status || "Neu") === "Neu").length;

  setText("statIncome", euro(mi));
  setText("statExpense", euro(me));
  setText("statOrders", openOrders);
  setText("statRequests", newRequests);
  setText("requestBadge", newRequests);

  const totalIncome = dataCache.income.reduce((s,x) => s + Number(x.betrag || 0), 0);
  const totalExpense = dataCache.expense.reduce((s,x) => s + Number(x.betrag || 0), 0);

  setText("totalIncome", euro(totalIncome));
  setText("totalExpense", euro(totalExpense));
  setText("totalResult", euro(totalIncome - totalExpense));

  renderRequests();
  list("incomeList", dataCache.income, r =>
    `<div class="item-card">
      <div><b>${esc(r.datum)}</b><div>${esc(r.beschreibung || "Einnahme")}</div></div>
      <strong>${euro(r.betrag)}</strong>
    </div>`
  );

  list("expenseList", dataCache.expense, r =>
    `<div class="item-card">
      <div><b>${esc(r.datum)}</b><div>${esc(r.lieferant || r.beschreibung || "Ausgabe")}</div></div>
      <strong>${euro(r.betrag)}</strong>
    </div>`
  );

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

  list("receiptList", dataCache.receipts, r =>
    `<div class="item-card">
      <div><b>${esc(r.lieferant || "Beleg")}</b><div>${esc(r.belegdatum || "")}</div></div>
      <strong>${r.betrag != null ? euro(r.betrag) : "—"}</strong>
    </div>`
  );

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
          <button type="button" class="btn-secondary request-offer"
                  data-request-id="${esc(id)}">
            Daten für Angebot
          </button>

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
    "Angebot erstellen",
    "Angebot versendet",
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

  document.querySelectorAll(".request-offer").forEach(button => {
    button.addEventListener("click", e => {
      const id = e.target.dataset.requestId;
      const r = dataCache.requests.find(x =>
        String(x.id || x.anfrage_id || "") === String(id)
      );

      if(!r) return;

      const text =
`Daten für Angebot

Name: ${r.name || ""}
Telefon: ${r.telefon || ""}
E-Mail: ${r.email || ""}
Adresse: ${r.strasse || ""}, ${r.plz || ""} ${r.ort || ""}
Leistung: ${r.leistung || ""}
Beschreibung: ${r.beschreibung || ""}
Terminwunsch: ${r.gewuenschter_termin || ""}
Uhrzeit: ${r.uhrzeit || ""}
Häufigkeit: ${r.haeufigkeit || ""}`;

      navigator.clipboard?.writeText(text)
        .then(() => alert("Die Kundendaten wurden für das Angebot in die Zwischenablage kopiert."))
        .catch(() => alert(text));
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

  const months = [...Array(6)].map((_,i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5 + i);
    return d;
  });

  const vals = months.map(d => {
    const m = d.toISOString().slice(0,7);
    return [
      dataCache.income.filter(x => String(x.datum || "").slice(0,7) === m)
        .reduce((s,x) => s + Number(x.betrag || 0),0),
      dataCache.expense.filter(x => String(x.datum || "").slice(0,7) === m)
        .reduce((s,x) => s + Number(x.betrag || 0),0)
    ];
  });

  const max = Math.max(100,...vals.flat()) * 1.15;
  const base = h - 35;
  const plotH = h - 60;
  const bw = 22;
  const gap = 75;

  ctx.beginPath();
  ctx.moveTo(35,15);
  ctx.lineTo(35,base);
  ctx.lineTo(w-10,base);
  ctx.stroke();

  vals.forEach((v,i) => {
    const x = 55 + i * gap;
    const hi = (v[0]/max) * plotH;
    const he = (v[1]/max) * plotH;

    ctx.fillStyle = "#1b9149";
    ctx.fillRect(x,base-hi,bw,hi);

    ctx.fillStyle = "#ed7412";
    ctx.fillRect(x+bw+4,base-he,bw,he);

    ctx.fillStyle = "#6c7770";
    ctx.fillText(
      months[i].toLocaleDateString("de-DE",{month:"short"}),
      x,
      base+18
    );
  });
}

document.getElementById("receiptFile")?.addEventListener("change", e => {
  if(e.target.files[0]){
    alert("Beleg ausgewählt. Die OCR-Verarbeitung bauen wir im nächsten Schritt an.");
  }
});

init();
