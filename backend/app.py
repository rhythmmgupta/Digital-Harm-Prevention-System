import re, json, math, numpy as np
from flask import Flask, request, jsonify

MODEL_FILE = "model.json"
app = Flask(__name__)

# ---- CORS: allow ALL origins (file://, localhost, any port) ------------------
@app.after_request
def cors(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

@app.route("/predict", methods=["OPTIONS"])
def predict_options():
    return jsonify({}), 200

# ---- LOAD MODEL --------------------------------------------------------------
print(f"Loading model from {MODEL_FILE} ...")
with open(MODEL_FILE, "r", encoding="utf-8") as f:
    MODEL_DATA = json.load(f)

META       = MODEL_DATA["meta"]
VEC_DATA   = MODEL_DATA["vectorizer"]
MODEL_TYPE = MODEL_DATA["model"]["model_type"]

print(f"  Model      : {META['best_model']}")
print(f"  Accuracy   : {META['accuracy']*100:.2f}%")
print(f"  F1-Score   : {META['f1_score']*100:.2f}%")
print(f"  Vocab size : {META['vocab_size']:,}")

# ---- VECTORIZER --------------------------------------------------------------
VOCAB      = VEC_DATA["vocabulary"]
IDF        = np.array(VEC_DATA["idf"])
STOP_WORDS = set(VEC_DATA["stop_words"]) if VEC_DATA["stop_words"] else set()
NGRAM_MIN, NGRAM_MAX = VEC_DATA["ngram_range"]
SUBLINEAR  = VEC_DATA["sublinear_tf"]

def clean(text):
    text = str(text).lower()
    text = re.sub(r"http\S+|www\S+", " ", text)
    text = re.sub(r"[^a-z\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()

def get_ngrams(tokens, n_min, n_max):
    grams = []
    for n in range(n_min, n_max + 1):
        for i in range(len(tokens) - n + 1):
            grams.append(" ".join(tokens[i: i + n]))
    return grams

def tfidf_transform(text):
    tokens = [t for t in clean(text).split() if t not in STOP_WORDS]
    ngrams = get_ngrams(tokens, NGRAM_MIN, NGRAM_MAX)
    tf_raw = {}
    for g in ngrams:
        if g in VOCAB:
            tf_raw[VOCAB[g]] = tf_raw.get(VOCAB[g], 0) + 1
    if not tf_raw:
        return np.zeros(len(IDF))
    vec = np.zeros(len(IDF))
    for idx, count in tf_raw.items():
        tf = (1 + math.log(count)) if SUBLINEAR else count
        vec[idx] = tf * IDF[idx]
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec /= norm
    return vec

def score_to_confidence(raw_score, word_count):
    abs_score = abs(raw_score)
    base_conf = math.tanh(abs_score * 1.5)
    if word_count >= 50:   ceiling = 0.97
    elif word_count >= 20: ceiling = 0.92
    elif word_count >= 10: ceiling = 0.87
    elif word_count >= 5:  ceiling = 0.82
    else:                  ceiling = 0.75
    floor = 0.55
    confidence = floor + (ceiling - floor) * base_conf
    return int(round(confidence * 100))

CLASSES   = MODEL_DATA["model"]["classes"]
LABEL_MAP = META["labels"]

def _sigmoid(x):
    return 1.0 / (1.0 + math.exp(-x))

def predict(text):
    vec        = tfidf_transform(text)
    word_count = len(clean(text).split())

    if "Logistic" in MODEL_TYPE or "Passive" in MODEL_TYPE:
        coef      = np.array(MODEL_DATA["model"]["coef"])
        intercept = np.array(MODEL_DATA["model"]["intercept"])
        if coef.shape[0] == 1:
            raw_score  = float(vec @ coef[0] + intercept[0])
            pred_idx   = 1 if raw_score >= 0 else 0
            confidence = score_to_confidence(raw_score, word_count)
        else:
            scores    = coef @ vec + intercept
            pred_idx  = int(np.argmax(scores))
            raw_score = scores[pred_idx] - scores[1 - pred_idx]
            confidence = score_to_confidence(raw_score, word_count)

    elif "Naive" in MODEL_TYPE:
        flp = np.array(MODEL_DATA["model"]["feature_log_prob"])
        clp = np.array(MODEL_DATA["model"]["class_log_prior"])
        tokens = [t for t in clean(text).split() if t not in STOP_WORDS]
        ngrams = get_ngrams(tokens, NGRAM_MIN, NGRAM_MAX)
        count_vec = np.zeros(len(IDF))
        for g in ngrams:
            if g in VOCAB:
                count_vec[VOCAB[g]] += 1
        log_probs  = flp @ count_vec + clp
        pred_idx   = int(np.argmax(log_probs))
        raw_score  = log_probs[pred_idx] - log_probs[1 - pred_idx]
        confidence = score_to_confidence(raw_score, word_count)

    elif "Random" in MODEL_TYPE:
        trees  = MODEL_DATA["model"]["estimators"]
        votes  = np.zeros(len(CLASSES))
        for tree in trees:
            cl, cr   = tree["children_left"], tree["children_right"]
            feat, thr, val = tree["feature"], tree["threshold"], tree["value"]
            node = 0
            while cl[node] != -1:
                node = cl[node] if vec[feat[node]] <= thr[node] else cr[node]
            votes[int(np.argmax(np.array(val[node][0])))] += 1
        pred_idx   = int(np.argmax(votes))
        raw_score  = math.atanh(min(votes[pred_idx] / len(trees) * 2 - 1, 0.9999))
        confidence = score_to_confidence(raw_score, word_count)
    else:
        raise ValueError(f"Unknown model type: {MODEL_TYPE}")

    label = LABEL_MAP[str(CLASSES[pred_idx])]
    return label, confidence

# ---- ROUTES ------------------------------------------------------------------
@app.route("/predict", methods=["POST"])
def predict_route():
    data = request.get_json(silent=True)
    if not data or "news" not in data:
        return jsonify({"error": "Missing 'news' field"}), 400
    text = str(data["news"]).strip()
    if not text:
        return jsonify({"error": "Empty text"}), 400
    label, confidence = predict(text)
    return jsonify({"prediction": label, "confidence": confidence})

@app.route("/")
def home():
    return jsonify({
        "status":   "running",
        "model":    META["best_model"],
        "accuracy": f"{META['accuracy']*100:.2f}%",
        "f1_score": f"{META['f1_score']*100:.2f}%",
    })

@app.route("/model-info")
def model_info():
    return jsonify(META)

if __name__ == "__main__":
    app.run(debug=True, port=5001, host="0.0.0.0")


# ═══════════════════════════════════════════════════════════════
# SECURITY ACTION ENDPOINTS
# ═══════════════════════════════════════════════════════════════
import hashlib, re as _re

# ── Sensitive data keywords ────────────────────────────────────
SENSITIVE_PATTERNS = {
    "password":    50,
    "passwd":      50,
    "otp":         50,
    "pin":         40,
    "cvv":         60,
    "card number": 60,
    "credit card": 55,
    "debit card":  55,
    "ssn":         70,
    "aadhar":      60,
    "pan number":  55,
    "bank account":55,
    "routing":     45,
    "secret":      35,
    "private key": 70,
    "api key":     65,
    "token":       40,
}

PROTECTED_FILES = [
    "system32", "passwd", "shadow", "sudoers", ".ssh",
    "id_rsa", "private", "backup", "wallet", "keystore",
    ".env", "config", "secret", "credentials", "auth"
]

PHISHING_SIGNALS = {
    "free":     20, "login":   25, "verify":  25, "secure":  15,
    "update":   15, "confirm": 20, "account": 15, "banking": 30,
    "paypal":   30, "amazon":  20, "apple":   20, "google":  15,
    "microsoft":20, "support": 15, "urgent":  25, "suspended":35,
    "click":    15, "prize":   35, "winner":  35, "lucky":   30,
    "bit.ly":   30, "tinyurl": 30, "win":     25,
}


# ── 1. SENSITIVE DATA SCANNER ──────────────────────────────────
@app.route("/scan-sensitive", methods=["POST", "OPTIONS"])
def scan_sensitive():
    if request.method == "OPTIONS": return jsonify({}), 200
    data = request.get_json(silent=True) or {}
    text = str(data.get("text", "")).lower()

    risk = 0
    found = []
    for pattern, weight in SENSITIVE_PATTERNS.items():
        if pattern in text:
            risk += weight
            found.append(pattern)

    # Extra: detect patterns like 16-digit card numbers
    if _re.search(r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b', text):
        risk += 60; found.append("card number pattern")
    if _re.search(r'\b\d{6,8}\b', text):
        risk += 20; found.append("OTP/PIN pattern")

    risk = min(risk, 100)
    if risk >= 60:   decision = "BLOCKED"
    elif risk >= 30: decision = "WARNING"
    else:            decision = "SAFE"

    return jsonify({
        "risk":     risk,
        "decision": decision,
        "found":    found,
        "message":  f"Detected sensitive data: {', '.join(found)}" if found else "No sensitive data detected"
    })


# ── 2. FILE DELETION SECURITY CHECK ───────────────────────────
@app.route("/check-delete", methods=["POST", "OPTIONS"])
def check_delete():
    if request.method == "OPTIONS": return jsonify({}), 200
    data     = request.get_json(silent=True) or {}
    filename = str(data.get("filename", "")).lower()

    risk  = 0
    flags = []

    # Check against protected file patterns
    for pf in PROTECTED_FILES:
        if pf in filename:
            risk += 45
            flags.append(f"protected pattern: '{pf}'")

    # System file extensions
    if any(filename.endswith(ext) for ext in [".sys",".dll",".exe",".sh",".bash",".key",".pem"]):
        risk += 35; flags.append("system/sensitive extension")

    # Hidden files
    if filename.startswith("."):
        risk += 20; flags.append("hidden file")

    # Bulk delete patterns
    if any(c in filename for c in ["*", "?", "%"]):
        risk += 50; flags.append("wildcard — bulk deletion risk")

    risk = min(risk + 10, 100)   # base risk for any deletion
    if risk >= 60:   decision = "BLOCKED"
    elif risk >= 35: decision = "WARNING"
    else:            decision = "ALLOW"

    return jsonify({
        "risk":     risk,
        "decision": decision,
        "flags":    flags,
        "message":  f"File '{data.get('filename','')}' — {decision}. " +
                    (f"Reasons: {', '.join(flags)}" if flags else "No critical issues detected.")
    })


# ── 3. PRIVATE FOLDER ACCESS ───────────────────────────────────
FOLDER_PASSWORD_HASH = hashlib.sha256(b"secure123").hexdigest()

@app.route("/folder-access", methods=["POST", "OPTIONS"])
def folder_access():
    if request.method == "OPTIONS": return jsonify({}), 200
    data     = request.get_json(silent=True) or {}
    password = str(data.get("password", ""))
    attempt_hash = hashlib.sha256(password.encode()).hexdigest()

    if attempt_hash == FOLDER_PASSWORD_HASH:
        return jsonify({
            "risk": 0, "decision": "ACCESS GRANTED",
            "message": "Authentication successful. Access granted."
        })
    else:
        # Weak password detection
        risk = 70
        flags = ["incorrect password"]
        if len(password) < 6: flags.append("very short password attempt")
        if password in ["123456","password","admin","0000","1111"]:
            risk = 90; flags.append("common password attempt — brute force suspected")

        return jsonify({
            "risk":    risk,
            "decision":"BLOCKED",
            "flags":   flags,
            "message": "Access denied. " + ", ".join(flags)
        })


# ── 4. URL / PHISHING SCANNER ──────────────────────────────────
@app.route("/scan-url", methods=["POST", "OPTIONS"])
def scan_url():
    if request.method == "OPTIONS": return jsonify({}), 200
    data = request.get_json(silent=True) or {}
    url  = str(data.get("url", "")).lower()

    risk  = 0
    flags = []

    for signal, weight in PHISHING_SIGNALS.items():
        if signal in url:
            risk += weight
            flags.append(signal)

    # IP address instead of domain
    if _re.search(r'https?://\d+\.\d+\.\d+\.\d+', url):
        risk += 40; flags.append("IP address URL — no domain")

    # Suspicious TLDs
    for tld in [".xyz",".tk",".ml",".ga",".cf",".gq",".top",".click",".link"]:
        if url.endswith(tld) or (tld + "/") in url:
            risk += 25; flags.append(f"suspicious TLD: {tld}")

    # Excessive subdomains
    try:
        domain_part = url.split("//")[-1].split("/")[0]
        if domain_part.count(".") >= 4:
            risk += 20; flags.append("excessive subdomains")
    except: pass

    # Homoglyph / lookalike domains
    for legit in ["paypa1","g00gle","arnazon","micros0ft","app1e"]:
        if legit in url:
            risk += 50; flags.append(f"lookalike domain: {legit}")

    # HTTP (not HTTPS)
    if url.startswith("http://"):
        risk += 15; flags.append("non-HTTPS connection")

    risk = min(risk, 100)
    if risk >= 50:   decision = "PHISHING DETECTED"
    elif risk >= 25: decision = "SUSPICIOUS"
    else:            decision = "SAFE"

    return jsonify({
        "risk":     risk,
        "decision": decision,
        "flags":    flags,
        "message":  f"{decision}. " + (f"Signals: {', '.join(flags)}" if flags else "No threats detected.")
    })
