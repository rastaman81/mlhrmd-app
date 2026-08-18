// models/benefitsReportsModel.js
const utilitiesModel = require('./utilitiesModel');
const lastPayModel = require('./lastPayModel');

// Get all exit computations for an employee (for reprint)
async function getEmployeeExitComputations(office, idno) {
  const dbPool = utilitiesModel.getDbPool('default');
  const [rows] = await dbPool.query(
    `SELECT 
      idno,
      CONCAT(lastname, ', ', firstname) AS fullname,
      transDate,
      resignedDate,
      gross,
      deductions,
      netPay,
      separationtype,
      mloffice AS office,
      status,
      region,
      department,
      transactiondate
    FROM benefits_exit_computations
    WHERE idno = ?
      AND mloffice = ?
    ORDER BY transDate DESC`,
    [idno, office],
  );
  return rows;
}

// Get a specific exit computation by transDate (for reprint)
async function getExitComputationByDate(office, idno, transDate) {
  const dbPool = utilitiesModel.getDbPool('default');
  const [rows] = await dbPool.query(
    `SELECT 
      idno,
      CONCAT(lastname, ', ', firstname) AS fullname,
      lastname,
      firstname,
      branch,
      hireDate,
      resignedDate,
      losYears,
      losMonths,
      days,
      monthlyRate,
      losAmount,
      otherincome,
      otherincomeamount,
      thriteenthMonth AS thirteenthMonth,
      gross,
      deductions,
      netPay,
      mloffice AS office,
      separationtype,
      region,
      department,
      transDate,
      otherincome2,
      otherincomeamount2,
      status
    FROM benefits_exit_computations
    WHERE idno = ?
      AND transDate = ?
      AND mloffice = ?`,
    [idno, transDate, office],
  );
  return rows[0] || null;
}

// Get deduction details for a specific computation
async function getExitDeductionDetails(idno, transDate) {
  const dbPool = utilitiesModel.getDbPool('default');
  const [rows] = await dbPool.query(
    `SELECT 
      deductiontype,
      outstanding,
      deduction,
      balance
    FROM benefits_exit_details
    WHERE idno = ?
      AND transdate = ?
    ORDER BY detailno`,
    [idno, transDate],
  );
  return rows;
}

// Get unique deduction types for dropdown
async function getDeductionTypes() {
  const dbPool = utilitiesModel.getDbPool('default');

  const [rows] = await dbPool.query(
    `SELECT DISTINCT 
      deductiontype
    FROM benefits_deduction_types
    ORDER BY deductiontype`,
  );

  return rows.map((row) => row.deductiontype);
}

// Get deduction type report
async function getDeductionTypeReport({ deductionType, dateFrom, dateTo, office = null }) {
  const dbPool = utilitiesModel.getDbPool('default');
  const params = [dateFrom, dateTo];

  let deductionCondition = '';
  if (deductionType) {
    deductionCondition = `AND ed.deduction_type = ?`;
    params.push(`${deductionType}`);
  }

  let officeCondition = '';
  if (office) {
    officeCondition = 'AND ec.mloffice = ?';
    params.push(office);
  }
  console.log(
    ` --------------------- SELECT 
      ed.idno,
      CONCAT(ec.lastname, ', ', ec.firstname) AS fullname,
      ec.region,
      ec.department,
      ec.mloffice AS office,
      ed.transdate,
      ed.deductiontype,
      ed.outstanding,
      ed.deduction,
      ed.balance,
      ec.status
    FROM benefits_exit_details ed
    INNER JOIN benefits_exit_computations ec 
      ON ed.idno = ec.idno AND ed.transdate = ec.transDate
    WHERE ed.transdate BETWEEN ? AND ?
      ${deductionCondition}
      ${officeCondition}
      AND ec.status = 'Processed'
    ORDER BY ec.lastname, ec.firstname`,
    params,
  );
  const [rows] = await dbPool.query(
    `SELECT 
      ed.idno,
      CONCAT(ec.lastname, ', ', ec.firstname) AS fullname,
      ec.region,
      ec.department,
      ec.mloffice AS office,
      ed.transdate,
      ed.deductiontype,
      ed.outstanding,
      ed.deduction,
      ed.balance,
      ec.status
    FROM benefits_exit_details ed
    INNER JOIN benefits_exit_computations ec 
      ON ed.idno = ec.idno AND ed.transdate = ec.transDate
    WHERE ed.transdate BETWEEN ? AND ?
      ${deductionCondition}
      ${officeCondition}
      AND ec.status = 'Processed'
    ORDER BY ec.region, ec.lastname, ec.firstname`,
    params,
  );

  // Calculate totals
  const totals = {
    totalOutstanding: rows.reduce((sum, r) => sum + parseFloat(r.outstanding || 0), 0),
    totalDeduction: rows.reduce((sum, r) => sum + parseFloat(r.deduction || 0), 0),
    totalBalance: rows.reduce((sum, r) => sum + parseFloat(r.balance || 0), 0),
    employeeCount: rows.length,
    uniqueEmployees: new Set(rows.map((r) => r.idno)).size,
    deductionTypesFound: [...new Set(rows.map((r) => r.deductiontype))].length,
  };

  return { rows, totals };
}

// Get prepared by credentials from benefits_credentials table
async function getPreparedByCredentials() {
  const dbPool = utilitiesModel.getDbPool('default');
  const [rows] = await dbPool.query(
    `SELECT preparedBy, preparedTitle 
     FROM benefits_credentials 
     ORDER BY credentialNo DESC 
     LIMIT 1`,
  );
  return rows[0] || null;
}

// Generate PDF for Deduction Type Report - UPDATED with Prepared By in body
async function generateDeductionReportPDF(data, reportParams, preparedByName) {
  const PDFDocument = require('pdfkit');
  const path = require('path');
  const fs = require('fs');

  return new Promise((resolve, reject) => {
    try {
      const PAGE_WIDTH = 8.5 * 72;
      const PAGE_HEIGHT = 11 * 72;
      const MARGIN = 30;

      const doc = new PDFDocument({
        size: [PAGE_WIDTH, PAGE_HEIGHT],
        margin: MARGIN,
        bufferPages: true,
        info: { Title: 'Deduction Type Report', Author: 'HRMS System' },
      });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { rows, totals } = data;
      const PAGE_LEFT = MARGIN;
      const PAGE_RIGHT = PAGE_WIDTH - MARGIN;
      const CONTENT_WIDTH = PAGE_RIGHT - PAGE_LEFT;

      let y = MARGIN;

      // --- Letterhead ---
      const logoPath = path.join(__dirname, '../public/images/logo.png');
      try {
        if (fs.existsSync(logoPath)) {
          const logoWidth = 150;
          doc.image(logoPath, (PAGE_WIDTH - logoWidth) / 2, MARGIN, { width: logoWidth });
          y = MARGIN + 28;
        }
      } catch (e) {}

      // Title section
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('HUMAN RESOURCES MANAGEMENT DIVISION', 0, y, { align: 'center' });
      y += 8;

      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .text('DEDUCTION TYPE REPORT', 0, y, { align: 'center' });
      y += 18;

      // --- EMPTY ROW (space after header) ---
      y += 8;

      // --- Deduction Type and Date Range (separate lines) ---
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text(`Deduction Type: ${reportParams.deductionType || 'All Types'}`, PAGE_LEFT, y);
      y += 14;

      doc.text(`Date Range: ${reportParams.dateFrom} to ${reportParams.dateTo}`, PAGE_LEFT, y);
      y += 14;

      if (reportParams.office) {
        doc.text(`Office: ${reportParams.office}`, PAGE_LEFT, y);
        y += 14;
      }

      // --- Summary Box (NO GAP) ---
      doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, 32).fill('#F6F7F9');
      const colWidth = CONTENT_WIDTH / 4;
      const summaryY = y + 8;
      doc.fillColor('#000');
      doc.font('Helvetica-Bold').fontSize(8);
      doc.text(
        `Total Outstanding: P${lastPayModel.formatCurrency(totals.totalOutstanding || 0)}`,
        PAGE_LEFT + 8,
        summaryY,
      );
      doc.text(
        `Total Deduction: P${lastPayModel.formatCurrency(totals.totalDeduction || 0)}`,
        PAGE_LEFT + colWidth + 8,
        summaryY,
      );
      doc.text(
        `Total Balance: P${lastPayModel.formatCurrency(totals.totalBalance || 0)}`,
        PAGE_LEFT + colWidth * 2 + 8,
        summaryY,
      );
      doc.text(
        `No. of Employees: ${totals.employeeCount || 0}`,
        PAGE_LEFT + colWidth * 3 + 8,
        summaryY,
      );
      y += 40;

      // --- Table ---
      const tableHeaders = [
        'ID',
        'Employee Name',
        'Office',
        'Region',
        'Deduction Type',
        'Date',
        'Outstanding',
        'Deduction',
        'Balance',
      ];

      const colWidths = [40, 120, 45, 70, 90, 50, 50, 45, 45];
      const xPositions = [];
      let x = PAGE_LEFT;
      colWidths.forEach((w) => {
        xPositions.push(x);
        x += w;
      });

      // Header
      doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, 18).fill('#16304A');
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#fff');
      tableHeaders.forEach((h, i) => {
        const align = i <= 4 ? 'left' : 'right';
        doc.text(h, xPositions[i] + (i <= 4 ? 4 : 0), y + 4, {
          width: colWidths[i] - 6,
          align: align,
        });
      });
      y += 18;
      doc.fillColor('#000');

      // Rows
      let rowIndex = 0;
      let lastRowY = y;

      rows.forEach((row) => {
        if (y > PAGE_HEIGHT - MARGIN - 100) {
          doc.addPage();
          y = MARGIN + 20;
          doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, 18).fill('#16304A');
          doc.font('Helvetica-Bold').fontSize(7).fillColor('#fff');
          tableHeaders.forEach((h, i) => {
            const align = i <= 4 ? 'left' : 'right';
            doc.text(h, xPositions[i] + (i <= 4 ? 4 : 0), y + 4, {
              width: colWidths[i] - 6,
              align: align,
            });
          });
          y += 18;
          doc.fillColor('#000');
        }

        const bgColor = rowIndex % 2 === 0 ? '#fff' : '#F6F7F9';
        doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, 16).fill(bgColor);
        doc.font('Helvetica').fontSize(7).fillColor('#000');

        const outstanding = parseFloat(row.outstanding) || 0;
        const deduction = parseFloat(row.deduction) || 0;
        const balance = parseFloat(row.balance) || 0;

        const rowData = [
          row.idno || '',
          row.fullname || '',
          row.office || '',
          row.region || '',
          row.deductiontype || '',
          row.transdate ? new Date(row.transdate).toLocaleDateString() : '',
          lastPayModel.formatCurrency(outstanding),
          lastPayModel.formatCurrency(deduction),
          lastPayModel.formatCurrency(balance),
        ];

        rowData.forEach((text, i) => {
          const align = i <= 4 ? 'left' : 'right';
          doc.text(text, xPositions[i] + (i <= 4 ? 4 : 0), y + 2, {
            width: colWidths[i] - 6,
            align: align,
          });
        });

        lastRowY = y;
        y += 16;
        rowIndex++;
      });

      // ================================================================
      // PREPARED BY SECTION - After the last row of the table
      // ================================================================

      // Add spacing after the last row
      y += 25;

      // Check if we need a new page for the Prepared By section
      if (y > PAGE_HEIGHT - MARGIN - 80) {
        doc.addPage();
        y = MARGIN + 20;
      }

      // "Prepared By:" label - centered
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Prepared By:', PAGE_LEFT, y);
      y += 25;

      // Extract name and title
      let preparedByNameOnly = preparedByName;
      let preparedTitleOnly = '';

      if (preparedByName.includes(',')) {
        const parts = preparedByName.split(',');
        preparedByNameOnly = parts[0].trim();
        preparedTitleOnly = parts.slice(1).join(',').trim();
      }

      // Name - centered
      doc.font('Helvetica').fontSize(9);
      doc.text(preparedByNameOnly, PAGE_LEFT, y);
      y += 10;

      // Underline for signature - centered
      const underlineWidth = 100;
      const underlineX = PAGE_LEFT;
      doc
        .moveTo(underlineX, y + 2)
        .lineTo(underlineX + underlineWidth, y + 2)
        .lineWidth(1)
        .stroke();
      y += 8;

      // Designation - centered
      if (preparedTitleOnly) {
        doc.font('Helvetica').fontSize(8);
        doc.text(preparedTitleOnly, PAGE_LEFT, y);
        y += 20;
      }

      // ================================================================
      // FOOTER SECTION (Page numbers only)
      // ================================================================
      const totalPages = doc.bufferedPageRange().count;

      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor('#6B7686')
          .text(`Page ${i + 1} of ${totalPages}`, PAGE_RIGHT - 80, PAGE_HEIGHT - MARGIN - 10, {
            width: 80,
            align: 'right',
          });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// Export to Excel (CSV format)
function generateDeductionReportCSV(data) {
  const { rows } = data;
  if (!rows || rows.length === 0) return null;

  const headers = [
    'ID No.',
    'Employee Name', // Full name in CSV too
    'Office',
    'Region',
    'Date',
    'Deduction Type',
    'Outstanding',
    'Deduction',
    'Balance',
  ];
  let csv = headers.join(',') + '\n';

  rows.forEach((row) => {
    const rowData = [
      row.idno || '',
      row.fullname || '', // ✅ Full name - no truncation
      row.office || '',
      row.region || '',
      row.transdate ? new Date(row.transdate).toLocaleDateString() : '',
      row.deductiontype || '',
      row.outstanding || 0,
      row.deduction || 0,
      row.balance || 0,
    ];
    csv += rowData.join(',') + '\n';
  });

  return csv;
}

module.exports = {
  getEmployeeExitComputations,
  getExitComputationByDate,
  getExitDeductionDetails,
  getDeductionTypes,
  getDeductionTypeReport,
  generateDeductionReportPDF,
  generateDeductionReportCSV,
  getPreparedByCredentials,
};
