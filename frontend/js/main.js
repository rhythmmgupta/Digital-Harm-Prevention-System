const API = "http://127.0.0.1:5001";

function closeForms() {
  ["moneyForm","sensitiveForm","deleteForm","folderForm","linkForm"].forEach(id => {
    var el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}

function openMoneyForm()    { closeForms(); document.getElementById("moneyForm").style.display    = "flex"; }
function openSensitiveForm(){ closeForms(); document.getElementById("sensitiveForm").style.display = "flex"; }
function openDeleteForm()   { closeForms(); document.getElementById("deleteForm").style.display   = "flex"; }
function openFolderForm()   { closeForms(); document.getElementById("folderForm").style.display   = "flex"; }
function openLinkForm()     { closeForms(); document.getElementById("linkForm").style.display     = "flex"; }

/* ── helper: call backend, fall back to local fn if server down ── */
async function callAPI(endpoint, body, fallbackFn) {
  try {
    var controller = new AbortController();
    var t = setTimeout(() => controller.abort(), 5000);
    var res = await fetch(API + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(t);
    if (res.ok) return { ...(await res.json()), source: "AI Server" };
  } catch(e) {}
  return { ...fallbackFn(body), source: "Local Engine" };
}

/* ── MONEY TRANSFER ──────────────────────────────────────────── */
function processMoney() {
  var amount    = parseFloat(document.getElementById("amount").value);
  var recipient = document.getElementById("recipient").value;
  var risk = 0;
  if (amount > 50000) risk += 40;
  if (recipient.toLowerCase() === "unknown") risk += 40;
  risk += Math.floor(Math.random() * 20);
  var decision = risk < 40 ? "ALLOW" : risk < 70 ? "WARNING" : "BLOCKED";
  updateRisk(risk);
  addLog("Money Transfer", risk, decision);
  document.getElementById("moneyResult").innerText = "AI Decision: " + decision;
}

/* ── SENSITIVE INFO SCANNER ──────────────────────────────────── */
async function scanSensitive() {
  var text   = document.getElementById("sensitiveText").value;
  var resEl  = document.getElementById("sensitiveResult");
  resEl.style.color = "var(--text-dim)";
  resEl.innerText   = "⏳ Scanning...";

  function localFallback(b) {
    var t = b.text.toLowerCase(), risk = 0;
    if (t.includes("password")) risk += 40;
    if (t.includes("otp"))      risk += 40;
    if (t.includes("card"))     risk += 40;
    risk += Math.floor(Math.random() * 20);
    return { risk: Math.min(risk,100), decision: risk > 60 ? "BLOCKED" : "WARNING",
             message: risk > 60 ? "Highly sensitive data detected." : "Potentially sensitive content." };
  }

  var data = await callAPI("/scan-sensitive", { text }, localFallback);

  resEl.style.color = data.decision === "BLOCKED" ? "var(--red)"
                    : data.decision === "WARNING"  ? "var(--orange)" : "var(--green)";
  resEl.innerText   = data.decision + "  |  Risk: " + data.risk + "%  |  " + data.message
                    + "  [" + data.source + "]";
  updateRisk(data.risk);
  addLog("Sensitive Info Share", data.risk, data.decision);
}

/* ── FILE DELETION ───────────────────────────────────────────── */
async function deleteFile() {
  var filename = document.getElementById("fileName").value.trim();
  var resEl    = document.getElementById("deleteResult");
  if (!filename) { resEl.innerText = "⚠ Enter a filename."; return; }

  resEl.style.color = "var(--text-dim)";
  resEl.innerText   = "⏳ Checking file...";

  function localFallback(b) {
    var f    = b.filename.toLowerCase();
    var risk = 10 + Math.floor(Math.random() * 50);
    var protected_ = ["system","passwd","shadow",".ssh","config",".env","secret","key","backup"];
    protected_.forEach(p => { if (f.includes(p)) risk += 40; });
    risk = Math.min(risk, 100);
    return { risk, decision: risk >= 60 ? "BLOCKED" : risk >= 35 ? "WARNING" : "ALLOW",
             message: "File checked by local engine." };
  }

  var data = await callAPI("/check-delete", { filename }, localFallback);

  resEl.style.color = data.decision === "BLOCKED" ? "var(--red)"
                    : data.decision === "WARNING"  ? "var(--orange)" : "var(--green)";
  resEl.innerText   = data.decision + "  |  Risk: " + data.risk + "%  |  " + data.message
                    + "  [" + data.source + "]";
  updateRisk(data.risk);
  addLog("File Deletion: " + filename, data.risk, data.decision);
}

/* ── PRIVATE FOLDER ACCESS ───────────────────────────────────── */
async function checkFolderAccess() {
  var password = document.getElementById("folderPassword").value;
  var resEl    = document.getElementById("folderResult");
  resEl.style.color = "var(--text-dim)";
  resEl.innerText   = "⏳ Verifying...";

  function localFallback(b) {
    var risk = b.password !== "secure123" ? 70 : 0;
    return { risk, decision: risk > 50 ? "BLOCKED" : "ACCESS GRANTED",
             message: risk > 50 ? "Incorrect password." : "Authentication successful." };
  }

  var data = await callAPI("/folder-access", { password }, localFallback);

  resEl.style.color = data.decision === "ACCESS GRANTED" ? "var(--green)"
                    : data.decision === "BLOCKED" ? "var(--red)" : "var(--orange)";
  resEl.innerText   = data.decision + "  |  " + data.message + "  [" + data.source + "]";
  updateRisk(data.risk);
  addLog("Private Folder Access", data.risk, data.decision);
}

/* ── URL / PHISHING SCANNER ──────────────────────────────────── */
async function scanURL() {
  var url   = document.getElementById("urlInput").value.trim();
  var resEl = document.getElementById("urlResult");
  if (!url) { resEl.innerText = "⚠ Enter a URL."; return; }

  resEl.style.color = "var(--text-dim)";
  resEl.innerText   = "⏳ Scanning URL...";

  function localFallback(b) {
    var u = b.url.toLowerCase(), risk = 0;
    if (u.includes("free"))   risk += 30;
    if (u.includes("login"))  risk += 30;
    if (u.includes("verify")) risk += 30;
    if (u.startsWith("http://")) risk += 15;
    return { risk: Math.min(risk,100), decision: risk > 50 ? "PHISHING DETECTED" : risk > 25 ? "SUSPICIOUS" : "SAFE",
             message: "Scanned by local engine." };
  }

  var data = await callAPI("/scan-url", { url }, localFallback);

  resEl.style.color = data.decision === "PHISHING DETECTED" ? "var(--red)"
                    : data.decision === "SUSPICIOUS"        ? "var(--orange)" : "var(--green)";
  resEl.innerText   = data.decision + "  |  Risk: " + data.risk + "%  |  " + data.message
                    + "  [" + data.source + "]";
  updateRisk(data.risk);
  addLog("URL Scan: " + url, data.risk, data.decision);
}

/* ── RISK + LOG (keep existing behaviour) ────────────────────── */
function updateRisk(score) {
  document.getElementById("riskScore").innerText = "Risk Score: " + score;
  var bar = document.getElementById("riskFill");
  bar.style.width      = score + "%";
  bar.style.background = score < 40 ? "var(--green)" : score < 70 ? "var(--orange)" : "var(--red)";
}

function addLog(action, risk, decision) {
  var table = document.getElementById("logTable");
  var row   = table.insertRow(0);   // newest on top
  row.insertCell(0).innerText = new Date().toLocaleTimeString();
  row.insertCell(1).innerText = action;
  row.insertCell(2).innerText = risk;
  row.insertCell(3).innerText = decision;
}
