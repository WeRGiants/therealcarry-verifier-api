import express from "express";
import multer from "multer";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3000;

/* allow WordPress */
app.use(cors());
app.use(express.json());

/* multer setup (memory, multiple files) */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 10,                 // max 10 images
  },
});

/* health check */
app.get("/", (req, res) => {
  res.json({ status: "ok" });
});

/* MULTI-IMAGE UPLOAD ENDPOINT */
app.post("/verify", upload.array("images", 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files received" });
  }

  const files = req.files.map((f) => ({
    name: f.originalname,
    type: f.mimetype,
    size: f.size,
  }));

  res.json({
    success: true,
    count: files.length,
    files,
  });
});

app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
