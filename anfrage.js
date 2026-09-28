const cfg = window.HASTREITER_CONFIG || {};
const sb = window.supabase?.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

const form = document.getElementById("requestForm");
const msg = document.getElementById("message");
const btn = document.getElementById("submitBtn");
const timeSelect = document.getElementById("uhrzeit");
const frequency = document.getElementById("haeufigkeit");
const regularWrap = document.getElementById("regelmaessigWrap");

for(let h=7; h<=18; h++){
  const o=document.createElement("option");
  o.value=String(h).padStart(2,"0")+":00";
  o.textContent=o.value;
  timeSelect.appendChild(o);
}

frequency.addEventListener("change",()=>{
  regularWrap.classList.toggle("hidden", frequency.value !== "Regelmäßig");
});

function show(type,text){
  msg.className="message "+type;
  msg.textContent=text;
}

function makeId(){
  return "ANF-"+Date.now()+"-"+Math.floor(Math.random()*9000+1000);
}

async function syncSheets(data){
  if(!cfg.sheetsWebAppUrl) return {sent:false};
  try{
    const r=await fetch(cfg.sheetsWebAppUrl,{
      method:"POST",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify({action:"createRequest",...data})
    });
    let result=null;
    try{result=await r.json()}catch(_){}
    return {sent:true,result};
  }catch(error){
    console.error(error);
    return {sent:false,error:error.message};
  }
}

form.addEventListener("submit",async e=>{
  e.preventDefault();

  if(!sb){
    show("error","Die Anfrage-Seite konnte keine Verbindung herstellen. Bitte später erneut versuchen.");
    return;
  }

  btn.disabled=true;
  btn.textContent="Anfrage wird gesendet …";
  msg.className="message";
  msg.textContent="";

  const fd=new FormData(form);
  const interval = fd.get("regelmaessig_intervall") || "";

  const request={
    name:String(fd.get("name")||"").trim(),
    telefon:String(fd.get("telefon")||"").trim(),
    email:String(fd.get("email")||"").trim(),
    strasse:String(fd.get("strasse")||"").trim(),
    plz:String(fd.get("plz")||"").trim(),
    ort:String(fd.get("ort")||"").trim(),
    leistung:String(fd.get("leistung")||"").trim(),
    beschreibung:String(fd.get("beschreibung")||"").trim(),
    gewuenschter_termin:String(fd.get("gewuenschter_termin")||"").trim(),
    uhrzeit:String(fd.get("uhrzeit")||"").trim(),
    haeufigkeit:String(fd.get("haeufigkeit")||"Einmalig").trim(),
    status:"Neu"
  };

  if(request.haeufigkeit==="Regelmäßig" && interval){
    request.beschreibung += "\nIntervall: "+interval;
  }

  try{
    const {data,error}=await sb.from("anfragen").insert(request).select().single();
    if(error) throw error;

    const sheet=await syncSheets({
      anfrage_id:data.id || makeId(),
      erstellt_am:data.erstellt_am || new Date().toISOString(),
      ...request
    });

    if(!sheet.sent){
      show("success","Vielen Dank! Ihre Anfrage wurde erfolgreich übermittelt. Die Anfrage wird intern weiterverarbeitet.");
    }else{
      show("success","Vielen Dank! Ihre Anfrage wurde erfolgreich übermittelt.");
    }

    form.reset();
    regularWrap.classList.add("hidden");

  }catch(error){
    console.error(error);
    show("error","Die Anfrage konnte leider nicht gesendet werden. Bitte versuchen Sie es später erneut.");
  }finally{
    btn.disabled=false;
    btn.textContent="Anfrage absenden";
  }
});
