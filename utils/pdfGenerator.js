// utils/pdfGenerator.js
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// Utility function to generate the PDF
exports.generatePdf = (reportData, date, office) => {
  console.log("generatePDF:", reportData);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();

    // Create buffers to store the PDF data
    let buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      const pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });

    // Add Logo
    doc
      .image(path.join(__dirname, "../public/images/logo.jpg"), 50, 45, {
        width: 50,
      })
      .fontSize(20)
      .text(`Payroll Report for ${office}`, 110, 57)
      .fontSize(14)
      .text(`Date: ${date}`, 50, 100);

    // Table Headers
    doc.moveDown().fontSize(12);
    doc.text("Region", { continued: true, width: 150 });
    doc.text("Lastname", { continued: true, width: 150 });
    doc.text("Firstname", { continued: true, width: 150 });
    doc.text("Net Pay", { align: "right" });

    // Table Data
    reportData.forEach((item) => {
      doc.moveDown().fontSize(10);
      doc.text(item.Region, { continued: true, width: 150 });
      doc.text(item.lastname, { continued: true, width: 150 });
      doc.text(item.firstname, { continued: true, width: 150 });
      doc.text(item.netpay.toFixed(2), { align: "right" });
    });

    // Finalize PDF
    doc.end();
  });
};
