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
