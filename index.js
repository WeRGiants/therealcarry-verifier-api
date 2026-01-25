import express from "express";
import multer from "multer";

const app = express();
const port = process.env.PORT || 3000;

// Multer config (memory, multiple files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB per file
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok" });
});

// MULTI-IMAGE ENDPOINT
app.post("/verify", upload.array("images", 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No images received" });
  }

  // Basic confirmation (we’ll add AI later)
  const files = req.files.map(f => ({
    name: f.originalname,
    size: f.size,
    type: f.mimetype
  }));

  res.json({
    success: true,
    count: files.length,
    files
  });
});

app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
