const PDFDocument = require("pdfkit");
const path = require("path");
const { getReportData } = require("../models/PdfModel.js");

exports.generatePDF = async (req, res) => {
  const { date, office, report, selectedRegion } = req.body;
  console.log("selected region:", selectedRegion);

  try {
    const payrollData = await getReportData(
      date,
      office,
      report,
      selectedRegion
    );
    if (!payrollData.length) {
      return res.status(404).json({ error: "No payroll data found" });
    }

    let filename;
    if (selectedRegion === "") {
      filename = `${report}_${office}_${date}.pdf`;
    } else {
      filename = `${report}_${office}__${selectedRegion}_${date}.pdf`;
    }
    const doc = new PDFDocument();

    // Set headers for the response to prompt download
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/pdf");

    // Pipe the PDF document to the response
    doc.pipe(res);

    const logoPath = path.join(__dirname, "../public/images/logo.png");
    const logoWidth = 200;

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

      // Add header for the first page of each region
      addHeader(doc, logoPath, office, region, date, report);

      // Add employee data and summary
      addEmployeeData(
        doc,
        logoPath,
        office,
        region,
        groupedData[region],
        date,
        report
      );
    });

    // // Add the date at the end, centered below the employee data
    // doc.fontSize(6).text(`Date: ${new Date()}`, { align: "right" });

    // End the document
    doc.end();
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
};

const addHeader = (doc, logoPath, office, region, date, report) => {
  const logoWidth = 200;
  const xPosition = (doc.page.width - logoWidth) / 2;

  doc.image(logoPath, xPosition, 45, { width: logoWidth });
  doc.moveDown(0.8);

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(`HUMAN RESOURCES MANAGEMENT DIVISION`, { align: "center" });
  doc.moveDown(0.5);

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(`${report.toUpperCase()} ${office.toUpperCase()} REPORT`, {
      align: "center",
    });
  doc.moveDown(0.5);

  // Region with bold
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(`Region/Division: ${region}`, { align: "left" });
  doc.moveDown(0.5);

  // Payroll Date header
  const formattedDate = formatDateString(date);
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(`Payroll Date: ${formattedDate}`, { align: "left" });
  doc.moveDown(0.8);
};

const addEmployeeData = (
  doc,
  logoPath,
  office,
  region,
  employees,
  date,
  report
) => {
  // Set header for the employee data
  addEmployeeTableHeader(doc, report);

  // Initialize counters for each region
  let totalEmployees = 0;
  let totalNetPay = 0;

  // Add employee data
  employees.forEach((employee) => {
    const rowHeight = 15; // Estimated row height
    const remainingHeight = doc.page.height - doc.y - doc.page.margins.bottom;

    // Check if there is enough space for another row, else add a new page
    if (remainingHeight < rowHeight) {
      doc.addPage();
      addHeader(doc, logoPath, office, region, date, report); // Add header on new page
      addEmployeeTableHeader(doc, report); // Add the employee headers again on the new page
    }

    const rowY = doc.y;
    const totalNet = isNaN(employee.totalnet) ? 0 : employee.totalnet;
    const formattedTotalNet = totalNet.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    // Use fixed x-positions for each column to align the data horizontally
    doc
      .font("Helvetica") // Ensure normal font for employee data
      .fontSize(9)
      .text(employee.idno || "N/A", 50, rowY)
      .text(employee.employeeName || "N/A", 200, rowY)
      .text(formattedTotalNet, 350, rowY, { align: "right" });
    doc.moveDown(0.2);

    // Update region-level counters
    totalEmployees += 1;
    totalNetPay += totalNet;
  });

  // Check if there is enough space for the total summary and employees count
  const summaryRowHeight = 30; // Estimated height for both totals and spacing
  const remainingHeightAfterData =
    doc.page.height - doc.y - doc.page.margins.bottom;

  if (remainingHeightAfterData < summaryRowHeight) {
    doc.addPage();
    addHeader(doc, logoPath, office, region, date, report); // Add header on new page
  }

  // Add summary at the end
  const formattedTotalNetPay = totalNetPay.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Draw line above summary
  const summaryStartY = doc.y;
  doc
    .moveTo(50, summaryStartY)
    .lineTo(doc.page.width - 50, summaryStartY)
    .stroke();

  doc.moveDown(0.5); // Space before the summary line
  const summaryY = doc.y; // Capture the current y position for both texts

  // Draw Total Employees on the left
  doc
    .font("Helvetica-Bold") // Bold font for summary
    .fontSize(9)
    .text(`Total Employees: ${totalEmployees}`, 50, summaryY);

  // Draw Total Net Pay on the right, same y-coordinate
  doc
    .font("Helvetica-Bold") // Bold font for total net pay
    .fontSize(9)
    .text(`Total: ${formattedTotalNetPay}`, 350, summaryY, {
      align: "right",
    });
  // Draw line below summary
  // const summaryEndY = doc.y;
  // doc
  //   .moveTo(50, summaryEndY)
  //   .lineTo(doc.page.width - 50, summaryEndY) // Line after summary
  //   .stroke();
  doc.moveDown(0.5); // Space after the summary
  // Add the date at the end, centered below the employee data
  doc.fontSize(6).text(`Date: ${new Date()}`, { align: "right" });
};

const addEmployeeTableHeader = (doc, report) => {
  const headerY = doc.y;

  // Draw line above headers
  doc
    .moveTo(50, headerY - 5)
    .lineTo(doc.page.width - 50, headerY - 5)
    .stroke();

  // Set header for the employee data
  doc.font("Helvetica-Bold").fontSize(9).text("IDNO", 50, headerY);
  doc.text("Employee Name", 200, headerY);
  doc.text(report, 350, headerY, { align: "right" });

  // Draw line below headers
  doc
    .moveTo(50, headerY + 10)
    .lineTo(doc.page.width - 50, headerY + 10)
    .stroke();
  doc.moveDown(0.5);
};

const formatDateString = (dateString) => {
  const date = new Date(dateString);
  const options = { year: "numeric", month: "long", day: "2-digit" };
  return date.toLocaleDateString("en-US", options);
};
