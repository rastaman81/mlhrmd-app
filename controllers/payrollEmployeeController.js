const utilitiesModel = require("../models/utilitiesModel");
const payrollEmployeeModel = require("../models/payrollEmployeeModel");

/**
 * Handle the employee search request.
 *
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 */
async function getDBFEmployees(req, res) {
  console.log("get employees controller");
  try {
    const { region, idno, firstname, lastname, office } = req.query;
    console.log(region, idno, lastname, firstname, office);
    // Call the model to get employees based on the search criteria
    const employees = await payrollEmployeeModel.getEmployeesBySearch(
      region,
      idno,
      lastname,
      firstname,
      office
    );

    if (employees.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No employees found matching the search criteria.",
        results: [],
      });
    }

    // Return the employee search results
    return res.status(200).json({
      success: true,
      message: "Employees found.",
      results: employees,
    });
  } catch (error) {
    console.error("Error in getDBFEmployees:", error);
    return res.status(500).json({
      success: false,
      message: "Error searching employees. Please try again later.",
    });
  }
}

async function showEmployeeUpdatePage(req, res) {
  try {
    const employeeData = req.query.data;
    if (!employeeData) {
      return res.status(400).render("error", {
        message: "Employee data not provided",
      });
    }

    // Decode the employee data
    const employee = JSON.parse(atob(employeeData));
    console.log(employee.office);

    const regions = await utilitiesModel.getPayrollRegions(employee.office);
    // Get marital status options
    const maritalStatuses = await utilitiesModel.getMaritalStatus();
    const visminBranches = await utilitiesModel.getBranches("vismin");
    const luzonBranches = await utilitiesModel.getBranches("luzon");
    const mlgroupBranches = await utilitiesModel.getBranches("mlgroup");
    const designations = await utilitiesModel.getPayrollDesignations();
    const employeeStatus = await utilitiesModel.getPayrollStatus();

    //console.log(mlgroupBranches);
    // Map the single-character status to full description
    const statusMap = {
      S: "Single",
      M: "Married",
      W: "Widowed",
      // Add other mappings as needed
    };

    // Add the mapped description to the employee object
    employee.maritalStatusDesc = statusMap[employee.E_STAT] || employee.E_STAT;

    res.render("payroll-employee-update", {
      title: "Update Employee",
      employee: employee,
      maritalStatuses: maritalStatuses,
      statusMap: statusMap, // Pass the map to the view
      visminBranches: visminBranches,
      luzonBranches: luzonBranches,
      mlgroupBranches: mlgroupBranches,
      designations: designations,
      employeeStatus: employeeStatus,
      regions: regions,
    });
  } catch (error) {
    console.error("Error in showEmployeeUpdatePage:", error);
    return res.status(500).render("error", {
      message: "Error loading employee data",
    });
  }
}

async function updateEmployee(req, res) {
  try {
    // Create a copy of the request body to avoid mutation
    const employeeData = { ...req.body };

    // Add additional fields that might not be in the form but are needed
    employeeData.region = employeeData.region || req.body.region;
    employeeData.office = employeeData.office || req.body.office;

    // Validate required fields
    if (!employeeData.idno) {
      return res.status(400).json({
        success: false,
        message: "Employee ID number is required",
      });
    }

    console.log(employeeData);
    // Call the model to update the employee
    const result = await payrollEmployeeModel.updateEmployeeInDBF(employeeData);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: "Employee updated successfully",
        data: {
          idno: employeeData.idno,
          deletedCount: result.deletedCount,
          insertedCount: result.insertedCount,
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message || "Failed to update employee",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Error in updateEmployee controller:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while updating employee",
      error: error.message,
    });
  }
}

module.exports = {
  getDBFEmployees,
  showEmployeeUpdatePage,
  updateEmployee,
};
