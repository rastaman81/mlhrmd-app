// async function searchActiveEmployees(
//   office,
//   idno,
//   lastName,
//   firstName,
//   limit,
//   offset,
// ) {
//   try {
//     console.log("model: ", office, idno, lastName, firstName, limit, offset);

//     // Get the queries for the specific office
//     const officeQueries = getOfficeDetails(office);
//     const idnoQuery = idno ? `%${idno}%` : "%%";
//     const lastNameQuery = lastName ? `${lastName}%` : "%%";
//     const firstNameQuery = firstName ? `%${firstName}%` : "%%";

//     const params = [
//       idnoQuery,
//       lastNameQuery,
//       firstNameQuery,
//       limit.toString(),
//       offset.toString(),
//     ];
//     const countParams = [idnoQuery, lastNameQuery, firstNameQuery];

//     console.log("office queries: ", officeQueries);
//     console.log(params);
//     console.log(countParams);

//     const dbPool = getRecordsDbPool(office);

//     //const dbConnection = db[officeQueries.dbConnection];

//     // Use the queries from officeQueries object
//     const [results] = await dbPool.execute(
//       officeQueries.sqlQueryActive,
//       params,
//     );
//     const [countResults] = await dbPool.execute(
//       officeQueries.countSqlQueryActive,
//       countParams,
//     );

//     const totalRecords = countResults[0]["COUNT(*)"];
//     const totalPages = Math.ceil(totalRecords / limit);
//     const currentPage = Math.floor(offset / limit) + 1;

//     return { results, totalPages, currentPage };
//   } catch (error) {
//     console.error(`Error fetching employees for office ${office}:`, error);
//     throw error;
//   }
// }

// // Rest of the file remains the same...
// const getOfficeDetails = (office) => {
//   const officeLower = office.toLowerCase();
//   //console.log("The office value is:", officeLower);

//   if (officeLower === "vismin") {
//     console.log("vismin");
//     return {
//       dbConnection: "visminRec", // Add db connection for vismin
//       sqlQueryActive: `SELECT employeeid as idno, employeelname as last_name, employeefname as first_name, employeeempstat as status FROM master WHERE employeeid LIKE ? AND employeelname LIKE ? and employeefname LIKE ? ORDER BY employeelname, employeefname LIMIT ? OFFSET ?`,
//       countSqlQueryActive: `SELECT COUNT(*) FROM master WHERE employeeid LIKE ? AND employeelname LIKE ? and employeefname LIKE ?`,

//       sqlQueryResigned: `SELECT employeeid as idno, employeelname as last_name, employeefname as first_name, employeemi as middle_name, employeedateemp as hired_date,
//                           empresigndate as resigned_date, (SELECT regionname FROM region WHERE regionid = employeeregion) as region FROM master WHERE employeelname LIKE ? and employeefname LIKE ? AND employeeempstat = 0 ORDER BY employeelname, employeefname
//                           LIMIT ? OFFSET ?`,
//       countSqlQueryResigned: `SELECT COUNT(*) FROM master
//                           WHERE employeelname LIKE ? and employeefname LIKE ? AND employeeempstat = 0`,
//     };
//   } else if (officeLower === "luzon") {
//     console.log("luzon query");
//     return {
//       dbConnection: "visminRec", // Add db connection for vismin
//       sqlQueryActive: `SELECT idno, last_name , first_name ,  IF(resigned_date IS NULL OR resigned_date = '0000-00-00', 1, 2) AS status  from luzon_employees
//                     WHERE idno LIKE ? AND last_name LIKE  ? and first_name LIKE ?
//                     ORDER BY last_name, first_name LIMIT ? OFFSET ?`,
//       countSqlQueryActive: `SELECT COUNT(*) FROM luzon_employees WHERE idno LIKE ? AND  last_name LIKE ? AND first_name LIKE ?`,
//     };
//   } else {
//     return {
//       dbConnection: "mlgroup",
//       sqlQueryActive: `SELECT employeeid as idno, employeelname as last_name, employeefname as first_name, employeeempstat as status
//                      FROM master
//                      WHERE employeeid LIKE ? AND employeelname LIKE ? and employeefname LIKE ?
//                      ORDER BY employeelname, employeefname
//                      LIMIT ? OFFSET ?`,
//       countSqlQueryActive: `SELECT COUNT(*)
//                           FROM master
//                           WHERE employeeid LIKE ? AND employeelname LIKE ? and employeefname LIKE ?`,
//       sqlQueryResigned: `SELECT employeeid as idno, employeelname as last_name, employeefname as first_name, employeemi as middle_name, employeedateemp as hired_date,
//                           empresigndate as resigned_date, (SELECT regionname FROM region WHERE regionid = employeeregion) as region FROM master WHERE employeeid LIKE ? AND employeelname LIKE ? and employeefname LIKE ? AND employeeempstat = 0 ORDER BY employeelname, employeefname
//                           LIMIT ? OFFSET ?`,
//       countSqlQueryResigned: `SELECT COUNT(*) FROM master
//                           WHERE employeeid LIKE ? AND employeelname LIKE ? and employeefname LIKE ? AND employeeempstat = 0`,
//     };
//   }
// };

// ─── Config ───────────────────────────────────────────────────────────────────

//working

// const OFFICE_CONFIG = {
//   vismin: {
//     dbConnection: "visminRec",
//     table: "master",
//     columns: {
//       id: "employeeid",
//       last: "employeelname",
//       first: "employeefname",
//       status: "employeeempstat",
//     },
//   },
//   luzon: {
//     dbConnection: "visminRec",
//     table: "luzon_employees",
//     columns: {
//       id: "idno",
//       last: "last_name",
//       first: "first_name",
//       status: null,
//     },
//   },
//   default: {
//     dbConnection: "mlgroup",
//     table: "master",
//     columns: {
//       id: "employeeid",
//       last: "employeelname",
//       first: "employeefname",
//       status: "employeeempstat",
//     },
//   },
// };

// // ─── Query Builder ────────────────────────────────────────────────────────────

// function buildQueries({ table, columns }, isResigned) {
//   const { id, last, first, status } = columns;

//   // Luzon has no dedicated status column — derives it from resigned_date instead
//   const isLuzon = !status;

//   // Active/resigned filter differs per office type
//   const statusFilter = isLuzon
//     ? isResigned
//       ? `AND (resigned_date IS NOT NULL AND resigned_date != '0000-00-00')`
//       : `AND (resigned_date IS NULL OR resigned_date = '0000-00-00')`
//     : isResigned
//       ? `AND ${status} = 0`
//       : `AND ${status} != 0`;

//   // Luzon status is computed; others read it directly from the column
//   const statusExpr = isLuzon
//     ? `IF(resigned_date IS NULL OR resigned_date = '0000-00-00', 1, 2) AS status`
//     : `${status} AS status`;

//   const whereClause = `
//     WHERE ${id}   LIKE ?
//       AND ${last}  LIKE ?
//       AND ${first} LIKE ?
//       ${statusFilter}
//   `;

//   return {
//     sqlQuery: `
//       SELECT ${id} AS idno, ${last} AS last_name, ${first} AS first_name, ${statusExpr}
//       FROM   ${table}
//       ${whereClause}
//       ORDER  BY ${last}, ${first}
//       LIMIT  ? OFFSET ?
//     `,
//     countSqlQuery: `
//       SELECT COUNT(*) FROM ${table} ${whereClause}
//     `,
//   };
// }

// // ─── Model Function ───────────────────────────────────────────────────────────

// // FIX: Renamed from searchActiveEmployees → searchEmployees since it now
// //      handles both active and resigned. Added `status` param ("active" | "resigned").
// async function searchEmployees(
//   office,
//   idno,
//   lastName,
//   firstName,
//   status,
//   limit,
//   offset,
// ) {
//   const isResigned = status === "resigned";

//   const config = OFFICE_CONFIG[office.toLowerCase()] ?? OFFICE_CONFIG.default;
//   const queries = buildQueries(config, isResigned);
//   const dbPool = getRecordsDbPool(office);

//   const params = [
//     idno ? `%${idno}%` : "%%",
//     lastName ? `${lastName}%` : "%%",
//     firstName ? `%${firstName}%` : "%%",
//   ];

//   const [[results], [countResults]] = await Promise.all([
//     dbPool.execute(queries.sqlQuery, [
//       ...params,
//       String(limit),
//       String(offset),
//     ]),
//     dbPool.execute(queries.countSqlQuery, params),
//   ]);

//   const totalRecords = countResults[0]["COUNT(*)"];
//   const totalPages = Math.ceil(totalRecords / limit);
//   const currentPage = Math.floor(offset / limit) + 1;

//   return { results, totalPages, currentPage };
// }

// module.exports = {
//   searchEmployees,
// };

//const db = require("../config/db");

// function getRecordsDbPool(office) {
//   switch ((office || '').toLowerCase()) {
//     case 'luzon':
//       return db.visminRec;
//     case 'vismin':
//       return db.visminRec;
//     case 'ml group':
//       return db.mlgroup;
//     case 'visminrecruitment':
//       return db.visminReq;
//     default:
//       return db.default;
//   }
// }

const db = require('../config/db');

function getRecordsDbPool(office) {
  switch ((office || '').toLowerCase()) {
    case 'luzon':
      console.log(office, 1);
      return db.visminRec;
    case 'vismin':
      console.log(office, 2);
      return db.visminRec;
    case 'mlinc':
      console.log(office, 3);
      return db.default;
    case 'visminrecruitment':
      return db.visminReq;
    default:
      (console.log(office), 4);
      return db.default;
  }
}

const OFFICE_CONFIG = {
  vismin: {
    table: 'master',
    columns: {
      id: 'employeeid',
      last: 'employeelname',
      first: 'employeefname',
      middle: 'employeemi',
      status: 'employeeempstat',
    },
  },
  luzon: {
    table: 'hr_employees_luzon', // see note below — verify this vs hr_employees_luzon
    columns: {
      id: 'idno',
      last: 'lastname',
      first: 'firstname',
      middle: 'fore_name',
      status: null,
    },
  },
  mlinc: {
    table: 'hr_employees_mlinc',
    columns: {
      id: 'employeeid',
      last: 'employeelname',
      first: 'employeefname',
      middle: 'employeemi',
      status: 'employeeempstat',
    },
  },
  default: {
    table: 'master',
    columns: {
      id: 'employeeid',
      last: 'employeelname',
      first: 'employeefname',
      middle: 'employeemi',
      status: 'employeeempstat',
    },
  },
};

function buildQueries({ table, columns }) {
  const { id, last, first, middle, status } = columns;
  const isLuzon = !status;

  // No status filter — return ALL employees (active + resigned)
  const statusExpr = isLuzon
    ? `IF(resigned_date IS NULL OR resigned_date = '0000-00-00', 1, 2) AS status`
    : `${status} AS status`;

  const whereClause = `
    WHERE ${id}   LIKE ?
      AND ${last}  LIKE ?
      AND ${first} LIKE ?
      AND COALESCE(${middle}, '') LIKE ?
  `;

  return {
    sqlQuery: `
      SELECT ${id} AS idno, ${last} AS last_name, ${first} AS first_name, ${middle} AS middle_name, ${statusExpr}
      FROM   ${table}
      ${whereClause}
      ORDER  BY ${last}, ${first}
      LIMIT  ? OFFSET ?
    `,
    countSqlQuery: `
      SELECT COUNT(*) FROM ${table} ${whereClause}
    `,
  };
}

async function searchEmployees(office, idno, lastName, firstName, middleName, limit, offset) {
  const config = OFFICE_CONFIG[office.toLowerCase()] ?? OFFICE_CONFIG.default;

  const queries = buildQueries(config);
  const dbPool = getRecordsDbPool(office);

  const params = [
    idno ? `%${idno}%` : '%%',
    lastName ? `${lastName}%` : '%%',
    firstName ? `%${firstName}%` : '%%',
    middleName ? `${middleName}%` : '%%',
  ];

  console.log('++++++++++++++++++++++++++++++++++ ', office, queries, params);
  const [[results], [countResults]] = await Promise.all([
    dbPool.execute(queries.sqlQuery, [...params, String(limit), String(offset)]),
    dbPool.execute(queries.countSqlQuery, params),
  ]);

  const totalRecords = countResults[0]['COUNT(*)'];
  const totalPages = Math.ceil(totalRecords / limit);

  return { results, totalPages };
}

module.exports = { searchEmployees };
