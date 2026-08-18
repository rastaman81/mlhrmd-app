// controllers/resignedEmployeeController.js

const resignedEmployeeModel = require('../models/resignedEmployeeModel');
const utilitiesModel = require('../models/utilitiesModel');

// Render the resigned employee payroll breakdown page
async function getResignedEmployeePage(req, res) {
  try {
    const offices = await utilitiesModel.getOffice();

    res.render('resigned/resigned-employee-breakdown', {
      title: 'Payroll Breakdown for Resigned Employee',
      offices,
      username: req.session.user.username,
    });
  } catch (error) {
    console.error('Error loading resigned employee page:', error);
    res.status(500).render('error', {
      error: 'Error loading resigned employee page',
    });
  }
}

// Search resigned employees - API endpoint
async function searchResignedEmployees(req, res) {
  try {
    const { office, idno, lastName, firstName } = req.query;

    if (!office) {
      return res.status(400).json({
        success: false,
        message: 'Office is required',
      });
    }

    if (!idno && !lastName && !firstName) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one search criteria (ID, Last Name, or First Name)',
      });
    }

    const employees = await resignedEmployeeModel.searchResignedEmployees(
      office,
      idno,
      lastName,
      firstName,
    );

    return res.json({
      success: true,
      data: employees || [],
    });
  } catch (error) {
    console.error('Error searching resigned employees:', error);
    return res.status(500).json({
      success: false,
      message: 'Error searching employees: ' + error.message,
    });
  }
}

// Get payroll breakdown for a specific resigned employee - API endpoint
async function getResignedEmployeeBreakdown(req, res) {
  try {
    const { office, idno, year } = req.query;

    if (!office) {
      return res.status(400).json({
        success: false,
        message: 'Office is required',
      });
    }

    if (!idno) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID is required',
      });
    }

    // If year is provided, force that year
    const forceYear = year ? parseInt(year) : null;

    const result = await resignedEmployeeModel.getResignedEmployeePayrollBreakdown(
      office,
      idno,
      forceYear,
    );

    if (!result || !result.employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // If no data found but we have available years
    if (!result.hasData && result.availableYears && result.availableYears.length > 0) {
      return res.json({
        success: false,
        message: result.message || 'No payroll data found',
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
        data: {
          employee: result.employee,
        },
      });
    }

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error getting resigned employee breakdown:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving payroll breakdown: ' + error.message,
    });
  }
}

// Generate printable/PDF version for resigned employee - API endpoint
async function generateResignedEmployeePDF(req, res) {
  try {
    const { office, idno, year } = req.body;

    if (!office) {
      return res.status(400).json({
        success: false,
        message: 'Office is required',
      });
    }

    if (!idno) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID is required',
      });
    }

    // Use the specified year or default
    const forceYear = year ? parseInt(year) : null;

    const result = await resignedEmployeeModel.getResignedEmployeePayrollBreakdown(
      office,
      idno,
      forceYear,
    );

    if (!result || !result.employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    if (!result.hasData || !result.breakdown || result.breakdown.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No payroll data available for this employee',
      });
    }

    const pdfBuffer = await resignedEmployeeModel.generateResignedEmployeePDF(
      result,
      req.session.user.username || 'System User',
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Payroll_Breakdown_Resigned_${result.employee.idno}_${new Date().toISOString().slice(0, 10)}.pdf`,
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF: ' + error.message,
    });
  }
}

module.exports = {
  getResignedEmployeePage,
  searchResignedEmployees,
  getResignedEmployeeBreakdown,
  generateResignedEmployeePDF,
};
