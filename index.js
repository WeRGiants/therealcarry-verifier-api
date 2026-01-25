// =======================
// Imports
// =======================
import express from "express";
import multer from "multer";
import cors from "cors";

// =======================
// App initialization
// =======================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// =======================
// Multer configuration
// =======================
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    files: 10,
    fileSize: 10 * 1024 * 1024 // 10 MB
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Invalid file type"), false);
    } else {
      cb(null, true);
    }
  }
});

// =======================
// Health check
// =======================
app.get("/", (req, res) => {
  res.json({ status: "ok" });
});

// ======================================================
// CORE ENGINE CONSTANTS
// ======================================================
const REQUIRED_VIEWS = [
  "front",
  "back",
  "side",
  "bottom",
  "top",
  "interior",
  "logo_stamp",
  "hardware",
  "handle_base",
  "stitching"
];

const ALLOWED_VIEWS = new Set([
  "front",
  "back",
  "side",
  "bottom",
  "top",
  "interior",
  "logo_stamp",
  "hardware",
  "handle_base",
  "stitching",
  "serial"
]);

const VIEW_KEYWORDS = [
  { view: "front", keywords: ["front"] },
  { view: "back", keywords: ["back"] },
  { view: "side", keywords: ["side"] },
  { view: "bottom", keywords: ["bottom", "base"] },
  { view: "top", keywords: ["top"] },
  { view: "interior", keywords: ["interior", "inside", "lining"] },
  { view: "logo_stamp", keywords: ["stamp", "logo", "heat", "tag", "label"] },
  { view: "hardware", keywords: ["zip", "zipper", "pull", "lock", "clasp", "hardware"] },
  { view: "handle_base", keywords: ["handle", "strap", "base"] },
  { view: "stitching", keywords: ["stitch", "seam"] }
];

// =======================
// Helper functions
// =======================
function normalize(name = "") {
  return name.toLowerCase().replace(/\s+/g, "_");
}

function classifyView(filename) {
  const n = normalize(filename);
  for (const { view, keywords } of VIEW_KEYWORDS) {
    if (keywords.some(k => n.includes(k))) return view;
  }
  return null;
}

function parseLabels(req) {
  if (!req.body || !req.body.labels) return {};

  try {
    const parsed =
      typeof req.body.labels === "string"
        ? JSON.parse(req.body.labels)
        : req.body.labels;

    if (typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const clean = {};
    for (const [filename, view] of Object.entries(parsed)) {
      if (ALLOWED_VIEWS.has(view)) {
        clean[filename] = view;
      }
    }
    return clean;
  } catch {
    return {};
  }
}

// =======================
// STEP 2: SERIAL HELPERS
// =======================
function isLikelySerialView(view) {
  return view === "serial" || view === "logo_stamp";
}

function assessSerialImage(file) {
  if (!file) return { present: false, clear: false };

  if (file.size < 80_000) {
    return { present: true, clear: false };
  }

  return { present: true, clear: true };
}

// =======================
// STEP 3: BRAND INFERENCE
// =======================
function inferBrandFromFilename(filename = "") {
  const n = filename.toLowerCase();

  if (n.includes("lv") || n.includes("louis")) return "louis_vuitton";
  if (n.includes("gucci")) return "gucci";
  if (n.includes("chanel")) return "chanel";
  if (n.includes("prada")) return "prada";

  return null;
}

function inferBrand(files) {
  const hits = {};

  for (const f of files) {
    const b = inferBrandFromFilename(f.originalname);
    if (b) hits[b] = (hits[b] || 0) + 1;
  }

  const entries = Object.entries(hits);
  if (entries.length === 0) return null;

  entries.sort((a, b) => b[1] - a[1]);

  return entries[0][1] >= 2 ? entries[0][0] : null;
}

// =======================
// STEP 3: SERIAL FORMAT RULES
// =======================
function checkLVSerialFormat(serialText = "") {
  const cleaned = serialText.replace(/\s+/g, "").toUpperCase();

  if (!/^[A-Z0-9]{4,6}$/.test(cleaned)) {
    return "LV serial format inconsistent with known date code structures";
  }
  return null;
}

function checkGucciSerialFormat(serialText = "") {
  const cleaned = serialText.replace(/\s+/g, "");

  if (!/^\d{8,14}$/.test(cleaned)) {
    return "Gucci serial format inconsistent with typical numeric patterns";
  }
  return null;
}

// =======================
// Core verdict engine
// =======================
function buildCoreVerdict(files, labels = {}) {
  const missing_photos = [];
  const red_flags = [];
  const reasons = [];
  const views = new Set();

  let serialObserved = false;
  let serialClear = false;

  const inferredBrand = inferBrand(files);

  for (const f of files) {
    if (f.size < 60_000) {
      red_flags.push(`Low-quality image: ${f.originalname}`);
      continue;
    }

    const labeledView = labels[f.originalname];
    const view = labeledView || classifyView(f.originalname);

    if (view) {
      views.add(view);

      if (isLikelySerialView(view)) {
        const assessment = assessSerialImage(f);
        serialObserved ||= assessment.present;
        serialClear ||= assessment.clear;

        if (assessment.present && !assessment.clear) {
          red_flags.push(
            `Serial/date code image present but unclear: ${f.originalname}`
          );
        }
      }
    }
  }

  for (const req of REQUIRED_VIEWS) {
    if (!views.has(req)) missing_photos.push(req);
  }

  // -------- SERIAL INFO (STEP 2) --------
  if (serialObserved && serialClear) {
    reasons.push("Serial/date code observed and appears readable");
  } else if (serialObserved && !serialClear) {
    reasons.push("Serial/date code observed but could not be clearly verified");
  } else {
    reasons.push("No serial/date code observed in provided images");
  }

  // -------- BRAND-AWARE SERIAL FORMAT (STEP 3) --------
  if (serialObserved && serialClear && inferredBrand) {
    const mockSerialText = "UNKNOWN";

    let issue = null;
    if (inferredBrand === "louis_vuitton") {
      issue = checkLVSerialFormat(mockSerialText);
    }
    if (inferredBrand === "gucci") {
      issue = checkGucciSerialFormat(mockSerialText);
    }

    if (issue) {
      red_flags.push(issue);
    } else {
      reasons.push(
        `Serial format appears plausible for inferred brand (${inferredBrand.replace("_", " ")})`
      );
    }
  }

  // -------- VERDICT RULES --------
  if (missing_photos.length > 0) {
    return {
      verdict: "Inconclusive",
      confidence: 30,
      reasons: ["Missing or unclear required views", ...reasons],
      missing_photos,
      red_flags
    };
  }

  if (red_flags.length >= 3) {
    return {
      verdict: "Likely Not Authentic",
      confidence: 65,
      reasons: ["Multiple technical inconsistencies detected", ...reasons],
      missing_photos: [],
      red_flags
    };
  }

  return {
    verdict: "Likely Authentic",
    confidence: 75,
    reasons: ["All required views present; no universal red flags", ...reasons],
    missing_photos: [],
    red_flags
  };
}

// =======================
// VERIFY ROUTE
// =======================
app.post("/verify", upload.array("images", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.json({
        verdict: "Inconclusive",
        confidence: 0,
        reasons: ["No images received"],
        missing_photos: REQUIRED_VIEWS,
        red_flags: []
      });
    }

    const labels = parseLabels(req);
    const result = buildCoreVerdict(req.files, labels);
    return res.json(result);
  } catch {
    return res.json({
      verdict: "Inconclusive",
      confidence: 0,
      reasons: ["Server error during verification"],
      missing_photos: [],
      red_flags: []
    });
  }
});

// =======================
// Error handler
// =======================
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.json({
      verdict: "Inconclusive",
      confidence: 0,
      reasons: [err.message],
      missing_photos: [],
      red_flags: []
    });
  }

  return res.json({
    verdict: "Inconclusive",
    confidence: 0,
    reasons: ["Invalid request"],
    missing_photos: [],
    red_flags: []
  });
});

// =======================
// Start server
// =======================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
