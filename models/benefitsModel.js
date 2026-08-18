//const utilitiesModel = require("./utilitiesModel");
// const db = require("../config/db");

// // ── Same pattern as old working code ─────────────────────────────────────────
// function getDBForOffice(office) {
//   const lower = office.toLowerCase();
//   if (lower.includes("luzon")) return { tableName: "luzpayroll" };
//   if (lower.includes("vismin")) return { tableName: "payroll" };
//   if (lower.includes("ml group")) return { tableName: "mlpayroll" };
//   throw new Error("Unknown office.");
// }

// function payrollYear(dateString) {
//   return new Date(dateString).getFullYear();
// }

// // ── Report types from bnf_reports using db.default (same as utilitiesModel) ──
// async function getBenefitsReportTypes() {
//   const [rows] = await db.default.query(
//     `SELECT report_name AS reporttype FROM bnf_reports ORDER BY report_name`,
//   );
//   return rows;
// }

// // ── Main dispatcher ───────────────────────────────────────────────────────────
// async function generateBenefitsReportData({
//   startDate,
//   endDate,
//   office,
//   region,
//   reportType,
// }) {
//   const date = endDate;
//   const dbInfo = getDBForOffice(office);
//   const year = payrollYear(date);

//   let data = [];
//   let message = "";
//   let hasIssues = false;

//   const type = reportType.toLowerCase().trim();

//   if (type === "sss contribution") {
//     data = await _sssContribution(date, year, dbInfo, region);
//   } else if (type === "pagibig contribution") {
//     data = await _pagibigContribution(date, year, dbInfo, region);
//   } else if (type === "pagibig contribution final") {
//     data = await _pagibigContributionFinal(date, year, dbInfo, region, office);
//   } else if (type === "philhealth contribution") {
//     data = await _philhealthContribution(date, year, dbInfo, region, office);
//   } else if (type === "sss loan") {
//     data = await _sssLoan(date, year, dbInfo, region);
//   } else if (type === "pagibig loan") {
//     data = await _pagibigLoan(date, year, dbInfo, region);
//   } else {
//     message = `Unsupported report type: ${reportType}`;
//     hasIssues = false;
//     return { message, data, hasIssues };
//   }

//   message =
//     data.length > 0 ? `Found ${data.length} records` : `No records found`;
//   hasIssues = data.length > 0;

//   return { message, data, hasIssues };
// }

// // ── Query functions — using db.default.query() same as utilitiesModel ────────

// async function _sssContribution(date, year, dbInfo, region) {
//   const hasRegion = region && region.trim() !== "";
//   const query = `
//     SELECT idno, region, department, lastname, firstname, middlename,
//       (SELECT ssser FROM sssphtable WHERE sssee = ssscontri LIMIT 1) AS ssser,
//       ssscontri AS sssee
//     FROM ${dbInfo.tableName}_${year}
//     WHERE enddate = ?
//     ${hasRegion ? "AND region = ?" : ""}
//     ORDER BY region, lastname, firstname
//   `;
//   const params = hasRegion ? [date, region] : [date];
//   const [rows] = await db.default.query(query, params);
//   return rows;
// }

// async function _pagibigContribution(date, year, dbInfo, region) {
//   const hasRegion = region && region.trim() !== "";
//   const query = `
//     SELECT idno, region, lastname, firstname, middlename, department, pagibigcontri,
//     FROM ${dbInfo.tableName}_${year}
//     WHERE enddate = ?
//     ${hasRegion ? "AND region = ?" : ""}
//     ORDER BY region, lastname, firstname
//   `;
//   const params = hasRegion ? [date, region] : [date];
//   const [rows] = await db.default.query(query, params);
//   return rows;
// }

// async function _pagibigContributionFinal(date, year, dbInfo, region, office) {
//   const hasRegion = region && region.trim() !== "";
//   const lower = office.toLowerCase();

//   let query;
//   if (lower === "vismin") {
//     query = `
//       SELECT p.idno, p.region, p.lastname, p.firstname,
//         m.employeemi AS middlename, p.pagibigcontri,
//         m.employeepagibig AS pagibigno, m.employeebdate AS birthdate
//       FROM ${dbInfo.tableName}_${year} p
//       INNER JOIN 201file.master m ON p.idno = m.employeeid
//       WHERE p.enddate = ?
//       ${hasRegion ? "AND p.region = ?" : ""}
//       ORDER BY p.region, p.lastname, p.firstname
//     `;
//   } else if (lower === "luzon") {
//     query = `
//       SELECT p.idno, p.region, p.lastname, p.firstname,
//         m.middlename, p.pagibigcontri,
//         m.pagibig AS pagibigno, m.birthdate
//       FROM ${dbInfo.tableName}_${year} p
//       INNER JOIN hrluzon.hris201_payroll m ON p.idno = m.idno
//       WHERE p.enddate = ?
//       ${hasRegion ? "AND p.region = ?" : ""}
//       ORDER BY p.region, p.lastname, p.firstname
//     `;
//   } else {
//     query = `
//       SELECT p.idno, p.region, p.lastname, p.firstname,
//         m.employeemi AS middlename, p.pagibigcontri,
//         m.employeepagibig AS pagibigno, m.employeebdate AS birthdate
//       FROM ${dbInfo.tableName}_${year} p
//       INNER JOIN master m ON p.idno = m.employeeid
//       WHERE p.enddate = ?
//       ${hasRegion ? "AND p.region = ?" : ""}
//       ORDER BY p.region, p.lastname, p.firstname
//     `;
//   }

//   const params = hasRegion ? [date, region] : [date];
//   const [rows] = await db.default.query(query, params);
//   return rows;
// }

// async function _philhealthContribution(date, year, dbInfo, region, office) {
//   const hasRegion = region && region.trim() !== "";
//   const isMlGroup = office.toLowerCase() === "ml group";
//   const philhealthCol = isMlGroup ? "philhealth" : "filmalending";

//   const query = `
//     SELECT idno, region, department, lastname, firstname, middlename,
//       ${philhealthCol} AS philhealth
//     FROM ${dbInfo.tableName}_${year}
//     WHERE enddate = ?
//     ${hasRegion ? "AND region = ?" : ""}
//     ORDER BY region, lastname, firstname
//   `;
//   const params = hasRegion ? [date, region] : [date];
//   const [rows] = await db.default.query(query, params);
//   return rows;
// }

// async function _sssLoan(date, year, dbInfo, region) {
//   const hasRegion = region && region.trim() !== "";
//   const query = `
//     SELECT idno, region, lastname, firstname, middlename, sssloan
//     FROM ${dbInfo.tableName}_${year}
//     WHERE enddate = ? AND sssloan > 0
//     ${hasRegion ? "AND region = ?" : ""}
//     ORDER BY region, lastname, firstname
//   `;
//   const params = hasRegion ? [date, region] : [date];
//   const [rows] = await db.default.query(query, params);
//   return rows;
// }

// async function _pagibigLoan(date, year, dbInfo, region) {
//   const hasRegion = region && region.trim() !== "";
//   const query = `
//     SELECT idno, region, lastname, firstname, middlename, pagibigloan
//     FROM ${dbInfo.tableName}_${year}
//     WHERE enddate = ? AND pagibigloan > 0
//     ${hasRegion ? "AND region = ?" : ""}
//     ORDER BY region, lastname, firstname
//   `;
//   const params = hasRegion ? [date, region] : [date];
//   const [rows] = await db.default.query(query, params);
//   return rows;
// }

// module.exports = {
//   getBenefitsReportTypes,
//   generateBenefitsReportData,
// };

// //start of new code
// // ── Office → table name ───────────────────────────────────────────────────────
// function getDBForOffice(office) {
//   const lower = office.toLowerCase();
//   if (lower.includes("luzon")) return { tableName: "luzpayroll" };
//   if (lower.includes("vismin")) return { tableName: "payroll" };
//   if (lower.includes("ml group")) return { tableName: "mlpayroll" };
//   throw new Error("Unknown office.");
// }

// // ── Extract year from date string ─────────────────────────────────────────────
// function payrollYear(dateString) {
//   return new Date(dateString).getFullYear();
// }

// // ── Report types from bnf_reports ─────────────────────────────────────────────
// async function getBenefitsReportTypes(office) {
//   const pool = utilitiesModel.getDbPool(office);
//   const [rows] = await pool.query(
//     `SELECT report_name AS reporttype FROM bnf_reports ORDER BY report_name`,
//   );
//   return rows;
// }

// // ── Main dispatcher ───────────────────────────────────────────────────────────
// async function generateBenefitsReportData({
//   startDate,
//   endDate,
//   office,
//   region,
//   reportType,
// }) {
//   const date = endDate;
//   const dbInfo = getDBForOffice(office);
//   const year = payrollYear(date);

//   let data = [];
//   let message = "";
//   let hasData = false;

//   const type = reportType.toLowerCase().trim();

//   if (type === "sss contribution") {
//     data = await _sssContribution(date, year, dbInfo, region, office);
//   } else if (type === "pagibig contribution") {
//     data = await _pagibigContribution(date, year, dbInfo, region, office);
//   } else if (type === "pagibig contribution final") {
//     data = await _pagibigContributionFinal(date, year, dbInfo, region, office);
//   } else if (type === "philhealth contribution") {
//     data = await _philhealthContribution(date, year, dbInfo, region, office);
//   } else if (type === "sss loan") {
//     data = await _sssLoan(date, year, dbInfo, region, office);
//   } else if (type === "pagibig loan") {
//     data = await _pagibigLoan(date, year, dbInfo, region, office);
//   } else {
//     message = `Unsupported report type: ${reportType}`;
//     return { message, data, hasData };
//   }

//   hasData = data.length > 0;
//   message = hasData ? `Found ${data.length} records` : `No records found`;

//   return { message, data, hasData };
// }

// // ── Query functions ───────────────────────────────────────────────────────────

// async function _sssContribution(date, year, dbInfo, region, office) {
//   const hasRegion = region && region.trim() !== "";
//   const query = `
//     SELECT idno, region, department, lastname, firstname, middlename,
//       (SELECT ssser FROM sssphtable WHERE sssee = ssscontri LIMIT 1) AS ssser,
//       ssscontri AS sssee
//     FROM ${dbInfo.tableName}_${year}
//     WHERE enddate = ?
//     ${hasRegion ? "AND region = ?" : ""}
//     ORDER BY region, lastname, firstname
//   `;
//   const params = hasRegion ? [date, region] : [date];
//   const pool = utilitiesModel.getDbPool(office);
//   const [rows] = await pool.query(query, params);
//   return rows;
// }

// async function _pagibigContribution(date, year, dbInfo, region, office) {
//   const hasRegion = region && region.trim() !== "";
//   // FIX: removed trailing comma after pagibigcontri in the original
//   const query = `
//     SELECT idno, region, lastname, firstname, middlename, department, pagibigcontri
//     FROM ${dbInfo.tableName}_${year}
//     WHERE enddate = ?
//     ${hasRegion ? "AND region = ?" : ""}
//     ORDER BY region, lastname, firstname
//   `;
//   const params = hasRegion ? [date, region] : [date];
//   const pool = utilitiesModel.getDbPool(office);
//   const [rows] = await pool.query(query, params);
//   return rows;
// }

// async function _pagibigContributionFinal(date, year, dbInfo, region, office) {
//   const hasRegion = region && region.trim() !== "";
//   const lower = office.toLowerCase();

//   let query;
//   if (lower === "vismin") {
//     query = `
//       SELECT p.idno, p.region, p.lastname, p.firstname,
//         m.employeemi AS middlename, p.pagibigcontri,
//         m.employeepagibig AS pagibigno, m.employeebdate AS birthdate
//       FROM ${dbInfo.tableName}_${year} p
//       INNER JOIN 201file.master m ON p.idno = m.employeeid
//       WHERE p.enddate = ?
//       ${hasRegion ? "AND p.region = ?" : ""}
//       ORDER BY p.region, p.lastname, p.firstname
//     `;
//   } else if (lower === "luzon") {
//     query = `
//       SELECT p.idno, p.region, p.lastname, p.firstname,
//         m.middlename, p.pagibigcontri,
//         m.pagibig AS pagibigno, m.birthdate
//       FROM ${dbInfo.tableName}_${year} p
//       INNER JOIN hrluzon.hris201_payroll m ON p.idno = m.idno
//       WHERE p.enddate = ?
//       ${hasRegion ? "AND p.region = ?" : ""}
//       ORDER BY p.region, p.lastname, p.firstname
//     `;
//   } else {
//     // ml group
//     query = `
//       SELECT p.idno, p.region, p.lastname, p.firstname,
//         m.employeemi AS middlename, p.pagibigcontri,
//         m.employeepagibig AS pagibigno, m.employeebdate AS birthdate
//       FROM ${dbInfo.tableName}_${year} p
//       INNER JOIN master m ON p.idno = m.employeeid
//       WHERE p.enddate = ?
//       ${hasRegion ? "AND p.region = ?" : ""}
//       ORDER BY p.region, p.lastname, p.firstname
//     `;
//   }

//   const params = hasRegion ? [date, region] : [date];
//   const pool = utilitiesModel.getDbPool(office);
//   const [rows] = await pool.query(query, params);
//   return rows;
// }

// async function _philhealthContribution(date, year, dbInfo, region, office) {
//   const hasRegion = region && region.trim() !== "";
//   const isMlGroup = office.toLowerCase() === "ml group";
//   const philhealthCol = isMlGroup ? "philhealth" : "filmalending";

//   const query = `
//     SELECT idno, region, department, lastname, firstname, middlename,
//       ${philhealthCol} AS philhealth
//     FROM ${dbInfo.tableName}_${year}
//     WHERE enddate = ?
//     ${hasRegion ? "AND region = ?" : ""}
//     ORDER BY region, lastname, firstname
//   `;
//   const params = hasRegion ? [date, region] : [date];
//   const pool = utilitiesModel.getDbPool(office);
//   const [rows] = await pool.query(query, params);
//   return rows;
// }

// async function _sssLoan(date, year, dbInfo, region, office) {
//   const hasRegion = region && region.trim() !== "";
//   const query = `
//     SELECT idno, region, lastname, firstname, middlename, sssloan
//     FROM ${dbInfo.tableName}_${year}
//     WHERE enddate = ? AND sssloan > 0
//     ${hasRegion ? "AND region = ?" : ""}
//     ORDER BY region, lastname, firstname
//   `;
//   const params = hasRegion ? [date, region] : [date];
//   const pool = utilitiesModel.getDbPool(office);
//   const [rows] = await pool.query(query, params);
//   return rows;
// }

// async function _pagibigLoan(date, year, dbInfo, region, office) {
//   const hasRegion = region && region.trim() !== "";
//   const query = `
//     SELECT idno, region, lastname, firstname, middlename, pagibigloan
//     FROM ${dbInfo.tableName}_${year}
//     WHERE enddate = ? AND pagibigloan > 0
//     ${hasRegion ? "AND region = ?" : ""}
//     ORDER BY region, lastname, firstname
//   `;
//   const params = hasRegion ? [date, region] : [date];
//   const pool = utilitiesModel.getDbPool(office);
//   const [rows] = await pool.query(query, params);
//   return rows;
// }

// module.exports = {
//   getBenefitsReportTypes,
//   generateBenefitsReportData,
// };
// end of new code

// const utilitiesModel = require("./utilitiesModel");

// // ── Office → table name ───────────────────────────────────────────────────────
// function getDBForOffice(office) {
//   const lower = office.toLowerCase();
//   if (lower.includes("luzon")) return { tableName: "luzpayroll" };
//   if (lower.includes("vismin")) return { tableName: "payroll" };
//   if (lower.includes("ml group")) return { tableName: "mlpayroll" };
//   throw new Error("Unknown office.");
// }

// function payrollYear(dateString) {
//   return new Date(dateString).getFullYear();
// }

// // ── Report types from bnf_reports ─────────────────────────────────────────────
// async function getBenefitsReportTypes(office) {
//   const pool = utilitiesModel.getDbPool(office);
//   const [rows] = await pool.query(
//     `SELECT report_name AS reporttype FROM bnf_reports ORDER BY report_name`,
//   );
//   return rows;
// }

// // ── Validate that a payroll enddate actually exists in the target table ────────
// // Returns true if at least one record has that exact enddate, false otherwise.
// async function payrollDateExists(date, dbInfo, year, office) {
//   const pool = utilitiesModel.getDbPool(office);
//   const [rows] = await pool.query(
//     `SELECT 1 FROM ${dbInfo.tableName}_${year} WHERE enddate = ? LIMIT 1`,
//     [date],
//   );
//   return rows.length > 0;
// }

// // ── Main dispatcher ───────────────────────────────────────────────────────────
// async function generateBenefitsReportData({
//   startDate,
//   endDate,
//   office,
//   region,
//   reportType,
// }) {
//   const date = endDate;
//   const dbInfo = getDBForOffice(office);
//   const year = payrollYear(date);

//   // Pre-validate: confirm the endDate exists as a payroll cutoff date
//   const dateExists = await payrollDateExists(date, dbInfo, year, office);
//   if (!dateExists) {
//     return {
//       message: `No payroll data found for ${date}. Please check the date and try again.`,
//       data: [],
//       hasData: false,
//       dateExists: false,
//     };
//   }

//   let data = [];
//   let message = "";
//   let hasData = false;

//   const type = reportType.toLowerCase().trim();

//   if (type === "sss contribution") {
//     data = await _sssContribution(date, year, dbInfo, region, office);
//   } else if (type === "pagibig contribution") {
//     data = await _pagibigContribution(date, year, dbInfo, region, office);
//   } else if (type === "pagibig contribution final") {
//     data = await _pagibigContributionFinal(date, year, dbInfo, region, office);
//   } else if (type === "philhealth contribution") {
//     data = await _philhealthContribution(date, year, dbInfo, region, office);
//   } else if (type === "sss loan") {
//     data = await _sssLoan(date, year, dbInfo, region, office);
//   } else if (type === "pagibig loan") {
//     data = await _pagibigLoan(date, year, dbInfo, region, office);
//   } else {
//     return {
//       message: `Unsupported report type: ${reportType}`,
//       data: [],
//       hasData: false,
//       dateExists: true,
//     };
//   }

//   hasData = data.length > 0;
//   message = hasData ? `Found ${data.length} records` : `No records found`;

//   return { message, data, hasData, dateExists: true };
// }

// // ── Query functions ───────────────────────────────────────────────────────────

// async function _sssContribution(date, year, dbInfo, region, office) {
//   const hasRegion = region && region.trim() !== "";
//   const query = `
//     SELECT idno, region, department, lastname, firstname, middlename,
//       (SELECT ssser FROM sssphtable WHERE sssee = ssscontri LIMIT 1) AS ssser,
//       ssscontri AS sssee
//     FROM ${dbInfo.tableName}_${year}
//     WHERE enddate = ? AND ssscontri > 0
//     ${hasRegion ? "AND region = ?" : ""}
//     ORDER BY region, lastname, firstname
//   `;
//   const params = hasRegion ? [date, region] : [date];
//   const pool = utilitiesModel.getDbPool(office);
//   const [rows] = await pool.query(query, params);
//   return rows;
// }

// async function _pagibigContribution(date, year, dbInfo, region, office) {
//   const hasRegion = region && region.trim() !== "";
//   const query = `
//     SELECT idno, region, lastname, firstname, middlename, department, pagibigcontri
//     FROM ${dbInfo.tableName}_${year}
//     WHERE enddate = ? AND pagibigcontri > 0
//     ${hasRegion ? "AND region = ?" : ""}
//     ORDER BY region, lastname, firstname
//   `;
//   const params = hasRegion ? [date, region] : [date];
//   const pool = utilitiesModel.getDbPool(office);
//   const [rows] = await pool.query(query, params);
//   return rows;
// }

// async function _pagibigContributionFinal(date, year, dbInfo, region, office) {
//   const hasRegion = region && region.trim() !== "";
//   const lower = office.toLowerCase();

//   let query;
//   if (lower.includes("vismin")) {
//     query = `
//       SELECT p.idno, p.region, p.lastname, p.firstname,
//         m.employeemi AS middlename, p.pagibigcontri,
//         m.employeepagibig AS pagibigno, m.employeebdate AS birthdate
//       FROM ${dbInfo.tableName}_${year} p
//       INNER JOIN 201file.master m ON p.idno = m.employeeid
//       WHERE p.enddate = ? AND p.pagibigcontri > 0
//       ${hasRegion ? "AND p.region = ?" : ""}
//       ORDER BY p.region, p.lastname, p.firstname
//     `;
//   } else if (lower.includes("luzon")) {
//     query = `
//       SELECT p.idno, p.region, p.lastname, p.firstname,
//         m.middlename, p.pagibigcontri,
//         m.pagibig AS pagibigno, m.birthdate
//       FROM ${dbInfo.tableName}_${year} p
//       INNER JOIN hrluzon.hris201_payroll m ON p.idno = m.idno
//       WHERE p.enddate = ? AND p.pagibigcontri > 0
//       ${hasRegion ? "AND p.region = ?" : ""}
//       ORDER BY p.region, p.lastname, p.firstname
//     `;
//   } else {
//     // ml group
//     query = `
//       SELECT p.idno, p.region, p.lastname, p.firstname,
//         m.employeemi AS middlename, p.pagibigcontri,
//         m.employeepagibig AS pagibigno, m.employeebdate AS birthdate
//       FROM ${dbInfo.tableName}_${year} p
//       INNER JOIN master m ON p.idno = m.employeeid
//       WHERE p.enddate = ? AND p.pagibigcontri > 0
//       ${hasRegion ? "AND p.region = ?" : ""}
//       ORDER BY p.region, p.lastname, p.firstname
//     `;
//   }

//   const params = hasRegion ? [date, region] : [date];
//   const pool = utilitiesModel.getDbPool(office);
//   const [rows] = await pool.query(query, params);
//   return rows;
// }

// async function _philhealthContribution(date, year, dbInfo, region, office) {
//   const hasRegion = region && region.trim() !== "";
//   const isMlGroup = office.toLowerCase().includes("ml group");
//   const philhealthCol = isMlGroup ? "philhealth" : "filmalending";

//   const query = `
//     SELECT idno, region, department, lastname, firstname, middlename,
//       ${philhealthCol} AS philhealth
//     FROM ${dbInfo.tableName}_${year}
//     WHERE enddate = ? AND ${philhealthCol} > 0
//     ${hasRegion ? "AND region = ?" : ""}
//     ORDER BY region, lastname, firstname
//   `;
//   const params = hasRegion ? [date, region] : [date];
//   const pool = utilitiesModel.getDbPool(office);
//   const [rows] = await pool.query(query, params);
//   return rows;
// }

// async function _sssLoan(date, year, dbInfo, region, office) {
//   const hasRegion = region && region.trim() !== "";
//   const query = `
//     SELECT idno, region, lastname, firstname, middlename, sssloan
//     FROM ${dbInfo.tableName}_${year}
//     WHERE enddate = ? AND sssloan > 0
//     ${hasRegion ? "AND region = ?" : ""}
//     ORDER BY region, lastname, firstname
//   `;
//   const params = hasRegion ? [date, region] : [date];
//   const pool = utilitiesModel.getDbPool(office);
//   const [rows] = await pool.query(query, params);
//   return rows;
// }

// async function _pagibigLoan(date, year, dbInfo, region, office) {
//   const hasRegion = region && region.trim() !== "";
//   const query = `
//     SELECT idno, region, lastname, firstname, middlename, pagibigloan
//     FROM ${dbInfo.tableName}_${year}
//     WHERE enddate = ? AND pagibigloan > 0
//     ${hasRegion ? "AND region = ?" : ""}
//     ORDER BY region, lastname, firstname
//   `;
//   const params = hasRegion ? [date, region] : [date];
//   const pool = utilitiesModel.getDbPool(office);
//   const [rows] = await pool.query(query, params);
//   return rows;
// }

// module.exports = {
//   getBenefitsReportTypes,
//   generateBenefitsReportData,
// };
const db = require('../config/db');
const utilitiesModel = require('./utilitiesModel');

// ── Office → table name ───────────────────────────────────────────────────────
function getDBForOffice(office) {
  const lower = office.toLowerCase();

  if (lower.includes('luzon')) return { tableName: 'luzpayroll' };
  if (lower.includes('vismin')) return { tableName: 'payroll' };
  if (lower.includes('mlinc')) return { tableName: 'payroll_transactions_mlinc' };

  throw new Error('Unknown office.');
}

// ── Get correct middle name source per office ────────────────────────────────
function getMiddleNameConfig(office) {
  const lower = office.toLowerCase();

  // LUZON → no change (uses payroll field directly)
  if (lower.includes('luzon')) {
    return {
      join: '',
      middleNameCol: 'p.middlename',
    };
  }

  // VISMIN → master (201file)
  if (lower.includes('vismin')) {
    return {
      join: 'INNER JOIN 201file.master m ON p.idno = m.employeeid',
      middleNameCol: 'm.employeemi',
    };
  }

  // ML GROUP → master
  if (lower.includes('mlinc')) {
    return {
      join: 'INNER JOIN hr_employees_mlinc m ON p.idno = m.employeeid',
      middleNameCol: 'm.employeemi',
    };
  }

  throw new Error('Unknown office.');
}

function payrollYear(dateString) {
  return new Date(dateString).getFullYear();
}

// ── Report types from bnf_reports ─────────────────────────────────────────────
async function getBenefitsReportTypes(office) {
  const pool = utilitiesModel.getDbPool(office);

  const [rows] = await pool.query(
    `SELECT report_name AS reporttype FROM bnf_reports ORDER BY report_name`,
  );

  return rows;
}

// ── Validate payroll cutoff exists ────────────────────────────────────────────
async function payrollDateExists(date, dbInfo, year, office) {
  const pool = utilitiesModel.getDbPool(office);
  console.log('errors: ', date, dbInfo, year, office);
  const [rows] = await pool.query(`SELECT 1 FROM ${dbInfo.tableName} WHERE enddate = ? LIMIT 1`, [
    date,
  ]);
  console.log(
    `SELECT 1 FROM ${dbInfo.tableName} WHERE enddate = ? LIMIT 1`,
    [date],
    rows.length > 0,
  );
  return rows.length > 0;
}

// ── MAIN DISPATCHER ──────────────────────────────────────────────────────────
// async function generateBenefitsReportData({ startDate, endDate, office, region, reportType }) {
//   const date = endDate;
//   const dbInfo = getDBForOffice(office);
//   const year = payrollYear(date);

//   // Follow the same pattern as getEmployeeMovement
//   const tableName =
//     dbInfo.tableName === 'payroll_transactions_mlinc'
//       ? dbInfo.tableName
//       : `${dbInfo.tableName}_${year}`;

//   const dateExists = await payrollDateExists(date, dbInfo, year, office);

//   if (!dateExists) {
//     return {
//       message: `No payroll data found for ${date}. Please check the date and try again.`,
//       data: [],
//       hasData: false,
//       dateExists: false,
//     };
//   }

//   let data = [];
//   let message = '';

//   const type = reportType.toLowerCase().trim();

//   if (type === 'sss contribution') {
//     data = await _sssContribution(date, year, dbInfo, region, office);
//   } else if (type === 'pagibig contribution') {
//     data = await _pagibigContribution(date, year, dbInfo, region, office);
//   } else if (type === 'pagibig contribution final') {
//     data = await _pagibigContributionFinal(date, year, dbInfo, region, office);
//   } else if (type === 'philhealth contribution') {
//     data = await _philhealthContribution(date, year, dbInfo, region, office);
//   } else if (type === 'sss loan') {
//     data = await _sssLoan(date, year, dbInfo, region, office);
//   } else if (type === 'pagibig loan') {
//     data = await _pagibigLoan(date, year, dbInfo, region, office);
//   } else {
//     return {
//       message: `Unsupported report type: ${reportType}`,
//       data: [],
//       hasData: false,
//       dateExists: true,
//     };
//   }

//   message = data.length > 0 ? `Found ${data.length} records` : 'No records found';

//   return {
//     message,
//     data,
//     hasData: data.length > 0,
//     dateExists: true,
//   };
// }
async function generateBenefitsReportData({ startDate, endDate, office, region, reportType }) {
  const date = endDate;
  const dbInfo = getDBForOffice(office);
  const year = payrollYear(date);

  // Follow the same pattern as getEmployeeMovement
  const tableName =
    dbInfo.tableName === 'payroll_transactions_mlinc'
      ? dbInfo.tableName
      : `${dbInfo.tableName}_${year}`;

  // Check if payroll date exists
  const dateExists = await payrollDateExists(date, { tableName }, year, office);

  if (!dateExists) {
    return {
      message: `No payroll data found for ${date}. Please check the date and try again.`,
      data: [],
      hasData: false,
      dateExists: false,
    };
  }

  let data = [];
  let message = '';

  const type = reportType.toLowerCase().trim();

  if (type === 'sss contribution') {
    data = await _sssContribution(date, year, { tableName }, region, office);
  } else if (type === 'pagibig contribution') {
    data = await _pagibigContribution(date, year, { tableName }, region, office);
  } else if (type === 'pagibig contribution final') {
    data = await _pagibigContributionFinal(date, year, { tableName }, region, office);
  } else if (type === 'philhealth contribution') {
    data = await _philhealthContribution(date, year, { tableName }, region, office);
  } else if (type === 'sss loan') {
    data = await _sssLoan(date, year, { tableName }, region, office);
  } else if (type === 'pagibig loan') {
    data = await _pagibigLoan(date, year, { tableName }, region, office);
  } else {
    return {
      message: `Unsupported report type: ${reportType}`,
      data: [],
      hasData: false,
      dateExists: true,
    };
  }

  message = data.length > 0 ? `Found ${data.length} records` : 'No records found';

  return {
    message,
    data,
    hasData: data.length > 0,
    dateExists: true,
  };
}

// ── SSS CONTRIBUTION ─────────────────────────────────────────────────────────
async function _sssContribution(date, year, dbInfo, region, office) {
  const hasRegion = region && region.trim() !== '';
  const { join, middleNameCol } = getMiddleNameConfig(office);

  const query = `
    SELECT
      p.idno,
      p.region,
      p.department,
      p.lastname,
      p.firstname,
      ${middleNameCol} AS middlename,
      (SELECT ssser FROM sssphtable WHERE sssee = p.ssscontri LIMIT 1) AS ssser,
      p.ssscontri AS sssee
    FROM ${dbInfo.tableName}_${year} p
    ${join}
    WHERE p.enddate = ? AND p.ssscontri > 0
    ${hasRegion ? 'AND p.region = ?' : ''}
    ORDER BY p.region, p.lastname, p.firstname
  `;

  const params = hasRegion ? [date, region] : [date];
  const pool = utilitiesModel.getDbPool(office);
  const [rows] = await pool.query(query, params);
  return rows;
}

// ── PAGIBIG CONTRIBUTION ─────────────────────────────────────────────────────
async function _pagibigContribution(date, year, dbInfo, region, office) {
  const hasRegion = region && region.trim() !== '';
  const { join, middleNameCol } = getMiddleNameConfig(office);

  const query = `
    SELECT
      p.idno,
      p.region,
      p.department,
      p.lastname,
      p.firstname,
      ${middleNameCol} AS middlename,
      p.department,
      p.pagibigcontri
    FROM ${dbInfo.tableName}_${year} p
    ${join}
    WHERE p.enddate = ? AND p.pagibigcontri > 0
    ${hasRegion ? 'AND p.region = ?' : ''}
    ORDER BY p.region, p.lastname, p.firstname
  `;

  const params = hasRegion ? [date, region] : [date];
  const pool = utilitiesModel.getDbPool(office);
  const [rows] = await pool.query(query, params);
  return rows;
}

// ── PAGIBIG CONTRIBUTION FINAL ───────────────────────────────────────────────
async function _pagibigContributionFinal(date, year, dbInfo, region, office) {
  const hasRegion = region && region.trim() !== '';
  const lower = office.toLowerCase();
  const { join, middleNameCol } = getMiddleNameConfig(office);

  let query;

  if (lower.includes('vismin')) {
    query = `
      SELECT
        p.idno,
        p.region,
        p.department,
        p.lastname,
        p.firstname,
        m.employeemi AS middlename,
        p.pagibigcontri,
        m.employeepagibig AS pagibigno,
        m.employeebdate AS birthdate
      FROM ${dbInfo.tableName}_${year} p
      ${join}
      WHERE p.enddate = ? AND p.pagibigcontri > 0
      ${hasRegion ? 'AND p.region = ?' : ''}
      ORDER BY p.region, p.lastname, p.firstname
    `;
  } else if (lower.includes('luzon')) {
    query = `
      SELECT
        p.idno,
        p.region,
        p.department,
        p.lastname,
        p.firstname,
        m.middlename,
        p.pagibigcontri,
        m.pagibig AS pagibigno,
        m.birthdate
      FROM ${dbInfo.tableName}_${year} p
      INNER JOIN hrluzon.hris201_payroll m ON p.idno = m.idno
      WHERE p.enddate = ? AND p.pagibigcontri > 0
      ${hasRegion ? 'AND p.region = ?' : ''}
      ORDER BY p.region, p.lastname, p.firstname
    `;
  } else {
    query = `
      SELECT
        p.idno,
        p.region,
        p.department,
        p.lastname,
        p.firstname,
        m.employeemi AS middlename,
        p.pagibigcontri,
        m.employeepagibig AS pagibigno,
        m.employeebdate AS birthdate
      FROM ${dbInfo.tableName}_${year} p
      ${join}
      WHERE p.enddate = ? AND p.pagibigcontri > 0
      ${hasRegion ? 'AND p.region = ?' : ''}
      ORDER BY p.region, p.lastname, p.firstname
    `;
  }

  const params = hasRegion ? [date, region] : [date];
  const pool = utilitiesModel.getDbPool(office);
  const [rows] = await pool.query(query, params);
  return rows;
}

// ── PHILHEALTH CONTRIBUTION ──────────────────────────────────────────────────
async function _philhealthContribution(date, year, dbInfo, region, office) {
  const hasRegion = region && region.trim() !== '';
  const { join, middleNameCol } = getMiddleNameConfig(office);
  const isMlGroup = office.toLowerCase().includes('mlinc');

  const philhealthCol = isMlGroup ? 'philhealth' : 'filmalending';

  const query = `
    SELECT
      p.idno,
      p.region,
      p.department,
      p.lastname,
      p.firstname,
      ${middleNameCol} AS middlename,
      ${philhealthCol} AS philhealth
    FROM ${dbInfo.tableName}_${year} p
    ${join}
    WHERE p.enddate = ? AND ${philhealthCol} > 0
    ${hasRegion ? 'AND p.region = ?' : ''}
    ORDER BY p.region, p.lastname, p.firstname
  `;

  const params = hasRegion ? [date, region] : [date];
  const pool = utilitiesModel.getDbPool(office);
  const [rows] = await pool.query(query, params);
  return rows;
}

// ── SSS LOAN ────────────────────────────────────────────────────────────────
async function _sssLoan(date, year, dbInfo, region, office) {
  const hasRegion = region && region.trim() !== '';
  const { join, middleNameCol } = getMiddleNameConfig(office);

  const query = `
    SELECT
      p.idno,
      p.region,p.department,
      p.lastname,
      p.firstname,
      ${middleNameCol} AS middlename,
      p.sssloan
    FROM ${dbInfo.tableName} p
    ${join}
    WHERE p.enddate = ? AND p.sssloan > 0
    ${hasRegion ? 'AND p.region = ?' : ''}
    ORDER BY p.region, p.lastname, p.firstname
  `;

  const params = hasRegion ? [date, region] : [date];
  const pool = utilitiesModel.getDbPool(office);
  const [rows] = await pool.query(query, params);
  return rows;
}

// ── PAGIBIG LOAN ────────────────────────────────────────────────────────────
async function _pagibigLoan(date, year, dbInfo, region, office) {
  const hasRegion = region && region.trim() !== '';
  const { join, middleNameCol } = getMiddleNameConfig(office);

  const query = `
    SELECT
      p.idno,
      p.region,
      p.department,
      p.lastname,
      p.firstname,
      ${middleNameCol} AS middlename,
      p.pagibigloan
    FROM ${dbInfo.tableName} p
    ${join}
    WHERE p.enddate = ? AND p.pagibigloan > 0
    ${hasRegion ? 'AND p.region = ?' : ''}
    ORDER BY p.region, p.lastname, p.firstname
  `;

  const params = hasRegion ? [date, region] : [date];
  const pool = utilitiesModel.getDbPool(office);
  const [rows] = await pool.query(query, params);
  return rows;
}

function getPreviousPayrollInfo(currentEndDate) {
  const current = new Date(currentEndDate);

  const previousDate = new Date(current.getFullYear(), current.getMonth(), 0);

  return {
    previousEndDate: formatLocalDate(previousDate),

    currentYear: current.getFullYear(),

    previousYear: previousDate.getFullYear(),
  };
}

async function getEmployeeMovement(office, currentEndDate) {
  const dbInfo = getDBForOffice(office);

  const { previousEndDate, currentYear, previousYear } = getPreviousPayrollInfo(currentEndDate);

  console.log(office, currentEndDate, previousEndDate, currentYear, previousYear);

  const currentTable = `${dbInfo.tableName}_${currentYear}`;

  const previousTable = `${dbInfo.tableName}_${previousYear}`;

  const query = `
  SELECT
    c.idno,
    c.lastname,
    c.firstname,
    c.datehired,

    p.enddate   AS previous_payroll_date,
    p.region    AS previous_region,

    c.enddate   AS current_payroll_date,
    c.region    AS current_region,

    CASE
      WHEN p.idno IS NULL THEN 'NEW EMPLOYEE'
      WHEN c.region <> p.region THEN 'REGION TRANSFER'
      ELSE ''
    END AS movement_type

  FROM (
    SELECT idno, lastname, firstname, datehired, enddate, region
    FROM ${currentTable}
    WHERE enddate = ?
  ) c

  LEFT JOIN (
    SELECT idno, enddate, region
    FROM ${previousTable}
    WHERE enddate = ?
  ) p ON c.idno = p.idno

  WHERE p.idno IS NULL
     OR c.region <> p.region

  ORDER BY c.lastname, c.firstname
`;

  const pool = utilitiesModel.getDbPool(office);
  const [rows] = await pool.query(query, [
    currentEndDate, // for the current subquery
    previousEndDate, // for the previous subquery
  ]);

  return rows;
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPreviousMonthEndDate(endDate) {
  const current = new Date(endDate);
  const previousDate = new Date(current.getFullYear(), current.getMonth(), 0);
  return formatLocalDate(previousDate);
}

async function getContributionComparison(office, endDate, region, reportType) {
  const dbInfo = getDBForOffice(office);

  const isLuzon = office.toLowerCase().includes('luzon');
  const isVismin = office.toLowerCase().includes('vismin');
  const isMlinc = office.toLowerCase().includes('mlinc');

  const currentYear = new Date(endDate).getFullYear();
  const previousEndDate = getPreviousMonthEndDate(endDate);
  const previousYear = new Date(previousEndDate).getFullYear();

  // ALL offices use year-suffixed payroll tables
  const currentTable = `${dbInfo.tableName}_${currentYear}`;
  const previousTable = `${dbInfo.tableName}_${previousYear}`;

  const hasRegion = region && region.trim() !== '';
  const type = reportType.toLowerCase().trim();

  let contributionCol;
  let includeER = false;
  let masterCol;

  if (type === 'sss contribution comparison') {
    contributionCol = 'ssscontri';
    includeER = true;
    masterCol = isLuzon ? 'sss' : 'employeesss';
  } else if (type === 'pagibig contribution comparison') {
    contributionCol = 'pagibigcontri';
    masterCol = isLuzon ? 'pagibig' : 'employeepagibig';
  } else if (type === 'philhealth contribution comparison') {
    contributionCol = office.toLowerCase().includes('mlinc') ? 'philhealth' : 'filmalending';
    masterCol = isLuzon ? 'philhealth' : 'employeephilhealth';
  } else {
    throw new Error(`Unsupported comparison type: ${reportType}`);
  }

  // Master/lookup table differs by office
  const masterTable = isVismin
    ? '201file.master'
    : isLuzon
      ? 'hris201_payroll'
      : isMlinc
        ? 'hr_employees_mlinc'
        : 'master';
  const middlenameCol = isLuzon ? 'middlename' : 'employeemi';
  const masterLinkCol = isLuzon ? 'idno' : 'employeeid';

  const selectCols = includeER
    ? `
        p.enddate AS prev_payroll_date,
        p.${contributionCol} AS prev_ee,
        (
          SELECT ssser
          FROM sssphtable
          WHERE sssee = p.${contributionCol}
          LIMIT 1
        ) AS prev_er,

        c.enddate AS curr_payroll_date,
        c.${contributionCol} AS curr_ee,
        (
          SELECT ssser
          FROM sssphtable
          WHERE sssee = c.${contributionCol}
          LIMIT 1
        ) AS curr_er
      `
    : `
        p.enddate AS prev_payroll_date,
        p.${contributionCol} AS prev_ee,

        c.enddate AS curr_payroll_date,
        c.${contributionCol} AS curr_ee
      `;

  const orphanPrevSelect = includeER
    ? `
        p.enddate AS prev_payroll_date,
        p.${contributionCol} AS prev_ee,
        (
          SELECT ssser
          FROM sssphtable
          WHERE sssee = p.${contributionCol}
          LIMIT 1
        ) AS prev_er,

        NULL AS curr_payroll_date,
        NULL AS curr_ee,
        NULL AS curr_er
      `
    : `
        p.enddate AS prev_payroll_date,
        p.${contributionCol} AS prev_ee,

        NULL AS curr_payroll_date,
        NULL AS curr_ee
      `;

  const changeCondition = `
  (
    p.idno IS NULL
    OR c.idno IS NULL
    OR p.${contributionCol} <> c.${contributionCol}
    OR UPPER(COALESCE(TRIM(p.lastname), '')) <>
       UPPER(COALESCE(TRIM(c.lastname), ''))
  )
`;

  const query = `
    SELECT
      COALESCE(c.idno, p.idno) AS idno,
      COALESCE(c.lastname, p.lastname) AS lastname,
      p.lastname AS prev_lastname,
      c.lastname AS curr_lastname,
      COALESCE(c.firstname, p.firstname) AS firstname,
      COALESCE(m.${middlenameCol}, COALESCE(c.middlename, p.middlename)) AS middlename,
      m.${masterCol} AS benefit_number,

      ${selectCols}

    FROM (
      SELECT *
      FROM ${currentTable}
      WHERE enddate = ?
      ${hasRegion ? 'AND region = ?' : ''}
    ) c

    LEFT JOIN (
      SELECT *
      FROM ${previousTable}
      WHERE enddate = ?
      ${hasRegion ? 'AND region = ?' : ''}
    ) p
      ON c.idno = p.idno

    LEFT JOIN ${masterTable} m
      ON m.${masterLinkCol} = COALESCE(c.idno, p.idno)

    WHERE ${changeCondition}

    UNION ALL

    SELECT
      p.idno,
      p.lastname,
      p.lastname AS prev_lastname,
      NULL AS curr_lastname,
      p.firstname,
      COALESCE(m.${middlenameCol}, p.middlename) AS middlename,
      m.${masterCol} AS benefit_number,

      ${orphanPrevSelect}

    FROM (
      SELECT *
      FROM ${currentTable}
      WHERE enddate = ?
      ${hasRegion ? 'AND region = ?' : ''}
    ) c

    RIGHT JOIN (
      SELECT *
      FROM ${previousTable}
      WHERE enddate = ?
      ${hasRegion ? 'AND region = ?' : ''}
    ) p
      ON c.idno = p.idno

    LEFT JOIN ${masterTable} m
      ON m.${masterLinkCol} = p.idno

    WHERE c.idno IS NULL

    ORDER BY lastname, firstname
  `;

  const params = hasRegion
    ? [endDate, region, previousEndDate, region, endDate, region, previousEndDate, region]
    : [endDate, previousEndDate, endDate, previousEndDate];

  console.log('Contribution comparison query:', query);
  console.log('Params:', params);

  const pool = utilitiesModel.getDbPool(office);
  const [rows] = await pool.query(query, params);

  return {
    rows,
    previousEndDate,
  };
}

async function getContributionComparisonSummary(office, endDate, region, reportType) {
  const dbInfo = getDBForOffice(office);

  const currentYear = new Date(endDate).getFullYear();

  const previousEndDate = getPreviousMonthEndDate(endDate);

  const previousYear = new Date(previousEndDate).getFullYear();

  const currentTable = `${dbInfo.tableName}_${currentYear}`;
  const previousTable = `${dbInfo.tableName}_${previousYear}`;

  const hasRegion = region && region.trim() !== '';

  const type = reportType.toLowerCase().trim();

  let contributionCol;
  let employerExpr;

  if (type === 'sss contribution comparison') {
    contributionCol = 'ssscontri';

    employerExpr = `
      (
        SELECT COALESCE(ssser,0)
        FROM sssphtable
        WHERE sssee = p.${contributionCol}
        LIMIT 1
      )
    `;
  } else if (type === 'pagibig contribution comparison') {
    contributionCol = 'pagibigcontri';

    employerExpr = `200`;
  } else if (type === 'philhealth contribution comparison') {
    contributionCol = office.toLowerCase().includes('mlinc') ? 'philhealth' : 'filmalending';

    employerExpr = `COALESCE(p.${contributionCol},0)`;
  } else {
    throw new Error(`Unsupported comparison type: ${reportType}`);
  }

  async function getMonthSummary(table, payrollDate) {
    const query = `
      SELECT
        DATE_FORMAT(?, '%M %Y') AS month,

        COUNT(DISTINCT p.idno) AS employeeCount,

        ROUND(
          SUM(COALESCE(p.${contributionCol},0)),
          2
        ) AS employeeShare,

        ROUND(
          SUM(${employerExpr}),
          2
        ) AS employerShare

      FROM ${table} p

      WHERE p.enddate = ?
      ${hasRegion ? 'AND p.region = ?' : ''}
    `;

    const params = hasRegion ? [payrollDate, payrollDate, region] : [payrollDate, payrollDate];

    const pool = utilitiesModel.getDbPool(office);

    const [rows] = await pool.query(query, params);

    const row = rows[0];

    return {
      month: payrollDate,

      employeeCount: Number(row.employeeCount || 0),

      employeeShare: Number(row.employeeShare || 0),

      employerShare: Number(row.employerShare || 0),

      total: Number(row.employeeShare || 0) + Number(row.employerShare || 0),
    };
  }

  const currentSummary = await getMonthSummary(currentTable, endDate);

  const previousSummary = await getMonthSummary(previousTable, previousEndDate);

  return [currentSummary, previousSummary];
}

module.exports = {
  getBenefitsReportTypes,
  generateBenefitsReportData,

  getEmployeeMovement,
  getContributionComparison,

  getContributionComparisonSummary,
};
