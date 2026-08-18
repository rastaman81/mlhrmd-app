const { Types } = require("mysql2");
const db = require("../config/db");
const utilitiesModel = require("../models/utilitiesModel");
const { report } = require("../routes/routes");

const { DBFFile } = require("dbffile");
const path = require("path");
const fs = require("fs").promises;

// Render the payroll utilities page
async function getPayrollUtilitiesPage(req, res) {
  try {
    // Fetch office data
    const offices = await utilitiesModel.getOffice();
    const utilities = await utilitiesModel.getPayrollUtilities();
    //const incomeTypes = await utilitiesModel.getPayrollIncomeTypes();
    const deductionTypes = await utilitiesModel.getPayrollDeductionTypes();

    res.render("payroll-utilities", {
      title: "Payroll Utilities",
      offices: offices,
      utilities: utilities,
      //incomeTypes: incomeTypes,
      //deductionTypes: deductionTypes,
      username: req.session.user.username,
    });
  } catch (error) {
    console.error("Error loading payroll utilities page:", error);
    res.status(500).render("error", {
      error: "Error loading payroll utilities page",
    });
  }
}

async function getPayrollReportsPage(req, res) {
  try {
    // Fetch office data
    const offices = await utilitiesModel.getOffice();
    const reportTypes = await utilitiesModel.getPayrollReportTypes();
    const incomeTypes = await utilitiesModel.getPayrollIncomeTypes();
    const deductionTypes = await utilitiesModel.getPayrollDeductionTypes();

    res.render("payroll-reports", {
      title: "Payroll Reports",
      offices: offices,
      reportTypes: reportTypes,
      incomeTypes: incomeTypes,
      deductionTypes: deductionTypes,
      username: req.session.user.username,
    });
  } catch (error) {
    console.error("Error loading payroll utilities page:", error);
    res.status(500).render("error", {
      error: "Error loading payroll utilities page",
    });
  }
}

async function generatePayrollReports(req, res) {
  try {
    const {
      dateRange = "",
      office = "",
      region = "",
      reportType = "",
      incomeType = "",
      deductionType = "",

      amount = "",
      description = "",
    } = req.body;
    // Validate required fields
    if (!office || !region || !reportType) {
      return res.status(400).json({
        success: false,
        message: "Office, region, and utility name are required fields",
      });
    }

    // Parse date range - handle empty case
    const { startDate, endDate } = getDates(dateRange);

    let startYear = "";
    let endYear = "";
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      startYear = start.getFullYear();
      endYear = end.getFullYear();
    }

    const payrollInfo = getPayrollFolder(office);
    const payrollTable = payrollInfo.tableName + endYear;

    let message = "";
    let results = [];
    let hasIssues = false;
    console.log(reportType);
    if (reportType.toLowerCase().trim() === "complete payroll details") {
      let query = "";
      if (
        office.toLowerCase() === "vismin" ||
        office.toLowerCase() === "vismin"
      ) {
        query = `SELECT startDate, endDate, region, department, branch, lastname, firstname, IF(monthlyrate <=0, 'daily', 'monthly') AS payrollType, dailyrate, (minutesworked / 480) AS minutesworked, 
        basicpay, totalallow, totalot, cola, (incomeamount1 + incomeamount2) AS otherincome, gross, lates, leaves as absent, incometax, ssscontri, pagibigcontri, sssloan, pagibigloan, mlfund, opec, overappraisal,
        cooprecla, filmalending AS philhealth, installaccount, ticket, mobilebill, canteen, sakoprovi, sakocommodity, sakoprime, sakoemergency,
        sakopettycash, sakocbu, sakosavings, deductionamount1, deductionamount2, c_hmo as hmo, totaldeduction, totalnet, deductionDesc1, deductionDesc2 FROM ${payrollTable} where enddate = ? and region not in ('MANCOMM', 'MANCOMML') ORDER BY region, department, lastname, firstname;`;
      } else {
        query = `SELECT startDate, endDate, region, department, branch, lastname, firstname, IF(monthlyrate <=0, 'daily', 'monthly') AS payrollType, dailyrate, (minutesworked / 480) AS minutesworked, 
        basicpay, totalallow, totalot, cola, (incomeamount1 + incomeamount2) AS otherincome, gross, lates, LEAVES AS absent, incometax, 
        ssscontri, pagibigcontri, sssloan, pagibigloan, \`car-motorloan\` as carloan, mlfund, hmo, mlcellphone, philhealth, mlaccount, atd, odetteloan, 
        deductionamount1, deductionamount2, mllending, c_hmo AS payables, totaldeduction, totalnet, deductionDesc1, deductionDesc2 FROM ${payrollTable} WHERE enddate = ? AND region NOT IN ('MANCOMM', 'MANCOMML') ORDER BY region, department, lastname, firstname;`;
      }

      [results] = await db.query(query, endDate);
      console.log(results);
      if (results.length > 0) {
        hasIssues = true;
        message = `Found ${results.length} employees`;
      } else {
        message = `No employees found`;
      }
    } else if (reportType.toLowerCase().trim() === "deduction") {
      if (
        deductionType.toLowerCase() === "mlfund (xls)" ||
        deductionType.toLowerCase() === "mlfund (pdf)"
      ) {
        console.log("deduction", deductionType);
        const query = `SELECT enddate, region, region_code, region_description, idno, CONCAT(lastname, ', ', firstname) AS 
        employee, mlfund  FROM ${payrollTable} WHERE enddate = ? AND mlfund > 0 ORDER BY region, lastname, firstname`;
        [results] = await db.query(query, endDate);
        console.log(results);
        if (results.length > 0) {
          hasIssues = true;
          message = `Found ${results.length} employees.`;
        } else {
          message = `No employees found`;
        }
      } else if (deductionType.toLowerCase() === "sako") {
        const query = `
      SELECT region, idno, concat(lastname, ', ', firstname) as employeeName, sakoemergency as totalnet 
      FROM ${dbName.tableName}_${year}
      WHERE enddate = ? ${regionFilter}
      AND sakoemergency > 0
      ORDER BY region, lastname, firstname
    `;
        ({ results, regions } = await createPDF(db, date, year, dbName, query));
      } else if (deductionType.toLowerCase() === "gpa") {
        const query = `
      SELECT region, idno, concat(lastname, ', ', firstname) as employeeName, if(deductiondesc1 like '%gpa%', deductionamount1, if(deductiondesc2 like '%gpa%', deductionamount2, 0)) as totalnet 
      FROM ${dbName.tableName}_${year}
      WHERE enddate = ? ${regionFilter}
      AND if(deductiondesc1 like '%gpa%', deductionamount1, if(deductiondesc2 like '%gpa%', deductionamount2, 0)) > 0
      ORDER BY region, lastname, firstname
    `;
        ({ results, regions } = await createPDF(db, date, year, dbName, query));
      }
    } else {
      console.log(false);
    }
    console.log(results);
    return res.json({
      success: true,
      message: message,
      hasIssues: hasIssues,
      results: results,
      reportType: reportType,
    });
  } catch (error) {
    console.error("Error in executeTask:", error);
    return res.status(500).json({
      success: false,
      message: "Error executing task: " + error.message,
    });
  }
}

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

// New endpoint to get regions by office
async function getRegionsByOffice(req, res) {
  try {
    const { office } = req.query;

    if (!office) {
      return res.json({
        success: false,
        message: "Office parameter is required",
      });
    }
    //(office.toLowerCase());
    // Determine which region table to query based on office
    //let regionTable = "pay_regions";
    // if (office.toLowerCase() === "vismin") {
    //   console.log(1);
    //   regionTable = "pay_regions";
    // } else if (office.toLowerCase() === "luzon") {
    //   console.log(2);
    //   regionTable = "pay_luz_regions";
    // } else if (office.toLowerCase() === "mlgroup") {
    //   console.log(3);
    //   regionTable = "pay_mlg_regions";
    // } else {
    //   console.log(4);
    //   return res.json({
    //     success: false,
    //     message: "Invalid office selection",
    //   });
    // }
    //console.log(regionTable);
    const regions = await utilitiesModel.getPayrollRegions(office);

    res.json({
      success: true,
      regions: regions,
    });
  } catch (error) {
    console.error("Error fetching regions:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching regions",
    });
  }
}

// Generate payroll report
async function generatePayrollReport(req, res) {
  try {
    // Log the incoming request body for debugging
    //console.log("Request body:", req.body);

    // Use proper default values if fields are empty
    const {
      dateRange = "",
      office = "",
      region = "",
      reportType = "",
      incomeType = "",
      deductionType = "",
    } = req.body;

    // Here you would implement the actual report generation logic
    // This is a more robust query with parameter validation
    const query = `
        SELECT 
          e.employeeid,
          CONCAT(e.employeefname, ' ', e.employeelname) AS name,
          e.employeebranch AS office,
          r.regionname AS region,
          SUM(p.gross_pay) AS gross_pay,
          SUM(p.total_deductions) AS deductions,
          SUM(p.net_pay) AS net_pay
        FROM 
          rec_vm_employees e
        LEFT JOIN payroll_records p ON e.employeeid = p.employee_id
        LEFT JOIN region r ON e.employeeregion = r.regionid
        WHERE 
          (? IS NULL OR p.pay_date BETWEEN ? AND ?)
          AND (? = '' OR e.employeebranch = ?)
          AND (? = '' OR r.regionname = ?)
        GROUP BY e.employeeid
      `;

    const [results] = await db.query(query, [
      dateRange ? 1 : null,
      startDate,
      endDate,
      office,
      office,
      region,
      region,
    ]);

    res.json({
      success: true,
      reportData: results,
      reportType: reportType,
      parameters: {
        dateRange,
        office,
        region,
        incomeType,
        deductionType,
      },
    });
  } catch (error) {
    console.error("Error generating payroll report:", error);
    res.status(500).json({
      success: false,
      message: "Error generating payroll report",
      error: error.message,
    });
  }
}

// async function executeTask(req, res) {
//   try {
//     const { region } = req.body;

//     if (!region) {
//       return res.status(400).json({
//         success: false,
//         message: "Region is required",
//       });
//     }

//     const regionName = region.toUpperCase().trim();
//     const filePath = path.join("C:", "PAYROLL1", regionName, "master.dbf");
//     const tempPath = filePath + ".tmp";

//     // Check if file exists
//     if (!fs.existsSync(filePath)) {
//       return res.status(404).json({
//         success: false,
//         message: `DBF file not found at path: ${filePath}`,
//       });
//     }

//     let updatedCount = 0;

//     try {
//       // Step 1: Read the original DBF file
//       const dbf = await DBFFile.open(filePath);
//       console.log(`Opened DBF file with ${dbf.recordCount} records`);

//       const records = await dbf.readRecords();
//       console.log(`Read ${records.length} records`);

//       // Step 2: Update records
//       const updatedRecords = records.map((record) => {
//         if (record.e_compstat === "REGULAR") {
//           updatedCount++;
//           return { ...record, e_basepay: 2.0 }; // Modify the `e_basepay` value
//         }
//         return record;
//       });

//       // Step 3: Prepare field specifications for the new DBF file
//       const fieldSpecs = dbf.fields.map((field) => ({
//         name: field.name,
//         type: field.type,
//         size: field.size,
//         decimalPlaces: field.decimalPlaces,
//       }));

//       // Step 4: Create new DBF file
//       const newDbf = await DBFFile.create(tempPath, fieldSpecs);
//       console.log("Created temporary DBF file for updated records");

//       // Step 5: Write updated records to the new DBF file
//       await newDbf.writeRecords(updatedRecords);
//       console.log(
//         `Successfully wrote ${updatedRecords.length} records to the temporary file`
//       );

//       // Step 6: Clean up the old DBF file and rename the temporary file to the original file
//       await dbf.close();
//       await newDbf.close();

//       fs.unlinkSync(filePath); // Delete the original DBF file
//       fs.renameSync(tempPath, filePath); // Rename the temp file to the original name
//       console.log(`Replaced original DBF file with updated version`);

//       return res.json({
//         success: true,
//         message: `DBF file updated successfully. ${updatedCount} records modified.`,
//         updatedCount,
//       });
//     } catch (error) {
//       console.error("Error processing DBF file:", error);

//       // Clean up temporary file if it exists
//       if (fs.existsSync(tempPath)) {
//         fs.unlinkSync(tempPath);
//         console.log("Cleaned up temporary file");
//       }

//       return res.status(500).json({
//         success: false,
//         message: "Error updating DBF file",
//         error: error.message,
//       });
//     }
//   } catch (error) {
//     console.error("❌ Error in executeTask:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Server error during DBF operation",
//       error: error.message,
//     });
//   }
// }

// Utility function to handle invalid date values
// Function to format date for DBF
function formatDateForDBF(dateString) {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  //console.log(`${year}-${month}-${day}`);
  return new Date(`${year}-${month}-${day}`); // YYYYMMDD format
}

// Utility function to handle invalid date values

// function handleInvalidDate(dateValue) {
//   // Check if the value is a valid date
//   const date = new Date(dateValue);
//   // If the date is invalid (NaN), return a default date (1970-01-01)
//   return isNaN(date.getTime()) ? new Date(0) : date; // Default to Jan 1, 1970
// }

const getDates = (dateRange) => {
  // Initialize startDate and endDate as null
  let startDate = null;
  let endDate = null;

  // Check if dateRange is provided and contains " to " to split the date range
  if (dateRange && dateRange.includes(" to ")) {
    [startDate, endDate] = dateRange.split(" to ");

    // Create Date objects for startDate and endDate
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Check if the dates are valid
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      // Format dates to "YYYY-MM-DD"
      startDate = start.toISOString().split("T")[0];
      endDate = end.toISOString().split("T")[0];
    } else {
      // If the dates are invalid, set them to null
      startDate = null;
      endDate = null;
    }
  }

  // Return the startDate and endDate
  return { startDate, endDate };
};

const handleInvalidDate = (dateValue) => {
  const date = new Date(dateValue);
  return isNaN(date.getTime()) ? new Date(0) : date;
};

const getPayrollFolder = (office) => {
  const lowerOffice = office.toLowerCase();
  return lowerOffice === "vismin"
    ? { folderName: "PAYROLL1", tableName: "payroll_" }
    : lowerOffice === "luzon"
    ? { folderName: "PAYROLL2", tableName: "luzpayroll_" }
    : { folderName: "PAYROLL3", tableName: "mlpayroll_" };
};

const bonusUpdater = async (masterDBFPath, tempDBFPath, basePay) => {
  try {
    // Step 1: Ensure the DBF file exists and is writable
    await fs.access(masterDBFPath, fs.constants.W_OK);
    console.log("✅ DBF File Exists and is Writable");
  } catch (error) {
    console.error("❌ DBF File Error:", error);
    throw new Error(
      "DBF file not found or not writable at path: " + masterDBFPath
    );
  }

  try {
    // Step 2: Open the DBF file using the DBFFile library
    const dbf = await DBFFile.open(masterDBFPath);

    // Step 3: Read all records from the DBF file
    const records = await dbf.readRecords();

    // Step 4: Sanitize the date fields before filtering or modifying
    const sanitizedRecords = records.map((record) => {
      return {
        ...record,
        E_DATEE: handleInvalidDate(record.E_DATEE),
        E_DATER: handleInvalidDate(record.E_DATER),
        E_DATEB: handleInvalidDate(record.E_DATEB),
      };
    });

    // Step 5: Find all records where E_COMPSTAT is "REGULAR"
    const regularRecords = sanitizedRecords.filter(
      (record) => record.E_COMPSTAT === "REGULAR"
    );

    // Step 6: Modify the E_BASEPAY to 2.0 for those records
    const modifiedRecords = regularRecords.map((record) => {
      return { ...record, E_BASEPAY: basePay }; // Update E_BASEPAY field
    });

    // Step 7: Remove all records with E_COMPSTAT === "REGULAR" from the sanitized records
    const filteredRecords = sanitizedRecords.filter(
      (record) => record.E_COMPSTAT !== "REGULAR"
    );

    // Step 8: Combine the filtered records with the modified regular records
    const updatedRecords = [...filteredRecords, ...modifiedRecords];

    // Step 9: Create a new DBF file with the updated records
    const newDbf = await DBFFile.create(tempDBFPath, dbf.fields); // Create new DBF with same structure as the original
    await newDbf.appendRecords(updatedRecords); // Write the updated records into the new DBF file

    // Step 10: Delete the old DBF file and rename the new one
    await fs.unlink(masterDBFPath); // Delete the original DBF file
    await fs.rename(tempDBFPath, masterDBFPath); // Rename the new DBF file to the original name

    console.log("✅ DBF File updated and saved successfully!");
  } catch (error) {
    console.error("❌ Error processing DBF file:", error);
  }
  console.log("✅ DBF File updated and saved successfully!");
  return "Bonus updater completed successfully with base pay: " + basePay;
};

const deductionUpdater = async (
  masterDBFPath,
  tempDBFPath,
  columnName,
  amountValue
) => {
  const targetColumn = columnName; // The column we want to update
  const deductionValue = amountValue; // The value to be set for P_DED10

  try {
    // Step 1: Ensure the DBF file exists and is writable
    await fs.access(masterDBFPath, fs.constants.W_OK);
    console.log("✅ DBF File Exists and is Writable");
  } catch (error) {
    console.error("❌ DBF File Error:", error);
    throw new Error(
      "DBF file not found or not writable at path: " + masterDBFPath
    );
  }

  try {
    // Step 2: Open the DBF file using the DBFFile library
    const dbf = await DBFFile.open(masterDBFPath);

    // Step 3: Read all records from the DBF file
    const records = await dbf.readRecords();

    // Step 4: Sanitize the date fields before modifying (if needed)
    const sanitizedRecords = records.map((record) => {
      return {
        ...record,
        P_BEGDATE: handleInvalidDate(record.P_BEGDATE),
        P_ENDDATE: handleInvalidDate(record.P_ENDDATE),
      };
    });

    // Step 5: Modify all records to set P_DED10 to 50
    const modifiedRecords = sanitizedRecords.map((record) => {
      return { ...record, [targetColumn]: deductionValue };
    });

    // Step 6: Create a new DBF file with the updated records
    const newDbf = await DBFFile.create(tempDBFPath, dbf.fields);
    await newDbf.appendRecords(modifiedRecords);

    // Step 7: Delete the old DBF file and rename the new one
    await fs.unlink(masterDBFPath);
    await fs.rename(tempDBFPath, masterDBFPath);

    console.log("✅ DBF File updated and saved successfully!");
    return `Deduction updater completed successfully. Set ${targetColumn} to ${deductionValue} for all records.`;
  } catch (error) {
    console.error("❌ Error processing DBF file:", error);
    throw error; // Re-throw the error to handle it in the calling function
  }
};

const updateRegularEmployees = async (
  masterDBFPath,
  payDBFPath,
  tempDBFPath,
  amount,
  description
) => {
  const descriptionAmount = parseFloat(amount);
  try {
    deleteTempFile(tempDBFPath);

    // Step 1: Ensure both DBF files exist and are writable
    await Promise.all([
      fs.access(masterDBFPath, fs.constants.R_OK),
      fs.access(payDBFPath, fs.constants.W_OK),
    ]);
    console.log("✅ Both DBF Files Exist and are Accessible");
  } catch (error) {
    console.error("❌ DBF File Error:", error);
    throw new Error("DBF files not found or not accessible");
  }

  try {
    // Step 2: Open both DBF files
    const masterDBF = await DBFFile.open(masterDBFPath);
    const payDBF = await DBFFile.open(payDBFPath);

    // Step 3: Read all records from both files
    const masterRecords = await masterDBF.readRecords();
    const payRecords = await payDBF.readRecords();

    // Step 4: Create a map of regular employees from MASTER.dbf for quick lookup
    const regularEmployees = new Map();
    masterRecords.forEach((record) => {
      if (record.E_COMPSTAT === "REGULAR") {
        regularEmployees.set(record.E_IDNO, true);
      }
    });

    // Step 5: Modify pay records that match regular employees
    const modifiedPayRecords = payRecords.map((record) => {
      if (regularEmployees.has(record.P_EMPNO)) {
        return {
          ...record,
          P_RENDESC1: description,
          P_RENUM1: descriptionAmount,
        };
      }
      return record;
    });

    // Step 6: Create a new pay DBF file with the updated records
    const newPayDBF = await DBFFile.create(tempDBFPath, payDBF.fields);
    await newPayDBF.appendRecords(modifiedPayRecords);

    // Step 7: Replace the old pay file with the new one
    await fs.unlink(payDBFPath);
    await fs.rename(tempDBFPath, payDBFPath);

    console.log("✅ Pay DBF File updated successfully!");
    return "Regular employee records updated successfully with PB and 360 values";
  } catch (error) {
    console.error("❌ Error processing DBF files:", error);
    throw error;
  }
};

const deleteTempFile = async (tempDBFPath) => {
  try {
    await fs.access(tempDBFPath);
    await fs.unlink(tempDBFPath); // Delete if exists
    console.log(`❌ Old temporary file deleted: ${tempDBFPath}`);
  } catch (err) {
    // File doesn't exist (no action needed)
  }
};
const updatePhilhealthDeductions = async (
  payDBFPath,
  tempDBFPath,
  targetDate
) => {
  try {
    // Step 1: Check if the temporary file exists (async)
    deleteTempFile(tempDBFPath);
    /// DELETING THE EXISTING TEMPORARY FILES
    // try {
    //   await fs.access(tempDBFPath);
    //   await fs.unlink(tempDBFPath); // Delete if exists
    //   console.log(`❌ Old temporary file deleted: ${tempDBFPath}`);
    // } catch (err) {
    //   // File doesn't exist (no action needed)
    // }

    // Step 2: Fetch Philhealth brackets and open the DBF file
    const philhealthBracket = await utilitiesModel.getPhilhealthTable();
    console.log("ℹ️ Philhealth Bracket:", philhealthBracket);

    const payDBF = await DBFFile.open(payDBFPath);
    const payRecords = await payDBF.readRecords();

    // Step 3: Update records based on conditions
    const updatedPayRecords = payRecords.map((record) => {
      const recordEndDate = record.P_ENDDATE.toISOString().slice(0, 10); // Format: 'yyyy-MM-dd'

      if (recordEndDate === targetDate) {
        const monthlyRate = record.P_MRATE;
        const dailyRate = record.P_DRATE;
        const isMonthlyZero = monthlyRate === 0;

        // Condition 1: Monthly ≤ 10,000 and not zero
        if (monthlyRate <= 10000 && !isMonthlyZero) {
          record.P_DED5 = philhealthBracket.minimum / 2;
        }
        // Condition 2: Daily × 26 ≤ 10,000 and monthly = 0
        else if (isMonthlyZero && dailyRate * 26 <= 10000) {
          record.P_DED5 = philhealthBracket.minimum / 2;
        }
        // Condition 3: Monthly ≥ 100,000 and not zero
        else if (monthlyRate >= 100000 && !isMonthlyZero) {
          record.P_DED5 = philhealthBracket.maximum / 2;
        }
        // Condition 4: Daily × 26 ≥ 100,000 and monthly = 0
        else if (isMonthlyZero && dailyRate * 26 >= 100000) {
          record.P_DED5 = philhealthBracket.maximum / 2;
        }
        // Condition 5: Monthly between 10,000.01 and 99,999.99
        else if (
          !isMonthlyZero &&
          monthlyRate > 10000 &&
          monthlyRate < 100000
        ) {
          record.P_DED5 =
            Math.round(
              ((monthlyRate * philhealthBracket.percentage) / 2) * 100
            ) / 100;
        }
        // Condition 6: Daily × 26 between 10,000.01 and 99,999.99
        else if (
          isMonthlyZero &&
          dailyRate * 26 > 10000 &&
          dailyRate * 26 < 100000
        ) {
          record.P_DED5 =
            Math.round(
              ((dailyRate * 26 * philhealthBracket.percentage) / 2) * 100
            ) / 100;
        }
      }
      return record;
    });

    // Step 4: Create a new DBF file with updated records
    const newPayDBF = await DBFFile.create(tempDBFPath, payDBF.fields);
    await newPayDBF.appendRecords(updatedPayRecords);

    // Step 5: Replace the old file with the new one
    await fs.unlink(payDBFPath); // Delete original
    await fs.rename(tempDBFPath, payDBFPath); // Rename temp to original

    console.log("✅ Payroll DBF updated successfully!");
    return "Philhealth deductions updated successfully!";
  } catch (error) {
    console.error("❌ Error updating payroll:", error);
    throw new Error(`Failed to update deductions: ${error.message}`);
  }
};

async function executeTask(req, res) {
  try {
    //console.log(req.body);
    const {
      dateRange = "",
      office = "",
      region = "",
      reportType = "",
      incomeType = "",
      deductionType = "",
      utilityName = "",
      amount = "",
      description = "",
    } = req.body;

    // Validate required fields
    if (!office || !region || !utilityName) {
      return res.status(400).json({
        success: false,
        message: "Office, region, and utility name are required fields",
      });
    }

    // Parse date range - handle empty case
    const { startDate, endDate } = getDates(dateRange);

    let startYear = "";
    let endYear = "";
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      startYear = start.getFullYear();
      endYear = end.getFullYear();
    }

    const payrollInfo = getPayrollFolder(office);
    const payrollTable = payrollInfo.tableName + endYear;
    const masterDBFPath = path.join(
      "C:",
      payrollInfo.folderName,
      region,
      "master.dbf"
    );
    const tempDBFPath = path.join(
      "C:",
      payrollInfo.folderName,
      region,
      "master_temp.dbf"
    );

    const payrollDBPath = path.join(
      "C:",
      payrollInfo.folderName,
      region,
      `Pay` + endYear + `.dbf`
    );

    const temppayrollDBPath = path.join(
      "C:",
      payrollInfo.folderName,
      region,
      `Pay` + endYear + `_temp.dbf`
    );

    let message = "";
    let results = [];
    let hasIssues = false;

    if (utilityName.toLowerCase() === "bonus updater (1.0)") {
      await bonusUpdater(masterDBFPath, tempDBFPath, 1.0);
      message =
        "Bonus updater (1.0) executed successfully for region: " + region;
    } else if (utilityName.toLowerCase() === "bonus updater (2.0)") {
      await bonusUpdater(masterDBFPath, tempDBFPath, 2.0);
      message =
        "Bonus updater (2.0) executed successfully for region: " + region;
    } else if (utilityName.toLowerCase() === "insert mortuary") {
      const columnName = `P_DED10`;
      const amountValue = 50;
      await deductionUpdater(
        payrollDBPath,
        temppayrollDBPath,
        columnName,
        amountValue
      );
      message = "Mortuary  successfully added for region: " + region;
      //} else if (utilityName.toLowerCase() === "insert pb") {
    } else if (utilityName.toLowerCase() === "update income 1") {
      console.log(typeof amount, "typeof");
      await updateRegularEmployees(
        masterDBFPath,
        payrollDBPath,
        temppayrollDBPath,
        amount,
        description
      );
      message = "PB  successfully added for region: " + region;
    } else if (utilityName.toLowerCase() === "remove philhealth") {
      const columnName = `P_DED5`;
      const amountValue = 0.0;
      await deductionUpdater(
        payrollDBPath,
        temppayrollDBPath,
        columnName,
        amountValue
      );
      message = "Mortuary  successfully added for region: " + region;
    } else if (utilityName.toLowerCase() === "check excess no. of days") {
      if (!endDate) {
        return res.status(400).json({
          success: false,
          message: "End date is required for checking excess days",
        });
      }

      const query = `select region, concat(lastname, ',  ', firstname) as ename, ((minutesworked / 60) / 8) as noOfdays from ${payrollTable} where enddate = ? and minutesworked > 7680 order by region, ename`;
      [results] = await db.query(query, endDate);

      if (results.length > 0) {
        hasIssues = true;
        message = `Found ${results.length} employees with excess days`;
      } else {
        message = "No employees found with excess days";
      }
    } else if (utilityName.toLowerCase() === "check negative amount") {
      if (!endDate) {
        return res.status(400).json({
          success: false,
          message: "End date is required for checking negative amount",
        });
      }

      const query = `select region, concat(lastname, ',  ', firstname) as ename, totalnet, DATE_FORMAT(enddate,'%m/%d/%Y') as pay_period from ${payrollTable} where enddate = ? and totalnet <= 0 order by region, ename`;
      [results] = await db.query(query, endDate);
      console.log(results);
      if (results.length > 0) {
        hasIssues = true;
        message = `Found ${results.length} employees with negative amount`;
      } else {
        message = `No employees found with negative amount`;
      }
    } else if (utilityName.toLowerCase() === "insert philhealth") {
      console.log("insert philhealth");
      await updatePhilhealthDeductions(
        payrollDBPath,
        temppayrollDBPath,
        endDate
      );
      message = "Mortuary  successfully added for region: " + region;
    } else {
      return res.status(400).json({
        success: false,
        message: "Unknown utility name: " + utilityName,
      });
    }
    console.log(results);
    return res.json({
      success: true,
      message: message,
      hasIssues: hasIssues,
      results: results,
      utilityName: utilityName,
    });
  } catch (error) {
    console.error("Error in executeTask:", error);
    return res.status(500).json({
      success: false,
      message: "Error executing task: " + error.message,
    });
  }
}

module.exports = {
  getPayrollUtilitiesPage,
  getRegionsByOffice,
  generatePayrollReport,
  getPayrollReportsPage,
  executeTask,
  generatePayrollReports,
};
