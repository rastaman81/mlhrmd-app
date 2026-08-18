// controllers/benefitsReportsController.js
const benefitsReportsModel = require('../models/benefitsReportsModel');
const lastPayModel = require('../models/lastPayModel');
const utilitiesModel = require('../models/utilitiesModel');
const resignedEmployeeModel = require('../models/resignedEmployeeModel');

// Render Reports page
async function getReportsPage(req, res) {
  try {
    const offices = await utilitiesModel.getOffice();
    const deductionTypes = await benefitsReportsModel.getDeductionTypes();

    res.render('resigned/last-pay-reports', {
      title: 'Last Pay Reports',
      offices,
      deductionTypes,
      username: req.session.user.username,
    });
  } catch (error) {
    console.error('Error loading reports page:', error);
    res.status(500).render('error', { error: 'Error loading reports page' });
  }
}

// Search resigned employees (reuses existing search)
async function searchResignedEmployees(req, res) {
  try {
    const { office, idno, lastName, firstName } = req.query;

    if (!office) {
      return res.status(400).json({ success: false, message: 'Office is required' });
    }

    if (!idno && !lastName && !firstName) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one search criteria',
      });
    }

    const employees = await resignedEmployeeModel.searchResignedEmployees(
      office,
      idno,
      lastName,
      firstName,
    );

    return res.json({ success: true, data: employees || [] });
  } catch (error) {
    console.error('Error searching resigned employees:', error);
    return res.status(500).json({
      success: false,
      message: 'Error searching employees: ' + error.message,
    });
  }
}

// Get employee's exit computations (for reprint)
async function getEmployeeComputations(req, res) {
  try {
    const { office, idno } = req.query;

    if (!office || !idno) {
      return res.status(400).json({
        success: false,
        message: 'Office and ID are required',
      });
    }

    const computations = await benefitsReportsModel.getEmployeeExitComputations(office, idno);

    if (computations.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No saved computations found for this employee.',
      });
    }

    return res.json({ success: true, data: computations });
  } catch (error) {
    console.error('Error getting employee computations:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

// Reprint existing Last Pay PDF
async function reprintLastPayPDF(req, res) {
  try {
    const { office, idno, transDate } = req.body;

    if (!office || !idno || !transDate) {
      return res.status(400).json({
        success: false,
        message: 'Office, ID, and Transaction Date are required',
      });
    }

    // Get the saved computation
    const computation = await benefitsReportsModel.getExitComputationByDate(
      office,
      idno,
      transDate,
    );

    if (!computation) {
      return res.status(404).json({
        success: false,
        message: 'Computation not found',
      });
    }

    // Get deduction details
    const deductions = await benefitsReportsModel.getExitDeductionDetails(idno, transDate);

    // Build the submittedState object with ALL required properties
    const submittedState = {
      year: new Date(transDate).getFullYear(),
      losIncluded: computation.losAmount > 0,
      resignationTypeId: computation.separationtype || null,
      salaryAmount: computation.otherincomeamount || 0,
      salaryDescription: computation.otherincome || '',
      otherIncomeAmount: computation.otherincomeamount2 || 0,
      otherIncomeDescription: computation.otherincome2 || '',
      transactionDate: transDate,
      deductions: deductions.map((d) => ({
        type: d.deductiontype,
        outstanding: d.outstanding,
        deduction: d.deduction,
        balance: d.balance,
      })),
    };

    // Get prepared by from benefits_credentials
    const credentials = await benefitsReportsModel.getPreparedByCredentials();
    let preparedByName = req.session.user.fullname || req.session.user.username || 'System User';

    if (credentials && credentials.preparedBy) {
      preparedByName = credentials.preparedTitle
        ? `${credentials.preparedBy}, ${credentials.preparedTitle}`
        : credentials.preparedBy;
    }

    // Generate PDF
    const pdfBuffer = await lastPayModel.generateLastPayPDF(
      office,
      idno,
      submittedState,
      preparedByName,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Last_Pay_Reprint_${idno}_${transDate}.pdf`,
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error reprinting last pay:', error);
    res.status(500).json({
      success: false,
      message: 'Error reprinting: ' + error.message,
    });
  }
}

// ================================================================
// GENERATE DEDUCTION TYPE REPORT - UPDATED
// ================================================================
async function generateDeductionReport(req, res) {
  try {
    const { deductionType, dateFrom, dateTo, office, format } = req.body;

    if (!dateFrom || !dateTo) {
      return res.status(400).json({
        success: false,
        message: 'Date range is required',
      });
    }

    const data = await benefitsReportsModel.getDeductionTypeReport({
      deductionType: deductionType || null,
      dateFrom,
      dateTo,
      office: office || null,
    });

    // ✅ Get prepared by credentials from benefits_credentials table
    const credentials = await benefitsReportsModel.getPreparedByCredentials();

    let preparedByName = 'System User';
    let preparedByTitle = '';

    if (credentials) {
      preparedByName = credentials.preparedBy || 'System User';
      preparedByTitle = credentials.preparedTitle || '';
    }

    // Format the prepared by string with title if available
    const fullPreparedBy = preparedByTitle
      ? `${preparedByName}, ${preparedByTitle}`
      : preparedByName;

    // Export to PDF
    if (format === 'pdf') {
      const reportParams = {
        deductionType: deductionType || 'All Types',
        dateFrom,
        dateTo,
        office: office || null,
      };

      const pdfBuffer = await benefitsReportsModel.generateDeductionReportPDF(
        data,
        reportParams,
        fullPreparedBy, // ✅ Pass the prepared by with title from benefits_credentials
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=Deduction_Report_${deductionType || 'All'}_${dateFrom}_to_${dateTo}.pdf`,
      );
      return res.send(pdfBuffer);
    }

    // Export to Excel/CSV
    if (format === 'excel') {
      const csv = benefitsReportsModel.generateDeductionReportCSV(data);
      if (!csv) {
        return res.status(404).json({
          success: false,
          message: 'No data to export',
        });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=Deduction_Report_${deductionType || 'All'}_${dateFrom}_to_${dateTo}.csv`,
      );
      return res.send(csv);
    }

    // Return JSON for UI display
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error generating deduction report:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

module.exports = {
  getReportsPage,
  searchResignedEmployees,
  getEmployeeComputations,
  reprintLastPayPDF,
  generateDeductionReport,
};
