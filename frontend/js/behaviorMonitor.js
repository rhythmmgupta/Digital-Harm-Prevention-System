/**
 * DHPS Behavior Monitor
 * - Tracks clicks across the entire page using a rolling 5-second window
 * - Shows a floating toast warning when click rate exceeds threshold
 * - Exposes getClickRate() so the Send Money panel can read the live rate
 * - Logs suspicious activity to the Threat Log
 */

(function () {

  /* ── CONFIG ──────────────────────────────────────────────────── */
  var WINDOW_MS        = 5000;   // rolling window duration
  var WARN_RATE        = 4;      // clicks/sec to show yellow toast
  var DANGER_RATE      = 7;      // clicks/sec to show red toast
  var TOAST_COOLDOWN   = 8000;   // ms before another toast can appear
  var LOG_THRESHOLD    = 5;      // clicks/sec to log in Threat Log

  /* ── STATE ───────────────────────────────────────────────────── */
  var clickTimestamps  = [];     // rolling array of click times
  var lastToastTime    = 0;
  var toastEl          = null;
  var toastTimer       = null;
  var meterInterval    = null;

  /* ── PUBLIC: read current rate from other scripts ────────────── */
  window.getClickRate = function () {
    pruneOld();
    return clickTimestamps.length / (WINDOW_MS / 1000);
  };

  /* ── PRUNE timestamps older than WINDOW_MS ───────────────────── */
  function pruneOld() {
    var cutoff = Date.now() - WINDOW_MS;
    while (clickTimestamps.length && clickTimestamps[0] < cutoff) {
      clickTimestamps.shift();
    }
  }

  /* ── CLICK LISTENER ──────────────────────────────────────────── */
  document.addEventListener("click", function () {
    var now = Date.now();
    clickTimestamps.push(now);
    pruneOld();

    var rate = window.getClickRate();

    updateGlobalMeter(rate);

    if (rate >= DANGER_RATE) {
      showToast("danger", rate);
      maybeLogThreat(rate, "BLOCKED");
    } else if (rate >= WARN_RATE) {
      showToast("warn", rate);
      maybeLogThreat(rate, "WARNING");
    }
  });

  /* ── GLOBAL CLICK METER (floating widget) ────────────────────── */
  function buildMeterWidget() {
    var el = document.createElement("div");
    el.id = "globalClickMeter";
    el.style.cssText = [
      "position:fixed",
      "bottom:24px",
      "left:24px",
      "z-index:8888",
      "width:220px",
      "background:rgba(3,8,16,0.92)",
      "border:1px solid rgba(0,234,255,0.15)",
      "padding:12px 14px",
      "font-family:'Share Tech Mono',monospace",
      "backdrop-filter:blur(10px)",
      "clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px))",
      "transition:border-color 0.3s"
    ].join(";");

    el.innerHTML =
      '<div style="font-size:9px;color:rgba(0,234,255,0.5);letter-spacing:3px;margin-bottom:8px;">CLICK MONITOR</div>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<div style="flex:1;height:5px;background:rgba(255,255,255,0.06);border:1px solid rgba(0,234,255,0.1);overflow:hidden;">' +
          '<div id="globalClickBar" style="height:100%;width:0%;background:#00ff88;transition:width 0.3s,background 0.3s;"></div>' +
        '</div>' +
        '<span id="globalClickLabel" style="font-size:10px;color:#00ff88;letter-spacing:1px;min-width:52px;">IDLE</span>' +
      '</div>' +
      '<div style="margin-top:6px;font-size:9px;color:rgba(200,223,240,0.35);letter-spacing:1px;">' +
        'Rate: <span id="globalClickRate">0.0</span> clicks/sec' +
      '</div>';

    document.body.appendChild(el);
    return el;
  }

  function updateGlobalMeter(rate) {
    var bar   = document.getElementById("globalClickBar");
    var label = document.getElementById("globalClickLabel");
    var rateEl = document.getElementById("globalClickRate");
    var meter  = document.getElementById("globalClickMeter");
    if (!bar) return;

    var pct = Math.min(rate / DANGER_RATE * 100, 100);
    bar.style.width = pct + "%";
    if (rateEl) rateEl.textContent = rate.toFixed(1);

    if (rate >= DANGER_RATE) {
      bar.style.background   = "#ff3b5c";
      label.style.color      = "#ff3b5c";
      label.textContent      = "DANGER!";
      meter.style.borderColor = "rgba(255,59,92,0.5)";
    } else if (rate >= WARN_RATE) {
      bar.style.background   = "#ffb800";
      label.style.color      = "#ffb800";
      label.textContent      = "ELEVATED";
      meter.style.borderColor = "rgba(255,184,0,0.5)";
    } else if (rate > 0) {
      bar.style.background   = "#00ff88";
      label.style.color      = "#00ff88";
      label.textContent      = "NORMAL";
      meter.style.borderColor = "rgba(0,234,255,0.15)";
    } else {
      bar.style.background   = "#00ff88";
      label.style.color      = "rgba(200,223,240,0.3)";
      label.textContent      = "IDLE";
      meter.style.borderColor = "rgba(0,234,255,0.1)";
    }
  }

  /* ── TOAST NOTIFICATION ──────────────────────────────────────── */
  function buildToast() {
    var el = document.createElement("div");
    el.id = "clickToast";
    el.style.cssText = [
      "position:fixed",
      "top:80px",
      "right:24px",
      "z-index:9000",
      "max-width:320px",
      "padding:16px 20px",
      "font-family:'Share Tech Mono',monospace",
      "backdrop-filter:blur(12px)",
      "background:rgba(3,8,16,0.95)",
      "border:1px solid #ffb800",
      "clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))",
      "transform:translateX(120%)",
      "transition:transform 0.35s cubic-bezier(0.4,0,0.2,1)",
      "pointer-events:none"
    ].join(";");
    document.body.appendChild(el);
    return el;
  }

  function showToast(level, rate) {
    var now = Date.now();
    if (now - lastToastTime < TOAST_COOLDOWN) return;
    lastToastTime = now;

    if (!toastEl) toastEl = buildToast();

    var isRed = (level === "danger");
    var color  = isRed ? "#ff3b5c" : "#ffb800";
    var icon   = isRed ? "&#x1F6A8;" : "&#x26A0;";
    var title  = isRed ? "SUSPICIOUS ACTIVITY" : "ELEVATED CLICK RATE";
    var msg    = isRed
      ? "Rapid clicking detected (" + rate.toFixed(1) + "/s). Possible panic or automated behaviour."
      : "Click rate elevated (" + rate.toFixed(1) + "/s). Monitoring user behaviour.";

    toastEl.style.borderColor = color;
    toastEl.innerHTML =
      '<div style="display:flex;align-items:flex-start;gap:12px;">' +
        '<span style="font-size:22px;line-height:1;">' + icon + '</span>' +
        '<div>' +
          '<div style="font-size:10px;color:' + color + ';letter-spacing:3px;margin-bottom:4px;">' + title + '</div>' +
          '<div style="font-size:11px;color:rgba(200,223,240,0.7);letter-spacing:0.5px;line-height:1.6;">' + msg + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:10px;height:2px;background:rgba(255,255,255,0.06);overflow:hidden;">' +
        '<div id="toastProgress" style="height:100%;width:100%;background:' + color + ';transition:width ' + (TOAST_COOLDOWN/1000) + 's linear;"></div>' +
      '</div>';

    // Slide in
    toastEl.style.transform = "translateX(0)";

    // Animate progress bar drain
    setTimeout(function () {
      var pb = document.getElementById("toastProgress");
      if (pb) pb.style.width = "0%";
    }, 50);

    // Slide out after cooldown
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (toastEl) toastEl.style.transform = "translateX(120%)";
    }, TOAST_COOLDOWN);
  }

  /* ── THREAT LOG ──────────────────────────────────────────────── */
  var _lastLoggedRate = 0;

  function maybeLogThreat(rate, decision) {
    // Only log if rate jumped significantly since last log
    if (rate - _lastLoggedRate < 1) return;
    _lastLoggedRate = rate;
    if (typeof addLog === "function") {
      addLog("Rapid Clicking (" + rate.toFixed(1) + "/s)", Math.min(Math.round(rate * 10), 100), decision);
    }
    if (typeof updateRisk === "function") {
      updateRisk(Math.min(Math.round(rate * 12), 100));
    }
  }

  /* ── IDLE DECAY: clear rate display when no clicks for 5s ───── */
  setInterval(function () {
    pruneOld();
    var rate = window.getClickRate();
    updateGlobalMeter(rate);
    if (rate === 0) _lastLoggedRate = 0;
  }, 1000);

  /* ── INIT ────────────────────────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", function () {
    buildMeterWidget();
  });

})();
