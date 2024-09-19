// controllers/pdfController.js
const PDFDocument = require("pdfkit");
const path = require("path");
const { getReportData } = require("../models/PdfModel.js");

exports.generatePDF = async (req, res) => {
  const { date, office, report } = req.body;
  console.log("controller: ", report, "date: ", date, "office: ", office);

  try {
    const payrollData = await getReportData(date, office, report);
    if (!payrollData.length) {
      return res.status(404).json({ error: "No payroll data found" });
    }

    const doc = new PDFDocument();
    const filename = `Report_${office}_${date}.pdf`;

    // Set headers for the response to prompt download
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/pdf");

    // Pipe the PDF document to the response
    doc.pipe(res);

    const logoPath = path.join(__dirname, "../public/images/logo.png");
    const logoWidth = 200;
    const xPosition = (doc.page.width - logoWidth) / 2;

    // Group data by region
    const groupedData = {};
    payrollData.forEach((item) => {
      if (!groupedData[item.region]) {
        groupedData[item.region] = [];
      }
      groupedData[item.region].push(item);
    });

    // Add data to PDF by region
    Object.keys(groupedData).forEach((region, regionIndex) => {
      if (regionIndex > 0) doc.addPage(); // Add new page for each region except the first one

      // Add Logo and title for each region
      doc.image(logoPath, xPosition, 45, { width: logoWidth });
      doc.moveDown();

      // Title with bold font
      doc
        .font("Helvetica-Bold") // Set bold font
        .fontSize(11)
        .text(`Payroll Report for ${office}`, { align: "center" });
      doc.moveDown(0.5);

      // Region with bold and underline
      doc
        .font("Helvetica-Bold") // Bold font for region
        .fontSize(9)
        .text(`Region: ${region}`, { underline: false, align: "left" });
      doc.moveDown(0.5);

      // Payroll Date header
      doc
        .font("Helvetica-Bold") // Bold font for region
        .fontSize(9)
        .text(`Payroll Date: ${date}`, { underline: false, align: "left" });
      doc.moveDown(0.8);

      // Add table headers with bold font
      const headerY = doc.y; // Store the y-position of the header row

      // Draw line above headers
      doc
        .moveTo(50, headerY - 5)
        .lineTo(doc.page.width - 50, headerY - 5) // Extend line to the right margin
        .stroke();

      doc
        .font("Helvetica-Bold") // Set bold font for headers
        .fontSize(9)
        .text("Last Name", 50, headerY);
      doc.text("First Name", 200, headerY);
      doc.text("Total Net", 350, headerY, { align: "right" });

      // Draw line below headers
      doc
        .moveTo(50, headerY + 10)
        .lineTo(doc.page.width - 50, headerY + 10) // Extend line to the right margin
        .stroke();
      doc.moveDown(0.5);

      // Add employee data with fixed positions
      doc.font("Helvetica"); // Reset to normal font for the rows
      groupedData[region].forEach((employee) => {
        const rowHeight = 15; // Estimated row height, adjust as needed
        const remainingHeight =
          doc.page.height - doc.y - doc.page.margins.bottom;

        // Check if there is enough space for another row, else add a new page
        if (remainingHeight < rowHeight) {
          doc.addPage();
        }

        const rowY = doc.y; // Get the current y-position for the row

        // Ensure totalnet is a valid number, default to 0 if invalid
        const totalNet = isNaN(employee.totalnet) ? 0 : employee.totalnet;

        // Use fixed x-positions for each column to align the data horizontally
        doc
          .fontSize(9)
          .text(employee.lastname || "N/A", 50, rowY) // Last Name at X = 50
          .text(employee.firstname || "N/A", 200, rowY) // First Name at X = 200
          .text(totalNet.toFixed(2), 350, rowY, { align: "right" }); // Total Net at X = 350
        doc.moveDown(0.2); // Space between rows
      });

      doc.moveDown(1); // Space after each region
    });

    // Add the date at the end, centered below the employee data
    doc.moveDown(1);
    doc.fontSize(10).text(`Date: ${date}`, { align: "center" });

    // End the document
    doc.end();
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
};
