const { DBFFile } = require('dbffile');
const path = require('path');
const fs = require('fs').promises;
const db = require('../config/db');
const utilitiesModel = require('./utilitiesModel');
const PDFDocument = require('pdfkit');

function getDates(dateRange) {
  let startDate = null;
  let endDate = null;

  if (dateRange && dateRange.includes(' to ')) {
    [startDate, endDate] = dateRange.split(' to ');
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      startDate = start.toISOString().split('T')[0];
      endDate = end.toISOString().split('T')[0];
    } else {
      startDate = null;
      endDate = null;
    }
  }

  return { startDate, endDate };
}

// function getPayrollFolder(office) {
//   const lowerOffice = office.toLowerCase();
//   return lowerOffice === 'vismin'
//     ? { folderName: 'PAYROLL1', tableName: 'payroll_' }
//     : lowerOffice === 'luzon'
//       ? { folderName: 'PAYROLL2', tableName: 'luzpayroll_' }
//       : { folderName: 'PAYROLL3', tableName: 'payroll_transactions_mlinc' };
// }

function getPayrollFolder(office) {
  const lowerOffice = office.toLowerCase();

  return lowerOffice === 'vismin'
    ? {
        folderName: 'PAYROLL1',
        tableName: 'payroll_',
        noYear: false,
      }
    : lowerOffice === 'luzon'
      ? {
          folderName: 'PAYROLL2',
          tableName: 'luzpayroll_',
          noYear: false,
        }
      : {
          folderName: 'PAYROLL3',
          tableName: 'payroll_transactions_mlinc',
          noYear: true,
        };
}

function handleInvalidDate(dateValue) {
  const date = new Date(dateValue);
  return isNaN(date.getTime()) ? new Date(0) : date;
}

async function deleteTempFile(tempDBFPath) {
  try {
    await fs.access(tempDBFPath);
    await fs.unlink(tempDBFPath);
    //console.log(`Old temporary file deleted: ${tempDBFPath}`);
  } catch (err) {
    // File doesn't exist - no action needed
  }
}

async function bonusUpdater(masterDBFPath, tempDBFPath, basePay) {
  try {
    await fs.access(masterDBFPath, fs.constants.W_OK);

    const dbf = await DBFFile.open(masterDBFPath);
    const records = await dbf.readRecords();

    const sanitizedRecords = records.map((record) => ({
      ...record,
      E_DATEE: handleInvalidDate(record.E_DATEE),
      E_DATER: handleInvalidDate(record.E_DATER),
      E_DATEB: handleInvalidDate(record.E_DATEB),
    }));

    const regularRecords = sanitizedRecords.filter((record) => record.E_COMPSTAT === 'REGULAR');
    const modifiedRecords = regularRecords.map((record) => ({
      ...record,
      E_BASEPAY: basePay,
    }));
    const filteredRecords = sanitizedRecords.filter((record) => record.E_COMPSTAT !== 'REGULAR');
    const updatedRecords = [...filteredRecords, ...modifiedRecords];

    const newDbf = await DBFFile.create(tempDBFPath, dbf.fields);
    await newDbf.appendRecords(updatedRecords);

    await fs.unlink(masterDBFPath);
    await fs.rename(tempDBFPath, masterDBFPath);

    return `Bonus updater completed successfully with base pay: ${basePay}`;
  } catch (error) {
    console.error('Error processing DBF file:', error);
    throw error;
  }
}

async function deductionUpdater(masterDBFPath, tempDBFPath, columnName, amountValue, endDate) {
  try {
    await fs.access(masterDBFPath, fs.constants.W_OK);
    const dbf = await DBFFile.open(masterDBFPath);
    const records = await dbf.readRecords();

    const sanitizedRecords = records.map((record) => ({
      ...record,
      P_BEGDATE: handleInvalidDate(record.P_BEGDATE),
      P_ENDDATE: handleInvalidDate(record.P_ENDDATE),
    }));

    const modifiedRecords = sanitizedRecords.map((record) => {
      const shouldUpdate =
        !endDate ||
        (record.P_ENDDATE instanceof Date &&
          new Date(endDate).toISOString().slice(0, 10) ===
            record.P_ENDDATE.toISOString().slice(0, 10));

      return {
        ...record,
        [columnName]: shouldUpdate ? amountValue : record[columnName],
      };
    });

    const newDbf = await DBFFile.create(tempDBFPath, dbf.fields);
    await newDbf.appendRecords(modifiedRecords);

    await fs.unlink(masterDBFPath);
    await fs.rename(tempDBFPath, masterDBFPath);

    return `Set ${columnName} to ${amountValue} for matching records${
      endDate ? ` (P_ENDDATE = ${new Date(endDate).toISOString().slice(0, 10)})` : ''
    }.`;
  } catch (error) {
    console.error('Error processing DBF file:', error);
    throw error;
  }
}

async function updateMortuaryDeductions(
  masterDBFPath,
  payrollDBPath,
  tempPayrollDBPath,
  endDate, // <- pass this from executePayrollTask
) {
  try {
    await fs.access(masterDBFPath, fs.constants.W_OK);
    await fs.access(payrollDBPath, fs.constants.W_OK);

    const masterDBF = await DBFFile.open(masterDBFPath);
    const payrollDBF = await DBFFile.open(payrollDBPath);

    const masterRecords = await masterDBF.readRecords();
    const payrollRecords = await payrollDBF.readRecords();

    // Create lookup: { E_IDNO: E_POS }
    const positionMap = {};
    for (const rec of masterRecords) {
      positionMap[rec.E_IDNO] = (rec.E_POS || '').toUpperCase();
    }

    // Filter and process only records where P_ENDDATE === endDate
    const updatedRecords = payrollRecords.map((record) => {
      if (
        record.P_ENDDATE instanceof Date &&
        endDate instanceof Date &&
        record.P_ENDDATE.toISOString().slice(0, 10) === endDate.toISOString().slice(0, 10)
      ) {
        const empID = record.P_EMPNO;
        const pos = positionMap[empID] || '';

        const isExactMatch = ['DB', 'AM', 'RM', 'RAM'].includes(pos);
        const isPartialMatch = pos.includes('DM') || pos.includes('ASST');

        const deductionValue = isExactMatch || isPartialMatch ? 100 : 50;

        return {
          ...record,
          P_DED10: deductionValue,
        };
      } else {
        return record; // Leave record unchanged if end date doesn't match
      }
    });

    const newPayrollDBF = await DBFFile.create(tempPayrollDBPath, payrollDBF.fields);
    await newPayrollDBF.appendRecords(updatedRecords);

    await fs.unlink(payrollDBPath);
    await fs.rename(tempPayrollDBPath, payrollDBPath);

    return `Mortuary deductions updated for Payroll ${endDate.toISOString().slice(0, 10)}).`;
  } catch (error) {
    console.error('Error updating mortuary deductions:', error);
    throw error;
  }
}

async function updateRegularEmployees(
  masterDBFPath,
  payDBFPath,
  tempDBFPath,
  amount,
  description,
  endDate,
) {
  try {
    await deleteTempFile(tempDBFPath);

    await Promise.all([
      fs.access(masterDBFPath, fs.constants.R_OK),
      fs.access(payDBFPath, fs.constants.W_OK),
    ]);

    const [masterDBF, payDBF] = await Promise.all([
      DBFFile.open(masterDBFPath),
      DBFFile.open(payDBFPath),
    ]);

    const [masterRecords, payRecords] = await Promise.all([
      masterDBF.readRecords(),
      payDBF.readRecords(),
    ]);

    const regularEmployees = new Map();
    masterRecords.forEach((record) => {
      if (record.E_COMPSTAT === 'REGULAR') {
        regularEmployees.set(record.E_IDNO, true);
      }
    });

    const modifiedPayRecords = payRecords.map((record) => {
      if (
        regularEmployees.has(record.P_EMPNO) &&
        formatSqlDate(record.P_ENDDATE) === formatSqlDate(endDate)
      ) {
        return {
          ...record,
          P_RENDESC1: description,
          P_RENUM1: parseFloat(amount),
        };
      } else {
        //for delete
      }
      return record; // No modification for records that don't match
    });

    const newPayDBF = await DBFFile.create(tempDBFPath, payDBF.fields);
    await newPayDBF.appendRecords(modifiedPayRecords);

    await fs.unlink(payDBFPath);
    await fs.rename(tempDBFPath, payDBFPath);

    return 'Regular employee records updated successfully';
  } catch (error) {
    console.error('Error processing DBF files:', error);
    throw error;
  }
}

async function updatePhilhealthDeductions(payDBFPath, tempDBFPath, targetDate) {
  try {
    await deleteTempFile(tempDBFPath);
    const philhealthBracket = await utilitiesModel.getPhilhealthTable();

    const payDBF = await DBFFile.open(payDBFPath);
    const payRecords = await payDBF.readRecords();

    const updatedPayRecords = payRecords.map((record) => {
      const recordEndDate = record.P_ENDDATE.toISOString().slice(0, 10);

      if (recordEndDate === targetDate) {
        const monthlyRate = record.P_MRATE;
        const dailyRate = record.P_DRATE;
        const isMonthlyZero = monthlyRate === 0;

        if (monthlyRate <= 10000 && !isMonthlyZero) {
          record.P_DED5 = philhealthBracket.minimum / 2;
        } else if (isMonthlyZero && dailyRate * 26 <= 10000) {
          record.P_DED5 = philhealthBracket.minimum / 2;
        } else if (monthlyRate >= 100000 && !isMonthlyZero) {
          record.P_DED5 = philhealthBracket.maximum / 2;
        } else if (isMonthlyZero && dailyRate * 26 >= 100000) {
          record.P_DED5 = philhealthBracket.maximum / 2;
        } else if (!isMonthlyZero && monthlyRate > 10000 && monthlyRate < 100000) {
          record.P_DED5 =
            Math.round(((monthlyRate * philhealthBracket.percentage) / 2) * 100) / 100;
        } else if (isMonthlyZero && dailyRate * 26 > 10000 && dailyRate * 26 < 100000) {
          record.P_DED5 =
            Math.round(((dailyRate * 26 * philhealthBracket.percentage) / 2) * 100) / 100;
        }
      }
      return record;
    });

    const newPayDBF = await DBFFile.create(tempDBFPath, payDBF.fields);
    await newPayDBF.appendRecords(updatedPayRecords);

    await fs.unlink(payDBFPath);
    await fs.rename(tempDBFPath, payDBFPath);

    return 'Philhealth deductions updated successfully!';
  } catch (error) {
    console.error('Error updating payroll:', error);
    throw error;
  }
}

// async function generatePdf({ data, type, category, office }) {
//   return new Promise((resolve, reject) => {
//     try {
//       const doc = new PDFDocument();
//       const chunks = [];

//       doc.on('data', (chunk) => chunks.push(chunk));
//       doc.on('end', () => resolve(Buffer.concat(chunks)));
//       doc.on('error', reject);

//       //console.log(type.toLowerCase(), "ldldldldldl");
//       // Customize based on report type
//       // Define a map of types to their handlers
//       const pdfHandlers = {
//         'mlfund (pdf)': (doc, data) => generateMlFundPdf(doc, data),
//         // All other types use the generic handler
//         kp: (doc, data, type) => generateKPPdfFile(doc, data, type, ''),
//         'monthly rate': (doc, data, type) => generateMonthlyRatePdfFile(doc, data, type, ''),

//         'kp wallet': (doc, data, type) => generateKPPdfFile(doc, data, type, ''),
//         'payroll summary (net)': (doc, data, type) =>
//           generateKPPdfFile(doc, data, type, 'Payroll Summary (Net)'),
//         'payroll summary (region)': (doc, data, type) =>
//           generateKPSummaryPdfFile(doc, data, type, office),
//         payslip: (doc, data, type) => generatePayslipPdf(doc, data, type, office),
//         'income report': (doc, data, type) => generateIncomeReportPdf(doc, data, type),
//         // NEW: Add the three deduction report handlers
//         deduction_report_1: (doc, data, type) =>
//           generateDeductionReportPdf(doc, data, 'Deduction Report 1'),
//         deduction_report_2: (doc, data, type) =>
//           generateDeductionReportPdf(doc, data, 'Deduction Report 2'),
//         deduction_report_3: (doc, data, type) =>
//           generateDeductionReportPdf(doc, data, 'Deduction Report 3'),
//         default: (doc, data, type) => generatePdfFile(doc, data, type, category),
//       };

//       // List of all types that use the default handler
//       const defaultHandlerTypes = new Set([
//         'sako',
//         'coated',
//         'cooprecla',
//         'fake',
//         'gpa insurance',
//         'hmo',
//         'income tax',
//         'install account',
//         'lates',
//         'leaves',
//         'mortuary',
//         'motor loan',
//         'opec',
//         'opec support',
//         'opec ticket',
//         'other deductions',
//         'over appraisal',
//         'over payments',
//         'pagibig loan',
//         'sss loan',
//         'telecoms',
//         'basic pay',
//         'cola',
//         'hazard allowance',
//         'housing allowance',
//         'income 1',
//         'income 2',
//         'location allowance',
//         'positional allowance',
//         'single post allowance',
//         'supervisory allowance',
//         'total overtime',
//         'transportation allowance',
//         'atd',
//         'ssscontri',
//         'pagibigcontri',
//         'car_motorloan',
//         'mlfund',
//         'mlcellphone',
//         'mlaccount',
//         'odetteloan',
//         'mllending',
//         'payables',
//         'philhealth',
//       ]);

//       // Optimized handler selection
//       const normalizedType = type.toLowerCase().trim();
//       const handler =
//         pdfHandlers[normalizedType] ||
//         (defaultHandlerTypes.has(normalizedType) ? pdfHandlers.default : null);

//       if (handler) {
//         handler(doc, data, normalizedType === 'mlfund (pdf)' ? undefined : type);
//       } else {
//         console.error(`No PDF generator found for type: ${type}`);
//         // Handle unknown type case appropriately
//       }

//       doc.end();
//     } catch (error) {
//       reject(error);
//     }
//   });
// }

async function generatePdf({ data, type, category, office }) {
  return new Promise((resolve, reject) => {
    try {
      const normalizedType = type.toLowerCase().trim();
      const landscapeTypes = new Set([
        'deduction_report_1',
        'deduction_report_2',
        'deduction_report_3',
      ]);

      const isLandscape = landscapeTypes.has(normalizedType);

      const doc = new PDFDocument({
        size: 'letter',
        layout: isLandscape ? 'landscape' : 'portrait',
        margins: isLandscape
          ? { top: 20, bottom: 10, left: 50, right: 50 } // tight bottom margin for deduction reports
          : { top: 50, bottom: 50, left: 50, right: 50 }, // unchanged for everything else
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Customize based on report type
      const pdfHandlers = {
        'mlfund (pdf)': (doc, data) => generateMlFundPdf(doc, data),
        kp: (doc, data, type) => generateKPPdfFile(doc, data, type, ''),
        'monthly rate': (doc, data, type) => generateMonthlyRatePdfFile(doc, data, type, ''),
        'kp wallet': (doc, data, type) => generateKPPdfFile(doc, data, type, ''),
        'payroll summary (net)': (doc, data, type) =>
          generateKPPdfFile(doc, data, type, 'Payroll Summary (Net)'),
        'payroll summary (region)': (doc, data, type) =>
          generateKPSummaryPdfFile(doc, data, type, office),
        payslip: (doc, data, type) => generatePayslipPdf(doc, data, type, office),
        'income report': (doc, data, type) => generateIncomeReportPdf(doc, data, type),
        deduction_report_1: (doc, data, type) =>
          generateDeductionReportPdf(doc, data, 'Deduction Report 1'),
        deduction_report_2: (doc, data, type) =>
          generateDeductionReportPdf(doc, data, 'Deduction Report 2'),
        deduction_report_3: (doc, data, type) =>
          generateDeductionReportPdf(doc, data, 'Deduction Report 3'),
        default: (doc, data, type) => generatePdfFile(doc, data, type, category),
      };

      const defaultHandlerTypes = new Set([
        'sako',
        'coated',
        'cooprecla',
        'fake',
        'gpa insurance',
        'hmo',
        'income tax',
        'install account',
        'lates',
        'leaves',
        'mortuary',
        'motor loan',
        'opec',
        'opec support',
        'opec ticket',
        'other deductions',
        'over appraisal',
        'over payments',
        'pagibig loan',
        'sss loan',
        'telecoms',
        'basic pay',
        'cola',
        'hazard allowance',
        'housing allowance',
        'income 1',
        'income 2',
        'location allowance',
        'positional allowance',
        'single post allowance',
        'supervisory allowance',
        'total overtime',
        'transportation allowance',
        'atd',
        'ssscontri',
        'pagibigcontri',
        'car_motorloan',
        'mlfund',
        'mlcellphone',
        'mlaccount',
        'odetteloan',
        'mllending',
        'payables',
        'philhealth',
      ]);

      // normalizedType already computed above — reuse it
      const handler =
        pdfHandlers[normalizedType] ||
        (defaultHandlerTypes.has(normalizedType) ? pdfHandlers.default : null);

      if (handler) {
        handler(doc, data, normalizedType === 'mlfund (pdf)' ? undefined : type);
      } else {
        console.error(`No PDF generator found for type: ${type}`);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// function generatePayslipPdf(doc, employees, type, office) {
//   console.log(employees);
//   const slipWidth = doc.page.width / 2;
//   const slipHeight = doc.page.height / 2;

//   employees.forEach((emp, index) => {
//     const position = index % 4;

//     const x = position % 2 === 0 ? 0 : slipWidth;
//     const y = position < 2 ? 0 : slipHeight;

//     drawPayslip(doc, emp, x, y, slipWidth, slipHeight);

//     if ((index + 1) % 4 === 0 && index !== employees.length - 1) {
//       doc.addPage();
//     }
//   });
// }

// function drawPayslip(doc, emp, x, y, width, height) {
//   const margin = 10;

//   const startX = x + margin;
//   const rightX = x + width / 2;

//   let currentY = y + margin;

//   currentY += 12; // ← one empty line (~normal text line height)

//   // border
//   //doc.rect(x, y, width, height).stroke();

//   // header
//   doc
//     .font("Helvetica-Bold")
//     .fontSize(15)
//     .text("P  A  Y  S  L  I  P", x, currentY, {
//       width: width,
//       align: "center",
//     });

//   //currentY += 15;
//   currentY += 30;

//   doc
//     .font("Helvetica")
//     .fontSize(8)
//     .text(`Payroll Period: ${emp.payroll_date.toString()}`, startX, currentY);

//   currentY += 12;

//   // Name + ID
//   doc.text(`Name: ${emp.employee_name}`, startX, currentY);
//   doc.text(`ID : ${emp.idno}`, rightX + 3, currentY);

//   currentY += 12;

//   // Position + Level
//   doc.text(`Position: ${emp.designation}`, startX, currentY);
//   doc.text(`Level : ${emp.employment_status}`, rightX + 3, currentY);

//   currentY += 16;

//   // Account + Hourly Rate
//   doc.text(`Account No: ${emp.account_no}`, startX, currentY);
//   doc.text(`Hourly Rate : ${emp.hourly_rate}`, rightX + 3, currentY);

//   currentY += 12;

//   // Basic Pay + Gross Pay
//   doc.text(`Basic Pay: ${formatCurrency(emp.basic_pay)}`, startX, currentY);
//   doc.text(`GrossPay : ${formatCurrency(emp.gross)}`, rightX + 3, currentY);

//   currentY += 12;

//   // Other Earnings + Deductions
//   doc.text(
//     `Other Earnings: ${formatCurrency(emp.other_income)}`,
//     startX,
//     currentY,
//   );
//   doc.text(
//     `Deductions : ${formatCurrency(emp.total_deduction)}`,
//     rightX + 3,
//     currentY,
//   );

//   currentY += 12;

//   // Overtime
//   doc.text(`Overtime: ${formatCurrency(emp.total_ot)}`, startX, currentY);

//   currentY += 12;

//   // separator
//   doc.text("================", rightX + 3, currentY);

//   currentY += 10;

//   // Net Pay
//   doc
//     .font("Helvetica-Bold")
//     .text(`Net Pay : ${formatCurrency(emp.net_pay)}`, rightX + 3, currentY);

//   doc.font("Helvetica");

//   currentY += 18;

//   // headers
//   const columnGap = width / 2;

//   doc.font("Helvetica-Bold").text("ITEMIZED EARNINGS", startX, currentY, {
//     lineBreak: false,
//   });

//   doc.text("ITEMIZED DEDUCTIONS", startX + columnGap, currentY, {
//     lineBreak: false,
//   });

//   doc.font("Helvetica");

//   currentY += 10;

//   // itemized lists
//   drawEarnings(doc, emp, startX, currentY);
//   drawDeductions(doc, emp, startX + columnGap, currentY);
// }

// function drawEarnings(doc, emp, x, y) {
//   let currentY = y;

//   // 1. Keep the raw numeric values here
//   const earnings = [
//     { name: "OT ORD", value: emp.otordinary },
//     { name: "SPECIAL PAY", value: emp.otspecial },
//     { name: "HOLIDAY PAY", value: emp.otholiday },
//     { name: "NIGHT PAY", value: emp.nightpremium },
//     { name: "ESHOT-RDOT", value: emp.otexcsspecial },
//     { name: "RDOT", value: emp.rdot },
//     { name: "ELHOT", value: emp.otexcsholiday },
//     { name: "ALLOWANCES", value: emp.totalallow },
//     {
//       name: (emp.otherincdesc1 || "OTHER INCOME 1").toUpperCase(),
//       value: emp.incomeamount1,
//     },
//     {
//       name: (emp.otherincdesc2 || "OTHER INCOME 2").toUpperCase(),
//       value: emp.incomeamount2,
//     },
//   ];

//   earnings.forEach((e) => {
//     // 2. Check the numeric value (0, null, or undefined will be skipped)
//     if (e.value && Number(e.value) > 0) {
//       doc
//         .font("Helvetica")
//         .fontSize(8)
//         // 3. Format it ONLY when printing
//         .text(`${e.name.padEnd(20)} : ${formatCurrency(e.value)}`, x, currentY);

//       currentY += 10;
//     }
//   });
// }

// function drawDeductions(doc, emp, x, y) {
//   let currentY = y;

//   const deductions = [
//     { name: "LEAVE W/O PAY", value: emp.leaves },
//     { name: "LATE/UNDERTIME", value: emp.lates },
//     { name: "SSS CONTRI", value: emp.ssscontri },
//     { name: "SSS LOAN", value: emp.sssloan },
//     { name: "INCOME TAX", value: emp.incometax },
//     { name: "PAGIBIG CONTRI", value: emp.pagibigcontri },
//     { name: "PAGIBIG LOAN", value: emp.pagibigloan },
//     { name: "ML FUND", value: emp.mlfund },
//     { name: "OPEC", value: emp.opec },
//     { name: "OVER APPRAISAL", value: emp.overappraisal },
//     { name: "COOP RECLA", value: emp.cooprecla },
//     { name: "PHILHEALTH", value: emp.filmalending },
//     { name: "INSTALL ACCOUNT", value: emp.installaccount },
//     { name: "OPEC TICKET", value: emp.ticket },
//     { name: "MOBILE BILL", value: emp.mobilebill },
//     { name: "OPEC SUPPORT", value: emp.canteen },
//     { name: "HMO", value: emp.c_hmo },
//     { name: "GPA INSURANCE", value: emp.deductionamount1 },
//     { name: "OVER PAYMENTS", value: emp.deductionamount2 },
//     { name: "MORTUARY", value: emp.sakoprovi },
//     { name: "FAKE", value: emp.sakocommodity },
//     { name: "OTHER DEDUCTIONS", value: emp.sakoprime },
//     { name: "SAKO", value: emp.sakoemergency },
//     { name: "MOTOR LOAN", value: emp.sakopettycash },
//   ];

//   deductions.forEach((d) => {
//     if (d.value && Number(d.value) > 0) {
//       doc
//         .font("Helvetica")
//         .fontSize(8)
//         // 3. Format it ONLY when printing
//         .text(`${d.name.padEnd(20)} : ${formatCurrency(d.value)}`, x, currentY);

//       currentY += 10;
//     }
//   });
//   //   if (d.value && d.value > 0) {
//   //     doc
//   //       .font("Helvetica")
//   //       .fontSize(8)
//   //       .text(`${d.name} : ${d.value}`, x, currentY);

//   //     currentY += 10;
//   //   }
//   // });
// }

function generatePayslipPdf(doc, employees, type, office) {
  const payslipsPerPage = 4;

  const pageWidth = 612;
  const pageHeight = 792;

  const slipWidth = pageWidth / 2;
  const slipHeight = pageHeight / 2;

  employees.forEach((emp, index) => {
    const position = index % payslipsPerPage;

    if (index !== 0 && position === 0) {
      doc.addPage();
    }

    const col = position % 2;
    const row = Math.floor(position / 2);

    const x = col * slipWidth;
    const y = row * slipHeight;

    drawPayslip(doc, emp, x, y, slipWidth, slipHeight);
  });
}

/**
 * Utility: Draws a single row with a fixed colon position and right-aligned amount
 */
function drawAlignedRow(doc, label, value, x, y, labelWidth = 120) {
  const formattedValue = formatCurrency(value);
  const colonX = x + labelWidth; // Fixed position for colons
  const valueWidth = 70; // Width reserved for the money amount
  const valueX = colonX + 10; // Starting point for the money box

  doc.font('Helvetica').fontSize(8);

  // 1. Draw the Label (e.g., "BASIC PAY")
  doc.text(label, x, y);

  // 2. Draw the Colon (Aligned vertically)
  doc.text(':', colonX, y);

  // 3. Draw the Value (Aligned to the right of its box)
  doc.text(formattedValue, valueX, y, {
    width: valueWidth,
    align: 'right',
  });

  // Return the Y position for the next row (10 units down)
  return y + 10;
}

function drawPayslip(doc, emp, x, y, width, height) {
  const margin = 10;
  const startX = x + margin;
  const rightX = x + width / 2;
  let currentY = y + margin;

  // --- HEADER ---
  currentY += 12;
  doc.font('Helvetica-Bold').fontSize(15).text('P  A  Y  S  L  I  P', x, currentY, {
    width: width,
    align: 'center',
  });

  currentY += 30; // 2 blank lines

  // --- EMPLOYEE INFO ---
  doc.font('Helvetica').fontSize(8);
  doc.text(`Payroll Period: ${emp.payroll_date || 'N/A'}`, startX, currentY);

  currentY += 12;
  doc.text(`Name: ${emp.employee_name}`, startX, currentY);
  doc.text(`ID : ${emp.idno}`, rightX + 3, currentY);

  currentY += 12;
  doc.text(`Position: ${emp.designation}`, startX, currentY);
  doc.text(`Level : ${emp.employment_status}`, rightX + 3, currentY);

  currentY += 16;
  doc.text(`Account No: ${emp.account_no}`, startX, currentY);
  doc.text(`Hourly Rate : ${formatCurrency(emp.hourly_rate)}`, rightX + 3, currentY);

  currentY += 12;
  doc.text(`Basic Pay: ${formatCurrency(emp.basic_pay)}`, startX, currentY);
  doc.text(`Gross Pay : ${formatCurrency(emp.gross)}`, rightX + 3, currentY);

  currentY += 12;
  doc.text(`Other Earnings: ${formatCurrency(emp.other_income)}`, startX, currentY);
  doc.text(`Deductions : ${formatCurrency(emp.total_deduction)}`, rightX + 3, currentY);

  currentY += 12;
  doc.text(`Overtime: ${formatCurrency(emp.total_ot)}`, startX, currentY);

  currentY += 12;
  doc.text('==================', rightX + 3, currentY);

  currentY += 10;
  doc.font('Helvetica-Bold').text(`Net Pay : ${formatCurrency(emp.net_pay)}`, rightX + 3, currentY);

  // --- ITEMIZED SECTIONS (VERTICAL FLOW) ---
  currentY += 25;

  // EARNINGS
  doc.font('Helvetica-Bold').text('ITEMIZED EARNINGS', startX, currentY);
  currentY += 12;
  currentY = drawEarnings(doc, emp, startX, currentY);

  currentY += 15; // Gap between sections

  // DEDUCTIONS
  doc.font('Helvetica-Bold').text('ITEMIZED DEDUCTIONS', startX, currentY);
  currentY += 12;
  currentY = drawDeductions(doc, emp, startX, currentY);
}

function drawEarnings(doc, emp, x, y) {
  let currentY = y;
  const earnings = [
    { name: 'OT ORD', value: emp.otordinary },
    { name: 'SPECIAL PAY', value: emp.otspecial },
    { name: 'HOLIDAY PAY', value: emp.otholiday },
    { name: 'NIGHT PAY', value: emp.nightpremium },
    { name: 'ESHOT-RDOT', value: emp.otexcsspecial },
    { name: 'RDOT', value: emp.rdot },
    { name: 'ELHOT', value: emp.otexcsholiday },
    { name: 'ALLOWANCES', value: emp.totalallow },
    {
      name: (emp.otherincdesc1 || 'OTHER INCOME 1').toUpperCase(),
      value: emp.incomeamount1,
    },
    {
      name: (emp.otherincdesc2 || 'OTHER INCOME 2').toUpperCase(),
      value: emp.incomeamount2,
    },
  ];

  earnings.forEach((e) => {
    if (e.value && Number(e.value) > 0) {
      currentY = drawAlignedRow(doc, e.name, e.value, x, currentY);
    }
  });
  return currentY;
}

function drawDeductions(doc, emp, x, y) {
  let currentY = y;
  const deductions = [
    { name: 'LEAVE W/O PAY', value: emp.leaves },
    { name: 'LATE/UNDERTIME', value: emp.lates },
    { name: 'SSS CONTRI', value: emp.ssscontri },
    { name: 'SSS LOAN', value: emp.sssloan },
    { name: 'INCOME TAX', value: emp.incometax },
    { name: 'PAGIBIG CONTRI', value: emp.pagibigcontri },
    { name: 'PAGIBIG LOAN', value: emp.pagibigloan },
    { name: 'ML FUND', value: emp.mlfund },
    { name: 'OPEC', value: emp.opec },
    { name: 'OVER APPRAISAL', value: emp.overappraisal },
    { name: 'COOP RECLA', value: emp.cooprecla },
    { name: 'PHILHEALTH', value: emp.filmalending },
    { name: 'INSTALL ACCOUNT', value: emp.installaccount },
    { name: 'OPEC TICKET', value: emp.ticket },
    { name: 'MOBILE BILL', value: emp.mobilebill },
    { name: 'OPEC SUPPORT', value: emp.canteen },
    { name: 'HMO', value: emp.c_hmo },
    { name: 'GPA INSURANCE', value: emp.deductionamount1 },
    { name: 'OVER PAYMENTS', value: emp.deductionamount2 },
    { name: 'MORTUARY', value: emp.sakoprovi },
    { name: 'FAKE', value: emp.sakocommodity },
    { name: 'OTHER DEDUCTIONS', value: emp.sakoprime },
    { name: 'SAKO', value: emp.sakoemergency },
    { name: 'MOTOR LOAN', value: emp.sakopettycash },
    { name: 'CAR-MOTOR LOAN', value: emp.car_motorloan },
    { name: 'ML CELLPHONE', value: emp.mlcellphone },
    { name: 'PHILHEALTH', value: emp.philhealth },
    { name: 'ML ACCOUNT', value: emp.mlaccount },
    { name: 'ATD', value: emp.atd },
    { name: 'ODETTE LOAN', value: emp.odetteloan },
    { name: 'ML LENDING', value: emp.mllending },
    { name: 'PAYABLES', value: emp.payables },
  ];

  deductions.forEach((d) => {
    if (d.value && Number(d.value) > 0) {
      currentY = drawAlignedRow(doc, d.name, d.value, x, currentY);
    }
  });
  return currentY;
}

function generatePdfFile(doc, data, type, category) {
  // Group by region
  const groupedData = {};
  data.forEach((emp) => {
    if (!groupedData[emp.region]) groupedData[emp.region] = [];
    groupedData[emp.region].push(emp);
  });

  // Add data to PDF by region
  Object.keys(groupedData).forEach((region, regionIndex) => {
    if (regionIndex > 0) doc.addPage(); // Add new page for each region except the first one

    // Add header for the first page of each region
    addHeader(doc, region, data[0].enddate, type, category);

    // Add employee data and summary
    addEmployeeData(doc, region, groupedData[region], type, category);
  });

  // End the document (handled by the caller)
}

// ----------------------------------------- HELPER FUNCTIONS ----------------------------------------- //

// ADDING HEADER TO PDF
const addHeader = (doc, region, date, reportType, category) => {
  const logoPath = path.join(__dirname, '../public/images/logo.png');
  const logoWidth = 140; // smaller logo = less vertical space taken
  const logoHeight = 35; // explicit height so we know exactly how tall it is
  const startY = 20; // less top margin, as requested
  const xPosition = (doc.page.width - logoWidth) / 2;

  doc.image(logoPath, xPosition, startY, { width: logoWidth, height: logoHeight });

  // Explicitly position the cursor right after the logo — don't rely on moveDown
  doc.y = startY + logoHeight + 4;

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('HUMAN RESOURCES MANAGEMENT DIVISION', { align: 'center' });
  doc.moveDown(0.3);

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(`${reportType.toUpperCase()} ${category.toUpperCase()} REPORT`, {
      align: 'center',
    });
  doc.moveDown(0.5);

  const regionY = doc.y;
  const regionText = `Region/Division: ${region}`;
  doc.font('Helvetica-Bold').fontSize(9).text(regionText, 50, regionY);

  const formattedDate = formatDateString(date);
  const payrollDateY = doc.y;
  const payrollDateText = `Payroll Date: ${formattedDate}`;
  doc.font('Helvetica-Bold').fontSize(9).text(payrollDateText, 50, payrollDateY);
  doc.moveDown(0.8);
};
// const addHeader = (doc, region, date, reportType, category) => {
//   const logoPath = path.join(__dirname, '../public/images/logo.png');
//   const logoWidth = 200;
//   const xPosition = (doc.page.width - logoWidth) / 2;

//   doc.image(logoPath, xPosition, 45, { width: logoWidth });
//   doc.moveDown(0.8);

//   doc
//     .font('Helvetica-Bold')
//     .fontSize(9)
//     .text(`HUMAN RESOURCES MANAGEMENT DIVISION`, { align: 'center' });
//   doc.moveDown(0.5);

//   doc
//     .font('Helvetica-Bold')
//     .fontSize(10)
//     .text(`${reportType.toUpperCase()} ${category.toUpperCase()} REPORT`, {
//       align: 'center',
//     });
//   doc.moveDown(0.5);

//   // Region with bold
//   const regionY = doc.y; // Store Y position for "Region/Division"
//   const regionText = `Region/Division: ${region}`;
//   doc.font('Helvetica-Bold').fontSize(9).text(regionText, 50, regionY); // Start at X = 50

//   // Payroll Date header
//   const formattedDate = formatDateString(date);
//   const payrollDateY = doc.y; // Store Y position for "Payroll Date"
//   const payrollDateText = `Payroll Date: ${formattedDate}`;
//   doc.font('Helvetica-Bold').fontSize(9).text(payrollDateText, 50, payrollDateY); // Start at X = 50 (same as Region/Division)
//   doc.moveDown(0.8);
// };

// ADDING THE EMPLOYEE DATA
const addEmployeeData = (doc, region, employees, reportType, category) => {
  // Set header for the employee data
  addEmployeeTableHeader(doc, reportType);

  // Initialize counters for each region
  let totalEmployees = 0;
  let totalAmount = 0;

  // Add employee data
  employees.forEach((employee) => {
    const rowHeight = 15; // Estimated row height
    const remainingHeight = doc.page.height - doc.y - doc.page.margins.bottom;

    // Check if there is enough space for another row, else add a new page
    if (remainingHeight < rowHeight) {
      doc.addPage();
      addHeader(doc, region, employees[0].enddate, reportType, category); // Add header on new page
      addEmployeeTableHeader(doc, reportType); // Add the employee headers again on the new page
    }

    const rowY = doc.y;
    const amount = isNaN(employee.amount) ? 0 : employee.amount;
    const formattedAmount = amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    // Use fixed x-positions for each column to align the data horizontally
    doc
      .font('Helvetica') // Ensure normal font for employee data
      .fontSize(9)
      .text(employee.idno || 'N/A', 50, rowY)
      .text(employee.employee || 'N/A', 200, rowY)
      .text(formattedAmount, 350, rowY, { align: 'right' });
    doc.moveDown(0.2);

    // Update region-level counters
    totalEmployees += 1;
    totalAmount += amount;
  });

  // Check if there is enough space for the total summary and employees count
  const summaryRowHeight = 30; // Estimated height for both totals and spacing
  const remainingHeightAfterData = doc.page.height - doc.y - doc.page.margins.bottom;

  if (remainingHeightAfterData < summaryRowHeight) {
    doc.addPage();
    addHeader(doc, region, employees[0].enddate, reportType, category); // Add header on new page
  }

  // Add summary at the end
  const formattedTotalAmount = totalAmount.toLocaleString('en-US', {
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
    .font('Helvetica-Bold') // Bold font for summary
    .fontSize(9)
    .text(`Total Employees: ${totalEmployees}`, 50, summaryY);

  // Draw Total Amount on the right, same y-coordinate
  doc
    .font('Helvetica-Bold') // Bold font for total amount
    .fontSize(9)
    .text(`Total: ${formattedTotalAmount}`, 350, summaryY, {
      align: 'right',
    });

  doc.moveDown(0.5); // Space after the summary
  // Add the date at the end, centered below the employee data
  doc.fontSize(6).text(`Date: ${new Date()}`, { align: 'right' });
};

// ADDING THE EMPLOYEE TABLE HEADER
const addEmployeeTableHeader = (doc, reportType) => {
  const headerY = doc.y;

  // Draw line above headers
  doc
    .moveTo(50, headerY - 5)
    .lineTo(doc.page.width - 50, headerY - 5)
    .stroke();

  // Set header for the employee data
  doc.font('Helvetica-Bold').fontSize(9).text('IDNO', 50, headerY);
  doc.text('Employee Name', 200, headerY);
  doc.text(reportType.toUpperCase(), 350, headerY, { align: 'right' });

  // Draw line below headers
  doc
    .moveTo(50, headerY + 10)
    .lineTo(doc.page.width - 50, headerY + 10)
    .stroke();
  doc.moveDown(0.5);
};

// Helper function to format date
const formatDateString = (dateString) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

function generateMlFundPdf(doc, data) {
  // Set metadata
  doc.info['Title'] = 'ML Fund Deduction Report';
  doc.info['Author'] = 'Payroll System';

  // Group by region
  const groupedData = {};
  data.forEach((emp) => {
    if (!groupedData[emp.region]) groupedData[emp.region] = [];
    groupedData[emp.region].push(emp);
  });

  const sortedRegions = Object.keys(groupedData).sort();

  // Layout configuration
  const margin = 36;
  const pageWidth = doc.page.width;
  const usableWidth = pageWidth - margin * 2;
  const rowHeight = 15;
  const headerRowHeight = 17;

  // Column definitions
  const columns = [
    { name: 'REGION CODE', width: 0.1, key: 'region_code' },
    { name: 'REGION DESC', width: 0.3, key: 'region_description' },
    { name: '#', width: 0.05, key: null },
    { name: 'IDNO', width: 0.1, key: 'idno' },
    { name: 'EMPLOYEE NAME', width: 0.3, key: 'employee' },
    { name: 'AMOUNT', width: 0.1, key: 'mlfund', align: 'right' },
  ];

  // Calculate absolute positions
  let currentX = margin;
  columns.forEach((col) => {
    col.position = currentX;
    col.absWidth = usableWidth * col.width;
    currentX += col.absWidth;
  });

  let currentY = margin;
  let currentRegion = null;

  // Draw page header
  function addPageHeader() {
    doc.fontSize(10).font('Helvetica-Bold').text('ML FUND DEDUCTION', margin, margin);
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(`Payroll Date: ${formatDate(data[0].enddate)}`, margin, margin + headerRowHeight);
  }

  // Draw table headers
  function drawTableHeaders(y) {
    const lineHeight = 12; // Space between lines

    columns.forEach((col) => {
      // Split header into two lines - you can customize the split logic as needed
      // Example: split at first space or by '\n'
      let lines = col.name.split('\n'); // Or: col.name.split(' ', 2);
      if (lines.length === 1) lines.push(''); // If only one line, add empty second line

      doc.fontSize(10).font('Helvetica-Bold');

      // Draw first line
      doc.text(lines[0], col.position, y, {
        width: col.absWidth,
        align: col.align || 'left',
      });

      // Draw second line, slightly below first
      doc.text(lines[1], col.position, y + lineHeight, {
        width: col.absWidth,
        align: col.align || 'left',
      });
    });

    // Draw horizontal line below second header line
    doc
      .moveTo(margin, y + lineHeight * 2)
      .lineTo(pageWidth - margin, y + lineHeight * 2)
      .lineWidth(0.5)
      .strokeColor('#cccccc')
      .stroke();
  }

  // Draw an employee row
  function drawEmployeeRow(emp, index, y) {
    columns.forEach((col) => {
      let text = '';
      if (col.key === null) {
        text = (index + 1).toString();
      } else {
        text = col.key === 'mlfund' ? formatNumber(emp[col.key]) : emp[col.key] || '';
      }

      doc
        .fontSize(9)
        .font('Helvetica')
        .text(text, col.position, y, {
          width: col.absWidth,
          align: col.align || 'left',
        });
    });
  }

  // Draw totals
  function drawRegionTotal(employees) {
    const totalEmployees = employees.length;
    const totalAmount = employees.reduce((sum, emp) => sum + (parseFloat(emp.mlfund) || 0), 0);

    // Check space for total
    if (currentY > doc.page.height - margin - rowHeight * 2) {
      //console.log(doc.page.height - margin - rowHeight * 2, "ifififif");
      doc.addPage();
      currentY = margin + headerRowHeight * 3;
      addPageHeader();
      drawTableHeaders(currentY);
      currentY += rowHeight + 15;
    }

    doc.save();
    doc
      .rect(margin, currentY, pageWidth - margin * 2, rowHeight)
      .fillOpacity(0.1)
      .fill('#9c9a9a')
      .fillOpacity(1);

    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('TOTAL EMPLOYEES:', columns[0].position, currentY, {
        width: columns[0].absWidth + columns[1].absWidth,
      });

    doc.text(totalEmployees.toString(), columns[2].position, currentY, {
      width: columns[2].absWidth + columns[3].absWidth,
    });

    doc.text(formatNumber(totalAmount), columns[5].position, currentY, {
      width: columns[5].absWidth,
      align: 'right',
    });

    currentY += rowHeight;

    doc
      .moveTo(margin, currentY)
      .lineTo(pageWidth - margin, currentY)
      .lineWidth(1)
      .strokeColor('#999999')
      .stroke();

    doc.restore();
  }

  // Start initial page
  //addPageHeader();
  currentY = margin + headerRowHeight * 3;

  // Loop through regions
  sortedRegions.forEach((region, regionIndex) => {
    currentRegion = region;

    // Always add page for a new region except the first
    if (regionIndex > 0) {
      doc.addPage();
    }

    currentY = margin + headerRowHeight * 3;
    addPageHeader();

    const employees = groupedData[region];

    drawTableHeaders(currentY);
    currentY += rowHeight + 15;

    let rowCount = 0;

    employees.forEach((emp, index) => {
      // Enforce a max of 39 rows per page
      const maxRowsPerPage = 39;
      if (rowCount >= maxRowsPerPage || currentY > doc.page.height - margin - rowHeight * 2) {
        doc.addPage();
        currentY = margin + headerRowHeight * 3;
        addPageHeader();
        drawTableHeaders(currentY);
        currentY += rowHeight + 15;
        rowCount = 0; // Reset for new page
      }

      drawEmployeeRow(emp, index, currentY);
      currentY += rowHeight;
      rowCount++;
    });

    drawRegionTotal(employees);
    currentY += 10; // Space between regions
  });

  // Helpers
  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  function formatNumber(num) {
    return parseFloat(num || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}

function generateDefaultPdf(doc, data) {
  // Set document metadata
  doc.info['Title'] = 'Payroll Report';
  doc.info['Author'] = 'Payroll System';

  // Formatting constants
  const margin = 36;
  const leftCol = margin;
  const rightCol = doc.page.width - margin;
  const col1 = leftCol;
  const col2 = col1 + 100;
  const col3 = col2 + 100;
  const col4 = col3 + 100;
  const col5 = rightCol - 100;

  // Header styles
  const headerStyle = { fontSize: 16, bold: true, align: 'center' };
  const subHeaderStyle = { fontSize: 12 };
  const tableHeaderStyle = { fontSize: 10, bold: true };

  // Add report header
  doc
    .fontSize(headerStyle.fontSize)
    .font('Helvetica-Bold')
    .text('PAYROLL REPORT', { align: 'center' });

  doc.moveDown(0.5);

  // Add report details if available
  if (data.length > 0 && data[0].enddate) {
    doc
      .fontSize(subHeaderStyle.fontSize)
      .font('Helvetica')
      .text(`Payroll Period: ${formatDate(data[0].startdate)} to ${formatDate(data[0].enddate)}`, {
        align: 'left',
      });
  }

  doc.moveDown(1);

  // Table header
  doc
    .fontSize(tableHeaderStyle.fontSize)
    .fillColor('#000000')
    .text('Employee ID', col1, doc.y)
    .text('Employee Name', col2, doc.y)
    .text('Department', col3, doc.y)
    .text('Region', col4, doc.y)
    .text('Net Pay', col5, doc.y, { width: 100, align: 'right' });

  doc.moveDown(0.3);
  doc
    .lineWidth(1)
    .strokeColor('#cccccc')
    .lineCap('butt')
    .moveTo(leftCol, doc.y)
    .lineTo(rightCol, doc.y)
    .stroke();
  doc.moveDown(0.2);

  // Employee rows
  let grandTotal = 0;
  data.forEach((emp, index) => {
    const netPay = parseFloat(emp.totalnet) || 0;
    grandTotal += netPay;

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#000000')
      .text(emp.idno || '', col1, doc.y)
      .text(`${emp.lastname}, ${emp.firstname}` || '', col2, doc.y)
      .text(emp.department || '', col3, doc.y)
      .text(emp.region || '', col4, doc.y)
      .text(formatNumber(netPay), col5, doc.y, { width: 100, align: 'right' });

    doc.moveDown(0.3);
  });

  // Grand total
  doc
    .fontSize(12)
    .font('Helvetica-Bold')
    .fillColor('#000000')
    .text('GRAND TOTAL:', col4, doc.y)
    .text(formatNumber(grandTotal), col5, doc.y, {
      width: 100,
      align: 'right',
    });

  doc.moveDown(0.5);
  doc
    .lineWidth(1)
    .strokeColor('#cccccc')
    .lineCap('butt')
    .moveTo(leftCol, doc.y)
    .lineTo(rightCol, doc.y)
    .stroke();
}

// Helper functions (add these to your model file)
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatSqlDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);

  // Ensure proper format like 'YYYY-MM-DD'
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatNumber(num) {
  return parseFloat(num || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function generatePayrollReportData({
  startDate,
  endDate,
  dateRange,
  office,
  region,
  reportType,
  incomeType,
  deductionType,
}) {
  //console.log("region in model: ", region);
  //const { endDate } = getDates(dateRange);
  const payrollInfo = getPayrollFolder(office);
  //const payrollTable = payrollInfo.tableName + new Date(endDate).getFullYear();
  const payrollTable = payrollInfo.noYear
    ? payrollInfo.tableName
    : payrollInfo.tableName + new Date(endDate).getFullYear();

  const dbPool = utilitiesModel.getDbPool(office);

  let message = '';
  let data = [];
  let hasIssues = false;
  const isVisminOrLuzon = ['vismin', 'luzon'].includes(office.toLowerCase());
  if (reportType.toLowerCase().trim() === 'complete payroll details') {
    const hasRegion = region && region.trim() !== '';

    const baseQuery = isVisminOrLuzon
      ? `SELECT startDate, endDate, region, department, branch, lastname, firstname, 
     IF(monthlyrate <=0, 'daily', 'monthly') AS payrollType, dailyrate, (minutesworked / 480) AS minutesworked, 
     basicpay, totalallow, totalot, cola, (incomeamount1 + incomeamount2) AS otherincome, gross, lates, leaves as absent, 
     incometax, ssscontri, pagibigcontri, sssloan, pagibigloan, mlfund, opec, overappraisal,
     cooprecla, filmalending AS philhealth, installaccount, ticket, mobilebill, canteen, sakoprovi, sakocommodity, sakoprime, 
     sakoemergency, sakopettycash, sakocbu, sakosavings, deductionamount1, deductionamount2, c_hmo as hmo, totaldeduction, 
     totalnet, deductionDesc1, deductionDesc2 
     FROM ${payrollTable} 
     WHERE enddate = ? AND region NOT IN ('MANCOMM', 'MANCOMML')`
      : `SELECT startDate, endDate, region, department, branch, lastname, firstname, 
     IF(monthlyrate <=0, 'daily', 'monthly') AS payrollType, dailyrate, (minutesworked / 480) AS minutesworked, 
     basicpay, totalallow, totalot, cola, (incomeamount1 + incomeamount2) AS otherincome, gross, lates, LEAVES AS absent, incometax, 
     ssscontri, pagibigcontri, sssloan, pagibigloan, car_motorloan as carloan, mlfund, c_hmo, mlcellphone, philhealth as philhealth, mlaccount, atd, odetteloan, 
     deductionamount1, deductionamount2, mllending, payables AS payables, totaldeduction, totalnet, deductionDesc1, deductionDesc2, payables 
     FROM ${payrollTable} 
     WHERE enddate = ? AND region NOT IN ('MANCOMM', 'MANCOMML')`;

    // Check if region is provided and append region clause
    const regionClause = region && region.trim() !== '' ? ' AND region = ?' : '';
    const fullQuery = `${baseQuery}${regionClause} ORDER BY region, department, lastname, firstname;`;

    const queryParams = region ? [endDate, region] : [endDate];

    //[data] = await db.query(fullQuery, queryParams);
    //console.log(fullQuery, queryParams);
    [data] = await dbPool.query(fullQuery, queryParams);

    message = data.length > 0 ? `Found ${data.length} employees` : `No employees found`;
    hasIssues = data.length > 0;
  } else if (reportType.toLowerCase().trim() === 'monthly contributions') {
    const hasRegion = region && region.trim() !== '';

    const baseQuery = isVisminOrLuzon
      ? `SELECT 
  DATE_FORMAT(enddate, '%M %Y') AS month_name, idno, region, department, branch, 
  lastname, 
  firstname, 
  (SELECT ssser FROM sssphtable WHERE sssee = ssscontri LIMIT 1) AS sss_employer, 
  ssscontri AS sss_employee, 
  ((SELECT ssser FROM sssphtable WHERE sssee = ssscontri LIMIT 1) + ssscontri) AS sss_total, 
  
  200  AS pagibig_employer, 
  pagibigcontri AS pagibig_employee, 
  (200 + pagibigcontri) AS pagibig_total, 
  
  filmalending AS philhealth_employer, 
  filmalending AS philhealth_employee, 
  (filmalending + filmalending) AS philhealth_total
FROM  ${payrollTable} 
     WHERE enddate = ? `
      : `SELECT 
  DATE_FORMAT(enddate, '%M %Y') AS month_name, idno, region, department, branch, 
  lastname, 
  firstname, 
  (SELECT ssser FROM sssphtable WHERE sssee = ssscontri LIMIT 1) AS sss_employer, 
  ssscontri AS sss_employee, 
  ((SELECT ssser FROM sssphtable WHERE sssee = ssscontri LIMIT 1) + ssscontri) AS sss_total, 
  
  200  AS pagibig_employer, 
  pagibigcontri AS pagibig_employee, 
  (200 + pagibigcontri) AS pagibig_total, 
  
  philhealth AS philhealth_employer, 
  philhealth AS philhealth_employee, 
  (philhealth + philhealth) AS philhealth_total
FROM ${payrollTable} 
     WHERE enddate = ? `;

    // Check if region is provided and append region clause
    const regionClause = region && region.trim() !== '' ? ' AND region = ?' : '';
    const fullQuery = `${baseQuery}${regionClause} ORDER BY region, department, lastname, firstname;`;

    const queryParams = region ? [endDate, region] : [endDate];

    //[data] = await db.query(fullQuery, queryParams);
    //console.log(fullQuery, queryParams);
    [data] = await dbPool.query(fullQuery, queryParams);

    message = data.length > 0 ? `Found ${data.length} employees` : `No employees found`;
    hasIssues = data.length > 0;
  } else if (reportType.toLowerCase().trim() === 'deduction') {
    // Define the new deduction report types
    const deductionReportTypes = ['deduction_report_1', 'deduction_report_2', 'deduction_report_3'];

    // Check if it's one of our new multi-column reports
    if (deductionReportTypes.includes(deductionType.toLowerCase())) {
      // Build query for multi-column deduction reports
      let query = '';
      const regionClause = region && region.trim() !== '' ? ' AND region = ?' : '';
      const queryParams = region ? [endDate, region] : [endDate];

      switch (deductionType.toLowerCase()) {
        case 'deduction_report_1':
          query = `
                    SELECT 
                        enddate,
                        region,
                        idno,
                        CONCAT(lastname, ', ', firstname) AS employee,
                        lates,
                        leaves,
                        incometax AS income_tax,
                        ssscontri AS sss_contribution,
                        sssloan AS sss_loan,
                        pagibigcontri AS pagibig_contribution,
                        pagibigloan AS pagibig_loan,
                        filmalending AS philhealth,
                        (lates + leaves + incometax + ssscontri + sssloan + 
                         pagibigcontri + pagibigloan + filmalending) AS total
                    FROM ${payrollTable}
                    WHERE enddate = ? 
                    AND (lates + leaves + incometax + ssscontri + sssloan + 
                         pagibigcontri + pagibigloan + filmalending) > 0 
                    ${regionClause}
                    ORDER BY region, lastname, firstname
                `;
          break;

        case 'deduction_report_2':
          query = `
                    SELECT 
                        enddate,
                        region,
                        idno,
                        CONCAT(lastname, ', ', firstname) AS employee,
                        sakocommodity AS fake,
                        installaccount AS installment_account,
                        coated,
                        overappraisal AS over_appraisal,
                        cooprecla AS coop_recla,
                        mobilebill AS telecoms,
                        sakoprovi AS mortuary,
                        deductionamount2 AS over_payments,
                        (sakocommodity + installaccount + coated + overappraisal + 
                         cooprecla + mobilebill + sakoprovi + deductionamount2) AS total
                    FROM ${payrollTable}
                    WHERE enddate = ? 
                    AND (sakocommodity + installaccount + coated + overappraisal + 
                         cooprecla + mobilebill + sakoprovi + deductionamount2) > 0 
                    ${regionClause}
                    ORDER BY region, lastname, firstname
                `;
          break;

        case 'deduction_report_3':
          query = `
                    SELECT 
                        enddate,
                        region,
                        idno,
                        CONCAT(lastname, ', ', firstname) AS employee,
                        c_hmo AS hmo,
                        mlfund AS ml_fund,
                        opec,
                        ticket AS opec_ticket,
                        canteen AS opec_support,
                        sakoemergency AS sako,
                        sakopettycash AS motor_loan,
                        deductionamount1 AS gpa_insurance,
                        sakoprime AS other_deductions,
                        (c_hmo + mlfund + opec + ticket + canteen + 
                         sakoemergency + sakopettycash + deductionamount1 + sakoprime) AS total
                    FROM ${payrollTable}
                    WHERE enddate = ? 
                    AND (c_hmo + mlfund + opec + ticket + canteen + 
                         sakoemergency + sakopettycash + deductionamount1 + sakoprime) > 0 
                    ${regionClause}
                    ORDER BY region, lastname, firstname
                `;
          break;
      }

      [data] = await dbPool.query(query, queryParams);
      message = data.length > 0 ? `Found ${data.length} employees` : `No employees found`;
      hasIssues = data.length > 0;
    }
    // Existing single-column deduction logic (your current code)
    else {
      const deductionTypes = {
        'mlfund (xls)': 'mlfund',
        'mlfund (pdf)': 'mlfund',
        sako: 'sakoemergency',
        coated: 'coated',
        cooprecla: 'cooprecla',
        sakocommodity: 'sakocommodity',
        deductionamount1: 'deductionamount1',
        c_hmo: 'c_hmo',
        incometax: 'incometax',
        installaccount: 'installaccount',
        lates: 'lates',
        leaves: 'leaves',
        sakoprovi: 'sakoprovi',
        sakopettycash: 'sakopettycash',
        opec: 'opec',
        canteen: 'canteen',
        ticket: 'ticket',
        sakoprime: 'sakoprime',
        overappraisal: 'overappraisal',
        pagibigloan: 'pagibigloan',
        sssloan: 'sssloan',
        mobilebill: 'mobilebill',
        ssscontri: 'ssscontri',
        atd: 'atd',
        pagibigcontri: 'pagibigcontri',
        car_motorloan: 'car_motorloan',
        mlfund: 'mlfund',
        mlcellphone: 'mlcellphone',
        mlaccount: 'mlaccount',
        odetteloan: 'odetteloan',
        mllending: 'mllending',
        payables: 'payables',
        philhealth: 'philhealth',
      };

      const columnName = deductionTypes[deductionType.toLowerCase()];

      // if (columnName) {
      //   const selectField = deductionType.toLowerCase().includes("mlfund")
      //     ? "mlfund"
      //     : `${columnName} as amount`;

      //   // Add region check here
      //   const regionClause =
      //     region && region.trim() !== "" ? " AND region = ?" : "";
      //   const query = `
      //   SELECT
      //     enddate,
      //     region,
      //     ${
      //       deductionType.toLowerCase().includes("mlfund")
      //         ? "region_code, region_description,"
      //         : ""
      //     }
      //     idno,
      //     CONCAT(lastname, ', ', firstname) AS employee,
      //     ${selectField}
      //   FROM ${payrollTable}
      //   WHERE enddate = ? AND ${columnName} > 0 ${regionClause}
      //   ORDER BY region, lastname, firstname
      // `;

      //   const queryParams = region ? [endDate, region] : [endDate];

      //   //[data] = await db.query(query, queryParams);
      //   console.log(query, queryParams);
      //   [data] = await dbPool.query(query, queryParams);
      //   message =
      //     data.length > 0
      //       ? `Found ${data.length} employees`
      //       : `No employees found`;
      //   hasIssues = data.length > 0;
      // }
      const type = deductionType.toLowerCase();

      if (type === 'mlfund (xls)') {
        const regionClause = region && region.trim() !== '' ? ' AND region = ?' : '';

        const query = `
        SELECT
            REGION AS region,
            IDNO AS idno,
            LASTNAME AS lastname,
            FIRSTNAME AS firstname,
            'MLFUND_REGULAR' AS fundType,
            MLFUND_REGULAR AS fundAmount
        FROM ${payrollTable}
        WHERE ENDDATE = ?
          AND MLFUND_REGULAR <> 0
          ${regionClause}

        UNION ALL

        SELECT
            REGION AS region,
            IDNO AS idno,
            LASTNAME AS lastname,
            FIRSTNAME AS firstname,
            'MLFUND_COMAKERSHIP' AS fundType,
            MLFUND_COMAKERSHIP AS fundAmount
        FROM ${payrollTable}
        WHERE ENDDATE = ?
          AND MLFUND_COMAKERSHIP <> 0
          ${regionClause}

        UNION ALL

        SELECT
            REGION AS region,
            IDNO AS idno,
            LASTNAME AS lastname,
            FIRSTNAME AS firstname,
            'MLFUND_JEWELRY' AS fundType,
            MLFUND_JEWELRY AS fundAmount
        FROM ${payrollTable}
        WHERE ENDDATE = ?
          AND MLFUND_JEWELRY <> 0
          ${regionClause}

        UNION ALL

        SELECT
            REGION AS region,
            IDNO AS idno,
            LASTNAME AS lastname,
            FIRSTNAME AS firstname,
            'MLFUND_OPI' AS fundType,
            MLFUND_OPI AS fundAmount
        FROM ${payrollTable}
        WHERE ENDDATE = ?
          AND MLFUND_OPI <> 0
          ${regionClause}

        UNION ALL

        SELECT
            REGION AS region,
            IDNO AS idno,
            LASTNAME AS lastname,
            FIRSTNAME AS firstname,
            'MLFUND_PCL' AS fundType,
            MLFUND_PCL AS fundAmount
        FROM ${payrollTable}
        WHERE ENDDATE = ?
          AND MLFUND_PCL <> 0
          ${regionClause}

        UNION ALL

        SELECT
            REGION AS region,
            IDNO AS idno,
            LASTNAME AS lastname,
            FIRSTNAME AS firstname,
            'MLFUND_EMERGENCY' AS fundType,
            MLFUND_EMERGENCY AS fundAmount
        FROM ${payrollTable}
        WHERE ENDDATE = ?
          AND MLFUND_EMERGENCY <> 0
          ${regionClause}

        ORDER BY REGION, LASTNAME, FIRSTNAME
    `;

        const queryParams =
          region && region.trim() !== ''
            ? [
                endDate,
                region,
                endDate,
                region,
                endDate,
                region,
                endDate,
                region,
                endDate,
                region,
                endDate,
                region,
              ]
            : [endDate, endDate, endDate, endDate, endDate, endDate];

        [data] = await dbPool.query(query, queryParams);

        message = data.length > 0 ? `Found ${data.length} records` : `No employees found`;

        hasIssues = data.length > 0;
      } else if (columnName) {
        //const type = deductionType.toLowerCase();
        const mlfundTypes = ['mlfund (xls)', 'mlfund (pdf)'];
        const isMlfund = mlfundTypes.includes(type);

        const selectField = isMlfund ? 'mlfund' : `${columnName} as amount`;

        const regionClause = region && region.trim() !== '' ? ' AND region = ?' : '';

        const query = `
    SELECT 
      enddate, 
      region, 
      ${isMlfund ? 'region_code, region_description,' : ''}
      idno, 
      CONCAT(lastname, ', ', firstname) AS employee, 
      ${selectField}
    FROM ${payrollTable} 
    WHERE enddate = ? AND ${columnName} > 0 ${regionClause}
    ORDER BY region, lastname, firstname
  `;

        const queryParams = region ? [endDate, region] : [endDate];

        //console.log(query, queryParams);

        [data] = await dbPool.query(query, queryParams);

        message = data.length > 0 ? `Found ${data.length} employees` : `No employees found`;

        hasIssues = data.length > 0;
      } else {
        message = `Unsupported deduction type: ${deductionType}`;
        hasIssues = false;
      }
    }
  } else if (reportType.toLowerCase().trim() === 'income report') {
    const regionClause = region && region.trim() !== '' ? ' AND region = ?' : '';
    const query = `
    SELECT 
      enddate,
      region,
      CONCAT(lastname, ', ', firstname) AS employee,
      basicpay,
      totalallow,
      totalot,
      (incomeamount1 + incomeamount2) AS otherincome,
      (basicpay + totalallow + totalot + incomeamount1 + incomeamount2) AS subtotal
    FROM ${payrollTable}
    WHERE enddate = ?
    ${regionClause}
    ORDER BY region, lastname, firstname
  `;

    const queryParams = region && region.trim() !== '' ? [endDate, region] : [endDate];

    [data] = await dbPool.query(query, queryParams);
    message = data.length > 0 ? `Found ${data.length} employees` : `No employees found`;
    hasIssues = data.length > 0;
  } else if (reportType.toLowerCase().trim() === 'income') {
    const incomeTypes = {
      basicpay: 'basicpay',
      cola: 'cola',
      abmallow: 'abmallow',
      houseallow: 'houseallow',
      income1: 'income1',
      income2: 'income2',
      supervisoryallow2: 'supervisoryallow2',
      managementallow: 'managementallow',
      bmallow: 'bmallow',
      auditorsallow: 'auditorsallow',
      supervisoryallow1: 'supervisoryallow1',
      totalot: 'totalot',
      travelallow: 'travelallow',
    };

    const columnName = incomeTypes[incomeType.toLowerCase()];

    if (columnName) {
      const selectField = `${columnName} as amount`;

      // Add region check here
      const regionClause = region && region.trim() !== '' ? ' AND region = ?' : '';
      const query = `
      SELECT 
        enddate, 
        region, 
        idno, 
        CONCAT(lastname, ', ', firstname) AS employee, 
        ${selectField}
      FROM ${payrollTable} 
      WHERE enddate = ? AND ${columnName} > 0 ${regionClause}
      ORDER BY region, lastname, firstname
    `;

      const queryParams = region ? [endDate, region] : [endDate];
      //[data] = await db.query(query, queryParams);
      //console.log(query, queryParams);
      [data] = await dbPool.query(query, queryParams);

      message = data.length > 0 ? `Found ${data.length} employees` : `No employees found`;
      hasIssues = data.length > 0;
    } else {
      message = `Unsupported income type: ${incomeType}`;
      hasIssues = false;
    }
  } else if (reportType.toLowerCase().trim() === 'kp') {
    //console.log("kp");

    const regionClause = region && region.trim() !== '' ? ' AND region = ?' : '';

    // Query with dynamic table name
    const query = `
    SELECT region, enddate, 
      mobileno,
      concat(lastname, ', ', firstname) AS employee,
      totalnet AS amount
    FROM 
      ${payrollTable} 
    WHERE 
      enddate = ? 
      AND (
          (SUBSTRING(mobileno, 1, 1) != 'x') 
          -- OR (mobileno IS NULL)
      )
      -- AND accountno = 'none'
      ${regionClause}

    UNION ALL

    SELECT region,enddate,
      mobileno,
      concat(lastname, ', ', firstname) AS employee,
      totalnet AS amount
    FROM 
      ${payrollTable}
    WHERE 
      enddate = ? 
      AND wallet_removed = 1
      ${regionClause}

    ORDER BY 
      employee;
  `;

    // Adjust query parameters: if region is provided, pass it for both SELECTs
    const queryParams =
      region && region.trim() !== ''
        ? [endDate, region, endDate, region] // region is used for both SELECTs
        : [endDate, endDate]; // If no region is provided, just use endDate for both queries
    console.log(query, queryParams);
    try {
      // Execute the query
      [data] = await dbPool.query(query, queryParams);
      message = data.length > 0 ? `Found ${data.length} employees` : `No employees found`;
      hasIssues = data.length > 0;
    } catch (err) {
      console.error('Error executing query:', err);
      message = 'An error occurred while generating the report.';
      hasIssues = true;
    }
  } else if (reportType.toLowerCase().trim() === 'monthly rate') {
    const regionClause = region && region.trim() !== '' ? ' AND region = ?' : '';

    // Build ORDER BY clause based on region
    // If region is 'support' or 'supportl', order by region, department, lastname, firstname
    // Otherwise, order by region, lastname, firstname
    let orderByClause;
    if (region && (region.toLowerCase() === 'support' || region.toLowerCase() === 'supportl')) {
      orderByClause = 'ORDER BY region, department, lastname, firstname';
    } else {
      orderByClause = 'ORDER BY region, lastname, firstname';
    }

    const query = `
        SELECT 
            region, 
            enddate, 
            idno,
            department,
            CONCAT(lastname, ', ', firstname) AS employee,
            monthlyrate AS amount
        FROM ${payrollTable} 
        WHERE enddate = ? 
        ${regionClause}
        ${orderByClause}
    `;

    const queryParams = region && region.trim() !== '' ? [endDate, region] : [endDate];

    try {
      [data] = await dbPool.query(query, queryParams);
      message = data.length > 0 ? `Found ${data.length} employees` : 'No employees found';
      hasIssues = data.length > 0;
    } catch (err) {
      console.error('Error executing query:', err);
      message = 'An error occurred while generating the report.';
      hasIssues = true;
    }
  } else if (reportType.toLowerCase().trim() === 'kp wallet') {
    console.log('kp wallet');

    const regionClause = region && region.trim() !== '' ? ' AND region = ?' : '';

    // Query with dynamic table name
    const query = `
    SELECT region, enddate, 
      mobileno,
      concat(lastname, ', ', firstname) AS employee,
      totalnet AS amount
    FROM 
      ${payrollTable} 
    WHERE 
      enddate = ? 
      AND wallet_removed = 0 
      
      ${regionClause}

    ORDER BY region, 
      employee;
  `;

    // Adjust query parameters: if region is provided, pass it for both SELECTs
    const queryParams =
      region && region.trim() !== ''
        ? [endDate, region, endDate, region] // region is used for both SELECTs
        : [endDate, endDate]; // If no region is provided, just use endDate for both queries
    console.log(query, queryParams);
    try {
      // Execute the query
      [data] = await dbPool.query(query, queryParams);
      console.log(data);
      message = data.length > 0 ? `Found ${data.length} employees` : `No employees found`;
      hasIssues = data.length > 0;
    } catch (err) {
      console.error('Error executing query:', err);
      message = 'An error occurred while generating the report.';
      hasIssues = true;
    }
  } else if (reportType.toLowerCase().trim() === 'payroll summary (net)') {
    //console.log("payroll summary (net)");

    const regionClause = region && region.trim() !== '' ? ' AND region = ?' : '';
    const regionField = region && region.trim() !== '' ? 'region' : "'All Regions' as region";

    // Query with dynamic table name
    const query = `
    SELECT  ${regionField}, enddate, 
      mobileno,
      concat(lastname, ', ', firstname) AS employee,
      totalnet AS amount
    FROM 
      ${payrollTable} 
    WHERE 
      enddate = ? 
      
      ${regionClause}
order by
    
      employee;
  `;

    // Adjust query parameters: if region is provided, pass it for both SELECTs
    const queryParams =
      region && region.trim() !== ''
        ? [endDate, region, endDate, region] // region is used for both SELECTs
        : [endDate, endDate]; // If no region is provided, just use endDate for both queries

    try {
      // Execute the query
      [data] = await dbPool.query(query, queryParams);
      message = data.length > 0 ? `Found ${data.length} employees` : `No employees found`;
      hasIssues = data.length > 0;
    } catch (err) {
      console.error('Error executing query:', err);
      message = 'An error occurred while generating the report.';
      hasIssues = true;
    }
  } ////
  else if (reportType.toLowerCase().trim() === 'payroll summary (region)') {
    //console.log("payroll summary (region)");

    // Query with dynamic table name
    const query = `
    SELECT enddate,
    region AS regional,
    COUNT(idno) AS totalcount,
    SUM(totalnet) AS totalamount,
    SUM(CASE WHEN ((SUBSTRING(mobileno, 1, 1) != 'x' OR mobileno IS NULL) OR wallet_removed = 1) 
          AND accountno = 'none' THEN 1 ELSE 0 END) AS kpcount,
    SUM(CASE WHEN ((SUBSTRING(mobileno, 1, 1) != 'x' OR mobileno IS NULL) OR wallet_removed = 1) 
          AND accountno = 'none' THEN totalnet ELSE 0 END) AS kpamount,
    SUM(CASE WHEN SUBSTRING(mobileno, 1, 1) = 'x' AND wallet_removed = 0 THEN 1 ELSE 0 END) AS walletcount,
    SUM(CASE WHEN SUBSTRING(mobileno, 1, 1) = 'x' AND wallet_removed = 0 THEN totalnet ELSE 0 END) AS walletamount
FROM 
    ${payrollTable} 
WHERE 
    enddate = ?
GROUP BY 
    region
ORDER BY 
    region;
  `;

    // Adjust query parameters: if region is provided, pass it for both SELECTs
    const queryParams =
      region && region.trim() !== ''
        ? [endDate, region, endDate, region] // region is used for both SELECTs
        : [endDate, endDate]; // If no region is provided, just use endDate for both queries

    try {
      // Execute the query
      [data] = await dbPool.query(query, queryParams);
      message = data.length > 0 ? `Found ${data.length} employees` : `No employees found`;
      hasIssues = data.length > 0;
    } catch (err) {
      console.error('Error executing query:', err);
      message = 'An error occurred while generating the report.';
      hasIssues = true;
    }
  } else if (reportType.toLowerCase().trim() === 'kp wallet (csv file)') {
    //console.log("kp wallet (csv file)");

    const regionClause = region && region.trim() !== '' ? ' AND region = ?' : '';

    // Query with dynamic table name
    const query = `
    SELECT @row_num := @row_num + 1  AS NO ,mobileno AS WALLETID, firstname as 'First Name', lastname as 'Last Name', totalnet AS AMOUNT FROM 
      ${payrollTable} , (SELECT @row_num := 0) AS init
    WHERE 
      enddate = ? 
       AND(SUBSTRING(mobileno, 1, 1) = 'x') AND  wallet_removed = 0
      ${regionClause}

    
    ORDER BY 
      walletid;
  `;

    // Adjust query parameters: if region is provided, pass it for both SELECTs
    const queryParams =
      region && region.trim() !== ''
        ? [endDate, region, endDate, region] // region is used for both SELECTs
        : [endDate, endDate]; // If no region is provided, just use endDate for both queries
    console.log('query: ', query, 'params: ', queryParams);
    try {
      // Execute the query
      [data] = await dbPool.query(query, queryParams);
      message = data.length > 0 ? `Found ${data.length} employees` : `No employees found`;
      hasIssues = data.length > 0;
    } catch (err) {
      console.error('Error executing query:', err);
      message = 'An error occurred while generating the report.';
      hasIssues = true;
    }
  } else if (reportType.toLowerCase().trim() === 'payslip') {
    data = await getPayslipData(dbPool, payrollTable, endDate, region, office);
    message = data.length > 0 ? `Found ${data.length} employees` : `No employees found`;

    hasIssues = data.length > 0;
  } else if (reportType.toLowerCase().trim() === 'wage increase') {
    const hasRegion = region && region.trim() !== '';

    const baseQuery = isVisminOrLuzon
      ? `SELECT 
  region, idno, lastname, firstname, department, branch, designation, 
  datehired, monthlyrate, dailyrate
  
FROM  ${payrollTable} 
     WHERE enddate = ? `
      : `SELECT 
  region, idno, lastname, firstname, department, branch, designation,
  datehired, monthlyrate, dailyrate
FROM ${payrollTable} 
     WHERE enddate = ? `;

    // Check if region is provided and append region clause
    const regionClause = region && region.trim() !== '' ? ' AND region = ?' : '';
    const fullQuery = `${baseQuery}${regionClause} ORDER BY region, department, lastname, firstname;`;

    const queryParams = region ? [endDate, region] : [endDate];

    //[data] = await db.query(fullQuery, queryParams);
    //console.log(fullQuery, queryParams);
    [data] = await dbPool.query(fullQuery, queryParams);

    message = data.length > 0 ? `Found ${data.length} employees` : `No employees found`;
    hasIssues = data.length > 0;
  } else if (reportType.toLowerCase().trim() === 'edi payroll') {
    const result = await generateEDIPayrollReport(dbPool, payrollTable, endDate);
    data = result.results;
    message = data.length > 0 ? `Found ${data.length} branch records` : `No records found`;
    hasIssues = data.length > 0;
  } else if (reportType.toLowerCase().trim() === 'edi remittance report') {
    const result = await generateNewEDIRemittanceReport(dbPool, payrollTable, endDate);
    data = result.results;
    message = data.length > 0 ? `Found ${data.length} branch records` : `No records found`;
    hasIssues = data.length > 0;
  } else if (reportType.toLowerCase().trim() === 'edi deduction details') {
    const result = await generateEDIDeductionDetailsReport(dbPool, payrollTable, endDate);
    data = result.results;
    message = data.length > 0 ? `Found ${data.length} regions` : `No records found`;
    hasIssues = data.length > 0;
  }
  ///
  else if (reportType.toLowerCase().trim() === 'payroll comparison') {
    console.log('++++ payroll comparison branch reached ++++');
    try {
      const result = await generatePayrollComparison(office, dbPool, endDate);
      console.log(result);
      data = result.results;
      const totalRows = (data.nonSupportGroup?.length || 0) + (data.supportGroup?.length || 0);
      message = totalRows > 0 ? `Found ${totalRows} records` : 'No records found';
      hasIssues = totalRows > 0;
    } catch (err) {
      console.error('generatePayrollComparison threw:', err);
      throw err; // re-throw so existing outer error handling still applies
    }
  } else if (reportType.toLowerCase().trim() === 'ot report') {
    try {
      const result = await generateOTReport(dbPool, payrollTable, endDate, region);

      data = result.results;

      const totalRows = (data.nonSupportGroup?.length || 0) + (data.supportGroup?.length || 0);

      message = totalRows > 0 ? `Found ${totalRows} records` : 'No records found';

      hasIssues = totalRows > 0;
    } catch (err) {
      console.error('generateOTReport error:', err);
      throw err;
    }
  } else if (reportType.toLowerCase().trim() === 'payroll data') {
    try {
      const result = await generatePayrollData(dbPool, payrollTable, endDate, region);

      data = result.results;

      const totalRows =
        (data.nonSupportGroup?.length || 0) +
        (data.supportGroup?.length || 0) +
        (data.mancommGroup?.length || 0);

      message = totalRows > 0 ? `Found ${totalRows} records` : 'No records found';

      hasIssues = totalRows > 0;
    } catch (err) {
      console.error('generatePayrollData error:', err);
      throw err;
    }
  } else if (reportType.toLowerCase().trim() === 'direct payroll') {
    try {
      const result = await generateDirectPayroll(dbPool, payrollTable, endDate, region);

      data = result.results;

      const totalRows =
        (data.nonSupportGroup?.length || 0) +
        (data.supportGroup?.length || 0) +
        (data.mancommGroup?.length || 0);

      message = totalRows > 0 ? `Found ${totalRows} records` : 'No records found';

      hasIssues = totalRows > 0;
    } catch (err) {
      console.error('generatePayrollData error:', err);
      throw err;
    }
  }

  ///
  else if (reportType.toLowerCase().trim() === 'fs payroll') {
    if (!region || region.trim() === '') {
      message = 'Please select a specific region for FS Payroll.';
      hasIssues = false;
      data = [];
    } else {
      const result = await generateFSPayrollReport(dbPool, payrollTable, endDate, region);
      data = result.results;
      message = data.length > 0 ? `Found ${data.length} department records` : `No records found`;
      hasIssues = data.length > 0;
    }
  }
  ////

  //data);
  return { message, data, hasIssues };
}

async function getPayslipData(dbPool, payrollTable, endDate, region, office) {
  const isVisminOrLuzon = ['vismin', 'luzon'].includes(office.toLowerCase());
  //console.log(isVisminOrLuzon);
  const baseQuery = isVisminOrLuzon
    ? `SELECT CAST(
    CONCAT(
        DATE_FORMAT(startdate, '%M %e'),
        ' - ',
        DATE_FORMAT(enddate, '%e, %Y')
    ) AS CHAR
) AS payroll_date,
    startDate, idno, endDate, region, employmentstatus, designation, mobileno as account_no,department, branch,
       CONCAT(
        lastname, 
        ', ', 
        firstname, 
        ' ', 
        LEFT(middlename, 1), 
        '.'
    )as employee_name, 
    if(lower(employmentstatus) = 'regular', 'MONTHLY', 'DAILY') as employment_status,
    totalot,
    totalnet as net_pay,
       IF(monthlyrate <=0, 'daily', 'monthly') AS payrollType,
       ROUND((dailyrate / 8), 2) as hourly_rate,
otspecial, otholiday, nightpremium, otexcsspecial, rdot, otexcsholiday, totalallow, incomeamount1, incomeamount2,

       (minutesworked / 480) AS minutesworked,
       basicpay as basic_pay, totalallow as total_allow, totalot as total_ot, cola,
       (incomeamount1 + incomeamount2) AS other_income,
       totaldeduction as total_deduction,
       gross, lates, leaves as absent,
       incometax, ssscontri, pagibigcontri,
       sssloan, pagibigloan, mlfund,
       totaldeduction, totalnet,
       otherincdesc1, otherincdesc2, otspecial, otholiday, nightpremium, otexcsspecial, rdot, otexcsholiday, totalallow, otordinary,
       leaves,
    lates,
    ssscontri,
    sssloan,
    incometax,
    pagibigcontri,
    pagibigloan,
    mlfund,
    opec,
    overappraisal,
    cooprecla,
    filmalending,
    installaccount,
    ticket,
    mobilebill,
    canteen,
    c_hmo,
    deductionamount1,
    deductionamount2,
    sakoprovi,
    sakocommodity,
    sakoprime,
    sakoemergency,
    sakopettycash
     FROM ${payrollTable}
     WHERE enddate = ?`
    : `SELECT CAST(
    CONCAT(
        DATE_FORMAT(startdate, '%M %e'),
        ' - ',
        DATE_FORMAT(enddate, '%e, %Y')
    ) AS CHAR
) AS payroll_date,
    startDate, idno, endDate, region, employmentstatus, designation, mobileno as account_no,department, branch,
       CONCAT(
        lastname, 
        ', ', 
        firstname, 
        ' ', 
        LEFT(middlename, 1), 
        '.'
    )as employee_name, 
    if(lower(employmentstatus) = 'regular', 'MONTHLY', 'DAILY') as employment_status,
    totalot,
    totalnet as net_pay,
       IF(monthlyrate <=0, 'daily', 'monthly') AS payrollType,
       ROUND((dailyrate / 8), 2) as hourly_rate,
otspecial, otholiday, nightpremium, otexcsspecial, '' as rdot, otexcsholiday, totalallow, incomeamount1, incomeamount2,

       (minutesworked / 480) AS minutesworked,
       basicpay as basic_pay, totalallow as total_allow, totalot as total_ot, cola,
       (incomeamount1 + incomeamount2) AS other_income,
       totaldeduction as total_deduction,
       gross, lates, leaves as absent,
       incometax, ssscontri, pagibigcontri,
       sssloan, pagibigloan, mlfund,
       totaldeduction, totalnet,
       otherincdesc1, otherincdesc2, otspecial, otholiday, nightpremium, otexcsspecial, otexcsholiday, totalallow, otordinary,
       leaves,
    lates,
    incometax,
    ssscontri,
    sssloan,
    pagibigcontri,
    pagibigloan,
    car_motorloan,
    mlfund,
    hmo,
    mlcellphone,
    philhealth,
    mlaccount,
    atd,
    odetteloan,
    canteen, 
    sakoprovi,
    sakocommodity,
    sakoprime,
    sakoemergency,
    sakopettycash, 
    sakocbu, sakosavings,
    deductionamount1,
    deductionamount2,
    mllending, 
        c_hmo, payables, filmalending as philhealth




    
    
     FROM ${payrollTable}
     WHERE enddate = ? `;

  const regionClause = region ? ' AND region = ?' : '';
  const fullQuery = `${baseQuery}${regionClause} ORDER BY region, lastname`;

  const params = region ? [endDate, region] : [endDate];

  const [rows] = await dbPool.query(fullQuery, params);

  return rows;
}

const XLSX = require('xlsx');

async function getPayrollColumnConfig(office) {
  const dbPool = utilitiesModel.getDbPool(office);
  const connection = await dbPool.getConnection();

  try {
    const [mlFundColumns] = await connection.query(`
      SELECT column_name FROM payroll_column_config
      WHERE category = 'ML Fund' AND active = true
    `);

    const [allowColumns] = await connection.query(`
      SELECT column_name FROM payroll_column_config
      WHERE category = 'Allowance' AND active = true
    `);

    const [otColumns] = await connection.query(`
      SELECT column_name FROM payroll_column_config
      WHERE category = 'OT' AND active = true
    `);

    connection.release();
    console.log(mlFundColumns);
    return {
      mlFundColumns: mlFundColumns.map((row) => row.column_name),
      allowColumns: allowColumns.map((row) => row.column_name),
      otColumns: otColumns.map((row) => row.column_name),
    };
  } catch (error) {
    connection.release();
    console.error('Failed to fetch column configuration:', error);
    throw error;
  }
}
// ===============================
// WRAPPER FOR UPLOAD
// ===============================
async function processUploadedPayroll({ fileBuffer, fileName, office, region, user, dateRange }) {
  try {
    const { startDate, endDate } = getDates(dateRange);
    const { mlFundColumns, allowColumns, otColumns } = await getPayrollColumnConfig(office);

    // ===============================
    // READ EXCEL/CSV FROM BUFFER
    // ===============================
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];

    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

    if (!rawData || rawData.length === 0) {
      throw new Error('Uploaded file is empty');
    }

    // ===============================
    // NORMALIZE COLUMN HEADERS TO LOWERCASE
    // ===============================
    const normalizedData = rawData.map((row) => {
      const newRow = {};
      Object.keys(row).forEach((key) => {
        // Remove extra spaces and convert to lowercase
        const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, ' ');
        newRow[normalizedKey] = row[key];
      });
      return newRow;
    });

    // ===============================
    // INSERT DATA WITH NORMALIZED HEADERS
    // ===============================
    const resultMessage = await exports.insertData(
      normalizedData,
      office,
      startDate,
      endDate,
      mlFundColumns,
      allowColumns,
      otColumns,
    );

    // ===============================
    // GET SUMMARY FROM DB
    // ===============================
    const payrollInfo = getPayrollFolder(office);
    const payrollTable = payrollInfo.tableName + new Date(endDate).getFullYear();

    const dbPool = utilitiesModel.getDbPool(office);
    const connection = await dbPool.getConnection();

    const [summary] = await connection.query(
      `
      SELECT 
        region,
        FORMAT(COUNT(*), 0) as employeeCount,
        SUM(totalNet) as totalNet
      FROM ${payrollTable}
      WHERE endDate = ?
      GROUP BY region
      ORDER BY region
    `,
      [endDate],
    );

    connection.release();

    return {
      message: resultMessage || 'Payroll uploaded successfully',
      hasIssues: false,
      data: summary,
    };
  } catch (error) {
    console.error('PROCESS UPLOAD ERROR:', error);
    throw new Error('Failed to process uploaded payroll: ' + error.message);
  }
}

//07022026
//START -> WORKING CODE FOR READING A FILE FROM THE UPLOADED FOLDERS
// ===============================
// WRAPPER FOR UPLOAD
// ===============================
// async function processUploadedPayroll({
//   filePath,
//   office,
//   region,
//   user,
//   dateRange,
// }) {
//   try {
//     const { startDate, endDate } = getDates(dateRange);
//     const { mlFundColumns, allowColumns, otColumns } =
//       await getPayrollColumnConfig(office);
//     // ===============================
//     // READ EXCEL FILE
//     // ===============================
//     const workbook = XLSX.readFile(filePath);
//     const sheetName = workbook.SheetNames[0];

//     const rawData = XLSX.utils.sheet_to_json(
//       workbook.Sheets[sheetName],
//       { defval: null }, // 🔥 VERY IMPORTANT (prevents undefined)
//     );

//     if (!rawData || rawData.length === 0) {
//       throw new Error("Uploaded file is empty");
//     }

//     //console.log("office: ", office, "enddate: ", endDate);
//     //console.log("UPLOAD PREVIEW (first 3 rows):", rawData.slice(0, 3));

//     // ===============================
//     // 🔥 INSER DATA
//     // ===============================
//     const resultMessage = await exports.insertData(
//       rawData,
//       office,
//       startDate,
//       endDate,
//       mlFundColumns,
//       allowColumns,
//       otColumns,
//     );

//     // ===============================
//     // 🔥 NEW: GET SUMMARY FROM DB
//     // ===============================
//     const payrollInfo = getPayrollFolder(office);
//     const payrollTable =
//       payrollInfo.tableName + new Date(endDate).getFullYear();

//     const dbPool = utilitiesModel.getDbPool(office);
//     const connection = await dbPool.getConnection();

//     const [summary] = await connection.query(`
//       SELECT
//         region,
//         FORMAT(COUNT(*), 0) as employeeCount,
//         SUM(totalNet) as totalNet
//       FROM ${payrollTable} WHERE endDate = '${endDate}'
//       GROUP BY region
//       ORDER BY region
//     `);

//     connection.release();

//     return {
//       message: resultMessage || "Payroll uploaded successfully",
//       hasIssues: false,
//       data: summary,
//     };
//   } catch (error) {
//     console.error("PROCESS UPLOAD ERROR:", error);
//     throw new Error("Failed to process uploaded payroll: " + error.message);
//   }
// }
//END -> WORKING CODE FOR READING A FILE FROM THE UPLOADED FOLDERS
// async function processUploadedPayroll({
//   fileBuffer, // ✅ changed
//   fileName, // ✅ optional (not required but useful)
//   office,
//   region,
//   user,
//   dateRange,
// }) {
//   try {
//     const { startDate, endDate } = getDates(dateRange);

//     const { mlFundColumns, allowColumns, otColumns } = await getPayrollColumnConfig(office);

//     // ===============================
//     // 🔥 READ EXCEL/CSV FROM BUFFER
//     // ===============================
//     const workbook = XLSX.read(fileBuffer, { type: 'buffer' }); // ✅ KEY CHANGE

//     const sheetName = workbook.SheetNames[0];

//     const rawData = XLSX.utils.sheet_to_json(
//       workbook.Sheets[sheetName],
//       { defval: null }, // keeps null instead of undefined
//     );

//     if (!rawData || rawData.length === 0) {
//       throw new Error('Uploaded file is empty');
//     }

//     // ===============================
//     // 🔥 INSERT DATA
//     // ===============================
//     const resultMessage = await exports.insertData(
//       rawData,
//       office,
//       startDate,
//       endDate,
//       mlFundColumns,
//       allowColumns,
//       otColumns,
//     );

//     // ===============================
//     // 🔥 GET SUMMARY FROM DB
//     // ===============================
//     const payrollInfo = getPayrollFolder(office);
//     const payrollTable = payrollInfo.tableName + new Date(endDate).getFullYear();

//     const dbPool = utilitiesModel.getDbPool(office);
//     const connection = await dbPool.getConnection();

//     const [summary] = await connection.query(
//       `
//       SELECT
//         region,
//         FORMAT(COUNT(*), 0) as employeeCount,
//         SUM(totalNet) as totalNet
//       FROM ${payrollTable}
//       WHERE endDate = ?
//       GROUP BY region
//       ORDER BY region
//     `,
//       [endDate],
//     );

//     connection.release();

//     return {
//       message: resultMessage || 'Payroll uploaded successfully',
//       hasIssues: false,
//       data: summary,
//     };
//   } catch (error) {
//     console.error('PROCESS UPLOAD ERROR:', error);
//     throw new Error('Failed to process uploaded payroll: ' + error.message);
//   }
// }
// end 07022026

const connectDB = require('../config/db');
//const db = connectDB.getPool("hrmddb");

// ===============================
// HELPERS
// ===============================

function normalizeHeader(header) {
  return header.replace(/\s+/g, ' ').replace(/\r?\n/g, '').trim().toUpperCase();
}

function excelSerialDateToJSDate(serial) {
  const excelStartDate = new Date(1899, 11, 30);
  const date = new Date(excelStartDate.getTime() + (serial + 1) * 86400000);
  return date.toISOString().split('T')[0];
}

function parseCustomDate(dateString) {
  const [day, month, year] = dateString.split('/');
  if (day && month && year) {
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

function isExcelDate(val) {
  return typeof val === 'number' && val > 30000 && val < 60000;
}

// WORKING 07022026
// exports.insertData = async (
//   data,
//   office,
//   startDate,
//   endDate,
//   mlFundColumns,
//   allowColumns,
//   otColumns,
// ) => {
//   const payrollInfo = getPayrollFolder(office);
//   const payrollTable = payrollInfo.tableName + new Date(endDate).getFullYear();

//   const dbPool = utilitiesModel.getDbPool(office);
//   const defaultPool = utilitiesModel.getDbPool('default');

//   if (!data || data.length === 0) {
//     throw new Error('No data found in file');
//   }

//   const connection = await dbPool.getConnection();
//   const defaultConnection = await defaultPool.getConnection('default');

//   try {
//     await connection.beginTransaction();

//     // Step 1: collect unique regions from incoming data
//     const regions = [
//       ...new Set(
//         data
//           .map((row) => {
//             // Try to find region in any case
//             const regionKey = Object.keys(row).find(
//               (k) =>
//                 k.toLowerCase().trim() === 'region' ||
//                 k.toLowerCase().trim() === 'region name' ||
//                 k.toLowerCase().trim() === 'region_name',
//             );
//             if (!regionKey) return null;
//             const value = row[regionKey];
//             return typeof value === 'string' ? value.trim() : value;
//           })
//           .filter((r) => r), // remove null/undefined/empty
//       ),
//     ];

//     // Step 2: delete per region
//     if (regions.length > 0) {
//       const placeholders = regions.map(() => '?').join(',');
//       await connection.query(
//         `DELETE FROM ${payrollTable}
//          WHERE office = ?
//          AND endDate = ?
//          AND region_name IN (${placeholders})`,
//         [office, endDate, ...regions],
//       );
//     }
//     console.log('Deleting regions:', regions);

//     // ===============================
//     // CASE-INSENSITIVE COLUMN MAPPING
//     // ===============================
//     const columnMapping = {
//       number: 'idno',
//       department: 'department',
//       branch: 'branch',
//       'first name': 'firstName',
//       'last name': 'lastName',
//       designation: 'designation',
//       'employment type': 'employmentStatus',
//       'date of appointment': 'dateHired',
//       'bank account number': 'mobileno',
//       'monthly rate': 'monthlyRate',
//       'daily rate': 'dailyrate',
//       'no of actual duty': 'no_of_actual_duty',
//       'basic pay': 'basicPay',
//       rot: 'rot_amount',
//       rdot: 'rdot_amount',
//       shot: 'shot_amount',
//       lhot: 'lhot_amount',
//       erdot: 'erdot_amount',
//       eshot: 'eshot_amount',
//       elhot: 'elhot_amount',
//       'night differential amount': 'nightpremium',
//       'hazard allowance': 'abmAllow',
//       'housing allowance': 'housingAllow',
//       'management allowance': 'managementAllow',
//       'transportation allowance': 'travelAllow',
//       'supervisory allowance': 'bmallow',
//       'auditor allowance': 'auditorsAllow',
//       'location allowance': 'supervisoryAllow1',
//       'meal allowance': 'supervisoryAllow2',
//       'coor allowance': 'allow9',
//       'single post allowance': 'allow10',
//       'positional allowance': 'positional_allowance',
//       'mancomm allowance': 'mancomm_allowance',
//       'managerial allowance': 'managerial_allowance',

//       pb: 'incomeAmount1',
//       'other income': 'incomeAmount2',
//       'non taxble allowance': 'non_taxable_allowance',
//       'gross pay': 'gross',
//       'taxable amount': 'taxable_amount',
//       'absence amount': 'leaves',
//       lates: 'lates',
//       'pagibig loan': 'pagibigLoan',
//       'pagibig - ee': 'pagibigContri',
//       'phic - ee': 'filmaLending',
//       'sss - ee': 'sssContri',
//       'sss (er + ec)': 'sss_employer',
//       pagibig: 'pagibig_employer',
//       philheath: 'philhealth_employer',
//       opec: 'opec',
//       coated: 'coated',
//       'installment account': 'installAccount',
//       'opec ticket': 'ticket',
//       'over appraisal': 'overappraisal',
//       fake: 'sakoCommodity',
//       hmo: 'C_HMO',
//       'other deductions': 'sakoPrime',
//       'ispd insurance': 'deductionAmount1',
//       'opec support': 'canteen',
//       'ml fund regular': 'mlfund_regular',
//       'ml fund comakership': 'mlfund_comakership',
//       'ml fund jewelry': 'mlfund_jewelry',
//       'ml fund opi': 'mlfund_opi',
//       'ml fund pcl': 'mlfund_pcl',
//       'ml fund emergency': 'mlfund_emergency',
//       'ml fund all buyout': 'mlfund_all_buyout',
//       'ml fund bday': 'mlfund_bday',
//       'ml fund ssl': 'mlfund_ssl',
//       'motor loan': 'sakoPettycash',
//       'sako all buyout': 'sako_buyout',
//       'withholding tax': 'incomeTax',
//       mortuary: 'sakoProvi',
//       'vpo/christmas party': 'cooprecla',
//       sako: 'sakoEmergency',
//       'sss loan': 'sssLoan',
//       'over payments': 'deductionAmount2',
//       'total deductions': 'totalDeduction',
//       'net pay': 'totalNet',
//       region: 'region_name',
//       'region name': 'region_name',
//       region_name: 'region_name',
//     };

//     // Create a lookup map for all possible variations
//     const normalizedMapping = {};
//     Object.keys(columnMapping).forEach((key) => {
//       const normalized = key.toLowerCase().trim();
//       normalizedMapping[normalized] = columnMapping[key];
//     });

//     // Get the columns from the first row
//     const firstRow = data[0];
//     const rawColumns = Object.keys(firstRow);

//     const validColumnIndexes = [];
//     const mappedColumns = rawColumns.reduce((acc, column, index) => {
//       const normalized = column.toLowerCase().trim();
//       if (normalizedMapping[normalized]) {
//         acc.push(normalizedMapping[normalized]);
//         validColumnIndexes.push(index);
//         return acc;
//       }
//       return acc;
//     }, []);

//     // Log columns that were not mapped (for debugging)
//     const ignoredColumns = rawColumns.filter((col, index) => {
//       const normalized = col.toLowerCase().trim();
//       return !normalizedMapping[normalized];
//     });
//     if (ignoredColumns.length > 0) {
//       console.log('Ignored columns:', ignoredColumns);
//     }

//     // ===============================
//     // COLUMN TYPES
//     // ===============================
//     const numericColumns = [
//       'managementAllow',
//       'travelAllow',
//       'abmAllow',
//       'housingAllow',
//       'basicPay',
//       'incomeAmount1',
//       'incomeAmount2',
//       'gross',
//       'leaves',
//       'incomeTax',
//       'sssLoan',
//       'pagibigLoan',
//       'opec',
//       'installAccount',
//       'ticket',
//       'sakoProvi',
//       'sakoCommodity',
//       'sakoPrime',
//       'sakoEmergency',
//       'sakoPettycash',
//       'deductionAmount1',
//       'deductionAmount2',
//       'C_HMO',
//       'totalNet',
//       'totalDeduction',
//       'nightpremium',
//       'non_taxable_allowance',
//       'taxable_amount',
//       'lates',
//       'sako_buyout',
//       'monthlyRate',
//       'mlfund_pcl',
//       'sssContri',
//       'pagibigContri',
//       'filmaLending',
//       'sss_employer',
//       'pagibig_employer',
//       'philhealth_employer',
//       'mlfund_regular',
//       'mlfund_comakership',
//       'mlfund_jewelry',
//       'mlfund_opi',
//       'mlfund_pcl',
//       'mlfund_emergency',
//       'mlfund_all_buyout',
//       'mlfund_bday',
//       'mlfund_ssl',
//       'totalAllow',
//       'totalOT',
//       'mlFund',
//       'deductionwoLateLeave',
//     ];

//     const dateColumns = ['dateHired', 'startDate', 'endDate'];

//     // ===============================
//     // HELPER FUNCTIONS
//     // ===============================
//     function toNumber(val) {
//       if (val === null || val === undefined || val === '') return 0;
//       const num = Number(val);
//       return isNaN(num) ? 0 : num;
//     }

//     function excelSerialDateToJSDate(serial) {
//       const excelStartDate = new Date(1899, 11, 30);
//       const date = new Date(excelStartDate.getTime() + (serial + 1) * 86400000);
//       return date.toISOString().split('T')[0];
//     }

//     function parseCustomDate(dateString) {
//       if (!dateString) return null;
//       const [day, month, year] = dateString.split('/');
//       if (day && month && year) {
//         return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
//       }
//       return null;
//     }

//     function isExcelDate(val) {
//       return typeof val === 'number' && val > 30000 && val < 60000;
//     }

//     // ===============================
//     // LOAD BRANCH MAP
//     // ===============================
//     const [branches] = await defaultConnection.query(
//       `SELECT b_branch, b_source, b_boscode, region_code, zone_code, region FROM branch_codes`,
//     );
//     defaultConnection.release();

//     const branchMap = new Map();
//     const regionMap = new Map();

//     branches.forEach((b) => {
//       branchMap.set(`${b.b_branch}_${b.region}`, b);
//       if (!regionMap.has(b.region)) {
//         regionMap.set(b.region, b.b_source);
//       }
//     });

//     // ===============================
//     // FINAL COLUMNS
//     // ===============================
//     const insertColumns = [
//       ...mappedColumns,
//       'totalAllow',
//       'totalOT',
//       'mlFund',
//       'boscode',
//       'region_code',
//       'zone_code',
//       'region',
//       'deductionwoLateLeave',
//       'startDate',
//       'endDate',
//       'office',
//     ];

//     const updateClause = insertColumns.map((col) => `${col}=VALUES(${col})`).join(', ');

//     const batchSize = 300;

//     // ===============================
//     // INSERT LOOP - FIXED VERSION
//     // ===============================
//     for (let i = 0; i < data.length; i += batchSize) {
//       const batch = data.slice(i, i + batchSize);
//       const values = [];

//       const placeholders = batch.map((row) => {
//         // Convert all numeric fields to 0 if blank
//         numericColumns.forEach((col) => {
//           const rawKey = Object.keys(row).find((k) => {
//             const normalized = k.toLowerCase().trim();
//             return normalized === col.toLowerCase();
//           });
//           if (rawKey) row[rawKey] = toNumber(row[rawKey]);
//         });

//         // Handle specific columns - FIND the actual column names first
//         // Find the actual column names in the row (case-insensitive)
//         const totalDeductionKey = Object.keys(row).find(
//           (k) =>
//             k.toLowerCase().trim() === 'total deductions' ||
//             k.toLowerCase().trim() === 'total deduction',
//         );
//         const totalDeduction = totalDeductionKey ? toNumber(row[totalDeductionKey]) : 0;

//         const latesKey = Object.keys(row).find((k) => k.toLowerCase().trim() === 'lates');
//         const lates = latesKey ? toNumber(row[latesKey]) : 0;

//         const leavesKey = Object.keys(row).find(
//           (k) => k.toLowerCase().trim() === 'absence amount' || k.toLowerCase().trim() === 'leaves',
//         );
//         const leaves = leavesKey ? toNumber(row[leavesKey]) : 0;

//         const undertimeKey = Object.keys(row).find((k) => k.toLowerCase().trim() === 'undertime');
//         const undertime = undertimeKey ? toNumber(row[undertimeKey]) : 0;

//         // CRITICAL FIX: Update the lates value in the row with combined lates + undertime
//         // BUT we need to use the correct column name that will be mapped
//         if (latesKey) {
//           // If the column exists as 'lates', update it with the combined value
//           row[latesKey] = lates + undertime;
//         } else {
//           // If no 'lates' column exists, create one with the combined value
//           row['lates'] = lates + undertime;
//         }

//         // Calculate deduction without late/leave
//         let deductionwoLateLeave = totalDeduction - (lates + leaves + undertime);

//         if (!Number.isFinite(deductionwoLateLeave)) {
//           deductionwoLateLeave = 0;
//         }
//         deductionwoLateLeave = Number(deductionwoLateLeave.toFixed(4));

//         if (deductionwoLateLeave > 999999.9999) deductionwoLateLeave = 999999.9999;
//         if (deductionwoLateLeave < -999999.9999) deductionwoLateLeave = -999999.9999;
//         if (deductionwoLateLeave < 0) deductionwoLateLeave = 0;

//         // Compute totalAllow
//         row.totalAllow = allowColumns.reduce((sum, col) => {
//           const rawKey = Object.keys(row).find((k) => {
//             const normalized = k.toLowerCase().trim();
//             return normalized === col.toLowerCase();
//           });
//           return sum + (rawKey ? toNumber(row[rawKey]) : 0);
//         }, 0);

//         // Compute totalOT
//         row.totalOT = otColumns.reduce((sum, col) => {
//           const rawKey = Object.keys(row).find((k) => {
//             const normalized = k.toLowerCase().trim();
//             return normalized === col.toLowerCase();
//           });
//           return sum + (rawKey ? toNumber(row[rawKey]) : 0);
//         }, 0);

//         // Compute mlFund
//         row.mlFund = mlFundColumns.reduce((sum, col) => {
//           const rawKey = Object.keys(row).find((k) => {
//             const normalized = k.toLowerCase().trim();
//             return normalized === col.toLowerCase();
//           });
//           return sum + (rawKey ? toNumber(row[rawKey]) : 0);
//         }, 0);

//         // Map row values - THIS IS WHERE THE FIX IS NEEDED
//         const rowValues = validColumnIndexes.map((colIndex) => {
//           const originalColumn = rawColumns[colIndex];
//           const mappedColumn = mappedColumns[validColumnIndexes.indexOf(colIndex)];

//           // CRITICAL FIX: If this is the 'lates' column, use the updated value from the row
//           let value;
//           if (mappedColumn === 'lates') {
//             // Use the updated value we stored in the row
//             const latesKeyInRow = Object.keys(row).find((k) => k.toLowerCase().trim() === 'lates');
//             value = latesKeyInRow ? row[latesKeyInRow] : row[originalColumn];
//           } else {
//             value = row[originalColumn];
//           }

//           if (numericColumns.includes(mappedColumn)) {
//             return toNumber(value);
//           }

//           if (dateColumns.includes(mappedColumn) || isExcelDate(value)) {
//             if (!value) return null;
//             return isNaN(value) ? parseCustomDate(value) : excelSerialDateToJSDate(value);
//           }

//           return typeof value === 'string' ? value.trim() : value;
//         });

//         // Add computed fields
//         rowValues.push(row.totalAllow, row.totalOT, row.mlFund);

//         // Branch lookup
//         const branchKey = Object.keys(row).find((k) => {
//           const normalized = k.toLowerCase().trim();
//           return normalized === 'branch';
//         });
//         const branchValue = branchKey
//           ? typeof row[branchKey] === 'string'
//             ? row[branchKey].trim()
//             : row[branchKey] || ''
//           : '';

//         const regionKey = Object.keys(row).find((k) => {
//           const normalized = k.toLowerCase().trim();
//           return (
//             normalized === 'region' || normalized === 'region name' || normalized === 'region_name'
//           );
//         });
//         const regionValue = regionKey
//           ? typeof row[regionKey] === 'string'
//             ? row[regionKey].trim()
//             : row[regionKey] || ''
//           : '';

//         const key = `${branchValue}_${regionValue}`;
//         const branchInfo = branchMap.get(key) || {};
//         const sourceFromRegion = regionMap.get(regionValue);

//         rowValues.push(
//           branchInfo.b_boscode || null,
//           branchInfo.region_code || null,
//           branchInfo.zone_code || null,
//           sourceFromRegion ?? regionValue,
//         );

//         rowValues.push(deductionwoLateLeave, startDate, endDate, office);

//         values.push(...rowValues);

//         return `(${new Array(insertColumns.length).fill('?').join(',')})`;
//       });

//       const sql = `
//     INSERT INTO ${payrollTable} (${insertColumns.join(',')})
//     VALUES ${placeholders.join(',')}
//     ON DUPLICATE KEY UPDATE ${updateClause}
//   `;

//       await connection.query(sql, values);
//     }

//     await connection.commit();
//     connection.release();
//     return '✅ Bulk import successful.';
//   } catch (error) {
//     await connection.rollback();
//     connection.release();
//     console.error('IMPORT ERROR:', error);
//     throw error;
//   }
// };
// WORKING 07022026 END

exports.insertData = async (
  data,
  office,
  startDate,
  endDate,
  mlFundColumns,
  allowColumns,
  otColumns,
) => {
  const payrollInfo = getPayrollFolder(office);
  const payrollTable = payrollInfo.tableName + new Date(endDate).getFullYear();

  const dbPool = utilitiesModel.getDbPool(office);
  const defaultPool = utilitiesModel.getDbPool('default');

  if (!data || data.length === 0) {
    throw new Error('No data found in file');
  }

  const connection = await dbPool.getConnection();
  const defaultConnection = await defaultPool.getConnection('default');

  try {
    await connection.beginTransaction();
    // Start transaction for defaultConnection too
    await defaultConnection.beginTransaction();

    // Step 1: collect unique regions from incoming data (with trimming)
    const regions = [
      ...new Set(
        data
          .map((row) => {
            const regionKey = Object.keys(row).find(
              (k) =>
                k.toLowerCase().trim() === 'region' ||
                k.toLowerCase().trim() === 'region name' ||
                k.toLowerCase().trim() === 'region_name',
            );
            if (!regionKey) return null;
            const value = row[regionKey];
            // Trim the value if it's a string
            return typeof value === 'string' ? value.trim() : value;
          })
          .filter((r) => r && r.toString().trim() !== ''), // Also filter out empty strings
      ),
    ];

    // Step 2: delete per region from payroll table
    if (regions.length > 0) {
      const placeholders = regions.map(() => '?').join(',');
      await connection.query(
        `DELETE FROM ${payrollTable} 
     WHERE office = ? 
     AND endDate = ? 
     AND region_name IN (${placeholders})`,
        [office, endDate, ...regions],
      );
    }

    // Step 3: delete existing payroll transactions (with trimmed regions)
    if (regions.length > 0) {
      const placeholders = regions.map(() => '?').join(',');

      console.log('Deleting regions from payroll_transactions:', regions);

      await defaultConnection.query(
        `DELETE FROM payroll_transactions
     WHERE office = ?
       AND end_date = ?
       AND TRIM(region_description) IN (${placeholders})`,
        [office, endDate, ...regions],
      );
    }

    // ===============================
    // CASE-INSENSITIVE COLUMN MAPPING FOR PAYROLL TABLE
    // ===============================
    const columnMapping = {
      number: 'idno',
      department: 'department',
      branch: 'branch',
      'first name': 'firstName',
      'last name': 'lastName',
      designation: 'designation',
      'employment type': 'employmentStatus',
      'date of appointment': 'dateHired',
      'bank account number': 'mobileno',
      'monthly rate': 'monthlyRate',
      'daily rate': 'dailyrate',
      'no of actual duty': 'no_of_actual_duty',
      'basic pay': 'basicPay',
      rot: 'rot_amount',
      rdot: 'rdot_amount',
      shot: 'shot_amount',
      lhot: 'lhot_amount',
      erdot: 'erdot_amount',
      eshot: 'eshot_amount',
      elhot: 'elhot_amount',
      'night differential amount': 'nightpremium',
      'hazard allowance': 'abmAllow',
      'housing allowance': 'housingAllow',
      'management allowance': 'managementAllow',
      'transportation allowance': 'travelAllow',
      'supervisory allowance': 'bmallow',
      'auditor allowance': 'auditorsAllow',
      'location allowance': 'supervisoryAllow1',
      'meal allowance': 'supervisoryAllow2',
      'coor allowance': 'allow9',
      'single post allowance': 'allow10',
      'positional allowance': 'positional_allowance',
      'mancomm allowance': 'mancomm_allowance',
      'managerial allowance': 'managerial_allowance',
      pb: 'incomeAmount1',
      'other income': 'incomeAmount2',
      'non taxble allowance': 'non_taxable_allowance',
      'gross pay': 'gross',
      'taxable amount': 'taxable_amount',
      'absence amount': 'leaves',
      lates: 'lates',
      'pagibig loan': 'pagibigLoan',
      'pagibig - ee': 'pagibigContri',
      'phic - ee': 'filmaLending',
      'sss - ee': 'sssContri',
      'sss (er + ec)': 'sss_employer',
      pagibig: 'pagibig_employer',
      philheath: 'philhealth_employer',
      opec: 'opec',
      coated: 'coated',
      'installment account': 'installAccount',
      'opec ticket': 'ticket',
      'over appraisal': 'overappraisal',
      fake: 'sakoCommodity',
      hmo: 'C_HMO',
      'other deductions': 'sakoPrime',
      'ispd insurance': 'deductionAmount1',
      'opec support': 'canteen',
      'ml fund regular': 'mlfund_regular',
      'ml fund comakership': 'mlfund_comakership',
      'ml fund jewelry': 'mlfund_jewelry',
      'ml fund opi': 'mlfund_opi',
      'ml fund pcl': 'mlfund_pcl',
      'ml fund emergency': 'mlfund_emergency',
      'ml fund all buyout': 'mlfund_all_buyout',
      'ml fund bday': 'mlfund_bday',
      'ml fund ssl': 'mlfund_ssl',
      'motor loan': 'sakoPettycash',
      'sako all buyout': 'sako_buyout',
      'withholding tax': 'incomeTax',
      mortuary: 'sakoProvi',
      'vpo/christmas party': 'cooprecla',
      sako: 'sakoEmergency',
      'sss loan': 'sssLoan',
      'over payments': 'deductionAmount2',
      'total deductions': 'totalDeduction',
      'net pay': 'totalNet',
      region: 'region_name',
      'region name': 'region_name',
      region_name: 'region_name',
    };

    // Create a lookup map for all possible variations
    const normalizedMapping = {};
    Object.keys(columnMapping).forEach((key) => {
      const normalized = key.toLowerCase().trim();
      normalizedMapping[normalized] = columnMapping[key];
    });

    // Get the columns from the first row
    const firstRow = data[0];
    const rawColumns = Object.keys(firstRow);

    const validColumnIndexes = [];
    const mappedColumns = rawColumns.reduce((acc, column, index) => {
      const normalized = column.toLowerCase().trim();
      if (normalizedMapping[normalized]) {
        acc.push(normalizedMapping[normalized]);
        validColumnIndexes.push(index);
        return acc;
      }
      return acc;
    }, []);

    // Log columns that were not mapped (for debugging)
    const ignoredColumns = rawColumns.filter((col, index) => {
      const normalized = col.toLowerCase().trim();
      return !normalizedMapping[normalized];
    });
    if (ignoredColumns.length > 0) {
      console.log('Ignored columns:', ignoredColumns);
    }

    // ===============================
    // COLUMN TYPES FOR PAYROLL TABLE
    // ===============================
    const numericColumns = [
      'managementAllow',
      'travelAllow',
      'bmallow',
      'abmAllow',
      'housingAllow',
      'supervisoryAllow1',
      'supervisoryAllow2',
      'auditorsAllow',
      'basicPay',
      'incomeAmount1',
      'incomeAmount2',
      'gross',
      'leaves',
      'incomeTax',
      'sssLoan',
      'pagibigLoan',
      'opec',
      'installAccount',
      'ticket',
      'sakoProvi',
      'sakoCommodity',
      'sakoPrime',
      'sakoEmergency',
      'sakoPettycash',
      'deductionAmount1',
      'deductionAmount2',
      'C_HMO',
      'totalNet',
      'totalDeduction',
      'nightpremium',
      'non_taxable_allowance',
      'taxable_amount',
      'lates',
      'sako_buyout',
      'monthlyRate',
      'mlfund_pcl',
      'sssContri',
      'pagibigContri',
      'filmaLending',
      'sss_employer',
      'pagibig_employer',
      'philhealth_employer',
      'mlfund_regular',
      'mlfund_comakership',
      'mlfund_jewelry',
      'mlfund_opi',
      'mlfund_pcl',
      'mlfund_emergency',
      'mlfund_all_buyout',
      'mlfund_bday',
      'mlfund_ssl',
      'totalAllow',
      'totalOT',
      'mlFund',
      'deductionwoLateLeave',
      'mancomm_allowance', // ADD THIS
      'managerial_allowance', // ADD THIS
      'positional_allowance', // ADD THIS
      'allow9', // ADD THIS
      'allow10', // ADD THIS
    ];

    const dateColumns = ['dateHired', 'startDate', 'endDate', 'hiredDate'];

    // ===============================
    // HELPER FUNCTIONS
    // ===============================
    function toNumber(val) {
      if (val === null || val === undefined || val === '') return 0;
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    }

    function excelSerialDateToJSDate(serial) {
      const excelStartDate = new Date(1899, 11, 30);
      const date = new Date(excelStartDate.getTime() + (serial + 1) * 86400000);
      return date.toISOString().split('T')[0];
    }

    function parseCustomDate(dateString) {
      if (!dateString) return null;
      const [day, month, year] = dateString.split('/');
      if (day && month && year) {
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      return null;
    }

    function isExcelDate(val) {
      return typeof val === 'number' && val > 30000 && val < 60000;
    }

    // ===============================
    // LOAD BRANCH MAP
    // ===============================
    const [branches] = await defaultConnection.query(
      `SELECT b_branch, b_source, b_boscode, region_code, zone_code, region FROM branch_codes`,
    );

    const branchMap = new Map();
    const regionMap = new Map();

    branches.forEach((b) => {
      branchMap.set(`${b.b_branch}_${b.region}`, b);
      if (!regionMap.has(b.region)) {
        regionMap.set(b.region, b.b_source);
      }
    });

    // ===============================
    // FINAL COLUMNS FOR PAYROLL TABLE
    // ===============================
    const insertColumns = [
      ...mappedColumns,
      'totalAllow',
      'totalOT',
      'mlFund',
      'boscode',
      'region_code',
      'zone_code',
      'region',
      'deductionwoLateLeave',
      'startDate',
      'endDate',
      'office',
    ];

    const updateClause = insertColumns.map((col) => `${col}=VALUES(${col})`).join(', ');

    // ===============================
    // SEPARATE MAPPING FOR PAYROLL_TRANSACTIONS TABLE
    // ===============================
    const transactionMapping = {
      number: 'idno',
      'last name': 'lastname',
      'first name': 'firstname',
      'middle name': 'middlename',
      designation: 'designation',
      'employment type': 'employment_status',
      region: 'region',
      region_name: 'region_description',
      department: 'department',
      branch: 'branch',
      boscode: 'boscode',
      'bank account number': 'account_no',
      'date of appointment': 'hired_date',
      'monthly rate': 'monthly_rate',
      'daily rate': 'daily_rate',
      'no of actual duty': 'actual_duty_days',
      'basic pay': 'basic_pay',
      'management allowance': 'allowance_management',
      'transportation allowance': 'allowance_transportation',
      'supervisory allowance': 'allowance_supervisory',
      'hazard allowance': 'allowance_hazard',
      'housing allowance': 'allowance_housing',
      'location allowance': 'allowance_location',
      'meal allowance': 'allowance_meal',
      'auditor allowance': 'allowance_auditor',
      'coor allowance': 'allowance_coor',
      'single post allowance': 'allowance_single_post',
      'positional allowance': 'allowance_positional',
      'mancomm allowance': 'allowance_mancomm',
      'managerial allowance': 'allowance_managerial',
      totalAllow: 'allowance_total',
      rot: 'ot_rot_amount',
      rdot: 'ot_rdot_amount',
      shot: 'ot_shot_amount',
      lhot: 'ot_lhot_amount',
      erdot: 'ot_erdot_amount',
      eshot: 'ot_eshot_amount',
      elhot: 'ot_elhot_amount',
      'night differential amount': 'ot_nightpremium_amount',
      totalOT: 'ot_total',
      'original pb': 'pb',
      'excess pb': 'excess_pb',
      refund: 'refund',
      'salary adjustment': 'salary_adjustment',
      other_income: 'other_income',
      'gross pay': 'gross',
      lates: 'late',
      'absence amount': 'leave_wo_pay',
      'withholding tax': 'income_tax',
      'sss - ee': 'sss_contribution',
      'sss loan': 'sss_loan',
      'pagibig - ee': 'pagibig_contribution',
      'pagibig loan': 'pagibig_loan',
      'phic - ee': 'philhealth_contribution',
      'ml fund regular': 'mlfund_regular',
      'ml fund comakership': 'mlfund_comakership',
      'ml fund jewelry': 'mlfund_jewelry',
      'ml fund ssl': 'mlfund_ssl',
      'ml fund opi': 'mlfund_opi',
      'ml fund pcl': 'mlfund_pcl',
      'ml fund bday': 'mlfund_bday',
      'ml fund all buyout': 'mlfund_all_buyout',
      'ml fund emergency': 'mlfund_emergency',
      mlFund: 'mlFund_total',
      'motor loan': 'motor_loan',
      mortuary: 'mortuary',
      sako: 'sako',
      eyeglasses: 'eyewear',
      fake: 'fake',

      'ispd insurance': 'ispd_insurance',
      'over payments': 'over_payment',
      other_deduction: 'other_deduction',
      hmo: 'hmo',
      opec: 'opec',
      'opec support': 'opec_support',
      'opec support po cash': 'opec_support_pocash',
      'opec other deductions': 'opec_support_others',
      'opec ticket': 'opec_ticket',

      coated: 'coated',
      'installment account': 'installment_account',
      'over appraisal': 'over_appraisal',
      'vpo/christmas party': 'vpo_xmas_party',
      telecoms: 'telecoms',
      'ml autodeals x ml loans raffle': 'auto_deals',
      'total deductions': 'total_deduction',
      'net pay': 'total_net',
      'non taxable allowance': 'non_taxable_allowance',
      'taxable amount': 'taxable_amount',
      'sss (er + ec)': 'sss_employer',
      pagibig: 'pagibig_employer',
      philheath: 'philhealth_employer',
    };

    const batchSize = 300;

    // ===============================
    // INSERT LOOP
    // ===============================
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const values = [];
      const transactionBatch = [];

      const placeholders = batch.map((row) => {
        // Convert all numeric fields to 0 if blank
        numericColumns.forEach((col) => {
          const rawKey = Object.keys(row).find((k) => {
            const normalized = k.toLowerCase().trim();
            return normalized === col.toLowerCase();
          });
          if (rawKey) row[rawKey] = toNumber(row[rawKey]);
        });

        // Handle specific columns for payroll table
        const totalDeductionKey = Object.keys(row).find(
          (k) =>
            k.toLowerCase().trim() === 'total deductions' ||
            k.toLowerCase().trim() === 'total deduction',
        );
        const totalDeduction = totalDeductionKey ? toNumber(row[totalDeductionKey]) : 0;

        const latesKey = Object.keys(row).find((k) => k.toLowerCase().trim() === 'lates');
        const lates = latesKey ? toNumber(row[latesKey]) : 0;

        const actualLates = lates;

        const leavesKey = Object.keys(row).find(
          (k) => k.toLowerCase().trim() === 'absence amount' || k.toLowerCase().trim() === 'leaves',
        );
        const leaves = leavesKey ? toNumber(row[leavesKey]) : 0;

        const undertimeKey = Object.keys(row).find((k) => k.toLowerCase().trim() === 'undertime');
        const undertime = undertimeKey ? toNumber(row[undertimeKey]) : 0;

        // Update lates with undertime
        if (latesKey) {
          row[latesKey] = lates + undertime;
        } else {
          row['lates'] = lates + undertime;
        }

        // Calculate deduction without late/leave
        let deductionwoLateLeave = totalDeduction - (lates + leaves + undertime);

        // -----------------------------
        // PAG-IBIG EE + Additional
        // -----------------------------
        const pagibigEeKey = Object.keys(row).find(
          (k) => k.toLowerCase().trim() === 'pagibig - ee',
        );

        const pagibigAdditionalKey = Object.keys(row).find(
          (k) => k.toLowerCase().trim() === 'pg contribution additional',
        );

        const pagibigEe = pagibigEeKey ? toNumber(row[pagibigEeKey]) : 0;
        const pagibigAdditional = pagibigAdditionalKey ? toNumber(row[pagibigAdditionalKey]) : 0;

        const totalPagibigContribution = pagibigEe + pagibigAdditional;

        if (pagibigEeKey) {
          row[pagibigEeKey] = totalPagibigContribution;
        }

        if (!Number.isFinite(deductionwoLateLeave)) {
          deductionwoLateLeave = 0;
        }
        deductionwoLateLeave = Number(deductionwoLateLeave.toFixed(4));

        if (deductionwoLateLeave > 999999.9999) deductionwoLateLeave = 999999.9999;
        if (deductionwoLateLeave < -999999.9999) deductionwoLateLeave = -999999.9999;
        if (deductionwoLateLeave < 0) deductionwoLateLeave = 0;
        console.log(allowColumns);
        // Compute totalAllow
        row.totalAllow = allowColumns.reduce((sum, col) => {
          const rawKey = Object.keys(row).find((k) => {
            const normalized = k.toLowerCase().trim();
            return normalized === col.toLowerCase();
          });
          return sum + (rawKey ? toNumber(row[rawKey]) : 0);
        }, 0);

        // Compute totalOT
        row.totalOT = otColumns.reduce((sum, col) => {
          const rawKey = Object.keys(row).find((k) => {
            const normalized = k.toLowerCase().trim();
            return normalized === col.toLowerCase();
          });
          return sum + (rawKey ? toNumber(row[rawKey]) : 0);
        }, 0);

        // Compute mlFund
        row.mlFund = mlFundColumns.reduce((sum, col) => {
          const rawKey = Object.keys(row).find((k) => {
            const normalized = k.toLowerCase().trim();
            return normalized === col.toLowerCase();
          });
          return sum + (rawKey ? toNumber(row[rawKey]) : 0);
        }, 0);

        // Map row values for payroll table
        const rowValues = validColumnIndexes.map((colIndex) => {
          const originalColumn = rawColumns[colIndex];
          const mappedColumn = mappedColumns[validColumnIndexes.indexOf(colIndex)];

          let value;
          if (mappedColumn === 'lates') {
            const latesKeyInRow = Object.keys(row).find((k) => k.toLowerCase().trim() === 'lates');
            value = latesKeyInRow ? row[latesKeyInRow] : row[originalColumn];
          } else {
            value = row[originalColumn];
          }

          if (numericColumns.includes(mappedColumn)) {
            return toNumber(value);
          }

          if (dateColumns.includes(mappedColumn)) {
            if (!value) return null;

            return isNaN(value) ? parseCustomDate(value) : excelSerialDateToJSDate(value);
          }

          return typeof value === 'string' ? value.trim() : value;
        });

        // Add computed fields
        rowValues.push(row.totalAllow, row.totalOT, row.mlFund);

        // Branch lookup
        const branchKey = Object.keys(row).find((k) => {
          const normalized = k.toLowerCase().trim();
          return normalized === 'branch';
        });
        const branchValue = branchKey
          ? typeof row[branchKey] === 'string'
            ? row[branchKey].trim()
            : row[branchKey] || ''
          : '';

        const regionKey = Object.keys(row).find((k) => {
          const normalized = k.toLowerCase().trim();
          return (
            normalized === 'region' || normalized === 'region name' || normalized === 'region_name'
          );
        });
        const regionValue = regionKey
          ? typeof row[regionKey] === 'string'
            ? row[regionKey].trim() // Added .trim() here
            : row[regionKey] || ''
          : '';

        const key = `${branchValue}_${regionValue}`;
        const branchInfo = branchMap.get(key) || {};
        const sourceFromRegion = regionMap.get(regionValue);

        rowValues.push(
          branchInfo.b_boscode || null,
          branchInfo.region_code || null,
          branchInfo.zone_code || null,
          sourceFromRegion ?? regionValue,
        );

        rowValues.push(deductionwoLateLeave, startDate, endDate, office);

        values.push(...rowValues);

        // ===============================
        // BUILD TRANSACTION RECORD (FIXED - NO region_name)
        // ===============================
        const transactionRecord = {};

        // Map all fields from the row data to transaction table
        Object.keys(transactionMapping).forEach((sourceField) => {
          const targetField = transactionMapping[sourceField];

          let value = null;

          // Check if it's a computed field
          if (sourceField === 'totalAllow') {
            value = row.totalAllow;
          } else if (sourceField === 'totalOT') {
            value = row.totalOT;
          } else if (sourceField === 'mlFund') {
            value = row.mlFund;
          } else if (sourceField === 'office') {
            value = office;
          } else if (sourceField === 'startDate' || sourceField === 'endDate') {
            value = sourceField === 'startDate' ? startDate : endDate;
          } else if (sourceField === 'boscode') {
            value = branchInfo.b_boscode || null;
          } else if (sourceField === 'region') {
            value = sourceFromRegion ?? regionValue;
          } else {
            if (sourceField === 'lates') {
              value = actualLates;
            } else {
              const sourceKey = Object.keys(row).find(
                (k) => k.toLowerCase().trim() === sourceField.toLowerCase(),
              );

              if (sourceKey) {
                value = row[sourceKey];
              }
            }
          }

          const transactionDateFields = ['hired_date', 'start_date', 'end_date'];

          if (transactionDateFields.includes(targetField)) {
            if (value) {
              const num = Number(value);

              if (!isNaN(num)) {
                value = excelSerialDateToJSDate(num);
              } else {
                value = parseCustomDate(value);
              }
            } else {
              value = null;
            }
          }

          if (value !== null && value !== undefined) {
            transactionRecord[targetField] = value;
          }
        });

        // Add required fields
        transactionRecord.start_date = startDate;
        transactionRecord.end_date = endDate;
        transactionRecord.office = office;

        // Add region_description (NOT region_name) - with trimming
        const regionDescKey = Object.keys(row).find(
          (k) =>
            k.toLowerCase().trim() === 'region' ||
            k.toLowerCase().trim() === 'region name' ||
            k.toLowerCase().trim() === 'region_name',
        );
        if (regionDescKey) {
          const regionValue = row[regionDescKey];
          transactionRecord.region_description =
            typeof regionValue === 'string' ? regionValue.trim() : regionValue;
        }

        // Add extra fields
        const excessPbKey = Object.keys(row).find((k) => k.toLowerCase().trim() === 'excess pb');
        if (excessPbKey) {
          transactionRecord.excess_pb = toNumber(row[excessPbKey]);
        }

        const salaryAdjKey = Object.keys(row).find(
          (k) => k.toLowerCase().trim() === 'salary adjustment',
        );
        if (salaryAdjKey) {
          transactionRecord.salary_adjustment = toNumber(row[salaryAdjKey]);
        }

        if (undertimeKey) {
          transactionRecord.undertime = undertime;
        }

        if (leavesKey) {
          transactionRecord.absence_wo_pay = leaves;
        }

        transactionBatch.push(transactionRecord);

        return `(${new Array(insertColumns.length).fill('?').join(',')})`;
      });

      // Insert into payroll table
      const sql = `
        INSERT INTO ${payrollTable} (${insertColumns.join(',')})
        VALUES ${placeholders.join(',')}
        ON DUPLICATE KEY UPDATE ${updateClause}
      `;

      await connection.query(sql, values);

      // ===============================
      // INSERT INTO PAYROLL_TRANSACTIONS TABLE
      // ===============================
      for (const record of transactionBatch) {
        const columns = Object.keys(record);
        const placeholders = columns.map(() => '?').join(',');
        const valuesArray = Object.values(record);

        // Add created_at column with JavaScript date
        const columnsWithTimestamp = [...columns, 'created_at'];
        const placeholdersWithTimestamp = columns.map(() => '?').join(',') + ', ?';
        const currentTimestamp = new Date();
        const valuesWithTimestamp = [...valuesArray, currentTimestamp];

        const transSql = `
    INSERT INTO payroll_transactions (${columnsWithTimestamp.join(',')})
    VALUES (${placeholdersWithTimestamp})
  `;
        await defaultConnection.query(transSql, valuesWithTimestamp);
      }
    }

    // Commit both transactions
    await connection.commit();
    await defaultConnection.commit();

    connection.release();
    defaultConnection.release();
    return '✅ Bulk import successful.';
  } catch (error) {
    // Rollback both transactions
    await connection.rollback();
    await defaultConnection.rollback();

    connection.release();
    defaultConnection.release();
    console.error('IMPORT ERROR:', error);
    throw error;
  }
};

// exports.insertData = async (
//   data,
//   office,
//   startDate,
//   endDate,
//   mlFundColumns,
//   allowColumns,
//   otColumns,
// // ) => {
//   const payrollInfo = getPayrollFolder(office);
//   const payrollTable = payrollInfo.tableName + new Date(endDate).getFullYear();

//   const dbPool = utilitiesModel.getDbPool(office);
//   const defaultPool = utilitiesModel.getDbPool('default');

//   if (!data || data.length === 0) {
//     throw new Error('No data found in file');
//   }

//   const connection = await dbPool.getConnection();
//   const defaultConnection = await defaultPool.getConnection('default');

//   try {
//     await connection.beginTransaction();

//     // // Step 1: Delete existing records for the same region and endDate
//     // await connection.query(
//     //   `DELETE FROM ${payrollTable} WHERE office = ? AND endDate = ?`,
//     //   [office, endDate], // Assuming `Region` in the data corresponds to the `region` field in the DB
//     // );

//     // Step 1: collect unique regions from incoming data
//     const regions = [
//       ...new Set(
//         data
//           .map((row) => (typeof row['Region'] === 'string' ? row['Region'].trim() : row['Region']))
//           .filter((r) => r), // remove null/undefined/empty
//       ),
//     ];

//     // Step 2: delete per region
//     if (regions.length > 0) {
//       const placeholders = regions.map(() => '?').join(',');

//       await connection.query(
//         `DELETE FROM ${payrollTable}
//      WHERE office = ?
//      AND endDate = ?
//      AND region_name IN (${placeholders})`,
//         [office, endDate, ...regions],
//       );
//     }
//     console.log(regions);
//     const columnMapping = {
//       Number: 'idno',
//       Department: 'department',
//       Branch: 'branch',
//       'First Name': 'firstName',
//       'Last Name': 'lastName',
//       Designation: 'designation',
//       'Employment Type': 'employmentStatus',
//       'Date Of Appointment': 'dateHired',
//       'Bank Account Number': 'mobileno',
//       'Monthly Rate': 'monthlyRate',
//       'Daily Rate': 'dailyrate',
//       'No of Actual Duty': 'no_of_actual_duty',
//       'BASIC PAY': 'basicPay',
//       ROT: 'otordinary',
//       RDOT: 'rdot',
//       SHOT: 'otspecial',
//       ERDOT: 'otexcsholiday',
//       ESHOT: 'otexcsspecial',
//       'Night Differential Amount': 'nightpremium',
//       'HAZARD ALLOWANCE': 'abmAllow',
//       'HOUSING ALLOWANCE': 'housingAllow',
//       'MANAGEMENT ALLOWANCE': 'managementAllow',
//       'TRANSPORTATION ALLOWANCE': 'travelAllow',
//       'SUPERVISORY ALLOWANCE': 'bmallow',
//       'AUDITOR ALLOWANCE': 'auditorsAllow',
//       PB: 'incomeAmount1',
//       'OTHER INCOME': 'incomeAmount2',
//       'Non Taxble Allowance': 'non_taxable_allowance',
//       'GROSS PAY': 'gross',
//       'TAXABLE AMOUNT': 'taxable_amount',
//       'ABSENCE AMOUNT': 'leaves',
//       lates: 'lates',
//       'PAGIBIG LOAN': 'pagibigLoan',
//       'PAGIBIG - EE': 'pagibigContri',
//       'PHIC - EE': 'filmaLending',
//       'SSS - EE': 'sssContri',
//       'SSS (ER + EC)': 'sss_employer',
//       PAGIBIG: 'pagibig_employer',
//       PHILHEATH: 'philhealth_employer',
//       OPEC: 'opec',
//       COATED: 'coated',
//       'INSTALLMENT ACCOUNT': 'installAccount',
//       'OPEC TICKET': 'ticket',
//       'OVER APPRAISAL': 'overappraisal',
//       FAKE: 'sakoCommodity',
//       HMO: 'C_HMO',
//       'OTHER DEDUCTIONS': 'sakoPrime',
//       'ISPD Insurance': 'deductionAmount1',
//       'OPEC SUPPORT': 'canteen',
//       'ML Fund Regular': 'mlfund_regular',
//       'ML Fund Comakership': 'mlfund_comakership',
//       'ML Fund Jewelry': 'mlfund_jewelry',
//       'ML Fund OPI': 'mlfund_opi',
//       'ML Fund PCL': 'mlfund_pcl',
//       'ML Fund Emergency': 'mlfund_emergency',
//       'ML Fund ALL Buyout': 'mlfund_all_buyout',
//       'ML Fund Bday': 'mlfund_bday',
//       'ML Fund SSL': 'mlfund_ssl',
//       'MOTOR LOAN': 'sakoPettycash',
//       'SAKO ALL BUYOUT': 'sako_buyout',
//       'Withholding Tax': 'incomeTax',
//       MORTUARY: 'sakoProvi',
//       'VPO/CHRISTMAS PARTY': 'cooprecla',
//       SAKO: 'sakoEmergency',
//       'SSS LOAN': 'sssLoan',
//       'OVER PAYMENTS': 'deductionAmount2',
//       'Total Deductions': 'totalDeduction',
//       'NET PAY': 'totalNet',
//       Region: 'region_name',
//     };

//     const normalizedMapping = {};
//     Object.keys(columnMapping).forEach((key) => {
//       normalizedMapping[normalizeHeader(key)] = columnMapping[key];
//     });

//     const rawColumns = Object.keys(data[0]);

//     const validColumnIndexes = [];
//     const mappedColumns = rawColumns.reduce((acc, column, index) => {
//       const normalized = normalizeHeader(column);
//       if (normalizedMapping[normalized]) {
//         acc.push(normalizedMapping[normalized]);
//         validColumnIndexes.push(index);
//       }
//       return acc;
//     }, []);

//     const numericColumns = [
//       'managementAllow',
//       'travelAllow',
//       'abmAllow',
//       'housingAllow',
//       'basicPay',
//       'incomeAmount1',
//       'incomeAmount2',
//       'gross',
//       'leaves',
//       'incomeTax',
//       'sssLoan',
//       'pagibigLoan',
//       'opec',
//       'installAccount',
//       'ticket',
//       'sakoProvi',
//       'sakoCommodity',
//       'sakoPrime',
//       'sakoEmergency',
//       'sakoPettycash',
//       'deductionAmount1',
//       'deductionAmount2',
//       'C_HMO',
//       'totalNet',
//       'totalDeduction',
//       'nightpremium',
//       'non_taxable_allowance',
//       'taxable_amount',
//       'lates',
//       'sako_buyout',
//       'monthlyRate',
//       'mlfund_pcl',
//     ];

//     const dateColumns = ['dateHired', 'startDate', 'endDate'];

//     function toNumber(val) {
//       if (val === null || val === undefined || val === '') return 0;
//       const num = Number(val);
//       return isNaN(num) ? 0 : num;
//     }

//     const [branches] = await defaultConnection.query(
//       `SELECT b_branch, b_source, b_boscode, region_code, zone_code, region FROM branch_codes`,
//     );
//     defaultConnection.release();
//     // const [branches] = await connection.query(
//     //   `SELECT b_branch, b_source, b_boscode, region_code, zone_code, region FROM brvismin_luz`,
//     // );

//     const branchMap = new Map();
//     const regionMap = new Map();

//     branches.forEach((b) => {
//       branchMap.set(`${b.b_branch}_${b.region}`, b);
//       if (!regionMap.has(b.region)) {
//         regionMap.set(b.region, b.b_source);
//       }
//     });

//     const insertColumns = [
//       ...mappedColumns,
//       'totalAllow',
//       'totalOT',
//       'mlFund',
//       'boscode',
//       'region_code',
//       'zone_code',
//       'region',
//       'deductionwoLateLeave',
//       'startDate',
//       'endDate',
//       'office',
//     ];

//     const updateClause = insertColumns.map((col) => `${col}=VALUES(${col})`).join(', ');

//     const batchSize = 300;

//     for (let i = 0; i < data.length; i += batchSize) {
//       const batch = data.slice(i, i + batchSize);
//       const values = [];

//       const placeholders = batch.map((row) => {
//         numericColumns.forEach((col) => {
//           const rawKey = Object.keys(row).find((k) => normalizeHeader(k) === col);
//           if (rawKey) row[rawKey] = toNumber(row[rawKey]);
//         });

//         // ✅ safer header handling
//         const totalDeduction = toNumber(row['Total Deductions'] ?? row['TOTAL DEDUCTIONS']);
//         const lates = toNumber(row['LATES'] ?? row['lates']);
//         const leaves = toNumber(row['ABSENCE AMOUNT']);
//         const undertime = toNumber(row['UNDERTIME']);

//         row['LATES'] = lates + undertime;

//         // ✅ no rounding yet
//         let deductionwoLateLeave = totalDeduction - (lates + leaves + undertime);

//         // ✅ sanitize for DECIMAL(10,4)
//         if (!Number.isFinite(deductionwoLateLeave)) {
//           deductionwoLateLeave = 0;
//         }

//         deductionwoLateLeave = Number(deductionwoLateLeave.toFixed(4));

//         if (deductionwoLateLeave > 999999.9999) deductionwoLateLeave = 999999.9999;
//         if (deductionwoLateLeave < -999999.9999) deductionwoLateLeave = -999999.9999;

//         // if column is UNSIGNED
//         if (deductionwoLateLeave < 0) deductionwoLateLeave = 0;

//         row.totalAllow = allowColumns.reduce((sum, col) => sum + toNumber(row[col]), 0);

//         row.totalOT = otColumns.reduce((sum, col) => sum + toNumber(row[col]), 0);

//         row.mlFund = mlFundColumns.reduce((sum, col) => sum + toNumber(row[col]), 0);

//         const rowValues = validColumnIndexes.map((colIndex, i) => {
//           const originalColumn = rawColumns[colIndex];
//           const mappedColumn = mappedColumns[i];

//           let value = row[originalColumn];

//           if (numericColumns.includes(mappedColumn)) return toNumber(value);

//           if (dateColumns.includes(mappedColumn) || isExcelDate(value)) {
//             if (!value) return null;
//             return isNaN(value) ? parseCustomDate(value) : excelSerialDateToJSDate(value);
//           }

//           return typeof value === 'string' ? value.trim() : value;
//         });

//         rowValues.push(row.totalAllow, row.totalOT, row.mlFund);

//         const branchValue =
//           typeof row['Branch'] === 'string' ? row['Branch'].trim() : row['Branch'] || '';

//         const regionValue =
//           typeof row['Region'] === 'string' ? row['Region'].trim() : row['Region'] || '';

//         const key = `${branchValue}_${regionValue}`;
//         const branchInfo = branchMap.get(key) || {};
//         const sourceFromRegion = regionMap.get(regionValue);

//         rowValues.push(
//           branchInfo.b_boscode || null,
//           branchInfo.region_code || null,
//           branchInfo.zone_code || null,
//           sourceFromRegion ?? regionValue,
//         );

//         // ✅ push SAFE value
//         rowValues.push(deductionwoLateLeave, startDate, endDate, office);

//         values.push(...rowValues);

//         return `(${new Array(insertColumns.length).fill('?').join(',')})`;
//       });

//       const sql = `
//         INSERT INTO ${payrollTable} (${insertColumns.join(',')})
//         VALUES ${placeholders.join(',')}
//         ON DUPLICATE KEY UPDATE ${updateClause}
//       `;

//       await connection.query(sql, values);
//     }

//     await connection.commit();
//     connection.release();
//     return '✅ Bulk import successful.';
//   } catch (error) {
//     await connection.rollback();
//     connection.release();
//     console.error('IMPORT ERROR:', error);
//     throw error;
//   }
// };

// START INSERT DATA 04172026
// // ===============================
// // MAIN FUNCTION
// // ===============================

// exports.insertData = async (
//   data,
//   office,
//   startDate,
//   endDate,
//   mlFundColumns,
//   allowColumns,
//   otColumns,
// ) => {
//   //console.log(typeof office, office);
//   const payrollInfo = getPayrollFolder(office);
//   const payrollTable = payrollInfo.tableName + new Date(endDate).getFullYear();

//   const dbPool = utilitiesModel.getDbPool(office);
//   if (!data || data.length === 0) {
//     throw new Error("No data found in file");
//   }

//   const connection = await dbPool.getConnection();

//   try {
//     await connection.beginTransaction();

//     // ===============================
//     // COLUMN MAPPING
//     // ===============================
//     const columnMapping = {
//       // startDate: "startDate",
//       // endDate: "endDate",
//       Number: "idno",
//       Department: "department",
//       Branch: "branch",
//       "First Name": "firstName",
//       "Last Name": "lastName",
//       Designation: "designation",
//       "Employment Type": "employmentStatus",
//       "Date Of Appointment": "dateHired",
//       "Bank Account Number": "mobileno",
//       "Monthly Rate": "monthlyRate",
//       "Daily Rate": "dailyrate",
//       "No of Actual Duty": "no_of_actual_duty",

//       // basic rate
//       "BASIC PAY": "basicPay",

//       // overtime
//       ROT: "otordinary",
//       RDOT: "rdot",
//       SHOT: "otspecial",
//       ERDOT: "otexcsholiday",
//       ESHOT: "otexcsspecial",
//       "Night Differential Amount": "nightpremium",

//       // allowances
//       "HAZARD ALLOWANCE": "abmAllow",
//       "HOUSING ALLOWANCE": "housingAllow",
//       "MANAGEMENT ALLOWANCE": "managementAllow",
//       "TRANSPORTATION ALLOWANCE": "travelAllow",
//       "SUPERVISORY ALLOWANCE": "bmallow",
//       "AUDITOR ALLOWANCE": "auditorsAllow",

//       // other income
//       PB: "incomeAmount1",
//       "OTHER INCOME": "incomeAmount2",

//       "Non Taxble Allowance": "non_taxable_allowance",

//       "GROSS PAY": "gross",

//       // deductions
//       "TAXABLE AMOUNT": "taxable_amount",
//       "ABSENCE AMOUNT": "leaves",
//       lates: "lates",

//       "PAGIBIG LOAN": "pagibigLoan",
//       "PAGIBIG - EE": "pagibigContri",
//       "PHIC - EE": "filmaLending",
//       "SSS - EE": "sssContri",
//       "SSS (ER + EC)": "sss_employer",
//       PAGIBIG: "pagibig_employer",
//       PHILHEATH: "philhealth_employer",
//       OPEC: "opec",
//       COATED: "coated",
//       "INSTALLMENT ACCOUNT": "installAccount",
//       "OPEC TICKET": "ticket",
//       "OVER APPRAISAL": "overappraisal",
//       FAKE: "sakoCommodity",
//       HMO: "C_HMO",
//       "OTHER DEDUCTIONS": "sakoPrime",
//       "ISPD Insurance": "deductionAmount1",
//       "OPEC SUPPORT": "canteen",
//       "ML Fund Regular": "mlfund_regular",
//       "ML Fund Comakership": "mlfund_comakership",
//       "ML Fund Jewelry": "mlfund_jewelry",
//       "ML Fund OPI": "mlfund_opi",
//       "ML Fund PCL": "mlfund_pcl",
//       "ML Fund Emergency": "mlfund_emergency",
//       "ML Fund ALL Buyout": "mlfund_all_buyout",
//       "ML Fund Bday": "mlfund_bday",
//       "ML Fund SSL": "mlfund_ssl",
//       "MOTOR LOAN": "sakoPettycash",
//       "SAKO ALL BUYOUT": "sako_buyout",
//       "Withholding Tax": "incomeTax",
//       MORTUARY: "sakoProvi",
//       "VPO/CHRISTMAS PARTY": "cooprecla",
//       SAKO: "sakoEmergency",
//       "SSS LOAN": "sssLoan",
//       "OVER PAYMENTS": "deductionAmount2",
//       "Total Deductions": "totalDeduction",

//       "NET PAY": "totalNet",
//     };

//     // ===============================
//     // NORMALIZE MAPPING
//     // ===============================
//     const normalizedMapping = {};
//     Object.keys(columnMapping).forEach((key) => {
//       normalizedMapping[normalizeHeader(key)] = columnMapping[key];
//     });

//     const rawColumns = Object.keys(data[0]);
//     //console.log("RAW HEADERS:", rawColumns);

//     const ignoredColumns = rawColumns.filter((col) => {
//       const normalized = normalizeHeader(col);
//       return !normalizedMapping[normalized];
//     });
//     //console.log("IGNORED COLUMNS:", ignoredColumns);

//     // ===============================
//     // FILTER ONLY MAPPED COLUMNS
//     // ===============================
//     const validColumnIndexes = [];
//     const mappedColumns = rawColumns.reduce((acc, column, index) => {
//       const normalized = normalizeHeader(column);
//       if (normalizedMapping[normalized]) {
//         acc.push(normalizedMapping[normalized]);
//         validColumnIndexes.push(index);
//       }
//       return acc;
//     }, []);

//     // ===============================
//     // COLUMN TYPES
//     // ===============================
//     const numericColumns = [
//       "managementAllow",
//       "travelAllow",
//       "abmAllow",
//       "housingAllow",
//       "basicPay",
//       "incomeAmount1",
//       "incomeAmount2",
//       "gross",
//       "leaves",
//       "incomeTax",
//       "sssLoan",
//       "pagibigLoan",
//       "opec",
//       "installAccount",
//       "ticket",
//       "sakoProvi",
//       "sakoCommodity",
//       "sakoPrime",
//       "sakoEmergency",
//       "sakoPettycash",
//       "deductionAmount1",
//       "deductionAmount2",
//       "C_HMO",
//       "totalNet",
//       "totalDeduction",
//       "nightpremium",
//       "non_taxable_allowance",
//       "taxable_amount",
//       "lates",
//       "sako_buyout",
//       "monthlyRate",
//       "mlfund_pcl",
//     ];

//     const dateColumns = ["dateHired", "startDate", "endDate"];

//     // ===============================
//     // HELPER: Convert blanks to 0
//     // ===============================
//     function toNumber(val) {
//       if (val === null || val === undefined || val === "") return 0;
//       const num = Number(val);
//       return isNaN(num) ? 0 : num;
//     }

//     // ===============================
//     // LOAD BRANCH MAP
//     // ===============================
//     const [branches] = await connection.query(
//       `SELECT b_branch, b_source, b_boscode, region_code, zone_code, region FROM brvismin_luz`,
//     );

//     const branchMap = new Map();
//     const regionMap = new Map();
//     //console.log(branches);
//     branches.forEach((b) => {
//       branchMap.set(`${b.b_branch}_${b.region}`, b);

//       // 👇 NEW: region-only mapping for b_source
//       if (!regionMap.has(b.region)) {
//         regionMap.set(b.region, b.b_source);
//       }
//     });

//     // ===============================
//     // FINAL COLUMNS
//     // ===============================
//     const insertColumns = [
//       ...mappedColumns,
//       "totalAllow",
//       "totalOT",
//       "mlFund",
//       "boscode",
//       "region_code",
//       "zone_code",
//       "region",
//       "deductionwoLateLeave",
//       "startDate",
//       "endDate",
//       "office",
//     ];

//     const updateClause = insertColumns
//       .map((col) => `${col}=VALUES(${col})`)
//       .join(", ");

//     // const totalMLFundColumns = [
//     //   "ML FUND Regular",
//     //   "ML Fund Comakership",
//     //   "ML Fund Jewelry",
//     //   "ML Fund OPI",
//     //   "ML FUND PCL",
//     //   "ML FUND Emergency",
//     // ];

//     // const totalAllowColumns = [
//     //   "HAZARD ALLOWANCE",
//     //   "HOUSING ALLOWANCE",
//     //   "MANAGEMENT ALLOWANCE",
//     //   "TRANSPORTATION ALLOWANCE",
//     //   "SUPERVISORY ALLOWANCE",
//     //   "MEAL ALLOWANCE",
//     //   "COOR ALLOWANCE",
//     //   "AUDITOR ALLOWANCE",
//     //   "MANAGERIAL ALLOWANCE",
//     //   "POSITIONAL ALLOWANCE",
//     //   "SUPERVISORY ALLOWANCE",
//     //   "MANCOMM ALLOWANCE",
//     // ];

//     // const totalOTColumns = [
//     //   "ROT",
//     //   "RDOT",
//     //   "SHOT",
//     //   "ERDOT",
//     //   "ESHOT",
//     //   "Night Differential Amount",
//     // ];

//     const batchSize = 300;

//     // ===============================
//     // INSERT LOOP
//     // ===============================
//     for (let i = 0; i < data.length; i += batchSize) {
//       const batch = data.slice(i, i + batchSize);
//       const values = [];

//       const placeholders = batch.map((row) => {
//         // Convert all numeric fields to 0 if blank
//         numericColumns.forEach((col) => {
//           const rawKey = Object.keys(row).find(
//             (k) => normalizeHeader(k) === col,
//           );
//           if (rawKey) row[rawKey] = toNumber(row[rawKey]);
//         });

//         // Compute deductionwoLateLeave
//         const totalDeduction = row["Total Deductions"] || 0;
//         const lates = row["LATES"] || 0;
//         const leaves = row["ABSENCE AMOUNT"] || 0;
//         const undertime = row["UNDERTIME"] || 0;
//         row["LATES"] = lates + undertime;

//         row.deductionwoLateLeave =
//           totalDeduction - (lates + leaves + undertime);

//         // Compute totalAllow
//         row.totalAllow = allowColumns.reduce(
//           (sum, col) => sum + toNumber(row[col]),
//           0,
//         );

//         // Compute totalOT
//         row.totalOT = otColumns.reduce(
//           (sum, col) => sum + toNumber(row[col]),
//           0,
//         );

//         row.mlFund = mlFundColumns.reduce(
//           (sum, col) => sum + toNumber(row[col]),
//           0,
//         );

//         // Map row values
//         const rowValues = validColumnIndexes.map((colIndex, i) => {
//           const originalColumn = rawColumns[colIndex];
//           const mappedColumn = mappedColumns[i];

//           let value = row[originalColumn];

//           if (numericColumns.includes(mappedColumn)) return toNumber(value);

//           if (dateColumns.includes(mappedColumn) || isExcelDate(value)) {
//             if (!value) return null;
//             return isNaN(value)
//               ? parseCustomDate(value)
//               : excelSerialDateToJSDate(value);
//           }

//           return typeof value === "string" ? value.trim() : value;
//         });

//         // Add computed fields
//         rowValues.push(row.totalAllow, row.totalOT, row.mlFund);

//         // Branch lookup
//         const branchValue =
//           typeof row["Branch"] === "string"
//             ? row["Branch"].trim()
//             : row["Branch"] || "";

//         const regionValue =
//           typeof row["Region"] === "string"
//             ? row["Region"].trim()
//             : row["Region"] || "";
//         const key = `${branchValue}_${regionValue}`;
//         //console.log("key: ", key);
//         const branchInfo = branchMap.get(key) || {};

//         const sourceFromRegion = regionMap.get(regionValue);

//         rowValues.push(
//           branchInfo.b_boscode || null,
//           branchInfo.region_code || null,
//           branchInfo.zone_code || null,
//           sourceFromRegion ?? regionValue,
//         );

//         rowValues.push(row.deductionwoLateLeave, startDate, endDate, office);

//         values.push(...rowValues);

//         return `(${new Array(insertColumns.length).fill("?").join(",")})`;
//       });

//       const sql = `
//         INSERT INTO payroll_test (${insertColumns.join(",")})
//         VALUES ${placeholders.join(",")}
//         ON DUPLICATE KEY UPDATE ${updateClause}
//       `;

//       await connection.query(sql, values);
//     }

//     await connection.commit();
//     connection.release();
//     return "✅ Bulk import successful.";
//   } catch (error) {
//     await connection.rollback();
//     connection.release();
//     console.error("IMPORT ERROR:", error);
//     throw error;
//   }
// };
// // END INSERT DATA 04172026

// exports.insertData = async (data, office, endDate) => {
//   console.log(typeof office, office);
//   const payrollInfo = getPayrollFolder(office);
//   const payrollTable = payrollInfo.tableName + new Date(endDate).getFullYear();

//   const dbPool = utilitiesModel.getDbPool(office);
//   if (!data || data.length === 0) {
//     throw new Error("No data found in file");
//   }

//   //const connection = await db.promise().getConnection();
//   const connection = await dbPool.getConnection();

//   try {
//     await connection.beginTransaction();

//     // ===============================
//     // COLUMN MAPPING
//     // ===============================
//     const columnMapping = {
//       startDate: "startDate",
//       endDate: "endDate",
//       Number: "idno",
//       region: "region",
//       department: "department",
//       branch: "branch",
//       "First Name": "firstName",
//       "Last Name": "lastName",
//       Designation: "designation",
//       "Employment Type": "employmentStatus",
//       "Date Of Appointment": "dateHired",
//       "Bank Account Number": "mobileno",
//       "Monthly Rate": "monthlyrate",
//       "Daily Rate": "dailyrate",
//       "No of Actual Duty": "no_of_actual_duty",

//       // basic rate
//       "BASIC PAY": "basicPay",

//       //overtime
//       ROT: "otordinary",
//       RDOT: "rdot",
//       SHOT: "otspecial",
//       ERDOT: "otexcsholiday",
//       ESHOT: "otexcsspecial",
//       "Night Differential Amount": "nightpremium",

//       //allowances
//       "HAZARD ALLOWANCE": "abmAllow",
//       "HOUSING ALLOWANCE": "housingAllow",
//       "MANAGEMENT ALLOWANCE": "managementAllow",
//       "TRANSPORTATION ALLOWANCE": "travelAllow",
//       "SUPERVISORY ALLOWANCE": "bmallow",
//       "AUDITOR ALLOWANCE": "auditorsAllow",

//       //other income
//       PB: "incomeAmount1",
//       "OTHER INCOME": "incomeAmount2",

//       "Non Taxble Allowance": "non_taxable_allowance",

//       "GROSS PAY": "gross",

//       //deductions
//       "TAXABLE AMOUNT": "taxable_amount",
//       "ABSENCE AMOUNT": "leaves",
//       lates: "lates",
//       "ML FUND Regular": "mlfund_regular",
//       "PAGIBIG LOAN": "pagibigLoan",
//       OPEC: "opec",
//       COATED: "coated",
//       "INSTALLMENT ACCOUNT": "installAccount",
//       "OPEC TICKET": "ticket",
//       "OVER APPRAISAL": "overappraisal",
//       FAKE: "sakoCommodity",
//       HMO: "C_HMO",
//       "OTHER DEDUCTIONS": "sakoPrime",
//       "ISPD Insurance": "deductionAmount1",
//       "OPEC SUPPORT": "canteen",
//       "ML Fund Comakership": "mlfund_comakership",
//       "ML Fund Jewelry": "mlfund_jewelry",
//       "ML Fund OPI": "mlfund_opi",
//       "ML FUND PCL": "mlfund_pcl",
//       "ML FUND Emergency": "mlfund_emergency",
//       "MOTOR LOAN": "sakoPettycash",
//       "SAKO ALL BUYOUT": "sako_buyout",
//       "Withholding Tax": "incomeTax",
//       MORTUARY: "sakoProvi",
//       "VPO/CHRISTMAS PARTY": "cooprecla",
//       SAKO: "sakoEmergency",
//       "SSS LOAN": "sssLoan",
//       "OVER PAYMENTS": "deductionAmount2",
//       "Total Deductions": "totalDeduction",

//       "NET PAY": "totalNet",
//     };

//     // ===============================
//     // NORMALIZE MAPPING
//     // ===============================
//     const normalizedMapping = {};
//     Object.keys(columnMapping).forEach((key) => {
//       normalizedMapping[normalizeHeader(key)] = columnMapping[key];
//     });

//     const rawColumns = Object.keys(data[0]);

//     console.log("RAW HEADERS:", rawColumns);

//     const ignoredColumns = rawColumns.filter((col) => {
//       const normalized = normalizeHeader(col);
//       return !normalizedMapping[normalized];
//     });

//     console.log("IGNORED COLUMNS:", ignoredColumns);

//     // ===============================
//     // FILTER ONLY MAPPED COLUMNS
//     // ===============================
//     const validColumnIndexes = [];

//     const mappedColumns = rawColumns.reduce((acc, column, index) => {
//       const normalized = normalizeHeader(column);

//       if (normalizedMapping[normalized]) {
//         acc.push(normalizedMapping[normalized]);
//         validColumnIndexes.push(index);
//       }

//       return acc;
//     }, []);

//     // ===============================
//     // COLUMN TYPES
//     // ===============================
//     const numericColumns = [
//       "OTHER INCOME",
//       "managementAllow",
//       "travelAllow",
//       "abmAllow",
//       "housingAllow",
//       "basicPay",
//       "incomeAmount1",
//       "gross",
//       "leaves",
//       "incomeTax",
//       "sssLoan",
//       "pagibigLoan",
//       "opec",
//       "installAccount",
//       "ticket",
//       "sakoProvi",
//       "sakoCommodity",
//       "sakoPrime",
//       "sakoEmergency",
//       "sakoPettycash",
//       "deductionAmount1",
//       "deductionAmount2",
//       "C_HMO",
//       "totalNet",
//       "totalDeduction",
//       "nightpremium",
//       "non_taxable_allowance",
//       "taxable_amount",
//       "lates",
//       "sako_buyout",
//     ];

//     const dateColumns = ["dateHired", "startDate", "endDate"];

//     // ===============================
//     // LOAD BRANCH MAP
//     // ===============================
//     const [branches] = await connection.query(
//       `SELECT b_branch, b_source, b_boscode, region_code, zone_code FROM brvismin_luz`,
//     );

//     const branchMap = new Map();
//     branches.forEach((b) => {
//       branchMap.set(`${b.b_branch}_${b.b_source}`, b);
//     });

//     // ===============================
//     // FINAL COLUMNS (IMPORTANT FIX)
//     // ===============================
//     const insertColumns = [
//       ...mappedColumns,
//       "totalAllow",
//       "totalOT",
//       "boscode",
//       "region_code",
//       "zone_code",
//       "deductionwoLateLeave",
//     ];

//     const updateClause = insertColumns
//       .map((col) => `${col}=VALUES(${col})`)
//       .join(", ");

//     // ===============================
//     // COMPUTED FIELDS
//     // ===============================
//     const totalAllowColumns = [
//       // "managementAllow",
//       // "travelAllow",
//       // "abmAllow",
//       // "housingAllow",

//       "HAZARD ALLOWANCE",
//       "HOUSING ALLOWANCE",
//       "MANAGEMENT ALLOWANCE",
//       "TRANSPORTATION ALLOWANCE",
//       "MANAGERIAL ALLOWANCE",
//       "MANCOMM ALLOWANCE",
//       "SUPERVISORY ALLOWANCE",
//     ];

//     const batchSize = 300;

//     function toNumber(val) {
//       const num = Number(val);
//       return isNaN(num) ? 0 : num;
//     }

//     const totalOTColumns = [
//       "ROT",
//       "RDOT",
//       "SHOT",
//       "ERDOT",
//       "ESHOT",
//       "Night Differential Amount",
//     ];

//     // ===============================
//     // INSERT LOOP
//     // ===============================
//     for (let i = 0; i < data.length; i += batchSize) {
//       const batch = data.slice(i, i + batchSize);

//       const values = [];

//       const placeholders = batch.map((row) => {
//         // ✅ Compute deductionwoLateLeave
//         const totalDeduction = toNumber(row["Total Deductions"]);
//         const lates = toNumber(row["LATES"]);
//         const leaves = toNumber(row["ABSENCE AMOUNT"]);
//         const undertime = toNumber(row["UNDERTIME"]);

//         console.log(
//           "IDNO ",
//           row["Number"],
//           "other income: ",
//           row["OTHER INCOME"],
//         );
//         row.deductionwoLateLeave =
//           totalDeduction - (lates + leaves + undertime);
//         row.deductionwoLateLeave = row.deductionwoLateLeave;
//         // ===============================
//         // COMPUTE totalAllow
//         // ===============================
//         row.totalAllow = totalAllowColumns.reduce((sum, col) => {
//           return sum + (Number(row[col]) || 0);
//         }, 0);

//         row.totalOT = totalOTColumns.reduce((sum, col) => {
//           return sum + toNumber(row[col]);
//         }, 0);

//         // ===============================
//         // MAP VALUES
//         // ===============================
//         const rowValues = validColumnIndexes.map((colIndex, i) => {
//           const originalColumn = rawColumns[colIndex];
//           const mappedColumn = mappedColumns[i];

//           let value = row[originalColumn];

//           if (numericColumns.includes(mappedColumn)) {
//             return toNumber(value);
//           }

//           if (dateColumns.includes(mappedColumn) || isExcelDate(value)) {
//             if (!value) return null;

//             return isNaN(value)
//               ? parseCustomDate(value)
//               : excelSerialDateToJSDate(value);
//           }

//           return typeof value === "string" ? value.trim() : value;
//         });

//         // ===============================
//         // ADD COMPUTED FIELD
//         // ===============================
//         rowValues.push(row.totalAllow);
//         rowValues.push(row.totalOT); // ✅ ADD HERE

//         // ===============================
//         // BRANCH LOOKUP (FIXED)
//         // ===============================
//         const branchValue =
//           typeof row.branch === "string" ? row.branch.trim() : row.branch || "";

//         const regionValue =
//           typeof row.region === "string" ? row.region.trim() : row.region || "";

//         const key = `${branchValue}_${regionValue}`;
//         const branchInfo = branchMap.get(key) || {};

//         rowValues.push(
//           branchInfo.b_boscode || null,
//           branchInfo.region_code || null,
//           branchInfo.zone_code || null,
//         );
//         rowValues.push(row.deductionwoLateLeave);

//         values.push(...rowValues);

//         return `(${new Array(insertColumns.length).fill("?").join(",")})`;
//       });

//       const sql = `
//         INSERT INTO payroll_test (${insertColumns.join(",")})
//         VALUES ${placeholders.join(",")}
//         ON DUPLICATE KEY UPDATE ${updateClause}
//       `;

//       await connection.query(sql, values);
//     }

//     await connection.commit();
//     connection.release();

//     return "✅ Bulk import successful.";
//   } catch (error) {
//     await connection.rollback();
//     connection.release();
//     console.error("IMPORT ERROR:", error);
//     throw error;
//   }
// };

async function executePayrollTask({
  startDate,
  endDate,
  dateRange,
  office,
  region,
  utilityName,
  amount,
  description,
}) {
  //const { endDate } = getDates(dateRange);
  const endDateObj = new Date(endDate);
  const payrollInfo = getPayrollFolder(office);
  const year = new Date(endDate).getFullYear();

  const masterDBFPath = path.join('C:', payrollInfo.folderName, region, 'master.DBF');
  const tempDBFPath = path.join('C:', payrollInfo.folderName, region, 'master_temp.DBF');
  const payrollDBPath = path.join('C:', payrollInfo.folderName, region, `Pay${year}.DBF`);
  const temppayrollDBPath = path.join('C:', payrollInfo.folderName, region, `Pay${year}_temp.DBF`);

  //console.log("office====================>", office);
  const dbPool = utilitiesModel.getDbPool(office);
  let message = '';
  let data = [];
  let hasIssues = false;

  switch (utilityName.toLowerCase()) {
    case 'bonus updater (1.0)':
      message = await bonusUpdater(masterDBFPath, tempDBFPath, 1.0);
      message += ` For region: ${region}`;
      break;

    case 'bonus updater (2.0)':
      message = await bonusUpdater(masterDBFPath, tempDBFPath, 2.0);
      message += ` For region: ${region}`;
      break;

    case 'insert mortuary':
      message = await updateMortuaryDeductions(
        masterDBFPath,
        payrollDBPath,
        temppayrollDBPath,
        endDateObj, // <-- pass here
      );
      message += ` for region: ${region}`;
      break;

    case 'remove mortuary':
      await deductionUpdater(payrollDBPath, temppayrollDBPath, 'P_DED10', 0, endDateObj);
      message = 'Mortuary successfully added for region: ' + region;
      break;

    case 'update income 1':
      await updateRegularEmployees(
        masterDBFPath,
        payrollDBPath,
        temppayrollDBPath,
        amount,
        description,
        endDate,
      );
      message = 'Income successfully updated for region: ' + region;
      break;

    case 'remove philhealth':
      await deductionUpdater(payrollDBPath, temppayrollDBPath, 'P_DED5', 0.0, endDateObj);
      message = 'Philhealth successfully removed for region: ' + region;
      break;

    case 'check excess no. of days':
      if (!endDate) throw new Error('End date is required for checking excess days');

      [data] = await dbPool.query(
        `SELECT region, concat(lastname, ',  ', firstname) as ename, ((minutesworked / 60) / 8) as noOfdays 
         FROM ${payrollInfo.tableName}${year} 
         WHERE enddate = ? AND minutesworked > 7680 
         ORDER BY region, ename`,
        [endDate],
      );
      message =
        data.length > 0
          ? `Found ${data.length} employees with excess days`
          : 'No employees found with excess days';
      hasIssues = data.length > 0;
      break;

    case 'check negative amount':
      if (!endDate) throw new Error('End date is required for checking negative amount');

      //[data] = await db.query(
      [data] = await dbPool.query(
        `SELECT region, concat(lastname, ',  ', firstname) as ename, totalnet, DATE_FORMAT(enddate,'%m/%d/%Y') as pay_period 
         FROM ${payrollInfo.tableName}${year} 
         WHERE enddate = ? AND totalnet <= 0 
         ORDER BY region, ename`,
        [endDate],
      );
      message =
        data.length > 0
          ? `Found ${data.length} employees with negative amount`
          : `No employees found with negative amount`;
      hasIssues = data.length > 0;
      break;

    case 'insert philhealth':
      await updatePhilhealthDeductions(payrollDBPath, temppayrollDBPath, endDate);
      message = 'Philhealth successfully added for region: ' + region;
      break;

    default:
      throw new Error('Unknown utility name: ' + utilityName);
  }

  return { message, data, hasIssues };
}

//PDF CREATION -- START
async function generateMlFundPdf1(results, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const groupedData = {};
      results.forEach((emp) => {
        const region = emp.region || 'Unknown Region';
        const dept = emp.department || 'Unknown Department';

        if (!groupedData[region]) groupedData[region] = {};
        if (!groupedData[region][dept]) groupedData[region][dept] = [];
        groupedData[region][dept].push(emp);
      });

      const sortedRegions = Object.keys(groupedData).sort();
      const columnPositions = {
        regionCode: 50,
        regionDesc: 110,
        index: 200,
        idno: 220,
        employee: 270,
        amount: 420,
      };

      sortedRegions.forEach((region, rIndex) => {
        if (rIndex > 0) doc.addPage();

        doc.fontSize(12).font('Helvetica-Bold').text('ML FUND DEDUCTION111111', 50, doc.y);
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(`Payroll Date: ${formatDate(results[0].enddate)}`, 50, doc.y + 15);
        doc.moveDown(1);

        const departments = Object.keys(groupedData[region]);

        departments.forEach((dept) => {
          doc.fontSize(11).font('Helvetica-Bold').text(`Region: ${region} | Department: ${dept}`);
          doc.moveDown(0.5);

          // Table Header
          doc.fontSize(9).font('Helvetica-Bold');
          doc.text('REGION CODE', columnPositions.regionCode, doc.y);
          doc.text('REGION DESC', columnPositions.regionDesc, doc.y);
          doc.text('#', columnPositions.index, doc.y);
          doc.text('IDNO', columnPositions.idno, doc.y);
          doc.text('EMPLOYEE NAME', columnPositions.employee, doc.y);
          doc.text('AMOUNT', columnPositions.amount, doc.y, {
            width: 100,
            align: 'right',
          });
          doc.moveDown(0.5);

          // Table Body
          const employees = groupedData[region][dept];
          doc.font('Helvetica');

          employees.forEach((emp, i) => {
            doc.fontSize(9);
            doc.text(emp.region_code || '', columnPositions.regionCode, doc.y);
            doc.text(emp.region_description || '', columnPositions.regionDesc, doc.y);
            doc.text(String(i + 1), columnPositions.index, doc.y);
            doc.text(emp.idno || '', columnPositions.idno, doc.y);
            doc.text(emp.employee || '', columnPositions.employee, doc.y);
            doc.text(formatNumber(emp.mlfund || 0), columnPositions.amount, doc.y, {
              width: 100,
              align: 'right',
            });
            doc.moveDown(0.3);
          });

          // Department Totals
          const total = employees.reduce((sum, emp) => sum + (parseFloat(emp.mlfund) || 0), 0);
          doc.moveDown(0.2);
          doc.font('Helvetica-Bold');
          doc.text('TOTAL EMPLOYEES:', columnPositions.employee, doc.y);
          doc.text(employees.length.toString(), columnPositions.employee + 100, doc.y);
          doc.text(formatNumber(total), columnPositions.amount, doc.y, {
            width: 100,
            align: 'right',
          });
          doc.moveDown(1);
        });
      });

      doc.end();
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

//PDF CREATION -- END

//PDF KP FORMAT -- START

function generateKPPdfFile(doc, data, type) {
  //console.log("generateKPPdfFile");
  // Group by region
  const groupedData = {};
  data.forEach((emp) => {
    if (!groupedData[emp.region]) groupedData[emp.region] = [];
    groupedData[emp.region].push(emp);
  });

  // Add data to PDF by region
  Object.keys(groupedData).forEach((region, regionIndex) => {
    if (regionIndex > 0) doc.addPage(); // Add new page for each region except the first one

    // Add header for the first page of each region
    addKpHeader(doc, region, data[0].enddate, type);

    // Add employee data and summary
    addEmployeeDataKp(doc, region, groupedData[region], type);
  });
}

const addEmployeeDataKp = (doc, region, employees, reportType) => {
  // Set header for the employee data
  addKpEmployeeTableHeader(doc, reportType);

  // Initialize counters for each region
  let totalEmployees = 0;
  let totalAmount = 0;

  // Define table dimensions to match horizontal lines
  const tableStartX = 50;
  const tableEndX = doc.page.width - 50;
  const tableWidth = tableEndX - tableStartX;

  // Adjusted column widths - KPTN is shorter (15%), amount column is longer (25%)
  const columns = [
    { header: 'KP NUMBER', widthPercent: 20, align: 'left' },
    { header: 'ACCOUNT NAME', widthPercent: 40, align: 'left' },
    { header: 'KPTN', widthPercent: 15, align: 'left' }, // Reduced from 20% to 15%
    { header: reportType.toUpperCase(), widthPercent: 25, align: 'right' }, // Increased from 20% to 25%
  ];

  // Calculate absolute column positions
  let currentX = tableStartX;
  columns.forEach((col) => {
    col.x = currentX;
    col.width = (tableWidth * col.widthPercent) / 100;
    currentX += col.width;
  });

  // Row height configuration
  const rowHeight = 15;
  const cellPadding = 5;

  // Add employee data
  employees.forEach((employee) => {
    const remainingHeight = doc.page.height - doc.y - doc.page.margins.bottom;

    // Check if there is enough space for another row, else add a new page
    if (remainingHeight < rowHeight) {
      doc.addPage();
      addKpHeader(doc, region, employees[0].enddate, reportType);
      addKpEmployeeTableHeader(doc, reportType);
    }

    const rowY = doc.y;
    const amount = isNaN(employee.amount) ? 0 : employee.amount;
    const formattedAmount = amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    // Draw the entire row as one rectangle to ensure consistent borders
    doc.lineWidth(0.5).rect(tableStartX, rowY, tableWidth, rowHeight).stroke();

    // Add vertical dividers between columns
    let dividerX = tableStartX;
    for (let i = 1; i < columns.length; i++) {
      dividerX += columns[i - 1].width;
      doc
        .moveTo(dividerX, rowY)
        .lineTo(dividerX, rowY + rowHeight)
        .stroke();
    }

    // Add cell content
    doc.font('Helvetica').fontSize(9);
    columns.forEach((col, index) => {
      let text = '';
      switch (index) {
        case 0:
          text = employee.mobileno || 'N/A';
          break;
        case 1:
          text = employee.employee || 'N/A';
          break;
        case 2:
          text = employee.kptn || '';
          break;
        case 3:
          text = formattedAmount;
          break;
      }

      doc.text(text, col.x + cellPadding, rowY + 5, {
        width: col.width - cellPadding * 2,
        align: col.align,
      });
    });

    doc.y = rowY + rowHeight;

    // Update region-level counters
    totalEmployees += 1;
    totalAmount += amount;
  });

  // Check if there is enough space for the total summary and employees count
  const summaryRowHeight = 30;
  const remainingHeightAfterData = doc.page.height - doc.y - doc.page.margins.bottom;

  if (remainingHeightAfterData < summaryRowHeight) {
    doc.addPage();
    addKpHeader(doc, region, employees[0].enddate, reportType);
  }

  // Add summary at the end
  const formattedTotalAmount = totalAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Draw line above summary (same width as table)
  const summaryStartY = doc.y;
  doc.moveTo(tableStartX, summaryStartY).lineTo(tableEndX, summaryStartY).stroke();

  doc.moveDown(0.5);
  const summaryY = doc.y;

  // Draw Total Employees on the left
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .text(`Total Employees: ${totalEmployees}`, tableStartX, summaryY);

  // Draw Total Amount on the right, same y-coordinate
  doc.text(`Total: ${formattedTotalAmount}`, tableEndX - 100, summaryY, {
    width: 100,
    align: 'right',
  });

  // Draw the first line (same width as table)
  const firstLineY = summaryY + 15;
  doc.moveTo(tableStartX, firstLineY).lineTo(tableEndX, firstLineY).stroke();

  // Draw the second line with a small gap
  const smallGap = 5;
  const secondLineY = firstLineY + smallGap;
  doc.moveTo(tableStartX, secondLineY).lineTo(tableEndX, secondLineY).stroke();

  // Signature lines
  const certifiedCorrectY = secondLineY + 15;
  doc
    .font('Helvetica')
    .fontSize(8)
    .text('Certified Correct: ____________________', tableStartX, certifiedCorrectY);

  const AuthorizedByY = certifiedCorrectY + 20;
  doc.text('Authorized Signature: ____________________', tableStartX, AuthorizedByY);

  const RecievedByY = AuthorizedByY + 20;
  doc.text('Received By: ____________________', tableStartX, RecievedByY);

  doc.moveDown(0.5);
  doc.fontSize(6).text(`Printed on: ${new Date()}`, { align: 'right' });
};

const addKpEmployeeTableHeader = (doc, reportType) => {
  const headerY = doc.y;
  const rowHeight = 15;
  const cellPadding = 5;

  // Use same dimensions as in addEmployeeDataKp
  const tableStartX = 50;
  const tableEndX = doc.page.width - 50;
  const tableWidth = tableEndX - tableStartX;

  // Adjusted column widths to match the data rows
  const columns = [
    { header: 'KP NUMBER', widthPercent: 20, align: 'left' },
    { header: 'ACCOUNT NAME', widthPercent: 40, align: 'left' },
    { header: 'KPTN', widthPercent: 15, align: 'left' }, // Reduced from 20% to 15%
    { header: reportType.toUpperCase(), widthPercent: 25, align: 'right' }, // Increased from 20% to 25%
  ];

  // Calculate absolute column positions
  let currentX = tableStartX;
  columns.forEach((col) => {
    col.x = currentX;
    col.width = (tableWidth * col.widthPercent) / 100;
    currentX += col.width;
  });

  // Draw the header row as one rectangle to ensure consistent borders
  doc.lineWidth(0.5).rect(tableStartX, headerY, tableWidth, rowHeight).stroke();

  // Add vertical dividers between columns
  let dividerX = tableStartX;
  for (let i = 1; i < columns.length; i++) {
    dividerX += columns[i - 1].width;
    doc
      .moveTo(dividerX, headerY)
      .lineTo(dividerX, headerY + rowHeight)
      .stroke();
  }

  // Add header text
  doc.font('Helvetica-Bold').fontSize(9);
  columns.forEach((col) => {
    doc.text(col.header, col.x + cellPadding, headerY + 5, {
      width: col.width - cellPadding * 2,
      align: col.align,
    });
  });

  doc.y = headerY + rowHeight;
};

const addKpHeader = (doc, region, date, reportType) => {
  //console.log("addKpHeader");
  const logoPath = path.join(__dirname, '../public/images/logo.png');
  const logoWidth = 200;
  const xPosition = (doc.page.width - logoWidth) / 2;

  doc.image(logoPath, xPosition, 45, { width: logoWidth });
  doc.moveDown(0.8);

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('HUMAN RESOURCES MANAGEMENT DIVISION', { align: 'center' });
  doc.moveDown(0.5);

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(`${reportType.toUpperCase()} REPORT`, { align: 'center' });
  doc.moveDown(0.5);

  // Region with bold
  const regionY = doc.y;
  const regionText = `Region/Division: ${region}`;
  doc.font('Helvetica-Bold').fontSize(9).text(regionText, 50, regionY);

  // Payroll Date header
  const formattedDate = formatDateString(date);
  const payrollDateY = doc.y;
  const payrollDateText = `Payroll Date: ${formattedDate}`;
  doc.font('Helvetica-Bold').fontSize(9).text(payrollDateText, 50, payrollDateY);
  doc.moveDown(0.8);
};

//--------------------------> KP PDF SUMMARY START <---------------------------------------

function generateKPSummaryPdfFile(doc, data, type, office) {
  const newOffice = office;
  //console.log("generateKPPdfFile", newOffice);
  // Group by region
  const groupedData = {};
  data.forEach((emp) => {
    if (!groupedData[emp.region]) groupedData[emp.region] = [];
    groupedData[emp.region].push(emp);
  });

  // Add data to PDF by region
  Object.keys(groupedData).forEach((region, regionIndex) => {
    if (regionIndex > 0) doc.addPage(); // Add new page for each region except the first one

    // Add header for the first page of each region
    addKpSummaryHeader(doc, region, data[0].enddate, type, newOffice);

    // Add employee data and summary
    addEmployeeDataKpSummary(doc, region, groupedData[region], type, newOffice);
  });
}

const addEmployeeDataKpSummary = (doc, region, employees, reportType, office) => {
  // Set header for the employee data
  addKpSummaryTableHeader(doc, reportType);

  // Define table dimensions to match horizontal lines
  const tableStartX = 50;
  const tableEndX = doc.page.width - 50;
  const tableWidth = tableEndX - tableStartX;

  // Column definitions
  const columns = [
    { header: 'REGIONS', widthPercent: 20, align: 'left' },
    { header: 'ML WALLET COUNT', widthPercent: 10, align: 'right' },
    { header: 'ML WALLET AMOUNT', widthPercent: 15, align: 'right' },
    { header: 'ML KP COUNT', widthPercent: 10, align: 'right' },
    { header: 'ML KP AMOUNT', widthPercent: 15, align: 'right' },
    { header: 'TOTAL COUNT', widthPercent: 10, align: 'right' },
    { header: 'TOTAL AMOUNT', widthPercent: 20, align: 'right' },
  ];

  // Calculate absolute column positions
  let currentX = tableStartX;
  columns.forEach((col) => {
    col.x = currentX;
    col.width = (tableWidth * col.widthPercent) / 100;
    currentX += col.width;
  });

  // Initialize totals for all columns
  const totals = {
    regions: 0,
    walletCount: 0,
    walletAmount: 0,
    kpCount: 0,
    kpAmount: 0,
    totalCount: 0,
    totalAmount: 0,
  };

  // Helper function to format values (replace 0 with "-")
  const formatValue = (value, isAmount = false) => {
    if (value === 0 || value === '0' || value === '0.00') return '-';
    if (isAmount) {
      return Number(value).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    return Number(value).toLocaleString('en-US');
  };

  // Row height configuration
  const rowHeight = 15;
  const cellPadding = 5;

  // Add employee data
  employees.forEach((employee) => {
    const remainingHeight = doc.page.height - doc.y - doc.page.margins.bottom;

    // Check if there is enough space for another row, else add a new page
    if (remainingHeight < rowHeight) {
      doc.addPage();
      addKpSummaryHeader(doc, region, employees[0].enddate, reportType, office);
      addKpSummaryTableHeader(doc, reportType);
    }

    const rowY = doc.y;

    // Get raw values
    const walletCount = Number(employee.walletcount) || 0;
    const walletAmount = Number(employee.walletamount) || 0;
    const kpCount = Number(employee.kpcount) || 0;
    const kpAmount = Number(employee.kpamount) || 0;
    const totalCount = Number(employee.totalcount) || 0;
    const totalAmount = Number(employee.totalamount) || 0;

    // Format values (replacing zeros with "-")
    const formattedWalletCount = formatValue(walletCount);
    const formattedWalletAmount = formatValue(walletAmount, true);
    const formattedKpCount = formatValue(kpCount);
    const formattedKpAmount = formatValue(kpAmount, true);
    const formattedTotalCount = formatValue(totalCount);
    const formattedTotalAmount = formatValue(totalAmount, true);

    // Draw the entire row as one rectangle to ensure consistent borders
    doc.lineWidth(0.5).rect(tableStartX, rowY, tableWidth, rowHeight).stroke();

    // Add vertical dividers between columns
    let dividerX = tableStartX;
    for (let i = 1; i < columns.length; i++) {
      dividerX += columns[i - 1].width;
      doc
        .moveTo(dividerX, rowY)
        .lineTo(dividerX, rowY + rowHeight)
        .stroke();
    }

    // Add cell content
    doc.font('Helvetica').fontSize(8);
    columns.forEach((col, index) => {
      let text = '';
      switch (index) {
        case 0:
          text = employee.regional || 'N/A';
          break;
        case 1:
          text = formattedWalletCount;
          break;
        case 2:
          text = formattedWalletAmount;
          break;
        case 3:
          text = formattedKpCount;
          break;
        case 4:
          text = formattedKpAmount;
          break;
        case 5:
          text = formattedTotalCount;
          break;
        case 6:
          text = formattedTotalAmount;
          break;
      }

      doc.text(text, col.x + cellPadding, rowY + 5, {
        width: col.width - cellPadding * 2,
        align: col.align,
      });
    });

    doc.y = rowY + rowHeight;

    // Update all totals
    totals.regions += 1;
    totals.walletCount += walletCount;
    totals.walletAmount += walletAmount;
    totals.kpCount += kpCount;
    totals.kpAmount += kpAmount;
    totals.totalCount += totalCount;
    totals.totalAmount += totalAmount;
  });

  // Check if there is enough space for the grand total row
  const remainingHeightAfterData = doc.page.height - doc.y - doc.page.margins.bottom;
  if (remainingHeightAfterData < rowHeight + 30) {
    // 30 = space for signature section
    doc.addPage();
    addKpSummaryHeader(doc, region, employees[0].enddate, reportType, office);
  }

  // Format all totals (using same zero-replacement logic)
  const formattedTotals = {
    walletCount: totals.walletCount === 0 ? '-' : totals.walletCount.toLocaleString('en-US'),
    walletAmount:
      totals.walletAmount === 0
        ? '-'
        : totals.walletAmount.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
    kpCount: totals.kpCount === 0 ? '-' : totals.kpCount.toLocaleString('en-US'),
    kpAmount:
      totals.kpAmount === 0
        ? '-'
        : totals.kpAmount.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
    totalCount: totals.totalCount === 0 ? '-' : totals.totalCount.toLocaleString('en-US'),
    totalAmount:
      totals.totalAmount === 0
        ? '-'
        : totals.totalAmount.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
  };

  // Draw line above grand total
  const summaryStartY = doc.y;
  doc.moveTo(tableStartX, summaryStartY).lineTo(tableEndX, summaryStartY).stroke();

  // Add grand total row
  const grandTotalY = doc.y + 5;
  columns.forEach((col, index) => {
    let text = '';
    switch (index) {
      case 0:
        text = 'GRAND TOTAL';
        break;
      case 1:
        text = formattedTotals.walletCount;
        break;
      case 2:
        text = formattedTotals.walletAmount;
        break;
      case 3:
        text = formattedTotals.kpCount;
        break;
      case 4:
        text = formattedTotals.kpAmount;
        break;
      case 5:
        text = formattedTotals.totalCount;
        break;
      case 6:
        text = formattedTotals.totalAmount;
        break;
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(text, col.x + cellPadding, grandTotalY, {
        width: col.width - cellPadding * 2,
        align: col.align,
      });
  });

  doc.y = grandTotalY + rowHeight;

  // Draw the first line below grand total
  const firstLineY = doc.y;
  doc.moveTo(tableStartX, firstLineY).lineTo(tableEndX, firstLineY).stroke();

  // Draw the second line with a small gap
  const smallGap = 2;
  const secondLineY = firstLineY + smallGap;
  doc.moveTo(tableStartX, secondLineY).lineTo(tableEndX, secondLineY).stroke();

  // Signature lines
  const certifiedCorrectY = secondLineY + 5;
  doc
    .font('Helvetica')
    .fontSize(8)
    .text(`Certified Correct              : ____________________`, tableStartX, certifiedCorrectY);

  const AuthorizedByY = certifiedCorrectY + 10;
  doc.text(`Authorized Signature       : ____________________`, tableStartX, AuthorizedByY);

  const RecievedByY = AuthorizedByY + 10;
  doc.text(`Received By                    : ____________________`, tableStartX, RecievedByY);

  doc.moveDown(0.1);
  doc.fontSize(6).text(`Printed on: ${new Date()}`, { align: 'right' });
};

const addKpSummaryTableHeader = (doc, reportType) => {
  const headerY = doc.y;
  const rowHeight = 40;
  const cellPadding = 5;

  // Use same dimensions as in addEmployeeDataKp
  const tableStartX = 50;
  const tableEndX = doc.page.width - 50;
  const tableWidth = tableEndX - tableStartX;

  // Adjusted column widths to match the data rows
  const columns = [
    { header: 'REGIONS', widthPercent: 20, align: 'center' },
    { header: 'ML WALLET COUNT', widthPercent: 10, align: 'center' },
    { header: 'ML WALLET AMOUNT', widthPercent: 15, align: 'center' },
    { header: 'ML KP COUNT', widthPercent: 10, align: 'center' },
    { header: 'ML KP AMOUNT', widthPercent: 15, align: 'center' },
    { header: 'TOTAL COUNT', widthPercent: 10, align: 'center' },
    { header: 'TOTAL AMOUNT', widthPercent: 20, align: 'center' },
  ];

  // Calculate absolute column positions
  let currentX = tableStartX;
  columns.forEach((col) => {
    col.x = currentX;
    col.width = (tableWidth * col.widthPercent) / 100;
    currentX += col.width;
  });

  // Draw the header row as one rectangle to ensure consistent borders
  doc.lineWidth(0.5).rect(tableStartX, headerY, tableWidth, rowHeight).stroke();

  // Add vertical dividers between columns
  let dividerX = tableStartX;
  for (let i = 1; i < columns.length; i++) {
    dividerX += columns[i - 1].width;
    doc
      .moveTo(dividerX, headerY)
      .lineTo(dividerX, headerY + rowHeight)
      .stroke();
  }

  // Add header text
  doc.font('Helvetica-Bold').fontSize(8);
  columns.forEach((col) => {
    doc.text(col.header, col.x + cellPadding, headerY + 5, {
      width: col.width - cellPadding * 2,
      align: col.align,
    });
  });

  doc.y = headerY + rowHeight;
};

const addKpSummaryHeader = (doc, region, date, reportType, office) => {
  //console.log("addKpSummaryHeader", office);
  const logoPath = path.join(__dirname, '../public/images/logo.png');
  const logoWidth = 200;
  const tableStartX = 50; // Match this with your table's starting position
  const xPosition = (doc.page.width - logoWidth) / 2;

  // Adjust the Y-position for the logo
  const initialY = 30;
  doc.image(logoPath, xPosition, initialY, { width: logoWidth });

  // Center-aligned division name
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('HUMAN RESOURCES MANAGEMENT DIVISION', { align: 'center' });

  // Move down and get current Y position
  doc.moveDown(0.3);
  const currentY = doc.y;

  // Left-aligned office payroll text (aligned with table border)
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .text(`${office.toUpperCase()} PAYROLL`, tableStartX, currentY, {
      align: 'left',
    });

  // Left-aligned payroll date (aligned with table border)
  const formattedDate = formatDateString(date);
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .text(`PAYROLL DATE - ${formattedDate}`, tableStartX, currentY + 10, {
      align: 'left',
    });

  // Adjust vertical space for next elements
  doc.y = currentY + 20;
};

//--------------------------> KP PDF SUMMARY END <-----------------------------------------

/**
 * Formats a number into a currency-style string (e.g., 2,000.00)
 * @param {number|string} amount - The value to format
 * @returns {string} - The formatted string
 */
const formatCurrency = (amount) => {
  // We wrap in Number() to ensure it works even if the input is a string from the DB
  return Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

function generateIncomeReportPdf(doc, data, type) {
  const groupedData = {};
  data.forEach((emp) => {
    if (!groupedData[emp.region]) groupedData[emp.region] = [];
    groupedData[emp.region].push(emp);
  });

  Object.keys(groupedData).forEach((region, regionIndex) => {
    if (regionIndex > 0) doc.addPage();
    addIncomeReportHeader(doc, region, data[0].enddate);
    addIncomeReportData(doc, region, groupedData[region]);
  });
}

function addIncomeReportHeader(doc, region, date) {
  const logoPath = path.join(__dirname, '../public/images/logo.png');
  const logoWidth = 200;
  const xPosition = (doc.page.width - logoWidth) / 2;

  doc.image(logoPath, xPosition, 45, { width: logoWidth });
  doc.moveDown(0.8);

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('HUMAN RESOURCES MANAGEMENT DIVISION', { align: 'center' });
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(10).text('INCOME REPORT', { align: 'center' });
  doc.moveDown(0.5);

  const regionY = doc.y;
  doc.font('Helvetica-Bold').fontSize(9).text(`Region/Division: ${region}`, 50, regionY);

  const formattedDate = formatDateString(date);
  const payrollDateY = doc.y;
  doc.font('Helvetica-Bold').fontSize(9).text(`Payroll Date: ${formattedDate}`, 50, payrollDateY);
  doc.moveDown(0.8);
}

function addIncomeReportData(doc, region, employees) {
  // ── Layout ──────────────────────────────────────────────────────────────
  const tableStartX = 50;
  const tableEndX = doc.page.width - 50;
  const tableWidth = tableEndX - tableStartX;
  const rowHeight = 15;
  const cellPadding = 4;

  const columns = [
    { header: 'EMPLOYEE NAME', widthPercent: 28, align: 'left' },
    { header: 'BASIC SALARY', widthPercent: 14, align: 'right' },
    { header: 'ALLOWANCE', widthPercent: 14, align: 'right' },
    { header: 'OVERTIME', widthPercent: 14, align: 'right' },
    { header: 'OTHER INCOME', widthPercent: 14, align: 'right' },
    { header: 'GROSS', widthPercent: 16, align: 'right' },
  ];

  // Calculate absolute positions once
  let cx = tableStartX;
  columns.forEach((col) => {
    col.x = cx;
    col.width = (tableWidth * col.widthPercent) / 100;
    cx += col.width;
  });

  // ── Running totals ───────────────────────────────────────────────────────
  let totalEmployees = 0;
  let totalBasic = 0;
  let totalAllow = 0;
  let totalOT = 0;
  let totalOther = 0;
  let totalSub = 0;

  // ── Helper: draw one header row ──────────────────────────────────────────
  function drawTableHeader() {
    const hy = doc.y;
    doc.lineWidth(0.5).rect(tableStartX, hy, tableWidth, rowHeight).stroke();

    let dx = tableStartX;
    for (let i = 1; i < columns.length; i++) {
      dx += columns[i - 1].width;
      doc
        .moveTo(dx, hy)
        .lineTo(dx, hy + rowHeight)
        .stroke();
    }

    doc.font('Helvetica-Bold').fontSize(8);
    columns.forEach((col) => {
      doc.text(col.header, col.x + cellPadding, hy + 4, {
        width: col.width - cellPadding * 2,
        align: col.align,
      });
    });

    doc.y = hy + rowHeight;
  }

  // ── Helper: draw one data row ────────────────────────────────────────────
  function drawDataRow(emp) {
    const ry = doc.y;

    // Page break check
    if (doc.page.height - ry - doc.page.margins.bottom < rowHeight * 3) {
      doc.addPage();
      addIncomeReportHeader(doc, region, employees[0].enddate);
      drawTableHeader();
    }

    const basic = parseFloat(emp.basicpay) || 0;
    const allow = parseFloat(emp.totalallow) || 0;
    const ot = parseFloat(emp.totalot) || 0;
    const other = parseFloat(emp.otherincome) || 0;
    const sub = parseFloat(emp.subtotal) || basic + allow + ot + other;

    totalBasic += basic;
    totalAllow += allow;
    totalOT += ot;
    totalOther += other;
    totalSub += sub;
    totalEmployees++;

    const fmt = (n) =>
      n.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    const cellData = [emp.employee || 'N/A', fmt(basic), fmt(allow), fmt(ot), fmt(other), fmt(sub)];

    const newRy = doc.y; // re-read after possible page break
    doc.lineWidth(0.3).rect(tableStartX, newRy, tableWidth, rowHeight).stroke();

    let dx = tableStartX;
    for (let i = 1; i < columns.length; i++) {
      dx += columns[i - 1].width;
      doc
        .moveTo(dx, newRy)
        .lineTo(dx, newRy + rowHeight)
        .stroke();
    }

    doc.font('Helvetica').fontSize(8);
    columns.forEach((col, i) => {
      doc.text(cellData[i], col.x + cellPadding, newRy + 4, {
        width: col.width - cellPadding * 2,
        align: col.align,
      });
    });

    doc.y = newRy + rowHeight;
  }

  // ── Draw header then rows ────────────────────────────────────────────────
  drawTableHeader();
  employees.forEach(drawDataRow);

  // ── Summary row ──────────────────────────────────────────────────────────
  const fmt = (n) =>
    n.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // Separator line
  const sy = doc.y;
  doc.moveTo(tableStartX, sy).lineTo(tableEndX, sy).lineWidth(1).stroke();

  doc.moveDown(0.4);
  const totY = doc.y;

  doc.font('Helvetica-Bold').fontSize(8);

  // "Total Employees" label sits in the Name column
  doc.text(`Total Employees: ${totalEmployees}`, columns[0].x + cellPadding, totY, {
    width: columns[0].width - cellPadding * 2,
    align: 'left',
  });

  // Numeric totals aligned to their columns
  [
    [1, totalBasic],
    [2, totalAllow],
    [3, totalOT],
    [4, totalOther],
    [5, totalSub],
  ].forEach(([idx, val]) => {
    doc.text(fmt(val), columns[idx].x + cellPadding, totY, {
      width: columns[idx].width - cellPadding * 2,
      align: 'right',
    });
  });

  // Double underline
  // Double underline
  const line1Y = totY + rowHeight;
  doc.moveTo(tableStartX, line1Y).lineTo(tableEndX, line1Y).lineWidth(1).stroke();
  doc
    .moveTo(tableStartX, line1Y + 3)
    .lineTo(tableEndX, line1Y + 3)
    .lineWidth(1)
    .stroke();

  // Signature lines
  const certifiedY = line1Y + 15;
  doc
    .font('Helvetica')
    .fontSize(8)
    .text('Certified Correct            : ____________________', tableStartX, certifiedY);

  const authorizedY = certifiedY + 15;
  doc.text('Authorized Signature     : ____________________', tableStartX, authorizedY);

  const receivedY = authorizedY + 15;
  doc.text('Received By                  : ____________________', tableStartX, receivedY);

  doc.moveDown(0.3);
  doc.fontSize(6).text(`Printed on: ${new Date()}`, { align: 'right' });
}

// ----------------------------------------- SHARED EDI/REMITTANCE HELPERS ----------------------------------------- //
const staffDataFilter = (data) => {
  return data.filter(
    (item) =>
      !item.designation.toLowerCase().includes('regional') &&
      !item.designation.toLowerCase().includes('abc') &&
      !item.designation.toLowerCase().includes('driver') &&
      !item.designation.toLowerCase().includes('opec') &&
      !item.designation.toLowerCase().includes('lptl') &&
      !item.designation.toLowerCase().includes('reliever') &&
      !item.designation.toLowerCase().includes('area') &&
      !item.designation.toLowerCase().includes('auditor') &&
      !item.designation.toLowerCase().includes('ispd') &&
      !item.designation.toLowerCase().includes('sales') &&
      item.designation.toLowerCase() !== 'fa' &&
      item.designation.toLowerCase() !== 'rst' &&
      item.designation.toLowerCase() !== 'rt' &&
      item.designation.toLowerCase() !== 'ram' &&
      item.designation.toLowerCase() !== 'am' &&
      item.designation.toLowerCase() !== 'rm' &&
      item.designation.toLowerCase() !== 'regional manager' &&
      item.designation.toLowerCase() !== 'local process team leader' &&
      item.designation.toLowerCase() !== 'messenger' &&
      item.designation.toLowerCase() !== 'acting regional manager',
  );
};

const areaDataFilter = (data) => {
  return data.filter(
    (item) =>
      (item.designation.toLowerCase().includes('reliever') ||
        item.designation.toLowerCase().includes('abc') ||
        item.designation.toLowerCase().includes('area') ||
        item.designation.toLowerCase() === 'am') &&
      !item.designation.toLowerCase().includes('sales'),
  );
};

const regionDataFilter = (data) => {
  return data.filter(
    (item) =>
      item.designation.toLowerCase().includes('regional') ||
      item.designation.toLowerCase().includes('driver') ||
      item.designation.toLowerCase().includes('opec') ||
      item.designation.toLowerCase().includes('lptl') ||
      item.designation.toLowerCase().includes('auditor') ||
      item.designation.toLowerCase().includes('ispd') ||
      item.designation.toLowerCase().includes('sales') ||
      item.designation.toLowerCase() === 'fa' ||
      item.designation.toLowerCase() === 'rst' ||
      item.designation.toLowerCase() === 'rt' ||
      item.designation.toLowerCase() === 'ram' ||
      item.designation.toLowerCase() === 'rm' ||
      item.designation.toLowerCase() === 'regional manager' ||
      item.designation.toLowerCase() === 'local process team leader' ||
      item.designation.toLowerCase() === 'messenger' ||
      item.designation.toLowerCase() === 'acting regional manager',
  );
};

const getBranchCountsEdi = (data) => {
  const branchCount = {};
  data.forEach(({ region, branch, department }) => {
    if (!branchCount[region]) {
      branchCount[region] = { countbranch: new Set(), countbranchdepartment: {} };
    }
    branchCount[region].countbranch.add(branch);
    if (!branchCount[region].countbranchdepartment[department]) {
      branchCount[region].countbranchdepartment[department] = new Set();
    }
    branchCount[region].countbranchdepartment[department].add(branch);
  });

  return Object.keys(branchCount).map((region) => ({
    region,
    countbranch: branchCount[region].countbranch.size,
    countbranchdepartment: Object.keys(branchCount[region].countbranchdepartment).reduce(
      (acc, dept) => {
        acc[dept] = branchCount[region].countbranchdepartment[dept].size;
        return acc;
      },
      {},
    ),
  }));
};

// ----------------------------------------- EDI PAYROLL ----------------------------------------- //
const processStaffDataEdi = (data) => {
  const branchData = {};
  data.forEach(
    ({
      employmentStatus,
      basicPay,
      totalAllow,
      bmAllow,
      totalOT,
      cola,
      incomeAmount1,
      incomeAmount2,
      nightpremium,
      lates,
      leaves,
      deductionwoLateLeave,
      totalNet,
      branch,
      region,
      department,
      boscode,
      costCenter,
    }) => {
      if (!branchData[region]) branchData[region] = {};
      if (!branchData[region][branch]) {
        branchData[region][branch] = {
          department,
          boscode,
          employeeBranchCount: 0,
          branchRegularBasicPay: 0,
          branchTraineeBasicPay: 0,
          branchAllowances: 0,
          branchBmAllowance: 0,
          branchRegularOT: 0,
          branchTraineeOT: 0,
          branchCola: 0,
          branchIncome1: 0,
          branchIncome2: 0,
          branchNightpremium: 0,
          branchRegularLate: 0,
          branchTraineeLate: 0,
          branchRegularLeave: 0,
          branchTraineeLeave: 0,
          branchOtherDeductions: 0,
          branchtotalNet: 0,
          costCenter,
        };
      }
      branchData[region][branch].employeeBranchCount += 1;

      if (employmentStatus.toLowerCase() === 'regular') {
        branchData[region][branch].branchRegularBasicPay += basicPay || 0;
        branchData[region][branch].branchRegularOT += totalOT - nightpremium || 0;
        branchData[region][branch].branchRegularLate += lates || 0;
        branchData[region][branch].branchRegularLeave += leaves || 0;
      } else {
        branchData[region][branch].branchTraineeBasicPay += basicPay || 0;
        branchData[region][branch].branchTraineeOT += totalOT - nightpremium || 0;
        branchData[region][branch].branchTraineeLate += lates || 0;
        branchData[region][branch].branchTraineeLeave += leaves || 0;
      }

      branchData[region][branch].branchAllowances += totalAllow - bmAllow || 0;
      branchData[region][branch].branchBmAllowance += bmAllow || 0;
      branchData[region][branch].branchCola += cola || 0;
      branchData[region][branch].branchIncome1 += incomeAmount1 || 0;
      branchData[region][branch].branchIncome2 += incomeAmount2 || 0;
      branchData[region][branch].branchNightpremium += Number(nightpremium) || 0;
      branchData[region][branch].branchOtherDeductions += Number(deductionwoLateLeave) || 0;
      branchData[region][branch].branchtotalNet += totalNet || 0;
    },
  );

  const sortedResults = [];
  for (const [region, branches] of Object.entries(branchData)) {
    for (const [branch, vals] of Object.entries(branches)) {
      sortedResults.push({ region, branch, ...vals });
    }
  }
  return sortedResults.sort((a, b) => {
    if (a.region !== b.region) return a.region.localeCompare(b.region);
    if (a.branch !== b.branch) return a.branch.localeCompare(b.branch);
    return b.employeeBranchCount - a.employeeBranchCount;
  });
};

const processAreaDataEdi = (data) => {
  const departmentData = {};
  data.forEach(
    ({
      employmentStatus,
      basicPay,
      totalAllow,
      bmAllow,
      totalOT,
      cola,
      incomeAmount1,
      incomeAmount2,
      nightpremium,
      lates,
      leaves,
      deductionwoLateLeave,
      totalNet,
      department,
      region,
    }) => {
      if (!departmentData[region]) departmentData[region] = {};
      if (!departmentData[region][department]) {
        departmentData[region][department] = {
          areaEmployeeCount: 0,
          areaRegularBasicPay: 0,
          areaTraineeBasicPay: 0,
          areaAllowances: 0,
          areaBmAllowance: 0,
          areaRegularOT: 0,
          areaTraineeOT: 0,
          areaCola: 0,
          areaIncome1: 0,
          areaIncome2: 0,
          areaNightpremium: 0,
          areaRegularLate: 0,
          areaTraineeLate: 0,
          areaRegularLeave: 0,
          areaTraineeLeave: 0,
          areaOtherDeductions: 0,
          areaTotalNet: 0,
        };
      }
      departmentData[region][department].areaEmployeeCount += 1;

      if (employmentStatus.toLowerCase() === 'regular') {
        departmentData[region][department].areaRegularBasicPay += basicPay || 0;
        departmentData[region][department].areaRegularOT += totalOT - nightpremium || 0;
        departmentData[region][department].areaRegularLate += lates || 0;
        departmentData[region][department].areaRegularLeave += leaves || 0;
      } else {
        departmentData[region][department].areaTraineeBasicPay += basicPay || 0;
        departmentData[region][department].areaTraineeOT += totalOT - nightpremium || 0;
        departmentData[region][department].areaTraineeLate += lates || 0;
        departmentData[region][department].areaTraineeLeave += leaves || 0;
      }

      departmentData[region][department].areaAllowances += totalAllow - bmAllow || 0;
      departmentData[region][department].areaBmAllowance += bmAllow || 0;
      departmentData[region][department].areaCola += cola || 0;
      departmentData[region][department].areaIncome1 += incomeAmount1 || 0;
      departmentData[region][department].areaIncome2 += incomeAmount2 || 0;
      departmentData[region][department].areaTotalNet += totalNet || 0;
      departmentData[region][department].areaNightpremium += nightpremium * 1 || 0;
      departmentData[region][department].areaOtherDeductions += deductionwoLateLeave * 1 || 0;
    },
  );

  const sortedResults = [];
  for (const [region, departments] of Object.entries(departmentData)) {
    for (const [department, vals] of Object.entries(departments)) {
      sortedResults.push({ region, department, ...vals });
    }
  }
  return sortedResults.sort((a, b) => {
    if (a.region !== b.region) return a.region.localeCompare(b.region);
    if (a.department !== b.department) return a.department.localeCompare(b.department);
    return b.areaEmployeeCount - a.areaEmployeeCount;
  });
};

const processRegionDataEdi = (data) => {
  const regionData = {};
  data.forEach(
    ({
      employmentStatus,
      basicPay,
      totalAllow,
      bmAllow,
      totalOT,
      cola,
      incomeAmount1,
      incomeAmount2,
      nightpremium,
      lates,
      leaves,
      deductionwoLateLeave,
      totalNet,
      region,
    }) => {
      if (!regionData[region]) {
        regionData[region] = {
          regionRegularBasicPay: 0,
          regionTraineeBasicPay: 0,
          regionAllowances: 0,
          regionBmAllowance: 0,
          regionRegularOT: 0,
          regionTraineeOT: 0,
          regionCola: 0,
          regionIncome1: 0,
          regionIncome2: 0,
          regionNightpremium: 0,
          regionRegularLate: 0,
          regionTraineeLate: 0,
          regionRegularLeave: 0,
          regionTraineeLeave: 0,
          regionOtherDeductions: 0,
          regionTotalNet: 0,
          regionEmployeeCount: 0,
        };
      }
      if (employmentStatus.toLowerCase() === 'regular') {
        regionData[region].regionRegularBasicPay += basicPay || 0;
        regionData[region].regionRegularOT += totalOT - nightpremium || 0;
        regionData[region].regionRegularLate += lates || 0;
        regionData[region].regionRegularLeave += leaves || 0;
      } else {
        regionData[region].regionTraineeBasicPay += basicPay || 0;
        regionData[region].regionTraineeOT += totalOT - nightpremium || 0;
        regionData[region].regionTraineeLate += lates || 0;
        regionData[region].regionTraineeLeave += leaves || 0;
      }
      regionData[region].regionAllowances += totalAllow - bmAllow || 0;
      regionData[region].regionBmAllowance += bmAllow || 0;
      regionData[region].regionCola += cola || 0;
      regionData[region].regionIncome1 += incomeAmount1 || 0;
      regionData[region].regionIncome2 += incomeAmount2 || 0;
      regionData[region].regionTotalNet += totalNet || 0;
      regionData[region].regionNightpremium += Number(nightpremium) || 0;
      regionData[region].regionOtherDeductions += deductionwoLateLeave * 1 || 0;
      regionData[region].regionEmployeeCount += 1;
    },
  );

  return Object.entries(regionData)
    .map(([region, vals]) => ({ region, ...vals }))
    .sort((a, b) => a.region.localeCompare(b.region));
};

const mergeAreaAndCalculateEdi = (department, branchcount) => {
  const result = [];
  department.forEach((dept) => {
    const matchingBranchCount = branchcount.find((b) => b.region === dept.region);
    if (matchingBranchCount) {
      const branchCountForDepartment = matchingBranchCount.countbranchdepartment[dept.department];
      if (branchCountForDepartment) {
        result.push({
          region: dept.region,
          department: dept.department,
          areaEmployeeCount: dept.areaEmployeeCount,
          areaRegularBasicPay: dept.areaRegularBasicPay / branchCountForDepartment,
          areaTraineeBasicPay: dept.areaTraineeBasicPay / branchCountForDepartment,
          areaAllowances: dept.areaAllowances / branchCountForDepartment,
          areaBmAllowance: dept.areaBmAllowance / branchCountForDepartment,
          areaRegularOT: dept.areaRegularOT / branchCountForDepartment,
          areaTraineeOT: dept.areaTraineeOT / branchCountForDepartment,
          areaCola: dept.areaCola / branchCountForDepartment,
          areaIncome1: dept.areaIncome1 / branchCountForDepartment,
          areaIncome2: dept.areaIncome2 / branchCountForDepartment,
          areaNightpremium: dept.areaNightpremium / branchCountForDepartment,
          areaRegularLate: dept.areaRegularLate / branchCountForDepartment,
          areaTraineeLate: dept.areaTraineeLate / branchCountForDepartment,
          areaRegularLeave: dept.areaRegularLeave / branchCountForDepartment,
          areaTraineeLeave: dept.areaTraineeLeave / branchCountForDepartment,
          areaTotalNet: dept.areaTotalNet / branchCountForDepartment,
          areaOtherDeductions: dept.areaOtherDeductions / branchCountForDepartment,
        });
      }
    }
  });
  return result;
};

const mergeRegionAndCalculateEdi = (regionData, branchCountData) => {
  const branchCountMap = branchCountData.reduce((acc, item) => {
    acc[item.region] = item.countbranch;
    return acc;
  }, {});
  return regionData.map((region) => {
    const branchCount = branchCountMap[region.region] || 1;
    return {
      region: region.region,
      regionEmployeeCount: region.regionEmployeeCount,
      regionRegularBasicPay: region.regionRegularBasicPay / branchCount,
      regionTraineeBasicPay: region.regionTraineeBasicPay / branchCount,
      regionAllowances: region.regionAllowances / branchCount,
      regionBmAllowance: region.regionBmAllowance / branchCount,
      regionRegularOT: region.regionRegularOT / branchCount,
      regionTraineeOT: region.regionTraineeOT / branchCount,
      regionCola: region.regionCola / branchCount,
      regionIncome1: region.regionIncome1 / branchCount,
      regionIncome2: region.regionIncome2 / branchCount,
      regionNightpremium: region.regionNightpremium / branchCount,
      regionRegularLate: region.regionRegularLate / branchCount,
      regionTraineeLate: region.regionTraineeLate / branchCount,
      regionRegularLeave: region.regionRegularLeave / branchCount,
      regionTraineeLeave: region.regionTraineeLeave / branchCount,
      regionTotalNet: region.regionTotalNet / branchCount,
      regionOtherDeductions: region.regionOtherDeductions / branchCount,
    };
  });
};

const mergeStaffAndRegionDataEdi = (staffData, region) => {
  const result = [];
  staffData.forEach((staff) => {
    const matchingRegion = region.find((r) => r.region === staff.region);
    if (matchingRegion) {
      result.push({
        ...staff,
        regionEmployeeCount: matchingRegion.regionEmployeeCount,
        branchRegularBasicPay: staff.branchRegularBasicPay + matchingRegion.regionRegularBasicPay,
        branchTraineeBasicPay:
          staff.branchTraineeBasicPay + (matchingRegion.regionTraineeBasicPay || 0),
        branchAllowances: staff.branchAllowances + matchingRegion.regionAllowances,
        branchBmAllowance: staff.branchBmAllowance + matchingRegion.regionBmAllowance,
        branchRegularOT: staff.branchRegularOT + matchingRegion.regionRegularOT,
        branchTraineeOT: staff.branchTraineeOT + (matchingRegion.regionTraineeOT || 0),
        branchCola: staff.branchCola + (matchingRegion.regionCola || 0),
        branchIncome1: staff.branchIncome1 + matchingRegion.regionIncome1,
        branchIncome2: staff.branchIncome2 + matchingRegion.regionIncome2,
        branchNightpremium: staff.branchNightpremium + matchingRegion.regionNightpremium,
        branchRegularLate: staff.branchRegularLate + matchingRegion.regionRegularLate,
        branchTraineeLate: staff.branchTraineeLate + (matchingRegion.regionTraineeLate || 0),
        branchRegularLeave: staff.branchRegularLeave + matchingRegion.regionRegularLeave,
        branchTraineeLeave: staff.branchTraineeLeave + (matchingRegion.regionTraineeLeave || 0),
        branchOtherDeductions: staff.branchOtherDeductions + matchingRegion.regionOtherDeductions,
        branchtotalNet: staff.branchtotalNet + (matchingRegion.regionTotalNet || 0),
      });
    } else {
      result.push({ ...staff });
    }
  });
  return result;
};

const mergeStaffAndAreaDataEdi = (staffData, area) => {
  const result = [];
  staffData.forEach((staff) => {
    const matchingArea = area.find(
      (a) => a.region === staff.region && a.department === staff.department,
    );
    if (matchingArea) {
      result.push({
        ...staff,
        regionEmployeeCount: staff.regionEmployeeCount + matchingArea.areaEmployeeCount,
        branchRegularBasicPay: staff.branchRegularBasicPay + matchingArea.areaRegularBasicPay,
        branchTraineeBasicPay: staff.branchTraineeBasicPay + matchingArea.areaTraineeBasicPay,
        branchAllowances: staff.branchAllowances + matchingArea.areaAllowances,
        branchBmAllowance: staff.branchBmAllowance + matchingArea.areaBmAllowance,
        branchRegularOT: staff.branchRegularOT + matchingArea.areaRegularOT,
        branchTraineeOT: staff.branchTraineeOT + matchingArea.areaTraineeOT,
        branchCola: staff.branchCola + matchingArea.areaCola,
        branchIncome1: staff.branchIncome1 + matchingArea.areaIncome1,
        branchIncome2: staff.branchIncome2 + matchingArea.areaIncome2,
        branchNightpremium: staff.branchNightpremium + matchingArea.areaNightpremium,
        branchRegularLate: staff.branchRegularLate + matchingArea.areaRegularLate,
        branchTraineeLate: staff.branchTraineeLate + matchingArea.areaTraineeLate,
        branchRegularLeave: staff.branchRegularLeave + matchingArea.areaRegularLeave,
        branchTraineeLeave: staff.branchTraineeLeave + matchingArea.areaTraineeLeave,
        branchOtherDeductions: staff.branchOtherDeductions + matchingArea.areaOtherDeductions,
        branchtotalNet: staff.branchtotalNet + matchingArea.areaTotalNet,
      });
    } else {
      result.push({ ...staff });
    }
  });
  return result;
};

const generateEDIPayrollReport = async (dbPool, payrollTable, date) => {
  const query = `SELECT * FROM ${payrollTable} WHERE enddate = ? AND region NOT IN ('mancomm', 'mancomml', 'support', 'supportl') ORDER BY region, branch`;
  const [results] = await dbPool.query(query, [date]);

  let staffPayroll = staffDataFilter(results);
  staffPayroll = processStaffDataEdi(staffPayroll);
  const branchCount = getBranchCountsEdi(staffPayroll);

  let areaPayroll = areaDataFilter(results);
  areaPayroll = processAreaDataEdi(areaPayroll);
  areaPayroll = mergeAreaAndCalculateEdi(areaPayroll, branchCount);

  let regionPayroll = regionDataFilter(results);
  regionPayroll = processRegionDataEdi(regionPayroll);
  regionPayroll = mergeRegionAndCalculateEdi(regionPayroll, branchCount);

  staffPayroll = mergeStaffAndRegionDataEdi(staffPayroll, regionPayroll);
  const ediData = mergeStaffAndAreaDataEdi(staffPayroll, areaPayroll);

  return { results: ediData };
};

// ----------------------------------------- REMITTANCE REPORT ----------------------------------------- //
const processNewStaffRemittanceData = (data) => {
  const branchData = {};
  data.forEach(
    ({
      branch,
      region,
      department,
      boscode,
      costCenter,
      sssee,
      ssser,
      sssloan,
      pagibigee,
      pagibiger,
      pagibigloan,
      philhealthee,
      philhealther,
      region_code,
      zone_code,
      region_description,
    }) => {
      if (!branchData[region]) branchData[region] = {};
      if (!branchData[region][branch]) {
        branchData[region][branch] = {
          department,
          boscode,
          employeeBranchCount: 0,
          branchSSSee: 0,
          branchSSSer: 0,
          branchSSSLoan: 0,
          branchPagibigee: 0,
          branchPagibiger: 0,
          branchPagibigloan: 0,
          branchPhilhealthee: 0,
          branchPhilhealther: 0,
          branchTotalContri: 0,
          costCenter,
          region_code,
          zone_code,
          region_description,
        };
      }
      branchData[region][branch].employeeBranchCount += 1;
      branchData[region][branch].branchSSSee += Number(sssee) || 0;
      branchData[region][branch].branchSSSer += Number(ssser) || 0;
      branchData[region][branch].branchSSSLoan += Number(sssloan) || 0;
      branchData[region][branch].branchPagibigee += Number(pagibigee) || 0;
      branchData[region][branch].branchPagibiger += Number(pagibiger) || 0;
      branchData[region][branch].branchPagibigloan += Number(pagibigloan) || 0;
      branchData[region][branch].branchPhilhealthee += Number(philhealthee) || 0;
      branchData[region][branch].branchPhilhealther += Number(philhealther) || 0;
      branchData[region][branch].branchTotalContri +=
        (Number(sssee) || 0) +
        (Number(ssser) || 0) +
        (Number(pagibigee) || 0) +
        (Number(pagibiger) || 0) +
        (Number(philhealthee) || 0) +
        (Number(philhealther) || 0);
    },
  );

  const sortedResults = [];
  for (const [region, branches] of Object.entries(branchData)) {
    for (const [branch, vals] of Object.entries(branches)) {
      sortedResults.push({ region, branch, ...vals });
    }
  }
  return sortedResults.sort((a, b) => {
    if (a.region !== b.region) return a.region.localeCompare(b.region);
    if (a.branch !== b.branch) return a.branch.localeCompare(b.branch);
    return b.employeeBranchCount - a.employeeBranchCount;
  });
};

const processNewAreaRemittanceData = (data) => {
  const departmentData = {};
  data.forEach(
    ({
      department,
      region,
      sssee,
      ssser,
      sssloan,
      philhealthee,
      philhealther,
      pagibigee,
      pagibiger,
      pagibigloan,
    }) => {
      if (!departmentData[region]) departmentData[region] = {};
      if (!departmentData[region][department]) {
        departmentData[region][department] = {
          areaEmployeeCount: 0,
          areaSSSee: 0,
          areaSSSer: 0,
          areaSSSLoan: 0,
          areaPagibigee: 0,
          areaPagibiger: 0,
          areaPagibigloan: 0,
          areaPhilhealthee: 0,
          areaPhilhealther: 0,
          areaTotalContri: 0,
        };
      }
      departmentData[region][department].areaEmployeeCount += 1;
      departmentData[region][department].areaSSSee += sssee || 0;
      departmentData[region][department].areaSSSer += ssser || 0;
      departmentData[region][department].areaSSSLoan += sssloan || 0;
      departmentData[region][department].areaPagibigee += pagibigee || 0;
      departmentData[region][department].areaPagibiger += pagibiger || 0;
      departmentData[region][department].areaPagibigloan += pagibigloan || 0;
      departmentData[region][department].areaPhilhealthee += philhealthee || 0;
      departmentData[region][department].areaPhilhealther += philhealther || 0;
      departmentData[region][department].areaTotalContri +=
        (sssee || 0) +
        (ssser || 0) +
        (pagibigee || 0) +
        (pagibiger || 0) +
        (philhealthee || 0) +
        (philhealther || 0);
    },
  );

  const sortedResults = [];
  for (const [region, departments] of Object.entries(departmentData)) {
    for (const [department, vals] of Object.entries(departments)) {
      sortedResults.push({ region, department, ...vals });
    }
  }
  return sortedResults.sort((a, b) => {
    if (a.region !== b.region) return a.region.localeCompare(b.region);
    if (a.department !== b.department) return a.department.localeCompare(b.department);
    return b.areaEmployeeCount - a.areaEmployeeCount;
  });
};

const processNewRegionRemittanceData = (data) => {
  const regionData = {};
  data.forEach(
    ({
      region,
      sssee,
      ssser,
      sssloan,
      philhealthee,
      philhealther,
      pagibigee,
      pagibiger,
      pagibigloan,
    }) => {
      if (!regionData[region]) {
        regionData[region] = {
          regionSSSee: 0,
          regionSSSer: 0,
          regionSSSLoan: 0,
          regionPagibigee: 0,
          regionPagibiger: 0,
          regionPagibigloan: 0,
          regionPhilhealthee: 0,
          regionPhilhealther: 0,
          regionTotalContri: 0,
          regionEmployeeCount: 0,
        };
      }
      regionData[region].regionSSSee += sssee || 0;
      regionData[region].regionSSSer += ssser || 0;
      regionData[region].regionSSSLoan += sssloan || 0;
      regionData[region].regionPagibigee += pagibigee || 0;
      regionData[region].regionPagibigloan += pagibigloan || 0;
      regionData[region].regionPagibiger += pagibiger || 0;
      regionData[region].regionPhilhealthee += philhealthee || 0;
      regionData[region].regionPhilhealther += philhealther || 0;
      regionData[region].regionTotalContri +=
        (sssee || 0) +
        (ssser || 0) +
        (pagibigee || 0) +
        (pagibiger || 0) +
        (philhealthee || 0) +
        (philhealther || 0);
      regionData[region].regionEmployeeCount += 1;
    },
  );

  return Object.entries(regionData)
    .map(([region, vals]) => ({ region, ...vals }))
    .sort((a, b) => a.region.localeCompare(b.region));
};

const mergeAreaAndCalculateRemit = (department, branchcount) => {
  const result = [];
  department.forEach((dept) => {
    const matchingBranchCount = branchcount.find((b) => b.region === dept.region);
    if (matchingBranchCount) {
      const branchCountForDepartment = matchingBranchCount.countbranchdepartment[dept.department];
      if (branchCountForDepartment) {
        result.push({
          region: dept.region,
          department: dept.department,
          areaEmployeeCount: dept.areaEmployeeCount,
          areaSSSee: dept.areaSSSee / branchCountForDepartment,
          areaSSSer: dept.areaSSSer / branchCountForDepartment,
          areaPagibigee: dept.areaPagibigee / branchCountForDepartment,
          areaPagibiger: dept.areaPagibiger / branchCountForDepartment,
          areaPhilhealthee: dept.areaPhilhealthee / branchCountForDepartment,
          areaPhilhealther: dept.areaPhilhealther / branchCountForDepartment,
          areaTotalContri: dept.areaTotalContri / branchCountForDepartment,
        });
      }
    }
  });
  return result;
};

const mergeRegionAndCalculateRemit = (regionData, branchCountData) => {
  const branchCountMap = branchCountData.reduce((acc, item) => {
    acc[item.region] = item.countbranch;
    return acc;
  }, {});
  return regionData.map((region) => {
    const branchCount = branchCountMap[region.region] || 1;
    return {
      region: region.region,
      regionEmployeeCount: region.regionEmployeeCount,
      regionSSSee: region.regionSSSee / branchCount,
      regionSSSer: region.regionSSSer / branchCount,
      regionPagibigee: region.regionPagibigee / branchCount,
      regionPagibiger: region.regionPagibiger / branchCount,
      regionPhilhealthee: region.regionPhilhealthee / branchCount,
      regionPhilhealther: region.regionPhilhealther / branchCount,
      regionTotalContri: region.regionTotalContri / branchCount,
    };
  });
};

const mergeStaffAndRegionRemit = (staffdata, region) => {
  const result = [];
  region.forEach((regionData) => {
    const matchingBranchData = staffdata.filter((b) => b.region === regionData.region);
    matchingBranchData.forEach((branchData) => {
      result.push({
        ...branchData,
        regionEmployeeCount: regionData.regionEmployeeCount,
        branchSSSee: branchData.branchSSSee + regionData.regionSSSee,
        branchSSSer: branchData.branchSSSer + regionData.regionSSSer,
        branchPagibigee: branchData.branchPagibigee + regionData.regionPagibigee,
        branchPagibiger: branchData.branchPagibiger + regionData.regionPagibiger,
        branchPhilhealthee: branchData.branchPhilhealthee + regionData.regionPhilhealthee,
        branchPhilhealther: branchData.branchPhilhealther + regionData.regionPhilhealther,
        branchTotalContri: branchData.branchTotalContri + regionData.regionTotalContri,
      });
    });
  });
  return result;
};

const mergeStaffAndAreaRemit = (staffData, area) => {
  return staffData.map((staff) => {
    const matchingArea = area.find(
      (a) => a.region === staff.region && a.department === staff.department,
    );
    return {
      ...staff,
      regionEmployeeCount:
        staff.regionEmployeeCount + (matchingArea ? matchingArea.areaEmployeeCount : 0),
      branchSSSee: staff.branchSSSee + (matchingArea ? matchingArea.areaSSSee : 0),
      branchSSSer: staff.branchSSSer + (matchingArea ? matchingArea.areaSSSer : 0),
      branchPagibigee: staff.branchPagibigee + (matchingArea ? matchingArea.areaPagibigee : 0),
      branchPagibiger: staff.branchPagibiger + (matchingArea ? matchingArea.areaPagibiger : 0),
      branchPhilhealthee:
        staff.branchPhilhealthee + (matchingArea ? matchingArea.areaPhilhealthee : 0),
      branchPhilhealther:
        staff.branchPhilhealther + (matchingArea ? matchingArea.areaPhilhealther : 0),
      branchTotalContri:
        staff.branchTotalContri + (matchingArea ? matchingArea.areaTotalContri : 0),
    };
  });
};

const generateNewEDIRemittanceReport = async (dbPool, payrollTable, date) => {
  const day = new Date(date).getDate();

  const queryDay15 = `SELECT 
      p.boscode,
      p.enddate AS 'MONTH',
      p.lastname AS 'LAST NAME',
      p.firstname AS 'FIRST NAME',
      p.branch,
      p.department,
      p.designation,
      sum(s.ssser) as ssser,
      sum(p.ssscontri) AS sssee,
      sum(s.ssser + p.ssscontri) AS ssstotal,
      sum(p.sssloan) as sssloan,
      p.region_code,
      p.zone_code,
      p.region_description,
      p.pagibigcontri AS pagibigee,
      CASE 
          WHEN DAY(p.enddate) IN (28, 29, 30, 31) THEN g.pag_value
          ELSE 0 
      END AS pagibiger,
      -- sum(p.pagibigloan) as pagibigloan,
      sum(p.pagibigcontri + g.pag_value) AS pagibigtotal,
      sum(p.filmalending) AS philhealthee,
      sum(p.filmalending) AS philhealther,
      sum(p.filmalending * 2) AS philhealthtotal,
      p.region 
  FROM 
      ${payrollTable} p
  LEFT JOIN 
      sssphtable s ON s.sssee = p.ssscontri
  CROSS JOIN 
      (SELECT pag_value FROM gov_pagibig LIMIT 1) g
  WHERE 
      p.enddate = ?  
      AND p.region NOT IN ('mancomm', 'mancomml', 'support', 'supportl')  
  GROUP BY p.branch
  ORDER BY p.region, p.branch;`;

  const queryDefault = `SELECT 
      p.boscode,
      p.enddate AS 'MONTH',
      p.lastname AS 'LAST NAME',
      p.firstname AS 'FIRST NAME',
      p.branch,
      p.department,
      p.designation,
      s.ssser,
      p.ssscontri AS sssee,
      (s.ssser + p.ssscontri) AS ssstotal,
      p.sssloan,
      p.region_code,
      p.zone_code,
      p.region_description,
      p.pagibigcontri AS pagibigee,
      CASE 
          WHEN DAY(p.enddate) IN (28, 29, 30, 31) THEN g.pag_value
          ELSE 0 
      END AS pagibiger,
      -- p.pagibigloan as pagibigloan,
      (p.pagibigcontri + g.pag_value) AS pagibigtotal,
      p.filmalending AS philhealthee,
      p.filmalending AS philhealther,
      (p.filmalending * 2) AS philhealthtotal,
      p.region 
  FROM 
      ${payrollTable} p
  LEFT JOIN 
      sssphtable s ON s.sssee = p.ssscontri
  CROSS JOIN 
      (SELECT pag_value FROM gov_pagibig LIMIT 1) g
  WHERE 
      p.enddate = ?  
      AND p.region NOT IN ('mancomm', 'mancomml', 'support', 'supportl')  
  ORDER BY p.region, p.branch;`;

  const query = day === 15 ? queryDay15 : queryDefault;
  const [results] = await dbPool.query(query, [date]);

  // Day 15: return the grouped rows as-is, no merge pipeline — same as the old system.
  if (day === 15) {
    return { results };
  }
  console.log(query);
  // Other days: run through the staff/area/region merge pipeline.
  let staffRemittance = staffDataFilter(results);
  staffRemittance = processNewStaffRemittanceData(staffRemittance);
  const branchCount = getBranchCountsEdi(staffRemittance);

  let areaPayrollRemit = areaDataFilter(results);
  areaPayrollRemit = processNewAreaRemittanceData(areaPayrollRemit);
  areaPayrollRemit = mergeAreaAndCalculateRemit(areaPayrollRemit, branchCount);

  let regionPayrollRemit = regionDataFilter(results);
  regionPayrollRemit = processNewRegionRemittanceData(regionPayrollRemit);
  regionPayrollRemit = mergeRegionAndCalculateRemit(regionPayrollRemit, branchCount);

  staffRemittance = mergeStaffAndRegionRemit(staffRemittance, regionPayrollRemit);
  const ediRemittance = mergeStaffAndAreaRemit(staffRemittance, areaPayrollRemit);

  return { results: ediRemittance };
};

const generateEDIDeductionDetailsReport = async (dbPool, payrollTable, date) => {
  const query = `SELECT region, 
    SUM(incometax) AS tax, SUM(ssscontri) AS ssscontri, SUM(sssloan) AS sssloan,
    SUM(pagibigcontri) AS pagibigcontri, SUM(pagibigloan) AS pagibigloan,
    SUM(filmalending) AS philhealth, SUM(coated) AS coated, SUM(c_hmo) AS hmo,
    SUM(canteen) AS opec_support, SUM(deductionamount1) deduction1, SUM(deductionamount2) deduction2,
    SUM(mlfund) AS mlfund, SUM(opec) AS opec, SUM(overappraisal) AS over,
    SUM(cooprecla) AS coop_recla, SUM(installaccount) AS install_account,
    SUM(ticket) AS ticket, SUM(mobilebill) AS telecoms,
    SUM(sakoprovi) as mortuary, SUM(sakocommodity) as fake, SUM(sakoprime) as other_deductions,
    SUM(sakoemergency) AS sako, SUM(sakopettycash) AS motor_loan
  FROM ${payrollTable}
  WHERE enddate = ? AND region NOT IN ('mancomm','mancomml','managers','managerl')
  GROUP BY region;`;

  const [results] = await dbPool.query(query, [date]);
  return { results };
};

const generateFSPayrollReport = async (dbPool, payrollTable, date, selectedRegion) => {
  const query = `SELECT 
    department,
    SUM(IF(employmentstatus = 'REGULAR', basicpay, 0)) AS basic_regular,
    SUM(IF(employmentstatus != 'REGULAR', basicpay, 0)) AS basic_trainee,
    SUM(TOTALALLOW - BMALLOW) AS allowances,
    SUM(bmAllow) AS bm_allowance,
    SUM(IF(employmentstatus = 'REGULAR', (totalOT - NIGHTPREMIUM), 0)) AS ot_regular,
    SUM(IF(employmentstatus != 'REGULAR', (totalOT - NIGHTPREMIUM), 0)) AS ot_trainee,
    SUM(cola) AS cola,
    SUM(incomeamount1) AS salary_adjustment,
    SUM(incomeamount2) AS refund,
    SUM(NIGHTPREMIUM) AS graveyard,
    SUM(GROSS) AS total_income,
    SUM(IF(employmentstatus = 'REGULAR', lates, 0)) AS late_regular,
    SUM(IF(employmentstatus != 'REGULAR', lates, 0)) AS late_trainee,
    SUM(IF(employmentstatus = 'REGULAR', LEAVES, 0)) AS leave_regular,
    SUM(IF(employmentstatus != 'REGULAR', LEAVES, 0)) AS leave_trainee,
    SUM(incomeTax) AS income_tax,
    SUM(ssscontri) AS sss_contribution,
    SUM(sssLoan) AS sss_loan,
    SUM(filmalending) AS philhealth,
    SUM(pagibigcontri) AS pagibig_contribution,
    SUM(pagibigloan) AS pagibig_loan,
    SUM(coated) AS coated,
    SUM(c_hmo) AS hmo,
    SUM(canteen) AS opec_support,
    SUM(deductionAmount1) AS deduction1,
    SUM(deductionAmount2) AS deduction2,
    SUM(mlFund) AS mlfund,
    SUM(opec) AS opec,
    SUM(overAppraisal) AS over_appraisal,
    SUM(coopRecla) AS coop_recla,
    SUM(installAccount) AS installment_account,
    SUM(ticket) AS ticket,
    SUM(mobileBill) AS telecoms,
    SUM(sakoProvi) AS mortuary,
    SUM(sakoCommodity) AS fake,
    SUM(sakoPrime) AS other_deductions,
    SUM(sakoEmergency) AS sako,
    SUM(sakoPettycash) AS motor_loan,
    SUM(TOTALDEDUCTION) AS total_deduction,
    SUM(GROSS - TOTALDEDUCTION) AS total_net
  FROM ${payrollTable}
  WHERE enddate = ? AND region = ?
  GROUP BY department;`;

  const [results] = await dbPool.query(query, [date, selectedRegion]);
  return { results };
};

const payrollMonth = (dateString) => {
  const date = new Date(dateString);
  const test = date.getMonth() + 1; // Add 1 for 1-based month
  if (test < 10) {
    return `0${test}`;
  } else {
    return test;
  }
};

function formatMysqlDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

const EXCLUDED_REGIONS = ['MANCOMM', 'MANCOMML'];

const queryAsync = async (pool, sql, params) => {
  const [rows] = await pool.query(sql, params);
  return rows;
};

const buildDetailQuery = (table) => `
  SELECT
    IDNO AS idno,
    MAX(REGION) AS region,
    MAX(LASTNAME) AS lastname,
    MAX(FIRSTNAME) AS firstname,
    MAX(DEPARTMENT) AS department,
    SUM(BASICPAY) AS basicpay,
    SUM(TOTALOT) AS totalot,
    SUM(TOTALALLOW) AS totalallow,
    SUM(INCOMEAMOUNT1 + INCOMEAMOUNT2) AS income
  FROM ${table}
  WHERE ENDDATE IN (?, ?) AND REGION NOT IN (?, ?)
  GROUP BY IDNO
  ORDER BY region, department, lastname, firstname;
`;

const splitByRegionGroup = (rows) => ({
  nonSupport: rows.filter((row) => (row.region || '').toLowerCase() !== 'support'),
  support: rows.filter((row) => (row.region || '').toLowerCase() === 'support'),
});

const summarizeByRegion = (rows) => {
  const totals = new Map();

  for (const row of rows) {
    if (!totals.has(row.region)) {
      totals.set(row.region, {
        region: row.region,
        basicpay: 0,
        totalot: 0,
        totalallow: 0,
        income: 0,
      });
    }
    const entry = totals.get(row.region);
    entry.basicpay += Number(row.basicpay) || 0;
    entry.totalot += Number(row.totalot) || 0;
    entry.totalallow += Number(row.totalallow) || 0;
    entry.income += Number(row.income) || 0;
  }

  return [...totals.values()].sort((a, b) => a.region.localeCompare(b.region));
};

const formatPayrollDate = (year, month) => `${year}-${month}-15`;

const subtractOneYear = (sourceDate) => {
  const d = new Date(sourceDate);
  d.setFullYear(d.getFullYear() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const generatePayrollComparison = async (office, dbPool, endDate) => {
  if (!office || !dbPool || !endDate) {
    throw new Error(
      'office, dbPool, and endDate are required to generate the payroll comparison report.',
    );
  }

  const cutoffDate = new Date(endDate);
  if (Number.isNaN(cutoffDate.getTime())) {
    throw new Error(`Invalid endDate provided: ${endDate}`);
  }

  const currentYear = cutoffDate.getFullYear();
  const previousYear = currentYear - 1;
  const month = payrollMonth(cutoffDate); // existing helper, e.g. "05"

  const currentTable = `${getTableName(office)}_${currentYear}`;
  const pastTable = `${getTableName(office)}_${previousYear}`;

  const currentParams = [
    formatPayrollDate(currentYear, month),
    formatMysqlDate(cutoffDate),
    ...EXCLUDED_REGIONS,
  ];
  const pastParams = [
    formatPayrollDate(previousYear, month),
    subtractOneYear(cutoffDate),
    ...EXCLUDED_REGIONS,
  ];

  const [currentSettled, pastSettled] = await Promise.allSettled([
    queryAsync(dbPool, buildDetailQuery(currentTable), currentParams),
    queryAsync(dbPool, buildDetailQuery(pastTable), pastParams),
  ]);

  if (currentSettled.status === 'rejected') {
    throw new Error(
      `Error fetching payroll comparison data for ${currentYear}: ${currentSettled.reason.message}`,
    );
  }
  const detailsResult = currentSettled.value;

  let detailsPastResult = [];
  if (pastSettled.status === 'fulfilled') {
    detailsPastResult = pastSettled.value;
  } else {
    console.warn(
      `[generatePayrollComparison] No data for ${previousYear}: ${pastSettled.reason.message}`,
    );
  }

  const { nonSupport: nonSupportGroup, support: supportGroup } = splitByRegionGroup(detailsResult);
  const { nonSupport: nonSupportPastGroup, support: supportPastGroup } =
    splitByRegionGroup(detailsPastResult);

  return {
    results: {
      nonSupportGroup,
      supportGroup,
      summaryResult: summarizeByRegion(detailsResult),
      nonSupportPastGroup,
      supportPastGroup,
      summaryPastResult: summarizeByRegion(detailsPastResult),
    },
  };
};

// const generatePayrollComparison = async (office, dbPool, endDate) => {
//   const date = new Date(endDate);

//   const year = date.getFullYear();

//   const firstPayDate = (year) => `${year}-${payrollMonth(date)}-15`;
//   const pastYear = year - 1;

//   const subtractYear = (dateStr) => {
//     let date = new Date(dateStr);
//     date.setFullYear(date.getFullYear() - 1);
//     const year = date.getFullYear();
//     const month = String(date.getMonth() + 1).padStart(2, '0');
//     const day = String(date.getDate()).padStart(2, '0');
//     return `${year}-${month}-${day}`;
//   };

//   const formatQuery = (sql, params) => {
//     if (!params || params.length === 0) return sql;

//     return sql.replace(/\?/g, () => {
//       const value = params.shift();
//       return typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value;
//     });
//   };

//   const queries = [
//     {
//       sql: `SELECT ENDDATE AS paymonth, region, lastname, firstname, department,
//             SUM(BASICPAY) AS basicpay, SUM(TOTALOT) AS totalot,
//             SUM(TOTALALLOW) AS totalallow, SUM(INCOMEAMOUNT1 + INCOMEAMOUNT2) AS income, idno
//             FROM ${getTableName(office)}_${year}
//             WHERE enddate IN (?, ?) GROUP BY IDNO AND REGION NOT IN ('MANCOMM', 'MANCOMML')
//             ORDER BY REGION, DEPARTMENT, LASTNAME, FIRSTNAME;`,
//       params: [firstPayDate(year), formatMysqlDate(date)],
//     },
//     {
//       sql: `SELECT region, SUM(BASICPAY) AS basicpay, SUM(TOTALOT) AS totalot,
//             SUM(TOTALALLOW) AS totalallow, SUM(INCOMEAMOUNT1 + INCOMEAMOUNT2) AS income , idno
//             FROM ${getTableName(office)}_${year}
//             WHERE ENDDATE IN (?, ?) AND REGION NOT IN ('MANCOMM', 'MANCOMML')
//             GROUP BY REGION ORDER BY REGION, DEPARTMENT;`,
//       params: [firstPayDate(year), formatMysqlDate(date)],
//     },
//     {
//       sql: `SELECT ENDDATE AS paymonth, region, lastname, firstname, department,
//             SUM(BASICPAY) AS basicpay, SUM(TOTALOT) AS totalot,
//             SUM(TOTALALLOW) AS totalallow, SUM(INCOMEAMOUNT1 + INCOMEAMOUNT2) AS income, idno
//             FROM ${getTableName(office)}_${pastYear}
//             WHERE enddate IN (?, ?) AND REGION NOT IN ('MANCOMM', 'MANCOMML')  GROUP BY IDNO
//             ORDER BY REGION, DEPARTMENT, LASTNAME, FIRSTNAME;`,
//       params: [firstPayDate(pastYear), subtractYear(date)],
//     },
//     {
//       sql: `SELECT region, SUM(BASICPAY) AS basicpay, SUM(TOTALOT) AS totalot,
//             SUM(TOTALALLOW) AS totalallow, SUM(INCOMEAMOUNT1 + INCOMEAMOUNT2) AS income , idno
//             FROM ${getTableName(office)}_${pastYear}
//             WHERE ENDDATE IN (?, ?) AND REGION NOT IN ('MANCOMM', 'MANCOMML')
//             GROUP BY REGION ORDER BY REGION, DEPARTMENT;`,
//       params: [firstPayDate(pastYear), subtractYear(date)],
//     },
//   ];

//   try {
//     // Execute all queries asynchronously
//     const results = await Promise.all(
//       queries.map((query) => {
//         const formattedQuery = formatQuery(query.sql, [...query.params]); // Create a copy for formatting
//         // console.log("Executing query:", formattedQuery); // Log the formatted query

//         return new Promise((resolve, reject) => {
//           dbPool.query(query.sql, query.params, (err, result) => {
//             if (err) return reject(err);
//             resolve(result);
//           });
//           console.log('Executing query:', formattedQuery);
//         });
//       }),
//     );

//     // Split results into respective groups
//     const [detailsResult, summaryResult, detailsPastResult, summaryPastResult] = results;

//     const nonSupportGroup = detailsResult.filter(
//       (row) => (row.region || '').toLowerCase() !== 'support',
//     );
//     const supportGroup = detailsResult.filter(
//       (row) => (row.region || '').toLowerCase() === 'support',
//     );

//     const nonSupportPastGroup = detailsPastResult.filter(
//       (row) => (row.region || '').toLowerCase() !== 'support',
//     );
//     const supportPastGroup = detailsPastResult.filter(
//       (row) => (row.region || '').toLowerCase() === 'support',
//     );

//     // Return structured results
//     return {
//       results: {
//         nonSupportGroup,
//         supportGroup,
//         summaryResult,
//         nonSupportPastGroup,
//         supportPastGroup,
//         summaryPastResult,
//       },
//     };
//   } catch (err) {
//     throw new Error(`Error fetching OT Report: ${err.message}`);
//   }
// };

function getTableName(office) {
  switch ((office || '').toLowerCase()) {
    case 'luzon':
      return 'luzpayroll';

    case 'vismin':
      return 'payroll';

    case 'mlinc':
      return 'payroll_transactions_mlinc';

    default:
      return 'defaultpayroll';
  }
}

const generateOTReport = async (dbPool, payrollTable, endDate, region) => {
  if (!dbPool || !payrollTable || !endDate) {
    throw new Error('dbPool, payrollTable and endDate are required.');
  }

  const regionClause = region && region.trim() ? ' AND region = ?' : '';

  const queryDetails = `
SELECT
    region,
    lastname,
    firstname,
    datehired,
    designation,
    branch,
    department,
    basicpay,

    (otord / 60) AS OTHours,
    OTORDINARY AS OTORD,

    (otpast / 60) AS SHOTHours,
    OTSPECIAL AS SHOT,

    (OTHOLI / 60) AS LHOTHours,
    OTHOLIDAY AS LHOT,

    (ESHOT / 60) AS ESHOTHours,
    OTEXCSSPECIAL AS otsx,

    (ELHOT / 60) AS ELHOTHours,
    OTEXCSHOLIDAY,

    NIGHTPREMIUM AS nprem

FROM ${payrollTable}

WHERE enddate = ?
AND (
  otordinary +
  otholiday +
  OTSPECIAL +
  OTEXCSSPECIAL +
  OTEXCSHOLIDAY +
  NIGHTPREMIUM
) > 0

${regionClause}

ORDER BY
region,
lastname,
firstname
`;

  const querySummary = `
SELECT
    REGION,

    COUNT(IDNO) AS count,

    SUM(otord / 60) AS otordhours,
    SUM(OTORDINARY) AS otordsum,

    SUM(otpast / 60) AS shotothours,
    SUM(OTSPECIAL) AS shot,

    SUM(OTHOLI / 60) AS lhotothours,
    SUM(OTHOLIDAY) AS lhot,

    SUM(ESHOT / 60) AS eshotothours,
    SUM(OTEXCSSPECIAL) AS OTEXCSSPECIAL,

    SUM(ELHOT / 60) AS elhotothours,
    SUM(OTEXCSHOLIDAY) AS OTEXCSHOLIDAY,

    SUM(NIGHTPREMIUM) AS nprem

FROM ${payrollTable}

WHERE enddate = ?
AND (
  otordinary +
  otholiday +
  OTSPECIAL +
  OTEXCSSPECIAL +
  OTEXCSHOLIDAY +
  NIGHTPREMIUM
) > 0

${regionClause}

GROUP BY REGION

ORDER BY REGION
`;

  const queryParams = region && region.trim() ? [endDate, region] : [endDate];

  try {
    const [[detailsResult], [summaryResult]] = await Promise.all([
      dbPool.query(queryDetails, queryParams),
      dbPool.query(querySummary, queryParams),
    ]);

    const nonSupportGroup = detailsResult.filter((row) => row.region?.toLowerCase() !== 'support');

    const supportGroup = detailsResult.filter((row) => row.region?.toLowerCase() === 'support');
    console.log('non supportgroup', nonSupportGroup);
    return {
      results: {
        nonSupportGroup,
        supportGroup,
        summaryResult,
      },
    };
  } catch (err) {
    throw new Error(`Error generating OT Report: ${err.message}`);
  }
};

const generatePayrollData = async (dbPool, payrollTable, endDate, region) => {
  if (!dbPool || !payrollTable || !endDate) {
    throw new Error('dbPool, payrollTable and endDate are required.');
  }

  const regionClause = region && region.trim() ? ' AND region = ?' : '';

  const queryDetails = `
SELECT
    region,
    department,
    enddate,
    employmentstatus,
    lastname,
    firstname,
    designation,
    datehired,
    branch,
    basicpay,
    managementallow,
    travelallow,
    bmallow,
    abmallow,
    housingallow,
    supervisoryallow1,
    supervisoryallow2,
    auditorsallow,
    totalallow,
    totalot,
    cola,
    otherincdesc1,
    incomeamount1,
    otherincdesc2,
    incomeamount2,
    gross,
    lates,
    leaves,
    incometax,
    ssscontri,
    pagibigcontri,
    sssloan,
    pagibigloan,
    mlfund,
    opec,
    overappraisal,
    cooprecla,
    filmalending AS philhealth,
    installaccount,
    ticket,
    mobilebill,
    canteen,
    sakoprovi,
    sakocommodity,
    sakoprime,
    sakoemergency,
    sakopettycash,
    sakocbu,
    sakosavings,
    deductiondesc1,
    deductionamount1,
    deductiondesc2,
    deductionamount2,
    coated,
    c_hmo,
    totalnet

FROM ${payrollTable}

WHERE enddate = ?
${regionClause}

ORDER BY
region,
department,
lastname,
firstname
`;

  const querySummary = `
SELECT
    region,
    enddate,

    COUNT(idno) AS count,

    SUM(basicpay) AS basicpay,
    SUM(managementallow) AS managementallow,
    SUM(travelallow) AS travelallow,
    SUM(bmallow) AS bmallow,
    SUM(abmallow) AS abmallow,
    SUM(housingallow) AS housingallow,
    SUM(supervisoryallow1) AS supervisoryallow1,
    SUM(supervisoryallow2) AS supervisoryallow2,
    SUM(auditorsallow) AS auditorsallow,

    SUM(otord / 60) AS otordinhours,
    SUM(otordinary) AS otord,

    SUM(otpast / 60) AS shotinhours,
    SUM(otspecial) AS shot,

    SUM(otholi / 60) AS lhotinhours,
    SUM(otholiday) AS lhot,

    SUM(eshot / 60) AS eshotinhours,
    SUM(otexcsspecial) AS otexcsspecial,

    SUM(elhot / 60) AS elhotinhours,
    SUM(otexcsholiday) AS otexcsholiday,

    SUM(nightpremium) AS nprem,

    (SUM(incomeamount1) + SUM(incomeamount2)) AS otherincome,

    SUM(totaldeduction) AS totaldeduction

FROM ${payrollTable}

WHERE enddate = ?
${regionClause}

GROUP BY region

ORDER BY region
`;

  const queryParams = region && region.trim() ? [endDate, region] : [endDate];

  try {
    const [[detailsResult], [summaryResult]] = await Promise.all([
      dbPool.query(queryDetails, queryParams),
      dbPool.query(querySummary, queryParams),
    ]);

    const mancommGroup = detailsResult.filter((row) =>
      row.region?.toLowerCase().includes('mancom'),
    );

    const nonSupportGroup = detailsResult.filter(
      (row) =>
        row.region?.toLowerCase() !== 'support' && !row.region?.toLowerCase().includes('mancom'),
    );

    const supportGroup = detailsResult.filter((row) => row.region?.toLowerCase() === 'support');

    return {
      results: {
        nonSupportGroup,
        supportGroup,
        mancommGroup,
        summaryResult,
      },
    };
  } catch (err) {
    throw new Error(`Error generating Payroll Data: ${err.message}`);
  }
};

const generateDirectPayroll = async (dbPool, payrollTable, endDate, region) => {
  const payrollDate = new Date(endDate);
  const day = payrollDate.getDate();
  const monthIndex = payrollDate.getMonth();
  const year = payrollDate.getFullYear();

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const monthName = monthNames[monthIndex];

  const cycle = day === 15 ? 'First Cycle' : day >= 28 && day <= 31 ? 'Second Cycle' : null;

  if (!cycle) {
    throw new Error('Invalid payroll date. Day must be 15 or between 28 and 31.');
  }

  let query = `
    SELECT 
      p.idno AS 'id',  
      CONCAT(p.LASTNAME, ', ', p.FIRSTNAME, ' ', COALESCE(m.employeemi, '')) AS 'name', 
      ? AS 'month', 
      ? AS 'year',
      ? AS 'cycle', 
      ROUND(p.minutesworked/480) AS 'daysworked', 
      IF(p.EMPLOYMENTSTATUS = 'REGULAR', 15, 13) AS 'totaldays', 
      p.TOTALNET AS 'netpay'
    FROM ${payrollTable} p 
    LEFT JOIN MASTER m ON p.idno = m.employeeid
    WHERE DATE(p.enddate) = DATE(?)
  `;

  const queryParams = [monthName, String(year), cycle, endDate];

  if (region && region.trim() !== '') {
    query += ` AND p.region = ?`;
    queryParams.push(region);
  }

  query += ` ORDER BY p.REGION, p.LASTNAME, p.FIRSTNAME`;

  console.log('Query:', query);
  console.log('Query Parameters:', queryParams);

  try {
    // FIXED: Use dbPool.query directly (it returns a Promise)
    const [results] = await dbPool.query(query, queryParams);

    console.log(`Found ${results.length} records`);
    if (results.length === 0) {
      console.warn('No records found. Check if data exists for the given criteria.');
    }
    return { results };
  } catch (err) {
    console.error('SQL ERROR:', err);
    throw new Error(`Error fetching Payroll Report: ${err.message}`);
  }
};

function generateMonthlyRatePdfFile(doc, data, type) {
  // Group by region
  const groupedData = {};
  data.forEach((emp) => {
    if (!groupedData[emp.region]) groupedData[emp.region] = [];
    groupedData[emp.region].push(emp);
  });

  // Add data to PDF by region
  Object.keys(groupedData).forEach((region, regionIndex) => {
    if (regionIndex > 0) doc.addPage();

    // Add header with report type
    addMonthlyRateHeader(doc, region, data[0].enddate, type);

    // Add employee data with department column always shown
    addMonthlyRateEmployeeData(doc, region, groupedData[region], type);
  });
}

const addMonthlyRateEmployeeData = (doc, region, employees, reportType) => {
  // Add table header with department column always shown
  addMonthlyRateTableHeader(doc);

  // Initialize counter for total employees
  let totalEmployees = 0;

  // Define table dimensions
  const tableStartX = 50;
  const tableEndX = doc.page.width - 50;
  const tableWidth = tableEndX - tableStartX;

  // Always show 4 columns with wider department
  const columns = [
    { header: 'IDNO', widthPercent: 11, align: 'left' },
    { header: 'DEPARTMENT', widthPercent: 30, align: 'left' },
    { header: 'EMPLOYEE NAME', widthPercent: 37, align: 'left' },
    { header: 'MONTHLY RATE', widthPercent: 22, align: 'right' },
  ];

  // Calculate absolute column positions
  let currentX = tableStartX;
  columns.forEach((col) => {
    col.x = currentX;
    col.width = (tableWidth * col.widthPercent) / 100;
    currentX += col.width;
  });

  // Row height configuration
  const rowHeight = 15;
  const cellPadding = 5;

  // Add employee data
  employees.forEach((employee) => {
    const remainingHeight = doc.page.height - doc.y - doc.page.margins.bottom;

    // Check if there's enough space for another row
    if (remainingHeight < rowHeight) {
      doc.addPage();
      addMonthlyRateHeader(doc, region, employees[0].enddate, reportType);
      addMonthlyRateTableHeader(doc);
    }

    const rowY = doc.y;

    // FIXED: Properly convert to number and format with commas
    let amount = parseFloat(employee.amount) || 0;

    // Format with comma separators and 2 decimal places
    const formattedAmount = amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    // Draw the row border
    doc.lineWidth(0.5).rect(tableStartX, rowY, tableWidth, rowHeight).stroke();

    // Add vertical dividers between columns
    let dividerX = tableStartX;
    for (let i = 1; i < columns.length; i++) {
      dividerX += columns[i - 1].width;
      doc
        .moveTo(dividerX, rowY)
        .lineTo(dividerX, rowY + rowHeight)
        .stroke();
    }

    // Add cell content - Always show 4 columns
    doc.font('Helvetica').fontSize(9);

    // Column 0: IDNO
    doc.text(employee.idno || 'N/A', columns[0].x + cellPadding, rowY + 5, {
      width: columns[0].width - cellPadding * 2,
      align: columns[0].align,
    });

    // Column 1: DEPARTMENT
    doc.text(employee.department || 'N/A', columns[1].x + cellPadding, rowY + 5, {
      width: columns[1].width - cellPadding * 2,
      align: columns[1].align,
    });

    // Column 2: EMPLOYEE NAME
    doc.text(employee.employee || 'N/A', columns[2].x + cellPadding, rowY + 5, {
      width: columns[2].width - cellPadding * 2,
      align: columns[2].align,
    });

    // Column 3: MONTHLY RATE - Now with proper comma formatting
    doc.text(formattedAmount, columns[3].x + cellPadding, rowY + 5, {
      width: columns[3].width - cellPadding * 2,
      align: columns[3].align,
    });

    doc.y = rowY + rowHeight;
    totalEmployees += 1;
  });

  // Add summary - ONLY total employee count
  const summaryRowHeight = 30;
  const remainingHeightAfterData = doc.page.height - doc.y - doc.page.margins.bottom;

  if (remainingHeightAfterData < summaryRowHeight) {
    doc.addPage();
    addMonthlyRateHeader(doc, region, employees[0].enddate, reportType);
  }

  // Draw line above summary
  const summaryStartY = doc.y;
  doc.moveTo(tableStartX, summaryStartY).lineTo(tableEndX, summaryStartY).stroke();

  doc.moveDown(0.5);
  const summaryY = doc.y;

  // Draw Total Employees only (left side)
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .text(`Total Employees: ${totalEmployees}`, tableStartX, summaryY);

  // Draw the first line
  const firstLineY = summaryY + 15;
  doc.moveTo(tableStartX, firstLineY).lineTo(tableEndX, firstLineY).stroke();

  // Draw the second line with a small gap
  const smallGap = 5;
  const secondLineY = firstLineY + smallGap;
  doc.moveTo(tableStartX, secondLineY).lineTo(tableEndX, secondLineY).stroke();

  // Signature lines
  const certifiedCorrectY = secondLineY + 15;
  doc
    .font('Helvetica')
    .fontSize(8)
    .text('Certified Correct: ____________________', tableStartX, certifiedCorrectY);

  const AuthorizedByY = certifiedCorrectY + 20;
  doc.text('Authorized Signature: ____________________', tableStartX, AuthorizedByY);

  const ReceivedByY = AuthorizedByY + 20;
  doc.text('Received By: ____________________', tableStartX, ReceivedByY);

  doc.moveDown(0.5);
  doc.fontSize(6).text(`Printed on: ${new Date().toLocaleString()}`, { align: 'right' });
};

const addMonthlyRateTableHeader = (doc) => {
  const headerY = doc.y;
  const rowHeight = 15;
  const cellPadding = 5;

  const tableStartX = 50;
  const tableEndX = doc.page.width - 50;
  const tableWidth = tableEndX - tableStartX;

  // Always show 4 columns with wider department
  const columns = [
    { header: 'IDNO', widthPercent: 11, align: 'left' }, // Reduced from 15%
    { header: 'DEPARTMENT', widthPercent: 30, align: 'left' }, // Increased from 25%
    { header: 'EMPLOYEE NAME', widthPercent: 37, align: 'left' }, // Slightly reduced
    { header: 'MONTHLY RATE', widthPercent: 22, align: 'right' }, // Kept the same
  ];

  // Calculate absolute column positions
  let currentX = tableStartX;
  columns.forEach((col) => {
    col.x = currentX;
    col.width = (tableWidth * col.widthPercent) / 100;
    currentX += col.width;
  });

  // Draw the header row
  doc.lineWidth(0.5).rect(tableStartX, headerY, tableWidth, rowHeight).stroke();

  // Add vertical dividers between columns
  let dividerX = tableStartX;
  for (let i = 1; i < columns.length; i++) {
    dividerX += columns[i - 1].width;
    doc
      .moveTo(dividerX, headerY)
      .lineTo(dividerX, headerY + rowHeight)
      .stroke();
  }

  // Add header text
  doc.font('Helvetica-Bold').fontSize(9);
  columns.forEach((col) => {
    doc.text(col.header, col.x + cellPadding, headerY + 5, {
      width: col.width - cellPadding * 2,
      align: col.align,
    });
  });

  doc.y = headerY + rowHeight;
};

const addMonthlyRateHeader = (doc, region, date, reportType) => {
  const logoPath = path.join(__dirname, '../public/images/logo.png');
  const logoWidth = 200;
  const xPosition = (doc.page.width - logoWidth) / 2;

  doc.image(logoPath, xPosition, 45, { width: logoWidth });
  doc.moveDown(0.8);

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('HUMAN RESOURCES MANAGEMENT DIVISION', { align: 'center' });
  doc.moveDown(0.5);

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(`${reportType.toUpperCase()} REPORT`, { align: 'center' });
  doc.moveDown(0.5);

  // Region with bold
  const regionY = doc.y;
  const regionText = `Region/Division: ${region}`;
  doc.font('Helvetica-Bold').fontSize(9).text(regionText, 50, regionY);

  // Payroll Date header
  const formattedDate = formatDateString(date);
  const payrollDateY = doc.y;
  const payrollDateText = `Payroll Date: ${formattedDate}`;
  doc.font('Helvetica-Bold').fontSize(9).text(payrollDateText, 50, payrollDateY);
  doc.moveDown(0.8);
};

// Inside payrollModel.js - Add these new functions

function generateDeductionReportPdf(doc, data, reportTitle) {
  const groupedData = {};
  data.forEach((emp) => {
    if (!groupedData[emp.region]) groupedData[emp.region] = [];
    groupedData[emp.region].push(emp);
  });

  const sortedRegions = Object.keys(groupedData).sort();

  sortedRegions.forEach((region, regionIndex) => {
    if (regionIndex > 0) doc.addPage();

    const employees = groupedData[region];
    const payrollDate = employees[0]?.enddate; // capture once per region

    addDeductionReportHeader(doc, region, payrollDate, reportTitle);

    const tableData = prepareDeductionTableData(employees, reportTitle);
    // Pass region + date through so continuation pages can reuse them
    drawDeductionReportTable(doc, tableData, reportTitle, region, payrollDate);
  });
}

// function addDeductionReportHeader(doc, region, date, reportTitle) {
//   const logoPath = path.join(__dirname, '../public/images/logo.png');
//   const logoWidth = 200;
//   const xPosition = (doc.page.width - logoWidth) / 2;

//   doc.image(logoPath, xPosition, 45, { width: logoWidth });
//   doc.moveDown(0.8);

//   doc
//     .font('Helvetica-Bold')
//     .fontSize(9)
//     .text('HUMAN RESOURCES MANAGEMENT DIVISION', { align: 'center' });
//   doc.moveDown(0.5);

//   doc.font('Helvetica-Bold').fontSize(10).text(reportTitle.toUpperCase(), { align: 'center' });
//   doc.moveDown(0.5);

//   const regionY = doc.y;
//   doc.font('Helvetica-Bold').fontSize(9).text(`Region/Division: ${region}`, 50, regionY);

//   if (date) {
//     const formattedDate = formatDateString(date);
//     const payrollDateY = doc.y;
//     doc.font('Helvetica-Bold').fontSize(9).text(`Payroll Date: ${formattedDate}`, 50, payrollDateY);
//   }
//   doc.moveDown(0.8);
// }

function addDeductionReportHeader(doc, region, date, reportTitle) {
  const logoPath = path.join(__dirname, '../public/images/logo.png');
  const logoWidth = 140;
  const startY = 20;
  const xPosition = (doc.page.width - logoWidth) / 2;

  // Get the logo's real dimensions so we scale height correctly instead of guessing
  const logoImage = doc.openImage(logoPath);
  const logoHeight = (logoImage.height / logoImage.width) * logoWidth;

  doc.image(logoImage, xPosition, startY, { width: logoWidth });

  // Position cursor using the ACTUAL rendered height, not a hardcoded guess
  doc.y = startY + logoHeight + 6;

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('HUMAN RESOURCES MANAGEMENT DIVISION', { align: 'center' });
  doc.moveDown(0.3);

  doc.font('Helvetica-Bold').fontSize(10).text(reportTitle.toUpperCase(), { align: 'center' });
  doc.moveDown(0.5);

  const regionY = doc.y;
  doc.font('Helvetica-Bold').fontSize(9).text(`Region/Division: ${region}`, 50, regionY);

  if (date) {
    const formattedDate = formatDateString(date);
    const payrollDateY = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).text(`Payroll Date: ${formattedDate}`, 50, payrollDateY);
  }
  doc.moveDown(0.8);
}

function prepareDeductionTableData(employees, reportTitle) {
  // Define columns and data extraction based on report type
  let columns = [];
  let dataFields = [];

  switch (reportTitle) {
    case 'Deduction Report 1':
      columns = [
        'EMPLOYEE NAME',
        'LATES',
        'LEAVES',
        'INCOME TAX',
        'SSS CONTRI',
        'SSS LOAN',
        'PAGIBIG CONTRI',
        'PAGIBIG LOAN',
        'PHILHEALTH',
        'TOTAL',
      ];
      dataFields = [
        'employee',
        'lates',
        'leaves',
        'income_tax',
        'sss_contribution',
        'sss_loan',
        'pagibig_contribution',
        'pagibig_loan',
        'philhealth',
        'total',
      ];
      break;

    case 'Deduction Report 2':
      columns = [
        'EMPLOYEE NAME',
        'FAKE',
        'INSTALL ACCOUNT',
        'COATED',
        'OVER APPRAISAL',
        'COOP RECLA',
        'TELECOMS',
        'MORTUARY',
        'OVER PAYMENTS',
        'TOTAL',
      ];
      dataFields = [
        'employee',
        'fake',
        'installment_account',
        'coated',
        'over_appraisal',
        'coop_recla',
        'telecoms',
        'mortuary',
        'over_payments',
        'total',
      ];
      break;

    case 'Deduction Report 3':
      columns = [
        'EMPLOYEE NAME',
        'HMO',
        'ML FUND',
        'OPEC',
        'OPEC TICKET',
        'OPEC SUPPORT',
        'SAKO',
        'MOTOR LOAN',
        'GPA INSURANCE',
        'OTHER DEDUCTIONS',
        'TOTAL',
      ];
      dataFields = [
        'employee',
        'hmo',
        'ml_fund',
        'opec',
        'opec_ticket',
        'opec_support',
        'sako',
        'motor_loan',
        'gpa_insurance',
        'other_deductions',
        'total',
      ];
      break;

    default:
      return { columns: [], rows: [], totals: [] };
  }

  // Prepare rows
  const rows = employees.map((emp) => {
    return dataFields.map((field) => {
      if (field === 'employee') return emp.employee || 'N/A';
      return Number(emp[field] || 0);
    });
  });

  // Calculate totals
  const totals = dataFields.map((field, index) => {
    if (field === 'employee') return 'TOTAL';
    return rows.reduce((sum, row) => sum + row[index], 0);
  });

  return { columns, rows, totals };
}

// function drawDeductionReportTable(doc, tableData, reportTitle) {
//   // const margin = 50;
//   // const pageWidth = doc.page.width;
//   // const availableWidth = pageWidth - margin * 2;
//   // const rowHeight = 15;
//   // const cellPadding = 4;

//   // const numColumns = tableData.columns.length;
//   // const employeeColWidth = 25;
//   // const otherColWidth = (100 - employeeColWidth) / (numColumns - 1);

//   // let currentX = margin;
//   // // const colPositions = tableData.columns.map((col, index) => {
//   // //   const widthPercent = index === 0 ? employeeColWidth : otherColWidth;
//   // //   const width = (availableWidth * widthPercent) / 100;
//   // //   const pos = { x: currentX, width: width };
//   // //   currentX += width;
//   // //   return pos;
//   // // });
//   // const colPositions = computeColumnWidths(doc, tableData, availableWidth, 8);
//   const margin = 50;
//   const pageWidth = doc.page.width;
//   const availableWidth = pageWidth - margin * 2;
//   const rowHeight = 15;
//   const cellPadding = 4;

//   const colPositions = computeColumnWidths(doc, tableData, availableWidth, 8);

//   // Draw table header (now height-aware so wrapped labels don't overflow)
//   function drawHeader(y) {
//     doc.font('Helvetica-Bold').fontSize(8);

//     // 1. Measure how tall each column label will be once wrapped
//     const usableWidths = colPositions.map((pos) => pos.width - cellPadding * 2);
//     const labelHeights = tableData.columns.map((col, idx) =>
//       doc.heightOfString(col, { width: usableWidths[idx] }),
//     );
//     const maxLabelHeight = Math.max(...labelHeights);

//     // 2. Header row height = whatever is taller: fixed rowHeight or the wrapped text
//     const headerHeight = Math.max(rowHeight, maxLabelHeight + 4);

//     // 3. Draw each label into that full height
//     tableData.columns.forEach((col, idx) => {
//       doc.text(col, colPositions[idx].x + cellPadding, y + 2, {
//         width: usableWidths[idx],
//         align: idx === 0 ? 'left' : 'right',
//       });
//     });

//     // 4. Underline goes below the tallest wrapped label, not a fixed offset
//     const lineY = y + headerHeight - 2;
//     doc
//       .moveTo(margin, lineY)
//       .lineTo(pageWidth - margin, lineY)
//       .stroke();
//     doc.y = y + headerHeight;
//   }

//   // Draw data rows
//   function drawRow(row, y) {
//     doc.font('Helvetica').fontSize(8);
//     row.forEach((cell, idx) => {
//       const displayValue = typeof cell === 'number' ? formatNumber(cell) : cell;
//       doc.text(displayValue, colPositions[idx].x + cellPadding, y + 2, {
//         width: colPositions[idx].width - cellPadding * 2,
//         align: idx === 0 ? 'left' : 'right',
//       });
//     });
//     doc.y = y + rowHeight;
//   }

//   // Start drawing
//   let currentY = doc.y + 5;
//   drawHeader(currentY);
//   currentY = doc.y;

//   // Draw each row with page break handling
//   tableData.rows.forEach((row, index) => {
//     // Check for page break
//     if (currentY > doc.page.height - margin - rowHeight * 4) {
//       doc.addPage();
//       const regionText = reportTitle.includes('Continuation') ? 'Continuation' : '';
//       addDeductionReportHeader(doc, regionText, null, reportTitle);
//       currentY = doc.y + 5;
//       drawHeader(currentY);
//       currentY = doc.y;
//     }

//     drawRow(row, currentY);
//     currentY = doc.y;
//   });

//   // Draw total row
//   const totalY = currentY + 3;
//   if (totalY > doc.page.height - margin - 60) {
//     doc.addPage();
//     addDeductionReportHeader(doc, 'Continuation', null, reportTitle);
//     currentY = doc.y + 5;
//     drawHeader(currentY);
//     currentY = doc.y;
//   }

//   // Separator line
//   doc
//     .moveTo(margin, doc.y)
//     .lineTo(pageWidth - margin, doc.y)
//     .stroke();
//   doc.moveDown(0.3);

//   // Total row
//   doc.font('Helvetica-Bold').fontSize(8);
//   const summaryY = doc.y;
//   tableData.totals.forEach((total, idx) => {
//     const displayValue = typeof total === 'number' ? formatNumber(total) : total;
//     doc.text(displayValue, colPositions[idx].x + cellPadding, summaryY + 2, {
//       width: colPositions[idx].width - cellPadding * 2,
//       align: idx === 0 ? 'left' : 'right',
//     });
//   });

//   doc.y = summaryY + rowHeight;

//   // Double underline
//   const lineY1 = doc.y;
//   doc
//     .moveTo(margin, lineY1)
//     .lineTo(pageWidth - margin, lineY1)
//     .lineWidth(1.5)
//     .stroke();
//   doc
//     .moveTo(margin, lineY1 + 3)
//     .lineTo(pageWidth - margin, lineY1 + 3)
//     .lineWidth(1.5)
//     .stroke();

//   // Employee count
//   doc.font('Helvetica').fontSize(8);
//   const countY = lineY1 + 10;
//   doc.text(`Total Employees: ${tableData.rows.length}`, margin, countY);

//   // Signature lines
//   const certifiedY = countY + 15;
//   doc.font('Helvetica').fontSize(8);
//   doc.text('Certified Correct: ____________________', margin, certifiedY);
//   const authorizedY = certifiedY + 15;
//   doc.text('Authorized Signature: ____________________', margin, authorizedY);
//   const receivedY = authorizedY + 15;
//   doc.text('Received By: ____________________', margin, receivedY);

//   doc.moveDown(0.3);
//   doc.fontSize(6).text(`Printed on: ${new Date().toLocaleString()}`, { align: 'right' });
// }

function drawDeductionReportTable(doc, tableData, reportTitle, region, payrollDate) {
  const margin = 50; // still used for left/right horizontal positioning
  const bottomMargin = doc.page.margins.bottom; // now 10 for deduction reports, 50 elsewhere
  const pageWidth = doc.page.width;
  const availableWidth = pageWidth - margin * 2;
  const rowHeight = 15;
  const cellPadding = 4;

  const colPositions = computeColumnWidths(doc, tableData, availableWidth, 8);

  function drawHeader(y) {
    doc.font('Helvetica-Bold').fontSize(8);

    const usableWidths = colPositions.map((pos) => pos.width - cellPadding * 2);
    const labelHeights = tableData.columns.map((col, idx) =>
      doc.heightOfString(col, { width: usableWidths[idx] }),
    );
    const maxLabelHeight = Math.max(...labelHeights);
    const headerHeight = Math.max(rowHeight, maxLabelHeight + 4);

    tableData.columns.forEach((col, idx) => {
      doc.text(col, colPositions[idx].x + cellPadding, y + 2, {
        width: usableWidths[idx],
        align: idx === 0 ? 'left' : 'right',
      });
    });

    const lineY = y + headerHeight - 2;
    doc
      .moveTo(margin, lineY)
      .lineTo(pageWidth - margin, lineY)
      .stroke();
    doc.y = y + headerHeight;
  }

  function drawRow(row, y) {
    doc.font('Helvetica').fontSize(8);
    row.forEach((cell, idx) => {
      const displayValue = typeof cell === 'number' ? formatNumber(cell) : cell;
      doc.text(displayValue, colPositions[idx].x + cellPadding, y + 2, {
        width: colPositions[idx].width - cellPadding * 2,
        align: idx === 0 ? 'left' : 'right',
      });
    });
    doc.y = y + rowHeight;
  }

  let currentY = doc.y + 5;
  drawHeader(currentY);
  currentY = doc.y;

  // Draw each row with page break handling
  tableData.rows.forEach((row, index) => {
    // Use bottomMargin instead of hardcoded margin
    //if (currentY > doc.page.height - bottomMargin - rowHeight * 4) {
    if (currentY > doc.page.height - bottomMargin - rowHeight * 1.5) {
      doc.addPage();
      addDeductionReportHeader(doc, region, payrollDate, reportTitle);
      currentY = doc.y + 5;
      drawHeader(currentY);
      currentY = doc.y;
    }

    drawRow(row, currentY);
    currentY = doc.y;
  });

  // Draw total row
  const totalY = currentY + 3;
  //if (totalY > doc.page.height - bottomMargin - 60) {
  if (totalY > doc.page.height - bottomMargin - (rowHeight + 10)) {
    doc.addPage();
    addDeductionReportHeader(doc, region, payrollDate, reportTitle);
    currentY = doc.y + 5;
    drawHeader(currentY);
    currentY = doc.y;
  }

  // Separator line
  doc
    .moveTo(margin, doc.y)
    .lineTo(pageWidth - margin, doc.y)
    .stroke();
  doc.moveDown(0.3);

  // Total row
  doc.font('Helvetica-Bold').fontSize(8);
  const summaryY = doc.y;
  tableData.totals.forEach((total, idx) => {
    const displayValue = typeof total === 'number' ? formatNumber(total) : total;
    doc.text(displayValue, colPositions[idx].x + cellPadding, summaryY + 2, {
      width: colPositions[idx].width - cellPadding * 2,
      align: idx === 0 ? 'left' : 'right',
    });
  });

  doc.y = summaryY + rowHeight;

  // Double underline
  const lineY1 = doc.y;
  doc
    .moveTo(margin, lineY1)
    .lineTo(pageWidth - margin, lineY1)
    .lineWidth(1.5)
    .stroke();
  doc
    .moveTo(margin, lineY1 + 3)
    .lineTo(pageWidth - margin, lineY1 + 3)
    .lineWidth(1.5)
    .stroke();

  // Employee count
  doc.font('Helvetica').fontSize(8);
  const countY = lineY1 + 10;
  doc.text(`Total Employees: ${tableData.rows.length}`, margin, countY);

  // Signature lines
  const certifiedY = countY + 15;
  doc.font('Helvetica').fontSize(8);
  doc.text('Certified Correct: ____________________', margin, certifiedY);
  const authorizedY = certifiedY + 15;
  doc.text('Authorized Signature: ____________________', margin, authorizedY);
  const receivedY = authorizedY + 15;
  doc.text('Received By: ____________________', margin, receivedY);

  doc.moveDown(0.3);
  doc.fontSize(6).text(`Printed on: ${new Date().toLocaleString()}`, { align: 'right' });
}

function computeColumnWidths(doc, tableData, availableWidth, fontSize = 8) {
  const cellPadding = 4;
  const numColumns = tableData.columns.length;

  doc.font('Helvetica-Bold').fontSize(fontSize);

  // Measure the widest content per column across header + rows + totals
  const maxContentWidths = tableData.columns.map((col, idx) => {
    let maxWidth = doc.widthOfString(col);

    tableData.rows.forEach((row) => {
      const val = row[idx];
      const display = typeof val === 'number' ? formatNumber(val) : val;
      maxWidth = Math.max(maxWidth, doc.widthOfString(String(display)));
    });

    const totalVal = tableData.totals[idx];
    const totalDisplay = typeof totalVal === 'number' ? formatNumber(totalVal) : totalVal;
    maxWidth = Math.max(maxWidth, doc.widthOfString(String(totalDisplay)));

    return maxWidth + cellPadding * 2;
  });

  // Employee name column: give it generous minimum room, everything else based on content
  const nameColMinWidth = 110;
  maxContentWidths[0] = Math.max(maxContentWidths[0], nameColMinWidth);

  const totalNeeded = maxContentWidths.reduce((a, b) => a + b, 0);

  let colWidths;
  if (totalNeeded <= availableWidth) {
    // Content fits — give employee name column the leftover space
    const leftover = availableWidth - totalNeeded;
    colWidths = maxContentWidths.map((w, idx) => (idx === 0 ? w + leftover : w));
  } else {
    // Content doesn't fit even at minimum — scale everything down proportionally
    const scale = availableWidth / totalNeeded;
    colWidths = maxContentWidths.map((w) => w * scale);
  }

  let currentX = 50; // margin
  return colWidths.map((width) => {
    const pos = { x: currentX, width };
    currentX += width;
    return pos;
  });
}

module.exports = {
  generatePayrollReportData,
  executePayrollTask,
  // Export utility functions if they need to be used elsewhere
  getDates,
  getPayrollFolder,
  handleInvalidDate,
  bonusUpdater,
  deductionUpdater,
  updateRegularEmployees,
  updatePhilhealthDeductions,
  generateMlFundPdf,
  generatePdf,
  processUploadedPayroll,
  generatePayrollComparison,
};
