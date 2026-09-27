const cfg = window.HASTREITER_CONFIG || {};
let sb = null;
let dataCache = { income: [], expense: [], orders: [], requests: [], appointments: [], cleaning: [], receipts: [] };

const euro = n => new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(n||0));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

function showSection(id){
  document.querySelectorAll(".section").forEach(x=>x.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
  document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active", x.dataset.section===id));
  const titles = {dashboard:"Dashboard",anfragen:"Anfragen",einnahmen:"Einnahmen",ausgaben:"Ausgaben",belege:"Belege",auftraege:"Aufträge",reinigung:"Reinigung",kalender:"Kalender",auswertungen:"Auswertungen"};
  document.getElementById("pageTitle").textContent = titles[id] || "Hastreiter";
  document.querySelector(".sidebar")?.classList.remove("open");
}
document.querySelectorAll("[data-section]").forEach(b=>b.addEventListener("click",()=>showSection(b.dataset.section)));
document.querySelectorAll("[data-section-link]").forEach(b=>b.addEventListener("click",()=>showSection(b.dataset.sectionLink)));
document.getElementById("menuBtn")?.addEventListener("click",()=>document.querySelector(".sidebar").classList.toggle("open"));

async function init(){
  if(!window.supabase){
    document.getElementById("connectionStatus").textContent="Supabase-Bibliothek nicht geladen";
    document.getElementById("loginError").textContent="Die Supabase-Bibliothek konnte nicht geladen werden. Bitte Seite mit Strg+F5 neu laden.";
    return;
  }
  if(!cfg.supabaseUrl || !cfg.supabaseAnonKey || cfg.supabaseAnonKey.includes("HIER_")){
    document.getElementById("connectionStatus").textContent="Supabase-Konfiguration fehlt";
    document.getElementById("loginError").textContent="Die Supabase-Konfiguration wurde nicht geladen.";
    return;
  }
  sb = window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
  const {data:{session}} = await sb.auth.getSession();
  if(session) enterApp(session);
  else document.getElementById("loginScreen").classList.remove("hidden");
  sb.auth.onAuthStateChange((_event,session)=>{ if(session) enterApp(session); });
}

async function login(e){
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;
  const err = document.getElementById("loginError");
  err.textContent="";
  if(email !== cfg.adminEmail.toLowerCase()){
    err.textContent="Diese E-Mail ist für den internen Hastreiter-Login nicht freigeschaltet.";
    return;
  }
  if(!sb){err.textContent="Supabase ist noch nicht konfiguriert.";return;}
  const {error}=await sb.auth.signInWithPassword({email,password});
  if(error) err.textContent=error.message;
}
document.getElementById("loginForm").addEventListener("submit",login);

async function enterApp(){
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("connectionStatus").textContent="Verbunden";
  await loadData();
}

document.getElementById("logoutBtn").addEventListener("click",async()=>{if(sb) await sb.auth.signOut();location.reload();});

async function loadData(){
  if(!sb)return;
  const [income,expense,orders,requests,appointments,cleaning,receipts] = await Promise.all([
    sb.from("einnahmen").select("*").order("datum",{ascending:false}),
    sb.from("ausgaben").select("*").order("datum",{ascending:false}),
    sb.from("auftraege").select("*").order("startdatum",{ascending:true}),
    sb.from("anfragen").select("*").order("erstellt_am",{ascending:false}),
    sb.from("termine").select("*").order("datum",{ascending:true}).limit(10),
    sb.from("reinigungsauftraege").select("*").order("datum",{ascending:true}),
    sb.from("belege").select("*").order("erstellt_am",{ascending:false})
  ]);
  dataCache = {
    income:income.data||[],expense:expense.data||[],orders:orders.data||[],requests:requests.data||[],
    appointments:appointments.data||[],cleaning:cleaning.data||[],receipts:receipts.data||[]
  };
  render();
}

function render(){
  const month = new Date().toISOString().slice(0,7);
  const mi = dataCache.income.filter(x=>String(x.datum||"").slice(0,7)===month).reduce((s,x)=>s+Number(x.betrag||0),0);
  const me = dataCache.expense.filter(x=>String(x.datum||"").slice(0,7)===month).reduce((s,x)=>s+Number(x.betrag||0),0);
  const openOrders = dataCache.orders.filter(x=>!["Erledigt","Storniert"].includes(x.status)).length;
  const newRequests = dataCache.requests.filter(x=>(x.status||"Neu")==="Neu").length;
  document.getElementById("statIncome").textContent=euro(mi);
  document.getElementById("statExpense").textContent=euro(me);
  document.getElementById("statOrders").textContent=openOrders;
  document.getElementById("statRequests").textContent=newRequests;
  document.getElementById("requestBadge").textContent=newRequests;
  document.getElementById("totalIncome").textContent=euro(dataCache.income.reduce((s,x)=>s+Number(x.betrag||0),0));
  document.getElementById("totalExpense").textContent=euro(dataCache.expense.reduce((s,x)=>s+Number(x.betrag||0),0));
  document.getElementById("totalResult").textContent=euro(dataCache.income.reduce((s,x)=>s+Number(x.betrag||0),0)-dataCache.expense.reduce((s,x)=>s+Number(x.betrag||0),0));

  list("requestsList",dataCache.requests,r=>`<div class="item-card"><div><b>${esc(r.leistung)}</b><div>${esc(r.name)} · ${esc(r.ort||"")}</div><small>${esc(r.beschreibung||"Keine Beschreibung")}</small></div><span class="badge">${esc(r.status||"Neu")}</span></div>`);
  list("incomeList",dataCache.income,r=>`<div class="item-card"><div><b>${esc(r.datum)}</b><div>${esc(r.beschreibung||"Einnahme")}</div></div><strong>${euro(r.betrag)}</strong></div>`);
  list("expenseList",dataCache.expense,r=>`<div class="item-card"><div><b>${esc(r.datum)}</b><div>${esc(r.lieferant||r.beschreibung||"Ausgabe")}</div></div><strong>${euro(r.betrag)}</strong></div>`);
  list("ordersList",dataCache.orders,r=>`<div class="item-card"><div><b>${esc(r.titel)}</b><div>${esc(r.leistung||"")}</div></div><span class="badge">${esc(r.status||"Offen")}</span></div>`);
  list("cleaningList",dataCache.cleaning,r=>`<div class="item-card"><div><b>${esc(r.art_der_reinigung||"Reinigung")}</b><div>${esc(r.objekt||"")}</div></div><span class="badge">${esc(r.status||"Offen")}</span></div>`);
  list("receiptList",dataCache.receipts,r=>`<div class="item-card"><div><b>${esc(r.lieferant||"Beleg")}</b><div>${esc(r.belegdatum||"")}</div></div><strong>${r.betrag!=null?euro(r.betrag):"—"}</strong></div>`);
  list("calendarList",dataCache.appointments,r=>`<div class="calendar-row"><b>${esc(r.datum)} · ${esc(r.startzeit||"")}</b><div>${esc(r.titel)}</div></div>`);
  list("nextAppointments",dataCache.appointments.slice(0,4),r=>`<div class="list-row"><div><b>${esc(r.titel)}</b><small>${esc(r.datum)} · ${esc(r.startzeit||"")}</small></div><span>›</span></div>`);
  drawChart();
}
function list(id,items,fn){
  const el=document.getElementById(id); if(!el)return;
  el.innerHTML=items.length?items.map(fn).join(""):`<div class="empty">Noch keine Daten vorhanden.</div>`;
}
function drawChart(){
  const c=document.getElementById("financeChart"); if(!c)return;
  const ctx=c.getContext("2d"), w=c.width, h=c.height;
  ctx.clearRect(0,0,w,h); ctx.strokeStyle="#dce5df"; ctx.fillStyle="#6c7770"; ctx.font="12px Arial";
  const months=[...Array(6)].map((_,i)=>{const d=new Date();d.setMonth(d.getMonth()-5+i);return d});
  const vals=months.map(d=>{const m=d.toISOString().slice(0,7);return [
    dataCache.income.filter(x=>String(x.datum||"").slice(0,7)===m).reduce((s,x)=>s+Number(x.betrag||0),0),
    dataCache.expense.filter(x=>String(x.datum||"").slice(0,7)===m).reduce((s,x)=>s+Number(x.betrag||0),0)
  ]});
  const max=Math.max(100,...vals.flat())*1.15, base=h-35, plotH=h-60, bw=22, gap=75;
  ctx.beginPath();ctx.moveTo(35,15);ctx.lineTo(35,base);ctx.lineTo(w-10,base);ctx.stroke();
  vals.forEach((v,i)=>{const x=55+i*gap;const hi=(v[0]/max)*plotH, he=(v[1]/max)*plotH;
    ctx.fillStyle="#1b9149";ctx.fillRect(x,base-hi,bw,hi);
    ctx.fillStyle="#ed7412";ctx.fillRect(x+bw+4,base-he,bw,he);
    ctx.fillStyle="#6c7770";ctx.fillText(months[i].toLocaleDateString("de-DE",{month:"short"}),x,base+18);
  });
}
document.getElementById("receiptFile")?.addEventListener("change",e=>{
  if(e.target.files[0]) alert("Beleg ausgewählt. Die OCR-Verarbeitung bauen wir im nächsten Schritt an.");
});
init();
