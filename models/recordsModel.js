// const utilitiesModel = require('./utilitiesModel');
// const db = require('../config/db');

// /**
//  * Insert new employee record
//  * @param {Object} employeeData
//  */
// const createEmployee = async (employeeData) => {
//   const {
//     idno,
//     lastname,
//     firstname,
//     middle_initial,
//     office,
//     region,
//     branch,
//     employment_status,
//     designation,
//     date_hired,
//     marital_status,
//   } = employeeData;

//   // Get correct DB pool based on office
//   const pool = utilitiesModel.getDbPool(office);

//   if (!pool) {
//     throw new Error('Invalid office database pool');
//   }

//   /**
//    * ⚠️ Adjust table & column names as needed
//    * This matches your payroll employee naming convention
//    */
//   const insertQuery = `
//     INSERT INTO main_employees (
//       E_IDNO,
//       E_LN,
//       E_FN,
//       E_MI,
//       E_OFFICE,
//       E_REGION,
//       E_BRANCH,
//       E_COMPSTAT,
//       E_DESIGNATION,
//       E_DATEHIRED,
//       E_MARITAL_STATUS
//     )
//     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//   `;

//   const values = [
//     idno,
//     lastname,
//     firstname,
//     middle_initial || null,
//     office,
//     region,
//     branch,
//     employment_status,
//     designation,
//     date_hired,
//     marital_status,
//   ];

//   const [result] = await pool.query(insertQuery, values);

//   return result;
// };

// /**
//  * Check if employee ID already exists
//  * (Recommended before insert)
//  */
// const employeeExists = async (idno, office) => {
//   const pool = utilitiesModel.getDbPool(office);

//   if (!pool) {
//     throw new Error('Invalid office database pool');
//   }

//   const query = `
//     SELECT 1
//     FROM main_employees
//     WHERE E_IDNO = ?
//     LIMIT 1
//   `;

//   const [rows] = await pool.query(query, [idno]);
//   return rows.length > 0;
// };

// //START EMPLOYEE ENTRY
// function officeHasApplicantModule(office) {
//   const normalizedOffice = String(office || '').toLowerCase();

//   const applicantConfig = {
//     vismin: true,
//     luzon: false,
//     'ml group': false,
//   };

//   return applicantConfig[normalizedOffice] === true;
// }

// async function searchApplicants({ office, keyword }) {
//   if (!officeHasApplicantModule(office)) {
//     return [];
//   }

//   const dbPool = getRecordsDbPool('default');
//   const searchKeyword = `%${keyword}%`;

//   const [rows] = await dbPool.query(
//     `
//     SELECT
//       applicantid,
//       lastname,
//       firstname,
//       middlename,
//       examdate,
//       onboarded
//     FROM recruitment_applicantinfo
//     WHERE lastname LIKE ?
//        OR firstname LIKE ?
//        OR middlename LIKE ?
//     ORDER BY lastname, firstname
//     LIMIT 50
//     `,
//     [searchKeyword, searchKeyword, searchKeyword],
//   );

//   return rows.map((row) => ({
//     ...row,
//     canProceed: Number(row.onboarded) === 0,
//   }));
// }

// async function getApplicantById({ office, applicantId }) {
//   if (!officeHasApplicantModule(office)) {
//     return null;
//   }

//   //const dbPool = getRecordsDbPool(office);
//   const dbPool = getRecordsDbPool('default');

//   const [rows] = await dbPool.query(
//     `
//     SELECT
//       applicantid,
//       lastname,
//       firstname,
//       middlename,
//       birthdate,
//       currentaddress as address,
//       onboarded
//     FROM recruitment_applicantinfo
//     WHERE applicantid = ?
//     LIMIT 1
//     `,
//     [applicantId],
//   );

//   return rows[0] || null;
// }
// //END EMPLOYEE ENTRY

// //START SAVE EMPLOYEE
// // async function generateEmployeeId(office) {
// //   const dbPool = getRecordsDbPool(office);

// //   const [lastEmployee] = await dbPool.query(
// //     `
// //     SELECT employeeid
// //     FROM master
// //     ORDER BY empcounter DESC
// //     LIMIT 1
// //     `,
// //   );

// //   const currentYear = new Date().getFullYear().toString();

// //   if (lastEmployee.length === 0) {
// //     return `${currentYear}5001`;
// //   }

// //   const lastId = String(lastEmployee[0].employeeid);
// //   const yearId = lastId.substring(0, 4);
// //   const countId = parseInt(lastId.substring(4), 10);

// //   if (yearId === currentYear) {
// //     if (countId <= 9995) {
// //       return `${yearId}${String(countId + 3).padStart(4, '0')}`;
// //     }

// //     return `${yearId}000${Math.floor(Math.random() * 9) + 1}`;
// //   }

// //   if (countId <= 9995) {
// //     return `${currentYear}${String(countId + 3).padStart(4, '0')}`;
// //   }

// //   return `${currentYear}000${Math.floor(Math.random() * 9) + 1}`;
// // }

// // function getEmployeeTable(office) {
// //   return String(office || '')
// //     .trim()
// //     .toLowerCase() === 'mlinc'
// //     ? 'hr_employees_mlinc'
// //     : 'master';
// // }

// function getEmployeeTableConfig(office) {
//   const normalizedOffice = String(office || '')
//     .trim()
//     .toLowerCase();

//   if (normalizedOffice === 'mlinc') {
//     return {
//       employeeTable: 'hr_employees_mlinc',
//       regionTable: 'hr_employees_mlinc_regions',
//       areaTable: 'hr_employees_mlinc_areas',
//       branchTable: 'hr_employees_mlinc_branches',
//       rankTable: 'hr_employees_mlinc_ranks',
//     };
//   }

//   return {
//     employeeTable: 'master',
//     regionTable: 'region',
//     areaTable: 'areas',
//     branchTable: 'branch',
//     rankTable: 'rank',
//   };
// }

// async function generateEmployeeId(office) {
//   const dbPool = getRecordsDbPool(office);

//   const { employeeTable } = getEmployeeTableConfig(office);

//   const [lastEmployee] = await dbPool.query(
//     `
//     SELECT employeeid
//     FROM ${employeeTable}
//     ORDER BY empcounter DESC
//     LIMIT 1
//     `,
//   );

//   const currentYear = new Date().getFullYear().toString();

//   if (lastEmployee.length === 0) {
//     return `${currentYear}5001`;
//   }

//   const lastId = String(lastEmployee[0].employeeid);
//   const yearId = lastId.substring(0, 4);
//   const countId = parseInt(lastId.substring(4), 10);

//   if (yearId === currentYear) {
//     if (countId <= 9995) {
//       return `${yearId}${String(countId + 3).padStart(4, '0')}`;
//     }

//     return `${yearId}000${Math.floor(Math.random() * 9) + 1}`;
//   }

//   if (countId <= 9995) {
//     return `${currentYear}${String(countId + 3).padStart(4, '0')}`;
//   }

//   return `${currentYear}000${Math.floor(Math.random() * 9) + 1}`;
// }

// // async function saveEmployeeToMaster(employeeData) {
// //   console.log('--------------- ', employeeData.office);
// //   const dbPool = getRecordsDbPool(employeeData.office);

// //   const newId = await generateEmployeeId(employeeData.office);

// //   const trimmedLastName = String(employeeData.lastName || '').trim();
// //   const trimmedFirstName = String(employeeData.firstName || '').trim();
// //   const trimmedMiddleInitial = String(employeeData.middleInitial || '').trim();

// //   const now = new Date();

// //   const insertMaster = `
// //     INSERT INTO master
// //     (
// //       employeeid,
// //       employeelname,
// //       employeefname,
// //       employeemi,
// //       employee_address,
// //       employeedesignation,
// //       designation_id,
// //       employeeregion,
// //       employeeareamngr,
// //       employeebranch,
// //       employeedateemp,
// //       employeeranking,
// //       employmentstatus,
// //       empresigndate,
// //       employeetelno,
// //       employeecontactno,
// //       email,
// //       employeegender,
// //       employeestatus,
// //       employeebdate,
// //       employeebplace,
// //       employeereligion,
// //       employeespouse,
// //       employeespousework,
// //       employeefathersname,
// //       employeefatherswork,
// //       employeemothersname,
// //       employeemotherswork,
// //       employeeschool1,
// //       employeeaddress1,
// //       employeescyear1,
// //       employeeschool2,
// //       employeeaddress2,
// //       employeescyear2,
// //       employeeschool3,
// //       employeeaddress3,
// //       employeeschool4,
// //       employeescyear4,
// //       employeesss,
// //       employeepagibig,
// //       employeeTIN,
// //       walletno,
// //       employeesalary,
// //       employeedegree1,
// //       employeedegree2,
// //       employeedegree3,
// //       employeedegree4,
// //       employeeempstat,
// //       employeePhilhealth,
// //       collegeDegree,
// //       employeescyear3,
// //       syscreated,
// //       employeeaddress4,
// //       employment_status
// //     )
// //     VALUES
// // (
// //   ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
// //   ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
// //   ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
// // )
// //   `;

// //   const values = [
// //     newId,
// //     trimmedLastName,
// //     trimmedFirstName,
// //     trimmedMiddleInitial,
// //     employeeData.address || null,
// //     String(employeeData.designation || '').toUpperCase(),
// //     employeeData.designationId || null, // ADD THIS
// //     employeeData.region || null,
// //     employeeData.manager || null,
// //     employeeData.branch || null,
// //     employeeData.dateOfEmployment || null,
// //     employeeData.rank || null,
// //     employeeData.employmentStatusText || null,
// //     employeeData.resignedDate || null,
// //     employeeData.contactNo || null,
// //     employeeData.contactNo || null,
// //     employeeData.email || null,
// //     String(employeeData.gender || '').toUpperCase(),
// //     String(employeeData.civilStatus || '').toUpperCase(),
// //     employeeData.birthDate || null,
// //     employeeData.birthPlace || null,
// //     employeeData.religion || null,
// //     employeeData.spouse || null,
// //     employeeData.spouseWork || null,
// //     employeeData.fatherName || null,
// //     employeeData.fatherWork || null,
// //     employeeData.motherName || null,
// //     employeeData.motherWork || null,
// //     employeeData.school1 || null,
// //     employeeData.school1Address || null,
// //     employeeData.school1YearGraduated || null,
// //     employeeData.school2 || null,
// //     employeeData.school2Address || null,
// //     employeeData.school2YearGraduated || null,
// //     employeeData.college || null,
// //     employeeData.collegeAddress || null,
// //     employeeData.course || null,
// //     employeeData.collegeYearGraduated || null,
// //     employeeData.sssNo || null,
// //     employeeData.pagIbigNo || null,
// //     employeeData.tin || null,
// //     employeeData.walletNo || null,
// //     employeeData.walletNo || null,
// //     'ELEMENTARY',
// //     'SECONDARY',
// //     'COLLEGE',
// //     'COURSE',
// //     1,
// //     employeeData.philhealth || null,
// //     'Bachelors Degree',
// //     employeeData.collegeYearGraduated || null,
// //     now,
// //     employeeData.major || null,
// //     employeeData.employment_status || null,
// //   ];

// //   await dbPool.query(insertMaster, values);

// //   await markApplicantAsOnboarded({
// //     office: employeeData.office,
// //     applicantId: employeeData.applicantId,
// //   });

// //   return newId;
// // }

// async function saveEmployeeToMaster(employeeData) {
//   console.log('--------------- ', employeeData.office);

//   const dbPool = getRecordsDbPool(employeeData.office);

//   const newId = await generateEmployeeId(employeeData.office);

//   const trimmedLastName = String(employeeData.lastName || '').trim();
//   const trimmedFirstName = String(employeeData.firstName || '').trim();
//   const trimmedMiddleInitial = String(employeeData.middleInitial || '').trim();

//   const now = new Date();

//   // Determine which table to insert into
//   const { employeeTable } = getEmployeeTableConfig(employeeData.office);

//   const insertMaster = `
//     INSERT INTO ${employeeTable}
//     (
//       employeeid,
//       employeelname,
//       employeefname,
//       employeemi,
//       employee_address,
//       employeedesignation,
//       designation_id,
//       employeeregion,
//       employeeareamngr,
//       employeebranch,
//       employeedateemp,
//       employeeranking,
//       employmentstatus,
//       empresigndate,
//       employeetelno,
//       employeecontactno,
//       email,
//       employeegender,
//       employeestatus,
//       employeebdate,
//       employeebplace,
//       employeereligion,
//       employeespouse,
//       employeespousework,
//       employeefathersname,
//       employeefatherswork,
//       employeemothersname,
//       employeemotherswork,
//       employeeschool1,
//       employeeaddress1,
//       employeescyear1,
//       employeeschool2,
//       employeeaddress2,
//       employeescyear2,
//       employeeschool3,
//       employeeaddress3,
//       employeeschool4,
//       employeescyear4,
//       employeesss,
//       employeepagibig,
//       employeeTIN,
//       walletno,
//       employeesalary,
//       employeedegree1,
//       employeedegree2,
//       employeedegree3,
//       employeedegree4,
//       employeeempstat,
//       employeePhilhealth,
//       collegeDegree,
//       employeescyear3,
//       syscreated,
//       employeeaddress4,
//       employment_status
//     )
//     VALUES
//     (
//       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
//       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
//       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
//     )
//   `;

//   const values = [
//     newId,
//     trimmedLastName,
//     trimmedFirstName,
//     trimmedMiddleInitial,
//     employeeData.address || null,
//     String(employeeData.designation || '').toUpperCase(),
//     employeeData.designationId || null,
//     employeeData.region || null,
//     employeeData.manager || null,
//     employeeData.branch || null,
//     employeeData.dateOfEmployment || null,
//     employeeData.rank || null,
//     employeeData.employmentStatusText || null,
//     employeeData.resignedDate || null,
//     employeeData.contactNo || null,
//     employeeData.contactNo || null,
//     employeeData.email || null,
//     String(employeeData.gender || '').toUpperCase(),
//     String(employeeData.civilStatus || '').toUpperCase(),
//     employeeData.birthDate || null,
//     employeeData.birthPlace || null,
//     employeeData.religion || null,
//     employeeData.spouse || null,
//     employeeData.spouseWork || null,
//     employeeData.fatherName || null,
//     employeeData.fatherWork || null,
//     employeeData.motherName || null,
//     employeeData.motherWork || null,
//     employeeData.school1 || null,
//     employeeData.school1Address || null,
//     employeeData.school1YearGraduated || null,
//     employeeData.school2 || null,
//     employeeData.school2Address || null,
//     employeeData.school2YearGraduated || null,
//     employeeData.college || null,
//     employeeData.collegeAddress || null,
//     employeeData.course || null,
//     employeeData.collegeYearGraduated || null,
//     employeeData.sssNo || null,
//     employeeData.pagIbigNo || null,
//     employeeData.tin || null,
//     employeeData.walletNo || null,
//     employeeData.walletNo || null,
//     'ELEMENTARY',
//     'SECONDARY',
//     'COLLEGE',
//     'COURSE',
//     1,
//     employeeData.philhealth || null,
//     'Bachelors Degree',
//     employeeData.collegeYearGraduated || null,
//     now,
//     employeeData.major || null,
//     employeeData.employment_status || null,
//   ];

//   await dbPool.query(insertMaster, values);

//   await markApplicantAsOnboarded({
//     office: employeeData.office,
//     applicantId: employeeData.applicantId,
//   });

//   return newId;
// }

// async function markApplicantAsOnboarded({ office, applicantId }) {
//   console.log('office: ', office, 'applicantID: ', applicantId);
//   if (!applicantId) {
//     return null;
//   }

//   // Only VISMIN currently has applicant database
//   if (!officeHasApplicantModule(office)) {
//     return null;
//   }

//   const dbPool = getRecordsDbPool('default');

//   const [result] = await dbPool.query(
//     `
//     UPDATE recruitment_applicantinfo
//     SET onboarded = 1
//     WHERE applicantid = ?
//     `,
//     [applicantId],
//   );
//   console.log(result);
//   return result;
// }
// //END SAVE EMPLOYEE

// function getRecordsDbPool(office) {
//   switch ((office || '').toLowerCase()) {
//     case 'luzon':
//       console.log(office, 1);
//       return db.luzon;
//     case 'vismin':
//       console.log(office, 2);
//       return db.visminRec;
//     case 'ml group':
//       console.log(office, 3);
//       return db.mlgroup;
//     case 'visminrecruitment':
//       return db.visminReq;
//     default:
//       (console.log(office), 4);
//       return db.default;
//   }
// }

// async function getEmployeeMasterlist(filters) {
//   try {
//     const {
//       office,
//       region,
//       area,
//       branch,
//       status,
//       employeeType,
//       designation,
//       sortBy,
//       extraColumns = [],
//       dateFrom,
//       dateTo,
//       page = 1,
//       limit = 30,
//     } = filters;

//     // Make dateFilterType mutable so we can modify it
//     let dateFilterType = filters.dateFilterType || 'date_hired';

//     const { employeeTable, regionTable, areaTable, branchTable, rankTable } =
//       getEmployeeTableConfig(office);

//     console.log('date from: ', dateFrom, dateTo);
//     const offset = (page - 1) * limit;

//     // ===============================
//     // BASE COLUMNS
//     // ===============================
//     let columns = [
//       'r.regionname AS "Region"',
//       'e.employeeid AS "Employee ID"',
//       'e.employeelname AS "Last Name"',
//       'e.employeefname AS "First Name"',
//       'e.employeemi AS "Middle Name"',
//       'b.branchname AS "Branch"',
//       'd.designation AS "Designation"',
//       'a.areaname AS "Area"',
//       'e.employeedateemp AS "Date Hired"',
//       't.rankname AS "Ranking"',
//     ];

//     // ===============================
//     // VALIDATION: Active status cannot use resignation date filter
//     // ===============================
//     if (status && Number(status) === 9 && dateFilterType === 'resignation_date') {
//       console.warn(
//         'Invalid combination: Active status with resignation date filter. Forcing date_hired filter.',
//       );
//       // Force change to date_hired to prevent empty results
//       dateFilterType = 'date_hired';
//     }

//     // ===============================
//     // EXTRA COLUMNS - Auto-include resignation date if filtering by it
//     // ===============================
//     let extraColumnsArray = Array.isArray(extraColumns)
//       ? extraColumns
//       : [extraColumns].filter(Boolean);

//     // AUTO-INCLUDE: If filtering by resignation date, include the column automatically
//     if (dateFilterType === 'resignation_date' && !extraColumnsArray.includes('resignationdate')) {
//       extraColumnsArray.push('resignationdate');
//       console.log('Auto-included resignation date column because filter is applied');
//     }

//     // AUTO-INCLUDE: If status is filtered and it's NOT Active (9), show resignation date + remarks
//     if (status && Number(status) !== 9) {
//       if (!extraColumnsArray.includes('resignationdate')) {
//         extraColumnsArray.push('resignationdate');
//       }
//       if (!extraColumnsArray.includes('employmentstatusremarks')) {
//         extraColumnsArray.push('employmentstatusremarks');
//       }
//       console.log('Auto-included resignation date and remarks columns for non-active status');
//     }

//     // const extraMap = {
//     //   contactno: 'e.employeetelno AS "Contact No"',
//     //   birthdate: 'e.employeebdate AS "Birthdate"',
//     //   age: 'TIMESTAMPDIFF(YEAR, e.employeebdate, CURDATE()) AS "Age"',
//     //   civilstatus: 'e.employeestatus AS "Civil Status"',
//     //   tin: 'e.employeetin AS "TIN"',
//     //   sss: 'e.employeesss AS "SSS"',
//     //   philhealth: 'e.employeephilhealth AS "PhilHealth"',
//     //   pagibig: 'e.employeepagibig AS "PagIBIG"',
//     //   address: 'e.employee_address AS "Address"',
//     //   resignationdate: 'e.empresigndate AS "Resignation Date"',
//     //   gender: `e.employeegender AS Gender`,
//     // };
//     const extraMap = {
//       contactno: 'e.employeetelno AS "Contact No"',
//       birthdate: 'e.employeebdate AS "Birthdate"',
//       age: 'TIMESTAMPDIFF(YEAR, e.employeebdate, CURDATE()) AS "Age"',
//       civilstatus: 'e.employeestatus AS "Civil Status"',
//       tin: 'e.employeetin AS "TIN"',
//       sss: 'e.employeesss AS "SSS"',
//       philhealth: 'e.employeephilhealth AS "PhilHealth"',
//       pagibig: 'e.employeepagibig AS "PagIBIG"',
//       address: 'e.employee_address AS "Address"',
//       resignationdate: 'e.empresigndate AS "Resignation Date"',
//       employmentstatusremarks: 'e.employment_status_remarks AS "Employment Status Remarks"', // ADD THIS
//       gender: `e.employeegender AS Gender`,
//     };

//     if (extraColumnsArray.length > 0) {
//       extraColumnsArray.forEach((col) => {
//         if (extraMap[col]) {
//           columns.push(extraMap[col]);
//         }
//       });
//     }

//     // ===============================
//     // WHERE CLAUSE (SHARED)
//     // ===============================
//     let whereClause = ' WHERE 1=1 ';
//     let params = [];

//     if (region) {
//       whereClause += ' AND e.employeeregion = ?';
//       params.push(region);
//     }

//     if (area) {
//       whereClause += ' AND e.employeeareamngr = ?';
//       params.push(area);
//     }

//     if (branch) {
//       whereClause += ' AND e.employeebranch = ?';
//       params.push(branch);
//     }

//     if (status) {
//       whereClause += ' AND e.employment_status = ?';
//       params.push(status);

//       // Additional condition for voluntary resignation
//       if (Number(status) === 7) {
//         whereClause += ' AND e.employeeempstat = 0';
//       }
//       console.log(`status: ${status}`);
//       if (Number(status) === 9) {
//         whereClause += ' AND e.employeeempstat = 1';
//       }
//     }

//     if (employeeType) {
//       whereClause += ' AND e.employeeranking = ?';
//       params.push(employeeType);
//     }

//     // if (designation) {
//     //   // ← add
//     //   whereClause += ' AND e.employeedesignation = ?';
//     //   params.push(String(designation).toUpperCase());
//     // }
//     if (designation) {
//       whereClause += ' AND e.designation_id = ?'; // CHANGED: filter by FK, not text
//       params.push(Number(designation));
//     }
//     console.log('++++++++++++++++++++++ ', designation);
//     const allowedDateFilters = {
//       date_hired: 'e.employeedateemp',
//       resignation_date: 'e.empresigndate',
//     };

//     console.log('--------------- ', allowedDateFilters.date_hired);
//     const selectedDateColumn = allowedDateFilters[dateFilterType] || allowedDateFilters.date_hired;

//     if (dateFrom && dateTo) {
//       console.log(true);
//       whereClause += ` AND DATE(${selectedDateColumn}) BETWEEN ? AND ?`;
//       params.push(dateFrom, dateTo);
//     } else if (dateFrom) {
//       console.log('else if date from ', dateFrom);
//       whereClause += ` AND DATE(${selectedDateColumn}) >= ?`;
//       params.push(dateFrom);
//     } else if (dateTo) {
//       console.log('else if date to', dateTo);
//       whereClause += ` AND DATE(${selectedDateColumn}) <= ?`;
//       params.push(dateTo);
//     }

//     // ===============================
//     // SORTING (SAFE)
//     // ===============================
//     const allowedSortFields = {
//       lastname: 'e.employeelname',
//       employeeid: 'e.employeeid',
//       datehired: 'e.employeedateemp',
//       branch: 'b.branchname',
//       region: 'r.regionname',
//     };

//     const safeSortBy = String(sortBy || 'lastname').toLowerCase();
//     const sortColumn = allowedSortFields[safeSortBy] || 'e.employeelname';

//     // ===============================
//     // MAIN DATA QUERY (WITH LIMIT)
//     // ===============================
//     // const dataQuery = `
//     //   SELECT ${columns.join(', ')}
//     //   FROM master e
//     //   LEFT JOIN branch b ON b.branchcode = e.employeebranch
//     //   LEFT JOIN region r ON r.regionid = e.employeeregion
//     //   LEFT JOIN areas a ON a.areaid = e.employeeareamngr
//     //   LEFT JOIN rank t ON t.rankid = e.employeeranking
//     //     LEFT JOIN rec_designations d ON d.designation_id = e.designation_id
//     //   ${whereClause}
//     //   ORDER BY ${sortColumn}, e.employeelname, e.employeefname
//     //   LIMIT ? OFFSET ?
//     // `;

//     const dataQuery = `
//   SELECT ${columns.join(', ')}
//   FROM ${employeeTable} e
//   LEFT JOIN ${branchTable} b
//     ON b.branchcode = e.employeebranch
//   LEFT JOIN ${regionTable} r
//     ON r.regionid = e.employeeregion
//   LEFT JOIN ${areaTable} a
//     ON a.areaid = e.employeeareamngr
//   LEFT JOIN ${rankTable} t
//     ON t.rankid = e.employeeranking
//   LEFT JOIN rec_designations d
//     ON d.designation_id = e.designation_id
//   ${whereClause}
//   ORDER BY ${sortColumn}, e.employeelname, e.employeefname
//   LIMIT ? OFFSET ?
// `;

//     const dataParams = [...params, Number(limit), Number(offset)];

//     // ===============================
//     // COUNT QUERY (NO LIMIT)
//     // ===============================
//     // const countQuery = `
//     //   SELECT COUNT(*) AS total
//     //   FROM master e
//     //   LEFT JOIN branch b ON b.branchcode = e.employeebranch
//     //   LEFT JOIN region r ON r.regionid = e.employeeregion
//     //   LEFT JOIN areas a ON a.areaid = e.employeeareamngr
//     //   LEFT JOIN rank t ON t.rankid = e.employeeranking
//     //     LEFT JOIN rec_designations d ON d.designation_id = e.designation_id
//     //   ${whereClause}
//     // `;

//     const countQuery = `
//   SELECT COUNT(*) AS total
//   FROM ${employeeTable} e
//   LEFT JOIN ${branchTable} b
//     ON b.branchcode = e.employeebranch
//   LEFT JOIN ${regionTable} r
//     ON r.regionid = e.employeeregion
//   LEFT JOIN ${areaTable} a
//     ON a.areaid = e.employeeareamngr
//   LEFT JOIN ${rankTable} t
//     ON t.rankid = e.employeeranking
//   LEFT JOIN rec_designations d
//     ON d.designation_id = e.designation_id
//   ${whereClause}
// `;

//     // ===============================
//     // EXECUTION
//     // ===============================
//     const dbPool = getRecordsDbPool(office);
//     console.log(dataQuery, dataParams);
//     const [[{ total }]] = await dbPool.query(countQuery, params);
//     console.log('TOTAL FOR THIS QUERY:', total);
//     const [rows] = await dbPool.query(dataQuery, dataParams);

//     const totalPages = Math.ceil(total / limit);

//     return {
//       rows,
//       total,
//       totalPages,
//       currentPage: Number(page),
//     };
//   } catch (error) {
//     console.error('Error in getEmployeeMasterlist:', error);
//     throw error;
//   }
// }

// // START -> REGION MANAGEMENT

// // async function searchRegionManager(keyword, office, type) {
// //   const searchKeyword = `%${keyword}%`;

// //   const dbPool = getRecordsDbPool(office);

// //   const [rows] = await dbPool.query(
// //     `
// //     SELECT
// //       e.employeeid AS employee_id,

// //       CONCAT(
// //         e.employeelname, ', ',
// //         e.employeefname, ' ',
// //         IFNULL(e.employeemi, '')
// //       ) AS employee_name,

// //       e.employeedesignation AS designation,

// //       b.branchname AS branch,

// //       a.areaname AS area,

// //       r.regionname AS region,

// //       'Active' AS status

// //     FROM master e

// //     LEFT JOIN branch b
// //       ON b.branchcode = e.employeebranch

// //     LEFT JOIN areas a
// //       ON a.areaid = e.employeeareamngr

// //     LEFT JOIN region r
// //       ON r.regionid = e.employeeregion

// //     WHERE e.employeeempstat = 1

// //       AND (
// //         e.employeeid LIKE ?
// //         OR e.employeelname LIKE ?
// //         OR e.employeefname LIKE ?
// //         OR e.employeedesignation LIKE ?
// //       )

// //     ORDER BY
// //       e.employeelname,
// //       e.employeefname

// //     LIMIT 50
// //     `,
// //     [searchKeyword, searchKeyword, searchKeyword, searchKeyword],
// //   );

// //   return rows;
// // }

// async function searchRegionManager(keyword, office, type) {
//   const searchKeyword = `%${keyword}%`;

//   const dbPool = getRecordsDbPool(office);

//   const { employeeTable, regionTable, areaTable, branchTable } = getEmployeeTableConfig(office);

//   const [rows] = await dbPool.query(
//     `
//     SELECT
//       e.employeeid AS employee_id,

//       CONCAT(
//         e.employeelname, ', ',
//         e.employeefname, ' ',
//         IFNULL(e.employeemi, '')
//       ) AS employee_name,

//       e.employeedesignation AS designation,

//       b.branchname AS branch,

//       a.areaname AS area,

//       r.regionname AS region,

//       'Active' AS status

//     FROM ${employeeTable} e

//     LEFT JOIN ${branchTable} b
//       ON b.branchcode = e.employeebranch

//     LEFT JOIN ${areaTable} a
//       ON a.areaid = e.employeeareamngr

//     LEFT JOIN ${regionTable} r
//       ON r.regionid = e.employeeregion

//     WHERE e.employeeempstat = 1

//       AND (
//         e.employeeid LIKE ?
//         OR e.employeelname LIKE ?
//         OR e.employeefname LIKE ?
//         OR e.employeedesignation LIKE ?
//       )

//     ORDER BY
//       e.employeelname,
//       e.employeefname

//     LIMIT 50
//     `,
//     [searchKeyword, searchKeyword, searchKeyword, searchKeyword],
//   );

//   return rows;
// }

// // FIND REGION

// async function findRegionByName(regionName, office) {
//   const dbPool = getRecordsDbPool(office);

//   const [rows] = await dbPool.query(
//     `
//     SELECT regionid

//     FROM region

//     WHERE LOWER(regionname)
//     =
//     LOWER(?)

//     LIMIT 1
//     `,
//     [regionName.trim()],
//   );

//   return rows[0] || null;
// }

// // VALIDATE EMPLOYEE

// // async function findActiveEmployeeById(employeeId, office) {
// //   const dbPool = getRecordsDbPool(office);

// //   const [rows] = await dbPool.query(
// //     `
// //     SELECT employeeid

// //     FROM master

// //     WHERE employeeid = ?
// //       AND employeeempstat = 1

// //     LIMIT 1
// //     `,
// //     [employeeId],
// //   );

// //   return rows[0] || null;
// // }

// async function findActiveEmployeeById(employeeId, office) {
//   const dbPool = getRecordsDbPool(office);

//   const { employeeTable } = getEmployeeTableConfig(office);

//   const [rows] = await dbPool.query(
//     `
//     SELECT employeeid
//     FROM ${employeeTable}
//     WHERE employeeid = ?
//       AND employeeempstat = 1
//     LIMIT 1
//     `,
//     [employeeId],
//   );

//   return rows[0] || null;
// }

// // SAVE REGION

// async function saveRegion({ office, type, regionName, regionManagerId, regionManagerName }) {
//   const dbPool = getRecordsDbPool(office);

//   console.log(
//     `
//     INSERT INTO region (

//       regionname,
//       region_manager,
//       manager_id,
//       region_type,

//     )

//     VALUES (?, ?, ?,?)
//     `,
//     regionName.trim(),
//     regionManagerName,
//     regionManagerId,
//     type,
//   );
//   const [result] = await dbPool.query(
//     `
//     INSERT INTO region (

//       regionname,
//       region_manager,
//       manager_id,
//       region_type

//     )

//     VALUES (?, ?, ?,?)
//     `,
//     [regionName.trim(), regionManagerName, regionManagerId, type],
//   );

//   return result;
// }

// // SAVE SUB UNIT

// async function saveSubUnit({ office, regionId, name, managerId, managerName }) {
//   const dbPool = getRecordsDbPool(office);

//   const [result] = await dbPool.query(
//     `
//     INSERT INTO areas (

//       arearegid,
//       areaname,
//       area_manager,
//       area_name,
//       area_manager_id

//     )

//     VALUES (?, ?, ?, ?, ?)
//     `,
//     [regionId, managerName, managerName, name.trim(), managerId],
//   );

//   return result;
// }

// // END -> REGION MANAGEMENT

// // START -> REGION ADD EDIT
// async function getRegionsForMaintenance(office) {
//   const dbPool = office ? getRecordsDbPool(office) : db.default;

//   const [rows] = await dbPool.query(
//     `
//     SELECT
//       regionid,
//       regionname,
//       region_type,
//       region_manager,
//       manager_id
//     FROM region
//     ORDER BY regionname ASC
//     `,
//   );

//   return rows;
// }

// // async function getRegionById(regionId, office) {
// //   const dbPool = getRecordsDbPool(office);

// //   const [rows] = await dbPool.query(
// //     `
// //     SELECT
// //       regionid,
// //       regionname,
// //       region_type,
// //       region_manager,
// //       manager_id,
// //       (select employeedesignation from master where employeeid = manager_id) as designation,
// //       active as status
// //     FROM region
// //     WHERE regionid = ?
// //     LIMIT 1
// //     `,
// //     [regionId],
// //   );

// //   return rows[0] || null;
// // }

// async function getRegionById(regionId, office) {
//   const dbPool = getRecordsDbPool(office);

//   const { employeeTable, regionTable } = getEmployeeTableConfig(office);

//   const [rows] = await dbPool.query(
//     `
//     SELECT
//       r.regionid,
//       r.regionname,
//       r.region_type,
//       r.region_manager,
//       r.manager_id,
//       e.employeedesignation AS designation,
//       r.active AS status

//     FROM ${regionTable} r

//     LEFT JOIN ${employeeTable} e
//       ON e.employeeid = r.manager_id

//     WHERE r.regionid = ?

//     LIMIT 1
//     `,
//     [regionId],
//   );

//   return rows[0] || null;
// }

// // async function getSubUnitsByRegionId(regionId, office) {
// //   const dbPool = getRecordsDbPool(office);

// //   const [rows] = await dbPool.query(
// //     `
// //     SELECT
// //       areaid AS id,
// //       area_name AS name,
// //       area_manager_id AS managerId,
// //       area_manager AS managerName,
// //       (
// //         SELECT employeedesignation
// //         FROM master
// //         WHERE employeeid = area_manager_id
// //         LIMIT 1
// //       ) AS designation
// //     FROM areas
// //     WHERE arearegid = ?
// //       AND is_active = 1
// //     ORDER BY name ASC
// //     `,
// //     [regionId],
// //   );

// //   return rows;
// // }

// async function getSubUnitsByRegionId(regionId, office) {
//   const dbPool = getRecordsDbPool(office);

//   const { employeeTable, areaTable } = getEmployeeTableConfig(office);

//   const [rows] = await dbPool.query(
//     `
//     SELECT
//       a.areaid AS id,
//       a.area_name AS name,
//       a.area_manager_id AS managerId,
//       a.area_manager AS managerName,
//       e.employeedesignation AS designation

//     FROM ${areaTable} a

//     LEFT JOIN ${employeeTable} e
//       ON e.employeeid = a.area_manager_id

//     WHERE a.arearegid = ?
//       AND a.is_active = 1

//     ORDER BY a.area_name ASC
//     `,
//     [regionId],
//   );

//   return rows;
// }

// async function findRegionByNameExceptId(regionName, office, regionId) {
//   const dbPool = getRecordsDbPool(office);

//   const [rows] = await dbPool.query(
//     `
//     SELECT regionid
//     FROM region
//     WHERE LOWER(regionname) = LOWER(?)
//       AND regionid <> ?
//     LIMIT 1
//     `,
//     [regionName.trim(), regionId],
//   );

//   return rows[0] || null;
// }

// async function updateRegion({
//   office,
//   regionId,
//   type,
//   regionName,
//   regionManagerId,
//   regionManagerName,
//   status,
// }) {
//   const dbPool = getRecordsDbPool(office);

//   const [result] = await dbPool.query(
//     `
//     UPDATE region
//     SET
//       regionname = ?,
//       region_manager = ?,
//       manager_id = ?,
//       region_type = ?,
//       active = ?,
//       updated_on = NOW() -- This uses the DB server time
//     WHERE regionid = ?
//     `,
//     [regionName.trim(), regionManagerName, regionManagerId, type, status, regionId],
//   );

//   return result;
// }

// async function deleteSubUnitsByRegionId(regionId, office) {
//   const dbPool = getRecordsDbPool(office);

//   const [result] = await dbPool.query(
//     `
//     DELETE FROM areas
//     WHERE arearegid = ?
//     `,
//     [regionId],
//   );

//   return result;
// }

// async function updateSubUnit({ office, areaId, name, managerId, managerName }) {
//   const dbPool = getRecordsDbPool(office);

//   const [result] = await dbPool.query(
//     `
//     UPDATE areas
//     SET
//       area_name = ?,
//       areaname = ?,
//       area_manager = ?,
//       area_manager_id = ?
//     WHERE areaid = ?
//     `,
//     [name.trim(), managerName, managerName, managerId, areaId],
//   );

//   return result;
// }

// // async function saveOrUpdateSubUnit({
// //   office,
// //   regionId,
// //   areaId,
// //   name,
// //   managerId,
// //   managerName,
// // }) {
// //   const dbPool = getRecordsDbPool(office);

// //   if (areaId) {
// //     const [result] = await dbPool.query(
// //       `
// //       UPDATE areas
// //       SET
// //         areaname = ?,
// //         area_name = ?,
// //         area_manager = ?,
// //         area_manager_id = ?,
// //         is_active = 1
// //       WHERE areaid = ?
// //         AND arearegid = ?
// //       `,
// //       [managerName, name.trim(), managerName, managerId, areaId, regionId],
// //     );

// //     return {
// //       mode: "updated",
// //       areaId: Number(areaId),
// //       result,
// //     };
// //   }

// //   const [result] = await dbPool.query(
// //     `
// //     INSERT INTO areas (
// //       arearegid,
// //       areaname,
// //       area_manager,
// //       area_name,
// //       area_manager_id,
// //       is_active
// //     )
// //     VALUES (?, ?, ?, ?, ?, 1)
// //     `,
// //     [regionId, managerName, managerName, name.trim(), managerId],
// //   );

// //   return {
// //     mode: "inserted",
// //     areaId: result.insertId,
// //     result,
// //   };
// // }

// // async function saveOrUpdateSubUnit({ office, regionId, areaId, name, managerId, managerName }) {
// //   const dbPool = getRecordsDbPool(office);

// //   if (areaId) {
// //     const [result] = await dbPool.query(
// //       `
// //       UPDATE areas
// //       SET
// //         areaname = ?,
// //         area_name = ?,
// //         area_manager = ?,
// //         area_manager_id = ?,
// //         is_active = 1
// //       WHERE areaid = ?
// //         AND arearegid = ?
// //       `,
// //       [managerName, name.trim(), managerName, managerId, areaId, regionId],
// //     );

// //     console.log('----------------------- ', regionId, areaId, managerId);
// //     // Sync master: update the area manager's region assignment
// //     if (managerId) {
// //       await dbPool.query(
// //         `
// //         UPDATE master
// //         SET
// //           employeeregion = ?,
// //           employeeareamngr = ?
// //         WHERE employeeid = ?
// //         `,
// //         [regionId, areaId, managerId],
// //       );
// //     }

// //     return {
// //       mode: 'updated',
// //       areaId: Number(areaId),
// //       result,
// //     };
// //   }

// //   const [result] = await dbPool.query(
// //     `
// //     INSERT INTO areas (
// //       arearegid,
// //       areaname,
// //       area_manager,
// //       area_name,
// //       area_manager_id,
// //       is_active
// //     )
// //     VALUES (?, ?, ?, ?, ?, 1)
// //     `,
// //     [regionId, managerName, managerName, name.trim(), managerId],
// //   );

// //   const newAreaId = result.insertId;

// //   // Sync master: update the newly inserted area manager's region assignment
// //   if (managerId) {
// //     await dbPool.query(
// //       `
// //       UPDATE master
// //       SET
// //         employeeregion = ?,
// //         employeeareamngr = ?
// //       WHERE employeeid = ?
// //       `,
// //       [regionId, newAreaId, managerId],
// //     );
// //   }

// //   return {
// //     mode: 'inserted',
// //     areaId: newAreaId,
// //     result,
// //   };
// // }

// async function saveOrUpdateSubUnit({ office, regionId, areaId, name, managerId, managerName }) {
//   const dbPool = getRecordsDbPool(office);

//   const { employeeTable, areaTable } = getEmployeeTableConfig(office);

//   const areaName = String(name || '').trim();

//   if (areaId) {
//     const [result] = await dbPool.query(
//       `
//       UPDATE ${areaTable}
//       SET
//         areaname = ?,
//         area_name = ?,
//         area_manager = ?,
//         area_manager_id = ?,
//         is_active = 1
//       WHERE areaid = ?
//         AND arearegid = ?
//       `,
//       [areaName, areaName, managerName, managerId, areaId, regionId],
//     );

//     console.log('----------------------- ', regionId, areaId, managerId);

//     // Sync employee's region and area assignment
//     if (managerId) {
//       await dbPool.query(
//         `
//         UPDATE ${employeeTable}
//         SET
//           employeeregion = ?,
//           employeeareamngr = ?
//         WHERE employeeid = ?
//         `,
//         [regionId, areaId, managerId],
//       );
//     }

//     return {
//       mode: 'updated',
//       areaId: Number(areaId),
//       result,
//     };
//   }

//   const [result] = await dbPool.query(
//     `
//     INSERT INTO ${areaTable} (
//       arearegid,
//       areaname,
//       area_manager,
//       area_name,
//       area_manager_id,
//       is_active
//     )
//     VALUES (?, ?, ?, ?, ?, 1)
//     `,
//     [regionId, areaName, managerName, areaName, managerId],
//   );

//   const newAreaId = result.insertId;

//   // Sync newly assigned manager's region and area
//   if (managerId) {
//     await dbPool.query(
//       `
//       UPDATE ${employeeTable}
//       SET
//         employeeregion = ?,
//         employeeareamngr = ?
//       WHERE employeeid = ?
//       `,
//       [regionId, newAreaId, managerId],
//     );
//   }

//   return {
//     mode: 'inserted',
//     areaId: newAreaId,
//     result,
//   };
// }

// // async function getEmployeesAssignedToRemovedAreas({ office, regionId, submittedAreaIds = [] }) {
// //   const dbPool = getRecordsDbPool(office);

// //   const cleanSubmittedAreaIds = submittedAreaIds.map((id) => Number(id)).filter(Boolean);

// //   let removedAreaQuery = `
// //     SELECT
// //       areaid,
// //       area_name,
// //       areaname
// //     FROM areas
// //     WHERE arearegid = ?
// //       AND is_active = 1
// //   `;

// //   const removedAreaParams = [regionId];

// //   if (cleanSubmittedAreaIds.length > 0) {
// //     removedAreaQuery += `
// //       AND areaid NOT IN (${cleanSubmittedAreaIds.map(() => '?').join(',')})
// //     `;

// //     removedAreaParams.push(...cleanSubmittedAreaIds);
// //   }

// //   const [removedAreas] = await dbPool.query(removedAreaQuery, removedAreaParams);

// //   if (removedAreas.length === 0) {
// //     return [];
// //   }

// //   const removedAreaIds = removedAreas.map((area) => Number(area.areaid));

// //   const [employees] = await dbPool.query(
// //     `
// //     SELECT
// //       e.employeeid,
// //       CONCAT(
// //         e.employeelname, ', ',
// //         e.employeefname, ' ',
// //         IFNULL(e.employeemi, '')
// //       ) AS employeeName,
// //       e.employeedesignation AS designation,
// //       e.employeeareamngr AS areaId,
// //       a.area_name AS areaName
// //     FROM master e
// //     LEFT JOIN areas a
// //       ON a.areaid = e.employeeareamngr
// //     WHERE e.employeeregion = ?
// //       AND e.employeeareamngr IN (${removedAreaIds.map(() => '?').join(',')})
// //       AND e.employeeempstat = 1
// //     ORDER BY
// //       a.area_name,
// //       e.employeelname,
// //       e.employeefname
// //     `,
// //     [regionId, ...removedAreaIds],
// //   );

// //   const grouped = removedAreas.map((area) => {
// //     const areaEmployees = employees.filter((emp) => Number(emp.areaId) === Number(area.areaid));

// //     return {
// //       areaId: area.areaid,
// //       areaName: area.area_name || area.areaname,
// //       employees: areaEmployees,
// //       employeeCount: areaEmployees.length,
// //     };
// //   });

// //   return grouped.filter((area) => area.employeeCount > 0);
// // }

// async function getEmployeesAssignedToRemovedAreas({ office, regionId, submittedAreaIds = [] }) {
//   const dbPool = getRecordsDbPool(office);

//   const { employeeTable, areaTable } = getEmployeeTableConfig(office);

//   const cleanSubmittedAreaIds = submittedAreaIds.map((id) => Number(id)).filter(Boolean);

//   let removedAreaQuery = `
//     SELECT
//       areaid,
//       area_name,
//       areaname
//     FROM ${areaTable}
//     WHERE arearegid = ?
//       AND is_active = 1
//   `;

//   const removedAreaParams = [regionId];

//   if (cleanSubmittedAreaIds.length > 0) {
//     removedAreaQuery += `
//       AND areaid NOT IN (${cleanSubmittedAreaIds.map(() => '?').join(',')})
//     `;

//     removedAreaParams.push(...cleanSubmittedAreaIds);
//   }

//   const [removedAreas] = await dbPool.query(removedAreaQuery, removedAreaParams);

//   if (removedAreas.length === 0) {
//     return [];
//   }

//   const removedAreaIds = removedAreas.map((area) => Number(area.areaid));

//   const [employees] = await dbPool.query(
//     `
//     SELECT
//       e.employeeid,
//       CONCAT(
//         e.employeelname, ', ',
//         e.employeefname, ' ',
//         IFNULL(e.employeemi, '')
//       ) AS employeeName,
//       e.employeedesignation AS designation,
//       e.employeeareamngr AS areaId,
//       a.area_name AS areaName

//     FROM ${employeeTable} e

//     LEFT JOIN ${areaTable} a
//       ON a.areaid = e.employeeareamngr

//     WHERE e.employeeregion = ?
//       AND e.employeeareamngr IN (
//         ${removedAreaIds.map(() => '?').join(',')}
//       )
//       AND e.employeeempstat = 1

//     ORDER BY
//       a.area_name,
//       e.employeelname,
//       e.employeefname
//     `,
//     [regionId, ...removedAreaIds],
//   );

//   const grouped = removedAreas.map((area) => {
//     const areaEmployees = employees.filter((emp) => Number(emp.areaId) === Number(area.areaid));

//     return {
//       areaId: area.areaid,
//       areaName: area.area_name || area.areaname,
//       employees: areaEmployees,
//       employeeCount: areaEmployees.length,
//     };
//   });

//   return grouped.filter((area) => area.employeeCount > 0);
// }

// // async function getUsedAreaIdsInMaster({ office, regionId }) {
// //   const dbPool = getRecordsDbPool(office);

// //   const [rows] = await dbPool.query(
// //     `
// //     SELECT DISTINCT employeeareamngr AS areaId
// //     FROM master
// //     WHERE employeeregion = ?
// //       AND employeeareamngr IS NOT NULL
// //     `,
// //     [regionId],
// //   );

// //   return rows.map((row) => Number(row.areaId));
// // }

// async function getUsedAreaIdsInMaster({ office, regionId }) {
//   const dbPool = getRecordsDbPool(office);

//   const { employeeTable } = getEmployeeTableConfig(office);

//   const [rows] = await dbPool.query(
//     `
//     SELECT DISTINCT employeeareamngr AS areaId
//     FROM ${employeeTable}
//     WHERE employeeregion = ?
//       AND employeeareamngr IS NOT NULL
//     `,
//     [regionId],
//   );

//   return rows.map((row) => Number(row.areaId));
// }

// // async function deactivateRemovedSubUnits({ office, regionId, submittedAreaIds = [] }) {
// //   const dbPool = getRecordsDbPool(office);

// //   const cleanSubmittedAreaIds = submittedAreaIds.map((id) => Number(id)).filter(Boolean);

// //   if (cleanSubmittedAreaIds.length === 0) {
// //     console.log('----------------------------------------');
// //     const [result] = await dbPool.query(
// //       `
// //       UPDATE areas
// //       SET is_active = 0
// //       WHERE arearegid = ?
// //         AND is_active = 1
// //       `,
// //       [regionId],
// //     );

// //     return result;
// //   }

// //   const placeholders = cleanSubmittedAreaIds.map(() => '?').join(',');

// //   const [result] = await dbPool.query(
// //     `
// //     UPDATE areas
// //     SET is_active = 0
// //     WHERE arearegid = ?
// //       AND is_active = 1
// //       AND areaid NOT IN (${placeholders})
// //     `,
// //     [regionId, ...cleanSubmittedAreaIds],
// //   );

// //   return result;
// // }

// async function deactivateRemovedSubUnits({ office, regionId, submittedAreaIds = [] }) {
//   const dbPool = getRecordsDbPool(office);

//   const { areaTable } = getEmployeeTableConfig(office);

//   const cleanSubmittedAreaIds = submittedAreaIds.map((id) => Number(id)).filter(Boolean);

//   if (cleanSubmittedAreaIds.length === 0) {
//     console.log('----------------------------------------');

//     const [result] = await dbPool.query(
//       `
//       UPDATE ${areaTable}
//       SET is_active = 0
//       WHERE arearegid = ?
//         AND is_active = 1
//       `,
//       [regionId],
//     );

//     return result;
//   }

//   const placeholders = cleanSubmittedAreaIds.map(() => '?').join(',');

//   const [result] = await dbPool.query(
//     `
//     UPDATE ${areaTable}
//     SET is_active = 0
//     WHERE arearegid = ?
//       AND is_active = 1
//       AND areaid NOT IN (${placeholders})
//     `,
//     [regionId, ...cleanSubmittedAreaIds],
//   );

//   return result;
// }
// // // END -> REGION ADD EDIT

// // START EMPLOYEE ENTRY
// //get ranking
// // async function getRankingByOffice(office) {
// //   const dbPool = getRecordsDbPool(office);

// //   const [rows] = await dbPool.query(
// //     `
// //     SELECT
// //       rankid,
// //       rankname
// //     FROM rank
// //     ORDER BY rankname ASC
// //     `,
// //   );

// //   return rows;
// // }

// async function getRankingByOffice(office) {
//   const dbPool = getRecordsDbPool(office);

//   const { rankTable } = getEmployeeTableConfig(office);

//   const [rows] = await dbPool.query(
//     `
//     SELECT
//       rankid,
//       rankname
//     FROM ${rankTable}
//     ORDER BY rankname ASC
//     `,
//   );

//   return rows;
// }
// // END EMPLOYEE ENTRY

// // In recordsModel.js
// // async function searchEmployeesForUpdate({ office, lastName, firstName }) {
// //   const dbPool = getRecordsDbPool(office);

// //   let query = `
// //     SELECT
// //       e.employeeid,
// //       e.employeelname,
// //       e.employeefname,
// //       e.employeemi,
// //       e.employeedesignation,
// //       e.employmentstatus,
// //       r.regionname,
// //       a.area_name,
// //       b.branchname
// //     FROM master e
// //     LEFT JOIN region r ON r.regionid = e.employeeregion
// //     LEFT JOIN areas a ON a.areaid = e.employeeareamngr
// //     LEFT JOIN branch b ON b.branchcode = e.employeebranch
// //     WHERE 1=1
// //   `;

// //   const params = [];

// //   if (lastName) {
// //     query += ` AND e.employeelname LIKE ?`;
// //     params.push(`%${lastName}%`);
// //   }

// //   if (firstName) {
// //     query += ` AND e.employeefname LIKE ?`;
// //     params.push(`%${firstName}%`);
// //   }

// //   query += ` ORDER BY e.employeelname, e.employeefname LIMIT 50`;

// //   const [rows] = await dbPool.query(query, params);
// //   return rows;
// // }

// async function searchEmployeesForUpdate({ office, lastName, firstName }) {
//   const dbPool = getRecordsDbPool(office);

//   const { employeeTable, regionTable, areaTable, branchTable } = getEmployeeTableConfig(office);

//   let query = `
//     SELECT
//       e.employeeid,
//       e.employeelname,
//       e.employeefname,
//       e.employeemi,
//       e.employeedesignation,
//       e.employmentstatus,
//       r.regionname,
//       a.area_name,
//       b.branchname

//     FROM ${employeeTable} e

//     LEFT JOIN ${regionTable} r
//       ON r.regionid = e.employeeregion

//     LEFT JOIN ${areaTable} a
//       ON a.areaid = e.employeeareamngr

//     LEFT JOIN ${branchTable} b
//       ON b.branchcode = e.employeebranch

//     WHERE 1=1
//   `;

//   const params = [];

//   if (lastName) {
//     query += ` AND e.employeelname LIKE ?`;
//     params.push(`%${lastName}%`);
//   }

//   if (firstName) {
//     query += ` AND e.employeefname LIKE ?`;
//     params.push(`%${firstName}%`);
//   }

//   query += `
//     ORDER BY e.employeelname, e.employeefname
//     LIMIT 50
//   `;

//   const [rows] = await dbPool.query(query, params);

//   return rows;
// }

// // async function getEmployeeForUpdate({ office, employeeId }) {
// //   const dbPool = getRecordsDbPool(office);

// //   const [rows] = await dbPool.query(
// //     `
// //     SELECT *
// //     FROM master
// //     WHERE employeeid = ?
// //     LIMIT 1
// //     `,
// //     [employeeId],
// //   );

// //   return rows[0] || null;
// // }

// async function getEmployeeForUpdate({ office, employeeId }) {
//   const dbPool = getRecordsDbPool(office);

//   const { employeeTable } = getEmployeeTableConfig(office);

//   const [rows] = await dbPool.query(
//     `
//     SELECT *
//     FROM ${employeeTable}
//     WHERE employeeid = ?
//     LIMIT 1
//     `,
//     [employeeId],
//   );

//   return rows[0] || null;
// }

// async function updateEmployeeRecord({ office, employeeId, employeeData }) {
//   const dbPool = getRecordsDbPool(office);

//   console.log('Updating employee with data:', employeeData);

//   const { employeeTable } = getEmployeeTableConfig(office);

//   const [result] = await dbPool.query(
//     `
//     UPDATE ${employeeTable}
//     SET
//       employeelname = ?,
//       employeefname = ?,
//       employeemi = ?,
//       employeedesignation = ?,
//         designation_id = ?,
//       employeeregion = ?,
//       employeeareamngr = ?,
//       employeebranch = ?,
//       employeedateemp = ?,
//       employeeranking = ?,
//       employmentstatus = ?,
//       empresigndate = ?,
//         employment_status_remarks = ?,
//       employeetelno = ?,
//       employeecontactno = ?,
//       email = ?,
//       employeegender = ?,
//       employeestatus = ?,
//       employeebdate = ?,
//       employeebplace = ?,
//       employeereligion = ?,
//       employee_address = ?,
//       employeesss = ?,
//       employeepagibig = ?,
//       employeePhilhealth = ?,
//       employeeTIN = ?,
//       walletno = ?,
//       employment_status = ?,
//       employeespouse = ?,
//       employeespousework = ?,
//       employeefathersname = ?,
//       employeefatherswork = ?,
//       employeemothersname = ?,
//       employeemotherswork = ?,
//       -- Education fields - ADD THESE
//       employeeschool1 = ?,
//       employeeaddress1 = ?,
//       employeescyear1 = ?,
//       employeeschool2 = ?,
//       employeeaddress2 = ?,
//       employeescyear2 = ?,
//       employeeschool3 = ?,
//       employeeaddress3 = ?,
//       employeescyear3 = ?,
//       employeeschool4 = ?,
//       employeeaddress4 = ?,
//       sysupdated = NOW()
//     WHERE employeeid = ?
//     `,
//     [
//       // Basic Information (32 fields)
//       employeeData.lastName,
//       employeeData.firstName,
//       employeeData.middleInitial,
//       employeeData.designation,
//       employeeData.designationId,
//       employeeData.region,
//       employeeData.area,
//       employeeData.branch,
//       employeeData.dateHired,
//       employeeData.rank,
//       employeeData.employmentStatusText,
//       employeeData.resignedDate,
//       employeeData.employmentStatusRemarks, // ADD THIS
//       employeeData.contactNo,
//       employeeData.contactNo, // employeetelno uses same as contactno
//       employeeData.email,
//       employeeData.gender,
//       employeeData.civilStatus,
//       employeeData.birthDate,
//       employeeData.birthPlace,
//       employeeData.religion,
//       employeeData.address,
//       employeeData.sssNo,
//       employeeData.pagIbigNo,
//       employeeData.philhealth,
//       employeeData.tin,
//       employeeData.walletNo,
//       employeeData.employmentStatus,
//       employeeData.employeespouse,
//       employeeData.employeespousework,
//       employeeData.employeefathersname,
//       employeeData.employeefatherswork,
//       employeeData.employeemothersname,
//       employeeData.employeemotherswork,
//       // Education fields (11 fields)
//       employeeData.employeeschool1,
//       employeeData.employeeaddress1,
//       employeeData.employeescyear1,
//       employeeData.employeeschool2,
//       employeeData.employeeaddress2,
//       employeeData.employeescyear2,
//       employeeData.employeeschool3,
//       employeeData.employeeaddress3,
//       employeeData.employeescyear3,
//       employeeData.employeeschool4,
//       employeeData.employeeaddress4,
//       // WHERE clause
//       employeeId,
//     ],
//   );

//   return result;
// }

// // START -> DESIGNATION MANAGEMENT

// function normalizeDesignation(value) {
//   return String(value || '')
//     .trim()
//     .toUpperCase()
//     .replace(/\s+/g, ' ');
// }

// async function getAllDesignations() {
//   const [rows] = await db.default.query(
//     `
//     SELECT
//       designation_id,
//       designation,
//       is_active
//     FROM rec_designations
//     ORDER BY designation ASC
//     `,
//   );

//   return rows;
// }

// async function findDesignationByName(designationName) {
//   const normalized = normalizeDesignation(designationName);

//   const [rows] = await db.default.query(
//     `
//     SELECT designation_id
//     FROM rec_designations
//     WHERE designation_normalized = ?
//     LIMIT 1
//     `,
//     [normalized],
//   );

//   return rows[0] || null;
// }

// async function saveDesignation({ designation, userId }) {
//   const cleanDesignation = String(designation || '')
//     .trim()
//     .toUpperCase();
//   const normalized = normalizeDesignation(designation);

//   const [result] = await db.default.query(
//     `
//     INSERT INTO rec_designations (
//       designation,
//       designation_normalized,
//       is_active,
//       created_at,
//       created_by
//     )
//     VALUES (?, ?, 1, NOW(), ?)
//     `,
//     [cleanDesignation, normalized, userId || null],
//   );

//   return result;
// }

// async function findDesignationByNameExceptId(designationName, designationId) {
//   const normalized = normalizeDesignation(designationName);

//   const [rows] = await db.default.query(
//     `
//     SELECT designation_id
//     FROM rec_designations
//     WHERE (designation_normalized = ? OR UPPER(TRIM(designation)) = ?)
//       AND designation_id <> ?
//     LIMIT 1
//     `,
//     [normalized, normalized, designationId],
//   );

//   return rows[0] || null;
// }

// async function updateDesignation({ designationId, designation, userId }) {
//   const cleanDesignation = String(designation || '')
//     .trim()
//     .toUpperCase();
//   const normalized = normalizeDesignation(designation);

//   const [result] = await db.default.query(
//     `
//     UPDATE rec_designations
//     SET
//       designation = ?,
//       designation_normalized = ?,
//       updated_at = NOW(),
//       updated_by = ?
//     WHERE designation_id = ?
//     `,
//     [cleanDesignation, normalized, userId || null, designationId],
//   );

//   return result;
// }

// // END -> DESIGNATION MANAGEMENT

// // ======================================================
// // BRANCH MANAGEMENT — add these functions to recordsModel.js
// // ======================================================

// // ── AREAS BY REGION ID ────────────────────────────────
// // Note: getRegionsForMaintenance() already exists in recordsModel.js — reuse it.
// // This new function fetches areas for a given region.

// // async function getAreasByRegionId(office, regionId) {
// //   const dbPool = getRecordsDbPool(office);

// //   const [rows] = await dbPool.query(
// //     `
// //     SELECT
// //       areaid,
// //       area_name,
// //       areaname,
// //       area_manager
// //     FROM areas
// //     WHERE arearegid = ?
// //       AND is_active = 1
// //     ORDER BY area_name ASC
// //     `,
// //     [regionId],
// //   );

// //   return rows;
// // }

// async function getAreasByRegionId(office, regionId) {
//   const dbPool = getRecordsDbPool(office);

//   const { areaTable } = getEmployeeTableConfig(office);

//   const [rows] = await dbPool.query(
//     `
//     SELECT
//       areaid,
//       area_name,
//       areaname,
//       area_manager
//     FROM ${areaTable}
//     WHERE arearegid = ?
//       AND is_active = 1
//     ORDER BY area_name ASC
//     `,
//     [regionId],
//   );

//   return rows;
// }

// // ── BRANCHES BY AREA ──────────────────────────────────
// // async function getBranchesByArea(office, regionId, areaId) {
// //   const dbPool = getRecordsDbPool(office);

// //   const [rows] = await dbPool.query(
// //     `
// //     SELECT
// //       branchcode,
// //       branchname,
// //       branchaddress,
// //       branchcode,
// //       branch_no,
// //       branchregid,
// //       branchareaid,
// //       is_active
// //     FROM branch
// //     WHERE branchregid  = ?
// //       AND branchareaid = ?
// //     ORDER BY branchname ASC
// //     `,
// //     [regionId, areaId],
// //   );

// //   return rows;
// // }

// async function getBranchesByArea(office, regionId, areaId) {
//   const dbPool = getRecordsDbPool(office);

//   const { branchTable } = getEmployeeTableConfig(office);

//   const [rows] = await dbPool.query(
//     `
//     SELECT
//       branchcode,
//       branchname,
//       branchaddress,
//       branch_no,
//       branchregid,
//       branchareaid,
//       is_active
//     FROM ${branchTable}
//     WHERE branchregid = ?
//       AND branchareaid = ?
//     ORDER BY branchname ASC
//     `,
//     [regionId, areaId],
//   );

//   return rows;
// }

// // ── SAVE NEW BRANCH ───────────────────────────────────
// // async function saveBranch({
// //   office,
// //   branchregid,
// //   branchareaid,
// //   branch_no,
// //   branchname,
// //   branchaddress,
// // }) {
// //   const dbPool = getRecordsDbPool(office);

// //   const [result] = await dbPool.query(
// //     `
// //     INSERT INTO branch (
// //       branchname,
// //       branchaddress,
// //       branchregid,
// //       branchareaid,
// //       branch_no,
// //       is_active
// //     )
// //     VALUES (?, ?, ?, ?, ?, 1)
// //     `,
// //     [branchname, branchaddress || null, branchregid, branchareaid, branch_no || null],
// //   );

// //   return result;
// // }

// async function saveBranch({
//   office,
//   branchregid,
//   branchareaid,
//   branch_no,
//   branchname,
//   branchaddress,
// }) {
//   const dbPool = getRecordsDbPool(office);

//   const { branchTable } = getEmployeeTableConfig(office);

//   const [result] = await dbPool.query(
//     `
//     INSERT INTO ${branchTable} (
//       branchname,
//       branchaddress,
//       branchregid,
//       branchareaid,
//       branch_no,
//       is_active
//     )
//     VALUES (?, ?, ?, ?, ?, 1)
//     `,
//     [branchname, branchaddress || null, branchregid, branchareaid, branch_no || null],
//   );

//   return result;
// }

// // ── UPDATE BRANCH ─────────────────────────────────────
// // // ── UPDATE BRANCH ─────────────────────────────────────
// // async function updateBranch({ office, branchcode, branch_no, branchname, branchaddress }) {
// //   const dbPool = getRecordsDbPool(office);

// //   const [result] = await dbPool.query(
// //     `
// //     UPDATE branch
// //     SET
// //       branchname    = ?,
// //       branchaddress = ?,
// //       branch_no     = ?
// //     WHERE branchcode = ?
// //     `,
// //     [branchname, branchaddress || null, branch_no || null, branchcode],
// //   );

// //   return result;
// // }

// // ── UPDATE BRANCH ─────────────────────────────────────
// async function updateBranch({ office, branchcode, branch_no, branchname, branchaddress }) {
//   const dbPool = getRecordsDbPool(office);

//   const { branchTable } = getEmployeeTableConfig(office);

//   const [result] = await dbPool.query(
//     `
//     UPDATE ${branchTable}
//     SET
//       branchname    = ?,
//       branchaddress = ?,
//       branch_no     = ?
//     WHERE branchcode = ?
//     `,
//     [branchname, branchaddress || null, branch_no || null, branchcode],
//   );

//   return result;
// }

// // ── TRANSFER BRANCH ───────────────────────────────────
// // ── TRANSFER BRANCH WITH EMPLOYEE UPDATE ─────────────
// // ── TRANSFER BRANCH WITH EMPLOYEE UPDATE ─────────────
// // ── TRANSFER BRANCH ────────────────────────────────────
// // ✅ KEEP THIS CORRECT FUNCTION
// // ── TRANSFER BRANCH WITH EMPLOYEE UPDATE ─────────────
// // async function transferBranch({ office, branchcode, branchregid, branchareaid }) {
// //   const dbPool = getRecordsDbPool(office);

// //   // Get current branch details first
// //   const [branchDetails] = await dbPool.query(
// //     `
// //     SELECT branchregid AS old_region, branchareaid AS old_area
// //     FROM branch
// //     WHERE branchcode = ?
// //     `,
// //     [branchcode],
// //   );

// //   if (!branchDetails || branchDetails.length === 0) {
// //     throw new Error('Branch not found');
// //   }

// //   const oldRegion = branchDetails[0].old_region;
// //   const oldArea = branchDetails[0].old_area;
// //   const newRegion = branchregid;
// //   const newArea = branchareaid;

// //   // Start transaction
// //   const connection = await dbPool.getConnection();
// //   await connection.beginTransaction();

// //   try {
// //     // 1. Update the branch record
// //     await connection.query(
// //       `
// //       UPDATE branch
// //       SET branchregid = ?, branchareaid = ?
// //       WHERE branchcode = ?
// //       `,
// //       [newRegion, newArea, branchcode],
// //     );

// //     // 2. Update employee records based on what changed
// //     let updateEmployeeQuery = '';
// //     let updateParams = [];

// //     if (oldRegion !== newRegion || oldArea !== newArea) {
// //       if (oldRegion !== newRegion) {
// //         // Region changed - update both
// //         updateEmployeeQuery = `
// //           UPDATE master
// //           SET employeeregion = ?, employeeareamngr = ?
// //           WHERE employeebranch = ?
// //             AND employeeempstat = 1
// //         `;
// //         updateParams = [newRegion, newArea, branchcode];
// //       } else {
// //         // Only area changed
// //         updateEmployeeQuery = `
// //           UPDATE master
// //           SET employeeareamngr = ?
// //           WHERE employeebranch = ?
// //             AND employeeregion = ?
// //             AND employeeempstat = 1
// //         `;
// //         updateParams = [newArea, branchcode, oldRegion];
// //       }
// //     } else {
// //       await connection.rollback();
// //       throw new Error('No changes detected in region or area');
// //     }

// //     // Execute employee update
// //     const [updateResult] = await connection.query(updateEmployeeQuery, updateParams);

// //     console.log(`Transfer branch ${branchcode}: Updated ${updateResult.affectedRows} employee(s)`);

// //     await connection.commit();

// //     return {
// //       success: true,
// //       affectedEmployees: updateResult.affectedRows,
// //       oldRegion,
// //       newRegion,
// //       oldArea,
// //       newArea,
// //     };
// //   } catch (error) {
// //     await connection.rollback();
// //     throw error;
// //   } finally {
// //     connection.release();
// //   }
// // }

// async function transferBranch({ office, branchcode, branchregid, branchareaid }) {
//   const dbPool = getRecordsDbPool(office);

//   const { employeeTable, branchTable } = getEmployeeTableConfig(office);

//   // Start transaction first
//   const connection = await dbPool.getConnection();

//   try {
//     await connection.beginTransaction();

//     // Get current branch details
//     const [branchDetails] = await connection.query(
//       `
//       SELECT
//         branchregid AS old_region,
//         branchareaid AS old_area
//       FROM ${branchTable}
//       WHERE branchcode = ?
//       `,
//       [branchcode],
//     );

//     if (!branchDetails || branchDetails.length === 0) {
//       throw new Error('Branch not found');
//     }

//     const oldRegion = branchDetails[0].old_region;
//     const oldArea = branchDetails[0].old_area;

//     const newRegion = branchregid;
//     const newArea = branchareaid;

//     // Check if anything actually changed
//     if (oldRegion === newRegion && oldArea === newArea) {
//       throw new Error('No changes detected in region or area');
//     }

//     // 1. Update branch
//     await connection.query(
//       `
//       UPDATE ${branchTable}
//       SET
//         branchregid = ?,
//         branchareaid = ?
//       WHERE branchcode = ?
//       `,
//       [newRegion, newArea, branchcode],
//     );

//     // 2. Update employees assigned to this branch
//     let updateEmployeeQuery;
//     let updateParams;

//     if (oldRegion !== newRegion) {
//       // Region changed:
//       // Update both region and area
//       updateEmployeeQuery = `
//         UPDATE ${employeeTable}
//         SET
//           employeeregion = ?,
//           employeeareamngr = ?
//         WHERE employeebranch = ?
//           AND employeeempstat = 1
//       `;

//       updateParams = [newRegion, newArea, branchcode];
//     } else {
//       // Only area changed
//       updateEmployeeQuery = `
//         UPDATE ${employeeTable}
//         SET
//           employeeareamngr = ?
//         WHERE employeebranch = ?
//           AND employeeregion = ?
//           AND employeeempstat = 1
//       `;

//       updateParams = [newArea, branchcode, oldRegion];
//     }

//     const [updateResult] = await connection.query(updateEmployeeQuery, updateParams);

//     console.log(`Transfer branch ${branchcode}: Updated ${updateResult.affectedRows} employee(s)`);

//     await connection.commit();

//     return {
//       success: true,
//       affectedEmployees: updateResult.affectedRows,
//       oldRegion,
//       newRegion,
//       oldArea,
//       newArea,
//     };
//   } catch (error) {
//     await connection.rollback();
//     throw error;
//   } finally {
//     connection.release();
//   }
// }

// // ── GET EMPLOYEES AFFECTED BY BRANCH TRANSFER ──────────
// // ── GET EMPLOYEES AFFECTED BY BRANCH TRANSFER ──────────
// // async function getEmployeesAffectedByTransfer({ office, branchcode, newRegionId, newAreaId }) {
// //   const dbPool = getRecordsDbPool(office);

// //   // Get current branch details
// //   const [branchDetails] = await dbPool.query(
// //     `
// //     SELECT branchregid, branchareaid
// //     FROM branch
// //     WHERE branchcode = ?
// //     `,
// //     [branchcode],
// //   );

// //   if (!branchDetails || branchDetails.length === 0) {
// //     return [];
// //   }

// //   const currentRegion = branchDetails[0].branchregid;
// //   const currentArea = branchDetails[0].branchareaid;

// //   // Only get employees if there's an actual change
// //   if (currentRegion === newRegionId && currentArea === newAreaId) {
// //     return [];
// //   }

// //   let query = `
// //     SELECT
// //       m.employeeid,
// //       m.employeelname,
// //       m.employeefname,
// //       m.employeemi,
// //       m.employeedesignation,
// //       m.employeeregion,
// //       m.employeeareamngr,
// //       r.regionname AS current_region_name,
// //       a.area_name AS current_area_name
// //     FROM master m
// //     LEFT JOIN region r ON r.regionid = m.employeeregion
// //     LEFT JOIN areas a ON a.areaid = m.employeeareamngr
// //     WHERE m.employeebranch = ?
// //       AND m.employeeempstat = 1
// //   `;

// //   const params = [branchcode];

// //   // Only include employees that match current region/area for accuracy
// //   if (currentRegion && currentArea) {
// //     query += ` AND m.employeeregion = ? AND m.employeeareamngr = ?`;
// //     params.push(currentRegion, currentArea);
// //   }

// //   query += ` ORDER BY m.employeelname, m.employeefname`;

// //   const [rows] = await dbPool.query(query, params);

// //   // Add information about what will change
// //   return rows.map((emp) => ({
// //     ...emp,
// //     will_update_region: currentRegion !== newRegionId,
// //     will_update_area: currentArea !== newAreaId,
// //     new_region_id: newRegionId,
// //     new_area_id: newAreaId,
// //   }));
// // }

// async function getEmployeesAffectedByTransfer({ office, branchcode, newRegionId, newAreaId }) {
//   const dbPool = getRecordsDbPool(office);

//   const { employeeTable, regionTable, areaTable, branchTable } = getEmployeeTableConfig(office);

//   // Get current branch details
//   const [branchDetails] = await dbPool.query(
//     `
//     SELECT
//       branchregid,
//       branchareaid
//     FROM ${branchTable}
//     WHERE branchcode = ?
//     `,
//     [branchcode],
//   );

//   if (!branchDetails || branchDetails.length === 0) {
//     return [];
//   }

//   const currentRegion = branchDetails[0].branchregid;
//   const currentArea = branchDetails[0].branchareaid;

//   // No actual change
//   if (currentRegion === newRegionId && currentArea === newAreaId) {
//     return [];
//   }

//   let query = `
//     SELECT
//       m.employeeid,
//       m.employeelname,
//       m.employeefname,
//       m.employeemi,
//       m.employeedesignation,
//       m.employeeregion,
//       m.employeeareamngr,
//       r.regionname AS current_region_name,
//       a.area_name AS current_area_name

//     FROM ${employeeTable} m

//     LEFT JOIN ${regionTable} r
//       ON r.regionid = m.employeeregion

//     LEFT JOIN ${areaTable} a
//       ON a.areaid = m.employeeareamngr

//     WHERE m.employeebranch = ?
//       AND m.employeeempstat = 1
//   `;

//   const params = [branchcode];

//   // Only include employees currently assigned
//   // to this branch's region and area
//   if (currentRegion && currentArea) {
//     query += `
//       AND m.employeeregion = ?
//       AND m.employeeareamngr = ?
//     `;

//     params.push(currentRegion, currentArea);
//   }

//   query += `
//     ORDER BY
//       m.employeelname,
//       m.employeefname
//   `;

//   const [rows] = await dbPool.query(query, params);

//   return rows.map((emp) => ({
//     ...emp,
//     will_update_region: currentRegion !== newRegionId,
//     will_update_area: currentArea !== newAreaId,
//     new_region_id: newRegionId,
//     new_area_id: newAreaId,
//   }));
// }

// // ── TOGGLE STATUS ─────────────────────────────────────
// // async function toggleBranchStatus({ office, branchcode, is_active }) {
// //   const dbPool = getRecordsDbPool(office);

// //   const [result] = await dbPool.query(
// //     `
// //     UPDATE branch
// //     SET is_active = ?
// //     WHERE branchcode = ?
// //     `,
// //     [is_active, branchcode],
// //   );

// //   return result;
// // }
// async function toggleBranchStatus({ office, branchcode, is_active }) {
//   const dbPool = getRecordsDbPool(office);

//   const { branchTable } = getEmployeeTableConfig(office);

//   const [result] = await dbPool.query(
//     `
//     UPDATE ${branchTable}
//     SET is_active = ?
//     WHERE branchcode = ?
//     `,
//     [is_active, branchcode],
//   );

//   return result;
// }

// // ── CHECK IF BRANCH HAS ACTIVE EMPLOYEES ──────────────────
// // ── CHECK IF BRANCH HAS ACTIVE EMPLOYEES (OPTIMIZED) ──
// // ── CHECK IF BRANCH HAS ACTIVE EMPLOYEES ──────────────────
// // ── CHECK IF BRANCH HAS ACTIVE EMPLOYEES ──────────────────
// // async function hasActiveEmployeesInBranch({ office, branchcode }) {
// //   const dbPool = getRecordsDbPool(office);

// //   const [rows] = await dbPool.query(
// //     `
// //     SELECT COUNT(*) as count
// //     FROM master m
// //     WHERE m.employeebranch = ?
// //       AND m.employeeempstat = 1
// //       AND UPPER(TRIM(m.employmentstatus)) = 'ACTIVE'
// //     `,
// //     [branchcode],
// //   );

// //   return rows[0].count > 0;
// // }

// async function hasActiveEmployeesInBranch({ office, branchcode }) {
//   const dbPool = getRecordsDbPool(office);

//   const { employeeTable } = getEmployeeTableConfig(office);

//   const [rows] = await dbPool.query(
//     `
//     SELECT COUNT(*) AS count
//     FROM ${employeeTable} m
//     WHERE m.employeebranch = ?
//       AND m.employeeempstat = 1
//       AND UPPER(TRIM(m.employmentstatus)) = 'ACTIVE'
//     `,
//     [branchcode],
//   );

//   return Number(rows[0].count) > 0;
// }

// // ── GET ACTIVE EMPLOYEES BY BRANCH (OPTIMIZED) ────────
// // ── GET ACTIVE EMPLOYEES BY BRANCH ────────────────────────
// // async function getActiveEmployeesByBranch({ office, branchcode }) {
// //   const dbPool = getRecordsDbPool(office);

// //   const [rows] = await dbPool.query(
// //     `
// //     SELECT
// //       m.employeeid,
// //       m.employeelname,
// //       m.employeefname,
// //       m.employeemi,
// //       m.employeedesignation,
// //       m.employmentstatus,
// //       m.employeeempstat,
// //       r.regionname,
// //       a.area_name
// //     FROM master m
// //     LEFT JOIN region r ON r.regionid = m.employeeregion
// //     LEFT JOIN areas a ON a.areaid = m.employeeareamngr
// //     WHERE m.employeebranch = ?
// //       AND m.employeeempstat = 1
// //       AND UPPER(TRIM(m.employmentstatus)) = 'ACTIVE'
// //     ORDER BY m.employeelname, m.employeefname
// //     `,
// //     [branchcode],
// //   );

// //   return rows;
// // }

// async function getActiveEmployeesByBranch({ office, branchcode }) {
//   const dbPool = getRecordsDbPool(office);

//   const { employeeTable, regionTable, areaTable } = getEmployeeTableConfig(office);

//   const [rows] = await dbPool.query(
//     `
//     SELECT
//       m.employeeid,
//       m.employeelname,
//       m.employeefname,
//       m.employeemi,
//       m.employeedesignation,
//       m.employmentstatus,
//       m.employeeempstat,
//       r.regionname,
//       a.area_name

//     FROM ${employeeTable} m

//     LEFT JOIN ${regionTable} r
//       ON r.regionid = m.employeeregion

//     LEFT JOIN ${areaTable} a
//       ON a.areaid = m.employeeareamngr

//     WHERE m.employeebranch = ?
//       AND m.employeeempstat = 1
//       AND UPPER(TRIM(m.employmentstatus)) = 'ACTIVE'

//     ORDER BY
//       m.employeelname,
//       m.employeefname
//     `,
//     [branchcode],
//   );

//   return rows;
// }

// // ── GET BRANCH DETAILS ────────────────────────────────────
// // ── GET BRANCH DETAILS ────────────────────────────────────
// // async function getBranchDetails({ office, branchcode }) {
// //   const dbPool = getRecordsDbPool(office);

// //   const [rows] = await dbPool.query(
// //     `
// //     SELECT branchcode, branchname, branchregid, branchareaid, is_active
// //     FROM branch
// //     WHERE branchcode = ?
// //     `,
// //     [branchcode],
// //   );

// //   return rows[0] || null;
// // }
// async function getBranchDetails({ office, branchcode }) {
//   const dbPool = getRecordsDbPool(office);

//   const { branchTable } = getEmployeeTableConfig(office);

//   const [rows] = await dbPool.query(
//     `
//     SELECT
//       branchcode,
//       branchname,
//       branchregid,
//       branchareaid,
//       is_active
//     FROM ${branchTable}
//     WHERE branchcode = ?
//     `,
//     [branchcode],
//   );

//   return rows[0] || null;
// }

// // ======================================================
// // BRANCH MANAGEMENT — Handle Unassigned Branches
// // ======================================================

// // ======================================================
// // BRANCH MANAGEMENT — Handle Unassigned Branches
// // ======================================================

// // ── GET BRANCHES WITHOUT AREA ID ──────────────────────
// // async function getBranchesWithoutArea({ office, regionId }) {
// //   const dbPool = getRecordsDbPool(office);
// //   console.log(
// //     `
// //     SELECT
// //       b.branchcode,
// //       b.branchname,
// //       b.branchaddress,
// //       b.branch_no,
// //       b.branchareaid,
// //       b.is_active,
// //       b.branchregid,
// //       r.regionname AS region_name
// //     FROM branch b
// //     LEFT JOIN region r ON r.regionid = b.branchregid
// //     WHERE b.branchregid = ?
// //       AND (b.branchareaid IS NULL OR b.branchareaid = 0)
// //       AND b.is_active = 1
// //     ORDER BY b.branchname ASC
// //     `,
// //     [regionId],
// //   );
// //   const [rows] = await dbPool.query(
// //     `
// //     SELECT
// //       b.branchcode,
// //       b.branchname,
// //       b.branchaddress,
// //       b.branch_no,
// //       b.branchareaid,
// //       b.is_active,
// //       b.branchregid,
// //       r.regionname AS region_name
// //     FROM branch b
// //     LEFT JOIN region r ON r.regionid = b.branchregid
// //     WHERE b.branchregid = ?
// //       AND (b.branchareaid IS NULL OR b.branchareaid = 0)
// //       AND b.is_active = 1
// //     ORDER BY b.branchname ASC
// //     `,
// //     [regionId],
// //   );

// //   return rows;
// // }

// async function getBranchesWithoutArea({ office, regionId }) {
//   const dbPool = getRecordsDbPool(office);

//   const { branchTable, regionTable } = getEmployeeTableConfig(office);

//   const query = `
//     SELECT
//       b.branchcode,
//       b.branchname,
//       b.branchaddress,
//       b.branch_no,
//       b.branchareaid,
//       b.is_active,
//       b.branchregid,
//       r.regionname AS region_name
//     FROM ${branchTable} b
//     LEFT JOIN ${regionTable} r
//       ON r.regionid = b.branchregid
//     WHERE b.branchregid = ?
//       AND (b.branchareaid IS NULL OR b.branchareaid = 0)
//       AND b.is_active = 1
//     ORDER BY b.branchname ASC
//   `;

//   console.log('getBranchesWithoutArea:', {
//     office,
//     regionId,
//     branchTable,
//     regionTable,
//   });

//   const [rows] = await dbPool.query(query, [regionId]);

//   return rows;
// }

// // ── BULK ASSIGN BRANCHES TO AREA ──────────────────────
// // async function bulkAssignBranchesToArea({ office, branchAreaId, branchCodes }) {
// //   const dbPool = getRecordsDbPool(office);

// //   // Use a transaction
// //   const connection = await dbPool.getConnection();
// //   await connection.beginTransaction();

// //   try {
// //     // First, verify the area exists
// //     const [areaCheck] = await connection.query(
// //       `
// //       SELECT areaid
// //       FROM areas
// //       WHERE areaid = ? AND is_active = 1
// //       `,
// //       [branchAreaId],
// //     );

// //     if (!areaCheck || areaCheck.length === 0) {
// //       throw new Error('Target area not found or inactive.');
// //     }

// //     // Get the region ID from the area
// //     const [areaDetails] = await connection.query(
// //       `
// //       SELECT arearegid
// //       FROM areas
// //       WHERE areaid = ?
// //       `,
// //       [branchAreaId],
// //     );

// //     const regionId = areaDetails[0]?.arearegid;

// //     if (!regionId) {
// //       throw new Error('Area does not have a region assigned.');
// //     }

// //     // Update all selected branches
// //     const placeholders = branchCodes.map(() => '?').join(',');
// //     const updateParams = [branchAreaId, regionId, ...branchCodes];

// //     const [result] = await connection.query(
// //       `
// //       UPDATE branch
// //       SET
// //         branchareaid = ?,
// //         branchregid = ?,
// //         updated_at = NOW()
// //       WHERE branchcode IN (${placeholders})
// //         AND is_active = 1
// //       `,
// //       updateParams,
// //     );

// //     // Get the branches that were updated to update employees
// //     const [updatedBranches] = await connection.query(
// //       `
// //       SELECT branchcode
// //       FROM branch
// //       WHERE branchcode IN (${placeholders})
// //         AND branchareaid = ?
// //       `,
// //       [...branchCodes, branchAreaId],
// //     );

// //     // Update employees in those branches
// //     if (updatedBranches.length > 0) {
// //       const branchCodesList = updatedBranches.map((b) => b.branchcode);
// //       const empPlaceholders = branchCodesList.map(() => '?').join(',');

// //       await connection.query(
// //         `
// //         UPDATE master
// //         SET
// //           employeeregion = ?,
// //           employeeareamngr = ?
// //         WHERE employeebranch IN (${empPlaceholders})
// //           AND employeeempstat = 1
// //         `,
// //         [regionId, branchAreaId, ...branchCodesList],
// //       );
// //     }

// //     await connection.commit();

// //     return {
// //       success: true,
// //       affectedRows: result.affectedRows || 0,
// //     };
// //   } catch (error) {
// //     await connection.rollback();
// //     throw error;
// //   } finally {
// //     connection.release();
// //   }
// // }

// async function bulkAssignBranchesToArea({ office, branchAreaId, branchCodes }) {
//   const dbPool = getRecordsDbPool(office);

//   const { employeeTable, areaTable, branchTable } = getEmployeeTableConfig(office);

//   const connection = await dbPool.getConnection();

//   try {
//     await connection.beginTransaction();

//     // First, verify the area exists
//     const [areaCheck] = await connection.query(
//       `
//       SELECT areaid
//       FROM ${areaTable}
//       WHERE areaid = ?
//         AND is_active = 1
//       `,
//       [branchAreaId],
//     );

//     if (!areaCheck || areaCheck.length === 0) {
//       throw new Error('Target area not found or inactive.');
//     }

//     // Get the region ID from the area
//     const [areaDetails] = await connection.query(
//       `
//       SELECT arearegid
//       FROM ${areaTable}
//       WHERE areaid = ?
//       `,
//       [branchAreaId],
//     );

//     const regionId = areaDetails[0]?.arearegid;

//     if (!regionId) {
//       throw new Error('Area does not have a region assigned.');
//     }

//     // Update all selected branches
//     const placeholders = branchCodes.map(() => '?').join(',');

//     const updateParams = [branchAreaId, regionId, ...branchCodes];

//     const [result] = await connection.query(
//       `
//       UPDATE ${branchTable}
//       SET
//         branchareaid = ?,
//         branchregid = ?,
//         updated_at = NOW()
//       WHERE branchcode IN (${placeholders})
//         AND is_active = 1
//       `,
//       updateParams,
//     );

//     // Get branches that were updated
//     const [updatedBranches] = await connection.query(
//       `
//       SELECT branchcode
//       FROM ${branchTable}
//       WHERE branchcode IN (${placeholders})
//         AND branchareaid = ?
//       `,
//       [...branchCodes, branchAreaId],
//     );

//     // Update employees assigned to those branches
//     if (updatedBranches.length > 0) {
//       const branchCodesList = updatedBranches.map((b) => b.branchcode);

//       const empPlaceholders = branchCodesList.map(() => '?').join(',');

//       await connection.query(
//         `
//         UPDATE ${employeeTable}
//         SET
//           employeeregion = ?,
//           employeeareamngr = ?
//         WHERE employeebranch IN (${empPlaceholders})
//           AND employeeempstat = 1
//         `,
//         [regionId, branchAreaId, ...branchCodesList],
//       );
//     }

//     await connection.commit();

//     return {
//       success: true,
//       affectedRows: result.affectedRows || 0,
//     };
//   } catch (error) {
//     await connection.rollback();
//     throw error;
//   } finally {
//     connection.release();
//   }
// }

// // ── GET AREA_NAME BY ID ───────────────────────────────
// // async function getAreaNameById({ office, areaId }) {
// //   const dbPool = getRecordsDbPool(office);

// //   const [rows] = await dbPool.query(
// //     `
// //     SELECT area_name, arearegid
// //     FROM areas
// //     WHERE areaid = ? AND is_active = 1
// //     `,
// //     [areaId],
// //   );

// //   return rows[0] || null;
// // }

// async function getAreaNameById({ office, areaId }) {
//   const dbPool = getRecordsDbPool(office);

//   const { areaTable } = getEmployeeTableConfig(office);

//   const [rows] = await dbPool.query(
//     `
//     SELECT
//       area_name,
//       arearegid
//     FROM ${areaTable}
//     WHERE areaid = ?
//       AND is_active = 1
//     `,
//     [areaId],
//   );

//   return rows[0] || null;
// }

// // END BRANCH MANAGEMENT

// // START EMPLOYEE BRANCH ASSIGNMENT
// // ======================================================
// // EMPLOYEE RECORDS VIEWER - Model Functions
// // ======================================================

// /**
//  * Get employees based on filters (region, area, branch)
//  * Only returns active employees (employment_status = 'ACTIVE' OR employeeempstat = 1)
//  */
// // async function getEmployeesByFilters({ office, region, area, branch }) {
// //   const dbPool = getRecordsDbPool(office);

// //   let query = `
// //     SELECT
// //       e.employeeid AS idno,
// //       e.employeelname AS lastname,
// //       e.employeefname AS firstname,
// //       e.employeemi AS middlename,
// //       e.employeedesignation AS designation
// //     FROM master e
// //     WHERE e.employeeempstat = 1
// //       AND e.employment_status = 9  -- Active status
// //   `;

// //   const params = [];

// //   if (region) {
// //     query += ` AND e.employeeregion = ?`;
// //     params.push(region);
// //   }

// //   if (area) {
// //     query += ` AND e.employeeareamngr = ?`;
// //     params.push(area);
// //   }

// //   if (branch) {
// //     query += ` AND e.employeebranch = ?`;
// //     params.push(branch);
// //   }

// //   query += ` ORDER BY e.employeelname, e.employeefname`;

// //   const [rows] = await dbPool.query(query, params);
// //   return rows;
// // }

// async function getEmployeesByFilters({ office, region, area, branch }) {
//   const dbPool = getRecordsDbPool(office);

//   const { employeeTable } = getEmployeeTableConfig(office);

//   let query = `
//     SELECT
//       e.employeeid AS idno,
//       e.employeelname AS lastname,
//       e.employeefname AS firstname,
//       e.employeemi AS middlename,
//       e.employeedesignation AS designation
//     FROM ${employeeTable} e
//     WHERE e.employeeempstat = 1
//       AND e.employment_status = 9
//   `;

//   const params = [];

//   if (region) {
//     query += ` AND e.employeeregion = ?`;
//     params.push(region);
//   }

//   if (area) {
//     query += ` AND e.employeeareamngr = ?`;
//     params.push(area);
//   }

//   if (branch) {
//     query += ` AND e.employeebranch = ?`;
//     params.push(branch);
//   }

//   query += `
//     ORDER BY
//       e.employeelname,
//       e.employeefname
//   `;

//   const [rows] = await dbPool.query(query, params);

//   return rows;
// }

// /**
//  * Get regions for the viewer with active employee count
//  */
// /**
//  * Get regions for the viewer with active employee count
//  */
// // async function getRegionsWithCount(office) {
// //   const dbPool = getRecordsDbPool(office);
// //   const [rows] = await dbPool.query(`
// //     SELECT
// //       r.regionid,
// //       r.regionname,
// //       COUNT(CASE WHEN e.employeeempstat = 1 AND e.employment_status = 9
// //                  THEN e.employeeid END) AS employee_count
// //     FROM region r
// //     LEFT JOIN master e ON e.employeeregion = r.regionid
// //     WHERE r.active = 1 OR r.active IS NULL
// //     GROUP BY r.regionid, r.regionname
// //     ORDER BY r.regionname ASC
// //   `);
// //   return rows;
// // }
// async function getRegionsWithCount(office) {
//   const dbPool = getRecordsDbPool(office);

//   const { regionTable, employeeTable } = getEmployeeTableConfig(office);

//   const [rows] = await dbPool.query(`
//     SELECT
//       r.regionid,
//       r.regionname,
//       COUNT(e.employeeid) AS employee_count

//     FROM ${regionTable} r

//     LEFT JOIN ${employeeTable} e
//       ON e.employeeregion = r.regionid
//       AND e.employeeempstat = 1
//       AND e.employment_status = 9

//     WHERE r.active = 1
//        OR r.active IS NULL

//     GROUP BY
//       r.regionid,
//       r.regionname

//     ORDER BY
//       r.regionname ASC
//   `);

//   return rows;
// }
// /**
//  * Get areas for the viewer with active employee count
//  */
// /**
//  * Get areas for the viewer with active employee count
//  */
// // async function getAreasWithCount({ office, regionId }) {
// //   const dbPool = getRecordsDbPool(office);
// //   const [rows] = await dbPool.query(
// //     `
// //     SELECT
// //       a.areaid,
// //       a.area_name,
// //       COUNT(CASE WHEN e.employeeempstat = 1 AND e.employment_status = 9 AND b.is_active = 1
// //                  THEN e.employeeid END) AS employee_count
// //     FROM areas a
// //     LEFT JOIN branch b ON b.branchareaid = a.areaid
// //     LEFT JOIN master e ON e.employeebranch = b.branchcode AND e.employeeregion = ?
// //     WHERE a.arearegid = ? AND a.is_active = 1
// //     GROUP BY a.areaid, a.area_name
// //     ORDER BY a.area_name ASC
// //   `,
// //     [regionId, regionId],
// //   );
// //   return rows;
// // }

// async function getAreasWithCount({ office, regionId }) {
//   const dbPool = getRecordsDbPool(office);

//   const isMlinc =
//     String(office || '')
//       .trim()
//       .toLowerCase() === 'mlinc';

//   const areaTable = isMlinc ? 'hr_employees_mlinc_areas' : 'areas';

//   const branchTable = isMlinc ? 'hr_employees_mlinc_branches' : 'branch';

//   const employeeTable = isMlinc ? 'hr_employees_mlinc' : 'master';

//   const [rows] = await dbPool.query(
//     `
//     SELECT
//       a.areaid,
//       a.area_name,
//       COUNT(
//         CASE
//           WHEN e.employeeempstat = 1
//             AND e.employment_status = 9
//             AND b.is_active = 1
//           THEN e.employeeid
//         END
//       ) AS employee_count
//     FROM ${areaTable} a
//     LEFT JOIN ${branchTable} b
//       ON b.branchareaid = a.areaid
//     LEFT JOIN ${employeeTable} e
//       ON e.employeebranch = b.branchcode
//       AND e.employeeregion = ?
//     WHERE a.arearegid = ?
//       AND a.is_active = 1
//     GROUP BY a.areaid, a.area_name
//     ORDER BY a.area_name ASC
//     `,
//     [regionId, regionId],
//   );

//   return rows;
// }

// /**
//  * Get branches for the viewer with active employee count
//  */
// /**
//  * Get branches for the viewer with active employee count
//  */
// // async function getBranchesWithCount({ office, regionId, areaId }) {
// //   const dbPool = getRecordsDbPool(office);
// //   const [rows] = await dbPool.query(
// //     `
// //     SELECT
// //       b.branchcode,
// //       b.branchname,
// //       COUNT(CASE WHEN e.employeeempstat = 1 AND e.employment_status = 9
// //                  THEN e.employeeid END) AS employee_count
// //     FROM branch b
// //     LEFT JOIN master e ON e.employeebranch = b.branchcode AND e.employeeregion = ?
// //     WHERE b.branchregid = ? AND b.branchareaid = ? AND b.is_active = 1
// //     GROUP BY b.branchcode, b.branchname
// //     ORDER BY b.branchname ASC
// //   `,
// //     [regionId, regionId, areaId],
// //   );
// //   return rows;
// // }
// async function getBranchesWithCount({ office, regionId, areaId }) {
//   const dbPool = getRecordsDbPool(office);

//   const isMlinc =
//     String(office || '')
//       .trim()
//       .toLowerCase() === 'mlinc';

//   const branchTable = isMlinc ? 'hr_employees_mlinc_branches' : 'branch';

//   const employeeTable = isMlinc ? 'hr_employees_mlinc' : 'master';

//   const [rows] = await dbPool.query(
//     `
//     SELECT
//       b.branchcode,
//       b.branchname,
//       COUNT(
//         CASE
//           WHEN e.employeeempstat = 1
//             AND e.employment_status = 9
//           THEN e.employeeid
//         END
//       ) AS employee_count
//     FROM ${branchTable} b
//     LEFT JOIN ${employeeTable} e
//       ON e.employeebranch = b.branchcode
//       AND e.employeeregion = ?
//     WHERE b.branchregid = ?
//       AND b.branchareaid = ?
//       AND b.is_active = 1
//     GROUP BY b.branchcode, b.branchname
//     ORDER BY b.branchname ASC
//     `,
//     [regionId, regionId, areaId],
//   );

//   return rows;
// }
// // END EMPLOYEE BRANCH ASSIGNMENT

// // Add to recordsModel.js after getEmployeeMasterlist function

// // async function getNewHires(filters) {
// //   try {
// //     const { office, region, sortBy, dateFrom, dateTo, page = 1, limit = 30 } = filters;

// //     const offset = (page - 1) * limit;
// //     const dbPool = getRecordsDbPool(office);

// //     // Determine sorting
// //     let sortClause = 'ORDER BY e.employeelname, e.employeefname';
// //     if (sortBy && sortBy.toLowerCase() === 'region') {
// //       sortClause = 'ORDER BY r.regionname, e.employeelname, e.employeefname';
// //     }

// //     // Base columns - includes all requested fields
// //     // const columns = `
// //     //   r.regionname AS "Region",
// //     //   e.employeeid AS "ID No",
// //     //   e.employeelname AS "Last Name",
// //     //   e.employeefname AS "First Name",
// //     //         e.employeemi AS "Middle Name",
// //     //   e.employeebdate AS "Birthdate",
// //     //   e.employeedesignation AS "Designation",
// //     //   b.branchname AS "Branch",
// //     //   e.employeestatus AS "Civil Status",
// //     //   e.employmentstatus AS "Employment Status",
// //     //   e.employeedateemp AS "Hired Date"
// //     // `;

// //     const columns = `
// //       r.regionname AS "Region",
// //       e.employeeid AS "ID No",
// //       e.employeelname AS "Last Name",
// //       e.employeefname AS "First Name",
// //             e.employeemi AS "Middle Name",
// //       e.employeebdate AS "Birthdate",
// //       e.employeedesignation AS "Designation",
// //       b.branchname AS "Branch",
// //       e.employeestatus AS "Civil Status",
// //       e.employmentstatus AS "Employment Status",
// //       e.employeedateemp AS "Hired Date",
// //       e.employeecontactno AS "Contact No",
// //       e.walletno AS "Wallet No"
// //     `;

// //     // Build WHERE clause
// //     let whereClause = ' WHERE 1=1 ';
// //     let params = [];

// //     // Only get active employees with employment status = 9 (Active)
// //     whereClause += ' AND e.employment_status = 9';
// //     whereClause += ' AND e.employeeempstat = 1';

// //     if (region) {
// //       whereClause += ' AND e.employeeregion = ?';
// //       params.push(region);
// //     }

// //     // Date range filter (date hired)
// //     if (dateFrom && dateTo) {
// //       whereClause += ' AND DATE(e.employeedateemp) BETWEEN ? AND ?';
// //       params.push(dateFrom, dateTo);
// //     } else if (dateFrom) {
// //       whereClause += ' AND DATE(e.employeedateemp) >= ?';
// //       params.push(dateFrom);
// //     } else if (dateTo) {
// //       whereClause += ' AND DATE(e.employeedateemp) <= ?';
// //       params.push(dateTo);
// //     }

// //     // Data query with pagination
// //     const dataQuery = `
// //       SELECT ${columns}
// //       FROM master e
// //       LEFT JOIN branch b ON b.branchcode = e.employeebranch
// //       LEFT JOIN region r ON r.regionid = e.employeeregion
// //       LEFT JOIN areas a ON a.areaid = e.employeeareamngr
// //       ${whereClause}
// //       ${sortClause}
// //       LIMIT ? OFFSET ?
// //     `;

// //     const dataParams = [...params, Number(limit), Number(offset)];

// //     // Count query
// //     const countQuery = `
// //       SELECT COUNT(*) AS total
// //       FROM master e
// //       LEFT JOIN branch b ON b.branchcode = e.employeebranch
// //       LEFT JOIN region r ON r.regionid = e.employeeregion
// //       LEFT JOIN areas a ON a.areaid = e.employeeareamngr
// //       ${whereClause}
// //     `;

// //     const [[{ total }]] = await dbPool.query(countQuery, params);
// //     const [rows] = await dbPool.query(dataQuery, dataParams);

// //     const totalPages = Math.ceil(total / limit);

// //     return {
// //       rows,
// //       total,
// //       totalPages,
// //       currentPage: Number(page),
// //     };
// //   } catch (error) {
// //     console.error('Error in getNewHires:', error);
// //     throw error;
// //   }
// // }

// async function getNewHires(filters) {
//   try {
//     const { office, region, sortBy, dateFrom, dateTo, page = 1, limit = 30 } = filters;

//     const offset = (page - 1) * limit;
//     const dbPool = getRecordsDbPool(office);

//     const isMlinc =
//       String(office || '')
//         .trim()
//         .toLowerCase() === 'mlinc';

//     const employeeTable = isMlinc ? 'hr_employees_mlinc' : 'master';

//     const branchTable = isMlinc ? 'hr_employees_mlinc_branches' : 'branch';

//     const regionTable = isMlinc ? 'hr_employees_mlinc_regions' : 'region';

//     const areaTable = isMlinc ? 'hr_employees_mlinc_areas' : 'areas';

//     // Determine sorting
//     let sortClause = 'ORDER BY e.employeelname, e.employeefname';

//     if (sortBy && sortBy.toLowerCase() === 'region') {
//       sortClause = 'ORDER BY r.regionname, e.employeelname, e.employeefname';
//     }

//     const columns = `
//       r.regionname AS "Region",
//       e.employeeid AS "ID No",
//       e.employeelname AS "Last Name",
//       e.employeefname AS "First Name",
//       e.employeemi AS "Middle Name",
//       e.employeebdate AS "Birthdate",
//       e.employeedesignation AS "Designation",
//       b.branchname AS "Branch",
//       e.employeestatus AS "Civil Status",
//       e.employmentstatus AS "Employment Status",
//       e.employeedateemp AS "Hired Date",
//       e.employeecontactno AS "Contact No",
//       e.walletno AS "Wallet No"
//     `;

//     // Build WHERE clause
//     let whereClause = ' WHERE 1=1 ';
//     let params = [];

//     // Only get active employees with employment status = 9 (Active)
//     whereClause += ' AND e.employment_status = 9';
//     whereClause += ' AND e.employeeempstat = 1';

//     if (region) {
//       whereClause += ' AND e.employeeregion = ?';
//       params.push(region);
//     }

//     // Date range filter (date hired)
//     if (dateFrom && dateTo) {
//       whereClause += ' AND DATE(e.employeedateemp) BETWEEN ? AND ?';
//       params.push(dateFrom, dateTo);
//     } else if (dateFrom) {
//       whereClause += ' AND DATE(e.employeedateemp) >= ?';
//       params.push(dateFrom);
//     } else if (dateTo) {
//       whereClause += ' AND DATE(e.employeedateemp) <= ?';
//       params.push(dateTo);
//     }

//     // Data query with pagination
//     const dataQuery = `
//       SELECT ${columns}
//       FROM ${employeeTable} e
//       LEFT JOIN ${branchTable} b
//         ON b.branchcode = e.employeebranch
//       LEFT JOIN ${regionTable} r
//         ON r.regionid = e.employeeregion
//       LEFT JOIN ${areaTable} a
//         ON a.areaid = e.employeeareamngr
//       ${whereClause}
//       ${sortClause}
//       LIMIT ? OFFSET ?
//     `;

//     const dataParams = [...params, Number(limit), Number(offset)];

//     // Count query
//     const countQuery = `
//       SELECT COUNT(*) AS total
//       FROM ${employeeTable} e
//       LEFT JOIN ${branchTable} b
//         ON b.branchcode = e.employeebranch
//       LEFT JOIN ${regionTable} r
//         ON r.regionid = e.employeeregion
//       LEFT JOIN ${areaTable} a
//         ON a.areaid = e.employeeareamngr
//       ${whereClause}
//     `;

//     const [[{ total }]] = await dbPool.query(countQuery, params);

//     const [rows] = await dbPool.query(dataQuery, dataParams);

//     const totalPages = Math.ceil(total / limit);

//     return {
//       rows,
//       total,
//       totalPages,
//       currentPage: Number(page),
//     };
//   } catch (error) {
//     console.error('Error in getNewHires:', error);
//     throw error;
//   }
// }

// module.exports = {
//   createEmployee,
//   employeeExists,

//   officeHasApplicantModule,
//   searchApplicants,
//   getApplicantById,

//   getEmployeeMasterlist,
//   searchRegionManager,
//   findRegionByName,
//   findActiveEmployeeById,
//   saveRegion,
//   saveSubUnit,
//   getRegionsForMaintenance,
//   getRegionById,
//   getSubUnitsByRegionId,
//   findRegionByNameExceptId,
//   updateRegion,
//   deleteSubUnitsByRegionId,

//   saveOrUpdateSubUnit,
//   getEmployeesAssignedToRemovedAreas,
//   deactivateRemovedSubUnits,
//   getRankingByOffice,
//   saveEmployeeToMaster,
//   markApplicantAsOnboarded,

//   searchEmployeesForUpdate,
//   getEmployeeForUpdate,
//   updateEmployeeRecord,
//   getAllDesignations,
//   findDesignationByName,
//   saveDesignation,
//   findDesignationByNameExceptId,
//   updateDesignation,

//   getAreasByRegionId,
//   getBranchesByArea,
//   saveBranch,
//   updateBranch,
//   transferBranch,
//   toggleBranchStatus,
//   getActiveEmployeesByBranch,
//   hasActiveEmployeesInBranch,
//   getBranchDetails,
//   getEmployeesAffectedByTransfer,
//   getBranchesWithoutArea,
//   getAreaNameById,
//   bulkAssignBranchesToArea,

//   getEmployeesByFilters,
//   getRegionsWithCount,
//   getAreasWithCount,
//   getBranchesWithCount,
//   getNewHires,
// };

const utilitiesModel = require('./utilitiesModel');
const db = require('../config/db');

/**
 * Insert new employee record
 * @param {Object} employeeData
 */
const createEmployee = async (employeeData) => {
  const {
    idno,
    lastname,
    firstname,
    middle_initial,
    office,
    region,
    branch,
    employment_status,
    designation,
    date_hired,
    marital_status,
  } = employeeData;

  // Get correct DB pool based on office
  const pool = utilitiesModel.getDbPool(office);

  if (!pool) {
    throw new Error('Invalid office database pool');
  }

  /**
   * ⚠️ Adjust table & column names as needed
   * This matches your payroll employee naming convention
   */
  const insertQuery = `
    INSERT INTO main_employees (
      E_IDNO,
      E_LN,
      E_FN,
      E_MI,
      E_OFFICE,
      E_REGION,
      E_BRANCH,
      E_COMPSTAT,
      E_DESIGNATION,
      E_DATEHIRED,
      E_MARITAL_STATUS
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    idno,
    lastname,
    firstname,
    middle_initial || null,
    office,
    region,
    branch,
    employment_status,
    designation,
    date_hired,
    marital_status,
  ];

  const [result] = await pool.query(insertQuery, values);

  return result;
};

/**
 * Check if employee ID already exists
 * (Recommended before insert)
 */
const employeeExists = async (idno, office) => {
  const pool = utilitiesModel.getDbPool(office);

  if (!pool) {
    throw new Error('Invalid office database pool');
  }

  const query = `
    SELECT 1
    FROM main_employees
    WHERE E_IDNO = ?
    LIMIT 1
  `;

  const [rows] = await pool.query(query, [idno]);
  return rows.length > 0;
};

//START EMPLOYEE ENTRY
function officeHasApplicantModule(office) {
  const normalizedOffice = String(office || '').toLowerCase();

  const applicantConfig = {
    vismin: true,
    luzon: false,
    mlinc: false,
  };

  return applicantConfig[normalizedOffice] === true;
}

async function searchApplicants({ office, keyword }) {
  if (!officeHasApplicantModule(office)) {
    return [];
  }

  const dbPool = getRecordsDbPool('default');
  const searchKeyword = `%${keyword}%`;

  const [rows] = await dbPool.query(
    `
    SELECT
      applicantid,
      lastname,
      firstname,
      middlename,
      examdate,
      onboarded
    FROM recruitment_applicantinfo
    WHERE lastname LIKE ?
       OR firstname LIKE ?
       OR middlename LIKE ?
    ORDER BY lastname, firstname
    LIMIT 50
    `,
    [searchKeyword, searchKeyword, searchKeyword],
  );

  return rows.map((row) => ({
    ...row,
    canProceed: Number(row.onboarded) === 0,
  }));
}

async function getApplicantById({ office, applicantId }) {
  if (!officeHasApplicantModule(office)) {
    return null;
  }

  const dbPool = getRecordsDbPool('default');

  const [rows] = await dbPool.query(
    `
    SELECT
      applicantid,
      lastname,
      firstname,
      middlename,
      birthdate,
      currentaddress as address,
      onboarded
    FROM recruitment_applicantinfo
    WHERE applicantid = ?
    LIMIT 1
    `,
    [applicantId],
  );

  return rows[0] || null;
}
//END EMPLOYEE ENTRY

//START SAVE EMPLOYEE

/**
 * Central source of truth for which tables to use per office.
 * All functions below should read table names from here instead
 * of hardcoding 'master' / 'region' / 'areas' / 'branch' / 'rank'
 * or re-implementing their own office check.
 */
function getEmployeeTableConfig(office) {
  const normalizedOffice = String(office || '')
    .trim()
    .toLowerCase();

  if (normalizedOffice === 'mlinc') {
    return {
      employeeTable: 'hr_employees_mlinc',
      regionTable: 'hr_employees_mlinc_regions',
      areaTable: 'hr_employees_mlinc_areas',
      branchTable: 'hr_employees_mlinc_branches',
      rankTable: 'hr_employees_mlinc_ranks',
    };
  }

  return {
    employeeTable: 'master',
    regionTable: 'region',
    areaTable: 'areas',
    branchTable: 'branch',
    rankTable: 'rank',
  };
}

async function generateEmployeeId(office) {
  const dbPool = getRecordsDbPool(office);

  const { employeeTable } = getEmployeeTableConfig(office);

  const [lastEmployee] = await dbPool.query(
    `
    SELECT employeeid
    FROM ${employeeTable}
    ORDER BY empcounter DESC
    LIMIT 1
    `,
  );

  const currentYear = new Date().getFullYear().toString();

  if (lastEmployee.length === 0) {
    return `${currentYear}5001`;
  }

  const lastId = String(lastEmployee[0].employeeid);
  const yearId = lastId.substring(0, 4);
  const countId = parseInt(lastId.substring(4), 10);

  if (yearId === currentYear) {
    if (countId <= 9995) {
      return `${yearId}${String(countId + 3).padStart(4, '0')}`;
    }

    return `${yearId}000${Math.floor(Math.random() * 9) + 1}`;
  }

  if (countId <= 9995) {
    return `${currentYear}${String(countId + 3).padStart(4, '0')}`;
  }

  return `${currentYear}000${Math.floor(Math.random() * 9) + 1}`;
}

async function saveEmployeeToMaster(employeeData) {
  console.log('--------------- ', employeeData.office);

  const dbPool = getRecordsDbPool(employeeData.office);

  const newId = await generateEmployeeId(employeeData.office);

  const trimmedLastName = String(employeeData.lastName || '').trim();
  const trimmedFirstName = String(employeeData.firstName || '').trim();
  const trimmedMiddleInitial = String(employeeData.middleInitial || '').trim();

  const now = new Date();

  // Determine which table to insert into
  const { employeeTable } = getEmployeeTableConfig(employeeData.office);

  const insertMaster = `
    INSERT INTO ${employeeTable}
    (
      employeeid,
      employeelname,
      employeefname,
      employeemi,
      employee_address,
      employeedesignation,
      designation_id,
      employeeregion,
      employeeareamngr,
      employeebranch,
      employeedateemp,
      employeeranking,
      employmentstatus,
      empresigndate,
      employeetelno,
      employeecontactno,
      email,
      employeegender,
      employeestatus,
      employeebdate,
      employeebplace,
      employeereligion,
      employeespouse,
      employeespousework,
      employeefathersname,
      employeefatherswork,
      employeemothersname,
      employeemotherswork,
      employeeschool1,
      employeeaddress1,
      employeescyear1,
      employeeschool2,
      employeeaddress2,
      employeescyear2,
      employeeschool3,
      employeeaddress3,
      employeeschool4,
      employeescyear4,
      employeesss,
      employeepagibig,
      employeeTIN,
      walletno,
      employeesalary,
      employeedegree1,
      employeedegree2,
      employeedegree3,
      employeedegree4,
      employeeempstat,
      employeePhilhealth,
      collegeDegree,
      employeescyear3,
      syscreated,
      employeeaddress4,
      employment_status
    )
    VALUES
    (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `;

  const values = [
    newId,
    trimmedLastName,
    trimmedFirstName,
    trimmedMiddleInitial,
    employeeData.address || null,
    String(employeeData.designation || '').toUpperCase(),
    employeeData.designationId || null,
    employeeData.region || null,
    employeeData.manager || null,
    employeeData.branch || null,
    employeeData.dateOfEmployment || null,
    employeeData.rank || null,
    employeeData.employmentStatusText || null,
    employeeData.resignedDate || null,
    employeeData.contactNo || null,
    employeeData.contactNo || null,
    employeeData.email || null,
    String(employeeData.gender || '').toUpperCase(),
    String(employeeData.civilStatus || '').toUpperCase(),
    employeeData.birthDate || null,
    employeeData.birthPlace || null,
    employeeData.religion || null,
    employeeData.spouse || null,
    employeeData.spouseWork || null,
    employeeData.fatherName || null,
    employeeData.fatherWork || null,
    employeeData.motherName || null,
    employeeData.motherWork || null,
    employeeData.school1 || null,
    employeeData.school1Address || null,
    employeeData.school1YearGraduated || null,
    employeeData.school2 || null,
    employeeData.school2Address || null,
    employeeData.school2YearGraduated || null,
    employeeData.college || null,
    employeeData.collegeAddress || null,
    employeeData.course || null,
    employeeData.collegeYearGraduated || null,
    employeeData.sssNo || null,
    employeeData.pagIbigNo || null,
    employeeData.tin || null,
    employeeData.walletNo || null,
    employeeData.walletNo || null,
    'ELEMENTARY',
    'SECONDARY',
    'COLLEGE',
    'COURSE',
    1,
    employeeData.philhealth || null,
    'Bachelors Degree',
    employeeData.collegeYearGraduated || null,
    now,
    employeeData.major || null,
    employeeData.employment_status || null,
  ];

  await dbPool.query(insertMaster, values);

  await markApplicantAsOnboarded({
    office: employeeData.office,
    applicantId: employeeData.applicantId,
  });

  return newId;
}

async function markApplicantAsOnboarded({ office, applicantId }) {
  console.log('office: ', office, 'applicantID: ', applicantId);
  if (!applicantId) {
    return null;
  }

  // Only VISMIN currently has applicant database
  if (!officeHasApplicantModule(office)) {
    return null;
  }

  const dbPool = getRecordsDbPool('default');

  const [result] = await dbPool.query(
    `
    UPDATE recruitment_applicantinfo
    SET onboarded = 1
    WHERE applicantid = ?
    `,
    [applicantId],
  );
  console.log(result);
  return result;
}
//END SAVE EMPLOYEE

function getRecordsDbPool(office) {
  switch ((office || '').toLowerCase()) {
    case 'luzon':
      console.log(office, 1);
      return db.luzon;
    case 'vismin':
      console.log(office, 2);
      return db.visminRec;
    case 'mlinc':
      console.log(office, 3);
      return db.default;
    case 'visminrecruitment':
      return db.visminReq;
    default:
      console.log(office, 4);
      return db.default;
  }
}

async function getEmployeeMasterlist(filters) {
  try {
    const {
      office,
      region,
      area,
      branch,
      status,
      employeeType,
      designation,
      sortBy,
      extraColumns = [],
      dateFrom,
      dateTo,
      page = 1,
      limit = 30,
    } = filters;

    // Make dateFilterType mutable so we can modify it
    let dateFilterType = filters.dateFilterType || 'date_hired';

    const { employeeTable, regionTable, areaTable, branchTable, rankTable } =
      getEmployeeTableConfig(office);

    console.log('date from: ', dateFrom, dateTo);
    const offset = (page - 1) * limit;

    // ===============================
    // BASE COLUMNS
    // ===============================
    let columns = [
      'r.regionname AS "Region"',
      'e.employeeid AS "Employee ID"',
      'e.employeelname AS "Last Name"',
      'e.employeefname AS "First Name"',
      'e.employeemi AS "Middle Name"',
      'b.branchname AS "Branch"',
      'd.designation AS "Designation"',
      'a.areaname AS "Area"',
      'e.employeedateemp AS "Date Hired"',
      't.rankname AS "Ranking"',
    ];

    // ===============================
    // VALIDATION: Active status cannot use resignation date filter
    // ===============================
    if (status && Number(status) === 9 && dateFilterType === 'resignation_date') {
      console.warn(
        'Invalid combination: Active status with resignation date filter. Forcing date_hired filter.',
      );
      // Force change to date_hired to prevent empty results
      dateFilterType = 'date_hired';
    }

    // ===============================
    // EXTRA COLUMNS - Auto-include resignation date if filtering by it
    // ===============================
    let extraColumnsArray = Array.isArray(extraColumns)
      ? extraColumns
      : [extraColumns].filter(Boolean);

    // AUTO-INCLUDE: If filtering by resignation date, include the column automatically
    if (dateFilterType === 'resignation_date' && !extraColumnsArray.includes('resignationdate')) {
      extraColumnsArray.push('resignationdate');
      console.log('Auto-included resignation date column because filter is applied');
    }

    // AUTO-INCLUDE: If status is filtered and it's NOT Active (9), show resignation date + remarks
    if (status && Number(status) !== 9) {
      if (!extraColumnsArray.includes('resignationdate')) {
        extraColumnsArray.push('resignationdate');
      }
      if (!extraColumnsArray.includes('employmentstatusremarks')) {
        extraColumnsArray.push('employmentstatusremarks');
      }
      console.log('Auto-included resignation date and remarks columns for non-active status');
    }

    const extraMap = {
      contactno: 'e.employeetelno AS "Contact No"',
      birthdate: 'e.employeebdate AS "Birthdate"',
      age: 'TIMESTAMPDIFF(YEAR, e.employeebdate, CURDATE()) AS "Age"',
      civilstatus: 'e.employeestatus AS "Civil Status"',
      tin: 'e.employeetin AS "TIN"',
      sss: 'e.employeesss AS "SSS"',
      philhealth: 'e.employeephilhealth AS "PhilHealth"',
      pagibig: 'e.employeepagibig AS "PagIBIG"',
      address: 'e.employee_address AS "Address"',
      resignationdate: 'e.empresigndate AS "Resignation Date"',
      employmentstatusremarks: 'e.employment_status_remarks AS "Employment Status Remarks"',
      gender: `e.employeegender AS Gender`,
    };

    if (extraColumnsArray.length > 0) {
      extraColumnsArray.forEach((col) => {
        if (extraMap[col]) {
          columns.push(extraMap[col]);
        }
      });
    }

    // ===============================
    // WHERE CLAUSE (SHARED)
    // ===============================
    let whereClause = ' WHERE 1=1 ';
    let params = [];

    if (region) {
      whereClause += ' AND e.employeeregion = ?';
      params.push(region);
    }

    if (area) {
      whereClause += ' AND e.employeeareamngr = ?';
      params.push(area);
    }

    if (branch) {
      whereClause += ' AND e.employeebranch = ?';
      params.push(branch);
    }

    if (status) {
      whereClause += ' AND e.employment_status = ?';
      params.push(status);

      // Additional condition for voluntary resignation
      if (Number(status) === 7) {
        whereClause += ' AND e.employeeempstat = 0';
      }
      console.log(`status: ${status}`);
      if (Number(status) === 9) {
        whereClause += ' AND e.employeeempstat = 1';
      }
    }

    if (employeeType) {
      whereClause += ' AND e.employeeranking = ?';
      params.push(employeeType);
    }

    if (designation) {
      whereClause += ' AND e.designation_id = ?';
      params.push(Number(designation));
    }
    console.log('++++++++++++++++++++++ ', designation);
    const allowedDateFilters = {
      date_hired: 'e.employeedateemp',
      resignation_date: 'e.empresigndate',
    };

    console.log('--------------- ', allowedDateFilters.date_hired);
    const selectedDateColumn = allowedDateFilters[dateFilterType] || allowedDateFilters.date_hired;

    if (dateFrom && dateTo) {
      console.log(true);
      whereClause += ` AND DATE(${selectedDateColumn}) BETWEEN ? AND ?`;
      params.push(dateFrom, dateTo);
    } else if (dateFrom) {
      console.log('else if date from ', dateFrom);
      whereClause += ` AND DATE(${selectedDateColumn}) >= ?`;
      params.push(dateFrom);
    } else if (dateTo) {
      console.log('else if date to', dateTo);
      whereClause += ` AND DATE(${selectedDateColumn}) <= ?`;
      params.push(dateTo);
    }

    // ===============================
    // SORTING (SAFE)
    // ===============================
    const allowedSortFields = {
      lastname: 'e.employeelname',
      employeeid: 'e.employeeid',
      datehired: 'e.employeedateemp',
      branch: 'b.branchname',
      region: 'r.regionname',
    };

    const safeSortBy = String(sortBy || 'lastname').toLowerCase();
    const sortColumn = allowedSortFields[safeSortBy] || 'e.employeelname';

    // ===============================
    // MAIN DATA QUERY (WITH LIMIT)
    // ===============================
    const dataQuery = `
  SELECT ${columns.join(', ')}
  FROM ${employeeTable} e
  LEFT JOIN ${branchTable} b
    ON b.branchcode = e.employeebranch
  LEFT JOIN ${regionTable} r
    ON r.regionid = e.employeeregion
  LEFT JOIN ${areaTable} a
    ON a.areaid = e.employeeareamngr
  LEFT JOIN ${rankTable} t
    ON t.rankid = e.employeeranking
  LEFT JOIN rec_designations d
    ON d.designation_id = e.designation_id
  ${whereClause}
  ORDER BY ${sortColumn}, e.employeelname, e.employeefname
  LIMIT ? OFFSET ?
`;

    const dataParams = [...params, Number(limit), Number(offset)];

    // ===============================
    // COUNT QUERY (NO LIMIT)
    // ===============================
    const countQuery = `
  SELECT COUNT(*) AS total
  FROM ${employeeTable} e
  LEFT JOIN ${branchTable} b
    ON b.branchcode = e.employeebranch
  LEFT JOIN ${regionTable} r
    ON r.regionid = e.employeeregion
  LEFT JOIN ${areaTable} a
    ON a.areaid = e.employeeareamngr
  LEFT JOIN ${rankTable} t
    ON t.rankid = e.employeeranking
  LEFT JOIN rec_designations d
    ON d.designation_id = e.designation_id
  ${whereClause}
`;

    // ===============================
    // EXECUTION
    // ===============================
    const dbPool = getRecordsDbPool(office);
    console.log(dataQuery, dataParams);
    const [[{ total }]] = await dbPool.query(countQuery, params);
    console.log('TOTAL FOR THIS QUERY:', total);
    const [rows] = await dbPool.query(dataQuery, dataParams);

    const totalPages = Math.ceil(total / limit);

    return {
      rows,
      total,
      totalPages,
      currentPage: Number(page),
    };
  } catch (error) {
    console.error('Error in getEmployeeMasterlist:', error);
    throw error;
  }
}

// START -> REGION MANAGEMENT

async function searchRegionManager(keyword, office, type) {
  const searchKeyword = `%${keyword}%`;

  const dbPool = getRecordsDbPool(office);

  const { employeeTable, regionTable, areaTable, branchTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(
    `
    SELECT
      e.employeeid AS employee_id,

      CONCAT(
        e.employeelname, ', ',
        e.employeefname, ' ',
        IFNULL(e.employeemi, '')
      ) AS employee_name,

      e.employeedesignation AS designation,

      b.branchname AS branch,

      a.areaname AS area,

      r.regionname AS region,

      'Active' AS status

    FROM ${employeeTable} e

    LEFT JOIN ${branchTable} b
      ON b.branchcode = e.employeebranch

    LEFT JOIN ${areaTable} a
      ON a.areaid = e.employeeareamngr

    LEFT JOIN ${regionTable} r
      ON r.regionid = e.employeeregion

    WHERE e.employeeempstat = 1

      AND (
        e.employeeid LIKE ?
        OR e.employeelname LIKE ?
        OR e.employeefname LIKE ?
        OR e.employeedesignation LIKE ?
      )

    ORDER BY
      e.employeelname,
      e.employeefname

    LIMIT 50
    `,
    [searchKeyword, searchKeyword, searchKeyword, searchKeyword],
  );

  return rows;
}

// FIND REGION

async function findRegionByName(regionName, office) {
  const dbPool = getRecordsDbPool(office);

  const { regionTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(
    `
    SELECT regionid

    FROM ${regionTable}

    WHERE LOWER(regionname)
    =
    LOWER(?)

    LIMIT 1
    `,
    [regionName.trim()],
  );

  return rows[0] || null;
}

// VALIDATE EMPLOYEE

async function findActiveEmployeeById(employeeId, office) {
  const dbPool = getRecordsDbPool(office);

  const { employeeTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(
    `
    SELECT employeeid
    FROM ${employeeTable}
    WHERE employeeid = ?
      AND employeeempstat = 1
    LIMIT 1
    `,
    [employeeId],
  );

  return rows[0] || null;
}

// SAVE REGION

async function saveRegion({ office, type, regionName, regionManagerId, regionManagerName }) {
  const dbPool = getRecordsDbPool(office);

  const { regionTable } = getEmployeeTableConfig(office);

  const [result] = await dbPool.query(
    `
    INSERT INTO ${regionTable} (

      regionname,
      region_manager,
      manager_id,
      region_type

    )

    VALUES (?, ?, ?,?)
    `,
    [regionName.trim(), regionManagerName, regionManagerId, type],
  );

  return result;
}

// SAVE SUB UNIT

async function saveSubUnit({ office, regionId, name, managerId, managerName }) {
  const dbPool = getRecordsDbPool(office);

  const { areaTable } = getEmployeeTableConfig(office);

  const [result] = await dbPool.query(
    `
    INSERT INTO ${areaTable} (

      arearegid,
      areaname,
      area_manager,
      area_name,
      area_manager_id

    )

    VALUES (?, ?, ?, ?, ?)
    `,
    [regionId, managerName, managerName, name.trim(), managerId],
  );

  return result;
}

// END -> REGION MANAGEMENT

// START -> REGION ADD EDIT
async function getRegionsForMaintenance(office) {
  const dbPool = office ? getRecordsDbPool(office) : db.default;

  const { regionTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(
    `
    SELECT
      regionid,
      regionname,
      region_type,
      region_manager,
      manager_id
    FROM ${regionTable}
    ORDER BY regionname ASC
    `,
  );

  return rows;
}

async function getRegionById(regionId, office) {
  const dbPool = getRecordsDbPool(office);

  const { employeeTable, regionTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(
    `
    SELECT
      r.regionid,
      r.regionname,
      r.region_type,
      r.region_manager,
      r.manager_id,
      e.employeedesignation AS designation,
      r.active AS status

    FROM ${regionTable} r

    LEFT JOIN ${employeeTable} e
      ON e.employeeid = r.manager_id

    WHERE r.regionid = ?

    LIMIT 1
    `,
    [regionId],
  );

  return rows[0] || null;
}

async function getSubUnitsByRegionId(regionId, office) {
  const dbPool = getRecordsDbPool(office);

  const { employeeTable, areaTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(
    `
    SELECT
      a.areaid AS id,
      a.area_name AS name,
      a.area_manager_id AS managerId,
      a.area_manager AS managerName,
      e.employeedesignation AS designation

    FROM ${areaTable} a

    LEFT JOIN ${employeeTable} e
      ON e.employeeid = a.area_manager_id

    WHERE a.arearegid = ?
      AND a.is_active = 1

    ORDER BY a.area_name ASC
    `,
    [regionId],
  );

  return rows;
}

async function findRegionByNameExceptId(regionName, office, regionId) {
  const dbPool = getRecordsDbPool(office);

  const { regionTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(
    `
    SELECT regionid
    FROM ${regionTable}
    WHERE LOWER(regionname) = LOWER(?)
      AND regionid <> ?
    LIMIT 1
    `,
    [regionName.trim(), regionId],
  );

  return rows[0] || null;
}

async function updateRegion({
  office,
  regionId,
  type,
  regionName,
  regionManagerId,
  regionManagerName,
  status,
}) {
  const dbPool = getRecordsDbPool(office);

  const { regionTable } = getEmployeeTableConfig(office);

  const [result] = await dbPool.query(
    `
    UPDATE ${regionTable}
    SET
      regionname = ?,
      region_manager = ?,
      manager_id = ?,
      region_type = ?, 
      active = ?,
      updated_on = NOW() -- This uses the DB server time
    WHERE regionid = ?
    `,
    [regionName.trim(), regionManagerName, regionManagerId, type, status, regionId],
  );

  return result;
}

async function deleteSubUnitsByRegionId(regionId, office) {
  const dbPool = getRecordsDbPool(office);

  const { areaTable } = getEmployeeTableConfig(office);

  const [result] = await dbPool.query(
    `
    DELETE FROM ${areaTable}
    WHERE arearegid = ?
    `,
    [regionId],
  );

  return result;
}

async function updateSubUnit({ office, areaId, name, managerId, managerName }) {
  const dbPool = getRecordsDbPool(office);

  const { areaTable } = getEmployeeTableConfig(office);

  const [result] = await dbPool.query(
    `
    UPDATE ${areaTable}
    SET
      area_name = ?,
      areaname = ?,
      area_manager = ?,
      area_manager_id = ?
    WHERE areaid = ?
    `,
    [name.trim(), managerName, managerName, managerId, areaId],
  );

  return result;
}

async function saveOrUpdateSubUnit({ office, regionId, areaId, name, managerId, managerName }) {
  const dbPool = getRecordsDbPool(office);

  const { employeeTable, areaTable } = getEmployeeTableConfig(office);

  const areaName = String(name || '').trim();

  if (areaId) {
    const [result] = await dbPool.query(
      `
      UPDATE ${areaTable}
      SET
        areaname = ?,
        area_name = ?,
        area_manager = ?,
        area_manager_id = ?,
        is_active = 1
      WHERE areaid = ?
        AND arearegid = ?
      `,
      [areaName, areaName, managerName, managerId, areaId, regionId],
    );

    console.log('----------------------- ', regionId, areaId, managerId);

    // Sync employee's region and area assignment
    if (managerId) {
      await dbPool.query(
        `
        UPDATE ${employeeTable}
        SET
          employeeregion = ?,
          employeeareamngr = ?
        WHERE employeeid = ?
        `,
        [regionId, areaId, managerId],
      );
    }

    return {
      mode: 'updated',
      areaId: Number(areaId),
      result,
    };
  }

  const [result] = await dbPool.query(
    `
    INSERT INTO ${areaTable} (
      arearegid,
      areaname,
      area_manager,
      area_name,
      area_manager_id,
      is_active
    )
    VALUES (?, ?, ?, ?, ?, 1)
    `,
    [regionId, areaName, managerName, areaName, managerId],
  );

  const newAreaId = result.insertId;

  // Sync newly assigned manager's region and area
  if (managerId) {
    await dbPool.query(
      `
      UPDATE ${employeeTable}
      SET
        employeeregion = ?,
        employeeareamngr = ?
      WHERE employeeid = ?
      `,
      [regionId, newAreaId, managerId],
    );
  }

  return {
    mode: 'inserted',
    areaId: newAreaId,
    result,
  };
}

async function getEmployeesAssignedToRemovedAreas({ office, regionId, submittedAreaIds = [] }) {
  const dbPool = getRecordsDbPool(office);

  const { employeeTable, areaTable } = getEmployeeTableConfig(office);

  const cleanSubmittedAreaIds = submittedAreaIds.map((id) => Number(id)).filter(Boolean);

  let removedAreaQuery = `
    SELECT
      areaid,
      area_name,
      areaname
    FROM ${areaTable}
    WHERE arearegid = ?
      AND is_active = 1
  `;

  const removedAreaParams = [regionId];

  if (cleanSubmittedAreaIds.length > 0) {
    removedAreaQuery += `
      AND areaid NOT IN (${cleanSubmittedAreaIds.map(() => '?').join(',')})
    `;

    removedAreaParams.push(...cleanSubmittedAreaIds);
  }

  const [removedAreas] = await dbPool.query(removedAreaQuery, removedAreaParams);

  if (removedAreas.length === 0) {
    return [];
  }

  const removedAreaIds = removedAreas.map((area) => Number(area.areaid));

  const [employees] = await dbPool.query(
    `
    SELECT
      e.employeeid,
      CONCAT(
        e.employeelname, ', ',
        e.employeefname, ' ',
        IFNULL(e.employeemi, '')
      ) AS employeeName,
      e.employeedesignation AS designation,
      e.employeeareamngr AS areaId,
      a.area_name AS areaName

    FROM ${employeeTable} e

    LEFT JOIN ${areaTable} a
      ON a.areaid = e.employeeareamngr

    WHERE e.employeeregion = ?
      AND e.employeeareamngr IN (
        ${removedAreaIds.map(() => '?').join(',')}
      )
      AND e.employeeempstat = 1

    ORDER BY
      a.area_name,
      e.employeelname,
      e.employeefname
    `,
    [regionId, ...removedAreaIds],
  );

  const grouped = removedAreas.map((area) => {
    const areaEmployees = employees.filter((emp) => Number(emp.areaId) === Number(area.areaid));

    return {
      areaId: area.areaid,
      areaName: area.area_name || area.areaname,
      employees: areaEmployees,
      employeeCount: areaEmployees.length,
    };
  });

  return grouped.filter((area) => area.employeeCount > 0);
}

async function getUsedAreaIdsInMaster({ office, regionId }) {
  const dbPool = getRecordsDbPool(office);

  const { employeeTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(
    `
    SELECT DISTINCT employeeareamngr AS areaId
    FROM ${employeeTable}
    WHERE employeeregion = ?
      AND employeeareamngr IS NOT NULL
    `,
    [regionId],
  );

  return rows.map((row) => Number(row.areaId));
}

async function deactivateRemovedSubUnits({ office, regionId, submittedAreaIds = [] }) {
  const dbPool = getRecordsDbPool(office);

  const { areaTable } = getEmployeeTableConfig(office);

  const cleanSubmittedAreaIds = submittedAreaIds.map((id) => Number(id)).filter(Boolean);

  if (cleanSubmittedAreaIds.length === 0) {
    console.log('----------------------------------------');

    const [result] = await dbPool.query(
      `
      UPDATE ${areaTable}
      SET is_active = 0
      WHERE arearegid = ?
        AND is_active = 1
      `,
      [regionId],
    );

    return result;
  }

  const placeholders = cleanSubmittedAreaIds.map(() => '?').join(',');

  const [result] = await dbPool.query(
    `
    UPDATE ${areaTable}
    SET is_active = 0
    WHERE arearegid = ?
      AND is_active = 1
      AND areaid NOT IN (${placeholders})
    `,
    [regionId, ...cleanSubmittedAreaIds],
  );

  return result;
}
// END -> REGION ADD EDIT

// START EMPLOYEE ENTRY
//get ranking
async function getRankingByOffice(office) {
  const dbPool = getRecordsDbPool(office);

  const { rankTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(
    `
    SELECT
      rankid,
      rankname
    FROM ${rankTable}
    ORDER BY rankname ASC
    `,
  );

  return rows;
}
// END EMPLOYEE ENTRY

// In recordsModel.js
async function searchEmployeesForUpdate({ office, lastName, firstName }) {
  const dbPool = getRecordsDbPool(office);

  const { employeeTable, regionTable, areaTable, branchTable } = getEmployeeTableConfig(office);

  let query = `
    SELECT
      e.employeeid,
      e.employeelname,
      e.employeefname,
      e.employeemi,
      e.employeedesignation,
      e.employmentstatus,
      r.regionname,
      a.area_name,
      b.branchname

    FROM ${employeeTable} e

    LEFT JOIN ${regionTable} r
      ON r.regionid = e.employeeregion

    LEFT JOIN ${areaTable} a
      ON a.areaid = e.employeeareamngr

    LEFT JOIN ${branchTable} b
      ON b.branchcode = e.employeebranch

    WHERE 1=1
  `;

  const params = [];

  if (lastName) {
    query += ` AND e.employeelname LIKE ?`;
    params.push(`%${lastName}%`);
  }

  if (firstName) {
    query += ` AND e.employeefname LIKE ?`;
    params.push(`%${firstName}%`);
  }

  query += `
    ORDER BY e.employeelname, e.employeefname
    LIMIT 50
  `;

  const [rows] = await dbPool.query(query, params);

  return rows;
}

async function getEmployeeForUpdate({ office, employeeId }) {
  const dbPool = getRecordsDbPool(office);

  const { employeeTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(
    `
    SELECT *
    FROM ${employeeTable}
    WHERE employeeid = ?
    LIMIT 1
    `,
    [employeeId],
  );

  return rows[0] || null;
}

async function updateEmployeeRecord({ office, employeeId, employeeData }) {
  const dbPool = getRecordsDbPool(office);

  console.log('Updating employee with data:', employeeData);

  const { employeeTable } = getEmployeeTableConfig(office);

  const [result] = await dbPool.query(
    `
    UPDATE ${employeeTable}
    SET
      employeelname = ?,
      employeefname = ?,
      employeemi = ?,
      employeedesignation = ?,
        designation_id = ?,  
      employeeregion = ?,
      employeeareamngr = ?,
      employeebranch = ?,
      employeedateemp = ?,
      employeeranking = ?,
      employmentstatus = ?,
      empresigndate = ?,
        employment_status_remarks = ?, 
      employeetelno = ?,
      employeecontactno = ?,
      email = ?,
      employeegender = ?,
      employeestatus = ?,
      employeebdate = ?,
      employeebplace = ?,
      employeereligion = ?,
      employee_address = ?,
      employeesss = ?,
      employeepagibig = ?,
      employeePhilhealth = ?,
      employeeTIN = ?,
      walletno = ?,
      employment_status = ?,
      employeespouse = ?,
      employeespousework = ?,
      employeefathersname = ?,
      employeefatherswork = ?,
      employeemothersname = ?,
      employeemotherswork = ?,
      -- Education fields - ADD THESE
      employeeschool1 = ?,
      employeeaddress1 = ?,
      employeescyear1 = ?,
      employeeschool2 = ?,
      employeeaddress2 = ?,
      employeescyear2 = ?,
      employeeschool3 = ?,
      employeeaddress3 = ?,
      employeescyear3 = ?,
      employeeschool4 = ?,
      employeeaddress4 = ?,
      sysupdated = NOW()
    WHERE employeeid = ?
    `,
    [
      // Basic Information (32 fields)
      employeeData.lastName,
      employeeData.firstName,
      employeeData.middleInitial,
      employeeData.designation,
      employeeData.designationId,
      employeeData.region,
      employeeData.area,
      employeeData.branch,
      employeeData.dateHired,
      employeeData.rank,
      employeeData.employmentStatusText,
      employeeData.resignedDate,
      employeeData.employmentStatusRemarks,
      employeeData.contactNo,
      employeeData.contactNo, // employeetelno uses same as contactno
      employeeData.email,
      employeeData.gender,
      employeeData.civilStatus,
      employeeData.birthDate,
      employeeData.birthPlace,
      employeeData.religion,
      employeeData.address,
      employeeData.sssNo,
      employeeData.pagIbigNo,
      employeeData.philhealth,
      employeeData.tin,
      employeeData.walletNo,
      employeeData.employmentStatus,
      employeeData.employeespouse,
      employeeData.employeespousework,
      employeeData.employeefathersname,
      employeeData.employeefatherswork,
      employeeData.employeemothersname,
      employeeData.employeemotherswork,
      // Education fields (11 fields)
      employeeData.employeeschool1,
      employeeData.employeeaddress1,
      employeeData.employeescyear1,
      employeeData.employeeschool2,
      employeeData.employeeaddress2,
      employeeData.employeescyear2,
      employeeData.employeeschool3,
      employeeData.employeeaddress3,
      employeeData.employeescyear3,
      employeeData.employeeschool4,
      employeeData.employeeaddress4,
      // WHERE clause
      employeeId,
    ],
  );

  return result;
}

// START -> DESIGNATION MANAGEMENT

function normalizeDesignation(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

async function getAllDesignations() {
  const [rows] = await db.default.query(
    `
    SELECT
      designation_id,
      designation,
      is_active
    FROM rec_designations
    ORDER BY designation ASC
    `,
  );

  return rows;
}

async function findDesignationByName(designationName) {
  const normalized = normalizeDesignation(designationName);

  const [rows] = await db.default.query(
    `
    SELECT designation_id
    FROM rec_designations
    WHERE designation_normalized = ?
    LIMIT 1
    `,
    [normalized],
  );

  return rows[0] || null;
}

async function saveDesignation({ designation, userId }) {
  const cleanDesignation = String(designation || '')
    .trim()
    .toUpperCase();
  const normalized = normalizeDesignation(designation);

  const [result] = await db.default.query(
    `
    INSERT INTO rec_designations (
      designation,
      designation_normalized,
      is_active,
      created_at,
      created_by
    )
    VALUES (?, ?, 1, NOW(), ?)
    `,
    [cleanDesignation, normalized, userId || null],
  );

  return result;
}

async function findDesignationByNameExceptId(designationName, designationId) {
  const normalized = normalizeDesignation(designationName);

  const [rows] = await db.default.query(
    `
    SELECT designation_id
    FROM rec_designations
    WHERE (designation_normalized = ? OR UPPER(TRIM(designation)) = ?)
      AND designation_id <> ?
    LIMIT 1
    `,
    [normalized, normalized, designationId],
  );

  return rows[0] || null;
}

async function updateDesignation({ designationId, designation, userId }) {
  const cleanDesignation = String(designation || '')
    .trim()
    .toUpperCase();
  const normalized = normalizeDesignation(designation);

  const [result] = await db.default.query(
    `
    UPDATE rec_designations
    SET
      designation = ?,
      designation_normalized = ?,
      updated_at = NOW(),
      updated_by = ?
    WHERE designation_id = ?
    `,
    [cleanDesignation, normalized, userId || null, designationId],
  );

  return result;
}

// END -> DESIGNATION MANAGEMENT

// ======================================================
// BRANCH MANAGEMENT
// ======================================================

// ── AREAS BY REGION ID ────────────────────────────────
async function getAreasByRegionId(office, regionId) {
  const dbPool = getRecordsDbPool(office);

  const { areaTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(
    `
    SELECT
      areaid,
      area_name,
      areaname,
      area_manager
    FROM ${areaTable}
    WHERE arearegid = ?
      AND is_active = 1
    ORDER BY area_name ASC
    `,
    [regionId],
  );

  return rows;
}

// ── BRANCHES BY AREA ──────────────────────────────────
async function getBranchesByArea(office, regionId, areaId) {
  const dbPool = getRecordsDbPool(office);

  const { branchTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(
    `
    SELECT
      branchcode,
      branchname,
      branchaddress,
      branch_no,
      branchregid,
      branchareaid,
      is_active
    FROM ${branchTable}
    WHERE branchregid = ?
      AND branchareaid = ?
    ORDER BY branchname ASC
    `,
    [regionId, areaId],
  );

  return rows;
}

// ── SAVE NEW BRANCH ───────────────────────────────────
async function saveBranch({
  office,
  branchregid,
  branchareaid,
  branch_no,
  branchname,
  branchaddress,
}) {
  const dbPool = getRecordsDbPool(office);

  const { branchTable } = getEmployeeTableConfig(office);

  const [result] = await dbPool.query(
    `
    INSERT INTO ${branchTable} (
      branchname,
      branchaddress,
      branchregid,
      branchareaid,
      branch_no,
      is_active
    )
    VALUES (?, ?, ?, ?, ?, 1)
    `,
    [branchname, branchaddress || null, branchregid, branchareaid, branch_no || null],
  );

  return result;
}

// ── UPDATE BRANCH ─────────────────────────────────────
async function updateBranch({ office, branchcode, branch_no, branchname, branchaddress }) {
  const dbPool = getRecordsDbPool(office);

  const { branchTable } = getEmployeeTableConfig(office);

  const [result] = await dbPool.query(
    `
    UPDATE ${branchTable}
    SET
      branchname    = ?,
      branchaddress = ?,
      branch_no     = ?
    WHERE branchcode = ?
    `,
    [branchname, branchaddress || null, branch_no || null, branchcode],
  );

  return result;
}

// ── TRANSFER BRANCH WITH EMPLOYEE UPDATE ─────────────
async function transferBranch({ office, branchcode, branchregid, branchareaid }) {
  const dbPool = getRecordsDbPool(office);

  const { employeeTable, branchTable } = getEmployeeTableConfig(office);

  // Start transaction first
  const connection = await dbPool.getConnection();

  try {
    await connection.beginTransaction();

    // Get current branch details
    const [branchDetails] = await connection.query(
      `
      SELECT
        branchregid AS old_region,
        branchareaid AS old_area
      FROM ${branchTable}
      WHERE branchcode = ?
      `,
      [branchcode],
    );

    if (!branchDetails || branchDetails.length === 0) {
      throw new Error('Branch not found');
    }

    const oldRegion = branchDetails[0].old_region;
    const oldArea = branchDetails[0].old_area;

    const newRegion = branchregid;
    const newArea = branchareaid;

    // Check if anything actually changed
    if (oldRegion === newRegion && oldArea === newArea) {
      throw new Error('No changes detected in region or area');
    }

    // 1. Update branch
    await connection.query(
      `
      UPDATE ${branchTable}
      SET
        branchregid = ?,
        branchareaid = ?
      WHERE branchcode = ?
      `,
      [newRegion, newArea, branchcode],
    );

    // 2. Update employees assigned to this branch
    let updateEmployeeQuery;
    let updateParams;

    if (oldRegion !== newRegion) {
      // Region changed:
      // Update both region and area
      updateEmployeeQuery = `
        UPDATE ${employeeTable}
        SET
          employeeregion = ?,
          employeeareamngr = ?
        WHERE employeebranch = ?
          AND employeeempstat = 1
      `;

      updateParams = [newRegion, newArea, branchcode];
    } else {
      // Only area changed
      updateEmployeeQuery = `
        UPDATE ${employeeTable}
        SET
          employeeareamngr = ?
        WHERE employeebranch = ?
          AND employeeregion = ?
          AND employeeempstat = 1
      `;

      updateParams = [newArea, branchcode, oldRegion];
    }

    const [updateResult] = await connection.query(updateEmployeeQuery, updateParams);

    console.log(`Transfer branch ${branchcode}: Updated ${updateResult.affectedRows} employee(s)`);

    await connection.commit();

    return {
      success: true,
      affectedEmployees: updateResult.affectedRows,
      oldRegion,
      newRegion,
      oldArea,
      newArea,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ── GET EMPLOYEES AFFECTED BY BRANCH TRANSFER ──────────
async function getEmployeesAffectedByTransfer({ office, branchcode, newRegionId, newAreaId }) {
  const dbPool = getRecordsDbPool(office);

  const { employeeTable, regionTable, areaTable, branchTable } = getEmployeeTableConfig(office);

  // Get current branch details
  const [branchDetails] = await dbPool.query(
    `
    SELECT
      branchregid,
      branchareaid
    FROM ${branchTable}
    WHERE branchcode = ?
    `,
    [branchcode],
  );

  if (!branchDetails || branchDetails.length === 0) {
    return [];
  }

  const currentRegion = branchDetails[0].branchregid;
  const currentArea = branchDetails[0].branchareaid;

  // No actual change
  if (currentRegion === newRegionId && currentArea === newAreaId) {
    return [];
  }

  let query = `
    SELECT
      m.employeeid,
      m.employeelname,
      m.employeefname,
      m.employeemi,
      m.employeedesignation,
      m.employeeregion,
      m.employeeareamngr,
      r.regionname AS current_region_name,
      a.area_name AS current_area_name

    FROM ${employeeTable} m

    LEFT JOIN ${regionTable} r
      ON r.regionid = m.employeeregion

    LEFT JOIN ${areaTable} a
      ON a.areaid = m.employeeareamngr

    WHERE m.employeebranch = ?
      AND m.employeeempstat = 1
  `;

  const params = [branchcode];

  // Only include employees currently assigned
  // to this branch's region and area
  if (currentRegion && currentArea) {
    query += `
      AND m.employeeregion = ?
      AND m.employeeareamngr = ?
    `;

    params.push(currentRegion, currentArea);
  }

  query += `
    ORDER BY
      m.employeelname,
      m.employeefname
  `;

  const [rows] = await dbPool.query(query, params);

  return rows.map((emp) => ({
    ...emp,
    will_update_region: currentRegion !== newRegionId,
    will_update_area: currentArea !== newAreaId,
    new_region_id: newRegionId,
    new_area_id: newAreaId,
  }));
}

// ── TOGGLE STATUS ─────────────────────────────────────
async function toggleBranchStatus({ office, branchcode, is_active }) {
  const dbPool = getRecordsDbPool(office);

  const { branchTable } = getEmployeeTableConfig(office);

  const [result] = await dbPool.query(
    `
    UPDATE ${branchTable}
    SET is_active = ?
    WHERE branchcode = ?
    `,
    [is_active, branchcode],
  );

  return result;
}

// ── CHECK IF BRANCH HAS ACTIVE EMPLOYEES ──────────────────
async function hasActiveEmployeesInBranch({ office, branchcode }) {
  const dbPool = getRecordsDbPool(office);

  const { employeeTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(
    `
    SELECT COUNT(*) AS count
    FROM ${employeeTable} m
    WHERE m.employeebranch = ?
      AND m.employeeempstat = 1
      AND UPPER(TRIM(m.employmentstatus)) = 'ACTIVE'
    `,
    [branchcode],
  );

  return Number(rows[0].count) > 0;
}

// ── GET ACTIVE EMPLOYEES BY BRANCH ────────────────────────
async function getActiveEmployeesByBranch({ office, branchcode }) {
  const dbPool = getRecordsDbPool(office);

  const { employeeTable, regionTable, areaTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(
    `
    SELECT
      m.employeeid,
      m.employeelname,
      m.employeefname,
      m.employeemi,
      m.employeedesignation,
      m.employmentstatus,
      m.employeeempstat,
      r.regionname,
      a.area_name

    FROM ${employeeTable} m

    LEFT JOIN ${regionTable} r
      ON r.regionid = m.employeeregion

    LEFT JOIN ${areaTable} a
      ON a.areaid = m.employeeareamngr

    WHERE m.employeebranch = ?
      AND m.employeeempstat = 1
      AND UPPER(TRIM(m.employmentstatus)) = 'ACTIVE'

    ORDER BY
      m.employeelname,
      m.employeefname
    `,
    [branchcode],
  );

  return rows;
}

// ── GET BRANCH DETAILS ────────────────────────────────────
async function getBranchDetails({ office, branchcode }) {
  const dbPool = getRecordsDbPool(office);

  const { branchTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(
    `
    SELECT
      branchcode,
      branchname,
      branchregid,
      branchareaid,
      is_active
    FROM ${branchTable}
    WHERE branchcode = ?
    `,
    [branchcode],
  );

  return rows[0] || null;
}

// ======================================================
// BRANCH MANAGEMENT — Handle Unassigned Branches
// ======================================================

// ── GET BRANCHES WITHOUT AREA ID ──────────────────────
async function getBranchesWithoutArea({ office, regionId }) {
  const dbPool = getRecordsDbPool(office);

  const { branchTable, regionTable } = getEmployeeTableConfig(office);

  const query = `
    SELECT
      b.branchcode,
      b.branchname,
      b.branchaddress,
      b.branch_no,
      b.branchareaid,
      b.is_active,
      b.branchregid,
      r.regionname AS region_name
    FROM ${branchTable} b
    LEFT JOIN ${regionTable} r
      ON r.regionid = b.branchregid
    WHERE b.branchregid = ?
      AND (b.branchareaid IS NULL OR b.branchareaid = 0)
      AND b.is_active = 1
    ORDER BY b.branchname ASC
  `;

  console.log('getBranchesWithoutArea:', {
    office,
    regionId,
    branchTable,
    regionTable,
  });

  const [rows] = await dbPool.query(query, [regionId]);

  return rows;
}

// ── BULK ASSIGN BRANCHES TO AREA ──────────────────────
async function bulkAssignBranchesToArea({ office, branchAreaId, branchCodes }) {
  const dbPool = getRecordsDbPool(office);

  const { employeeTable, areaTable, branchTable } = getEmployeeTableConfig(office);

  const connection = await dbPool.getConnection();

  try {
    await connection.beginTransaction();

    // First, verify the area exists
    const [areaCheck] = await connection.query(
      `
      SELECT areaid
      FROM ${areaTable}
      WHERE areaid = ?
        AND is_active = 1
      `,
      [branchAreaId],
    );

    if (!areaCheck || areaCheck.length === 0) {
      throw new Error('Target area not found or inactive.');
    }

    // Get the region ID from the area
    const [areaDetails] = await connection.query(
      `
      SELECT arearegid
      FROM ${areaTable}
      WHERE areaid = ?
      `,
      [branchAreaId],
    );

    const regionId = areaDetails[0]?.arearegid;

    if (!regionId) {
      throw new Error('Area does not have a region assigned.');
    }

    // Update all selected branches
    const placeholders = branchCodes.map(() => '?').join(',');

    const updateParams = [branchAreaId, regionId, ...branchCodes];

    const [result] = await connection.query(
      `
      UPDATE ${branchTable}
      SET
        branchareaid = ?,
        branchregid = ?,
        updated_at = NOW()
      WHERE branchcode IN (${placeholders})
        AND is_active = 1
      `,
      updateParams,
    );

    // Get branches that were updated
    const [updatedBranches] = await connection.query(
      `
      SELECT branchcode
      FROM ${branchTable}
      WHERE branchcode IN (${placeholders})
        AND branchareaid = ?
      `,
      [...branchCodes, branchAreaId],
    );

    // Update employees assigned to those branches
    if (updatedBranches.length > 0) {
      const branchCodesList = updatedBranches.map((b) => b.branchcode);

      const empPlaceholders = branchCodesList.map(() => '?').join(',');

      await connection.query(
        `
        UPDATE ${employeeTable}
        SET
          employeeregion = ?,
          employeeareamngr = ?
        WHERE employeebranch IN (${empPlaceholders})
          AND employeeempstat = 1
        `,
        [regionId, branchAreaId, ...branchCodesList],
      );
    }

    await connection.commit();

    return {
      success: true,
      affectedRows: result.affectedRows || 0,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ── GET AREA_NAME BY ID ───────────────────────────────
async function getAreaNameById({ office, areaId }) {
  const dbPool = getRecordsDbPool(office);

  const { areaTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(
    `
    SELECT
      area_name,
      arearegid
    FROM ${areaTable}
    WHERE areaid = ?
      AND is_active = 1
    `,
    [areaId],
  );

  return rows[0] || null;
}

// END BRANCH MANAGEMENT

// START EMPLOYEE BRANCH ASSIGNMENT
// ======================================================
// EMPLOYEE RECORDS VIEWER - Model Functions
// ======================================================

/**
 * Get employees based on filters (region, area, branch)
 * Only returns active employees (employment_status = 9 AND employeeempstat = 1)
 */
async function getEmployeesByFilters({ office, region, area, branch }) {
  const dbPool = getRecordsDbPool(office);

  const { employeeTable } = getEmployeeTableConfig(office);

  let query = `
    SELECT
      e.employeeid AS idno,
      e.employeelname AS lastname,
      e.employeefname AS firstname,
      e.employeemi AS middlename,
      e.employeedesignation AS designation
    FROM ${employeeTable} e
    WHERE e.employeeempstat = 1
      AND e.employment_status = 9
  `;

  const params = [];

  if (region) {
    query += ` AND e.employeeregion = ?`;
    params.push(region);
  }

  if (area) {
    query += ` AND e.employeeareamngr = ?`;
    params.push(area);
  }

  if (branch) {
    query += ` AND e.employeebranch = ?`;
    params.push(branch);
  }

  query += `
    ORDER BY
      e.employeelname,
      e.employeefname
  `;
  console.log(query, params);
  const [rows] = await dbPool.query(query, params);

  return rows;
}

/**
 * Get regions for the viewer with active employee count
 */
async function getRegionsWithCount(office) {
  const dbPool = getRecordsDbPool(office);

  const { regionTable, employeeTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(`
    SELECT
      r.regionid,
      r.regionname,
      COUNT(e.employeeid) AS employee_count

    FROM ${regionTable} r

    LEFT JOIN ${employeeTable} e
      ON e.employeeregion = r.regionid
      AND e.employeeempstat = 1
      AND e.employment_status = 9

    WHERE r.active = 1
       OR r.active IS NULL

    GROUP BY
      r.regionid,
      r.regionname

    ORDER BY
      r.regionname ASC
  `);

  return rows;
}

/**
 * Get areas for the viewer with active employee count
 */
async function getAreasWithCount({ office, regionId }) {
  const dbPool = getRecordsDbPool(office);

  const { areaTable, branchTable, employeeTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(
    `
    SELECT 
      a.areaid,
      a.area_name,
      COUNT(
        CASE
          WHEN e.employeeempstat = 1
            AND e.employment_status = 9
            AND b.is_active = 1
          THEN e.employeeid
        END
      ) AS employee_count
    FROM ${areaTable} a
    LEFT JOIN ${branchTable} b
      ON b.branchareaid = a.areaid
    LEFT JOIN ${employeeTable} e
      ON e.employeebranch = b.branchcode
      AND e.employeeregion = ?
    WHERE a.arearegid = ?
      AND a.is_active = 1
    GROUP BY a.areaid, a.area_name
    ORDER BY a.area_name ASC
    `,
    [regionId, regionId],
  );

  console.log(
    `
    SELECT 
      a.areaid,
      a.area_name,
      COUNT(
        CASE
          WHEN e.employeeempstat = 1
            AND e.employment_status = 9
            AND b.is_active = 1
          THEN e.employeeid
        END
      ) AS employee_count
    FROM ${areaTable} a
    LEFT JOIN ${branchTable} b
      ON b.branchareaid = a.areaid
    LEFT JOIN ${employeeTable} e
      ON e.employeebranch = b.branchcode
      AND e.employeeregion = ?
    WHERE a.arearegid = ?
      AND a.is_active = 1
    GROUP BY a.areaid, a.area_name
    ORDER BY a.area_name ASC
    `,
    [regionId, regionId],
  );

  return rows;
}

/**
 * Get branches for the viewer with active employee count
 */
async function getBranchesWithCount({ office, regionId, areaId }) {
  const dbPool = getRecordsDbPool(office);

  const { branchTable, employeeTable } = getEmployeeTableConfig(office);

  const [rows] = await dbPool.query(
    `
    SELECT 
      b.branchcode,
      b.branchname,
      COUNT(
        CASE
          WHEN e.employeeempstat = 1
            AND e.employment_status = 9
          THEN e.employeeid
        END
      ) AS employee_count
    FROM ${branchTable} b
    LEFT JOIN ${employeeTable} e
      ON e.employeebranch = b.branchcode
      AND e.employeeregion = ?
    WHERE b.branchregid = ?
      AND b.branchareaid = ?
      AND b.is_active = 1
    GROUP BY b.branchcode, b.branchname
    ORDER BY b.branchname ASC
    `,
    [regionId, regionId, areaId],
  );

  return rows;
}
// END EMPLOYEE BRANCH ASSIGNMENT

async function getNewHires(filters) {
  try {
    const { office, region, sortBy, dateFrom, dateTo, page = 1, limit = 30 } = filters;

    const offset = (page - 1) * limit;
    const dbPool = getRecordsDbPool(office);

    const { employeeTable, branchTable, regionTable, areaTable } = getEmployeeTableConfig(office);

    // Determine sorting
    let sortClause = 'ORDER BY e.employeelname, e.employeefname';

    if (sortBy && sortBy.toLowerCase() === 'region') {
      sortClause = 'ORDER BY r.regionname, e.employeelname, e.employeefname';
    }

    const columns = `
      r.regionname AS "Region",
      e.employeeid AS "ID No",
      e.employeelname AS "Last Name",
      e.employeefname AS "First Name",
      e.employeemi AS "Middle Name",
      e.employeebdate AS "Birthdate",
      e.employeedesignation AS "Designation",
      b.branchname AS "Branch",
      e.employeestatus AS "Civil Status",
      e.employmentstatus AS "Employment Status",
      e.employeedateemp AS "Hired Date",
      e.employeecontactno AS "Contact No",
      e.walletno AS "Wallet No"
    `;

    // Build WHERE clause
    let whereClause = ' WHERE 1=1 ';
    let params = [];

    // Only get active employees with employment status = 9 (Active)
    whereClause += ' AND e.employment_status = 9';
    whereClause += ' AND e.employeeempstat = 1';

    if (region) {
      whereClause += ' AND e.employeeregion = ?';
      params.push(region);
    }

    // Date range filter (date hired)
    if (dateFrom && dateTo) {
      whereClause += ' AND DATE(e.employeedateemp) BETWEEN ? AND ?';
      params.push(dateFrom, dateTo);
    } else if (dateFrom) {
      whereClause += ' AND DATE(e.employeedateemp) >= ?';
      params.push(dateFrom);
    } else if (dateTo) {
      whereClause += ' AND DATE(e.employeedateemp) <= ?';
      params.push(dateTo);
    }

    // Data query with pagination
    const dataQuery = `
      SELECT ${columns}
      FROM ${employeeTable} e
      LEFT JOIN ${branchTable} b
        ON b.branchcode = e.employeebranch
      LEFT JOIN ${regionTable} r
        ON r.regionid = e.employeeregion
      LEFT JOIN ${areaTable} a
        ON a.areaid = e.employeeareamngr
      ${whereClause}
      ${sortClause}
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...params, Number(limit), Number(offset)];

    // Count query
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM ${employeeTable} e
      LEFT JOIN ${branchTable} b
        ON b.branchcode = e.employeebranch
      LEFT JOIN ${regionTable} r
        ON r.regionid = e.employeeregion
      LEFT JOIN ${areaTable} a
        ON a.areaid = e.employeeareamngr
      ${whereClause}
    `;

    const [[{ total }]] = await dbPool.query(countQuery, params);

    const [rows] = await dbPool.query(dataQuery, dataParams);

    const totalPages = Math.ceil(total / limit);

    return {
      rows,
      total,
      totalPages,
      currentPage: Number(page),
    };
  } catch (error) {
    console.error('Error in getNewHires:', error);
    throw error;
  }
}

module.exports = {
  createEmployee,
  employeeExists,

  officeHasApplicantModule,
  searchApplicants,
  getApplicantById,

  getEmployeeMasterlist,
  searchRegionManager,
  findRegionByName,
  findActiveEmployeeById,
  saveRegion,
  saveSubUnit,
  getRegionsForMaintenance,
  getRegionById,
  getSubUnitsByRegionId,
  findRegionByNameExceptId,
  updateRegion,
  deleteSubUnitsByRegionId,

  saveOrUpdateSubUnit,
  getEmployeesAssignedToRemovedAreas,
  deactivateRemovedSubUnits,
  getRankingByOffice,
  saveEmployeeToMaster,
  markApplicantAsOnboarded,

  searchEmployeesForUpdate,
  getEmployeeForUpdate,
  updateEmployeeRecord,
  getAllDesignations,
  findDesignationByName,
  saveDesignation,
  findDesignationByNameExceptId,
  updateDesignation,

  getAreasByRegionId,
  getBranchesByArea,
  saveBranch,
  updateBranch,
  transferBranch,
  toggleBranchStatus,
  getActiveEmployeesByBranch,
  hasActiveEmployeesInBranch,
  getBranchDetails,
  getEmployeesAffectedByTransfer,
  getBranchesWithoutArea,
  getAreaNameById,
  bulkAssignBranchesToArea,

  getEmployeesByFilters,
  getRegionsWithCount,
  getAreasWithCount,
  getBranchesWithCount,
  getNewHires,
};
