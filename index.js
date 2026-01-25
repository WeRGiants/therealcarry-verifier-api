// =======================
// Imports (MUST be first)
// =======================
import express from "express";
import multer from "multer";
import cors from "cors";

// =======================
// App initialization
// =======================
const app = express();
const PORT = process.env.PORT || 3000;

// =======================
// Middleware
// =======================
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
// CORE ENGINE (brand-agnostic, SAFE to live here)
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

const VIEW_KEYWORDS = [
  { view: "front", keywords: ["front"] },
  { view: "back", keywords: ["back"] },
  { view: "side", keywords: ["side"] },
  { view: "bottom", keywords: ["bottom", "base"] },
  { view: "top", keywords: ["top"] },
  { view: "interior", keywords: ["interior", "inside", "lining"] },
  { view: "logo_stamp", keywords: ["stamp", "logo", "heat", "serial", "label", "tag"] },
  { view: "hardware", keywords: ["zip", "zipper", "pull", "lock", "clasp", "hardware"] },
  { view: "handle_base", keywords: ["handle", "strap", "base"] },
  { view: "stitching", keywords: ["stitch", "seam"] }
];

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

function buildCoreVerdict(files) {
  const missing_photos = [];
  const red_flags = [];
  const reasons = [];
  const views = new Set();

  for (const f of files) {
    if (f.size < 60000) {
      red_flags.push(`Low-quality image: ${f.originalname}`);
      continue;
    }

    const v = classifyView(f.originalname);
    if (v) views.add(v);
  }

  for (const req of REQUIRED_VIEWS) {
    if (!views.has(req)) missing_photos.push(req);
  }

  if (missing_photos.length > 0) {
    return {
      verdict: "Inconclusive",
      confidence: 30,
      reasons: ["Missing or unclear required views"],
      missing_photos,
      red_flags
    };
  }

  if (red_flags.length >= 3) {
    return {
      verdict: "Likely Not Authentic",
      confidence: 65,
      reasons: ["Multiple technical inconsistencies detected"],
      missing_photos: [],
      red_flags
    };
  }

  return {
    verdict: "Likely Authentic",
    confidence: 75,
    reasons: ["All required views present; no universal red flags"],
    missing_photos: [],
    red_flags
  };
}

// =======================
// VERIFY ROUTE (AFTER app exists)
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

    const result = buildCoreVerdict(req.files);
    return res.json(result);

  } catch (err) {
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
// Start server (LAST)
// =======================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
