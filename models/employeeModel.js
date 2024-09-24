const connectDB = require("../config/db");

// ----------------------------------------- GETTING OFFICE VALUES FOR DB CONNECTION AND FOR TABLE NAME -----------------------------------------
const getDBForOffice = (office) => {
  console.log(typeof office, office);
  if (office.toLowerCase().includes("luzon")) {
    return {
      dbName: "luzon",
      query: `SELECT idno as employeeid, lastname as employeelname, firstname as employeefname, middlename as mi, if(dateresigned is null, 1,0) as employeeempstat, 'luzon' as office  
              FROM hris201_payroll 
              WHERE lastname LIKE ? OR firstname LIKE ? OR middlename LIKE ? OR idno LIKE ? 
              
              ORDER BY lastname, firstname 
              LIMIT ? OFFSET ?;`,
      detailsQuery: `SELECT idno AS employeeid, region, '' AS areamanager, branch AS 'branch', lastname AS employeelname, firstname AS employeefname, 
                     middlename AS employeemi, address AS employeeaddress, mobileno AS employeecontactno, gender AS employeegender, civilstatus AS employeestatus, 
                     DATE_FORMAT(birthdate, '%M %d, %Y') AS employeebdate, '' AS employeebplace, '' AS employeereligion, POSITION AS employeedesignation, 
                     sss AS employeesss, tin AS employeetin, DATE_FORMAT(datehired, '%M %d, %Y') AS employeedateemp, DATE_FORMAT(dateresigned, '%M %d, %Y') AS empresigndate, 
                     pagibig AS employeepagibig, philhealth AS employeephilhealth, empstatus AS ranking, '' AS employeespouse, '' AS employeespousework, '' AS employeefathersname, 
                     '' AS employeefatherswork, '' AS employeemothersname, '' AS employeemotherswork, '' AS employeeschool1, '' AS employeeaddress1, '' AS employeescyear1, 
                     '' AS employeeschool2, '' AS employeeaddress2, '' AS employeescyear2, '' AS employeeschool3, '' AS employeeaddress3, '' AS employeescyear3, '' AS employeeschool4, 
                     '' AS employeeaddress4, IF(dateresigned IS NULL, 1,0) AS employeeempstat  
                     FROM hris201_payroll 
                     WHERE idno = ?;`,
    };
  } else if (office.toLowerCase().includes("vismin")) {
    return {
      dbName: "vismin",
      query: `SELECT *, 'vismin' as office 
              FROM master 
              WHERE employeelname LIKE ? OR employeefname LIKE ? OR employeemi LIKE ? OR employeeid LIKE ? 
              ORDER BY employeelname, employeefname 
              LIMIT ? OFFSET ?;`,
      detailsQuery: `SELECT employeeid, (SELECT regionname FROM region WHERE regionid = employeeregion) AS region, 
                     (SELECT areaname FROM areas WHERE areaid = employeeareamngr) AS areamanager, 
                     (SELECT branchname FROM branch WHERE branchcode = employeebranch) AS 'branch', 
                     employeelname, employeefname, employeemi, employeeaddress, employeecontactno, employeegender, employeestatus, 
                     DATE_FORMAT(employeebdate, '%M %d, %Y') as employeebdate, employeebplace, employeereligion, employeedesignation, 
                     employeesss, employeetin, DATE_FORMAT(employeedateemp, '%M %d, %Y') as employeedateemp, DATE_FORMAT(empresigndate, '%M %d, %Y') as empresigndate, 
                     employeepagibig, employeephilhealth, (SELECT rankname FROM rank WHERE rankid = employeeranking) AS ranking, 
                     employeespouse, employeespousework, employeefathersname, employeefatherswork, employeemothersname, employeemotherswork, 
                     employeeschool1, employeeaddress1, employeescyear1, employeeschool2, employeeaddress2, employeescyear2, employeeschool3, employeeaddress3, employeescyear3, employeeschool4, employeeaddress4, employeeempstat 
                     FROM master 
                     WHERE employeeid = ?;`,
    };
  } else if (office.toLowerCase().includes("ml group")) {
    return {
      dbName: "mlgroup",
      query: `SELECT *, 'ml group' as office 
              FROM master 
              WHERE employeelname LIKE ? OR employeefname LIKE ? OR employeemi LIKE ? OR employeeid LIKE ? 
              ORDER BY employeelname, employeefname 
              LIMIT ? OFFSET ?;`,
      detailsQuery: `SELECT employeeid, (SELECT regionname FROM region WHERE regionid = employeeregion) AS region, 
                     (SELECT areaname FROM areas WHERE areaid = employeeareamngr) AS areamanager, 
                     (SELECT branchname FROM branch WHERE branchcode = employeebranch) AS 'branch', 
                     employeelname, employeefname, employeemi, employeeaddress, employeecontactno, employeegender, employeestatus, 
                     DATE_FORMAT(employeebdate, '%M %d, %Y') as employeebdate, employeebplace, employeereligion, employeedesignation, 
                     employeesss, employeetin, DATE_FORMAT(employeedateemp, '%M %d, %Y') as employeedateemp, DATE_FORMAT(empresigndate, '%M %d, %Y') as empresigndate, 
                     employeepagibig, employeephilhealth, (SELECT rankname FROM rank WHERE rankid = employeeranking) AS ranking, 
                     employeespouse, employeespousework, employeefathersname, employeefatherswork, employeemothersname, employeemotherswork, 
                     employeeschool1, employeeaddress1, employeescyear1, employeeschool2, employeeaddress2, employeescyear2, employeeschool3, employeeaddress3, employeescyear3, employeeschool4, employeeaddress4, employeeempstat 
                     FROM master 
                     WHERE employeeid = ?;`,
    };
  } else {
    throw new Error("Unknown office.");
  }
};
// ----------------------------------------- GETTING OFFICE VALUES FOR DB CONNECTION AND FOR TABLE NAME ----------------------------------------- //

// ----------------------------------------- SEARCH EMPLOYEES BY NAME OR ID WITH PAGINATION (LIMIT & OFFSET) -----------------------------------------
const searchEmployees = async (searchTerm, office, limit, offset) => {
  const dbName = getDBForOffice(office.toLowerCase()); // Determine which database to connect to

  const db = connectDB.connectDBRecords(dbName.dbName); // Connect to the correct database

  const query = dbName.query; // Use the correct query for the office

  return new Promise((resolve, reject) => {
    db.query(
      query,
      [
        `%${searchTerm}%`, // Use search term for employee last name
        `%${searchTerm}%`, // Use search term for employee first name
        `%${searchTerm}%`, // Use search term for employee middle name
        `%${searchTerm}%`, // Use search term for employee ID
        limit, // Limit the number of results per page
        offset, // Offset to skip results for pagination
      ],
      (err, results) => {
        if (err) return reject(err);

        resolve(results);
      }
    );
  });
};
// ----------------------------------------- SEARCH EMPLOYEES BY NAME OR ID WITH PAGINATION (LIMIT & OFFSET) -----------------------------------------

// ----------------------------------------- COUNT EMPLOYEES BY SEARCH TERM/FILTERS AND OFFICE ----------------------------------------- //
// Count employees by search term and office
const countEmployees = async (searchTerm, office) => {
  const dbName = getDBForOffice(office.toLowerCase());

  const db = connectDB.connectDBRecords(dbName.dbName);

  const query = `
    SELECT COUNT(*) AS total 
    FROM 201file.master
    WHERE employeelname LIKE ? 
    OR employeefname LIKE ? 
    OR employeemi LIKE ? 
    OR employeeid LIKE ?;
  `;

  return new Promise((resolve, reject) => {
    db.query(
      query,
      [
        `%${searchTerm}%`,
        `%${searchTerm}%`,
        `%${searchTerm}%`,
        `%${searchTerm}%`,
      ],
      (err, results) => {
        if (err) return reject(err);

        resolve(results[0].total); // Return the total count of employees
      }
    );
  });
};
// ----------------------------------------- COUNT EMPLOYEES BY SEARCH TERM/FILTERS AND OFFICE ----------------------------------------- //

// ----------------------------------------- GET EMPLOYEE BY ID ----------------------------------------- //
const getEmployeeById = async (id, office) => {
  const dbName = getDBForOffice(office.toLowerCase());
  const db = connectDB.connectDBRecords(dbName.dbName);

  return new Promise((resolve, reject) => {
    db.query(dbName.detailsQuery, [id], (err, results) => {
      if (err) return reject(err);

      if (results.length === 0) {
        return resolve(null); // No employee found
      }

      resolve(results[0]); // Return the first employee result
    });
  });
};
// ----------------------------------------- GET EMPLOYEE BY ID ----------------------------------------- //

module.exports = {
  searchEmployees,
  getEmployeeById,
  countEmployees, // Export the new count function
};
