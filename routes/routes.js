// routes/routes.js
const express = require("express");
const dateController = require("../controllers/dateController");
const pdfController = require("../controllers/pdfController");

const router = express.Router();

router.get("/reports", dateController.getDatePage);
router.post("/reports", dateController.postDate);
//router.post("/generate-pdf", pdfController.generatePDF); // New route for PDF generation
router.post("/generate-pdf", pdfController.generatePDF);

module.exports = router;
