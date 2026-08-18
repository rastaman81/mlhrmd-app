// controllers/lastPayController.js

const lastPayModel = require('../models/lastPayModel');
const utilitiesModel = require('../models/utilitiesModel');

// Render the Last Pay Computation page
async function getLastPayPage(req, res) {
  try {
    const offices = await utilitiesModel.getOffice();

    res.render('resigned/last-pay-computation', {
      title: 'Last Pay Computation',
      offices,
      username: req.session.user.username,
    });
  } catch (error) {
    console.error('Error loading last pay computation page:', error);
    res.status(500).render('error', {
      error: 'Error loading last pay computation page',
    });
  }
}

// Get everything needed to populate the Last Pay Computation screen for one employee
async function getLastPayDetails(req, res) {
  try {
    const { office, idno, year } = req.query;

    if (!office) {
      return res.status(400).json({ success: false, message: 'Office is required' });
    }
    if (!idno) {
      return res.status(400).json({ success: false, message: 'Employee ID is required' });
    }

    const forceYear = year ? parseInt(year, 10) : null;
    const result = await lastPayModel.getLastPayDetails(office, idno, forceYear);

    if (!result || !result.employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    if (!result.hasData && result.availableYears && result.availableYears.length > 0) {
      return res.json({
        success: false,
        message: result.message,
        data: {
          employee: result.employee,
          availableYears: result.availableYears,
          currentYear: result.currentYear,
        },
        needsYearSelection: true,
      });
    }

    if (!result.hasData) {
      return res.json({
        success: false,
        message: result.message || 'No payroll records found',
        data: { employee: result.employee },
      });
    }

    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error getting last pay details:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving last pay details: ' + error.message,
    });
  }
}

// Generate a preview PDF from client-submitted computation state (nothing persisted)
async function generateLastPayPDF(req, res) {
  try {
    const {
      office,
      idno,
      year,
      losIncluded,
      resignationTypeId,
      salaryAmount,
      salaryDescription,
      otherIncomeAmount,
      otherIncomeDescription,
      deductions,
    } = req.body;

    if (!office) {
      return res.status(400).json({ success: false, message: 'Office is required' });
    }
    if (!idno) {
      return res.status(400).json({ success: false, message: 'Employee ID is required' });
    }

    const submittedState = {
      year: year ? parseInt(year, 10) : null,
      losIncluded: !!losIncluded,
      resignationTypeId: resignationTypeId || null,
      salaryAmount: salaryAmount || 0,
      salaryDescription: salaryDescription || '',
      otherIncomeAmount: otherIncomeAmount || 0,
      otherIncomeDescription: otherIncomeDescription || '',
      deductions: Array.isArray(deductions) ? deductions : [],
    };

    const pdfBuffer = await lastPayModel.generateLastPayPDF(office, idno, submittedState);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Last_Pay_Computation_${idno}_${new Date().toISOString().slice(0, 10)}.pdf`,
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating last pay PDF:', error);
    res.status(500).json({ success: false, message: 'Error generating PDF: ' + error.message });
  }
}

// Actually save the computation (check-then-insert) and return the PDF.
// Blocked entirely if a record already exists for this employee (idno is the
// sole primary key on benefits_exit_computations).
async function saveLastPayComputation(req, res) {
  try {
    const {
      office,
      idno,
      year,
      losIncluded,
      resignationTypeId,
      resignationRemarks, // Add this
      salaryAmount,
      salaryDescription,
      otherIncomeAmount,
      otherIncomeDescription,
      thirteenthMonthAmount, // NEW
      notes,
      deductions,
    } = req.body;

    if (!office) {
      return res.status(400).json({ success: false, message: 'Office is required' });
    }
    if (!idno) {
      return res.status(400).json({ success: false, message: 'Employee ID is required' });
    }
    if (!resignationTypeId) {
      return res.status(400).json({ success: false, message: 'Resignation type is required' });
    }

    const submittedState = {
      year: year ? parseInt(year, 10) : null,
      losIncluded: !!losIncluded,
      resignationTypeId,
      resignationRemarks: resignationRemarks || '',
      salaryAmount: salaryAmount || 0,
      salaryDescription: salaryDescription || '',
      otherIncomeAmount: otherIncomeAmount || 0,
      otherIncomeDescription: otherIncomeDescription || '',
      thirteenthMonthAmount: thirteenthMonthAmount || 0, // Make sure this is included
      notes: notes, // ADD THIS

      deductions: Array.isArray(deductions) ? deductions : [],
    };

    const pdfBuffer = await lastPayModel.saveLastPayComputation(office, idno, submittedState);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Last_Pay_Computation_${idno}_${new Date().toISOString().slice(0, 10)}.pdf`,
    );
    res.send(pdfBuffer);
  } catch (error) {
    if (error.code === 'ALREADY_EXISTS') {
      return res.status(409).json({
        success: false,
        code: 'ALREADY_EXISTS',
        message:
          'This employee already has a saved Last Pay Computation. This record is now view-only.',
      });
    }
    console.error('Error saving last pay computation:', error);
    res.status(500).json({ success: false, message: 'Error saving computation: ' + error.message });
  }
}

// Update a previously saved computation (overwrites figures, bumps transactionupdated).
async function updateLastPayComputation(req, res) {
  try {
    const {
      office,
      idno,
      year,
      losIncluded,
      resignationTypeId,
      resignationRemarks, // Add this
      salaryAmount,
      salaryDescription,
      otherIncomeAmount,
      otherIncomeDescription,
      thirteenthMonthAmount,
      deductions,
    } = req.body;

    if (!office) {
      return res.status(400).json({ success: false, message: 'Office is required' });
    }
    if (!idno) {
      return res.status(400).json({ success: false, message: 'Employee ID is required' });
    }
    if (!resignationTypeId) {
      return res.status(400).json({ success: false, message: 'Resignation type is required' });
    }

    const submittedState = {
      year: year ? parseInt(year, 10) : null,
      losIncluded: !!losIncluded,
      resignationTypeId,
      resignationRemarks: resignationRemarks || '', // Add this
      salaryAmount: salaryAmount || 0,
      salaryDescription: salaryDescription || '',
      otherIncomeAmount: otherIncomeAmount || 0,
      otherIncomeDescription: otherIncomeDescription || '',
      thirteenthMonthAmount: thirteenthMonthAmount || 0, // ADD THIS
      deductions: Array.isArray(deductions) ? deductions : [],
    };

    const pdfBuffer = await lastPayModel.updateLastPayComputation(office, idno, submittedState);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Last_Pay_Computation_${idno}_${new Date().toISOString().slice(0, 10)}.pdf`,
    );
    res.send(pdfBuffer);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error('Error updating last pay computation:', error);
    res
      .status(500)
      .json({ success: false, message: 'Error updating computation: ' + error.message });
  }
}

// Regenerate the PDF for an already-saved employee, straight from the DB.
async function downloadSavedPDF(req, res) {
  try {
    const { idno } = req.query;

    if (!idno) {
      return res.status(400).json({ success: false, message: 'Employee ID is required' });
    }

    const pdfBuffer = await lastPayModel.generateSavedPDF(idno);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Last_Pay_Computation_${idno}_${new Date().toISOString().slice(0, 10)}.pdf`,
    );
    res.send(pdfBuffer);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error('Error downloading saved PDF:', error);
    res
      .status(500)
      .json({ success: false, message: 'Error downloading saved PDF: ' + error.message });
  }
}

module.exports = {
  getLastPayPage,
  getLastPayDetails,
  generateLastPayPDF,
  saveLastPayComputation,
  updateLastPayComputation,
  downloadSavedPDF,
};
