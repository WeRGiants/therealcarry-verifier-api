import express from "express";

const app = express();
app.use(express.json({ limit: "20mb" }));

app.get("/", (req, res) => {
  res.send("The Real Carry Verification API is running");
});

app.post("/authenticate", (req, res) => {
  return res.json({
    verdict: "Likely Authentic",
    confidence: 88,
    reasons: [
      "Brand identifiers visually consistent",
      "Construction and materials align with brand standards"
    ],
    missing_photos: [],
    red_flags: [],
    certificate: {
      certificate_id: "TRC-TEST-001",
      brand: "Test Brand",
      item_name: "Test Bag",
      decision_date: new Date().toISOString(),
      issuer: "The Real Carry",
      public_status: "Verified Authentic",
      certificate_title: "Verified Authentic",
      certificate_statement:
        "This item has been verified authentic based on observable brand identifiers.",
      certificate_eligible: true
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
