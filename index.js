import express from "express";
import multer from "multer";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

/* -------------------- Middleware -------------------- */
app.use(cors());
app.use(express.json());

/* -------------------- Multer Config -------------------- */
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    files: 10,              // max 10 images
    fileSize: 10 * 1024 * 1024 // 10 MB total (Render-safe)
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files allowed"), false);
    } else {
      cb(null, true);
    }
  }
});

/* -------------------- Health Check -------------------- */
app.get("/", (req, res) => {
  res.json({ status: "ok" });
});

/* -------------------- VERIFY ENDPOINT -------------------- */
app.post("/verify", upload.array("images", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.json({
        verdict: "Inconclusive",
        confidence: 0,
        reasons: ["No images received"],
        missing_photos: ["front","back","side","bottom","top","interior","heat_stamp","zipper_pull","handle_base","stitching"],
        red_flags: []
      });
    }

    /* --------------------------------------------------
       PLACEHOLDER AUTH LOGIC
       (This is where LV rules will go)
       -------------------------------------------------- */

    return res.json({
      verdict: "Inconclusive",
      confidence: 30,
      reasons: ["Authentication logic pending"],
      missing_photos: [],
      red_flags: []
    });

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

/* -------------------- Error Handler -------------------- */
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

/* -------------------- Start Server -------------------- */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
