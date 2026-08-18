// async function searchActiveEmployees(req, res) {
//   const { office, idno, lastName, firstName, page = 1 } = req.query;
//   const limit = 10;
//   const offset = (page - 1) * limit;

//   console.log(
//     "controller **************** ",
//     office,
//     idno,
//     lastName,
//     firstName,
//     page,
//   );
//   try {
//     if (!office) {
//       return res.json({
//         success: false,
//         message: "Please select an office.",
//       });
//     }

//     const { results, totalPages } = await dashboardModel.searchActiveEmployees(
//       office,
//       idno,
//       lastName,
//       firstName,
//       limit,
//       offset,
//     );

//     // Return the response with employee data and pagination info
//     res.json({
//       success: true,
//       employees: results,
//       totalPages,
//       currentPage: page,
//     });
//   } catch (error) {
//     console.error("Error fetching employees:", error);
//     res.json({ success: false, message: "Error fetching employees." });
//   }
// }

// const db = require("../config/db");
// const dashboardModel = require("../models/dashboardModel");

// async function searchEmployees(req, res) {
//   // FIX: Added `status` query param — defaults to "active" if not provided
//   const { office, idno, lastName, firstName, page = 1 } = req.query;
//   const limit = 10;
//   const offset = (page - 1) * limit;

//   if (!office) {
//     return res.json({ success: false, message: "Please select an office." });
//   }

//   // Guard against unexpected values — only allow known statuses

//   try {
//     const { results, totalPages } = await dashboardModel.searchEmployees(
//       office,
//       idno,
//       lastName,
//       firstName,
//       limit,
//       offset,
//     );

//     res.json({
//       success: true,
//       employees: results,
//       totalPages,
//       currentPage: page,
//     });
//   } catch (error) {
//     console.error("Error fetching employees:", error);
//     res.json({ success: false, message: "Error fetching employees." });
//   }
// }
// async function getEmployeeDetails(req, res) {
//   try {
//     console.log(req.query);
//     const { id, office } = req.query;
//     console.log("idno:", id, "office: ", office);
//     if (!id) {
//       return res.status(400).render("error", {
//         error: "Employee ID is required",
//       });
//     }

//     // Query to get employee details
//     // const [employee] = await db.query(
//     //   `
//     //   SELECT e.*, o.office_name, p.position_name
//     //   FROM employees e
//     //   LEFT JOIN offices o ON e.office_id = o.id
//     //   LEFT JOIN positions p ON e.position_id = p.id
//     //   WHERE e.id = ?
//     // `,
//     let employeeQuery = "";
//     let dbConnection = "";
//     if (office.toLowerCase() === "vismin") {
//       employeeQuery = `SELECT
//   m.employeeid,
//   IFNULL(r.regionname, '') AS region,
//   IFNULL(a.area_name, '') AS area_name,
//   IFNULL(b.branchname, '') AS branch,
//   IFNULL(m.employeelname, '') AS employeelname,
//   IFNULL(m.employeefname, '') AS employeefname,
//   IFNULL(m.employeemi, '') AS employeemi,
//   IFNULL(m.employeeaddress, '') AS employeeaddress,
//   IFNULL(m.employeecontactno, '') AS employeecontactno,
//   IFNULL(m.employeegender, '') AS employeegender,
//   IFNULL(m.employeestatus, '') AS employeestatus,
//   IFNULL(DATE_FORMAT(m.employeebdate, '%M %d, %Y'), '') AS employeebdate,
//   IFNULL(m.employeebplace, '') AS employeebplace,
//   IFNULL(m.employeereligion, '') AS employeereligion,
//   IFNULL(m.employeedesignation, '') AS employeedesignation,
//   IFNULL(m.employeesss, '') AS employeesss,
//   IFNULL(m.employeetin, '') AS employeetin,
//   IFNULL(DATE_FORMAT(m.employeedateemp, '%M %d, %Y'), '') AS employeedateemp,
//   IFNULL(DATE_FORMAT(m.empresigndate, '%M %d, %Y'), '') AS empresigndate,
//   IFNULL(m.employeepagibig, '') AS employeepagibig,
//   IFNULL(m.employeephilhealth, '') AS employeephilhealth,
//   IFNULL(rk.rankname, '') AS ranking,
//   IFNULL(m.employeespouse, '') AS employeespouse,
//   IFNULL(m.employeespousework, '') AS employeespousework,
//   IFNULL(m.employeefathersname, '') AS employeefathersname,
//   IFNULL(m.employeefatherswork, '') AS employeefatherswork,
//   IFNULL(m.employeemothersname, '') AS employeemothersname,
//   IFNULL(m.employeemotherswork, '') AS employeemotherswork,
//   IFNULL(m.employeeschool1, '') AS employeeschool1,
//   IFNULL(m.employeeaddress1, '') AS employeeaddress1,
//   IFNULL(m.employeescyear1, '') AS employeescyear1,
//   IFNULL(m.employeeschool2, '') AS employeeschool2,
//   IFNULL(m.employeeaddress2, '') AS employeeaddress2,
//   IFNULL(m.employeescyear2, '') AS employeescyear2,
//   IFNULL(m.employeeschool3, '') AS employeeschool3,
//   IFNULL(m.employeeaddress3, '') AS employeeaddress3,
//   IFNULL(m.employeescyear3, '') AS employeescyear3,
//   IFNULL(m.employeeschool4, '') AS employeeschool4,
//   IFNULL(m.employeeaddress4, '') AS employeeaddress4,
//   employeeempstat,
//   IFNULL(m.employmentstatus, '') AS employmentstatus,
//   IFNULL(m.empresigndate, '') AS empresigndate_raw
// FROM
//   master m
// LEFT JOIN region r ON r.regionid = m.employeeregion
// LEFT JOIN areas a ON a.areaid = m.employeeareamngr
// LEFT JOIN branch b ON b.branchcode = m.employeebranch
// LEFT JOIN rank rk ON rk.rankid = m.employeeranking
// WHERE
//   m.employeeid = ?;

// `;
//       dbConnection = db.visminRec;
//     } else if (office.toLowerCase() === "ml group") {
//       employeeQuery = `SELECT
//   m.employeeid,
//   IFNULL(r.regionname, '') AS region,
//   IFNULL(a.areaname, '') AS area_name,
//   IFNULL(b.branchname, '') AS branch,
//   IFNULL(m.employeelname, '') AS employeelname,
//   IFNULL(m.employeefname, '') AS employeefname,
//   IFNULL(m.employeemi, '') AS employeemi,
//   IFNULL(m.employeeaddress, '') AS employeeaddress,
//   IFNULL(m.employeecontactno, '') AS employeecontactno,
//   IFNULL(m.employeegender, '') AS employeegender,
//   IFNULL(m.employeestatus, '') AS employeestatus,
//   IFNULL(DATE_FORMAT(m.employeebdate, '%M %d, %Y'), '') AS employeebdate,
//   IFNULL(m.employeebplace, '') AS employeebplace,
//   IFNULL(m.employeereligion, '') AS employeereligion,
//   IFNULL(m.employeedesignation, '') AS employeedesignation,
//   IFNULL(m.employeesss, '') AS employeesss,
//   IFNULL(m.employeetin, '') AS employeetin,
//   IFNULL(DATE_FORMAT(m.employeedateemp, '%M %d, %Y'), '') AS employeedateemp,
//   IFNULL(DATE_FORMAT(m.empresigndate, '%M %d, %Y'), '') AS empresigndate,
//   IFNULL(m.employeepagibig, '') AS employeepagibig,
//   IFNULL(m.employeephilhealth, '') AS employeephilhealth,
//   IFNULL(rk.rankname, '') AS ranking,
//   IFNULL(m.employeespouse, '') AS employeespouse,
//   IFNULL(m.employeespousework, '') AS employeespousework,
//   IFNULL(m.employeefathersname, '') AS employeefathersname,
//   IFNULL(m.employeefatherswork, '') AS employeefatherswork,
//   IFNULL(m.employeemothersname, '') AS employeemothersname,
//   IFNULL(m.employeemotherswork, '') AS employeemotherswork,
//   IFNULL(m.employeeschool1, '') AS employeeschool1,
//   IFNULL(m.employeeaddress1, '') AS employeeaddress1,
//   IFNULL(m.employeescyear1, '') AS employeescyear1,
//   IFNULL(m.employeeschool2, '') AS employeeschool2,
//   IFNULL(m.employeeaddress2, '') AS employeeaddress2,
//   IFNULL(m.employeescyear2, '') AS employeescyear2,
//   IFNULL(m.employeeschool3, '') AS employeeschool3,
//   IFNULL(m.employeeaddress3, '') AS employeeaddress3,
//   IFNULL(m.employeescyear3, '') AS employeescyear3,
//   IFNULL(m.employeeschool4, '') AS employeeschool4,
//   IFNULL(m.employeeaddress4, '') AS employeeaddress4,
//   employeeempstat,
//   IFNULL(m.employmentstatus, '') AS employmentstatus,
//   IFNULL(m.empresigndate, '') AS empresigndate_raw
// FROM
//   master m
// LEFT JOIN region r ON r.regionid = m.employeeregion
// LEFT JOIN areas a ON a.areaid = m.employeeareamngr
// LEFT JOIN branch b ON b.branchcode = m.employeebranch
// LEFT JOIN rank rk ON rk.rankid = m.employeeranking
// WHERE
//   m.employeeid = ?;`;
//       dbConnection = db.mlgroup; // Set the correct database connection for ML group
//     } else if (office.toLowerCase() === "luzon") {
//       employeeQuery = `SELECT
//   idno as employeeid,
//   IFNULL(level3, '') AS region,
//   IFNULL(level4, '') AS area_name,
//   IFNULL(level5, '') AS branch,
//   IFNULL(last_name, '') AS employeelname,
//   IFNULL(first_name, '') AS employeefname,
//   IFNULL(fore_name, '') AS employeemi,
//   IFNULL(res_address1, '') AS employeeaddress,
//   IFNULL(employee_mobile, '') AS employeecontactno,
//   IFNULL(gender, '') AS employeegender,
//   IFNULL(marital_status, '') AS employeestatus,
//   IFNULL(DATE_FORMAT(birth_date, '%M %d, %Y'), '') AS employeebdate,
//   '' AS employeebplace,
//   IFNULL(religion, '') AS employeereligion,
//   IFNULL(designation, '') AS employeedesignation,
//   IFNULL(sss_number, '') AS employeesss,
//   IFNULL(tin, '') AS employeetin,
//   IFNULL(DATE_FORMAT(hired_date, '%M %d, %Y'), '') AS employeedateemp,
//   IFNULL(DATE_FORMAT(resigned_date, '%M %d, %Y'), '') AS empresigndate,
//   IFNULL(pagibig_number, '') AS employeepagibig,
//   IFNULL(philhealth_number, '') AS employeephilhealth,
//   IFNULL(job_category, '') AS ranking,
//   '' AS employeespouse,
//   '' AS employeespousework,
//   '' AS employeefathersname,
//   '' AS employeefatherswork,
//   '' AS employeemothersname,
//   '' AS employeemotherswork,
//   '' AS employeeschool1,
//   '' AS employeeaddress1,
//   '' AS employeescyear1,
//   '' AS employeeschool2,
//   '' AS employeeaddress2,
//   '' AS employeescyear2,
//   '' AS employeeschool3,
//   '' AS employeeaddress3,
//   '' AS employeescyear3,
//   '' AS employeeschool4,
//   '' AS employeeaddress4,
//   IF(resigned_date IS NULL OR resigned_date = '0000-00-00', 1, 2) as employeeempstat,
//   IF(resigned_date IS NULL OR resigned_date = '0000-00-00', 1, 2) AS employmentstatus,
//   IFNULL(resigned_date, '') AS empresigndate_raw
// FROM
//   luzon_employees m
// WHERE
//   idno = ?;

// `;
//       dbConnection = db.visminRec;
//     }
//     if (!dbConnection) {
//       return res
//         .status(400)
//         .render("error", { error: "Invalid office provided." });
//     }
//     const [employee] = await dbConnection.query(employeeQuery, [id]);

//     if (!employee.length) {
//       return res.status(404).render("error", {
//         error: "Employee not found",
//       });
//     }

//     res.render("employeedetails", {
//       title: "Employee Details",
//       employee: employee[0],
//       username: req.session.user.username,
//     });
//   } catch (error) {
//     console.error("Error fetching employee details:", error);
//     res.status(500).render("error", {
//       error: "Error loading employee details",
//     });
//   }
// }

// // Add to your exports
// module.exports = {
//   searchEmployees,
//   getEmployeeDetails,
// };

const db = require('../config/db');
const dashboardModel = require('../models/dashboardModel');

async function searchEmployees(req, res) {
  // Removed `status` param — we now fetch ALL employees regardless of status
  const { office, idno, lastName, firstName, middleName, page = 1 } = req.query;
  const limit = 10;
  const offset = (page - 1) * limit;

  if (!office) {
    return res.json({ success: false, message: 'Please select an office.' });
  }

  try {
    const { results, totalPages } = await dashboardModel.searchEmployees(
      office,
      idno,
      lastName,
      firstName,
      middleName,
      limit,
      offset,
    );

    res.json({
      success: true,
      employees: results,
      totalPages,
      currentPage: Number(page),
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.json({ success: false, message: 'Error fetching employees.' });
  }
}

async function getEmployeeDetails(req, res) {
  try {
    const { id, office } = req.query;

    if (!id) {
      return res.status(400).render('error', { error: 'Employee ID is required' });
    }

    let employeeQuery = '';
    let dbConnection = '';

    if (office.toLowerCase() === 'vismin') {
      employeeQuery = `
        SELECT 
          m.employeeid,
          IFNULL(r.regionname, '')                          AS region,
          IFNULL(r.region_manager, '')                          AS regionmanager,
          IFNULL(a.area_name, '')                           AS area_name,
          IFNULL(a.area_manager, '')                            AS area_manager,
          IFNULL(b.branchname, '')                          AS branch,
          IFNULL(m.employeelname, '')                       AS employeelname,
          IFNULL(m.employeefname, '')                       AS employeefname,
          IFNULL(m.employeemi, '')                          AS employeemi,
          IFNULL(m.employee_address, '')                     AS employeeaddress,
          IFNULL(m.employeecontactno, '')                   AS employeecontactno,
          IFNULL(m.employeegender, '')                      AS employeegender,
          IFNULL(m.employeestatus, '')                      AS employeestatus,
          IFNULL(DATE_FORMAT(m.employeebdate, '%M %d, %Y'), '') AS employeebdate,
          IFNULL(m.employeebplace, '')                      AS employeebplace,
          IFNULL(m.employeereligion, '')                    AS employeereligion,
          IFNULL(m.employeedesignation, '')                 AS employeedesignation,
          IFNULL(m.employeesss, '')                         AS employeesss,
          IFNULL(m.employeetin, '')                         AS employeetin,
          IFNULL(DATE_FORMAT(m.employeedateemp, '%M %d, %Y'), '') AS employeedateemp,
          IFNULL(DATE_FORMAT(m.empresigndate, '%M %d, %Y'), '')   AS empresigndate,
          IFNULL(m.employeepagibig, '')                     AS employeepagibig,
          IFNULL(m.employeephilhealth, '')                  AS employeephilhealth,
          IFNULL(rk.rankname, '')                           AS ranking,
          IFNULL(m.employeespouse, '')                      AS employeespouse,
          IFNULL(m.employeespousework, '')                  AS employeespousework,
          IFNULL(m.employeefathersname, '')                 AS employeefathersname,
          IFNULL(m.employeefatherswork, '')                 AS employeefatherswork,
          IFNULL(m.employeemothersname, '')                 AS employeemothersname,
          IFNULL(m.employeemotherswork, '')                 AS employeemotherswork,
          IFNULL(m.employeeschool1, '')                     AS employeeschool1,
          IFNULL(m.employeeaddress1, '')                    AS employeeaddress1,
          IFNULL(m.employeescyear1, '')                     AS employeescyear1,
          IFNULL(m.employeeschool2, '')                     AS employeeschool2,
          IFNULL(m.employeeaddress2, '')                    AS employeeaddress2,
          IFNULL(m.employeescyear2, '')                     AS employeescyear2,
          IFNULL(m.employeeschool3, '')                     AS employeeschool3,
          IFNULL(m.employeeaddress3, '')                    AS employeeaddress3,
          IFNULL(m.employeescyear3, '')                     AS employeescyear3,
          IFNULL(m.employeeschool4, '')                     AS employeeschool4,
          IFNULL(m.employeeaddress4, '')                    AS employeeaddress4,
          employeeempstat,
          IFNULL(m.employmentstatus, '')                    AS employmentstatus,
          IFNULL(m.empresigndate, '')                       AS empresigndate_raw,
          IFNULL(m.walletno, '')                       AS walletno,
          IFNULL(m.employeesalary, '')                       AS employeesalary,
          IFNULL(m.email, '')                       AS email
        FROM master m
        LEFT JOIN region r  ON r.regionid  = m.employeeregion
        LEFT JOIN areas  a  ON a.areaid    = m.employeeareamngr
        LEFT JOIN branch b  ON b.branchcode= m.employeebranch
        LEFT JOIN rank   rk ON rk.rankid   = m.employeeranking
        WHERE m.employeeid = ?
      `;
      dbConnection = db.visminRec;
      //    } else if (office.toLowerCase() === 'ml group') {
    } else if (office.toLowerCase() === 'mlinc') {
      employeeQuery = `
        SELECT 
          m.employeeid,
          IFNULL(r.regionname, '')                          AS region,
          IFNULL(r.region_manager, '')                          AS regionmanager,
          IFNULL(a.areaname, '')                            AS area_name,
          IFNULL(a.area_manager, '')                            AS area_manager,
          IFNULL(b.branchname, '')                          AS branch,
          IFNULL(m.employeelname, '')                       AS employeelname,
          IFNULL(m.employeefname, '')                       AS employeefname,
          IFNULL(m.employeemi, '')                          AS employeemi,
          IFNULL(m.employeeaddress, '')                     AS employeeaddress,
          IFNULL(m.employeecontactno, '')                   AS employeecontactno,
          IFNULL(m.employeegender, '')                      AS employeegender,
          IFNULL(m.employeestatus, '')                      AS employeestatus,
          IFNULL(DATE_FORMAT(m.employeebdate, '%M %d, %Y'), '') AS employeebdate,
          IFNULL(m.employeebplace, '')                      AS employeebplace,
          IFNULL(m.employeereligion, '')                    AS employeereligion,
          IFNULL(m.employeedesignation, '')                 AS employeedesignation,
          IFNULL(m.employeesss, '')                         AS employeesss,
          IFNULL(m.employeetin, '')                         AS employeetin,
          IFNULL(DATE_FORMAT(m.employeedateemp, '%M %d, %Y'), '') AS employeedateemp,
          IFNULL(DATE_FORMAT(m.empresigndate, '%M %d, %Y'), '')   AS empresigndate,
          IFNULL(m.employeepagibig, '')                     AS employeepagibig,
          IFNULL(m.employeephilhealth, '')                  AS employeephilhealth,
          IFNULL(rk.rankname, '')                           AS ranking,
          IFNULL(m.employeespouse, '')                      AS employeespouse,
          IFNULL(m.employeespousework, '')                  AS employeespousework,
          IFNULL(m.employeefathersname, '')                 AS employeefathersname,
          IFNULL(m.employeefatherswork, '')                 AS employeefatherswork,
          IFNULL(m.employeemothersname, '')                 AS employeemothersname,
          IFNULL(m.employeemotherswork, '')                 AS employeemotherswork,
          IFNULL(m.employeeschool1, '')                     AS employeeschool1,
          IFNULL(m.employeeaddress1, '')                    AS employeeaddress1,
          IFNULL(m.employeescyear1, '')                     AS employeescyear1,
          IFNULL(m.employeeschool2, '')                     AS employeeschool2,
          IFNULL(m.employeeaddress2, '')                    AS employeeaddress2,
          IFNULL(m.employeescyear2, '')                     AS employeescyear2,
          IFNULL(m.employeeschool3, '')                     AS employeeschool3,
          IFNULL(m.employeeaddress3, '')                    AS employeeaddress3,
          IFNULL(m.employeescyear3, '')                     AS employeescyear3,
          IFNULL(m.employeeschool4, '')                     AS employeeschool4,
          IFNULL(m.employeeaddress4, '')                    AS employeeaddress4,
          employeeempstat,
          IFNULL(m.employmentstatus, '')                    AS employmentstatus,
          IFNULL(m.empresigndate, '')                       AS empresigndate_raw,
          IFNULL(m.walletno, '')                       AS walletno,
          IFNULL(m.employeesalary, '')                       AS employeesalary,
          IFNULL(m.email, '')                       AS email
        FROM master m
        LEFT JOIN region r  ON r.regionid  = m.employeeregion
        LEFT JOIN areas  a  ON a.areaid    = m.employeeareamngr
        LEFT JOIN branch b  ON b.branchcode= m.employeebranch
        LEFT JOIN rank   rk ON rk.rankid   = m.employeeranking
        WHERE m.employeeid = ?
      `;
      dbConnection = db.mlgroup;
    } else if (office.toLowerCase() === 'luzon') {
      employeeQuery = `
        SELECT 
          idno                                                    AS employeeid,
          IFNULL(level3, '')                                      AS region,
          IFNULL(level4, '')                                      AS area_name,
          IFNULL(level5, '')                                      AS branch,
          IFNULL(lastname, '')                                   AS employeelname,
          IFNULL(firstname, '')                                  AS employeefname,
          IFNULL(fore_name, '')                                   AS employeemi,
          IFNULL(res_address1, '')                                AS employeeaddress,
          IFNULL(employee_mobile, '')                             AS employeecontactno,
          IFNULL(gender, '')                                      AS employeegender,
          IFNULL(marital_status, '')                              AS employeestatus,
          IFNULL(DATE_FORMAT(birth_date, '%M %d, %Y'), '')        AS employeebdate,
          ''                                                      AS employeebplace,
          IFNULL(religion, '')                                    AS employeereligion,
          IFNULL(designation, '')                                 AS employeedesignation,
          IFNULL(sss_number, '')                                  AS employeesss,
          IFNULL(tin, '')                                         AS employeetin,
          IFNULL(DATE_FORMAT(hired_date, '%M %d, %Y'), '')        AS employeedateemp,
          IFNULL(DATE_FORMAT(resigned_date, '%M %d, %Y'), '')     AS empresigndate,
          IFNULL(pagibig_number, '')                              AS employeepagibig,
          IFNULL(philhealth_number, '')                           AS employeephilhealth,
          IFNULL(job_category, '')                                AS ranking,
          '' AS employeespouse,    '' AS employeespousework,
          '' AS employeefathersname, '' AS employeefatherswork,
          '' AS employeemothersname, '' AS employeemotherswork,
          '' AS employeeschool1,   '' AS employeeaddress1, '' AS employeescyear1,
          '' AS employeeschool2,   '' AS employeeaddress2, '' AS employeescyear2,
          '' AS employeeschool3,   '' AS employeeaddress3, '' AS employeescyear3,
          '' AS employeeschool4,   '' AS employeeaddress4,
          IF(resigned_date IS NULL OR resigned_date = '0000-00-00', 1, 2) AS employeeempstat,
          IF(resigned_date IS NULL OR resigned_date = '0000-00-00', 1, 2) AS employmentstatus,
          IFNULL(resigned_date, '')                               AS empresigndate_raw
        FROM hr_employees_luzon
        WHERE idno = ?
      `;
      dbConnection = db.visminRec;
    }

    if (!dbConnection) {
      return res.status(400).render('error', { error: 'Invalid office provided.' });
    }

    const [employee] = await dbConnection.query(employeeQuery, [id]);

    if (!employee.length) {
      return res.status(404).render('error', { error: 'Employee not found' });
    }

    res.render('employeedetails', {
      title: 'Employee Details',
      employee: employee[0],
      office,
      firstName: req.session.user.firstName,
      lastName: req.session.user.lastName,
      designation: req.session.user.designation,
    });
  } catch (error) {
    console.error('Error fetching employee details:', error);
    res.status(500).render('error', { error: 'Error loading employee details' });
  }
}

module.exports = { searchEmployees, getEmployeeDetails };
