const employeeModel = require("../models/employeeModel");
const dateModel = require("../models/dateModel");

// ----------------------------------------- DISPLAY SEARCH PAGE WITH OFFICES ----------------------------------------- //
const searchPage = async (req, res) => {
  try {
    const offices = await dateModel.getOffices();

    res.render("search", { employees: [], offices: offices });
  } catch {
    console.error("Error loading data:", error); // Logs the error details
    res.render("search", {
      employees: [],
      offices: [],
      error: "Error loading offices or reports",
    });
  }
};
// ----------------------------------------- DISPLAY SEARCH PAGE WITH OFFICES ----------------------------------------- //

// ----------------------------------------- HANDLE SEARCH FOR EMPLOYEES ----------------------------------------- //
const searchEmployees = async (req, res) => {
  // Extract searchTerm and office from req.body if it is a POST request, or from req.query if it's a GET request (pagination)
  const searchTerm = req.query.searchTerm || req.body.searchTerm || ""; // Defaults to an empty string if not provided
  const office = req.query.office || req.body.office || ""; // Defaults to an empty string if not provided

  // Handle pagination logic
  const page = parseInt(req.query.page) || 1; // Current page, default to 1
  const limit = parseInt(req.query.limit) || 20; // Items per page, default to 20
  const offset = (page - 1) * limit; // Calculate the offset for pagination

  try {
    // Fetch employees based on search term, office, limit, and offset
    const employees = await employeeModel.searchEmployees(
      searchTerm,
      office,
      limit,
      offset
    );

    //Fetch the total number of employees
    const totalEmployees = await employeeModel.countEmployees(
      searchTerm,
      office
    ); // Get the total number of matching employees

    // Get office list again for rendering purposes
    const offices = await dateModel.getOffices();

    // Calculate total number of pages
    const totalPages = Math.ceil(totalEmployees / limit);

    // Render the search page with results, pagination info, and search parameters
    res.render("search", {
      employees,
      offices,
      searchTerm, // Pass searchTerm so it can be used in pagination links
      office, // Pass office so it can be used in pagination links
      page,
      limit,
      totalPages,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error retrieving employees.");
  }
};
// ----------------------------------------- HANDLE SEARCH FOR EMPLOYEES ----------------------------------------- //

// ----------------------------------------- HANDLE SEARCH FOR EMPLOYEES ----------------------------------------- //

// // Handle search for employees
// const searchEmployees = async (req, res) => {
//   const { searchTerm, office } = req.body;
//   console.log("this is the ", office);
//   try {
//     const employees = await employeeModel.searchEmployees(searchTerm, office);
//     const offices = await dateModel.getOffices();
//     res.render("search", { employees, offices });
//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Error retrieving employees.");
//   }
// };

// ----------------------------------------- DISPLAY EMPLOYEE DETAILS BY ID ----------------------------------------- //
const getEmployeeDetails = async (req, res) => {
  const employeeId = req.query.employeeId; // Get employeeId from query parameters
  const office = req.query.office; // Get office from query parameters

  try {
    const employee = await employeeModel.getEmployeeById(employeeId, office);
    if (employee) {
      res.render("employeeDetails", { employee, office }); // Pass office along with employee data
    } else {
      res.status(404).send("Employee not found.");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Error retrieving employee details.");
  }
};
// ----------------------------------------- DISPLAY EMPLOYEE DETAILS BY ID ----------------------------------------- //

module.exports = {
  searchPage,
  searchEmployees,
  getEmployeeDetails,
};
