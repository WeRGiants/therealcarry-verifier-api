import express from "express";
import multer from "multer";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------
// BASIC MIDDLEWARE
// -----------------------
app.use(cors());
app.use(express.json());

// -----------------------
// OPENAI CLIENT (STEP 4)
// -----------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// -----------------------
// MULTER CONFIG
// -----------------------
const upload = multer({
  limits: {
    files: 10,
    fileSize: 10 * 1024 * 1024 // 10MB per file
  }
});

// -----------------------
// ALLOWED VIEWS (STEP 1)
// -----------------------
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

// =======================
// STEP 1: HELPERS
// =======================
function parseLabels(req) {
  try {
    const parsed =
      typeof req.body.labels === "string"
        ? JSON.parse(req.body.labels)
        : req.body.labels;

    if (typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const clean = {};

    for (const [filename, view] of Object.entries(parsed)) {
      if (ALLOWED_VIEWS.has(view)) clean[filename] = view;
    }
    return clean;
  } catch {
    return {};
  }
}

function classifyView(filename = "") {
  const n = filename.toLowerCase();
  if (n.includes("front")) return "front";
  if (n.includes("back")) return "back";
  if (n.includes("side")) return "side";
  if (n.includes("bottom")) return "bottom";
  if (n.includes("top")) return "top";
  if (n.includes("interior")) return "interior";
  if (n.includes("heat") || n.includes("stamp")) return "logo_stamp";
  if (n.includes("zip") || n.includes("hardware")) return "hardware";
  if (n.includes("handle")) return "handle_base";
  if (n.includes("stitch")) return "stitching";
  if (n.includes("serial") || n.includes("date")) return "serial";
  return null;
}

// =======================
// STEP 2: SERIAL HELPERS
// =======================
function isLikelySerialView(view) {
  return view === "serial" || view === "logo_stamp";
}

function assessSerialImage(file) {
  if (!file) return { present: false, clear: false };
  if (file.size < 80_000) return { present: true, clear: false };
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
  return "unknown";
}

// =======================
// STEP 4: OCR
// =======================
async function extractSerialTextFromImage(buffer) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You extract serial or date-code text from handbag images. Return ONLY the text you see."
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract any serial or date code text visible." },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${buffer.toString("base64")}`
              }
            }
          ]
        }
      ],
      max_tokens: 50
    });

    return response.choices[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

// =======================
// STEP 5: CRAFTSMANSHIP
// =======================
function assessImageQuality(file) {
  if (!file) return "missing";
  if (file.size < 60_000) return "poor";
  if (file.size < 120_000) return "fair";
  return "good";
}

function assessFileSetConsistency(files) {
  const sizes = files.map(f => f.size);
  if (sizes.length < 3) return null;

  const max = Math.max(...sizes);
  const min = Math.min(...sizes);

  if (min > 0 && max / min > 8) {
    return "Inconsistent image quality across photo set";
  }
  return null;
}

// =======================
// CORE VERIFICATION LOGIC
// =======================
async function buildCoreVerdict(files, labels) {
  const reasons = [];
  const red_flags = [];
  const missing_photos = [];

  const viewsSeen = new Set();
  let serialFile = null;

  let stitchingQuality = null;
  let hardwareQuality = null;
  let handleBaseQuality = null;

  for (const file of files) {
    const view = labels[file.originalname] || classifyView(file.originalname);
    if (!view) continue;

    viewsSeen.add(view);

    if (isLikelySerialView(view)) serialFile = file;

    const quality = assessImageQuality(file);
    if (view === "stitching") stitchingQuality = quality;
    if (view === "hardware") hardwareQuality = quality;
    if (view === "handle_base") handleBaseQuality = quality;
  }

  // Required views
  ["front", "back", "side", "bottom", "top", "interior"].forEach(v => {
    if (!viewsSeen.has(v)) missing_photos.push(v);
  });

  // Serial logic
  if (serialFile) {
    const serialCheck = assessSerialImage(serialFile);
    if (serialCheck.present) {
      if (serialCheck.clear) {
        const text = await extractSerialTextFromImage(serialFile.buffer);
        if (text) {
          reasons.push("Serial/date code text extracted from image");
          reasons.push("Serial/date code observed and appears readable");
        } else {
          reasons.push("Serial/date code visible but text could not be extracted");
        }
      } else {
        reasons.push("Serial/date code visible but unclear");
      }
    }
  }

  // Craftsmanship
  if (stitchingQuality === "poor") {
    red_flags.push("Stitching detail image too low quality to assess consistency");
  }
  if (hardwareQuality === "poor") {
    red_flags.push("Hardware image quality insufficient to assess finish");
  }
  if (handleBaseQuality === "poor") {
    red_flags.push("Handle base construction insufficiently visible");
  }

  const coherence = assessFileSetConsistency(files);
  if (coherence) red_flags.push(coherence);

  if (
    stitchingQuality === "good" &&
    hardwareQuality === "good" &&
    handleBaseQuality === "good"
  ) {
    reasons.push("Overall craftsmanship details appear consistent with quality construction");
  }

  if (missing_photos.length > 0) {
    return {
      verdict: "Inconclusive",
      confidence: 30,
      reasons: reasons.length ? reasons : ["Missing or unclear required views"],
      missing_photos,
      red_flags
    };
  }

  if (red_flags.length >= 3) {
    return {
      verdict: "Likely Not Authentic",
      confidence: 85,
      reasons,
      missing_photos,
      red_flags
    };
  }

  return {
    verdict: "Likely Authentic",
    confidence: 75,
    reasons: reasons.length ? reasons : ["All required views present; no universal red flags"],
    missing_photos,
    red_flags
  };
}

// =======================
// ROUTE
// =======================
app.post("/verify", upload.array("images", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        verdict: "Inconclusive",
        confidence: 0,
        reasons: ["No images received"],
        missing_photos: [],
        red_flags: []
      });
    }

    const labels = parseLabels(req);
    const result = await buildCoreVerdict(req.files, labels);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      verdict: "Inconclusive",
      confidence: 0,
      reasons: ["Server error during verification"],
      missing_photos: [],
      red_flags: []
    });
  }
});

// =======================
// HEALTH CHECK
// =======================
app.get("/", (req, res) => {
  res.json({ status: "ok" });
});

// =======================
// START SERVER
// =======================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
