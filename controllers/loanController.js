// controllers/loanController.js
const loanModel = require('../models/loanModel');
const utilitiesModel = require('../models/utilitiesModel');
const PDFService = require('../services/PDFService');
const { LoanCalculatorService, BracketService } = require('../services');

// ─────────────────────────────────────────────────────────────
// GET NEW LOAN PAGE
// GET /loans/new-loan
// ─────────────────────────────────────────────────────────────
async function getNewLoanPage(req, res) {
  try {
    const offices = await utilitiesModel.getOffice();
    const loan_types = await utilitiesModel.getLoanTypes();

    res.render('loans/newLoan', {
      title: 'New Loan',
      offices,
      loan_types,
      username: req.session.user?.username || 'Unknown',
      firstName: req.session.user?.firstName || '',
      lastName: req.session.user?.lastName || '',
      designation: req.session.user?.designation || '',
    });
  } catch (err) {
    console.error('Error loading new loan page:', err);
    res.status(500).render('error', { error: 'Error loading loan page' });
  }
}

// ─────────────────────────────────────────────────────────────
// SEARCH EMPLOYEE WITH PAGINATION (UPDATED)
// GET /loan/search-employee?office=&lastname=&firstname=&page=&limit=
// ─────────────────────────────────────────────────────────────
async function searchEmployee(req, res) {
  try {
    const {
      query,
      office,
      field = 'lastname',
      page = 1,
      limit = 20,
      payrollDate = null,
      lastname = null, // NEW: Get separate last name parameter
      firstname = null, // NEW: Get separate first name parameter
    } = req.query;

    // Validate required parameters
    if (!office) {
      return res.status(400).json({
        success: false,
        message: 'Office is required',
      });
    }

    // If no search criteria, return empty results
    if (!query && !lastname && !firstname) {
      return res.json({
        success: true,
        data: [],
        payrollDates: [],
        pagination: {
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 0,
        },
      });
    }

    // ─── Build search parameters ───
    const searchParams = {
      office,
      field,
      page: parseInt(page),
      limit: parseInt(limit),
      payrollDate: payrollDate || null,
    };

    // If separate lastname and firstname are provided, use them (AND condition)
    if (lastname || firstname) {
      searchParams.lastname = lastname || null;
      searchParams.firstname = firstname || null;
      // Clear query when using separate fields (no idno search)
      searchParams.query = null;
    } else if (query && query.trim()) {
      // Fallback to query search for compatibility (OR condition with idno)
      searchParams.query = query.trim();
    } else {
      // No valid search criteria
      return res.json({
        success: true,
        data: [],
        payrollDates: [],
        pagination: {
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 0,
        },
      });
    }

    const result = await loanModel.searchEmployee(searchParams);

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('Employee search error:', err);
    res.status(500).json({
      success: false,
      message: 'Error searching employee: ' + err.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// GET BRACKET TABLE
// GET /loan/bracket?type=ml_fund|sako_maxi|sako_petty|sss
// ─────────────────────────────────────────────────────────────
async function getBracket(req, res) {
  //console.log('controller get bracket');
  try {
    const { type, office } = req.query;

    const validTypes = ['ml_fund', 'sako_maxi', 'sako_petty', 'sss'];

    if (!type || !validTypes.includes(type)) {
      return res.json({ success: false, message: 'Invalid or missing bracket type.' });
    }

    const resolvedOffice = office || req.session?.user?.office || null;

    const { columns, rows } = await loanModel.getBracket({
      type,
      office: resolvedOffice,
    });

    res.json({ success: true, columns, rows });
  } catch (err) {
    console.error('Bracket fetch error:', err);
    res.status(500).json({ success: false, message: 'Error fetching bracket table.' });
  }
}

// ─────────────────────────────────────────────────────────────
// GET EMPLOYEE PAYROLL DATA
// GET /loan/employee-payroll?employeeId=17090721&office=Luzon
// ─────────────────────────────────────────────────────────────
async function getEmployeePayroll(req, res) {
  try {
    const { employeeId, office } = req.query;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID is required',
      });
    }

    if (!office) {
      return res.status(400).json({
        success: false,
        message: 'Office is required',
      });
    }

    // Get the 2 most recent payroll cycles
    const payrollDates = loanModel.getLastTwoPayrollCycles();
    const payrollDateValues = payrollDates.map((pd) => pd.date);

    // Fetch payroll data for the employee
    const payrollData = await loanModel.getEmployeePayrollData({
      employeeId: employeeId.trim(),
      office,
      payrollDates: payrollDateValues,
    });

    if (!payrollData || payrollData.length === 0) {
      return res.json({
        success: false,
        message: 'No payroll data found for this employee',
      });
    }

    res.json({
      success: true,
      data: payrollData,
      payrollDates: payrollDates.map((pd) => ({
        date: pd.date,
        cycle: pd.cycle,
      })),
    });
  } catch (err) {
    console.error('Error fetching employee payroll:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching employee payroll data: ' + err.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// CHECK EXISTING LOAN FOR EMPLOYEE
// GET /loan/check-existing-loan?employeeId=17090721&loanType=ML%20Fund%2013th%20Month
// ─────────────────────────────────────────────────────────────
// async function checkExistingLoan(req, res) {
//   //console.log('controller, check existing loan');
//   try {
//     const { employeeId, loanType, office } = req.query;

//     if (!employeeId) {
//       return res.status(400).json({
//         success: false,
//         message: 'Employee ID is required',
//       });
//     }

//     if (!loanType) {
//       return res.status(400).json({
//         success: false,
//         message: 'Loan type is required',
//       });
//     }

//     const currentYear = new Date().getFullYear();

//     const existingLoan = await loanModel.checkExistingLoan({
//       employeeId: employeeId.trim(),
//       loanType: loanType.trim().toLowerCase(),
//       year: currentYear,
//       office: office, // ← PASS office to the model
//     });

//     if (existingLoan) {
//       return res.json({
//         success: true,
//         hasExisting: true,
//         loan: {
//           controlNo: existingLoan.controlno,
//           employeeId: existingLoan.idno,
//           lastName: existingLoan.lastname,
//           firstName: existingLoan.firstname,
//           fullName: `${existingLoan.firstname} ${existingLoan.lastname}`,
//           loanType: existingLoan.loantype,
//           loanAmount: existingLoan.loanamount,
//           loanDeduction: existingLoan.loandeduction,
//           dateReceived: existingLoan.datereceived,
//           dateApproved: existingLoan.dateforwarded,
//           status: existingLoan.STATUS,
//           preparedBy: existingLoan.preparedby,
//           firstPayrollDate: existingLoan.firstpayrolldate,
//           secondPayrollDate: existingLoan.secondpayrolldate,
//           coMakers: [
//             existingLoan.comaker1,
//             existingLoan.comaker2,
//             existingLoan.comaker3,
//             existingLoan.comaker4,
//           ].filter((c) => c && c.trim() !== ''),
//         },
//       });
//     }

//     res.json({
//       success: true,
//       hasExisting: false,
//       message: 'No existing loan found for this employee and loan type',
//     });
//   } catch (err) {
//     console.error('Error checking existing loan:', err);
//     res.status(500).json({
//       success: false,
//       message: 'Error checking existing loan: ' + err.message,
//     });
//   }
// }

// controllers/loanController.js - Update this function

// ─────────────────────────────────────────────────────────────
// CHECK EXISTING LOAN FOR EMPLOYEE
// GET /loan/check-existing-loan?employeeId=17090721&loanType=ML%20Fund%2013th%20Month&office=Luzon
// ─────────────────────────────────────────────────────────────
async function checkExistingLoan(req, res) {
  try {
    const { employeeId, loanType, office } = req.query; // ← ADD office here

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID is required',
      });
    }

    if (!loanType) {
      return res.status(400).json({
        success: false,
        message: 'Loan type is required',
      });
    }

    if (!office) {
      // ← ADD office validation
      return res.status(400).json({
        success: false,
        message: 'Office is required',
      });
    }

    const currentYear = new Date().getFullYear();

    const existingLoan = await loanModel.checkExistingLoan({
      employeeId: employeeId.trim(),
      loanType: loanType.trim().toLowerCase(),
      year: currentYear,
      office: office, // ← PASS office to the model
    });

    if (existingLoan) {
      return res.json({
        success: true,
        hasExisting: true,
        loan: {
          controlNo: existingLoan.controlno,
          employeeId: existingLoan.idno,
          lastName: existingLoan.lastname,
          firstName: existingLoan.firstname,
          fullName: `${existingLoan.firstname} ${existingLoan.lastname}`,
          loanType: existingLoan.loantype,
          loanAmount: existingLoan.loanamount,
          loanDeduction: existingLoan.loandeduction,
          dateReceived: existingLoan.datereceived,
          dateApproved: existingLoan.dateforwarded,
          status: existingLoan.STATUS,
          preparedBy: existingLoan.preparedby,
          firstPayrollDate: existingLoan.firstpayrolldate,
          secondPayrollDate: existingLoan.secondpayrolldate,
          coMakers: [
            existingLoan.comaker1,
            existingLoan.comaker2,
            existingLoan.comaker3,
            existingLoan.comaker4,
          ].filter((c) => c && c.trim() !== ''),
        },
      });
    }

    res.json({
      success: true,
      hasExisting: false,
      message: 'No existing loan found for this employee and loan type',
    });
  } catch (err) {
    console.error('Error checking existing loan:', err);
    res.status(500).json({
      success: false,
      message: 'Error checking existing loan: ' + err.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// SAVE LOAN AND GENERATE PDF
// POST /loan/save
// ─────────────────────────────────────────────────────────────
async function saveLoan(req, res) {
  try {
    const {
      idno,
      account_no, // ← ADD THIS
      region,
      lastname,
      firstname,
      branch,
      loantype,
      loanamount,
      loandeduction,
      netpay1,
      netpay2,
      existingloan,
      percent35,
      deductionpermonth,
      netproceeds,
      datereceived,
      office,
      firstpayrolldate,
      secondpayrolldate,
      comaker1,
      comaker2,
      comaker3,
      comaker4,
      preparedby,
      designation, // ← ADD THIS
      walletno,
      lengthofservice,
      monthlyrate,
      generatePDF = true,
    } = req.body;
    console.log('@@@@@@@@@@@@ ', firstpayrolldate);
    // Validate required fields
    if (!idno || !lastname || !firstname || !loantype) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: idno, lastname, firstname, loantype',
      });
    }

    // Trim all incoming string fields immediately after destructuring
    const trimmedRegion = typeof region === 'string' ? region.trim() : region;
    const trimmedLastname = typeof lastname === 'string' ? lastname.trim() : lastname;
    const trimmedFirstname = typeof firstname === 'string' ? firstname.trim() : firstname;
    const trimmedBranch = typeof branch === 'string' ? branch.trim() : branch;
    const trimmedLoantype = typeof loantype === 'string' ? loantype.trim() : loantype;
    const trimmedAccountNo = typeof account_no === 'string' ? account_no.trim() : account_no;

    // Prepare loan data
    const loanData = {
      idno,
      account_no: trimmedAccountNo || null,
      region: trimmedRegion || '',
      lastname: trimmedLastname,
      firstname: trimmedFirstname,
      branch: trimmedBranch || '',
      loantype: trimmedLoantype,
      loanamount: parseFloat(loanamount) || 0,
      loandeduction: parseFloat(loandeduction) || 0,
      netpay1: parseFloat(netpay1) || 0,
      netpay2: parseFloat(netpay2) || 0,
      existingloan: parseFloat(existingloan) || 0,
      percent35: parseFloat(percent35) || 0,
      deductionpermonth: parseFloat(deductionpermonth) || 0,
      netproceeds: parseFloat(netproceeds) || 0,
      datereceived: datereceived || new Date().toISOString().split('T')[0],
      office,
      firstpayrolldate: firstpayrolldate || null,
      secondpayrolldate: secondpayrolldate || null,
      comaker1: comaker1 || null,
      comaker2: comaker2 || null,
      comaker3: comaker3 || null,
      comaker4: comaker4 || null,
      walletno: walletno || null,
      preparedby: preparedby || req.session?.user?.username || 'Unknown',
      designation: designation || req.session?.user?.designation || '', // ← ADD THIS
      preparedByIdno: req.session?.user?.idno || null, // ← ADD THIS — used to find signature_<idno>.png
      lengthofservice: parseFloat(lengthofservice) || 0,
      monthlyrate: parseFloat(monthlyrate) || 0,
      status: parseFloat(netproceeds) < 0 ? 'Pending' : 'For Signature',
    };

    // Save to database
    const result = await loanModel.saveLoan(loanData);

    console.log('📊 saveLoan model result:', result);

    if (!result || !result.controlNo) {
      throw new Error('Failed to save loan');
    }

    // Build employee data for PDF
    const employeeData = {
      idno: loanData.idno,
      lastname: loanData.lastname,
      firstname: loanData.firstname,
      datehired: null,
      monthlyrate: loanData.monthlyrate,
      lengthofservice: loanData.lengthofservice,
    };

    // Generate PDF if requested
    let pdfBuffer = null;
    if (generatePDF) {
      try {
        // Get credentials from benefits_credentials table
        const pool = utilitiesModel.getDbPool('default');
        const [credRows] = await pool.query(`SELECT * FROM benefits_credentials LIMIT 1`);
        const credentials = credRows[0] || {};

        // Get employee data with payroll info
        const employeeWithPayroll = await getEmployeeDataWithPayroll(
          loanData.idno,
          loanData.office,
          employeeData,
        );

        pdfBuffer = await PDFService.generateLoanPDF(
          { ...loanData, controlNo: result.controlNo },
          employeeWithPayroll,
          credentials,
          loanData.office || 'N/A',
          loanData.preparedby || 'Unknown',
          loanData.designation || '', // ← PASS DESIGNATION
        );
      } catch (pdfError) {
        console.error('PDF generation error:', pdfError);
        // Don't fail the save if PDF fails
      }
    }

    res.json({
      success: true,
      message: 'Loan saved successfully',
      controlNo: result.controlNo,
      loan: result.loan,
      pdfBuffer: pdfBuffer ? pdfBuffer.toString('base64') : null,
    });
  } catch (err) {
    console.error('Error saving loan:', err);
    res.status(500).json({
      success: false,
      message: 'Error saving loan: ' + err.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// GENERATE PDF FOR EXISTING LOAN
// GET /loan/generate-pdf/:controlNo
// ─────────────────────────────────────────────────────────────
async function generatePDF(req, res) {
  try {
    const { controlNo } = req.params;
    const { office } = req.query;

    // console.log('🔍 PDF Generation Request:');
    // console.log('  - controlNo:', controlNo);
    // console.log('  - office:', office);

    if (!controlNo) {
      return res.status(400).json({
        success: false,
        message: 'Control number is required',
      });
    }

    // Fetch loan data from database
    const pool = utilitiesModel.getDbPool('default');
    const [rows] = await pool.query(`SELECT * FROM loan_monitoring WHERE controlno = ?`, [
      controlNo,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found',
      });
    }

    const loanData = rows[0];
    loanData.percent35 = parseFloat(loanData['35percent']) || 0;
    loanData.controlNo = loanData.controlno;
    // Signature file is looked up by the CURRENT user's idno (whoever is
    // viewing/reprinting right now), same convention as processedBy below.
    loanData.preparedByIdno = req.session?.user?.idno || null;

    // Get signature credentials from benefits_credentials table
    const [credRows] = await pool.query(`SELECT * FROM benefits_credentials LIMIT 1`);
    const credentials = credRows[0] || {};

    // Get employee data with payroll info
    const employeeData = await getEmployeeDataWithPayroll(loanData.idno, office || loanData.office);

    // Get processed by from session or loan data
    const processedBy = req.session?.user?.username || loanData.preparedby || 'Unknown';

    // Generate PDF
    const pdfBuffer = await PDFService.generateLoanPDF(
      loanData,
      employeeData,
      credentials,
      office || loanData.office || 'N/A',
      processedBy,
    );

    // Send PDF as download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=loan-${controlNo}.pdf`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF: ' + err.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// CALCULATE LOAN (REST API ENDPOINT)
// POST /loan/calculate
// ─────────────────────────────────────────────────────────────
async function calculateLoan(req, res) {
  try {
    const { loanType, employeeData, loanAmount, bracketRow } = req.body;

    if (!loanType) {
      return res.status(400).json({
        success: false,
        message: 'Loan type is required',
      });
    }

    if (!employeeData || !employeeData.idno) {
      return res.status(400).json({
        success: false,
        message: 'Employee data is required',
      });
    }

    const result = await LoanCalculatorService.calculate(
      loanType,
      employeeData,
      parseFloat(loanAmount) || 0,
      bracketRow,
    );

    res.json(result);
  } catch (err) {
    console.error('Error calculating loan:', err);
    res.status(500).json({
      success: false,
      message: 'Error calculating loan: ' + err.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// PROCESS LOAN TYPE (FRONTEND HELPER)
// POST /loan/process
// ─────────────────────────────────────────────────────────────
async function processLoan(req, res) {
  try {
    const { loanType, employeeId, office, loanAmount } = req.body;

    if (!loanType || !employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Loan type and employee ID are required',
      });
    }

    // Get employee payroll data
    const payrollDates = loanModel.getLastTwoPayrollCycles();
    const payrollDateValues = payrollDates.map((pd) => pd.date);

    const payrollData = await loanModel.getEmployeePayrollData({
      employeeId: employeeId.trim(),
      office,
      payrollDates: payrollDateValues,
    });

    if (!payrollData || payrollData.length === 0) {
      return res.json({
        success: false,
        message: 'No payroll data found for this employee',
      });
    }

    // Build employee data with loan computation
    const employeeData = {
      idno: employeeId,
      office,
      payrollRecords: payrollData,
      payrollDates: payrollDateValues,
      loanComputation: buildLoanComputation(payrollData),
    };

    // Check if bracket is needed
    let bracketRow = null;
    const bracketType = getBracketType(loanType);
    if (bracketType) {
      const { rows } = await loanModel.getBracket({
        type: bracketType,
        office: office,
      });
      bracketRow = findMatchingBracketRow(rows, parseFloat(loanAmount) || 0, bracketType);
    }

    // Process the loan
    const result = await LoanCalculatorService.calculate(
      loanType,
      employeeData,
      parseFloat(loanAmount) || 0,
      bracketRow,
    );

    res.json(result);
  } catch (err) {
    console.error('Error processing loan:', err);
    res.status(500).json({
      success: false,
      message: 'Error processing loan: ' + err.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────

/**
 * Build loan computation from payroll data
 */
function buildLoanComputation(payrollData) {
  // Sort records by enddate (newest first)
  const sortedRecords = [...payrollData].sort((a, b) => new Date(b.enddate) - new Date(a.enddate));

  // Find first cycle (15th) and second cycle (30th/31st)
  let firstCycleRecord = null;
  let secondCycleRecord = null;

  sortedRecords.forEach((record) => {
    const endDate = new Date(record.enddate);
    const day = endDate.getDate();

    if (day === 15 && !firstCycleRecord) {
      firstCycleRecord = record;
    } else if (day >= 30 && !secondCycleRecord) {
      secondCycleRecord = record;
    }
  });

  // If only one record, use it for both
  if (!firstCycleRecord && sortedRecords.length > 0) {
    firstCycleRecord = sortedRecords[0];
  }
  if (!secondCycleRecord && sortedRecords.length > 0) {
    secondCycleRecord = sortedRecords[0];
  }

  // Calculate values
  const firstCycleNetPay = firstCycleRecord ? parseFloat(firstCycleRecord.netpay) || 0 : 0;
  const firstCycleOvertime = firstCycleRecord ? parseFloat(firstCycleRecord.totalot) || 0 : 0;
  const firstCycleAllowance = firstCycleRecord ? parseFloat(firstCycleRecord.totalallow) || 0 : 0;
  const firstCycleOtherIncome = firstCycleRecord
    ? parseFloat(firstCycleRecord.otherincome) || 0
    : 0;

  const secondCycleNetPay = secondCycleRecord ? parseFloat(secondCycleRecord.netpay) || 0 : 0;
  const secondCycleOvertime = secondCycleRecord ? parseFloat(secondCycleRecord.totalot) || 0 : 0;
  const secondCycleAllowance = secondCycleRecord
    ? parseFloat(secondCycleRecord.totalallow) || 0
    : 0;
  const secondCycleOtherIncome = secondCycleRecord
    ? parseFloat(secondCycleRecord.otherincome) || 0
    : 0;

  // Calculate totals
  const totalOvertime = firstCycleOvertime + secondCycleOvertime;
  const totalAllowance = firstCycleAllowance + secondCycleAllowance;
  const totalOtherIncome = firstCycleOtherIncome + secondCycleOtherIncome;
  const totalNetPay = firstCycleNetPay + secondCycleNetPay - (totalOvertime + totalOtherIncome);

  return {
    firstCycleNetPay,
    firstCycleOvertime,
    firstCycleAllowance,
    firstCycleOtherIncome,
    secondCycleNetPay,
    secondCycleOvertime,
    secondCycleAllowance,
    secondCycleOtherIncome,
    totalOvertime,
    totalAllowance,
    totalOtherIncome,
    totalNetPay,
    percentage: 0, // Will be calculated with monthly rate
    hasFirstCycle: !!firstCycleRecord,
    hasSecondCycle: !!secondCycleRecord,
    firstCycleDate: firstCycleRecord ? firstCycleRecord.enddate : null,
    secondCycleDate: secondCycleRecord ? secondCycleRecord.enddate : null,
  };
}

/**
 * Get employee data with payroll info
 */
async function getEmployeeDataWithPayroll(idno, office, baseData = {}) {
  try {
    const payrollDates = loanModel.getLastTwoPayrollCycles();
    const payrollDateValues = payrollDates.map((pd) => pd.date);

    const payrollData = await loanModel.getEmployeePayrollData({
      employeeId: idno.trim(),
      office: office,
      payrollDates: payrollDateValues,
    });

    if (payrollData && payrollData.length > 0) {
      const firstRecord = payrollData[0];
      return {
        ...baseData,
        idno: idno,
        datehired: firstRecord.datehired || null,
        monthlyrate: baseData.monthlyrate || firstRecord.monthlyrate || 0,
        lengthofservice: baseData.lengthofservice || 0,
        payrollRecords: payrollData,
      };
    }
  } catch (error) {
    console.error('Error fetching employee data:', error);
  }

  // Fallback: return basic employee data
  return {
    ...baseData,
    idno: idno,
    datehired: null,
    monthlyrate: baseData.monthlyrate || 0,
    lengthofservice: baseData.lengthofservice || 0,
    payrollRecords: [],
  };
}

/**
 * Get bracket type for loan type
 */
function getBracketType(loanType) {
  const normalized = loanType.toLowerCase().trim();
  const map = {
    'ml fund regular': 'ml_fund',
    'ml fund regular reloan': 'ml_fund',
    'sako maxi': 'sako_maxi',
    'sako pettycash': 'sako_petty',
    sss: 'sss',
  };
  return map[normalized] || null;
}

/**
 * Find matching bracket row
 */
function findMatchingBracketRow(rows, loanAmount, bracketType) {
  if (!rows || rows.length === 0) return null;

  const targetAmount = parseFloat(loanAmount) || 0;

  // For ML Fund, find closest match
  if (bracketType === 'ml_fund') {
    let matchedRow = null;
    let minDifference = Infinity;

    for (const row of rows) {
      const bracketAmount = parseBracketNumber(row['LOAN AMOUNT']);
      const difference = Math.abs(bracketAmount - targetAmount);
      if (difference < minDifference) {
        minDifference = difference;
        matchedRow = row;
      }
    }
    return matchedRow;
  }

  // For exact match loans
  for (const row of rows) {
    const bracketAmount = parseBracketNumber(row['LOAN AMOUNT']);
    if (bracketAmount === targetAmount) {
      return row;
    }
  }

  return rows[0] || null;
}

/**
 * Parse bracket number (remove formatting)
 */
function parseBracketNumber(value) {
  if (value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Calculate total loan deductions from payroll record
 */
function calculateTotalLoanDeductions(payroll) {
  const loanFields = [
    'pagibigloan',
    'sssloan',
    'sakoemergency',
    'sako_buyout',
    'mlfund_regular',
    'mlfund_comakership',
    'mlfund_jewelry',
    'mlfund_opi',
    'mlfund_pcl',
    'mlfund_emergency',
    'mlfund_all_buyout',
    'mlfund_bday',
    'mlfund_ssl',
  ];

  return loanFields.reduce((total, field) => {
    return total + (parseFloat(payroll[field]) || 0);
  }, 0);
}
// controllers/loanController.js - Add this function

// ─────────────────────────────────────────────────────────────
// SEARCH CO-MAKER
// GET /loan/search-comaker?query=&office=&excludeIdno=&field=&page=&limit=
// ─────────────────────────────────────────────────────────────
async function searchCoMaker(req, res) {
  console.log('++++++++++++++++++++++++++++++++++++');
  try {
    const { query, office, excludeIdno, field = 'lastname', page = 1, limit = 20 } = req.query;

    // Validate required parameters
    if (!office) {
      return res.status(400).json({
        success: false,
        message: 'Office is required',
      });
    }

    // If no query, return empty results
    if (!query || query.trim() === '') {
      return res.json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 0,
        },
      });
    }

    const result = await loanModel.searchCoMaker({
      query: query.trim(),
      office,
      excludeIdno: excludeIdno || null,
      field,
      page: parseInt(page),
      limit: parseInt(limit),
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('Co-maker search error:', err);
    res.status(500).json({
      success: false,
      message: 'Error searching co-maker: ' + err.message,
    });
  }
}

// loanController.js
// ─────────────────────────────────────────────────────────────
// GET LOAN TYPE CONFIGURATION
// GET /loan/loan-type-config?loanType=ML%20Fund%20Jewelry%20Loan
// ─────────────────────────────────────────────────────────────
async function getLoanTypeConfig(req, res) {
  try {
    const { loanType } = req.query;

    if (!loanType) {
      return res.status(400).json({
        success: false,
        message: 'Loan type is required',
      });
    }

    const config = await utilitiesModel.getLoanTypeConfig(loanType);

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Loan type configuration not found',
      });
    }

    res.json({
      success: true,
      config: {
        monthly_deduction_count: config.monthly_deduction_count || 2,
        interest_rate: parseFloat(config.interest_rate) || 0,
        formula_type: config.formula_type || 'input_based',
        min_service_years: config.min_service_years || 0,
        max_service_years: config.max_service_years || null,
        requires_eligibility: config.requires_eligibility || 0,
        requires_comakers: config.requires_comakers || 0,
        min_comakers: config.min_comakers || 0,
        max_comakers: config.max_comakers || 4,
        category: config.category || '',
        is_active: config.is_active || 1,
      },
    });
  } catch (err) {
    console.error('Error fetching loan type config:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching loan type configuration: ' + err.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// GET UPDATE LOAN STATUS PAGE
// GET /loans/update-status
// ─────────────────────────────────────────────────────────────
async function getUpdateLoanStatusPage(req, res) {
  try {
    const offices = await utilitiesModel.getOffice();
    const loan_statuses = await utilitiesModel.getLoanStatuses(); // NEW

    res.render('loans/updateLoanStatus', {
      title: 'Update Loan Status',
      offices,
      loan_statuses, // NEW
      username: req.session.user?.username || 'Unknown',
    });
  } catch (err) {
    console.error('Error loading update loan status page:', err);
    res.status(500).render('error', { error: 'Error loading update loan status page' });
  }
}

// ─────────────────────────────────────────────────────────────
// GET LOAN BY CONTROL NUMBER
// GET /loan/status/by-control?controlNo=
// ─────────────────────────────────────────────────────────────
async function getLoanByControlNo(req, res) {
  try {
    const { controlNo } = req.query;

    if (!controlNo) {
      return res.status(400).json({ success: false, message: 'Control number is required' });
    }

    const loan = await loanModel.getLoanByControlNo({ controlNo: controlNo.trim() });

    if (!loan) {
      return res.json({ success: false, message: 'No loan found for that control number.' });
    }

    res.json({ success: true, loan });
  } catch (err) {
    console.error('Error fetching loan by control no:', err);
    res.status(500).json({ success: false, message: 'Error fetching loan: ' + err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// SEARCH LOANS BY EMPLOYEE NAME
// GET /loan/status/search-by-name?office=&lastname=&firstname=&page=&limit=
// ─────────────────────────────────────────────────────────────
async function searchLoanByName(req, res) {
  try {
    const { office, lastname, firstname, page = 1, limit = 20 } = req.query;

    if (!office) {
      return res.status(400).json({ success: false, message: 'Office is required' });
    }
    if (!lastname && !firstname) {
      return res.json({
        success: true,
        data: [],
        pagination: { total: 0, page: parseInt(page), limit: parseInt(limit), totalPages: 0 },
      });
    }

    const result = await loanModel.searchLoanByName({
      office,
      lastname: lastname || null,
      firstname: firstname || null,
      page: parseInt(page),
      limit: parseInt(limit),
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error searching loan by name:', err);
    res.status(500).json({ success: false, message: 'Error searching loan: ' + err.message });
  }
}

async function searchLoanByNameRecompute(req, res) {
  try {
    const { office, lastname, firstname, page = 1, limit = 20 } = req.query;

    if (!office) {
      return res.status(400).json({ success: false, message: 'Office is required' });
    }
    if (!lastname && !firstname) {
      return res.json({
        success: true,
        data: [],
        pagination: { total: 0, page: parseInt(page), limit: parseInt(limit), totalPages: 0 },
      });
    }

    const result = await loanModel.searchLoanByNameRecompute({
      office,
      lastname: lastname || null,
      firstname: firstname || null,
      page: parseInt(page),
      limit: parseInt(limit),
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error searching loan by name:', err);
    res.status(500).json({ success: false, message: 'Error searching loan: ' + err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// UPDATE LOAN STATUS + REMARKS
// POST /loan/status/update
// ─────────────────────────────────────────────────────────────
async function updateLoanStatus(req, res) {
  try {
    const { controlNo, remarks, status } = req.body;

    if (!controlNo) {
      return res.status(400).json({ success: false, message: 'Control number is required' });
    }
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const updated = await loanModel.updateLoanStatus({
      controlNo,
      remarks: remarks || '',
      status,
    });

    if (!updated) {
      return res.json({ success: false, message: 'Loan not found or nothing was updated.' });
    }

    res.json({ success: true, message: 'Loan status updated successfully.' });
  } catch (err) {
    console.error('Error updating loan status:', err);
    res.status(500).json({ success: false, message: 'Error updating loan status: ' + err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// GET RECOMPUTE LOAN PAGE
// GET /loans/recompute
// ─────────────────────────────────────────────────────────────
const RECOMPUTE_EXCLUDED_LOAN_TYPES = [
  'ml fund 13th month',
  'ml fund a.l.l. bonus',
  'sako 13th month',
  'sako a.l.l. bonus',
];

async function getRecomputePage(req, res) {
  try {
    const offices = await utilitiesModel.getOffice();
    const allLoanTypes = await utilitiesModel.getLoanTypes();
    const loan_types = allLoanTypes.filter(
      (lt) => !RECOMPUTE_EXCLUDED_LOAN_TYPES.includes((lt.loanname || '').toLowerCase().trim()),
    );

    res.render('loans/recompute', {
      title: 'Recompute Loan',
      offices,
      loan_types,
      username: req.session.user?.username || 'Unknown',
      firstName: req.session.user?.firstName || '',
      lastName: req.session.user?.lastName || '',
      designation: req.session.user?.designation || '',
    });
  } catch (err) {
    console.error('Error loading recompute page:', err);
    res.status(500).render('error', { error: 'Error loading recompute page' });
  }
}

// ─────────────────────────────────────────────────────────────
// SAVE RECOMPUTED VALUES BACK TO THE SAME LOAN RECORD
// POST /loan/recompute/update
// ─────────────────────────────────────────────────────────────
async function recomputeUpdate(req, res) {
  try {
    const {
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
    } = req.body;

    if (!controlNo)
      return res.status(400).json({ success: false, message: 'Control number is required' });
    if (!loantype)
      return res.status(400).json({ success: false, message: 'Loan type is required' });

    const updated = await loanModel.recomputeLoanUpdate({
      controlNo,
      loantype,
      loanamount: parseFloat(loanamount) || 0,
      loandeduction: parseFloat(loandeduction) || 0,
      netpay1: parseFloat(netpay1) || 0,
      netpay2: parseFloat(netpay2) || 0,
      existingloan: parseFloat(existingloan) || 0,
      percent35: parseFloat(percent35) || 0,
      deductionpermonth: parseFloat(deductionpermonth) || 0,
      netproceeds: parseFloat(netproceeds) || 0,
      comaker1,
      comaker2,
      comaker3,
      comaker4,
      lengthofservice: parseFloat(lengthofservice) || 0,
      monthly_rate: parseFloat(monthly_rate) || 0,
    });

    if (!updated) {
      return res.json({ success: false, message: 'Loan not found or nothing was updated.' });
    }

    res.json({ success: true, message: 'Loan recomputed and saved successfully.', controlNo });
  } catch (err) {
    console.error('Error recomputing loan:', err);
    res.status(500).json({ success: false, message: 'Error recomputing loan: ' + err.message });
  }
}

// loanController.js - Add these functions

// ─────────────────────────────────────────────────────────────
// GET LOAN REPORTS PAGE
// GET /loans/reports
// ─────────────────────────────────────────────────────────────
async function getLoanReportsPage(req, res) {
  try {
    const offices = await utilitiesModel.getOffice();
    const providers = await utilitiesModel.getLoanProviders();
    const loanTypes = await utilitiesModel.getLoanTypesForFilter();
    const statuses = await utilitiesModel.getLoanStatuses();

    res.render('loans/reports', {
      title: 'Loan Reports',
      offices,
      providers,
      loanTypes,
      statuses,
      username: req.session.user?.username || 'Unknown',
      firstName: req.session.user?.firstName || '',
      lastName: req.session.user?.lastName || '',
      designation: req.session.user?.designation || '',
    });
  } catch (err) {
    console.error('Error loading loan reports page:', err);
    res.status(500).render('error', { error: 'Error loading loan reports page' });
  }
}

// ─────────────────────────────────────────────────────────────
// GET LOAN TYPES BY PROVIDER (AJAX)
// GET /loan/reports/loan-types-by-provider?provider=mlfund
// ─────────────────────────────────────────────────────────────
async function getLoanTypesByProvider(req, res) {
  try {
    const { provider } = req.query;

    const loanTypes = await utilitiesModel.getLoanTypesByProvider(provider);

    res.json({
      success: true,
      loanTypes: loanTypes,
    });
  } catch (err) {
    console.error('Error fetching loan types by provider:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching loan types: ' + err.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// GENERATE LOAN REPORT DATA (AJAX)
// GET /loan/reports/data
// ─────────────────────────────────────────────────────────────
async function getLoanReportData(req, res) {
  try {
    const {
      startDate,
      startTime,
      endDate,
      endTime,
      office,
      provider,
      loanType,
      status,
      employeeId,
      page = 1,
      limit = 20,
      sortBy = 'lastname', // new
    } = req.query;

    const commonFilters = {
      startDate,
      startTime,
      endDate,
      endTime,
      office,
      provider,
      loanType,
      status,
      employeeId,
      sortBy, // pass through
    };

    // Get loan data (now with sorting)
    const reportData = await loanModel.getLoansForReport({
      ...commonFilters,
      page: parseInt(page),
      limit: parseInt(limit),
    });

    // Get summary statistics
    const summaryData = await loanModel.getLoanSummary(commonFilters);

    // Get status counts
    const statusCounts = await loanModel.getLoanStatusCounts(commonFilters);

    res.json({
      success: true,
      data: reportData.data,
      pagination: reportData.pagination,
      summary: summaryData,
      statusCounts: statusCounts,
    });
  } catch (err) {
    console.error('Error generating loan report data:', err);
    res.status(500).json({
      success: false,
      message: 'Error generating loan report data: ' + err.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORT LOAN REPORT (CSV)
// GET /loan/reports/export
// ─────────────────────────────────────────────────────────────
async function exportLoanReport(req, res) {
  try {
    const {
      startDate,
      startTime,
      endDate,
      endTime,
      office,
      provider,
      loanType,
      status,
      employeeId,
    } = req.query;

    const reportData = await loanModel.getLoansForReport({
      startDate,
      startTime,
      endDate,
      endTime,
      office,
      provider,
      loanType,
      status,
      employeeId,
      page: 1,
      limit: 9999,
    });

    // Convert to CSV
    const headers = [
      'Control No',
      'Employee ID',
      'Last Name',
      'First Name',
      'Branch',
      'Office',
      'Loan Type',
      'Loan Amount',
      'Loan Deduction',
      'Net Proceeds',
      'Date Received',
      'Date Approved',
      'Status',
      'Prepared By',
      'Remarks',
    ];

    let csv = headers.join(',') + '\n';
    reportData.data.forEach((row) => {
      const values = headers.map((h) => {
        let val = '';
        switch (h) {
          case 'Control No':
            val = row.controlno;
            break;
          case 'Employee ID':
            val = row.idno;
            break;
          case 'Last Name':
            val = row.lastname;
            break;
          case 'First Name':
            val = row.firstname;
            break;
          case 'Branch':
            val = row.branch;
            break;
          case 'Office':
            val = row.office;
            break;
          case 'Loan Type':
            val = row.loantype;
            break;
          case 'Loan Amount':
            val = row.loanamount;
            break;
          case 'Loan Deduction':
            val = row.loandeduction;
            break;
          case 'Net Proceeds':
            val = row.netproceeds;
            break;
          case 'Date Received':
            val = row.datereceived;
            break;
          case 'Date Approved':
            val = row.dateapproved;
            break;
          case 'Status':
            val = row.STATUS;
            break;
          case 'Prepared By':
            val = row.preparedby;
            break;
          case 'Remarks':
            val = row.remarks;
            break;
        }
        return `"${val || ''}"`;
      });
      csv += values.join(',') + '\n';
    });

    const filename = `loan-report-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('Error exporting loan report:', err);
    res.status(500).json({
      success: false,
      message: 'Error exporting loan report: ' + err.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORT LOAN REPORT (PDF)
// GET /loan/reports/pdf
// ─────────────────────────────────────────────────────────────
async function exportLoanReportPDF(req, res) {
  try {
    const {
      startDate,
      startTime,
      endDate,
      endTime,
      office,
      provider,
      loanType,
      status,
      employeeId,
      sortBy = 'lastname',
    } = req.query;

    const commonFilters = {
      startDate,
      startTime,
      endDate,
      endTime,
      office,
      provider,
      loanType,
      status,
      employeeId,
      sortBy,
    };

    // Fetch all matching loans (no pagination limit)
    const reportData = await loanModel.getLoansForReport({
      ...commonFilters,
      page: 1,
      limit: 9999, // get all
    });

    const loans = reportData.data;

    // Prepare user info
    const userInfo = {
      preparedBy: req.session.user?.username || req.session.user?.firstName || 'Unknown',
      date: new Date(),
    };
    const path = require('path');
    // Logo path (adjust to your actual file location)
    const logoPath = path.join(__dirname, '../public/images/logo.png');

    // Generate PDF
    const pdfBuffer = await PDFService.generateLoanReportPDF(
      loans,
      { office, provider },
      userInfo,
      logoPath,
    );

    // Send PDF as download
    const filename = `loan-report-${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generating PDF report:', err);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF report: ' + err.message,
    });
  }
}

// Update module.exports at the bottom
module.exports = {
  getNewLoanPage,
  searchEmployee,
  searchCoMaker,
  getBracket,
  getEmployeePayroll,
  checkExistingLoan,
  saveLoan,
  generatePDF,
  calculateLoan,
  processLoan,
  getLoanTypeConfig,
  getUpdateLoanStatusPage,
  getLoanByControlNo,
  searchLoanByName,
  updateLoanStatus,
  getRecomputePage,
  recomputeUpdate,
  getLoanReportsPage, // 👈 ADD THIS
  getLoanTypesByProvider, // 👈 ADD THIS
  getLoanReportData, // 👈 ADD THIS
  exportLoanReport, // 👈 ADD THIS
  exportLoanReportPDF,
  searchLoanByNameRecompute,
};
