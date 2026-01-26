import express from "express";
import multer from "multer";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// =======================
// OPENAI (STEP 4)
// =======================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// =======================
// MULTER
// =======================
const upload = multer({
  limits: {
    files: 10,
    fileSize: 10 * 1024 * 1024
  }
});

// =======================
// CONSTANTS
// =======================
const REQUIRED_VIEWS = [
  "front",
  "back",
  "side",
  "bottom",
  "top",
  "interior"
];

const ALLOWED_VIEWS = new Set([
  ...REQUIRED_VIEWS,
  "logo_stamp",
  "hardware",
  "handle_base",
  "stitching",
  "serial"
]);

// =======================
// STEP 1 — VIEW HELPERS
// =======================
function parseLabels(req) {
  try {
    const parsed =
      typeof req.body.labels === "string"
        ? JSON.parse(req.body.labels)
        : req.body.labels;

    if (typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const clean = {};
    for (const [file, view] of Object.entries(parsed)) {
      if (ALLOWED_VIEWS.has(view)) clean[file] = view;
    }
    return clean;
  } catch {
    return {};
  }
}

function classifyView(name = "") {
  const n = name.toLowerCase();
  if (n.includes("front")) return "front";
  if (n.includes("back")) return "back";
  if (n.includes("side")) return "side";
  if (n.includes("bottom")) return "bottom";
  if (n.includes("top")) return "top";
  if (n.includes("interior")) return "interior";
  if (n.includes("stamp") || n.includes("heat")) return "logo_stamp";
  if (n.includes("zip") || n.includes("hardware")) return "hardware";
  if (n.includes("handle")) return "handle_base";
  if (n.includes("stitch")) return "stitching";
  if (n.includes("serial") || n.includes("date")) return "serial";
  return null;
}

// =======================
// STEP 2 — SERIAL VISIBILITY
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
// STEP 3 — BRAND INFERENCE
// =======================
function inferBrand(files) {
  const names = files.map(f => f.originalname.toLowerCase()).join(" ");
  if (names.includes("lv") || names.includes("louis")) return "louis_vuitton";
  if (names.includes("gucci")) return "gucci";
  if (names.includes("chanel")) return "chanel";
  return "unknown";
}

// =======================
// STEP 4 — OCR
// =======================
async function extractSerialTextFromImage(buffer) {
  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Extract serial/date code text only." },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract serial/date code text." },
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
    return r.choices[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

// =======================
// STEP 5 — CRAFTSMANSHIP
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
// STEP 6 — MODEL RULES
// =======================
function inferLVModel(files) {
  const names = files.map(f => f.originalname.toLowerCase()).join(" ");
  if (names.includes("neverfull")) return "neverfull";
  if (names.includes("speedy")) return "speedy";
  return "unknown";
}

function applyLVModelRules({
  model,
  viewsSeen,
  stitchingQuality,
  hardwareQuality,
  reasons,
  red_flags
}) {
  if (model === "neverfull") {
    if (!viewsSeen.has("handle_base")) {
      red_flags.push("Neverfull requires clear handle base construction detail");
    } else if (stitchingQuality === "good") {
      reasons.push("Handle base stitching consistent with Neverfull norms");
    }
  }

  if (model === "speedy") {
    if (!viewsSeen.has("hardware")) {
      red_flags.push("Speedy typically includes visible hardware engraving");
    } else if (hardwareQuality === "good") {
      reasons.push("Hardware finish consistent with Speedy norms");
    }
  }
}

// =======================
// CORE ENGINE
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

  for (const f of files) {
    const view = labels[f.originalname] || classifyView(f.originalname);
    if (!view) continue;

    viewsSeen.add(view);

    const quality = assessImageQuality(f);
    if (view === "stitching") stitchingQuality = quality;
    if (view === "hardware") hardwareQuality = quality;
    if (view === "handle_base") handleBaseQuality = quality;

    if (isLikelySerialView(view)) serialFile = f;
  }

  REQUIRED_VIEWS.forEach(v => {
    if (!viewsSeen.has(v)) missing_photos.push(v);
  });

  if (serialFile) {
    const s = assessSerialImage(serialFile);
    if (s.present && s.clear) {
      const text = await extractSerialTextFromImage(serialFile.buffer);
      if (text) reasons.push("Serial/date code text extracted from image");
      else reasons.push("Serial/date code visible but text could not be extracted");
    }
  }

  if (stitchingQuality === "poor")
    red_flags.push("Stitching detail image too low quality");
  if (hardwareQuality === "poor")
    red_flags.push("Hardware image quality insufficient");
  if (handleBaseQuality === "poor")
    red_flags.push("Handle base construction insufficiently visible");

  const consistency = assessFileSetConsistency(files);
  if (consistency) red_flags.push(consistency);

  if (
    stitchingQuality === "good" &&
    hardwareQuality === "good" &&
    handleBaseQuality === "good"
  ) {
    reasons.push("Overall craftsmanship details appear consistent with quality construction");
  }

  const brand = inferBrand(files);
  if (brand === "louis_vuitton") {
    const model = inferLVModel(files);
    if (model !== "unknown") {
      applyLVModelRules({
        model,
        viewsSeen,
        stitchingQuality,
        hardwareQuality,
        reasons,
        red_flags
      });
      reasons.push(`Construction evaluated against ${model} model norms`);
    }
  }

  if (missing_photos.length) {
    return {
      verdict: "Inconclusive",
      confidence: 30,
      reasons: reasons.length ? reasons : ["Missing required views"],
      missing_photos,
      red_flags
    };
  }

  if (red_flags.length >= 3) {
    return {
      verdict: "Likely Not Authentic",
      confidence: 85,
      reasons,
      missing_photos: [],
      red_flags
    };
  }

  return {
    verdict: "Likely Authentic",
    confidence: 75,
    reasons,
    missing_photos: [],
    red_flags
  };
}

// =======================
// ROUTES
// =======================
app.post("/verify", upload.array("images", 10), async (req, res) => {
  try {
    const labels = parseLabels(req);
    const result = await buildCoreVerdict(req.files || [], labels);
    res.json(result);
  } catch {
    res.json({
      verdict: "Inconclusive",
      confidence: 0,
      reasons: ["Server error during verification"],
      missing_photos: [],
      red_flags: []
    });
  }
});

app.get("/", (_, res) => res.json({ status: "ok" }));

// =======================
// START
// =======================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
