async function checkNews() {

  let text = document.getElementById("newsInput").value

  if (text.trim() === "") {
    alert("Please enter news text")
    return
  }

  let resultEl  = document.getElementById("newsResult")
  let trustFill = document.getElementById("trustFill")

  resultEl.style.color = "var(--text-dim)"
  resultEl.innerText   = "⏳ Connecting to AI server..."
  if (trustFill) { trustFill.style.width = "0%" }

  // Try Flask backend
  try {
    let controller = new AbortController()
    let timeout    = setTimeout(() => controller.abort(), 6000)

    let response = await fetch("http://127.0.0.1:5001/predict", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ news: text }),
      signal:  controller.signal
    })

    clearTimeout(timeout)

    if (response.ok) {
      let data = await response.json()
      showResult(data.prediction, data.confidence, "AI Server")
      return
    } else {
      resultEl.innerText = "⚠ Server error " + response.status + " — using local engine..."
    }

  } catch (err) {
    // Show the actual error so we can debug
    if (err.name === "AbortError") {
      resultEl.innerText = "⏳ Server timeout — using local engine..."
    } else {
      resultEl.innerText = "⚠ " + err.message + " — using local engine..."
    }
    // Small pause so user can see the error
    await new Promise(r => setTimeout(r, 800))
  }

  // Local fallback
  let result = localAnalyse(text)
  showResult(result.prediction, result.confidence, "Local Engine")
}


function showResult(prediction, confidence, source) {
  let resultEl  = document.getElementById("newsResult")
  let trustFill = document.getElementById("trustFill")
  let isFake    = prediction === "FAKE"

  resultEl.style.color = isFake ? "var(--red)" : "var(--green)"
  resultEl.innerText =
    (isFake ? "⚠ FAKE NEWS DETECTED" : "✔ LIKELY REAL NEWS") +
    "  |  Confidence: " + confidence + "%" +
    "  |  Source: " + source

  if (trustFill) {
    trustFill.style.background = isFake ? "var(--red)" : "var(--green)"
    trustFill.style.width      = confidence + "%"
  }
}


function localAnalyse(text) {
  let t = text.toLowerCase()

  let fakeSignals = [
    "breaking", "shocking", "you won't believe", "miracle", "secret",
    "they don't want you to know", "conspiracy", "hoax", "illuminati",
    "deep state", "fake news", "mainstream media lies", "cover up",
    "banned", "censored", "wake up", "sheeple", "satire",
    "scientists baffled", "cure for", "100% guaranteed", "unbelievable",
    "world ending", "government hiding", "leaked", "exposed",
    "big pharma", "globalist", "crisis actor", "false flag",
    "chemtrails", "microchip", "5g causes", "plandemic"
  ]

  let realSignals = [
    "according to", "study finds", "researchers say", "published in",
    "university", "government report", "official statement", "confirmed by",
    "data shows", "statistics", "peer reviewed", "journal", "evidence",
    "spokesperson", "press conference", "reuters", "associated press",
    "investigation", "court documents", "analysis", "survey"
  ]

  let fakeCount = fakeSignals.filter(s => t.includes(s)).length
  let realCount = realSignals.filter(s => t.includes(s)).length

  let capsRatio = (text.match(/[A-Z]/g) || []).length / Math.max(text.length, 1)
  if (capsRatio > 0.3) fakeCount += 2

  let exclamations = (text.match(/!/g) || []).length
  if (exclamations >= 3) fakeCount += 2
  else if (exclamations >= 1) fakeCount += 1

  let questions = (text.match(/\?/g) || []).length
  if (questions >= 2) fakeCount += 1

  let wordCount      = text.trim().split(/\s+/).length
  let baseConfidence = wordCount < 10 ? 55 : wordCount < 20 ? 63 : 72
  let score          = fakeCount - realCount

  let prediction, confidence

  if (score >= 3)       { prediction = "FAKE"; confidence = Math.min(baseConfidence + score * 4, 94) }
  else if (score >= 1)  { prediction = "FAKE"; confidence = Math.min(baseConfidence + score * 2, 80) }
  else if (score <= -2) { prediction = "REAL"; confidence = Math.min(baseConfidence + Math.abs(score) * 4, 94) }
  else                  { prediction = "REAL"; confidence = baseConfidence }

  return { prediction, confidence: Math.round(confidence) }
}
