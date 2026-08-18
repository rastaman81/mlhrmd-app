const db = require('../config/db');

// Helper function to capitalize first letters of words
const capitalizeFirstLetter = (str) => {
  if (typeof str !== 'string' || str.length === 0) return str;
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Get all offices
const getOffice = async () => {
  try {
    const query = `
      SELECT office_id, UPPER(office_name) as office_name 
      FROM main_office 
      ORDER BY office_name
    `;
    //const [rows] = await db.query(query);
    const [rows] = await db.default.query(query);
    return rows;
  } catch (error) {
    console.error('Error fetching offices:', error);
    throw error;
  }
};

// Get regions by type with improved office mapping
const getPayrollRegions = async (office) => {
  //console.log("getpayrollregions", office.toLowerCase());
  try {
    const query = `
  SELECT region_id, region_name
  FROM pay_regions
  WHERE office = ? AND active = true
  ORDER BY region_name
`;

    //const [results] = await db.query(query, [office.toLowerCase()]);
    const [results] = await db.default.query(query, [office.toLowerCase()]);
    //console.log(results);
    // Format region names consistently
    return results.map((region) => ({
      ...region,
      region_name: capitalizeFirstLetter(region.region_name),
    }));
  } catch (error) {
    console.error(`Error fetching regions for ${office}:`, error);
    throw error;
  }
};

getPayrollUtilities = async () => {
  //console.log("utilities");
  try {
    const query = `
      SELECT utility_id, utility_name 
      FROM pay_utilities
      ORDER BY utility_name
    `;
    //const [results] = await db.query(query);
    const [results] = await db.default.query(query);
    return results.map((utility) => ({
      ...utility,
      utilityName: capitalizeFirstLetter(utility.utility_name),
    }));
  } catch (error) {
    console.error(`Error fetching regions for report types:`, error);
    throw error;
  }
};

getPayrollReportTypes = async () => {
  //console.log("report types");
  try {
    const query = `
      SELECT report_id, report_type 
      FROM pay_trans_reports
      ORDER BY report_type
    `;
    //const [results] = await db.query(query);
    const [results] = await db.default.query(query);
    return results.map((report) => ({
      ...report,
      reporttype: capitalizeFirstLetter(report.report_type),
    }));
  } catch (error) {
    console.error(`Error fetching regions for report types:`, error);
    throw error;
  }
};

getRecordsReportTypes = async () => {
  //console.log("report types");
  try {
    const query = `
      SELECT report_id, report_name 
      FROM rec_reports
      ORDER BY report_name
    `;
    //const [results] = await db.query(query);
    const [results] = await db.default.query(query);
    return results.map((report) => ({
      ...report,
      reportname: capitalizeFirstLetter(report.report_name),
    }));
  } catch (error) {
    console.error(`Error fetching regions for report types:`, error);
    throw error;
  }
};

getPayrollIncomeTypes = async () => {
  try {
    const query = `SELECT * FROM pay_income_types order by income_description `;
    //const [results] = await db.query(query);
    const [results] = await db.default.query(query);
    return results.map((income) => ({
      ...income,
      income_description: capitalizeFirstLetter(income.income_description),
    }));
  } catch (error) {
    console.log(`Error fetching income types`, error);
    throw error;
  }
};

getPayrollDeductionTypes = async () => {
  try {
    const query = `SELECT * FROM pay_deduction_types order by deduction_description `;
    //const [results] = await db.query(query);
    const [results] = await db.default.query(query);
    return results.map((deduction) => ({
      ...deduction,
      deduction_description: capitalizeFirstLetter(deduction.deduction_description),
    }));
  } catch (error) {
    console.log(`Error fetching deduction types`, error);
    throw error;
  }
};

getAtdReportTypes = async () => {
  //console.log("report types");
  try {
    const query = `
      SELECT report_id, report_type 
      FROM atd_reports
      ORDER BY report_type
    `;
    //const [results] = await db.query(query);
    const [results] = await db.default.query(query);
    return results.map((report) => ({
      ...report,
      reporttype: capitalizeFirstLetter(report.report_type),
    }));
  } catch (error) {
    console.error(`Error fetching regions for report types:`, error);
    throw error;
  }
};

const getLoanTypes = async () => {
  //console.log("report types");
  try {
    const query = `
      SELECT * 
      FROM loan_type_configs
      ORDER BY loan_type
    `;
    //const [results] = await db.query(query);
    const [results] = await db.default.query(query);
    return results.map((report) => ({
      ...report,
    }));
  } catch (error) {
    console.error(`Error fetching regions for report types:`, error);
    throw error;
  }
};

// New function to get all possible regions (if needed for initial load)
const getAllRegions = async () => {
  try {
    const vmRegions = await getPayrollRegions('VisMin');
    const luzRegions = await getPayrollRegions('Luzon');
    const mlgRegions = await getPayrollRegions('MLG');

    return {
      vmRegions,
      luzRegions,
      mlgRegions,
    };
  } catch (error) {
    console.error('Error fetching all regions:', error);
    throw error;
  }
};

getPhilhealthTable = async () => {
  try {
    const query = `SELECT * FROM pay_philhealth`;
    //const [results] = await db.query(query);
    const [results] = await db.default.query(query);
    //console.log(results); // Check the structure of the results

    if (results && results.length > 0) {
      return results[0]; // Return only the first row
    } else {
      throw new Error('No Philhealth data found.');
    }
  } catch (error) {
    console.log('Error fetching deduction types', error);
    throw error;
  }
};

function getDbPool(office) {
  switch ((office || '').toLowerCase()) {
    case 'luzon':
      console.log(office, 1);
      return db.luzon;
    case 'vismin':
      console.log(office, 2);
      return db.vismin;
    case 'mlinc':
      console.log(office, 3);
      return db.default;
    default:
      (console.log(office), 4);
      return db.default;
  }
}

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
    default:
      (console.log(office), 4);
      return db.default;
  }
}

getMaritalStatus = async () => {
  try {
    const query = `SELECT * FROM pay_marital_status ORDER BY status_name`;
    const [results] = await db.default.query(query);

    if (results && results.length > 0) {
      return results; // Return all rows, not just the first one
    } else {
      throw new Error('No marital status data found.');
    }
  } catch (error) {
    console.log('Error fetching marital statuses', error);
    throw error;
  }
};

getCivilStatus = async () => {
  try {
    const query = `SELECT * FROM rec_civil_status ORDER BY civil_status`;
    const [results] = await db.default.query(query);

    if (results && results.length > 0) {
      return results; // Return all rows, not just the first one
    } else {
      throw new Error('No marital status data found.');
    }
  } catch (error) {
    console.log('Error fetching marital statuses', error);
    throw error;
  }
};

async function getBranches(office) {
  const officeConfig = {
    vismin: {
      pool: db.vismin,
      table: 'brvismin_edi',
    },
    luzon: {
      pool: db.luzon,
      table: 'luz_branch',
    },
    mlinc: {
      pool: db.default,
      table: 'hr_employees_mlinc_branches',
    },
  };

  try {
    if (!officeConfig[office]) {
      throw new Error(`Invalid region specified: ${office}`);
    }

    const { pool, table } = officeConfig[office];
    const query = `SELECT * FROM ${table} ORDER BY b_description`;
    const [results] = await pool.query(query);

    if (results && results.length > 0) {
      return results;
    }
    throw new Error(`No branches data found for office: ${office}`);
  } catch (error) {
    console.error(`Error fetching branches for ${office}:`, error);
    throw error;
  }
}

const getPayrollDesignations = async () => {
  try {
    const query = 'SELECT * FROM pay_designations ORDER BY designation';
    const [results] = await db.default.query(query);

    if (results && results.length > 0) {
      return results; // Return all rows, not just the first one
    } else {
      throw new Error('No designation data found.');
    }
  } catch (error) {
    console.log('Error fetching designations', error);
    throw error;
  }
};

const getDesignations = async (office) => {
  console.log('+++++++++++ ', office);
  try {
    const dbPool = getRecordsDbPool('default');
    const query = 'SELECT * FROM rec_designations ORDER BY designation';
    const [results] = await dbPool.query(query);

    if (results && results.length > 0) {
      return results; // Return all rows, not just the first one
    } else {
      throw new Error('No designation data found.');
    }
  } catch (error) {
    console.log('Error fetching designations', error);
    throw error;
  }
};

const getPayrollStatus = async () => {
  try {
    const query = 'SELECT * FROM pay_employment_status ORDER BY status_name';
    const [results] = await db.default.query(query);
    //console.log(db);
    if (results && results.length > 0) {
      return results; // Return all rows, not just the first one
    } else {
      throw new Error('No employment status data found.');
    }
  } catch (error) {
    console.log('Error fetching employment status', error);
    throw error;
  }
};

const getEmployeeStatuses = async () => {
  try {
    const query = 'SELECT * FROM rec_employment_status ORDER BY status_name';
    const [results] = await db.default.query(query);
    //console.log(db);
    if (results && results.length > 0) {
      return results; // Return all rows, not just the first one
    } else {
      throw new Error('No employment status data found.');
    }
  } catch (error) {
    console.log('Error fetching employment status', error);
    throw error;
  }
};

const getSortOptions = async () => {
  try {
    const query = 'SELECT * FROM rec_sort_options ORDER BY sort_name desc';
    const [results] = await db.default.query(query);
    //console.log(db);
    if (results && results.length > 0) {
      return results; // Return all rows, not just the first one
    } else {
      throw new Error('No employment status data found.');
    }
  } catch (error) {
    console.log('Error fetching employment status', error);
    throw error;
  }
};

const getEmployeeTypes = async () => {
  try {
    const query = 'SELECT * FROM rec_ranks ORDER BY rankname';
    const [results] = await db.default.query(query);
    //console.log(db);
    if (results && results.length > 0) {
      return results; // Return all rows, not just the first one
    } else {
      throw new Error('No employment status data found.');
    }
  } catch (error) {
    console.log('Error fetching employment status', error);
    throw error;
  }
};

// Get regions by type with improved office mapping
const getRecordsRegions = async (office) => {
  const dbPool = getRecordsDbPool(office);
  const normalizedOffice = office.toLowerCase();
  let query = '';
  //console.log("getpayrollregions", office.toLowerCase());
  try {
    //if (['vismin', 'ml group'].includes(normalizedOffice)) {
    if (['vismin', 'mlinc'].includes(normalizedOffice)) {
      query = `
  SELECT regionid, regionname AS region_name, region_manager
  FROM region
  WHERE active = true
  ORDER BY region_name
`;
    } else {
      query = `SELECT DISTINCT(region) as region_name FROM hris201_payroll order by region_name;`;
    }
    //const [results] = await db.query(query, [office.toLowerCase()]);
    const [results] = await dbPool.query(query);
    //console.log(results);
    // Format region names consistently
    return results.map((region) => ({
      ...region,
      region_name: capitalizeFirstLetter(region.region_name),
    }));
  } catch (error) {
    console.error(`Error fetching regions for ${office}:`, error);
    throw error;
  }
};

// Get regions by type with improved office mapping
// const getRecordsAreas = async (office, region) => {
//   console.log(office, region);
//   const dbPool = getRecordsDbPool(office);
//   const normalizedOffice = office.toLowerCase();
//   const normalizedRegion = region.toLowerCase();
//   let query = '';
//   //console.log("getpayrollregions", office.toLowerCase());
//   try {
//     if (['vismin', 'ml group'].includes(normalizedOffice)) {
//       query = `
//   SELECT areaid, area_name, area_manager
//   FROM areas
//   WHERE arearegid = ? AND is_active = true
//   ORDER BY area_name
// `;
//     } else {
//       query = `SELECT DISTINCT(department) as area_name FROM hris201_payroll order by area_name;`;
//     }
//     //const [results] = await db.query(query, [office.toLowerCase()]);
//     const [results] = await dbPool.query(query, [normalizedRegion]);
//     //console.log(results);
//     // Format region names consistently
//     return results.map((area) => ({
//       ...area,
//       area_name: capitalizeFirstLetter(area.area_name),
//     }));
//   } catch (error) {
//     console.error(`Error fetching regions for ${region}:`, error);
//     throw error;
//   }
// };

const getRecordsAreas = async (office, region) => {
  const dbPool = getRecordsDbPool(office);
  const normalizedOffice = String(office || '').toLowerCase();

  let query = '';
  let params = [];

  try {
    //if (['vismin', 'ml group'].includes(normalizedOffice)) {
    if (['vismin', 'mlinc'].includes(normalizedOffice)) {
      query = `
        SELECT areaid, area_name, area_manager
        FROM areas
        WHERE arearegid = ? AND is_active = true
        ORDER BY area_name
      `;
      params = [region]; // numeric FK — don't lowercase
    } else {
      // No real area IDs exist for these offices; use the department
      // name itself as a stable surrogate "areaid" so the front-end's
      // areaid-based matching/selection actually has something to compare.
      query = `
        SELECT DISTINCT department AS areaid, department AS area_name
        FROM hris201_payroll
        WHERE region = ?   -- adjust to whatever column actually ties department to region
        ORDER BY department
      `;
      params = [region];
    }

    const [results] = await dbPool.query(query, params);

    return results.map((area) => ({
      ...area,
      area_name: capitalizeFirstLetter(area.area_name),
    }));
  } catch (error) {
    console.error(`Error fetching areas for region ${region}:`, error);
    throw error;
  }
};

const getRecordsBranches = async (office, region, area) => {
  const dbPool = getRecordsDbPool(office);
  const normalizedOffice = office.toLowerCase();
  const normalizedRegion = region.toLowerCase();
  const normalizedArea = area.toLowerCase();
  let query = '';
  //console.log("getpayrollregions", office.toLowerCase());
  try {
    //if (['vismin', 'ml group'].includes(normalizedOffice)) {
    if (['vismin', 'mlinc'].includes(normalizedOffice)) {
      query = `
  SELECT branchcode as branchid, branchname as branch_name 
  FROM branch
  WHERE branchregid = ? AND branchareaid = ? AND is_active = true
  ORDER BY branch_name
`;
    } else {
      query = `SELECT DISTINCT(department) as branch_name FROM hris201_payroll order by branch_name;`;
    }
    console.log(query, normalizedRegion, normalizedArea);
    //const [results] = await db.query(query, [office.toLowerCase()]);
    const [results] = await dbPool.query(query, [normalizedRegion, normalizedArea]);
    //console.log(results);
    // Format region names consistently
    return results.map((branch) => ({
      ...branch,
      branch_name: capitalizeFirstLetter(branch.branch_name),
    }));
  } catch (error) {
    console.error(`Error fetching branch for ${area}:`, error);
    throw error;
  }
};

// utilitiesModel.js
const getLoanTypeConfig = async (loanType) => {
  try {
    const query = `
      SELECT * 
      FROM loan_type_configs 
      WHERE LOWER(loan_type) = LOWER(?)
      LIMIT 1
    `;

    console.log('////////////////////////////// ', query, loanType);
    const [results] = await db.default.query(query, [loanType]);
    return results[0] || null;
  } catch (error) {
    console.error(`Error fetching loan type config for ${loanType}:`, error);
    throw error;
  }
};
const getLoanStatuses = async () => {
  try {
    const query = `
      SELECT loan_status_id, loan_status 
      FROM loan_statuses
      ORDER BY loan_status_id
    `;
    const [results] = await db.default.query(query);
    return results;
  } catch (error) {
    console.error(`Error fetching loan statuses:`, error);
    throw error;
  }
};

// utilitiesModel.js - Add these functions

// ─────────────────────────────────────────────────────────────
// GET LOAN PROVIDERS
// ─────────────────────────────────────────────────────────────
const getLoanProviders = async () => {
  try {
    const query = `
      SELECT * 
      FROM loan_provider 
      WHERE is_active = 1 
      ORDER BY provider_name
    `;
    const [results] = await db.default.query(query);
    return results;
  } catch (error) {
    console.error('Error fetching loan providers:', error);
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────
// GET LOAN TYPES BY PROVIDER
// ─────────────────────────────────────────────────────────────
const getLoanTypesByProvider = async (providerCode) => {
  try {
    let query = `
      SELECT loanname, loan_type, provider_code
      FROM loan_type_configs 
      WHERE is_active = 1
    `;
    const params = [];

    if (providerCode) {
      query += ` AND provider_code = ?`;
      params.push(providerCode);
    }

    query += ` ORDER BY loanname`;
    console.log(query, params);
    const [results] = await db.default.query(query, params);
    return results;
  } catch (error) {
    console.error('Error fetching loan types by provider:', error);
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────
// GET LOAN TYPES FOR FILTER (distinct list)
// ─────────────────────────────────────────────────────────────
const getLoanTypesForFilter = async () => {
  try {
    const query = `
      SELECT DISTINCT loanname, loan_type 
      FROM loan_type_configs 
      WHERE is_active = 1 
      ORDER BY loanname
    `;
    const [results] = await db.default.query(query);
    return results;
  } catch (error) {
    console.error('Error fetching loan types for filter:', error);
    throw error;
  }
};

// Update module.exports at the bottom
module.exports = {
  getOffice,
  getPayrollRegions,
  getAllRegions,
  capitalizeFirstLetter,
  getPayrollReportTypes,
  getPayrollIncomeTypes,
  getPayrollDeductionTypes,
  getPayrollUtilities,
  getPhilhealthTable,
  getDbPool,
  getRecordsDbPool,
  getMaritalStatus,
  getBranches,
  getPayrollDesignations,
  getPayrollStatus,
  getAtdReportTypes,
  getRecordsReportTypes,
  getRecordsRegions,
  getRecordsAreas,
  getRecordsBranches,
  getEmployeeStatuses,
  getEmployeeTypes,
  getSortOptions,
  getCivilStatus,
  getDesignations,
  getLoanTypes,
  getLoanTypeConfig,
  getLoanStatuses,
  getLoanProviders, // 👈 ADD THIS
  getLoanTypesByProvider, // 👈 ADD THIS
  getLoanTypesForFilter, // 👈 ADD THIS
};
