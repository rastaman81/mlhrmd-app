const utilitiesModel = require('./utilitiesModel');

// ─────────────────────────────────────────────────────────────
// PAYROLL DATA SOURCE
// ─────────────────────────────────────────────────────────────
// All offices (VisMin / Luzon / etc.) now share ONE table.
// Office is just a WHERE condition on that table now, not a
// different table to query. If your `office` column in
// payroll_transactions is named differently, update
// PAYROLL_OFFICE_COLUMN below — everything else adapts automatically.
const DEFAULT_PAYROLL_TABLE = 'payroll_transactions';
const PAYROLL_OFFICE_COLUMN = 'office';

function getPayrollConfig(office) {
  if (office.toLowerCase() === 'mlinc') {
    const year = new Date().getFullYear();

    return {
      table: `payroll_transactions_mlinc`,
      startDateColumn: 'startdate',
      endDateColumn: 'enddate',
      hiredDateColumn: 'datehired',
      monthlyRateColumn: 'monthlyrate',
      accountNoColumn: 'mobileno',
      employmentStatusColumn: 'employmentstatus',
      dailyRateColumn: 'dailyrate',
      basicPayColumn: 'basicpay',
      allowanceTotalColumn: 'totalallow',
      totalNetColumn: 'totalnet',
      totalOtColumn: 'totalot',
      totalOtherIncomeColumn: '(incomeamount1 + incomeamount2)',
      pagibigLoanColumn: 'pagibigloan',
      sssLoanColumn: 'sssloan',
      sakoColumn: '0',
      mlFundTotalColumn: 'mlfund',
      mlFundRegularColumn: 'mlfund',
      mlFundComakerColumn: '0',
      mlFundJewelryColumn: '0',
      mlFundOpiColumn: '0',
      mlFundPclColumn: '0',
      mlFundEmergencyColumn: '0',
      mlFundAllBuyoutColumn: '0',
      mlFundBdayColumn: '0',
      mlFundSslColumn: '0',
      motorLoanColumn: 'car_motorloan',
    };
  }

  return {
    table: DEFAULT_PAYROLL_TABLE,
    startDateColumn: 'start_date',
    endDateColumn: 'end_date',
    hiredDateColumn: 'hired_date',
    monthlyRateColumn: 'monthly_rate',
    accountNoColumn: 'account_no',
    employmentStatusColumn: 'employment_status',
    dailyRateColumn: 'daily_rate',
    basicPayColumn: 'basic_pay',
    allowanceTotalColumn: 'allowance_total',
    totalNetColumn: 'total_net',
    totalOtColumn: 'ot_total',
    totalOtherIncomeColumn: '(excess_pb + refund + salary_adjustment + other_income)',
    pagibigLoanColumn: 'pagibig_loan',
    sssLoanColumn: 'sss_loan',
    sakoColumn: 'sako',
    mlFundTotalColumn: 'mlfund_total',
    mlFundRegularColumn: 'mlfund_regular',
    mlFundComakerColumn: 'mlfund_comakership',
    mlFundJewelryColumn: 'mlfund_jewelry',
    mlFundOpiColumn: 'mlfund_opi',
    mlFundPclColumn: 'mlfund_pcl',
    mlFundEmergencyColumn: 'mlfund_emergency',
    mlFundAllBuyoutColumn: 'mlfund_all_buyout',
    mlFundBdayColumn: 'mlfund_bday',
    mlFundSslColumn: 'mlfund_ssl',
    motorLoanColumn: 'motor_loan',
  };
}

// ─────────────────────────────────────────────────────────────
// SEARCH EMPLOYEE WITH PAGINATION (UPDATED - AND condition)
// ─────────────────────────────────────────────────────────────
async function searchEmployee({
  query,
  office,
  field = 'lastname',
  page = 1,
  limit = 20,
  payrollDate = null,
  lastname = null, // NEW: Separate last name parameter
  firstname = null, // NEW: Separate first name parameter
}) {
  const latestCutoff = getLatestPayrollCutoff();
  const payrollDates = getLastTwoPayrollCycles();

  const pool = utilitiesModel.getDbPool('default');
  const {
    table: payrollTable,
    endDateColumn,
    hiredDateColumn,
    monthlyRateColumn,
    accountNoColumn,
    employmentStatusColumn,
    dailyRateColumn,
  } = getPayrollConfig(office);

  // Calculate offset for pagination
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // ── Build WHERE clause ──
  let whereClause = '';
  const params = [latestCutoff];

  // Office filter
  if (office) {
    whereClause += ` AND ${PAYROLL_OFFICE_COLUMN} = ?`;
    params.push(office);
  }

  // ─── Handle separate lastname and firstname parameters ───
  if (lastname && firstname) {
    // Both provided - use AND condition (ONLY lastname and firstname)
    whereClause += ` AND lastname LIKE ? AND firstname LIKE ?`;
    params.push(`%${lastname.trim()}%`, `%${firstname.trim()}%`);
  } else if (lastname) {
    // Only lastname provided
    whereClause += ` AND lastname LIKE ?`;
    params.push(`%${lastname.trim()}%`);
  } else if (firstname) {
    // Only firstname provided
    whereClause += ` AND firstname LIKE ?`;
    params.push(`%${firstname.trim()}%`);
  } else if (query && query.trim()) {
    // Fallback to query search (for compatibility with old search)
    const keyword = `%${query.trim()}%`;
    const SEARCHABLE_FIELDS = ['idno', 'lastname', 'firstname'];

    if (field === 'all' || !field) {
      whereClause += ` AND (idno LIKE ? OR lastname LIKE ? OR firstname LIKE ?)`;
      params.push(keyword, keyword, keyword);
    } else if (SEARCHABLE_FIELDS.includes(field)) {
      whereClause += ` AND ${field} LIKE ?`;
      params.push(keyword);
    }
  }

  // First, get total count for pagination
  const countSql = `
    SELECT COUNT(*) as total
    FROM ${payrollTable}
    WHERE  ${endDateColumn} = ?
    ${whereClause}
  `;

  const [countResult] = await pool.query(countSql, params);
  const total = countResult[0]?.total || 0;

  // Then get paginated results
  const sql = `
    SELECT 
      idno, 
      lastname, 
      firstname, 
      branch, 
      region,
      department as area,
      TIMESTAMPDIFF(YEAR, ${hiredDateColumn}, NOW()) AS service_years,
      TIMESTAMPDIFF(MONTH, ${hiredDateColumn}, NOW()) % 12 AS months,
      ${monthlyRateColumn} as monthly_rate, 
      ${hiredDateColumn} as hired_date, 
      ${accountNoColumn} as account_no, 
      ${employmentStatusColumn} as employment_status, 
      ${dailyRateColumn} as daily_rate
    FROM ${payrollTable}
    WHERE ${endDateColumn} = ?
    ${whereClause}
    ORDER BY LASTNAME, FIRSTNAME
    LIMIT ? OFFSET ?
  `;

  const dataParams = [...params, parseInt(limit), offset];
  const [rows] = await pool.query(sql, dataParams);
  console.log(sql, dataParams);
  return {
    data: rows,
    payrollDates,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// HELPER FUNCTIONS — PAYROLL CYCLE DATES
// ─────────────────────────────────────────────────────────────
function getLastTwoPayrollCycles(today = new Date()) {
  const results = [];

  let date = new Date(today);

  while (results.length < 2) {
    const year = date.getFullYear();
    const month = date.getMonth();

    const monthEndDate = new Date(year, month + 1, 0);
    const fifteenthDate = new Date(year, month, 15);

    const candidates = [
      { date: monthEndDate, cycle: 'secondCycle' },
      { date: fifteenthDate, cycle: 'firstCycle' },
    ];

    for (const c of candidates) {
      if (c.date <= date) {
        const formatted = formatLocalDate(c.date);

        if (!results.find((r) => r.date === formatted)) {
          results.push({
            date: formatted,
            cycle: c.cycle,
          });
        }

        if (results.length === 2) break;
      }
    }

    date = new Date(year, month, 0);
  }

  return results;
}

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
}

function getLatestPayrollCutoff(today = new Date()) {
  const cycles = getLastTwoPayrollCycles(today);

  return cycles.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date;
}

// ─────────────────────────────────────────────────────────────
// GET BRACKET TABLE
// ─────────────────────────────────────────────────────────────
const BRACKET_QUERIES = {
  ml_fund: `
    SELECT
      los                    AS 'LENGTH OF SERVICE',
      FORMAT(loanamount, 2)  AS 'LOAN AMOUNT',
      FORMAT(PRINCIPAL, 2)   AS 'PRINCIPAL',
      FORMAT(INTEREST, 2)    AS 'INTEREST',
      FORMAT(INSURANCE, 2)   AS 'INSURANCE',
      FORMAT(DEDUCTION, 2)   AS 'DEDUCTION',
      noyear                 AS 'YEARS TO PAY',
      lengthofservice        AS 'LOS',
      Months                 AS 'MONTHS'
    FROM loan_bracket_mlfund
  `,

  sako_maxi: `
    SELECT
      FORMAT(loanamount, 2) AS 'LOAN AMOUNT',
      FORMAT(YEAR1, 2)      AS 'ONE YEAR',
      FORMAT(YEAR2, 2)      AS 'TWO YEARS',
      FORMAT(YEAR3, 2)      AS 'THREE YEARS',
      FORMAT(YEAR4, 2)      AS 'FOUR YEARS',
      FORMAT(YEAR5, 2)      AS 'FIVE YEARS',
      FORMAT(YEAR6, 2)      AS 'SIX YEARS'
    FROM loan_bracket_sakomaxi
  `,

  sako_petty: `
    SELECT
      FORMAT(loanamount, 2) AS 'LOAN AMOUNT',
      FORMAT(month3,  2)    AS '3 MONTHS',
      FORMAT(month4,  2)    AS '4 MONTHS',
      FORMAT(month5,  2)    AS '5 MONTHS',
      FORMAT(month6,  2)    AS '6 MONTHS',
      FORMAT(month7,  2)    AS '7 MONTHS',
      FORMAT(month8,  2)    AS '8 MONTHS',
      FORMAT(month9,  2)    AS '9 MONTHS',
      FORMAT(month10, 2)    AS '10 MONTHS',
      FORMAT(month11, 2)    AS '11 MONTHS',
      FORMAT(month12, 2)    AS '12 MONTHS'
    FROM loan_bracket_sakopettycash
  `,

  sss: `
    SELECT
      FORMAT(monthly_rate,   2) AS 'MONTHLY RATE',
      FORMAT(loandeduction, 2) AS 'DEDUCTION'
    FROM loan_bracket_sss
  `,
};

async function getBracket({ type, office }) {
  //console.log('get brackets', type, office);
  const sql = BRACKET_QUERIES[type];

  if (!sql) {
    throw new Error(`Unknown bracket type: ${type}`);
  }

  const pool = utilitiesModel.getDbPool('default');

  const [rows] = await pool.query(sql);
  //console.log(sql, rows);

  const columns = rows.length ? Object.keys(rows[0]) : [];

  return { columns, rows };
}

// ─────────────────────────────────────────────────────────────
// GET EMPLOYEE PAYROLL DATA (RAW DATA FROM DATABASE)
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// GET EMPLOYEE PAYROLL DATA (RAW DATA FROM DATABASE)
// ─────────────────────────────────────────────────────────────
async function getEmployeePayrollData({ employeeId, office, payrollDates }) {
  const pool = utilitiesModel.getDbPool('default');
  const {
    table: payrollTable,
    startDateColumn,
    endDateColumn,
    monthlyRateColumn,
    basicPayColumn,
    allowanceTotalColumn,
    totalNetColumn,
    totalOtColumn,
    totalOtherIncomeColumn,
    pagibigLoanColumn,
    sssLoanColumn,
    sakoColumn,
    mlFundTotalColumn,
    mlFundRegularColumn,
    mlFundComakerColumn,
    mlFundJewelryColumn,
    mlFundOpiColumn,
    mlFundPclColumn,
    mlFundEmergencyColumn,
    mlFundAllBuyoutColumn,
    mlFundSslColumn,
    motorLoanColumn,
    mlFundBdayColumn,
  } = getPayrollConfig(office);
  const placeholders = payrollDates.map(() => '?').join(', ');

  let officeClause = '';
  const params = [employeeId, ...payrollDates];

  if (office) {
    officeClause = ` AND ${PAYROLL_OFFICE_COLUMN} = ?`;
    params.push(office);
  }

  // ─── FIX: Use consistent column names and proper date formatting ───
  const sql = `
    SELECT
      ${endDateColumn} AS enddate,
      ${basicPayColumn} as basic_pay,
      ${allowanceTotalColumn} as  allowance_total,
      ${totalNetColumn} AS netpay,
      ${totalOtColumn} as ot_total,
      ${totalOtherIncomeColumn}  AS otherincome,
      ${pagibigLoanColumn} as pagibig_loan,
      ${sssLoanColumn} as sss_loan,
      ${sakoColumn} as sako,
      ${mlFundTotalColumn} as mlfund_total, 
      ${mlFundRegularColumn} as mlfund_regular,
      ${mlFundComakerColumn} as mlfund_comakership,
      ${mlFundJewelryColumn} as mlfund_jewelry,
      ${mlFundOpiColumn} as mlfund_opi,
      ${mlFundPclColumn} as mlfund_pcl,
      ${mlFundEmergencyColumn} as mlfund_emergency,
      ${mlFundAllBuyoutColumn} as mlfund_all_buyout,
      ${mlFundBdayColumn} as mlfund_bday,
      ${mlFundSslColumn} as mlfund_ssl,
      ${motorLoanColumn} as motor_loan,
            ${monthlyRateColumn} as monthly_rate

    FROM ${payrollTable}
    WHERE idno = ?
      AND ${endDateColumn} IN (${placeholders})
      ${officeClause}
    ORDER BY ${endDateColumn} DESC
  `;

  // console.log('📊 Fetching raw payroll data:', {
  //   employeeId,
  //   office,
  //   table: PAYROLL_TABLE,
  //   dates: payrollDates,
  //   sql: sql,
  //   params: params,
  // });

  const [rows] = await pool.query(sql, params);

  // ─── DEBUG: Log what was found ───
  //console.log(`✅ Found ${rows.length} raw payroll records for employee ${employeeId}`);
  // rows.forEach((row, index) => {
  //   console.log(`  Record ${index + 1}:`, {
  //     enddate: row.enddate,
  //     netpay: row.netpay,
  //     ot_total: row.ot_total,
  //     allowance_total: row.allowance_total,
  //     otherincome: row.otherincome,
  //   });
  // });

  // ─── FIX: If we have multiple records, check if we have both cycles ───
  if (rows.length === 1) {
    console.log('⚠️ Only one payroll record found. Using it for both cycles.');
    // Duplicate the single record for both cycles
    const singleRecord = rows[0];
    rows.push({ ...singleRecord });
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────
// CHECK EXISTING LOAN FOR EMPLOYEE
// ─────────────────────────────────────────────────────────────
async function checkExistingLoan({ employeeId, loanType, year, office }) {
  //console.log('cheking');
  const pool = utilitiesModel.getDbPool('default');

  const sql = `
    SELECT 
      controlno,
      idno,
      lastname,
      firstname,
      branch,
      loantype,
      loanamount,
      loandeduction,
      datereceived,
      dateforwarded,
      STATUS,
      preparedby,
      firstpayrolldate,
      secondpayrolldate,
      comaker1,
      comaker2,
      comaker3,
      comaker4, first_cycle, second_cycle
    FROM loan_monitoring
    WHERE idno = ?
      AND LOWER(loantype) like  ?   -- ✅ Case-insensitive comparison
      AND YEAR(datereceived) = ? 
       AND office = ?              -- ✅ ADD OFFICE FILTER
      -- AND STATUS = 'Approved'
    ORDER BY datereceived DESC
    LIMIT 1
  `;

  const params = [employeeId, `%${loanType.toLowerCase()}%`, year, office];

  //console.log(sql, '🔍 Checking existing loan:', params);

  const [rows] = await pool.query(sql, params);

  return rows.length > 0 ? rows[0] : null;
}

// ─────────────────────────────────────────────────────────────
// LOAN TYPE CONFIGURATION FOR BONUS LOANS
// ─────────────────────────────────────────────────────────────

// Full list of bonus loan type names (for display/validation)
function getBonusLoanTypes() {
  return ['ml fund 13th month', 'ml fund a.l.l. bonus', 'sako 13th month', 'sako a.l.l. bonus'];
}

// Bonus loan categories for database checking
function getBonusLoanCategories() {
  return ['a.l.l. bonus', '13th month'];
}

// Map display names to categories
function getBonusLoanCategoryMap() {
  return {
    'ml fund 13th month': '13th month',
    'ml fund a.l.l. bonus': 'a.l.l. bonus',
    'sako 13th month': '13th month',
    'sako a.l.l. bonus': 'a.l.l. bonus',
  };
}

// Get category for a bonus loan type
function getBonusLoanCategory(loanType) {
  const map = getBonusLoanCategoryMap();
  return map[loanType] || null;
}

// Check if loan type is a bonus loan
function isBonusLoanType(loanType) {
  const bonusTypes = getBonusLoanTypes();
  return bonusTypes.includes(loanType.toLowerCase());
}

// ─────────────────────────────────────────────────────────────
// SAVE LOAN TO DATABASE
// ─────────────────────────────────────────────────────────────
async function saveLoan(loanData) {
  const pool = utilitiesModel.getDbPool('default');

  loanData = trimStringFields(loanData);
  //console.log(loanData);
  // Determine if it's a bonus loan (only 4 specific types)
  const bonusLoanTypes = [
    'ml fund a.l.l. bonus',
    'ml fund 13th month',
    'sako a.l.l. bonus',
    'sako 13th month',
  ];

  const isBonusLoan = bonusLoanTypes.includes(loanData.loantype.toLowerCase());

  let sql;
  let params;

  if (isBonusLoan) {
    // BONUS LOAN: Only save specific fields
    sql = `
  INSERT INTO loan_monitoring (
    idno, account_no, region, lastname, firstname, branch, 
    loantype, loanamount, netproceeds, datereceived, 
    office, firstpayrolldate, secondpayrolldate, 
    walletno, preparedby, STATUS, lengthofservice, monthlyrate, first_cycle, second_cycle
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?)
`;

    params = [
      loanData.idno,
      loanData.account_no || null, // ← ADD THIS
      loanData.region,
      loanData.lastname,
      loanData.firstname,
      loanData.branch,
      loanData.loantype,
      loanData.loanamount,
      loanData.netproceeds,
      loanData.datereceived || new Date(),
      loanData.office,
      loanData.firstpayrolldate || null,
      loanData.secondpayrolldate || null,
      loanData.walletno || null,
      loanData.preparedby,
      'for signature',
      loanData.lengthofservice || null,
      loanData.monthly_rate || null,
      loanData.firstpayrolldate || null,
      loanData.secondpayrolldate || null,
    ];
  } else {
    // REGULAR LOAN: Save all fields
    sql = `
  INSERT INTO loan_monitoring (
    idno, account_no, region, lastname, firstname, branch, 
    loantype, loanamount, loandeduction, netpay1, netpay2, 
    existingloan, \`35percent\`, deductionpermonth, netproceeds, 
    datereceived, office, firstpayrolldate, secondpayrolldate, 
    comaker1, comaker2, comaker3, comaker4, 
    walletno, preparedby, STATUS, lengthofservice, monthlyrate, first_cycle, second_cycle
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?)
`;

    params = [
      loanData.idno,
      loanData.account_no || null, // ← ADD THIS
      loanData.region,
      loanData.lastname,
      loanData.firstname,
      loanData.branch,
      loanData.loantype,
      loanData.loanamount,
      loanData.loandeduction || 0,
      loanData.netpay1 || 0,
      loanData.netpay2 || 0,
      loanData.existingloan || 0,
      loanData.percent35 || 0,
      loanData.deductionpermonth || 0,
      loanData.netproceeds || 0,
      loanData.datereceived || new Date(),
      loanData.office,
      loanData.firstpayrolldate || null,
      loanData.secondpayrolldate || null,
      loanData.comaker1 || null,
      loanData.comaker2 || null,
      loanData.comaker3 || null,
      loanData.comaker4 || null,
      loanData.walletno || null,
      loanData.preparedby,
      'for signature',
      loanData.lengthofservice || null,
      loanData.monthly_rate || null,
      loanData.firstpayrolldate || null,
      loanData.secondpayrolldate || null,
    ];
  }

  //console.log('📝 Saving loan:', sql, params);

  const [result] = await pool.query(sql, params);

  // Get the auto-generated control number
  const controlNo = result.insertId;

  // Fetch the saved record to return
  const [savedRows] = await pool.query('SELECT * FROM loan_monitoring WHERE controlno = ?', [
    controlNo,
  ]);

  return {
    controlNo,
    loan: savedRows[0] || null,
  };
}
// models/loanModel.js - Add this function

// ─────────────────────────────────────────────────────────────
// SEARCH CO-MAKER (Employee for co-maker selection)
// GET /loan/search-comaker?query=&office=&excludeIdno=
// ─────────────────────────────────────────────────────────────
async function searchCoMaker({
  query,
  office,
  excludeIdno = null,
  field = 'lastname',
  page = 1,
  limit = 20,
}) {
  const latestCutoff = getLatestPayrollCutoff();
  const payrollDates = getLastTwoPayrollCycles();

  const pool = utilitiesModel.getDbPool('default');
  const {
    table: payrollTable,
    endDateColumn,
    hiredDateColumn,
    monthlyRateColumn,
    accountNoColumn,
    employmentStatusColumn,
    dailyRateColumn,
  } = getPayrollConfig(office);

  // Calculate offset for pagination
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // ── Build WHERE clause ──
  let whereClause = '';
  const params = [latestCutoff];

  if (office) {
    whereClause += ` AND ${PAYROLL_OFFICE_COLUMN} = ?`;
    params.push(office);
  }

  // Exclude the borrower from co-maker search
  if (excludeIdno) {
    whereClause += ` AND idno != ?`;
    params.push(excludeIdno);
  }

  const SEARCHABLE_FIELDS = ['idno', 'lastname', 'firstname'];

  if (query && query.trim()) {
    const keyword = `%${query.trim()}%`;

    if (field === 'all' || !field) {
      whereClause += ` AND (idno LIKE ? OR lastname LIKE ? OR firstname LIKE ?)`;
      params.push(keyword, keyword, keyword);
    } else if (SEARCHABLE_FIELDS.includes(field)) {
      whereClause += ` AND ${field} LIKE ?`;
      params.push(keyword);
    }
  }

  // First, get total count for pagination
  const countSql = `
    SELECT COUNT(*) as total
    FROM ${payrollTable}
    WHERE ${endDateColumn} = ?
    ${whereClause}
  `;

  const [countResult] = await pool.query(countSql, params);
  const total = countResult[0]?.total || 0;

  // Then get paginated results
  const sql = `
    SELECT 
      idno, 
      lastname, 
      firstname, 
      middlename,
      branch, 
      region,
      department as area,
      TIMESTAMPDIFF(YEAR, ${hiredDateColumn}, NOW()) AS service_years,
      TIMESTAMPDIFF(MONTH, ${hiredDateColumn}, NOW()) % 12 AS months,
            ${monthlyRateColumn} as monthly_rate, 
      ${hiredDateColumn} as hired_date, 
      ${accountNoColumn} as account_no, 
      ${employmentStatusColumn} as employment_status, 
      ${dailyRateColumn} as daily_rate
    FROM ${payrollTable}
    WHERE ${endDateColumn} = ?
    ${whereClause}
    ORDER BY LASTNAME, FIRSTNAME
    LIMIT ? OFFSET ?
  `;

  const dataParams = [...params, parseInt(limit), offset];
  const [rows] = await pool.query(sql, dataParams);

  return {
    data: rows,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
}

// ─────────────────────────────────────────────
// STRING TRIM HELPER
// ─────────────────────────────────────────────
// Trims a value if it's a string; passes everything else through untouched
// (numbers, null, undefined) so we don't need type checks at every call site.
function trimIfString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

// Trims every string value in an object, returning a new object.
// Used right before values go into an INSERT/UPDATE so stray whitespace
// (leading/trailing spaces from copy-pasted HR data, form inputs, etc.)
// never reaches the database.
function trimStringFields(obj) {
  const trimmed = {};
  for (const key of Object.keys(obj)) {
    trimmed[key] = trimIfString(obj[key]);
  }
  return trimmed;
}

// ─────────────────────────────────────────────────────────────
// GET LOAN BY CONTROL NUMBER (Update Loan Status page)
// controlno is an AUTO_INCREMENT PK — globally unique, no office needed
// ─────────────────────────────────────────────────────────────
async function getLoanByControlNo({ controlNo }) {
  const pool = utilitiesModel.getDbPool('default');

  const sql = `
    SELECT
      controlno, idno, account_no, region, lastname, firstname, branch,
      loantype, loanamount, loandeduction, netpay1, netpay2, existingloan,
      \`35percent\`, deductionpermonth, netproceeds, datereceived, dateforwarded,
      office, firstpayrolldate, secondpayrolldate,
      comaker1, comaker2, comaker3, comaker4,
      walletno, preparedby, STATUS AS status, remarks,
      lengthofservice, monthlyrate, first_cycle, second_cycle
    FROM loan_monitoring
    WHERE controlno = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [controlNo]);

  return rows.length > 0 ? rows[0] : null;
}

// ─────────────────────────────────────────────────────────────
// SEARCH LOANS BY EMPLOYEE NAME (Update Loan Status page)
// ─────────────────────────────────────────────────────────────
async function searchLoanByName({ office, lastname, firstname, page = 1, limit = 20 }) {
  const pool = utilitiesModel.getDbPool('default');
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let whereClause = ' WHERE 1=1';
  const params = [];

  if (office) {
    whereClause += ' AND office = ?';
    params.push(office);
  }
  if (lastname) {
    whereClause += ' AND lastname LIKE ?';
    params.push(`%${lastname.trim()}%`);
  }
  if (firstname) {
    whereClause += ' AND firstname LIKE ?';
    params.push(`%${firstname.trim()}%`);
  }

  const countSql = `SELECT COUNT(*) as total FROM loan_monitoring ${whereClause}`;
  const [countResult] = await pool.query(countSql, params);
  const total = countResult[0]?.total || 0;

  const sql = `
    SELECT
      controlno, idno, lastname, firstname, branch, region,
      loantype, loanamount, loandeduction, netproceeds, firstpayrolldate, secondpayrolldate,
      datereceived, dateforwarded, STATUS AS status, preparedby, office, first_cycle, second_cycle
    FROM loan_monitoring
    ${whereClause}
    ORDER BY datereceived DESC
    LIMIT ? OFFSET ?
  `;
  const dataParams = [...params, parseInt(limit), offset];
  const [rows] = await pool.query(sql, dataParams);
  //console.log(sql, dataParams);
  return {
    data: rows,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
}
async function searchLoanByNameRecompute({ office, lastname, firstname, page = 1, limit = 20 }) {
  const pool = utilitiesModel.getDbPool('default');
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Fixed condition — never show already-approved loans in this search,
  // regardless of what office/name filters are applied.
  let whereClause = " WHERE 1=1 AND LOWER(STATUS) != 'approved'";
  const params = [];

  if (office) {
    whereClause += ' AND office = ?';
    params.push(office);
  }
  if (lastname) {
    whereClause += ' AND lastname LIKE ?';
    params.push(`%${lastname.trim()}%`);
  }
  if (firstname) {
    whereClause += ' AND firstname LIKE ?';
    params.push(`%${firstname.trim()}%`);
  }

  const countSql = `SELECT COUNT(*) as total FROM loan_monitoring ${whereClause}`;
  const [countResult] = await pool.query(countSql, params);
  const total = countResult[0]?.total || 0;

  const sql = `
    SELECT
      controlno, idno, lastname, firstname, branch, region,
      loantype, loanamount, loandeduction, netproceeds, firstpayrolldate, secondpayrolldate,
      datereceived, dateforwarded, STATUS AS status, preparedby, office, first_cycle, second_cycle
    FROM loan_monitoring
    ${whereClause}
    ORDER BY datereceived DESC
    LIMIT ? OFFSET ?
  `;
  const dataParams = [...params, parseInt(limit), offset];
  const [rows] = await pool.query(sql, dataParams);
  //console.log(sql, dataParams);
  return {
    data: rows,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// UPDATE LOAN STATUS + REMARKS (Update Loan Status page)
// ─────────────────────────────────────────────────────────────
async function updateLoanStatus({ controlNo, remarks, status }) {
  const pool = utilitiesModel.getDbPool('default');

  const sql = `
    UPDATE loan_monitoring
    SET remarks = ?,
        STATUS = ?,
        dateforwarded = CASE WHEN LOWER(?) = 'approved' THEN NOW() ELSE dateforwarded END,
        datemodified = NOW()
    WHERE controlno = ?
  `;
  const [result] = await pool.query(sql, [remarks || null, status, status, controlNo]);

  return result.affectedRows > 0;
}

// ─────────────────────────────────────────────────────────────
// UPDATE LOAN AFTER RECOMPUTE (Recompute page)
// ─────────────────────────────────────────────────────────────
async function recomputeLoanUpdate({
  controlNo,
  loantype,
  loanamount,
  loandeduction,
  netpay1,
  netpay2,
  existingloan,
  percent35,
  deductionpermonth,
  netproceeds,
  comaker1,
  comaker2,
  comaker3,
  comaker4,
  lengthofservice,
  monthly_rate,
}) {
  console.log('📊 recomputeLoanUpdate - percent35:', percent35);
  const pool = utilitiesModel.getDbPool('default');

  const sql = `
    UPDATE loan_monitoring
    SET loantype = ?, loanamount = ?, loandeduction = ?, netpay1 = ?, netpay2 = ?,
        existingloan = ?, \`35percent\` = ?, deductionpermonth = ?, netproceeds = ?,
        comaker1 = ?, comaker2 = ?, comaker3 = ?, comaker4 = ?,
        lengthofservice = ?, monthlyrate = ?, datemodified = NOW()
    WHERE controlno = ?
  `;
  const params = [
    loantype,
    loanamount,
    loandeduction,
    netpay1,
    netpay2,
    existingloan,
    percent35,
    deductionpermonth,
    netproceeds,
    comaker1 || null,
    comaker2 || null,
    comaker3 || null,
    comaker4 || null,
    lengthofservice || 0,
    monthly_rate || 0,
    controlNo,
  ];

  const [result] = await pool.query(sql, params);
  return result.affectedRows > 0;
}

// loanModel.js - Add these functions
const ALLOWED_SORT_COLUMNS = [
  'datereceived',
  'dateforwarded',
  'controlno',
  'loanamount',
  'netproceeds',
  'lastname',
  'firstname',
  'loantype',
  'STATUS',
];
const ALLOWED_SORT_ORDERS = ['ASC', 'DESC'];
// ─────────────────────────────────────────────────────────────
// GET LOANS FOR REPORTING (WITH TIME SUPPORT) - MySQL 5.0 Compatible
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// GET LOANS FOR REPORTING (with time + sorting + provider-based date column)
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// GET LOANS FOR REPORTING (with time + provider-based date + fixed ascending sorting)
// ─────────────────────────────────────────────────────────────
async function getLoansForReport(filters = {}) {
  const {
    startDate,
    startTime,
    endDate,
    endTime,
    office,
    loanType,
    status,
    provider,
    employeeId,
    page = 1,
    limit = 100,
    sortBy = 'lastname', // default primary sort column
  } = filters;

  // ─── Security allowlists ───
  const ALLOWED_SORT_COLUMNS = [
    'datereceived',
    'dateforwarded',
    'controlno',
    'loanamount',
    'netproceeds',
    'lastname',
    'firstname',
    'loantype',
    'STATUS',
  ];
  const safeSortBy = ALLOWED_SORT_COLUMNS.includes(sortBy) ? sortBy : 'lastname';

  const pool = utilitiesModel.getDbPool('default');
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // ─── Determine which date column to use ───
  // SSS/PAGIBIG -> datereceived, others (ML Fund, etc.) -> dateforwarded
  let dateColumn = 'datereceived'; // default fallback
  if (provider) {
    const p = provider.toLowerCase();
    if (p === 'sss' || p === 'pagibig') {
      dateColumn = 'datereceived';
    } else {
      dateColumn = 'dateforwarded';
    }
  } else {
    // No provider selected: use datereceived (consistent with legacy default)
    dateColumn = 'datereceived';
  }

  // ─── Build WHERE conditions ───
  let conditions = [];
  let params = [];

  if (startDate && startTime) {
    conditions.push(`${dateColumn} >= ?`);
    params.push(`${startDate} ${startTime}:00`);
  } else if (startDate) {
    conditions.push(`${dateColumn} >= ?`);
    params.push(`${startDate} 00:00:00`);
  }

  if (endDate && endTime) {
    conditions.push(`${dateColumn} <= ?`);
    params.push(`${endDate} ${endTime}:00`);
  } else if (endDate) {
    conditions.push(`${dateColumn} <= ?`);
    params.push(`${endDate} 23:59:59`);
  }

  if (office) {
    conditions.push('office = CONVERT(? USING utf8)');
    params.push(office);
  }

  if (provider && !loanType) {
    conditions.push('LOWER(loantype) LIKE ?');
    params.push(`%${provider.toLowerCase()}%`);
  }

  if (loanType) {
    conditions.push('LOWER(loantype) = LOWER(?)');
    params.push(loanType);
  }

  if (status) {
    conditions.push('LOWER(STATUS) = LOWER(?)');
    params.push(status);
  }

  if (employeeId) {
    conditions.push('idno = ?');
    params.push(employeeId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // ─── Get total count ───
  const countQuery = `SELECT COUNT(*) as total FROM loan_monitoring ${whereClause}`;
  const [countResult] = await pool.query(countQuery, params);
  const total = countResult[0]?.total || 0;

  // ─── Build ORDER BY clause (always ASC, with lastname, firstname as secondary) ───
  let orderClause;
  if (safeSortBy === 'lastname') {
    // If primary is already lastname, we can just sort by lastname, firstname
    orderClause = 'ORDER BY lastname ASC, firstname ASC';
  } else {
    // Primary column first, then lastname, firstname
    orderClause = `ORDER BY ${safeSortBy} ASC, lastname ASC, firstname ASC`;
  }

  // ─── Fetch paginated results ───
  const query = `
    SELECT 
      controlno,
      idno,
      walletno,
      region,
      lastname,
      firstname,
      branch,
      firstpayrolldate,
      secondpayrolldate,
      loantype,
      loanamount,
      loandeduction,
      existingloan,
      netproceeds,
      deductionpermonth,
      datereceived,
      dateforwarded as dateapproved,
      STATUS,
      preparedby,
      office,
      comaker1,
      comaker2,
      comaker3,
      comaker4,
      remarks, first_cycle, second_cycle
    FROM loan_monitoring 
    ${whereClause}
    ${orderClause}
    LIMIT ? OFFSET ?
  `;

  const [results] = await pool.query(query, [...params, parseInt(limit), offset]);

  return {
    data: results,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// GET LOAN SUMMARY STATISTICS - MySQL 5.0 Compatible
// ─────────────────────────────────────────────────────────────
async function getLoanSummary(filters = {}) {
  const { startDate, startTime, endDate, endTime, office, loanType, status, provider } = filters;

  const pool = utilitiesModel.getDbPool('default');
  let conditions = [];
  let params = [];

  if (startDate && startTime) {
    conditions.push('datereceived >= ?');
    params.push(`${startDate} ${startTime}:00`);
  } else if (startDate) {
    conditions.push('datereceived >= ?');
    params.push(`${startDate} 00:00:00`);
  }

  if (endDate && endTime) {
    conditions.push('datereceived <= ?');
    params.push(`${endDate} ${endTime}:00`);
  } else if (endDate) {
    conditions.push('datereceived <= ?');
    params.push(`${endDate} 23:59:59`);
  }

  if (office) {
    conditions.push('office = CONVERT(? USING utf8)');
    params.push(office);
  }

  if (provider) {
    conditions.push('LOWER(loantype) LIKE ?');
    params.push(`%${provider.toLowerCase()}%`);
  }

  if (loanType) {
    conditions.push('LOWER(loantype) = LOWER(?)');
    params.push(loanType);
  }

  if (status) {
    conditions.push('LOWER(STATUS) = LOWER(?)');
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT 
      loantype,
      COUNT(*) as total_loans,
      SUM(loanamount) as total_amount,
      AVG(loanamount) as avg_amount,
      SUM(netproceeds) as total_net_proceeds,
      COUNT(CASE WHEN LOWER(STATUS) = 'approved' THEN 1 END) as approved_count,
      COUNT(CASE WHEN LOWER(STATUS) = 'pending' THEN 1 END) as pending_count,
      COUNT(CASE WHEN LOWER(STATUS) = 'for signature' THEN 1 END) as for_signature_count,
      COUNT(CASE WHEN LOWER(STATUS) = 'disapproved' THEN 1 END) as disapproved_count,
      COUNT(CASE WHEN LOWER(STATUS) = 'cancelled' THEN 1 END) as cancelled_count
    FROM loan_monitoring 
    ${whereClause}
    GROUP BY loantype
    ORDER BY total_amount DESC
  `;

  const [results] = await pool.query(query, params);
  return results;
}

async function getLoanStatusCounts(filters = {}) {
  const { startDate, startTime, endDate, endTime, office, loanType, status, provider } = filters;

  const pool = utilitiesModel.getDbPool('default');
  let conditions = [];
  let params = [];

  if (startDate && startTime) {
    conditions.push('datereceived >= ?');
    params.push(`${startDate} ${startTime}:00`);
  } else if (startDate) {
    conditions.push('datereceived >= ?');
    params.push(`${startDate} 00:00:00`);
  }

  if (endDate && endTime) {
    conditions.push('datereceived <= ?');
    params.push(`${endDate} ${endTime}:00`);
  } else if (endDate) {
    conditions.push('datereceived <= ?');
    params.push(`${endDate} 23:59:59`);
  }

  if (office) {
    conditions.push('office = CONVERT(? USING utf8)');
    params.push(office);
  }

  if (provider) {
    conditions.push('LOWER(loantype) LIKE ?');
    params.push(`%${provider.toLowerCase()}%`);
  }

  if (loanType) {
    conditions.push('LOWER(loantype) = LOWER(?)');
    params.push(loanType);
  }

  if (status) {
    conditions.push('LOWER(STATUS) = LOWER(?)');
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT 
      STATUS,
      COUNT(*) as count
    FROM loan_monitoring 
    ${whereClause}
    GROUP BY STATUS
    ORDER BY count DESC
  `;

  const [results] = await pool.query(query, params);
  return results;
}

// ─────────────────────────────────────────────────────────────
// GET LOAN STATUS COUNTS - MySQL 5.0 Compatible
// ─────────────────────────────────────────────────────────────

// Update module.exports at the bottom
module.exports = {
  searchEmployee,
  searchCoMaker,
  getBracket,
  getLastTwoPayrollCycles,
  getEmployeePayrollData,
  checkExistingLoan,
  getBonusLoanTypes,
  getBonusLoanCategories,
  getBonusLoanCategoryMap,
  getBonusLoanCategory,
  isBonusLoanType,
  saveLoan,
  getLoanByControlNo,
  searchLoanByName,
  updateLoanStatus,
  recomputeLoanUpdate,
  getLoansForReport, // 👈 ADD THIS
  getLoanSummary, // 👈 ADD THIS
  getLoanStatusCounts, // 👈 ADD THIS
  searchLoanByNameRecompute,
};
