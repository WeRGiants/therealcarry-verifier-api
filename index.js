// ---------- Core Engine Helpers (brand-agnostic) ----------
const REQUIRED_VIEWS = [
  "front",
  "back",
  "side",
  "bottom",
  "top",
  "interior",
  "logo_stamp",     // covers heat stamp / interior stamp / logo
  "hardware",       // zipper pull / clasp / engraving
  "handle_base",
  "stitching",
];

// Soft keyword map (conservative). If no match => unknown view.
const VIEW_KEYWORDS = [
  { view: "front", keywords: ["front", "main", "face"] },
  { view: "back", keywords: ["back", "rear"] },
  { view: "side", keywords: ["side", "profile"] },
  { view: "bottom", keywords: ["bottom", "base"] },
  { view: "top", keywords: ["top", "opening"] },
  { view: "interior", keywords: ["interior", "inside", "lining"] },
  { view: "logo_stamp", keywords: ["stamp", "heat", "logo", "madein", "made_in", "serial", "datecode", "date_code", "tag", "label"] },
  { view: "hardware", keywords: ["zip", "zipper", "pull", "clasp", "lock", "chain", "hardware", "engraving", "buckle"] },
  { view: "handle_base", keywords: ["handle", "base", "attachment", "strap", "d-ring", "dring", "ring"] },
  { view: "stitching", keywords: ["stitch", "stitching", "seam"] },
];

function normalizeName(name = "") {
  return name.toLowerCase().replace(/\s+/g, "_");
}

function guessViewFromFilename(originalname = "") {
  const n = normalizeName(originalname);
  for (const { view, keywords } of VIEW_KEYWORDS) {
    if (keywords.some(k => n.includes(k))) return view;
  }
  return null; // unknown/unclassified
}

function isLikelyTooSmall(file) {
  // Heuristic: extremely small images are often unusable / thumbnails
  // Tune if needed. Keeps system conservative.
  return file.size < 60_000; // 60 KB
}

function hasSuspiciousMimetype(file) {
  return !file.mimetype || !file.mimetype.startsWith("image/");
}

function buildCoreVerdict({ files }) {
  const reasons = [];
  const red_flags = [];
  const missing_photos = [];

  // Basic validations
  if (!files || files.length === 0) {
    return {
      verdict: "Inconclusive",
      confidence: 0,
      reasons: ["No images received"],
      missing_photos: [...REQUIRED_VIEWS],
      red_flags: [],
    };
  }

  // Classify views conservatively (soft hints)
  const viewBuckets = new Map(); // view -> file
  const unclassified = [];

  // detect duplicates by normalized name + size (cheap, deterministic)
  const seen = new Set();

  for (const f of files) {
    const key = `${normalizeName(f.originalname)}:${f.size}`;
    if (seen.has(key)) {
      red_flags.push(`Duplicate upload detected: ${f.originalname} (${f.size} bytes)`);
      continue;
    }
    seen.add(key);

    if (hasSuspiciousMimetype(f)) {
      red_flags.push(`Non-image mimetype: ${f.originalname} (${f.mimetype || "unknown"})`);
      continue;
    }

    if (isLikelyTooSmall(f)) {
      // Treat as unclear rather than hard fake
      red_flags.push(`Low-information image (very small): ${f.originalname} (${f.size} bytes)`);
      continue;
    }

    const guessed = guessViewFromFilename(f.originalname);
    if (!guessed) {
      unclassified.push(f.originalname);
      continue;
    }

    // Only take first for each view to avoid overwriting
    if (!viewBuckets.has(guessed)) viewBuckets.set(guessed, f.originalname);
  }

  // Required view gating
  for (const v of REQUIRED_VIEWS) {
    if (!viewBuckets.has(v)) missing_photos.push(v);
  }

  if (unclassified.length > 0) {
    reasons.push(`Unclassified images received: ${unclassified.slice(0, 5).join(", ")}${unclassified.length > 5 ? "…" : ""}`);
  }

  // Verdict rules
  if (missing_photos.length > 0) {
    reasons.unshift("Missing or unclear required views");
    return {
      verdict: "Inconclusive",
      confidence: Math.min(45, 20 + (REQUIRED_VIEWS.length - missing_photos.length) * 3 - red_flags.length * 5),
      reasons,
      missing_photos,
      red_flags,
    };
  }

  // If 3+ red flags across universal checks => likely not authentic (conservative)
  if (red_flags.length >= 3) {
    reasons.unshift("Multiple technical inconsistencies detected");
    return {
      verdict: "Likely Not Authentic",
      confidence: Math.min(70, 50 + red_flags.length * 5),
      reasons,
      missing_photos: [],
      red_flags,
    };
  }

  // Clean + complete => likely authentic (still conservative)
  return {
    verdict: "Likely Authentic",
    confidence: Math.min(85, 70 - red_flags.length * 5),
    reasons: reasons.length ? reasons : ["All required views present; no universal quality red flags"],
    missing_photos: [],
    red_flags,
  };
}

// ---------- /verify route (replace your current handler) ----------
app.post("/verify", upload.array("images", 10), async (req, res) => {
  try {
    const result = buildCoreVerdict({ files: req.files || [] });
    return res.json(result);
  } catch (err) {
    return res.json({
      verdict: "Inconclusive",
      confidence: 0,
      reasons: ["Server error during verification"],
      missing_photos: [],
      red_flags: [],
    });
  }
});
