// models/resignedEmployeeModel.js

const PDFDocument = require('pdfkit');
const utilitiesModel = require('./utilitiesModel');
const path = require('path');
const fs = require('fs');

// Helper to get payroll folder info
function getPayrollFolder(office) {
  const lowerOffice = office.toLowerCase();
  return lowerOffice === 'vismin'
    ? { folderName: 'PAYROLL1', tableName: 'payroll_transactions_vismin_' }
    : lowerOffice === 'luzon'
      ? { folderName: 'PAYROLL2', tableName: 'payroll_transactions_luzon_' }
      : { folderName: 'PAYROLL3', tableName: 'payroll_transactions_mlinc_' };
}

// Helper to get the correct employee table based on office
function getEmployeeTable(office) {
  const lowerOffice = office.toLowerCase();
  if (lowerOffice === 'vismin') {
    return 'hr_employees_vismin';
  } else if (lowerOffice === 'luzon') {
    return 'hr_employees_luzon';
  } else {
    // ML Group or others
    return 'hr_employees_mlinc';
  }
}

// Helper to format currency
function formatCurrency(amount) {
  return parseFloat(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Helper to format date
function formatDate(date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

async function searchResignedEmployees(office, idno, lastName, firstName) {
  const dbPool = utilitiesModel.getDbPool('default');
  const employeeTable = getEmployeeTable(office);
  const params = [];

  let query = '';

  if (office.toLowerCase() === 'luzon') {
    // Luzon
    console.log('luzon------------------------');
    query = `
      SELECT
        idno,
        CONCAT(lastname, ', ', firstname) AS fullname,
        lastname,
        firstname,
        fore_name AS middlename,
        level3 AS region,
        level4 AS department,
        level5 AS branch,
        designation,
        employment_type AS employmentstatus,
        hired_date AS datehired,
        resigned_date AS dateresign
      FROM ${employeeTable}
      WHERE 1=1
    `;

    if (idno) {
      query += ` AND idno LIKE ?`;
      params.push(`%${idno}%`);
    }

    if (lastName) {
      query += ` AND lastname LIKE ?`;
      params.push(`%${lastName}%`);
    }

    if (firstName) {
      query += ` AND firstname LIKE ?`;
      params.push(`%${firstName}%`);
    }

    query += `
      AND resigned_date IS NOT NULL
      AND resigned_date != ''
      ORDER BY lastname, firstname
      LIMIT 50
    `;
  } else if (office.toLowerCase() === 'mlinc') {
    // ML Group
    console.log('ml group ----------------- ');
    query = `
      SELECT
        e.employeeid AS idno,
        CONCAT(e.employeelname, ', ', e.employeefname) AS fullname,
        e.employeelname AS lastname,
        e.employeefname AS firstname,
        e.employeemi AS middlename,
        r.regionname AS region,
        d.areaname AS department,
        b.branchname AS branch,
        e.employeedesignation AS designation,
        rk.rankname AS employmentstatus,
        e.employeedateemp AS datehired,
        e.empresigndate AS dateresign
      FROM ${employeeTable} e
      LEFT JOIN mlinc_region r
        ON r.regionid = e.employeeregion
      LEFT JOIN mlinc_area d
        ON d.areaid = e.employeeareamngr
      LEFT JOIN mlinc_branch b
        ON b.branchcode = e.employeebranch
      LEFT JOIN hr_ranks rk
        ON rk.rankid = e.employeeranking
      WHERE 1=1
    `;

    if (idno) {
      query += ` AND e.employeeid LIKE ?`;
      params.push(`%${idno}%`);
    }

    if (lastName) {
      query += ` AND e.employeelname LIKE ?`;
      params.push(`%${lastName}%`);
    }

    if (firstName) {
      query += ` AND e.employeefname LIKE ?`;
      params.push(`%${firstName}%`);
    }

    query += `
      AND e.empresigndate IS NOT NULL
      AND e.empresigndate != ''
      ORDER BY e.employeelname, e.employeefname
      LIMIT 50
    `;
  } else {
    // VisMin

    console.log('vismin -  -----');
    query = `
      SELECT
        e.employeeid AS idno,
        CONCAT(e.employeelname, ', ', e.employeefname) AS fullname,
        e.employeelname AS lastname,
        e.employeefname AS firstname,
        e.employeemi AS middlename,
        r.regionname AS region,
        a.areaname AS department,
        b.branchname AS branch,
        e.employeedesignation AS designation,
        rk.rankname AS employmentstatus,
        e.employeedateemp AS datehired,
        e.empresigndate AS dateresign
      FROM ${employeeTable} e
      LEFT JOIN region r
        ON r.regionid = e.employeeregion
      LEFT JOIN hr_areas a
        ON a.areaid = e.employeeareamngr
      LEFT JOIN hr_branches b
        ON b.branchcode = e.employeebranch
      LEFT JOIN hr_ranks rk
        ON rk.rankid = e.employeeranking
      WHERE 1=1
    `;

    if (idno) {
      query += ` AND e.employeeid LIKE ?`;
      params.push(`%${idno}%`);
    }

    if (lastName) {
      query += ` AND e.employeelname LIKE ?`;
      params.push(`%${lastName}%`);
    }

    if (firstName) {
      query += ` AND e.employeefname LIKE ?`;
      params.push(`%${firstName}%`);
    }

    query += `
      AND e.empresigndate IS NOT NULL
      AND e.empresigndate != ''
      ORDER BY e.employeelname, e.employeefname
      LIMIT 50
    `;
  }

  console.log(query, params);

  try {
    const [rows] = await dbPool.query(query, params);
    return rows;
  } catch (error) {
    console.error('Error searching resigned employees:', error);
    throw error;
  }
}

// Search resigned employees by ID or name
// async function searchResignedEmployees(office, idno, lastName, firstName) {
//   const dbPool = utilitiesModel.getDbPool('default');
//   const employeeTable = getEmployeeTable(office);
//   const params = [];

//   let query = '';

//   // Check which table we're using based on office
//   if (office.toLowerCase() === 'luzon') {
//     // Luzon table structure
//     query = `
//       SELECT
//         idno,
//         CONCAT(lastname, ', ', firstname) AS fullname,
//         lastname as lastname,
//         firstname as firstname,
//         fore_name as middlename,
//         level3 as region,
//         level4 as department,
//         level5 as branch,
//         designation,
//         employment_type AS employmentstatus,
//         hired_date as datehired,
//         resigned_date as dateresign
//       FROM ${employeeTable}
//       WHERE 1=1
//     `;

//     if (idno) {
//       query += ` AND idno LIKE ?`;
//       params.push(`%${idno}%`);
//     }
//     if (lastName) {
//       query += ` AND lastname LIKE ?`;
//       params.push(`%${lastName}%`);
//     }
//     if (firstName) {
//       query += ` AND firstname LIKE ?`;
//       params.push(`%${firstName}%`);
//     }

//     query += ` AND (resigned_date IS NOT NULL AND resigned_date != '')`;
//     query += ` ORDER BY lastname, firstname LIMIT 50`;
//   } else {
//     // Vismin or ML Inc table structure
//     query = `
//       SELECT
//         employeeid as idno,
//         CONCAT(employeelname, ', ', employeefname) AS fullname,
//         employeelname as lastname,
//         employeefname as firstname,
//         employeemi as middlename,
//         (SELECT regionname FROM region WHERE regionid = employeeregion) as region,
//         (SELECT areaname FROM hr_areas WHERE areaid = employeeareamngr) as department,
//         (SELECT branchname FROM hr_branches WHERE branchcode = employeebranch) as branch,
//         employeedesignation as designation,
//         (SELECT rankname FROM hr_ranks WHERE rankid = employeeranking) as employmentstatus,
//         employeedateemp as datehired,
//         empresigndate as dateresign
//       FROM ${employeeTable}
//       WHERE 1=1
//     `;

//     if (idno) {
//       query += ` AND employeeid LIKE ?`;
//       params.push(`%${idno}%`);
//     }
//     if (lastName) {
//       query += ` AND employeelname LIKE ?`;
//       params.push(`%${lastName}%`);
//     }
//     if (firstName) {
//       query += ` AND employeefname LIKE ?`;
//       params.push(`%${firstName}%`);
//     }

//     query += ` AND (empresigndate IS NOT NULL AND empresigndate != '')`;
//     query += ` ORDER BY employeelname, employeefname LIMIT 50`;
//   }
//   console.log(query, params);
//   try {
//     const [rows] = await dbPool.query(query, params);
//     return rows;
//   } catch (error) {
//     console.error('Error searching resigned employees:', error);
//     throw error;
//   }
// }

// Get resigned employee details from hr_employees
// async function getResignedEmployeeFromHR(office, idno) {
//   const dbPool = utilitiesModel.getDbPool('default');
//   const employeeTable = getEmployeeTable(office);

//   try {
//     let query = '';
//     let params = [idno];

//     if (office.toLowerCase() === 'luzon') {
//       // Luzon table structure
//       query = `
//         SELECT
//           idno,
//           CONCAT(lastname, ', ', firstname) AS fullname,
//           lastname as lastname,
//           firstname as firstname,
//           fore_name as middlename,
//           level3 as region,
//           level4 as department,
//           level5 as branch,
//           designation,
//           employment_type AS employmentstatus,
//           hired_date as datehired,
//           resigned_date as dateresign
//         FROM ${employeeTable}
//         WHERE idno = ?
//           AND resigned_date IS NOT NULL
//           AND resigned_date != ''
//         LIMIT 1
//       `;
//     } else {
//       // Vismin or ML Inc table structure
//       query = `
//         SELECT
//           employeeid as idno,
//           CONCAT(employeelname, ', ', employeefname) AS fullname,
//           employeelname as lastname,
//           employeefname as firstname,
//           employeemi as middlename,
//           (SELECT regionname FROM region WHERE regionid = employeeregion) as region,
//           (SELECT areaname FROM hr_areas WHERE areaid = employeeareamngr) as department,
//           (SELECT branchname FROM hr_branches WHERE branchcode = employeebranch) as branch,
//           employeedesignation as designation,
//           (SELECT rankname FROM hr_ranks WHERE rankid = employeeranking) as employmentstatus,
//           employeedateemp as datehired,
//           empresigndate as dateresign
//         FROM ${employeeTable}
//         WHERE employeeid = ?
//           AND empresigndate IS NOT NULL
//           AND empresigndate != ''
//         LIMIT 1
//       `;
//     }

//     const [rows] = await dbPool.query(query, params);
//     return rows[0] || null;
//   } catch (error) {
//     console.error('Error getting resigned employee from HR:', error);
//     throw error;
//   }
// }

async function getResignedEmployeeFromHR(office, idno) {
  const dbPool = utilitiesModel.getDbPool('default');
  const employeeTable = getEmployeeTable(office);

  try {
    let query = '';

    if (office.toLowerCase() === 'luzon') {
      // Luzon
      query = `
        SELECT
          idno,
          CONCAT(lastname, ', ', firstname) AS fullname,
          lastname,
          firstname,
          fore_name AS middlename,
          level3 AS region,
          level4 AS department,
          level5 AS branch,
          designation,
          employment_type AS employmentstatus,
          hired_date AS datehired,
          resigned_date AS dateresign
        FROM ${employeeTable}
        WHERE idno = ?
          AND resigned_date IS NOT NULL
          AND resigned_date != ''
        LIMIT 1
      `;
    } else if (office.toLowerCase() === 'mlinc') {
      // ML Group
      query = `
        SELECT
          e.employeeid AS idno,
          CONCAT(e.employeelname, ', ', e.employeefname) AS fullname,
          e.employeelname AS lastname,
          e.employeefname AS firstname,
          e.employeemi AS middlename,
          r.regionname AS region,
          d.areaname AS department,
          b.branchname AS branch,
          e.employeedesignation AS designation,
          rk.rankname AS employmentstatus,
          e.employeedateemp AS datehired,
          e.empresigndate AS dateresign
        FROM ${employeeTable} e
        LEFT JOIN mlinc_region r
          ON r.regionid = e.employeeregion
        LEFT JOIN mlinc_area d
          ON d.areaid = e.employeeareamngr
        LEFT JOIN mlinc_branch b
          ON b.branchcode = e.employeebranch
        LEFT JOIN hr_ranks rk
          ON rk.rankid = e.employeeranking
        WHERE e.employeeid = ?
          AND e.empresigndate IS NOT NULL
          AND e.empresigndate != ''
        LIMIT 1
      `;
    } else {
      // VisMin
      query = `
        SELECT
          e.employeeid AS idno,
          CONCAT(e.employeelname, ', ', e.employeefname) AS fullname,
          e.employeelname AS lastname,
          e.employeefname AS firstname,
          e.employeemi AS middlename,
          r.regionname AS region,
          a.areaname AS department,
          b.branchname AS branch,
          e.employeedesignation AS designation,
          rk.rankname AS employmentstatus,
          e.employeedateemp AS datehired,
          e.empresigndate AS dateresign
        FROM ${employeeTable} e
        LEFT JOIN region r
          ON r.regionid = e.employeeregion
        LEFT JOIN hr_areas a
          ON a.areaid = e.employeeareamngr
        LEFT JOIN hr_branches b
          ON b.branchcode = e.employeebranch
        LEFT JOIN hr_ranks rk
          ON rk.rankid = e.employeeranking
        WHERE e.employeeid = ?
          AND e.empresigndate IS NOT NULL
          AND e.empresigndate != ''
        LIMIT 1
      `;
    }

    const [rows] = await dbPool.query(query, [idno]);

    return rows[0] || null;
  } catch (error) {
    console.error('Error getting resigned employee from HR:', error);
    throw error;
  }
}

// Check if payroll data exists for a specific year
async function checkPayrollDataExists(office, idno, year) {
  const dbPool = utilitiesModel.getDbPool('default');
  const payrollInfo = getPayrollFolder(office);
  const payrollTable = payrollInfo.tableName + year;

  try {
    const [rows] = await dbPool.query(
      `SELECT COUNT(*) as count 
       FROM ${payrollTable} 
       WHERE idno = ?
        AND YEAR(enddate) = ?
        AND (
  DAY(enddate) = 15
  OR enddate = LAST_DAY(enddate)
)`,
      [idno, year],
    );
    return rows[0].count > 0;
  } catch (error) {
    // Table doesn't exist or other error
    console.log(`Error checking data for year ${year}:`, error.message);
    return false;
  }
}

// Get payroll data for a specific year - GROUPED BY MONTH
// Get payroll data for a specific year - GROUPED BY MONTH
// Get payroll data for a specific year - GROUPED BY MONTH
async function getPayrollDataByYear(office, idno, year, resignationDate) {
  const dbPool = utilitiesModel.getDbPool('default');
  const payrollInfo = getPayrollFolder(office);
  const payrollTable = payrollInfo.tableName + year;

  try {
    const [rows] = await dbPool.query(
      `SELECT 
        DATE_FORMAT(enddate, '%M %Y') AS month_year,
        DATE_FORMAT(enddate, '%Y-%m') AS month_key,
        enddate,
        startdate,
        basicpay,
        totalallow,
        totalot,
        cola,
        incomeamount1,
        incomeamount2,
        gross,
        lates,
        leaves,
        totaldeduction,
        monthlyrate,
        dailyrate,
        totalnet,
        DAY(enddate) AS day_of_month
      FROM ${payrollTable}
      WHERE idno = ?
        AND YEAR(enddate) = ?
        AND (
  DAY(enddate) = 15
  OR enddate = LAST_DAY(enddate)
)
      ORDER BY enddate`,
      [idno, year],
    );

    // Process and group by month
    const groupedByMonth = {};
    let latestMonthlyRate = 0;
    let latestDailyRate = 0;

    rows.forEach((row) => {
      if (row.monthlyrate && parseFloat(row.monthlyrate) > 0) {
        latestMonthlyRate = parseFloat(row.monthlyrate);
      }
      if (row.dailyrate && parseFloat(row.dailyrate) > 0) {
        latestDailyRate = parseFloat(row.dailyrate);
      }

      let monthYear = row.month_year;
      if (
        monthYear &&
        typeof monthYear === 'object' &&
        monthYear.type === 'Buffer' &&
        Array.isArray(monthYear.data)
      ) {
        monthYear = Buffer.from(monthYear.data).toString('utf8');
      } else if (monthYear && typeof monthYear === 'object' && monthYear.toString) {
        monthYear = monthYear.toString();
      }

      const monthKey = row.month_key || 'Unknown';

      if (!groupedByMonth[monthKey]) {
        groupedByMonth[monthKey] = {
          month_year: monthYear || 'Unknown',
          month_key: monthKey,
          records: [], // Store ALL records for this month
        };
      }

      // Store the record as-is (NO ADDING)
      groupedByMonth[monthKey].records.push({
        enddate: row.enddate,
        startdate: row.startdate,
        basicpay: parseFloat(row.basicpay) || 0,
        totalallow: parseFloat(row.totalallow) || 0,
        totalot: parseFloat(row.totalot) || 0,
        cola: parseFloat(row.cola) || 0,
        incomeamount1: parseFloat(row.incomeamount1) || 0,
        incomeamount2: parseFloat(row.incomeamount2) || 0,
        gross: parseFloat(row.gross) || 0,
        lates: parseFloat(row.lates) || 0,
        leaves: parseFloat(row.leaves) || 0,
        totaldeduction: parseFloat(row.totaldeduction) || 0,
        totalnet: parseFloat(row.totalnet) || 0,
        day_of_month: row.day_of_month,
      });
    });

    // Convert grouped object to array - JUST PASS THE RECORDS THROUGH
    const combinedResults = [];
    const monthKeys = Object.keys(groupedByMonth).sort();

    monthKeys.forEach((monthKey) => {
      const monthData = groupedByMonth[monthKey];

      // Just pass the records as-is, don't combine or add anything
      monthData.records.forEach((record) => {
        combinedResults.push({
          month_year: monthData.month_year,
          month_key: monthData.month_key,
          enddate: record.enddate,
          startdate: record.startdate,
          basicpay: record.basicpay, // Keep as-is!
          totalallow: record.totalallow,
          totalot: record.totalot,
          cola: record.cola,
          incomeamount1: record.incomeamount1,
          incomeamount2: record.incomeamount2,
          gross: record.gross,
          lates: record.lates,
          leaves: record.leaves,
          totaldeduction: record.totaldeduction,
          totalnet: record.totalnet,
          hasFirstHalf: record.day_of_month === 15,
          hasSecondHalf:
            record.day_of_month === 31 ||
            record.day_of_month === 30 ||
            record.day_of_month === 28 ||
            record.day_of_month === 29,
          firstHalfDay: record.day_of_month === 15 ? record.day_of_month : null,
          secondHalfDay:
            record.day_of_month === 31 ||
            record.day_of_month === 30 ||
            record.day_of_month === 28 ||
            record.day_of_month === 29
              ? record.day_of_month
              : null,
        });
      });
    });

    return {
      records: combinedResults,
      latestMonthlyRate: latestMonthlyRate,
      latestDailyRate: latestDailyRate,
    };
  } catch (error) {
    console.error(`Error getting payroll data for year ${year}:`, error);
    return {
      records: [],
      latestMonthlyRate: 0,
      latestDailyRate: 0,
    };
  }
}

// Process payroll records into breakdown format
// Process payroll records into breakdown format
function processBreakdownData(records, resignationDate) {
  // Group records by month
  const monthlyData = {};

  records.forEach((record) => {
    const monthKey = record.month_key || 'Unknown';
    const monthYear = record.month_year || 'Unknown';
    const endDate = new Date(record.enddate);
    const endDay = endDate.getDate();

    // Determine if this is a 15th or end-of-month payroll
    const is15thPayroll = endDay === 15;
    const isEndOfMonthPayroll = endDay === 31 || endDay === 30 || endDay === 28 || endDay === 29;

    // Initialize month data if not exists
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        month_year: monthYear,
        month_key: monthKey,
        payroll15: null, // Store the 15th record data
        payroll31: null, // Store the 31st record data
      };
    }

    // Store the record in the appropriate slot - JUST STORE IT, DON'T ADD
    if (is15thPayroll) {
      monthlyData[monthKey].payroll15 = {
        basicpay: parseFloat(record.basicpay) || 0,
        lates: parseFloat(record.lates) || 0,
        leaves: parseFloat(record.leaves) || 0,
      };
    } else if (isEndOfMonthPayroll) {
      monthlyData[monthKey].payroll31 = {
        basicpay: parseFloat(record.basicpay) || 0,
        lates: parseFloat(record.lates) || 0,
        leaves: parseFloat(record.leaves) || 0,
      };
    } else {
      // Irregular payroll - store in payroll15
      monthlyData[monthKey].payroll15 = {
        basicpay: parseFloat(record.basicpay) || 0,
        lates: parseFloat(record.lates) || 0,
        leaves: parseFloat(record.leaves) || 0,
      };
    }
  });

  // Now process each month's data
  const processedResults = [];

  Object.keys(monthlyData).forEach((monthKey) => {
    const monthData = monthlyData[monthKey];

    // Get the values - JUST DISPLAY WHAT'S IN THE RECORDS
    const payrollCovered1 = monthData.payroll15 ? monthData.payroll15.basicpay : 0;
    const payrollCovered2 = monthData.payroll31 ? monthData.payroll31.basicpay : 0;

    // Get lates and leaves - SUM them because they're separate records
    const lates1 = monthData.payroll15 ? monthData.payroll15.lates : 0;
    const leaves1 = monthData.payroll15 ? monthData.payroll15.leaves : 0;
    const lates2 = monthData.payroll31 ? monthData.payroll31.lates : 0;
    const leaves2 = monthData.payroll31 ? monthData.payroll31.leaves : 0;

    const totalLates = lates1 + lates2;
    const totalLeaves = leaves1 + leaves2;
    const tardinessLeave = totalLates + totalLeaves;

    // TOTAL INCOME = (Payroll Covered 1-15 + Payroll Covered 16-30/31) - (Tardiness + Leave w/o Pay)
    const totalIncome = payrollCovered1 + payrollCovered2 - tardinessLeave;

    processedResults.push({
      month: monthData.month_year,
      monthKey: monthKey,
      payrollCovered1: payrollCovered1,
      payrollCovered2: payrollCovered2,
      tardinessLeave: tardinessLeave,
      totalIncome: totalIncome,
    });
  });

  return processedResults;
}

// Main function to get payroll breakdown for resigned employee
// Update the getResignedEmployeePayrollBreakdown function to include 13th month
// Main function to get payroll breakdown for resigned employee
async function getResignedEmployeePayrollBreakdown(office, idno, forceYear = null) {
  // First get employee details from hr_employees
  const employee = await getResignedEmployeeFromHR(office, idno);

  if (!employee) {
    return {
      employee: null,
      breakdown: [],
      summary: null,
      hasData: false,
      availableYears: [],
    };
  }

  const resignationDate = employee.dateresign;
  const resignDateObj = new Date(resignationDate);
  const resignYear = resignDateObj.getFullYear();

  // console.log(`Employee ${idno} resigned on: ${resignationDate}`);
  // console.log(`Resignation year: ${resignYear}`);

  // Determine which year to check
  let targetYear = forceYear || resignYear;

  // Check if data exists in the target year
  const hasDataInTargetYear = await checkPayrollDataExists(office, idno, targetYear);

  // console.log(`Has data in ${targetYear}? ${hasDataInTargetYear}`);

  // If NO data in target year AND not forcing a year, check previous year
  if (!hasDataInTargetYear && !forceYear) {
    const previousYear = resignYear - 1;
    const hasDataInPreviousYear = await checkPayrollDataExists(office, idno, previousYear);

    // console.log(`Has data in ${previousYear}? ${hasDataInPreviousYear}`);

    if (hasDataInPreviousYear) {
      return {
        employee: employee,
        breakdown: [],
        summary: null,
        hasData: false,
        availableYears: [previousYear],
        currentYear: resignYear,
        message: `No payroll data found for ${resignYear}. Would you like to view data from ${previousYear}?`,
      };
    }

    return {
      employee: employee,
      breakdown: [],
      summary: null,
      hasData: false,
      availableYears: [],
      currentYear: resignYear,
      message: `No payroll records found for this employee.`,
    };
  }

  // If we have data in target year, fetch it
  const result = await getPayrollDataByYear(office, idno, targetYear, resignationDate);
  const payrollRecords = result.records;
  const latestMonthlyRate = result.latestMonthlyRate;
  const latestDailyRate = result.latestDailyRate;

  // Add rates to employee object
  employee.monthlyrate = latestMonthlyRate;
  employee.dailyrate = latestDailyRate;

  if (payrollRecords.length === 0) {
    return {
      employee: employee,
      breakdown: [],
      summary: null,
      hasData: false,
      availableYears: [],
      currentYear: targetYear,
      message: `No payroll records found for ${targetYear}.`,
    };
  }

  // Process the data
  const processedBreakdown = processBreakdownData(payrollRecords, resignationDate);

  // Sort by month (January to December)
  const monthOrder = {
    JANUARY: 1,
    FEBRUARY: 2,
    MARCH: 3,
    APRIL: 4,
    MAY: 5,
    JUNE: 6,
    JULY: 7,
    AUGUST: 8,
    SEPTEMBER: 9,
    OCTOBER: 10,
    NOVEMBER: 11,
    DECEMBER: 12,
  };

  processedBreakdown.sort((a, b) => {
    const monthA = a.month ? a.month.split(' ')[0].toUpperCase() : '';
    const monthB = b.month ? b.month.split(' ')[0].toUpperCase() : '';
    return (monthOrder[monthA] || 0) - (monthOrder[monthB] || 0);
  });

  // Calculate totals
  const totalSummary = processedBreakdown.reduce((sum, item) => sum + item.totalIncome, 0);

  // 13th Month = sum of all total income / 12
  const thirteenthMonth = totalSummary / 12;

  // Get the latest 13th month payout
  const thirteenthMonthPayout = await getLastThirteenthMonthPayout(office, idno, resignationDate);

  const totalLeaves = processedBreakdown.reduce((sum, item) => {
    return sum + (item.tardinessLeave || 0);
  }, 0);
  const availableVL = Math.max(0, 15 - totalLeaves / 30);

  // In getResignedEmployeePayrollBreakdown function, when returning the summary:
  return {
    employee: employee,
    breakdown: processedBreakdown,
    hasData: true,
    currentYear: targetYear,
    summary: {
      totalSummary: totalSummary,
      thirteenthMonth: thirteenthMonth,
      thirteenthMonthPayout: thirteenthMonthPayout || null, // Always include this field
      totalRecords: processedBreakdown.length,
      yearUsed: targetYear,
      resignationDate: resignationDate,
    },
  };
}

// Generate PDF for resigned employee breakdown
async function generateResignedEmployeePDF(data, username) {
  return new Promise((resolve, reject) => {
    try {
      // Half of short bond paper: 8.5" x 5.5" (landscape half-sheet)
      const PAGE_WIDTH = 8.5 * 72; // 612pt
      const PAGE_HEIGHT = 11 * 72; // NOTE: this is currently full letter height (792pt), not 5.5" (396pt) — flagging per comment mismatch above
      const MARGIN = 26;

      const doc = new PDFDocument({
        size: [PAGE_WIDTH, PAGE_HEIGHT],
        margin: MARGIN,
        bufferPages: true,
        info: {
          Title: 'Payroll Breakdown for Resigned Employee',
          Author: 'HRMS System',
        },
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { employee, breakdown, summary } = data;
      const today = new Date();

      // ---- Visual constants -------------------------------------------------
      const COLORS = {
        veryBlack: '#000000',
        rowAlt: '#F6F7F9',
        resignRow: '#FFF3CD',
        resignText: '#856404',
        highlightBg: '#EAF0F5',
        textMuted: '#6B7686',
        text: '#000000',
      };
      const PAGE_LEFT = MARGIN;
      const PAGE_RIGHT = PAGE_WIDTH - MARGIN;
      const CONTENT_WIDTH = PAGE_RIGHT - PAGE_LEFT;

      // Determine basic rate: monthlyrate if available, otherwise dailyrate
      let basicRateLabel = 'N/A';
      if (employee.monthlyrate && parseFloat(employee.monthlyrate) > 0) {
        basicRateLabel = formatCurrency(employee.monthlyrate) + ' (Monthly)';
      } else if (employee.dailyrate && parseFloat(employee.dailyrate) > 0) {
        basicRateLabel = formatCurrency(employee.dailyrate) + ' (Daily)';
      } else if (employee.basicpay) {
        basicRateLabel = formatCurrency(employee.basicpay);
      }

      // Calculate Length of Service
      let lengthOfService = 'N/A';
      if (employee.datehired && employee.dateresign) {
        const hired = new Date(employee.datehired);
        const resigned = new Date(employee.dateresign);
        const diffTime = Math.abs(resigned - hired);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const years = Math.floor(diffDays / 365);
        const months = Math.floor((diffDays % 365) / 30);

        if (years > 0 && months > 0) {
          lengthOfService = `${years} year${years > 1 ? 's' : ''} and ${months} month${months > 1 ? 's' : ''}`;
        } else if (years > 0) {
          lengthOfService = `${years} year${years > 1 ? 's' : ''}`;
        } else if (months > 0) {
          lengthOfService = `${months} month${months > 1 ? 's' : ''}`;
        } else {
          lengthOfService = 'Less than a month';
        }
      }

      // ---- Letterhead (logo centered, no background band / no borders) ------
      const logoPath = path.join(__dirname, '../public/images/logo.png');
      let headerBottomY = MARGIN;
      try {
        if (fs.existsSync(logoPath)) {
          const logoWidth = 200;
          const xPosition = (PAGE_WIDTH - logoWidth) / 2;
          doc.image(logoPath, xPosition, MARGIN, { width: logoWidth });
          headerBottomY = MARGIN + 34;
        }
      } catch (e) {
        console.log('Logo not found, continuing without it');
      }

      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(COLORS.veryBlack)
        .text('     HUMAN RESOURCES MANAGEMENT DIVISION', 0, headerBottomY, { align: 'center' });
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(COLORS.veryBlack)
        .text('     Payroll Breakdown for Resigned Employee', 0, headerBottomY + 11, {
          align: 'center',
        });

      doc.fillColor('#000000');
      doc.y = headerBottomY + 34;

      // ---- Employee information: 2-column grid -------------------------------
      const rowH = 13;
      const leftColX = PAGE_LEFT;
      const rightColX = PAGE_LEFT + CONTENT_WIDTH / 2 + 6;
      const labelWidth = 75;

      const cell = (label, value, x, y) => {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.text).text(label, x, y);
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(COLORS.text)
          .text(value, x + labelWidth, y, { width: CONTENT_WIDTH / 2 - labelWidth - 6 });
      };

      let gridY = doc.y;
      cell('Date:', formatDate(today), leftColX, gridY);

      gridY += rowH;
      cell('ID No:', employee.idno || 'N/A', leftColX, gridY);
      // Length of Service displayed above Region on the right side
      cell('Length of Service:', lengthOfService, rightColX, gridY);

      gridY += rowH;
      cell('Employee Name:', employee.fullname || 'N/A', leftColX, gridY);
      cell('Region:', employee.region || 'N/A', rightColX, gridY);

      gridY += rowH;
      cell('Date Hired:', formatDate(employee.datehired), leftColX, gridY);
      cell('Date Resigned:', formatDate(employee.dateresign), rightColX, gridY);

      gridY += rowH;
      cell('Designation:', employee.designation || 'N/A', leftColX, gridY);
      cell('Basic Rate:', basicRateLabel, rightColX, gridY);

      let infoBottomY = gridY + rowH;
      // if (summary && summary.yearUsed) {
      //   doc
      //     .font('Helvetica-Oblique')
      //     .fontSize(7)
      //     .fillColor(COLORS.textMuted)
      //     .text(`* Payroll data from ${summary.yearUsed}`, leftColX, infoBottomY);
      //   doc.fillColor('#000000');
      //   infoBottomY += 10;
      // }

      doc.y = infoBottomY + 2;

      // ---- Table --------------------------------------------------------
      const tableHeaders = [
        'Month',
        'Payroll Covered\n1 - 15',
        'Payroll Covered\n16 - 30/31',
        'Tardiness /\nLeave without Pay',
        'Total Income',
      ];

      // Scaled to fill CONTENT_WIDTH on the half-sheet
      const columnWidths = [140, 104, 104, 104, 104];
      const columnStartXs = [];
      {
        let acc = PAGE_LEFT;
        columnWidths.forEach((w) => {
          columnStartXs.push(acc);
          acc += w;
        });
      }

      const HEADER_H = 27;
      const ROW_H = 14;

      const drawTableHeader = (y) => {
        doc
          .moveTo(PAGE_LEFT, y)
          .lineTo(PAGE_RIGHT, y)
          .lineWidth(1)
          .strokeColor(COLORS.veryBlack)
          .stroke();

        doc.font('Helvetica-Bold').fontSize(8);

        tableHeaders.forEach((header, index) => {
          const x = columnStartXs[index];
          const width = columnWidths[index];

          // Calculate height of wrapped text
          const textHeight = doc.heightOfString(header, {
            width,
            align: 'center',
          });

          // Center vertically within HEADER_H
          const textY = y + (HEADER_H - textHeight) / 2;

          doc.fillColor(COLORS.veryBlack).text(header, x, textY, {
            width,
            align: 'center',
            lineGap: 1,
          });
        });

        doc
          .moveTo(PAGE_LEFT, y + HEADER_H)
          .lineTo(PAGE_RIGHT, y + HEADER_H)
          .lineWidth(1)
          .strokeColor(COLORS.veryBlack)
          .stroke();

        return y + HEADER_H;
      };

      let headerY = drawTableHeader(doc.y);
      let rowY = headerY + 4;
      doc.font('Helvetica').fontSize(7.5);

      breakdown.forEach((item, index) => {
        const rowSpace = item.isResignationMonth ? ROW_H + 9 : ROW_H;

        if (rowY + rowSpace > PAGE_HEIGHT - MARGIN - 90) {
          doc.addPage();
          rowY = MARGIN;
          headerY = drawTableHeader(rowY);
          rowY = headerY + ROW_H * 2; // two blank empty rows after the repeated header too
          doc.font('Helvetica').fontSize(7.5);
        }

        if (index % 2 === 0) {
          doc.rect(PAGE_LEFT, rowY, CONTENT_WIDTH, ROW_H).fill(COLORS.rowAlt);
        }

        // if (item.isResignationMonth) {
        //   doc.rect(PAGE_LEFT, rowY, CONTENT_WIDTH, ROW_H).fill(COLORS.resignRow);
        // }

        const rowData = [
          item.month || 'N/A',
          formatCurrency(item.payrollCovered1),
          formatCurrency(item.payrollCovered2),
          formatCurrency(item.tardinessLeave),
          formatCurrency(item.totalIncome),
        ];

        rowData.forEach((text, idx) => {
          doc.fillColor('#000000');
          doc.text(text, columnStartXs[idx] + (idx === 0 ? 5 : 0), rowY + 3, {
            width: columnWidths[idx] - (idx === 0 ? 5 : 8),
            align: idx === 0 ? 'left' : 'right',
          });
        });

        rowY += ROW_H;

        // if (item.isResignationMonth) {
        //   doc
        //     .font('Helvetica-Oblique')
        //     .fontSize(6.5)
        //     .fillColor(COLORS.resignText)
        //     .text('* Resignation month (prorated)', PAGE_LEFT + 5, rowY, { width: 220 });
        //   doc.fillColor('#000000').font('Helvetica').fontSize(7.5);
        //   rowY += 9;
        // }
      });

      // ---- Summary section (kept as-is: Available VL / Total Summary / 13th Month) ----
      // In generateResignedEmployeePDF function, replace the Available VL section with:

      // ---- Summary section with 13th Month Payout ----
      const summaryY = rowY + 10;
      doc
        .moveTo(PAGE_LEFT, summaryY - 5)
        .lineTo(PAGE_RIGHT, summaryY - 5)
        .stroke();

      // Left side: 13th Month Payout Info
      const payout = summary.thirteenthMonthPayout;
      let leftColumnY = summaryY;

      // Last 13th Month Date
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(COLORS.text)
        .text('Last 13th Month Date: ', PAGE_LEFT, leftColumnY);

      if (payout && payout.date) {
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(COLORS.text)
          .text(`  ${formatDate(payout.date)}`, PAGE_LEFT + 120, leftColumnY);
      } else {
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(COLORS.textMuted)
          .text('No data', PAGE_LEFT + 120, leftColumnY);
      }

      // Last 13th Month Gross Amount
      const leftColumnRow2Y = leftColumnY + 15;
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(COLORS.text)
        .text('Last 13th Month Gross Amount:', PAGE_LEFT, leftColumnRow2Y);

      if (payout && payout.gross > 0) {
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor(COLORS.blue)
          .text(`  P${formatCurrency(payout.gross)}`, PAGE_LEFT + 120, leftColumnRow2Y);
      } else {
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(COLORS.textMuted)
          .text('₱0.00', PAGE_LEFT + 120, leftColumnRow2Y);
      }

      // Last 13th Month Amount
      const leftColumnRow3Y = leftColumnRow2Y + 15;
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(COLORS.text)
        .text('Last 13th Month Net Amount:', PAGE_LEFT, leftColumnRow3Y);

      if (payout && payout.amount > 0) {
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor(COLORS.blue)
          .text(`  P${formatCurrency(payout.amount)}`, PAGE_LEFT + 120, leftColumnRow3Y);
      } else {
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(COLORS.textMuted)
          .text('₱0.00', PAGE_LEFT + 120, leftColumnRow3Y);
      }

      doc.fillColor('#000000');

      // Right side: Summary Totals
      const boxTop = summaryY - 4;
      const boxHeight = 36;
      doc.rect(300, boxTop, PAGE_RIGHT - 300, boxHeight).fill(COLORS.highlightBg);

      const rightEdge = PAGE_RIGHT - 10;
      const gap = 5;

      // Total Summary
      const totalSummaryStr = formatCurrency(summary.totalSummary);
      const totalLabelStr = 'Total Summary:';
      const totalLabelWidth = doc.widthOfString(totalLabelStr, { font: 'Helvetica-Bold', size: 8 });
      const totalValueWidth = doc.widthOfString(totalSummaryStr, {
        font: 'Helvetica-Bold',
        size: 8,
      });

      const totalValueX = rightEdge - totalValueWidth;
      const totalLabelX = totalValueX - totalLabelWidth - gap;
      const finalTotalLabelX = Math.max(300 + 5, totalLabelX);
      const finalTotalValueX = finalTotalLabelX + totalLabelWidth + gap;

      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(COLORS.text)
        .text(totalLabelStr, finalTotalLabelX, summaryY);

      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(COLORS.blue)
        .text(totalSummaryStr, finalTotalValueX, summaryY);

      // 13th Month
      const summaryRow2Y = summaryY + 15;
      const thirteenthMonthStr = formatCurrency(summary.thirteenthMonth);
      const monthLabelStr = '13th Month:';
      const monthLabelWidth = doc.widthOfString(monthLabelStr, { font: 'Helvetica-Bold', size: 8 });
      const monthValueWidth = doc.widthOfString(thirteenthMonthStr, {
        font: 'Helvetica-Bold',
        size: 8,
      });

      const monthValueX = rightEdge - monthValueWidth;
      const monthLabelX = monthValueX - monthLabelWidth - gap;
      const finalMonthLabelX = Math.max(300 + 5, monthLabelX);
      const finalMonthValueX = finalMonthLabelX + monthLabelWidth + gap;

      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(COLORS.text)
        .text(monthLabelStr, finalMonthLabelX, summaryRow2Y);

      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(COLORS.blue)
        .text(thirteenthMonthStr, finalMonthValueX, summaryRow2Y);

      doc.fillColor('#000000');

      // ============================================================
      // 👇 ADD EXTRA SPACE HERE - Increased from 6 to 30
      // ============================================================
      let sigY = boxTop + boxHeight + 15; // Changed from 6 to 30

      // Check if we need a new page
      if (sigY > PAGE_HEIGHT - MARGIN - 50) {
        doc.addPage();
        sigY = MARGIN + 20;
      }

      // ---- Signature — moved down with more space ----
      doc.font('Helvetica-Bold').fontSize(8).text('Requested by:', PAGE_LEFT, sigY);
      doc
        .moveTo(PAGE_LEFT + 75, sigY + 9)
        .lineTo(PAGE_LEFT + 240, sigY + 9)
        .lineWidth(0.75)
        .stroke();
      doc
        .font('Helvetica')
        .fontSize(8)
        .text('Venus P. Pernites', PAGE_LEFT + 75, sigY + 11, {
          width: 165,
          align: 'center',
        });
      doc
        .font('Helvetica-Oblique')
        .fontSize(7)
        .fillColor(COLORS.textMuted)
        .text('Signature over printed name', PAGE_LEFT + 75, sigY + 21, {
          width: 165,
          align: 'center',
        });
      doc.fillColor('#000000');

      // ---- Printed date/time + page count ----
      const totalPages = doc.bufferedPageRange().count;
      const printedDateTime = `${formatDate(today)} ${today.toLocaleTimeString()}`;
      doc
        .font('Helvetica')
        .fontSize(5)
        .fillColor(COLORS.textMuted)
        .text(
          `Printed: ${printedDateTime} - Page ${totalPages} of ${totalPages}`,
          PAGE_LEFT,
          sigY + 21,
          {
            width: CONTENT_WIDTH,
            align: 'right',
          },
        );
      doc.fillColor('#000000');

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateResignedEmployeePDF };

// Get resigned employee details
async function getResignedEmployeeById(office, idno) {
  const dbPool = utilitiesModel.getDbPool('default');
  const payrollInfo = getPayrollFolder(office);

  const currentYear = new Date().getFullYear();
  const payrollTable = payrollInfo.tableName + currentYear;

  try {
    const [rows] = await dbPool.query(
      `SELECT 
        idno,
        CONCAT(lastname, ', ', firstname) AS fullname,
        lastname,
        firstname,
        middlename,
        region,
        department,
        branch,
        designation,
        employmentstatus,
        datehired,
        basicpay,
        monthlyrate,
        dailyrate
      FROM ${payrollTable}
      WHERE idno = ?
      LIMIT 1`,
      [idno],
    );

    return rows[0] || null;
  } catch (error) {
    console.error('Error getting resigned employee:', error);
    throw error;
  }
}

// Get the latest 13th month payout for an employee
async function getLastThirteenthMonthPayout(office, idno, resignationDate) {
  const dbPool = utilitiesModel.getDbPool('default');
  const payrollInfo = getPayrollFolder(office);

  // Get the resignation year
  const resignDate = new Date(resignationDate);
  let currentYear = resignDate.getFullYear();

  // We'll search from the resignation year going backwards
  let yearToCheck = currentYear;
  let foundPayout = null;

  // Limit search to last 10 years to avoid infinite loop
  const maxYearsToCheck = 10;
  let yearsChecked = 0;

  while (yearsChecked < maxYearsToCheck) {
    const payrollTable = payrollInfo.tableName + yearToCheck;

    try {
      // Check if table exists by trying to query it
      const [rows] = await dbPool.query(
        `SELECT enddate, totalnet, gross 
         FROM ${payrollTable} 
         WHERE idno = ? 
           AND YEAR(enddate) = ? 
           AND MONTH(enddate) = 12 
           AND enddate NOT IN (?, ?)
         ORDER BY enddate DESC 
         LIMIT 1`,
        [idno, yearToCheck, `${yearToCheck}-12-15`, `${yearToCheck}-12-31`],
      );

      if (rows.length > 0) {
        foundPayout = {
          date: rows[0].enddate,
          amount: parseFloat(rows[0].totalnet) || 0,
          gross: parseFloat(rows[0].gross) || 0, // ✅ ADD THIS LINE
        };
        break;
      }
    } catch (error) {
      // Table doesn't exist or other error - just continue to previous year
      // Don't log too many errors to avoid console spam
      if (yearsChecked < 3) {
        console.log(`Table ${payrollTable} doesn't exist or error:`, error.message);
      }
    }

    // Move to previous year
    yearToCheck--;
    yearsChecked++;
  }

  // Return null if no payout found (will be handled in frontend)
  return foundPayout;
}
module.exports = {
  searchResignedEmployees,
  getResignedEmployeeFromHR,
  getResignedEmployeeById,
  getResignedEmployeePayrollBreakdown,
  generateResignedEmployeePDF,
  checkPayrollDataExists,
  getPayrollDataByYear,
  processBreakdownData,
  getLastThirteenthMonthPayout, // add this line
};
