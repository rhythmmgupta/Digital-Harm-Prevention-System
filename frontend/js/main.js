/* ═══════════════════════════════════════════════════════════════
   DHPS  –  main.js   (AI-powered action simulator)
   All 5 actions use the Anthropic Claude API for analysis,
   with rich animated UIs matching the Send Money quality level.
═══════════════════════════════════════════════════════════════ */

const API = "http://127.0.0.1:5001";

/* ── MODAL HELPERS ───────────────────────────────────────────── */
function closeForms() {
  ["moneyForm","sensitiveForm","deleteForm","folderForm","linkForm"].forEach(id => {
    var el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}
function openMoneyForm()    { closeForms(); document.getElementById("moneyForm").style.display    = "flex"; }
function openSensitiveForm(){ closeForms(); document.getElementById("sensitiveForm").style.display = "flex"; resetSensitiveUI(); }
function openDeleteForm()   { closeForms(); document.getElementById("deleteForm").style.display   = "flex"; resetDeleteUI(); }
function openFolderForm()   { closeForms(); document.getElementById("folderForm").style.display   = "flex"; }
function openLinkForm()     { closeForms(); document.getElementById("linkForm").style.display     = "flex"; resetLinkUI(); }

/* ── RISK + LOG ──────────────────────────────────────────────── */
function updateRisk(score) {
  document.getElementById("riskScore").innerText = "Risk Score: " + score;
  var bar = document.getElementById("riskFill");
  bar.style.width      = score + "%";
  bar.style.background = score < 40 ? "var(--green)" : score < 70 ? "var(--orange)" : "var(--red)";
}
function addLog(action, risk, decision) {
  var table = document.getElementById("logTable");
  var row   = table.insertRow(0);
  row.insertCell(0).innerText = new Date().toLocaleTimeString();
  row.insertCell(1).innerText = action;
  row.insertCell(2).innerText = risk;
  row.insertCell(3).innerText = decision;
}

/* ── CLAUDE API CALL ─────────────────────────────────────────── */
async function askClaude(systemPrompt, userMessage) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }]
      })
    });
    if (!res.ok) throw new Error("API error " + res.status);
    const data = await res.json();
    return data.content[0].text;
  } catch(e) {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════
   1. MONEY TRANSFER  (unchanged — already rich)
══════════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════════
   2. SENSITIVE INFO SCANNER  –  AI-powered deep scan
══════════════════════════════════════════════════════════════ */
function resetSensitiveUI() {
  var card = document.getElementById("sensitiveResultCard");
  if (card) card.style.display = "none";
  var prog = document.getElementById("sensitiveProgress");
  if (prog) prog.style.display = "none";
  var stagesEl = document.getElementById("sensitiveStages");
  if (stagesEl) stagesEl.innerHTML = "";
  var tagsEl = document.getElementById("sensitiveFoundTags");
  if (tagsEl) tagsEl.innerHTML = "";
}

function updateSensitiveCharCount(el) {
  var counter = document.getElementById("sensitiveCharCount");
  if (counter) counter.textContent = el.value.length + " chars";
}

async function scanSensitive() {
  var text = document.getElementById("sensitiveText").value.trim();
  var resEl = document.getElementById("sensitiveResult");
  if (!text) {
    resEl.style.display = "block";
    resEl.style.color = "var(--orange)";
    resEl.innerText = "⚠ Please enter some text to scan.";
    return;
  }
  resEl.style.display = "none";

  var prog      = document.getElementById("sensitiveProgress");
  var progBar   = document.getElementById("sensitiveProgressBar");
  var stagesEl  = document.getElementById("sensitiveStages");
  var card      = document.getElementById("sensitiveResultCard");

  card.style.display   = "none";
  prog.style.display   = "block";
  progBar.style.width  = "0%";
  stagesEl.innerHTML   = "";

  var stages = ["Tokenising input...","Pattern matching PII...","Credential detection...","Financial data scan...","Entropy analysis...","Consulting AI engine..."];
  for (var i = 0; i < stages.length; i++) {
    await sleep(200);
    appendStage(stagesEl, stages[i]);
    progBar.style.width = Math.round((i + 1) / stages.length * 80) + "%";
  }

  var localResult = localSensitiveScan(text);

  var aiResult = null;
  var rawAI = await askClaude(
    `You are a cybersecurity data-loss-prevention (DLP) engine. 
Analyse the given text for sensitive information. 
Respond ONLY with valid JSON — no preamble, no markdown fences.
JSON schema:
{
  "risk": <integer 0-100>,
  "decision": <"SAFE"|"WARNING"|"BLOCKED">,
  "detected": [<list of detected sensitive categories as strings>],
  "message": <short explanation string, max 120 chars>,
  "details": [<array of 2-4 specific findings as strings>]
}
Categories to detect: passwords, OTP/2FA codes, credit/debit card numbers, CVV, bank account numbers, IFSC codes, Aadhaar numbers, PAN numbers, API keys, private keys, tokens/secrets, email addresses, phone numbers, UPI IDs, social security numbers, passport numbers.
Be strict. If something looks like a password or key pattern, flag it.`,
    `Analyse this text for sensitive data:\n\n"${text}"`
  );

  if (rawAI) {
    try {
      var clean = rawAI.replace(/```json|```/g, "").trim();
      aiResult = JSON.parse(clean);
    } catch(e) { aiResult = null; }
  }

  progBar.style.width = "100%";
  await sleep(300);
  prog.style.display = "none";

  var result = aiResult || localResult;
  var source = aiResult ? "Claude AI" : "Local Engine";

  var color  = result.decision === "BLOCKED" ? "var(--red)" : result.decision === "WARNING" ? "var(--orange)" : "var(--green)";
  var icon   = result.decision === "BLOCKED" ? "🚫" : result.decision === "WARNING" ? "⚠️" : "✅";
  var bgRgb  = result.decision === "BLOCKED" ? "255,59,92" : result.decision === "WARNING" ? "255,184,0" : "0,255,136";

  card.style.display     = "block";
  card.style.borderColor = `rgba(${bgRgb},0.4)`;
  card.style.background  = `rgba(${bgRgb},0.05)`;

  document.getElementById("sensitiveResultIcon").innerHTML  = icon;
  document.getElementById("sensitiveResultTitle").style.color = color;
  document.getElementById("sensitiveResultTitle").textContent = result.decision;
  document.getElementById("sensitiveResultSub").textContent   = result.message || "";
  document.getElementById("sensitiveRiskNum").style.color     = color;
  document.getElementById("sensitiveRiskNum").textContent     = result.risk + "%";

  var srcEl = document.getElementById("sensitiveSourceBadge");
  if (srcEl) { srcEl.textContent = source; srcEl.style.color = aiResult ? "var(--cyan)" : "var(--text-dim)"; }

  var tagsEl = document.getElementById("sensitiveFoundTags");
  tagsEl.innerHTML = "";
  var detected = result.detected || [];
  if (detected.length === 0 && result.decision !== "SAFE") detected = ["Sensitive Data"];
  detected.forEach(function(f) {
    var tag = document.createElement("span");
    tag.style.cssText = "font-family:var(--font-mono);font-size:9px;padding:3px 10px;background:rgba(255,59,92,0.1);border:1px solid rgba(255,59,92,0.35);color:var(--red);letter-spacing:1px;display:inline-block;margin:2px;";
    tag.textContent = f.toUpperCase();
    tagsEl.appendChild(tag);
  });

  var detailsEl = document.getElementById("sensitiveDetails");
  if (detailsEl) {
    detailsEl.innerHTML = "";
    (result.details || []).forEach(function(d) {
      var li = document.createElement("div");
      li.style.cssText = "font-family:var(--font-mono);font-size:10px;color:var(--text-dim);padding:3px 0;letter-spacing:0.5px;";
      li.innerHTML = "› " + d;
      detailsEl.appendChild(li);
    });
    detailsEl.style.display = result.details && result.details.length ? "block" : "none";
  }

  updateRisk(result.risk);
  addLog("Sensitive Info Share", result.risk, result.decision);
  resEl.style.display = "none";
}

function localSensitiveScan(text) {
  var risk = 0; var detected = [];
  var checks = [
    { pattern: /password|passwd|pwd/i,                           label: "Password",    score: 40 },
    { pattern: /\botp\b|\b\d{6}\b/i,                            label: "OTP/PIN",     score: 40 },
    { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,  label: "Card Number", score: 50 },
    { pattern: /cvv|cvc/i,                                       label: "CVV",         score: 40 },
    { pattern: /\b\d{12}\b/,                                     label: "Aadhaar",     score: 50 },
    { pattern: /[A-Z]{5}\d{4}[A-Z]/,                            label: "PAN",         score: 40 },
    { pattern: /api.?key|secret.?key|access.?token/i,            label: "API Key",     score: 45 },
    { pattern: /private.?key|-----BEGIN/i,                       label: "Private Key", score: 60 },
    { pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,       label: "Email",       score: 20 },
    { pattern: /\b[6-9]\d{9}\b/,                                 label: "Phone",       score: 25 },
    { pattern: /upi|@[a-z]+bank/i,                               label: "UPI ID",      score: 30 },
    { pattern: /IFSC|[A-Z]{4}0[A-Z0-9]{6}/i,                    label: "IFSC/Bank",   score: 35 },
  ];
  checks.forEach(function(c) {
    if (c.pattern.test(text)) { risk += c.score; detected.push(c.label); }
  });
  risk = Math.min(risk, 100);
  var decision = risk >= 60 ? "BLOCKED" : risk >= 25 ? "WARNING" : "SAFE";
  return { risk, decision, detected, message: detected.length ? "Sensitive data patterns detected." : "No sensitive data detected.", details: detected.map(d => d + " pattern found in text.") };
}

/* ══════════════════════════════════════════════════════════════
   3. SECURE FILE DELETION  –  AI threat assessment
══════════════════════════════════════════════════════════════ */
function resetDeleteUI() {
  var card = document.getElementById("deleteResultCard");
  if (card) card.style.display = "none";
  ["dc-system","dc-ext","dc-hidden","dc-bulk"].forEach(function(id) {
    var el  = document.getElementById(id);
    var val = document.getElementById(id + "-val");
    if (el)  { el.style.borderColor = "var(--border)"; el.style.background = "rgba(255,255,255,0.02)"; }
    if (val) { val.style.color = "var(--text-dim)"; val.textContent = "—"; }
  });
}

function updateFileIcon(val) {
  var icon = "📄"; var v = val.toLowerCase();
  if (v.includes(".key")||v.includes(".pem")||v.includes("id_rsa")) icon = "🔑";
  else if (v.includes(".env")||v.includes("config")||v.includes("secret")) icon = "⚙️";
  else if (v.includes("backup")||v.includes(".bak")) icon = "💾";
  else if (v.includes(".db")||v.includes(".sql")) icon = "🗄️";
  else if (v.includes("*")||v.includes("?")) icon = "⚠️";
  document.getElementById("fileTypeIcon").innerHTML = icon;
  var checks = {
    "dc-system": ["passwd","shadow","sudoers",".ssh","system32","hosts","/etc/","/boot/"],
    "dc-ext":    [".key",".pem",".exe",".dll",".sh",".bash",".env",".secret"],
    "dc-hidden": null,
    "dc-bulk":   ["*","?","%"]
  };
  Object.keys(checks).forEach(function(id) {
    var el    = document.getElementById(id);
    var valEl = document.getElementById(id + "-val");
    var hit   = id === "dc-hidden" ? v.split("/").pop().startsWith(".") : checks[id].some(function(p){return v.includes(p);});
    el.style.borderColor  = hit ? "rgba(255,59,92,0.4)" : "var(--border)";
    el.style.background   = hit ? "rgba(255,59,92,0.06)" : "rgba(255,255,255,0.02)";
    valEl.style.color     = hit ? "var(--red)" : "var(--text-dim)";
    valEl.textContent     = hit ? "DETECTED" : "CLEAR";
  });
}

async function deleteFile() {
  var filename = document.getElementById("fileName").value.trim();
  var resEl    = document.getElementById("deleteResult");
  if (!filename) {
    resEl.style.display = "block"; resEl.style.color = "var(--orange)"; resEl.innerText = "⚠ Enter a file path."; return;
  }
  resEl.style.display = "none";

  var card     = document.getElementById("deleteResultCard");
  var stagesEl = document.getElementById("deleteStages");
  if (!stagesEl) {
    stagesEl = document.createElement("div"); stagesEl.id = "deleteStages"; stagesEl.style.cssText = "margin-bottom:14px;";
    card.parentNode.insertBefore(stagesEl, card);
  }
  card.style.display = "none"; stagesEl.innerHTML = "";

  var stages = ["Parsing file path...","Checking system file index...","Extension threat lookup...","Privilege check...","AI risk assessment..."];
  for (var i = 0; i < stages.length; i++) { await sleep(180); appendStage(stagesEl, stages[i]); }

  var localResult = localDeleteScan(filename);
  var aiResult = null;
  var rawAI = await askClaude(
    `You are a cybersecurity file-system protection engine.
A user wants to delete a file. Assess the risk.
Respond ONLY with valid JSON — no preamble, no markdown fences.
JSON schema:
{
  "risk": <integer 0-100>,
  "decision": <"ALLOW"|"WARNING"|"BLOCKED">,
  "message": <short explanation string, max 120 chars>,
  "threat_type": <string e.g. "System File","Config/Secret","Critical Data","Hidden File","Bulk Operation","Low Risk">,
  "details": [<array of 2-3 specific reasons as strings>],
  "recommendation": <string, what the user should do instead, max 100 chars>
}
Flag BLOCKED: system files (passwd,shadow,.ssh,/etc,/boot,system32), bulk wildcard, .key/.pem/.env, database files.
Flag WARNING: backup files, hidden files, config files, log files.
Flag ALLOW only if clearly safe user files.`,
    `File to delete: "${filename}"`
  );
  if (rawAI) { try { aiResult = JSON.parse(rawAI.replace(/```json|```/g,"").trim()); } catch(e){} }

  stagesEl.innerHTML = "";
  var result = aiResult || localResult;
  var source = aiResult ? "Claude AI" : "Local Engine";
  var color  = result.decision==="BLOCKED"?"var(--red)":result.decision==="WARNING"?"var(--orange)":"var(--green)";
  var icon   = result.decision==="BLOCKED"?"🚫":result.decision==="WARNING"?"⚠️":"✅";
  var bgRgb  = result.decision==="BLOCKED"?"255,59,92":result.decision==="WARNING"?"255,184,0":"0,255,136";

  card.style.display     = "block";
  card.style.borderColor = `rgba(${bgRgb},0.4)`;
  card.style.background  = `rgba(${bgRgb},0.05)`;
  document.getElementById("deleteResultIcon").innerHTML    = icon;
  document.getElementById("deleteResultTitle").style.color = color;
  document.getElementById("deleteResultTitle").textContent = result.decision;
  document.getElementById("deleteRiskNum").style.color     = color;
  document.getElementById("deleteRiskNum").textContent     = result.risk + "%";

  var msgEl = document.getElementById("deleteResultMsg");
  var html  = `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);line-height:1.8;">`;
  html += `<div style="margin-bottom:4px;">${result.message||""}</div>`;
  if (result.threat_type) html += `<div style="color:${color};font-size:9px;letter-spacing:1px;">THREAT TYPE: ${result.threat_type.toUpperCase()}</div>`;
  (result.details||[]).forEach(function(d){ html += `<div>› ${d}</div>`; });
  if (result.recommendation) html += `<div style="margin-top:6px;color:var(--cyan);font-size:9px;">💡 ${result.recommendation}</div>`;
  html += `<div style="margin-top:6px;color:var(--text-dim);font-size:9px;opacity:0.6;">Source: ${source}</div></div>`;
  msgEl.innerHTML = html;

  updateRisk(result.risk);
  addLog("File Deletion: " + filename, result.risk, result.decision);
}

function localDeleteScan(filename) {
  var f = filename.toLowerCase(); var risk = 10; var threat_type = "Low Risk"; var details = []; var recommendation = "Proceed with standard deletion.";
  if (["/etc/passwd","/etc/shadow","/etc/sudoers"].some(p=>f.includes(p))) { risk=95; threat_type="System File"; details=["Critical OS authentication file."]; recommendation="Never delete system auth files."; }
  else if (f.includes(".ssh")||f.includes("id_rsa")) { risk=90; threat_type="Config/Secret"; details=["SSH key or config file detected."]; recommendation="Back up SSH keys before deleting."; }
  else if (f.includes(".env")||f.includes("secret")) { risk=80; threat_type="Config/Secret"; details=[".env or secret config file."]; recommendation="Rotate secrets before deleting env files."; }
  else if (f.includes("*")||f.includes("?")) { risk=85; threat_type="Bulk Operation"; details=["Wildcard — could delete many files."]; recommendation="Use ls first to preview matched files."; }
  else if (f.includes(".key")||f.includes(".pem")) { risk=75; threat_type="Critical Data"; details=["Cryptographic key file."]; recommendation="Back up keys before deletion."; }
  else if (f.includes(".db")||f.includes(".sql")) { risk=70; threat_type="Critical Data"; details=["Database file detected."]; recommendation="Create a backup before deleting."; }
  else if (f.includes("backup")||f.includes(".bak")) { risk=50; threat_type="Backup File"; details=["Backup file — may be last restore point."]; recommendation="Verify you have another backup first."; }
  else if (f.split("/").pop().startsWith(".")) { risk=40; threat_type="Hidden File"; details=["Hidden file (dot-prefix)."]; recommendation="Verify purpose of hidden file."; }
  else { risk += Math.floor(Math.random()*25); details=["File appears to be a regular user file."]; }
  risk = Math.min(risk,100);
  return { risk, decision:risk>=65?"BLOCKED":risk>=35?"WARNING":"ALLOW", message:"File risk assessed by local engine.", threat_type, details, recommendation };
}

/* ══════════════════════════════════════════════════════════════
   4. PRIVATE FOLDER ACCESS  –  AI authentication + threat intel
══════════════════════════════════════════════════════════════ */
var _failedFolderAttempts = 0;
var _folderLockedOut      = false;

function toggleFolderPassword() {
  var inp = document.getElementById("folderPassword");
  inp.type = inp.type === "password" ? "text" : "password";
}

function updatePasswordStrength(val) {
  var score = 0;
  if (val.length>=6) score++; if (val.length>=10) score++;
  if (/[A-Z]/.test(val)&&/[0-9]/.test(val)) score++;
  if (/[^a-zA-Z0-9]/.test(val)) score++;
  var colors = ["rgba(255,59,92,0.8)","rgba(255,184,0,0.8)","rgba(0,234,255,0.8)","rgba(0,255,136,0.8)"];
  var labels = ["VERY WEAK","MODERATE","STRONG","VERY STRONG"];
  for (var i=1;i<=4;i++) { var b=document.getElementById("pw-b"+i); if(b) b.style.background=i<=score?colors[score-1]:"rgba(255,255,255,0.08)"; }
  var lbl = document.getElementById("pwStrengthLabel");
  if (lbl) { lbl.textContent=val.length?(labels[score-1]||""):""; lbl.style.color=val.length?(colors[score-1]||"var(--text-dim)"):"var(--text-dim)"; }
}

async function checkFolderAccess() {
  if (_folderLockedOut) return;
  var password = document.getElementById("folderPassword").value;
  var resEl    = document.getElementById("folderResult");
  resEl.style.display = "none";

  var lock = document.getElementById("lockIcon");
  lock.style.filter = "blur(2px)"; lock.innerHTML = "🔓";

  var card     = document.getElementById("folderResultCard");
  var stagesEl = document.getElementById("folderStages");
  if (!stagesEl) {
    stagesEl = document.createElement("div"); stagesEl.id = "folderStages"; stagesEl.style.cssText = "margin-bottom:12px;";
    card.parentNode.insertBefore(stagesEl, card);
  }
  card.style.display = "none"; stagesEl.innerHTML = "";

  var stages = ["Hashing credentials...","Checking access policy...","Verifying clearance level...","AI threat assessment..."];
  for (var i=0;i<stages.length;i++) { await sleep(220); appendStage(stagesEl, stages[i]); }

  var correct = (password === "secure123");
  var localResult = {
    granted: correct, risk: correct?0:70,
    message: correct?"Credentials verified successfully.":"Invalid access key provided.",
    threat_level: !correct&&_failedFolderAttempts>=1?"MEDIUM":"NONE",
    details: correct ? ["Authentication successful","Level-5 clearance confirmed","Access logged to audit trail"]
                     : ["Incorrect password entered","Access attempt logged",_failedFolderAttempts>=1?"Multiple failed attempts flagged":"Single attempt recorded"],
    recommendation: correct ? "You now have access to classified files." : "Ensure you have the correct clearance key."
  };

  var aiResult = null;
  var rawAI = await askClaude(
    `You are a cybersecurity access-control engine for a classified folder system.
Analyse the password attempt and respond ONLY with valid JSON — no preamble, no markdown fences.
JSON schema:
{
  "risk": <integer 0-100>,
  "decision": <"ACCESS GRANTED"|"ACCESS DENIED">,
  "threat_level": <"NONE"|"LOW"|"MEDIUM"|"HIGH"|"CRITICAL">,
  "message": <string, max 100 chars>,
  "analysis": [<array of 2-3 observations about the attempt>],
  "recommendation": <string>
}
The correct password is "secure123".
Check: password strength, suspicious patterns (SQL injection attempts, common dictionary passwords, brute-force indicators).
Failed attempts so far: ${_failedFolderAttempts}.`,
    `Access attempt — password: "${password}" — Failed attempts so far: ${_failedFolderAttempts}`
  );
  if (rawAI) { try { aiResult = JSON.parse(rawAI.replace(/```json|```/g,"").trim()); } catch(e){} }

  lock.style.filter = "none";
  stagesEl.innerHTML = "";

  var source  = aiResult ? "Claude AI" : "Local Engine";
  var risk    = aiResult ? aiResult.risk : localResult.risk;
  var message = aiResult ? aiResult.message : localResult.message;
  var analysis= aiResult ? (aiResult.analysis||[]) : localResult.details;
  var threatLv= aiResult ? aiResult.threat_level : localResult.threat_level;
  var recommendation = aiResult ? aiResult.recommendation : localResult.recommendation;

  if (!correct) {
    _failedFolderAttempts++;
    document.getElementById("failedAttempts").textContent = _failedFolderAttempts + " / 3";
    if (_failedFolderAttempts >= 3) {
      document.getElementById("failedAttempts").style.color = "var(--red)";
      _folderLockedOut = true;
      document.getElementById("folderBtns").innerHTML = '<button disabled style="opacity:0.4;cursor:not-allowed;border-color:rgba(255,59,92,0.3);color:rgba(255,59,92,0.4);">🚫 ACCOUNT LOCKED</button><button class="btn-close" onclick="closeForms()">Close</button>';
      risk = 100; message = "Account locked after 3 failed attempts.";
    }
  }

  lock.innerHTML = correct ? "🔓" : "🔒";
  var color = correct ? "var(--green)" : "var(--red)";
  var icon  = correct ? "✅" : "🚫";
  var bgRgb = correct ? "0,255,136" : "255,59,92";

  card.style.display    = "block";
  card.style.background = `rgba(${bgRgb},0.05)`;
  card.style.border     = `1px solid rgba(${bgRgb},0.3)`;
  document.getElementById("folderResultIcon").innerHTML    = icon;
  document.getElementById("folderResultTitle").style.color = color;
  document.getElementById("folderResultTitle").textContent = correct ? "ACCESS GRANTED" : "ACCESS DENIED";

  var msgEl = document.getElementById("folderResultMsg");
  var html  = `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);line-height:1.8;margin-top:6px;">`;
  html += `<div style="margin-bottom:4px;">${message}</div>`;
  if (threatLv&&threatLv!=="NONE") html += `<div style="color:var(--orange);font-size:9px;letter-spacing:1px;">THREAT LEVEL: ${threatLv}</div>`;
  analysis.forEach(function(a){ html+=`<div>› ${a}</div>`; });
  if (recommendation) html += `<div style="margin-top:6px;color:var(--cyan);font-size:9px;">💡 ${recommendation}</div>`;
  html += `<div style="margin-top:6px;color:var(--text-dim);font-size:9px;opacity:0.6;">Source: ${source}</div></div>`;
  msgEl.innerHTML = html;

  updateRisk(risk);
  addLog("Private Folder Access", risk, correct?"ACCESS GRANTED":"ACCESS DENIED");
  resEl.style.display = "none";
}

/* ══════════════════════════════════════════════════════════════
   5. PHISHING & URL SCANNER  –  AI deep link analysis
══════════════════════════════════════════════════════════════ */
function resetLinkUI() {
  var card = document.getElementById("urlResultCard");
  if (card) card.style.display = "none";
  var anim = document.getElementById("urlScanAnim");
  if (anim) anim.style.display = "none";
  ["uc-protocol","uc-tld","uc-ip","uc-signals","uc-homoglyph","uc-sub"].forEach(function(id){
    var el = document.getElementById(id);
    if (el) { el.style.borderColor="var(--border)"; el.style.background="rgba(255,255,255,0.02)"; }
  });
}

function updateURLPreview(val) {
  var bd    = document.getElementById("urlBreakdown");
  var parts = document.getElementById("urlParts");
  if (!val.trim()) { if(bd) bd.style.display="none"; return; }
  if (bd) bd.style.display = "block";
  try {
    var u = val.startsWith("http")?val:"https://"+val;
    var parsed = new URL(u);
    parts.innerHTML = [
      { label:"PROTOCOL", value:parsed.protocol.replace(":",""), color:parsed.protocol==="https:"?"var(--green)":"var(--red)" },
      { label:"HOST",     value:parsed.hostname,  color:"var(--cyan)" },
      { label:"PATH",     value:parsed.pathname||"/", color:"var(--text-dim)" },
      { label:"QUERY",    value:parsed.search||"none", color:parsed.search?"var(--orange)":"var(--text-dim)" }
    ].map(function(p){ return `<div style="padding:4px 10px;border:1px solid rgba(255,255,255,0.08);"><div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);letter-spacing:1px;">${p.label}</div><div style="font-family:var(--font-mono);font-size:10px;color:${p.color};max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.value}</div></div>`; }).join("");
  } catch(e) {
    parts.innerHTML = '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);">Invalid URL format</span>';
  }
}

async function scanURL() {
  var url   = document.getElementById("urlInput").value.trim();
  var resEl = document.getElementById("urlResult");
  if (!url) { resEl.style.display="block"; resEl.style.color="var(--orange)"; resEl.innerText="⚠ Enter a URL."; return; }
  resEl.style.display = "none";

  var anim  = document.getElementById("urlScanAnim");
  var bar   = document.getElementById("urlScanBar");
  var label = document.getElementById("urlScanLabel");
  var rcard = document.getElementById("urlResultCard");

  rcard.style.display="none"; anim.style.display="block"; bar.style.width="0%";

  var scanSteps = ["Resolving URL structure...","Checking protocol security...","Domain reputation lookup...","TLD risk assessment...","Signal detection...","Homoglyph & typosquat scan...","Subdomain depth analysis...","AI threat intelligence..."];
  for (var i=0;i<scanSteps.length;i++) { label.textContent=scanSteps[i]; bar.style.width=Math.round((i+1)/scanSteps.length*80)+"%"; await sleep(200); }

  var localResult = localURLScan(url);
  var aiResult = null;
  var rawAI = await askClaude(
    `You are a cybersecurity URL analysis and phishing detection engine.
Analyse the given URL for threats.
Respond ONLY with valid JSON — no preamble, no markdown fences.
JSON schema:
{
  "risk": <integer 0-100>,
  "decision": <"SAFE"|"SUSPICIOUS"|"PHISHING DETECTED">,
  "threat_categories": [<list of detected threats as strings>],
  "message": <short explanation string, max 120 chars>,
  "findings": [<array of 3-5 specific technical findings>],
  "verdict": <"DO NOT OPEN"|"PROCEED WITH CAUTION"|"SAFE TO VISIT">
}
Check for: phishing keywords (verify,login,free,prize,winner,urgent,suspended,confirm,update,secure), suspicious TLDs (.xyz .tk .ml .ga .top .click .gq), IP addresses as hostname, typosquatting/homoglyphs, excessive subdomains (3+), no HTTPS, URL shorteners, brand impersonation, encoding tricks.`,
    `Analyse this URL for phishing/security threats:\n${url}`
  );
  if (rawAI) { try { aiResult = JSON.parse(rawAI.replace(/```json|```/g,"").trim()); } catch(e){} }

  bar.style.width="100%"; label.textContent="Analysis complete.";
  await sleep(300);
  anim.style.display="none";

  var result   = aiResult||localResult;
  var source   = aiResult?"Claude AI":"Local Engine";
  var decision = result.decision;
  var color    = decision==="PHISHING DETECTED"?"var(--red)":decision==="SUSPICIOUS"?"var(--orange)":"var(--green)";
  var icon     = decision==="PHISHING DETECTED"?"🚨":decision==="SUSPICIOUS"?"⚠️":"✅";
  var bgRgb    = decision==="PHISHING DETECTED"?"255,59,92":decision==="SUSPICIOUS"?"255,184,0":"0,255,136";

  rcard.style.display    = "block";
  rcard.style.background = `rgba(${bgRgb},0.05)`;
  rcard.style.border     = `1px solid rgba(${bgRgb},0.4)`;
  document.getElementById("urlResultIcon").innerHTML    = icon;
  document.getElementById("urlResultTitle").style.color = color;
  document.getElementById("urlResultTitle").textContent = decision;
  document.getElementById("urlRiskNum").style.color     = color;
  document.getElementById("urlRiskNum").textContent     = result.risk+"%";

  var msgEl = document.getElementById("urlResultMsg");
  var html  = `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);line-height:1.8;">`;
  html += `<div style="margin-bottom:4px;">${result.message||""}</div>`;
  if (result.verdict) html += `<div style="color:${color};font-size:9px;letter-spacing:1.5px;font-weight:bold;margin-bottom:4px;">VERDICT: ${result.verdict}</div>`;
  if (result.threat_categories&&result.threat_categories.length) {
    html += `<div style="display:flex;flex-wrap:wrap;gap:4px;margin:6px 0;">`;
    result.threat_categories.forEach(function(t){ html+=`<span style="font-family:var(--font-mono);font-size:9px;padding:2px 8px;background:rgba(255,59,92,0.1);border:1px solid rgba(255,59,92,0.3);color:var(--red);">${t.toUpperCase()}</span>`; });
    html += `</div>`;
  }
  (result.findings||[]).forEach(function(f){ html+=`<div>› ${f}</div>`; });
  html += `<div style="margin-top:6px;color:var(--text-dim);font-size:9px;opacity:0.6;">Source: ${source}</div></div>`;
  msgEl.innerHTML = html;

  var u = url.toLowerCase();
  function setCheck(id,valId,ok,lbl) {
    var el=document.getElementById(id); var vel=document.getElementById(valId); if(!el||!vel)return;
    el.style.borderColor=ok?"rgba(0,255,136,0.3)":"rgba(255,59,92,0.4)"; el.style.background=ok?"rgba(0,255,136,0.04)":"rgba(255,59,92,0.06)";
    vel.style.color=ok?"var(--green)":"var(--red)"; vel.textContent=lbl;
  }
  setCheck("uc-protocol","uc-proto-val",u.startsWith("https"),u.startsWith("https")?"HTTPS ✓":"HTTP ✗");
  var hasIP=/\d+\.\d+\.\d+\.\d+/.test(u); setCheck("uc-ip","uc-ip-val",!hasIP,hasIP?"DETECTED ✗":"NONE ✓");
  var badTLDs=[".xyz",".tk",".ml",".ga",".top",".click",".gq"]; var tldHit=badTLDs.find(function(t){return u.includes(t);}); setCheck("uc-tld","uc-tld-val",!tldHit,tldHit||"CLEAN ✓");
  var sigs=["free","verify","login","urgent","prize","winner","suspended","confirm"]; var sigHit=sigs.filter(function(s){return u.includes(s);}); setCheck("uc-signals","uc-signals-val",sigHit.length===0,sigHit.length?sigHit.length+" FOUND ✗":"NONE ✓");
  var hgs=["paypa1","g00gle","arnazon","micros0ft","app1e","faceb00k"]; var hgHit=hgs.some(function(h){return u.includes(h);}); setCheck("uc-homoglyph","uc-hg-val",!hgHit,hgHit?"DETECTED ✗":"NONE ✓");
  try { var dom=(new URL(u.startsWith("http")?u:"https://"+u)).hostname; var dots=(dom.match(/\./g)||[]).length; setCheck("uc-sub","uc-sub-val",dots<4,dots>=4?dots+" LEVELS ✗":dots+" LEVELS ✓"); } catch(e){}

  updateRisk(result.risk);
  addLog("URL Scan: "+url, result.risk, decision);
}

function localURLScan(url) {
  var u=url.toLowerCase(); var risk=0; var threat_categories=[]; var findings=[];
  if (!u.startsWith("https")) { risk+=15; threat_categories.push("No HTTPS"); findings.push("Insecure HTTP protocol used."); }
  if (/\d+\.\d+\.\d+\.\d+/.test(u)) { risk+=30; threat_categories.push("IP Hostname"); findings.push("Raw IP used instead of domain."); }
  var badTLDs=[".xyz",".tk",".ml",".ga",".top",".click",".gq"]; if (badTLDs.some(t=>u.includes(t))) { risk+=25; threat_categories.push("Risky TLD"); findings.push("High-risk TLD detected."); }
  var phishSigs=["free","verify","login","urgent","prize","winner","suspended","confirm","update","secure","validate"]; var matched=phishSigs.filter(s=>u.includes(s)); if (matched.length) { risk+=matched.length*15; threat_categories.push("Phishing Keywords"); findings.push("Keywords: "+matched.join(", ")+"."); }
  var homoglyphs=["paypa1","g00gle","arnazon","micros0ft","app1e"]; if (homoglyphs.some(h=>u.includes(h))) { risk+=50; threat_categories.push("Homoglyph Attack"); findings.push("Brand impersonation via character substitution."); }
  var shorteners=["bit.ly","tinyurl","t.co","goo.gl","ow.ly"]; if (shorteners.some(s=>u.includes(s))) { risk+=20; threat_categories.push("URL Shortener"); findings.push("Shortener obscures true destination."); }
  risk=Math.min(risk,100);
  var decision=risk>=50?"PHISHING DETECTED":risk>=25?"SUSPICIOUS":"SAFE";
  return { risk, decision, threat_categories, message:"URL analysed by local heuristic engine.", findings, verdict:decision==="PHISHING DETECTED"?"DO NOT OPEN":decision==="SUSPICIOUS"?"PROCEED WITH CAUTION":"SAFE TO VISIT" };
}

/* ── SHARED UTILITIES ────────────────────────────────────────── */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function appendStage(container, text) {
  var row = document.createElement("div");
  row.style.cssText = "font-family:var(--font-mono);font-size:10px;color:var(--text-dim);padding:2px 0;letter-spacing:1px;opacity:0;transition:opacity 0.2s;";
  row.innerHTML = `<span style="color:var(--cyan);">›</span> ${text}`;
  container.appendChild(row);
  requestAnimationFrame(function(){ row.style.opacity="1"; });
}
