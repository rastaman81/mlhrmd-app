// models/lastPayModel.js

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const utilitiesModel = require('./utilitiesModel');
const resignedEmployeeModel = require('./resignedEmployeeModel');

// ---------------------------------------------------------------------------
// Business rules ported from the legacy WinForms LastPayComputation.cs
// Kept as pure functions so they're independently testable.
// ---------------------------------------------------------------------------

// Tenure bracket -> number of "days per year of service" used in the LOS formula
const LOS_DAY_BRACKETS = [
  { min: 5, max: 9, days: 17 },
  { min: 10, max: 14, days: 22 },
  { min: 15, max: 19, days: 27 },
  { min: 20, max: Infinity, days: 30 },
];

function getDaysForLOSYears(losYears) {
  if (losYears < 5) return 0;
  const bracket = LOS_DAY_BRACKETS.find((b) => losYears >= b.min && losYears <= b.max);
  return bracket ? bracket.days : 30;
}

// Calculates raw + "rounded" length of service.
// Legacy rule: if years >= 5 AND remaining months >= 6, round up to the next full year.
// IMPORTANT: `roundedYears`/`roundedMonths`/`label` feed the LOS pay formula and day-bracket
// lookup (this rounding is intentional, per business rule, and affects actual pay).
// `actualLabel` is the true, unrounded tenure and should be used for on-screen display only.
function calculateLengthOfService(hiredDate, resignedDate) {
  if (!hiredDate || !resignedDate) {
    return {
      years: 0,
      months: 0,
      roundedYears: 0,
      roundedMonths: 0,
      label: 'N/A',
      actualLabel: 'N/A',
    };
  }

  const hired = new Date(hiredDate);
  const resigned = new Date(resignedDate);

  let years = resigned.getFullYear() - hired.getFullYear();
  let months = resigned.getMonth() - hired.getMonth();

  if (resigned.getDate() < hired.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  let roundedYears = years;
  let roundedMonths = months;
  if (years >= 5 && months >= 6) {
    roundedYears = years + 1;
    roundedMonths = 0;
  }

  const buildLabel = (y, m) => {
    if (y === 0 && m === 0) return 'Less than a month';
    if (y > 0 && m > 0) return `${y} year${y > 1 ? 's' : ''} & ${m} month${m > 1 ? 's' : ''}`;
    if (y > 0) return `${y} year${y > 1 ? 's' : ''}`;
    return `${m} month${m > 1 ? 's' : ''}`;
  };

  const label = buildLabel(roundedYears, roundedMonths); // rounded — used internally for pay
  const actualLabel = buildLabel(years, months); // unrounded — used for display

  return { years, months, roundedYears, roundedMonths, label, actualLabel };
}

// LOS pay = (monthlyRate / 30) * daysForBracket * losYears — only applies if losYears >= 5
function computeLastPayAmount(monthlyRate, losYears) {
  if (!losYears || losYears < 5 || !monthlyRate) {
    return { amount: 0, days: 0, formula: '' };
  }
  const days = getDaysForLOSYears(losYears);
  const amount = (monthlyRate / 30) * days * losYears;
  const formula = `${formatCurrency(monthlyRate)} / 30 days  x  ${days} days  x  ${losYears} year(s)`;
  return { amount, days, formula };
}

function formatCurrency(amount) {
  return parseFloat(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateForSql(date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Signature block (benefits_credentials) — single config row holding the
// Prepared By / Noted By / Approved By names and titles used on printouts.
// ---------------------------------------------------------------------------
async function getSignatureCredentials() {
  const dbPool = utilitiesModel.getDbPool('default');
  const [rows] = await dbPool.query(
    'SELECT preparedBy, preparedTitle, notedBy, notedTitle, approvedBy, approvedTitle FROM benefits_credentials ORDER BY credentialNo DESC LIMIT 1',
  );
  return (
    rows[0] || {
      preparedBy: null,
      preparedTitle: null,
      notedBy: null,
      notedTitle: null,
      approvedBy: null,
      approvedTitle: null,
    }
  );
}

// ---------------------------------------------------------------------------
// Resignation types (benefits_resignation_types)
// ---------------------------------------------------------------------------
async function getResignationTypes() {
  const dbPool = utilitiesModel.getDbPool('default');
  const [rows] = await dbPool.query(
    'SELECT id, resignation_type FROM benefits_resignation_types ORDER BY resignation_type',
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Deduction types (benefits_deduction_types)
// ---------------------------------------------------------------------------
async function getDeductionTypes() {
  const dbPool = utilitiesModel.getDbPool('default');
  const [rows] = await dbPool.query(
    'SELECT deductiontype FROM benefits_deduction_types ORDER BY deductiontype',
  );
  const types = rows.map((r) => r.deductiontype);
  types.push('Others');
  return { types };
}

// ---------------------------------------------------------------------------
// Existing computation check (benefits_exit_computations / benefits_exit_details)
// idno is the sole PRIMARY KEY on benefits_exit_computations — structurally only
// one row per employee, ever. Once a row exists, the screen becomes view-only.
// ---------------------------------------------------------------------------
async function checkExistingComputation(idno) {
  const dbPool = utilitiesModel.getDbPool('default');
  const [rows] = await dbPool.query(
    'SELECT * FROM benefits_exit_computations WHERE idno = ? LIMIT 1',
    [idno],
  );
  return rows[0] || null;
}

async function getExistingComputationDetails(idno) {
  const computation = await checkExistingComputation(idno);
  if (!computation) return null;

  const dbPool = utilitiesModel.getDbPool('default');
  const [details] = await dbPool.query(
    'SELECT detailno, deductiontype, deduction_type, outstanding, deduction, balance FROM benefits_exit_details WHERE idno = ? ORDER BY detailno',
    [idno],
  );

  return { computation, details };
}

// ---------------------------------------------------------------------------
// Main aggregator: everything the Last Pay Computation screen needs in one call
// Reuses resignedEmployeeModel so employee lookup / payroll-year fallback /
// 13th-month-payout logic stays in a single source of truth.
// ---------------------------------------------------------------------------
async function getLastPayDetails(office, idno, forceYear = null) {
  const employee = await resignedEmployeeModel.getResignedEmployeeFromHR(office, idno);

  if (!employee) {
    return { employee: null, hasData: false };
  }

  const resignationDate = employee.dateresign;
  const resignYear = new Date(resignationDate).getFullYear();
  const targetYear = forceYear || resignYear;

  const hasDataInTargetYear = await resignedEmployeeModel.checkPayrollDataExists(
    office,
    idno,
    targetYear,
  );

  let yearUsed = targetYear;
  let payrollResult;

  if (!hasDataInTargetYear && !forceYear) {
    const previousYear = resignYear - 1;
    const hasDataInPreviousYear = await resignedEmployeeModel.checkPayrollDataExists(
      office,
      idno,
      previousYear,
    );

    if (hasDataInPreviousYear) {
      return {
        employee,
        hasData: false,
        availableYears: [previousYear],
        currentYear: resignYear,
        message: `No payroll data found for ${resignYear}. Would you like to view data from ${previousYear}?`,
      };
    }

    return {
      employee,
      hasData: false,
      availableYears: [],
      currentYear: resignYear,
      message: 'No payroll records found for this employee.',
    };
  }

  payrollResult = await resignedEmployeeModel.getPayrollDataByYear(
    office,
    idno,
    yearUsed,
    resignationDate,
  );

  const monthlyRate = payrollResult.latestMonthlyRate || 0;
  const dailyRate = payrollResult.latestDailyRate || 0;

  // Same averaged 13th month figure used by Payroll Breakdown (totalSummary / 12).
  const processedBreakdown = resignedEmployeeModel.processBreakdownData(
    payrollResult.records,
    resignationDate,
  );
  const totalSummary = processedBreakdown.reduce((sum, item) => sum + item.totalIncome, 0);
  const thirteenthMonth = totalSummary / 12;

  // NOTE: the actual-last-December-payout reference value (getLastThirteenthMonthPayout)
  // was intentionally dropped from this screen — it's redundant with Payroll Breakdown,
  // and its year-by-year backward search across up to 10 payroll tables was the main
  // source of load-time latency when selecting an employee here.

  const los = calculateLengthOfService(employee.datehired, employee.dateresign);

  // These lookups don't depend on anything above, so run them in parallel
  // instead of awaiting them one after another.
  const [{ types: deductionTypes }, resignationTypes, existing] = await Promise.all([
    getDeductionTypes(),
    getResignationTypes(),
    getExistingComputationDetails(idno),
  ]);

  employee.monthlyrate = monthlyRate;
  employee.dailyrate = dailyRate;

  return {
    employee,
    hasData: true,
    currentYear: yearUsed,
    monthlyRate,
    dailyRate,
    thirteenthMonth, // used in Gross/Net computation
    lengthOfService: los,
    deductionTypes,
    resignationTypes,
    // If a computation already exists for this employee, the frontend should
    // render everything read-only and block further saving (idno is the sole
    // primary key on benefits_exit_computations — one row per employee, ever).
    existingComputation: existing ? existing.computation : null,
    existingDetails: existing ? existing.details : null,
  };
}

// ---------------------------------------------------------------------------
// Shared computation builder used by both the preview PDF and the actual save.
// Deduction rows arrive from the client as separate {type, note} — kept separate
// (not pre-merged) so we can build both benefits_exit_details columns correctly:
//   - deductiontype = `${type} ${note}` (space-joined, no dash) when a note exists
//   - deduction_type = type alone
// displayLabel ("Type - Note") is for on-screen/PDF readability only.
// ---------------------------------------------------------------------------
async function buildComputation(office, idno, submittedState) {
  const details = await getLastPayDetails(office, idno, submittedState.year || null);

  if (!details.employee || !details.hasData) {
    const err = new Error('Employee or payroll data not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const { employee, monthlyRate, dailyRate, thirteenthMonth, lengthOfService } = details;

  const losIncluded = !!submittedState.losIncluded;
  // Always compute the tenure-based LOS bracket/formula for record-keeping,
  // regardless of whether LOS pay is actually included in the payout.
  const fullLosComputation = computeLastPayAmount(monthlyRate, lengthOfService.roundedYears);
  const appliedLosAmount = losIncluded ? fullLosComputation.amount : 0;

  const resignationTypeLabel =
    (details.resignationTypes || []).find(
      (rt) => String(rt.id) === String(submittedState.resignationTypeId),
    )?.resignation_type || 'N/A';

  const resignationRemarks = submittedState.resignationRemarks || '';
  let basicRateLabel = 'N/A';
  if (monthlyRate && monthlyRate > 0) {
    basicRateLabel = `${formatCurrency(monthlyRate)} (Monthly)`;
  } else if (dailyRate && dailyRate > 0) {
    basicRateLabel = `${formatCurrency(dailyRate)} (Daily)`;
  }

  const rawDeductions = Array.isArray(submittedState.deductions) ? submittedState.deductions : [];
  let totalOutstanding = 0;
  let totalDeduction = 0;
  let totalBalance = 0;

  const normalizedDeductions = rawDeductions.map((d) => {
    const outstanding = parseFloat(d.outstanding) || 0;
    const deduction = parseFloat(d.deduction) || 0;
    const balance = outstanding - deduction;
    const type = (d.type || 'N/A').trim();
    const note = (d.note || '').trim();
    totalOutstanding += outstanding;
    totalDeduction += deduction;
    totalBalance += balance;
    return {
      type,
      note,
      displayLabel: note ? `${type} - ${note}` : type,
      dbDeductionType: note ? `${type} ${note}` : type,
      outstanding,
      deduction,
      balance,
    };
  });

  //const thirteenthMonthAmount = thirteenthMonth || 0;
  const thirteenthMonthAmount = parseFloat(submittedState.thirteenthMonthAmount) || 0;
  const salaryAmount = parseFloat(submittedState.salaryAmount) || 0;
  const salaryDescription = (submittedState.salaryDescription || '').trim();
  const otherIncomeAmount = parseFloat(submittedState.otherIncomeAmount) || 0;
  const otherIncomeDescription = (submittedState.otherIncomeDescription || '').trim();

  const gross = appliedLosAmount + salaryAmount + otherIncomeAmount + thirteenthMonthAmount;

  // Ported EXACTLY from the legacy WinForms compute()/saveToDB() logic:
  // - the "deductions" figure that gets displayed/saved is the Deduction-column
  //   sum only (totalDeduction) — NOT the balance.
  // - but Net Pay is reduced by BOTH totalDeduction AND totalBalance.
  // This means "Gross - TOTAL DEDUCTION(S)" on the printout will not always equal
  // "NET PAY" if any row carries a balance — that's the legacy behavior, intentionally
  // preserved here rather than "fixed", per instruction to trace and replicate it.
  const netAmount = gross - (totalDeduction + totalBalance);

  return {
    employee,
    lengthOfService,
    resignationTypeLabel,
    resignationTypeId: submittedState.resignationTypeId || null,
    resignationRemarks: resignationRemarks, // NEW
    notes: submittedState.notes || '', // ADD THIS
    basicRateLabel,
    monthlyRate,
    effectivityDate: employee.dateresign,
    transactionDate: submittedState.transactionDate
      ? new Date(submittedState.transactionDate)
      : new Date(),
    office,
    losIncluded,
    losYears: lengthOfService.roundedYears,
    losMonths: lengthOfService.roundedMonths,
    losComputation: {
      amount: appliedLosAmount,
      days: fullLosComputation.days,
      formula: fullLosComputation.formula,
    },
    salaryAmount,
    salaryDescription,
    otherIncomeAmount,
    otherIncomeDescription,
    thirteenthMonthAmount,
    deductions: normalizedDeductions,
    totalOutstanding,
    totalDeduction,
    totalBalance,
    gross,
    netAmount,
    yearUsed: details.currentYear,
  };
}

// ---------------------------------------------------------------------------
// Preview PDF — recomputes from client-submitted state, nothing persisted.
// ---------------------------------------------------------------------------
async function generateLastPayPDF(office, idno, submittedState) {
  const computed = await buildComputation(office, idno, submittedState);
  computed.credentials = await getSignatureCredentials();
  return renderLastPayPDF(computed);
}

// ---------------------------------------------------------------------------
// Actual save: check-then-insert, wrapped in a transaction across both tables.
// Throws an error with code 'ALREADY_EXISTS' if a row already exists for idno.
// ---------------------------------------------------------------------------
async function saveLastPayComputation(office, idno, submittedState) {
  const existingBeforeBuild = await checkExistingComputation(idno);
  if (existingBeforeBuild) {
    const err = new Error('A Last Pay Computation for this employee has already been saved.');
    err.code = 'ALREADY_EXISTS';
    err.existing = existingBeforeBuild;
    throw err;
  }

  const computed = await buildComputation(office, idno, submittedState);

  console.log('submitted: ', submittedState);
  const { employee } = computed;
  const transDateStr = formatDateForSql(computed.transactionDate);

  const dbPool = utilitiesModel.getDbPool('default');
  const connection = await dbPool.getConnection();

  try {
    await connection.beginTransaction();

    // Re-check inside the transaction to close the race window between the
    // check above and this insert (two people saving the same employee at once).
    const [raceCheck] = await connection.query(
      'SELECT idno FROM benefits_exit_computations WHERE idno = ? LIMIT 1',
      [idno],
    );
    if (raceCheck.length > 0) {
      await connection.rollback();
      const err = new Error('A Last Pay Computation for this employee has already been saved.');
      err.code = 'ALREADY_EXISTS';
      throw err;
    }

    // In saveLastPayComputation function, add notes column to the INSERT
    await connection.query(
      `INSERT INTO benefits_exit_computations
  (transDate, idno, lastname, firstname, branch, hireDate, resignedDate,
   losYears, losMonths, days, monthlyRate, losAmount,
   otherincome, otherincomeamount, thriteenthMonth, gross, deductions, netPay,
   mloffice, status, transactiondate, transactionupdated, separationtype, computed,
   otherincome2, otherincomeamount2, region, department, separationtype_remarks, notes)  -- ADD notes
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, 1, ?, ?, ?, ?, ?, ?)`,
      [
        transDateStr,
        idno,
        employee.lastname || null,
        employee.firstname || null,
        employee.branch || null,
        employee.datehired || null,
        employee.dateresign || null,
        computed.losYears,
        computed.losMonths,
        computed.losComputation.days,
        computed.monthlyRate,
        computed.losComputation.amount,
        computed.salaryDescription || null,
        computed.salaryAmount,
        computed.thirteenthMonthAmount,
        computed.gross,
        computed.totalDeduction,
        computed.netAmount,
        office,
        'PROCESSED',
        computed.resignationTypeLabel,
        computed.otherIncomeDescription || null,
        computed.otherIncomeAmount,
        employee.region || null,
        employee.department || null,
        computed.resignationRemarks || null,
        submittedState.notes || null, // ADD notes parameter
      ],
    );

    for (const d of computed.deductions) {
      await connection.query(
        `INSERT INTO benefits_exit_details (idno, transdate, deductiontype, outstanding, deduction, balance, deduction_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [idno, transDateStr, d.dbDeductionType, d.outstanding, d.deduction, d.balance, d.type],
      );
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  computed.isSaved = true;
  computed.credentials = await getSignatureCredentials();
  const pdfBuffer = await renderLastPayPDF(computed);
  return pdfBuffer;
}

// ---------------------------------------------------------------------------
// Update an existing saved computation. The original transDate (effective date)
// is preserved — only transactionupdated moves to NOW(), treating this as a
// revision of the same transaction rather than a brand new one.
// ---------------------------------------------------------------------------
// async function updateLastPayComputation(office, idno, submittedState) {
//   const existing = await checkExistingComputation(idno);
//   if (!existing) {
//     const err = new Error('No existing computation found to update for this employee.');
//     err.code = 'NOT_FOUND';
//     throw err;
//   }

//   const computed = await buildComputation(office, idno, submittedState);
//   const { employee } = computed;
//   const transDateStr = formatDateForSql(existing.transDate);

//   const dbPool = utilitiesModel.getDbPool('default');
//   const connection = await dbPool.getConnection();

//   try {
//     await connection.beginTransaction();

//     // In updateLastPayComputation function - replace the UPDATE query with this:
//     await connection.query(
//       `UPDATE benefits_exit_computations SET
//      lastname = ?, firstname = ?, branch = ?, hireDate = ?, resignedDate = ?,
//      losYears = ?, losMonths = ?, days = ?, monthlyRate = ?, losAmount = ?,
//      otherincome = ?, otherincomeamount = ?, thriteenthMonth = ?, gross = ?,
//      deductions = ?, netPay = ?, mloffice = ?, separationtype = ?,
//      transactionupdated = NOW(), otherincome2 = ?, otherincomeamount2 = ?,
//      region = ?, department = ?, separationtype_remarks = ?
//    WHERE idno = ?`,
//       [
//         employee.lastname || null,
//         employee.firstname || null,
//         employee.branch || null,
//         employee.datehired || null,
//         employee.dateresign || null,
//         computed.losYears,
//         computed.losMonths,
//         computed.losComputation.days,
//         computed.monthlyRate,
//         computed.losComputation.amount,
//         computed.salaryDescription || null,
//         computed.salaryAmount,
//         computed.thirteenthMonthAmount,
//         computed.gross,
//         computed.totalDeduction,
//         computed.netAmount,
//         office,
//         computed.resignationTypeLabel,
//         computed.otherIncomeDescription || null,
//         computed.otherIncomeAmount,
//         employee.region || null,
//         employee.department || null,
//         computed.resignationRemarks || null,
//         idno,
//       ],
//     );

async function updateLastPayComputation(office, idno, submittedState) {
  const existing = await checkExistingComputation(idno);
  if (!existing) {
    const err = new Error('No existing computation found to update for this employee.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const computed = await buildComputation(office, idno, submittedState);
  const { employee } = computed;
  const transDateStr = formatDateForSql(existing.transDate);

  const dbPool = utilitiesModel.getDbPool('default');
  const connection = await dbPool.getConnection();

  try {
    await connection.beginTransaction();

    // FIX: Use existing data as fallback if employee object doesn't have names
    const lastName = employee?.lastname || existing.lastname;
    const firstName = employee?.firstname || existing.firstname;
    const branch = employee?.branch || existing.branch;
    const hireDate = employee?.datehired || existing.hireDate;
    const resignedDate = employee?.dateresign || existing.resignedDate;
    const region = employee?.region || existing.region;
    const department = employee?.department || existing.department;

    await connection.query(
      `UPDATE benefits_exit_computations SET
     lastname = ?, firstname = ?, branch = ?, hireDate = ?, resignedDate = ?,
     losYears = ?, losMonths = ?, days = ?, monthlyRate = ?, losAmount = ?,
     otherincome = ?, otherincomeamount = ?, thriteenthMonth = ?, gross = ?,
     deductions = ?, netPay = ?, mloffice = ?, separationtype = ?,
     transactionupdated = NOW(), otherincome2 = ?, otherincomeamount2 = ?,
     region = ?, department = ?, separationtype_remarks = ?, notes = ?
   WHERE idno = ?`,
      [
        lastName,
        firstName,
        branch,
        hireDate,
        resignedDate,
        computed.losYears,
        computed.losMonths,
        computed.losComputation.days,
        computed.monthlyRate,
        computed.losComputation.amount,
        computed.salaryDescription || null,
        computed.salaryAmount,
        computed.thirteenthMonthAmount,
        computed.gross,
        computed.totalDeduction,
        computed.netAmount,
        office,
        computed.resignationTypeLabel,
        computed.otherIncomeDescription || null,
        computed.otherIncomeAmount,
        region,
        department,
        computed.resignationRemarks || null,
        submittedState.notes || null, // ADD notes parameter
        idno,
      ],
    );

    // ... rest of the code remains the same

    // Deductions are fully replaced rather than diffed — simpler and safe since
    // the whole set is re-submitted from the form each time.
    await connection.query('DELETE FROM benefits_exit_details WHERE idno = ?', [idno]);

    for (const d of computed.deductions) {
      await connection.query(
        `INSERT INTO benefits_exit_details (idno, transdate, deductiontype, outstanding, deduction, balance, deduction_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [idno, transDateStr, d.dbDeductionType, d.outstanding, d.deduction, d.balance, d.type],
      );
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  computed.isSaved = true;
  computed.transactionDate = existing.transDate; // printout reflects the original effective date
  computed.credentials = await getSignatureCredentials();
  const pdfBuffer = await renderLastPayPDF(computed);
  return pdfBuffer;
}

// ---------------------------------------------------------------------------
// Regenerate the PDF for an ALREADY-SAVED record, straight from the DB —
// not recomputed from live payroll data, which could have changed since the
// original save. This is what "Download Saved PDF" should call.
// ---------------------------------------------------------------------------
async function generateSavedPDF(idno) {
  const existing = await getExistingComputationDetails(idno);
  if (!existing) {
    const err = new Error('No saved computation found for this employee.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const { computation, details } = existing;

  const employee = await resignedEmployeeModel.getResignedEmployeeFromHR(
    computation.mloffice,
    idno,
  );
  const lengthOfService = calculateLengthOfService(computation.hireDate, computation.resignedDate);

  let basicRateLabel = 'N/A';
  if (computation.monthlyRate && computation.monthlyRate > 0) {
    basicRateLabel = `${formatCurrency(computation.monthlyRate)} (Monthly)`;
  }

  const deductions = details.map((d) => ({
    type: d.deduction_type,
    note: '',
    displayLabel: d.deductiontype, // already the combined "Type note" text as saved
    dbDeductionType: d.deductiontype,
    outstanding: parseFloat(d.outstanding) || 0,
    deduction: parseFloat(d.deduction) || 0,
    balance: parseFloat(d.balance) || 0,
  }));

  const totalOutstanding = deductions.reduce((s, d) => s + d.outstanding, 0);
  const totalBalance = deductions.reduce((s, d) => s + d.balance, 0);

  const computed = {
    employee: employee || {
      fullname: `${computation.lastname}, ${computation.firstname}`,
      idno,
      datehired: computation.hireDate,
      dateresign: computation.resignedDate,
      designation: 'N/A',
    },
    lengthOfService,
    resignationTypeLabel: computation.separationtype || 'N/A',
    notes: computation.notes || '', // ADD THIS
    basicRateLabel,
    monthlyRate: computation.monthlyRate,
    effectivityDate: computation.resignedDate,
    transactionDate: computation.transDate,
    office: computation.mloffice,
    losIncluded: parseFloat(computation.losAmount) > 0,
    losYears: computation.losYears,
    losMonths: computation.losMonths,
    losComputation: {
      amount: parseFloat(computation.losAmount) || 0,
      days: computation.days,
      formula:
        computation.monthlyRate && computation.days
          ? `${formatCurrency(computation.monthlyRate)} / 30 days  x  ${computation.days} days  x  ${computation.losYears} year(s)`
          : '',
    },
    salaryAmount: parseFloat(computation.otherincomeamount) || 0,
    salaryDescription: computation.otherincome || '',
    otherIncomeAmount: parseFloat(computation.otherincomeamount2) || 0,
    otherIncomeDescription: computation.otherincome2 || '',
    thirteenthMonthAmount: parseFloat(computation.thriteenthMonth) || 0,
    deductions,
    totalOutstanding,
    totalDeduction: parseFloat(computation.deductions) || 0,
    totalBalance,
    gross: parseFloat(computation.gross) || 0,
    netAmount: parseFloat(computation.netPay) || 0,
    yearUsed: null,
    isSaved: true,
  };

  computed.credentials = await getSignatureCredentials();
  return renderLastPayPDF(computed);
}

function renderLastPayPDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const PAGE_WIDTH = 8.5 * 72;
      const PAGE_HEIGHT = 11 * 72;
      const MARGIN = 30;

      const doc = new PDFDocument({
        size: [PAGE_WIDTH, PAGE_HEIGHT],
        margin: MARGIN,
        bufferPages: true,
        info: { Title: 'Last Pay Computation', Author: 'HRMS System' },
      });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { employee, office } = data;
      const PAGE_LEFT = MARGIN;
      const PAGE_RIGHT = PAGE_WIDTH - MARGIN;
      const CONTENT_WIDTH = PAGE_RIGHT - PAGE_LEFT;
      const BLUE = '#000000';
      const MUTED = '#6B7686';

      // Determine if we have any remaining balance from deductions.
      // Computed up front because it now controls WHERE the columns sit.
      const hasRemainingBalance = (data.totalBalance || 0) > 0;
      const deductions = data.deductions || [];

      // -- Column positions for the deduction table ------------------------
      const TABLE_INDENT = 35;
      const typeX = PAGE_LEFT + TABLE_INDENT;
      const col3Width = 95; // Remaining Balance
      const col2Width = 115; // Deducted from Claims
      const col1Width = 80; // Outstanding
      const colGap = 10;

      let col1X, col2X, col3X;

      if (hasRemainingBalance) {
        // There IS a remaining balance to report: anchor the 3 columns to
        // the right edge of the page, same as before.
        col3X = PAGE_RIGHT - col3Width;
        col2X = col3X - colGap - col2Width;
        col1X = col2X - colGap - col1Width;
      } else {
        // No remaining balance: pull the whole 3-column block to the LEFT,
        // as close to the "Type" label as the actual label text allows.
        // Measure the widest label that will actually appear in the Type
        // column (deduction names + "TOTAL"), then start col1X right after
        // it with a small padding gap. This is what actually moves the
        // columns left, instead of guessing a fixed reserved width.
        doc.font('Helvetica-Bold').fontSize(8.5);
        const LABEL_PADDING = 20;
        const MIN_LABEL_WIDTH = 60; // floor, in case there are no deductions
        let maxLabelWidth = Math.max(MIN_LABEL_WIDTH, doc.widthOfString('TOTAL'));
        deductions.forEach((d) => {
          const w = doc.widthOfString(d.displayLabel || '');
          if (w > maxLabelWidth) maxLabelWidth = w;
        });

        col1X = typeX + maxLabelWidth + LABEL_PADDING;
        col2X = col1X + col1Width + colGap;
        col3X = col2X + col2Width + colGap;
      }

      // -- Letterhead -----------------------------------------------------
      const logoPath = path.join(__dirname, '../public/images/logo.png');
      let y = MARGIN;
      try {
        if (fs.existsSync(logoPath)) {
          const logoWidth = 180;
          doc.image(logoPath, (PAGE_WIDTH - logoWidth) / 2, MARGIN, { width: logoWidth });
          y = MARGIN + 30;
        }
      } catch (e) {
        // continue without logo
      }

      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('            HUMAN RESOURCES MANAGEMENT DIVISION', 0, y, { align: 'center' });
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .text('        Summary of Claims & Accountabilities', 0, y + 11, { align: 'center' });
      doc.y = y + 38;

      // -- Header info: 2-column grid, 3 rows ------------------------------
      const rowH = 14;
      const leftX = PAGE_LEFT;
      const rightX = PAGE_LEFT + CONTENT_WIDTH / 2 + 6;
      const labelWidth = 95;
      const cell = (label, value, x, cy) => {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000').text(label, x, cy);
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor('#000')
          .text(value, x + labelWidth, cy, {
            width: CONTENT_WIDTH / 2 - labelWidth - 6,
          });
      };

      let gy = doc.y;
      cell('Date:', formatDate(data.transactionDate), leftX, gy);

      // Always show Length of Service in the header
      const losLabel =
        data.lengthOfService && data.lengthOfService.actualLabel
          ? data.lengthOfService.actualLabel
          : 'N/A';
      cell('Length of Service:', losLabel, rightX, gy);
      gy += rowH;
      cell('Employee Name:', employee.fullname || 'N/A', leftX, gy);
      cell('Basic Rate:', data.basicRateLabel, rightX, gy);
      gy += rowH;
      cell('Date Hired:', formatDate(employee.datehired), leftX, gy);
      cell('Effectivity Date:', formatDate(data.effectivityDate), rightX, gy);

      doc.y = gy + rowH + 4;

      // Double rule to separate header from the claims body
      doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).lineWidth(1).stroke();
      doc
        .moveTo(PAGE_LEFT, doc.y + 2)
        .lineTo(PAGE_RIGHT, doc.y + 2)
        .lineWidth(1)
        .stroke();
      doc.y += 14;

      // -- Line helpers -----------------------------------------------------
      // Salary / Other Income / 13th Month / Gross Pay / Net Pay always sit
      // at this fixed far-right position — they do NOT move, regardless of
      // hasRemainingBalance. Only the deduction breakdown table's own
      // columns (col1X/col2X/col3X, set up above) shift left when there's
      // no remaining balance.
      const CLAIMS_AMOUNT_X = PAGE_RIGHT - 110;
      const CLAIMS_AMOUNT_WIDTH = 110;

      const amountLine = (label, value, opts = {}) => {
        const { indent = 0, bold = false, fontSize = 9, lineHeight } = opts;
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(fontSize)
          .fillColor('#000')
          .text(label, PAGE_LEFT + indent, doc.y, {
            width: CLAIMS_AMOUNT_X - PAGE_LEFT - indent - 10,
            continued: false,
          });
        doc
          .font('Helvetica-Bold')
          .fontSize(fontSize)
          .fillColor(bold ? BLUE : '#000')
          .text(`Php ${formatCurrency(value)}`, CLAIMS_AMOUNT_X, doc.y - (fontSize + 2), {
            width: CLAIMS_AMOUNT_WIDTH,
            align: 'right',
          });
        doc.y += lineHeight != null ? lineHeight : fontSize + 5;
      };

      // Helper function to align amount under "Deducted from Claims" column.
      // Used ONLY when hasRemainingBalance is true — this is the original,
      // untouched behavior for that case.
      const amountLineAligned = (label, value, opts = {}) => {
        const { indent = 0, bold = false, fontSize = 9, lineHeight } = opts;
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(fontSize)
          .fillColor('#000')
          .text(label, PAGE_LEFT + indent, doc.y, {
            width: col2X - PAGE_LEFT - indent - 10,
            continued: false,
          });
        doc
          .font('Helvetica-Bold')
          .fontSize(fontSize)
          .fillColor(bold ? BLUE : '#000')
          .text(`Php ${formatCurrency(value)}`, col2X, doc.y - (fontSize + 2), {
            width: col2Width,
            align: 'right',
          });
        doc.y += lineHeight != null ? lineHeight : fontSize + 5;
      };

      // Helper for amount with underline (used for 13th Month & Gross Pay)
      const amountLineWithUnderline = (label, value, opts = {}) => {
        const { indent = 0, bold = false, fontSize = 9, alignUnderDeducted = false } = opts;
        const targetX = alignUnderDeducted ? col2X : CLAIMS_AMOUNT_X;
        const targetWidth = alignUnderDeducted ? col2Width : CLAIMS_AMOUNT_WIDTH;

        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(fontSize)
          .fillColor('#000')
          .text(label, PAGE_LEFT + indent, doc.y, {
            width: targetX - PAGE_LEFT - indent - 10,
            continued: false,
          });
        doc
          .font('Helvetica-Bold')
          .fontSize(fontSize)
          .fillColor(bold ? BLUE : '#000')
          .text(`Php ${formatCurrency(value)}`, targetX, doc.y - (fontSize + 2), {
            width: targetWidth,
            align: 'right',
          });
        doc.y += fontSize + 5;
        // Draw underline
        doc
          .moveTo(targetX + 28, doc.y - 10)
          .lineTo(targetX + targetWidth, doc.y - 10)
          .lineWidth(1.25)
          .stroke();
        doc.y += 5;
      };

      const plainLine = (text, indent = 0, opts = {}) => {
        const { bold = false, fontSize = 9, color = '#000' } = opts;
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(fontSize)
          .fillColor(color)
          .text(text, PAGE_LEFT + indent, doc.y, { width: CONTENT_WIDTH - indent });
        doc.y += fontSize + 5;
      };

      const blankLine = (h = 6) => {
        doc.y += h;
      };

      const doubleLine = () => {
        doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).lineWidth(0.75).stroke();
        doc
          .moveTo(PAGE_LEFT, doc.y + 2)
          .lineTo(PAGE_RIGHT, doc.y + 2)
          .lineWidth(0.75)
          .stroke();
        doc.y += 8;
      };

      const singleLine = () => {
        doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).lineWidth(0.75).stroke();
        doc.y += 8;
      };

      // Helper for table row in deduction section.
      // When there's no remaining balance: Outstanding and Remaining Balance
      // aren't shown at all. Individual deduction rows show their amount at
      // the left-shifted col2X position. The TOTAL row is the exception —
      // pass alignTotalRight: true to put its amount at the fixed far-right
      // column (CLAIMS_AMOUNT_X), in line with Salary/Other Income/13th
      // Month/Gross Pay/Net Pay.
      const tableRow = (label, outstanding, deduction, balance, opts = {}) => {
        const { bold = false, fontSize = 8.5, alignTotalRight = false } = opts;
        const rowY = doc.y;
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(fontSize)
          .fillColor('#000');
        if (hasRemainingBalance) {
          doc.text(label, typeX, rowY, { width: col1X - colGap - typeX });
          doc.text(formatCurrency(outstanding), col1X, rowY, { width: col1Width, align: 'right' });
          doc.text(formatCurrency(deduction), col2X, rowY, { width: col2Width, align: 'right' });
          doc.text(formatCurrency(balance), col3X, rowY, { width: col3Width, align: 'right' });
        } else if (alignTotalRight) {
          doc.text(label, typeX, rowY, { width: CLAIMS_AMOUNT_X - colGap - typeX });
          doc.text(formatCurrency(deduction), CLAIMS_AMOUNT_X, rowY, {
            width: CLAIMS_AMOUNT_WIDTH,
            align: 'right',
          });
        } else {
          doc.text(label, typeX, rowY, { width: col1X - colGap - typeX });
          doc.text(formatCurrency(deduction), col2X, rowY, { width: col2Width, align: 'right' });
        }
        doc.y = rowY + fontSize + 4;
      };

      // -- CLAIMS -----------------------------------------------------------
      plainLine('CLAIMS:', 0, { bold: true, fontSize: 10 });
      blankLine(2);

      // A. Resignation type + LOS pay
      let resignationDisplay = `A. ${data.resignationTypeLabel}`;
      if (data.resignationRemarks && data.resignationRemarks.trim()) {
        resignationDisplay += ` - ${data.resignationRemarks.trim()}`;
      }
      plainLine(resignationDisplay, 15, { bold: true });

      // Check if LOS Pay has a value
      const hasLosPay = data.losIncluded && data.losComputation && data.losComputation.amount > 0;

      // Only show Length of Service label in body if LOS Pay amount > 0
      if (hasLosPay && data.lengthOfService && data.lengthOfService.actualLabel) {
        plainLine(`Length of Service: ${data.lengthOfService.actualLabel}`, 35);
      }

      // Only show LOS Pay if included and amount > 0
      if (hasLosPay) {
        if (data.losComputation.formula) {
          if (hasRemainingBalance) {
            amountLineAligned(data.losComputation.formula, data.losComputation.amount, {
              indent: 35,
            });
          } else {
            amountLine(data.losComputation.formula, data.losComputation.amount, { indent: 35 });
          }
        } else {
          if (hasRemainingBalance) {
            amountLineAligned('LOS Pay', data.losComputation.amount, { indent: 35 });
          } else {
            amountLine('LOS Pay', data.losComputation.amount, { indent: 35 });
          }
        }
        blankLine();
      }

      // Only show Salary if amount > 0
      if (data.salaryAmount > 0) {
        const label = data.salaryDescription
          ? `Salary for the period ${data.salaryDescription}`
          : 'Salary';
        if (hasRemainingBalance) {
          amountLineAligned(label, data.salaryAmount, { indent: 35 });
        } else {
          amountLine(label, data.salaryAmount, { indent: 35 });
        }
        blankLine();
      }

      // Only show Other Income if amount > 0
      if (data.otherIncomeAmount > 0) {
        const label = data.otherIncomeDescription
          ? `Others - ${data.otherIncomeDescription}`
          : 'Others';
        if (hasRemainingBalance) {
          amountLineAligned(label, data.otherIncomeAmount, { indent: 35 });
        } else {
          amountLine(label, data.otherIncomeAmount, { indent: 35 });
        }
        blankLine();
      }

      // B. 13th Month Pay
      plainLine('B. 13th Month Pay', 15, { bold: true });
      // Reuse amountLine but keep the label on the same visual line as "B."
      doc.y -= 9 + 5; // pull back up to align amount with the "B." line above

      // If there's remaining balance, align under "Deducted from Claims" (col2X).
      // Otherwise, use the fixed far-right position.
      if (hasRemainingBalance) {
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor(BLUE)
          .text(`Php ${formatCurrency(data.thirteenthMonthAmount)}`, col2X, doc.y, {
            width: col2Width,
            align: 'right',
          });
      } else {
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor(BLUE)
          .text(`Php ${formatCurrency(data.thirteenthMonthAmount)}`, CLAIMS_AMOUNT_X, doc.y, {
            width: CLAIMS_AMOUNT_WIDTH,
            align: 'right',
          });
      }

      doc.y += 9 + 5;

      // Draw underline under the 13th month amount, matching whichever
      // position was used above.
      if (hasRemainingBalance) {
        doc
          .moveTo(col2X + 28, doc.y - 10)
          .lineTo(col2X + col2Width, doc.y - 10)
          .lineWidth(0.75)
          .stroke();
      } else {
        doc
          .moveTo(CLAIMS_AMOUNT_X + 28, doc.y - 10)
          .lineTo(CLAIMS_AMOUNT_X + CLAIMS_AMOUNT_WIDTH, doc.y - 10)
          .lineWidth(0.75)
          .stroke();
      }
      blankLine();

      // Gross Pay - aligns under col2X when there's a remaining balance
      // (original behavior), otherwise the fixed far-right position.
      amountLineWithUnderline('GROSS PAY', data.gross, {
        bold: true,
        fontSize: 10,
        alignUnderDeducted: hasRemainingBalance,
      });
      blankLine(10);

      // C. Less: Accountabilities
      plainLine('C. Less: Accountabilities', 15, { bold: true });

      // deductions was already pulled from data up top (used for column measurement)
      if (deductions.length === 0) {
        plainLine('No deductions.', 35, { color: MUTED });
      } else {
        // Header row — only shown at all when there's a remaining balance
        // to report. When there isn't, no column headers print at all;
        // just the bare amounts appear in the rows below.
        if (hasRemainingBalance) {
          const headerY = doc.y;
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED);
          doc.text('Outstanding', col1X, headerY, { width: col1Width, align: 'right' });
          doc.text('Deducted from Claims', col2X, headerY, { width: col2Width, align: 'right' });
          doc.text('Remaining Balance', col3X, headerY, { width: col3Width, align: 'right' });
          doc.y = headerY + 12;
          doc.fillColor('#000');
        }

        // Display each deduction
        deductions.forEach((d) => {
          tableRow(d.displayLabel, d.outstanding, d.deduction, d.balance);
        });

        blankLine(3);
        singleLine();
        doc.y += 5;

        // Totals row
        tableRow('TOTAL', data.totalOutstanding, data.totalDeduction, data.totalBalance, {
          bold: true,
          fontSize: 9,
          alignTotalRight: true,
        });

        doc.y += 3;
        singleLine();
        doc.y += 8;
      }

      // Show NET PAY or REMAINING BALANCE — always at the fixed far-right
      // position (CLAIMS_AMOUNT_X), same as Salary/Other Income/13th Month.
      // This label never moves, regardless of hasRemainingBalance.
      amountLine(hasRemainingBalance ? 'REMAINING BALANCE' : 'NET PAY', data.netAmount, {
        bold: true,
        fontSize: 10,
        indent: 90,
      });
      doubleLine();

      // -- Signatures ---------------------------------------------------
      if (doc.y > PAGE_HEIGHT - MARGIN - 40) {
        doc.addPage();
        doc.y = MARGIN + 20;
      }

      doc.y += 20;

      const showApprover = office.toLowerCase() === 'vismin';
      const sigCount = showApprover ? 3 : 2;
      const sigColWidth = CONTENT_WIDTH / sigCount;
      const sigY = doc.y;

      const sigColumn = (label, name, title, x) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor('#000')
          .text(label, x, sigY, { width: sigColWidth - 10 });
        doc
          .moveTo(x, sigY + 30)
          .lineTo(x + sigColWidth - 20, sigY + 30)
          .lineWidth(0.75)
          .stroke();
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .text(name || '', x, sigY + 33, {
            width: sigColWidth - 20,
            align: 'center',
          });
        doc
          .font('Helvetica-Oblique')
          .fontSize(7)
          .fillColor(MUTED)
          .text(title || 'Signature over printed name', x, sigY + 44, {
            width: sigColWidth - 20,
            align: 'center',
          });
        doc.fillColor('#000');
      };

      const creds = data.credentials || {};
      sigColumn('Prepared By:', creds.preparedBy, creds.preparedTitle, PAGE_LEFT);
      sigColumn('Noted By:', creds.notedBy, creds.notedTitle, PAGE_LEFT + sigColWidth);

      if (showApprover) {
        sigColumn(
          'Approved By:',
          creds.approvedBy,
          creds.approvedTitle,
          PAGE_LEFT + sigColWidth * 2,
        );
      }

      // Add notes section near the signatures
      const hasNotes = data.notes && data.notes.trim().length > 0;
      if (hasNotes) {
        if (doc.y > PAGE_HEIGHT - MARGIN - 80) {
          doc.addPage();
          doc.y = MARGIN + 20;
        }

        doc.y += 10;
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#000')
          .text('Notes / Remarks:', PAGE_LEFT, doc.y);
        doc.y += 12;
        doc.font('Helvetica').fontSize(8.5).fillColor('#333').text(data.notes, PAGE_LEFT, doc.y, {
          width: CONTENT_WIDTH,
          align: 'left',
        });
        doc.y += 20;
      }

      doc.y = sigY + 60;

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
module.exports = {
  getDeductionTypes,
  getResignationTypes,
  getSignatureCredentials,
  getLastPayDetails,
  generateLastPayPDF,
  saveLastPayComputation,
  updateLastPayComputation,
  generateSavedPDF,
  checkExistingComputation,
  calculateLengthOfService,
  computeLastPayAmount,
  formatCurrency,
};
