// models/PdfModel.js
//const db = require("../config/db"); // Assuming you have a DB connection set up
const connectDB = require("../config/db");

// ----------------------------------------- GETTING OFFICE VALUES FOR DB CONNECTION AND FOR TABLE NAME -----------------------------------------
const getDBForOffice = (office) => {
  if (office.toLowerCase().includes("luzon")) {
    return {
      dbName: "luzon",
      tableName: "luzpayroll",
    };
  } else if (office.toLowerCase().includes("vismin")) {
    return {
      dbName: "vismin",
      tableName: "payroll",
    };
  } else if (office.toLowerCase().includes("ml group")) {
    return {
      dbName: "mlgroup",
      tableName: "mlpayroll",
    };
  } else {
    throw new Error("Unknown office.");
  }
};
// ----------------------------------------- GETTING OFFICE VALUES FOR DB CONNECTION AND FOR TABLE NAME -----------------------------------------

// ----------------------------------------- GETTING THE PAYROLL YEAR -----------------------------------------
const payrollYear = (dateString) => {
  const date = new Date(dateString);
  return date.getFullYear();
};
// ----------------------------------------- GETTING THE PAYROLL YEAR -----------------------------------------

// ----------------------------------------- GETTING REPORT DATA BY DATE ----------------------------------------- //
exports.getReportData = async (date, office, report, selectedRegion) => {
  try {
    const dbName = getDBForOffice(office.toLowerCase());
    const db = connectDB(dbName.dbName);
    const year = payrollYear(date);

    console.log(dbName.dbName, dbName.tableName, year);
    let regionFilter;
    if (selectedRegion === "") {
      regionFilter = "";
    } else {
      regionFilter = `AND REGION = '${selectedRegion}'`;
    }
    if (report.toLowerCase() === "net pay") {
      console.log("net pay");
      const query = `
      SELECT region, idno, concat(lastname, ', ', firstname) as employeeName, totalnet 
      FROM ${dbName.tableName}_${year}
      WHERE enddate = ? ${regionFilter}
      ORDER BY region, lastname, firstname
    `;

      ({ results, regions } = await createPDF(db, date, year, dbName, query));
    } else if (report.toLowerCase() === "ml fund") {
      const query = `
      SELECT region, idno, concat(lastname, ', ', firstname) as employeeName, mlfund as totalnet 
      FROM ${dbName.tableName}_${year}
      WHERE enddate = ? ${regionFilter}
      and mlfund > 0
      ORDER BY region, lastname, firstname
    `;
      ({ results, regions } = await createPDF(db, date, year, dbName, query));
      console.log(query);
    } else if (report.toLowerCase() === "gpa") {
      const query = `
      SELECT region, idno, concat(lastname, ', ', firstname) as employeeName, if(deductiondesc1 like '%gpa%', deductionamount1, if(deductiondesc2 like '%gpa%', deductionamount2, 0)) as totalnet 
      FROM ${dbName.tableName}_${year}
      WHERE enddate = ? ${regionFilter}
      AND if(deductiondesc1 like '%gpa%', deductionamount1, if(deductiondesc2 like '%gpa%', deductionamount2, 0)) > 0
      ORDER BY region, lastname, firstname
    `;
      ({ results, regions } = await createPDF(db, date, year, dbName, query));
    } else if (report.toLowerCase() === "sako") {
      const query = `
      SELECT region, idno, concat(lastname, ', ', firstname) as employeeName, (sakoprovi + sakocommodity + sakoprime + sakoemergency + sakopettycash + sakocbu) as totalnet 
      FROM ${dbName.tableName}_${year}
      WHERE enddate = ? ${regionFilter}
      AND (sakoprovi + sakocommodity + sakoprime + sakoemergency + sakopettycash + sakocbu) > 0
      ORDER BY region, lastname, firstname
    `;
      ({ results, regions } = await createPDF(db, date, year, dbName, query));
    } else if (report.toLowerCase() === "income tax") {
      const query = `
      SELECT region, idno, concat(lastname, ', ', firstname) as employeeName, incomeTax as totalnet 
      FROM ${dbName.tableName}_${year}
      WHERE enddate = ? ${regionFilter}
      AND incomeTax > 0
      ORDER BY region, lastname, firstname
    `;
      ({ results, regions } = await createPDF(db, date, year, dbName, query));
    } else {
      throw new Error("Unknown report type.");
    }
    return results;

    // const [rows] = results;
    // return rows;
  } catch (error) {
    console.error("Error fetching report data:", error);
    throw error;
  }
};
// ----------------------------------------- GETTING REPORT DATA BY DATE ----------------------------------------- //

// CREATING THE PDF FUNCTION
const createPDF = async (db, date, year, dbName, query) => {
  const results = await new Promise((resolve, reject) => {
    db.query(query, [date], (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
  return { results };
};
// CREATING THE PDF FUNCTION
