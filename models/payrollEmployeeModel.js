const { DBFFile } = require("dbffile");
const { type } = require("os");
const path = require("path");
const fs = require("fs").promises;

async function getEmployeesBySearch(region, idno, lastname, firstname, office) {
  try {
    const payrollInfo = getPayrollFolder(office);

    const masterDBFPath = path.join(
      "C:",
      payrollInfo.folderName.toUpperCase(),
      region.toUpperCase(),
      "master.DBF"
    );

    console.log(masterDBFPath);

    // Open the DBF file
    const dbf = await DBFFile.open(masterDBFPath);
    const allRecords = await dbf.readRecords();

    // Filter records with proper field existence checks
    const filteredRecords = allRecords.filter((record) => {
      // Convert all fields to strings and handle undefined/null cases
      const recordId = String(record.E_IDNO || "").toLowerCase();
      const recordLastName = String(record.E_LN || "").toLowerCase();
      const recordFirstName = String(record.E_FN || "").toLowerCase();
      const searchIdno = idno ? String(idno).toLowerCase() : null;
      const searchLastname = lastname ? String(lastname).toLowerCase() : null;
      const searchFirstname = firstname
        ? String(firstname).toLowerCase()
        : null;

      let matches = true;

      // Filter by IDNO if provided
      if (searchIdno) {
        matches = matches && recordId.includes(searchIdno);
      }

      // Filter by lastname if provided
      if (searchLastname) {
        matches = matches && recordLastName.includes(searchLastname);
      }

      if (searchFirstname) {
        matches = matches && recordFirstName.includes(searchFirstname);
      }

      return matches;
    });

    // Add region and office to each filtered record
    const resultsWithRegionAndOffice = filteredRecords.map((record) => {
      return {
        ...record, // Spread the original record's fields
        region, // Add region
        office, // Add office
      };
    });

    return resultsWithRegionAndOffice;
  } catch (error) {
    console.error("Error searching employees:", error);
    throw new Error("Failed to search employees");
  }
}

function getPayrollFolder(office) {
  const lowerOffice = office.toLowerCase();
  return lowerOffice === "vismin"
    ? { folderName: "PAYROLL1", tableName: "payroll_" }
    : lowerOffice === "luzon"
    ? { folderName: "PAYROLL2", tableName: "luzpayroll_" }
    : { folderName: "PAYROLL3", tableName: "mlpayroll_" };
}

async function updateEmployeeInDBF(employeeData) {
  try {
    const { idno, region, office, originalRegion, isTransferred, designation } =
      employeeData;
    const payrollInfo = getPayrollFolder(office);

    if (isTransferred) {
      // ============ TRANSFER LOGIC ============
      // 1. Get original master DBF path
      const originalMasterDBFPath = path.join(
        "C:",
        payrollInfo.folderName.toUpperCase(),
        originalRegion.toUpperCase(),
        "master.DBF"
      );
      console.log(isTransferred, "orig");

      // 2. Get employee info from original master
      const originalDbf = await DBFFile.open(originalMasterDBFPath);
      const allOriginalRecords = await originalDbf.readRecords();
      const employeeInfo = allOriginalRecords.find(
        (record) => String(record.E_IDNO || "") === String(idno)
      );

      if (!employeeInfo) {
        throw new Error(
          `Employee with ID ${idno} not found in original region`
        );
      }

      // 3. Clean ALL date fields from the original record before updating
      const cleanedEmployeeInfo = cleanRecordDates(employeeInfo);

      // 4. Update employee info for ORIGINAL region (Support)
      // Only update resignation date and status to "RESIGNED"
      const updatedEmployeeInfoForOriginal = {
        ...cleanedEmployeeInfo, // Keep all original data
        E_DATER: formatDateForDBF(employeeData.resigneddate), // Set resignation date
        E_COMPSTAT: "RESIGNED", // Force status to RESIGNED for original region
        E_SHIFT: 0.0,
      };

      // 5. Prepare employee info for NEW region (Bohol)
      // Update ALL data from form except resignation date (keep it null)
      const updatedEmployeeInfoForNew = mapFormDataToDbfRecord(
        employeeData,
        originalDbf.fields
      );
      updatedEmployeeInfoForNew.E_DATER = null; // Ensure resignation date is null for new region

      // 6. Delete employee from original master and re-insert updated record
      const updatedOriginalRecords = allOriginalRecords.filter(
        (record) => String(record.E_IDNO || "") !== String(idno)
      );

      // Create temp file for original master with updated record
      const tempOriginalDBFPath = originalMasterDBFPath + ".tmp";

      // Clean up any existing temp file first
      try {
        await fs.unlink(tempOriginalDBFPath);
      } catch (cleanupError) {
        // File doesn't exist, which is fine
        if (cleanupError.code !== "ENOENT") {
          console.warn("Error cleaning up temp file:", cleanupError);
        }
      }

      const newOriginalDbf = await DBFFile.create(
        tempOriginalDBFPath,
        originalDbf.fields
      );

      // Append all records (cleaned) except the deleted one, then add the updated record
      await newOriginalDbf.appendRecords([
        ...updatedOriginalRecords.map(cleanRecordDates),
        cleanRecordDates(updatedEmployeeInfoForOriginal), // Use the version with resignation for original
      ]);

      // 7. Get new region master DBF path
      const newMasterDBFPath = path.join(
        "C:",
        payrollInfo.folderName.toUpperCase(),
        region.toUpperCase(),
        "master.DBF"
      );

      console.log("new", newMasterDBFPath);

      // 8. Add updated employee to new region master
      const newRegionDbf = await DBFFile.open(newMasterDBFPath);
      const newRegionRecords = await newRegionDbf.readRecords();

      // Create temp file for new region master
      const tempNewRegionDBFPath = newMasterDBFPath + ".tmp";

      // Clean up any existing temp file first
      try {
        await fs.unlink(tempNewRegionDBFPath);
      } catch (cleanupError) {
        // File doesn't exist, which is fine
        if (cleanupError.code !== "ENOENT") {
          console.warn("Error cleaning up temp file:", cleanupError);
        }
      }

      const newNewRegionDbf = await DBFFile.create(
        tempNewRegionDBFPath,
        newRegionDbf.fields
      );

      // Append existing records (cleaned) plus the transferred employee
      await newNewRegionDbf.appendRecords([
        ...newRegionRecords.map(cleanRecordDates),
        cleanRecordDates(updatedEmployeeInfoForNew), // Use the version without resignation for new region
      ]);

      // 9. Replace original files with updated ones
      await fs.unlink(originalMasterDBFPath);
      await fs.rename(tempOriginalDBFPath, originalMasterDBFPath);

      await fs.unlink(newMasterDBFPath);
      await fs.rename(tempNewRegionDBFPath, newMasterDBFPath);

      return {
        success: true,
        message: "Employee transferred successfully",
        deletedCount: 1,
        insertedCount: 1,
      };
    } else {
      // ============ REGULAR UPDATE LOGIC ============
      const masterDBFPath = path.join(
        "C:",
        payrollInfo.folderName.toUpperCase(),
        region.toUpperCase(),
        "master.DBF"
      );

      console.log("Attempting to update employee in:", masterDBFPath);

      // Verify directory and file existence
      try {
        await fs.access(masterDBFPath);
      } catch (err) {
        throw new Error(`DBF file not found at ${masterDBFPath}`);
      }

      // Open the DBF file
      const dbf = await DBFFile.open(masterDBFPath);
      const allRecords = await dbf.readRecords();

      // 1. Filter out the existing record and clean date fields
      const updatedRecords = allRecords
        .filter((record) => String(record.E_IDNO || "") !== String(idno))
        .map(cleanRecordDates);

      const deletedCount = allRecords.length - updatedRecords.length - 1;

      // 2. Prepare the new record with properly formatted dates
      const newRecord = mapFormDataToDbfRecord(employeeData, dbf.fields);

      // 3. Create a new DBF file with updated records
      const tempDBFPath = masterDBFPath + ".tmp";

      // Clean up any existing temp file first
      try {
        await fs.unlink(tempDBFPath);
      } catch (cleanupError) {
        // File doesn't exist, which is fine
        if (cleanupError.code !== "ENOENT") {
          console.warn("Error cleaning up temp file:", cleanupError);
        }
      }

      try {
        // Create new DBF with the same structure
        const newDbf = await DBFFile.create(tempDBFPath, dbf.fields);

        // Clean dates in all records before appending
        const recordsToAppend = [
          ...updatedRecords,
          cleanRecordDates(newRecord),
        ];

        // Add all updated records plus the new record
        await newDbf.appendRecords(recordsToAppend);

        // Replace the old file with the new one
        await fs.unlink(masterDBFPath);
        await fs.rename(tempDBFPath, masterDBFPath);

        return {
          success: true,
          message: "Employee updated successfully",
          deletedCount,
          insertedCount: 1,
        };
      } catch (error) {
        // Clean up temp file if something went wrong
        try {
          await fs.unlink(tempDBFPath);
        } catch (cleanupError) {
          console.error("Error cleaning up temp file:", cleanupError);
        }
        throw error;
      }
    }
  } catch (error) {
    console.error("Error in updateEmployeeInDBF:", error);
    return {
      success: false,
      message: error.message,
      error: error.stack,
    };
  }
}

// Helper function to clean date fields in a record
function cleanRecordDates(record) {
  const dateFields = ["E_DATEE", "E_DATER", "E_DATEB", "E_DATEH", "E_DATEL"];
  const cleanedRecord = { ...record };

  dateFields.forEach((field) => {
    if (cleanedRecord[field] !== undefined && cleanedRecord[field] !== null) {
      // If it's already a Date object, ensure it's valid
      if (cleanedRecord[field] instanceof Date) {
        if (isNaN(cleanedRecord[field].getTime())) {
          cleanedRecord[field] = null;
        }
      }
      // If it's a string, try to parse it
      else if (typeof cleanedRecord[field] === "string") {
        const date = new Date(cleanedRecord[field]);
        cleanedRecord[field] = isNaN(date.getTime()) ? null : date;
      }
      // If it's any other type, set to null
      else {
        cleanedRecord[field] = null;
      }
    } else {
      cleanedRecord[field] = null;
    }
  });

  return cleanedRecord;
}

function mapFormDataToDbfRecord(formData, dbfFields) {
  function formatDateForDBF(dateString) {
    if (!dateString) return null;

    // Handle Date objects directly
    if (dateString instanceof Date) {
      return isNaN(dateString.getTime()) ? null : dateString;
    }

    // Try parsing as ISO string first
    let date = new Date(dateString);

    // If that fails, try parsing as MM/DD/YYYY (common form input format)
    if (isNaN(date.getTime()) && dateString.includes("/")) {
      const [month, day, year] = dateString.split("/");
      date = new Date(`${year}-${month}-${day}`);
    }

    return isNaN(date.getTime()) ? null : date;
  }

  function stringToBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      return value.toLowerCase() === "true" || value === "1";
    }
    return false;
  }

  // Create the record object
  const record = {};

  // Basic Info
  record.E_IDNO = formData.idno || "";
  record.E_LN = formData.lastname || "";
  record.E_MI = formData.mi || "";
  record.E_FN = formData.firstname || "";
  record.E_ADDR = formData.address || "";

  // Contact and Dates - using our safe date formatter
  record.E_TEL = formData.mobile || "";
  record.E_DATEE = formatDateForDBF(formData.hireddate);
  record.E_DATER = formatDateForDBF(formData.resigneddate);
  record.E_DATEB = formatDateForDBF(formData.birthdate);
  record.E_STAT = formData.maritalStatus || "";
  record.E_POS = formData.designation || "";

  // Department and Pay Info
  record.E_DEPT = formData.department || "";
  record.E_BRANCH = formData.branch || "";
  //record.E_SHIFT = 0.0;
  record.E_COMPSTAT = formData.compstat || "";
  record.E_BASEPAY = parseFloat(formData.basis) || 0;
  record.E_NODAYS = 25.25;
  record.E_NOHOURS = 8.0;
  record.E_MRATE = parseFloat(formData.monthlyRate) || 0;
  record.E_DRATE = parseFloat(formData.dailyRate) || 0;
  record.E_HRATE = parseFloat(formData.hourlyRate) || 0;

  // Tax and Deductions
  record.E_TAXABLE = stringToBoolean(formData.taxable);
  record.E_TIN = formData.tin || "";
  record.E_TINDED = parseFloat(formData.incomeTax) || 0;
  record.E_OVERTIME = true;
  record.E_SSS = stringToBoolean(formData.yesNoSSS);
  record.E_SSSNUM = formData.sss || "";
  record.E_SSSDED = parseFloat(formData.sssDeduction) || 0;

  // Allowances
  record.E_ALLOW1 = parseFloat(formData.managementAllowance) || 0;
  record.E_ALLOW2 = parseFloat(formData.transportationAllowance) || 0;
  record.E_ALLOW3 = parseFloat(formData.positionalAllowance) || 0;
  record.E_ALLOW4 = parseFloat(formData.hazardAllowance) || 0;
  record.E_ALLOW5 = parseFloat(formData.locationAllowance) || 0;
  record.E_ALLOW6 = parseFloat(formData.housingAllowance) || 0;
  record.E_ALLOW7 = parseFloat(formData.supervisoryAllowance) || 0;
  record.E_ALLOW8 = parseFloat(formData.singlePostAllowance) || 0;

  // Loans and Deductions
  record.E_SSSLON = parseFloat(formData.sssLoan) || 0;
  record.E_PAGCONT = parseFloat(formData.pagibigContribution) || 0;
  record.E_PAGLOAN = parseFloat(formData.pagibigLoan) || 0;
  record.E_DED1 = parseFloat(formData.mlfund) || 0;
  record.E_DED2 = parseFloat(formData.opec) || 0;
  record.E_DED3 = parseFloat(formData.overAppraisal) || 0;
  record.E_DED4 = parseFloat(formData.coopRecla) || 0;
  record.E_DED5 = parseFloat(formData.philhealth) || 0;
  record.E_DED6 = parseFloat(formData.installAccount) || 0;
  record.E_DED7 = parseFloat(formData.opecTicket) || 0;
  record.E_DED8 = parseFloat(formData.telecoms) || 0;
  record.E_DED9 = parseFloat(formData.opecSupport) || 0;
  record.E_DED10 = parseFloat(formData.mortuary) || 0;
  record.E_DED11 = parseFloat(formData.fake) || 0;
  record.E_DED12 = parseFloat(formData.otherDeductions) || 0;
  record.E_DED13 = parseFloat(formData.sako) || 0;
  record.E_DED14 = parseFloat(formData.motorLoan) || 0;
  record.E_DED15 = parseFloat(formData.available1) || 0;
  record.E_DED16 = parseFloat(formData.available2) || 0;
  record.E_LMCUNION = parseFloat(formData.coated) || 0;
  record.E_HMO = parseFloat(formData.hmo) || 0;
  record.E_OTHDED1 = parseFloat(formData.gpaInsurance) || 0;
  record.E_OTHDED2 = parseFloat(formData.overPayments) || 0;
  record.E_DEPEND = 0.0;

  return record;
}

function formatDateForDBF(dateString) {
  if (!dateString) return null;

  try {
    // Handle Date objects directly
    if (dateString instanceof Date) {
      return isNaN(dateString.getTime()) ? null : dateString;
    }

    // Parse the date string
    const date = new Date(dateString);

    // Validate the date
    if (isNaN(date.getTime())) {
      console.warn("Invalid date provided:", dateString);
      return null;
    }

    // Return as Date object (what DBFFile expects)
    return date;
  } catch (e) {
    console.error("Error formatting date:", dateString, e);
    return null;
  }
}

module.exports = {
  getEmployeesBySearch,
  updateEmployeeInDBF,
};
