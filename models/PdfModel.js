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

// Query to get report data based on date
exports.getReportData = async (date, office, report) => {
  console.log("+++++++++++ ", date);
  try {
    const dbName = getDBForOffice(office.toLowerCase());
    const db = connectDB(dbName.dbName);
    const year = payrollYear(date);
    console.log(report, typeof report);
    if (report.toLowerCase() === "generate pdf") {
      ({ results, regions } = await createPDF(db, date, year, dbName));
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

const createPDF = async (db, date, year, dbName) => {
  const query = `
      SELECT region, lastname, firstname, totalnet 
      FROM ${dbName.tableName}_${year}
      WHERE enddate = ? and region in ('bohol', 'leyteb', 'leytea')
      ORDER BY region, lastname, firstname
    `;
  const results = await new Promise((resolve, reject) => {
    db.query(query, [date], (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
  return { results };
};
