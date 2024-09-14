// models/dateModel.js
const { setDefaultAutoSelectFamilyAttemptTimeout } = require("net");
const db = require("../config/db");
const fs = require("fs");

const getDateData = async (date) => {
  try {
    const year = payrollYear(date);
    const query = `SELECT * FROM payroll_${year} WHERE enddate = ? and region not in ('mancomm', 'mancomml', 'support', 'supportl') ORDER BY region, branch`;
    //const query = `SELECT * FROM payroll_${year} WHERE enddate = ? and region in ('bohol') ORDER BY region, branch`;

    // GET PAYROLL TRANSACTION FROM DB -----------------------------------------
    const results = await new Promise((resolve, reject) => {
      db.query(query, [date], (err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });
    // GET PAYROLL TRANSACTION FROM DB -----------------------------------------

    // GET REGIONS FROM DB -----------------------------------------
    const regions = await new Promise((resolve, reject) => {
      db.query(`SELECT * FROM SOURCES`, (err, regions) => {
        if (err) return reject(err);
        resolve(regions);
      });
    });
    // GET REGIONS FROM DB -----------------------------------------

    let staffPayroll = staffData(results); //Staff
    staffPayroll = processStaffData(staffPayroll);

    const branchCount = getBranchCounts(staffPayroll);

    let areaRegionPayroll = areaRegionData(results);
    areaRegionPayroll = processAreaRegionData(areaRegionPayroll);

    staffPayroll = mergeStaffAreaRegionData(staffPayroll, areaRegionPayroll);

    let areaPayroll = areaData(results); //AM & Relievers
    areaPayroll = processAreaData(areaPayroll);
    areaPayroll = mergeAreaAndCalculate(areaPayroll, branchCount);

    let regionPayroll = regionData(results); //RM & Others
    regionPayroll = processRegionData(regionPayroll);
    regionPayroll = mergeRegionAndCalculate(regionPayroll, branchCount);

    staffPayroll = mergeStaffAndRegionData(staffPayroll, regionPayroll);
    // Output the result

    const ediData = mergeStaffAndAreaData(staffPayroll, areaPayroll);
    //ediData = removeZeroValues(ediData);

    //console.log(processAreaData(areaPayroll));
    // const testing = processAreaData(areaPayroll);
    // ediData = mergingStaffAndArea(
    //   removeZeroValues(ediData),
    //   processAreaData(areaPayroll)
    // );

    // ediData = mergeEmployeeAndRegion(ediData, processRegionData(regionPayroll));

    //console.log(results);
    //const test = regionData(results);
    // const test2 = areaData(results);
    // //console.log(test2);
    // console.log(countEmployeesByBranch(test2));
    // WRITING THE DATA INTO A TEXT FILE -----------------------------------------
    const jsonString = JSON.stringify(
      mergeStaffAndRegionData(staffPayroll, regionPayroll),
      null,
      2
    );
    fs.writeFile("myobject.txt", jsonString, (err) => {
      if (err) throw err;
      console.log("Data written to myobject.txt");
    });
    // WRITING THE DATA INTO A TEXT FILE -----------------------------------------

    // //const test = computeBranchNetDivision(results);
    // const test3 = processAreaData(test2);
    // //console.log(test3);

    // const merging = mergeEmployeeAndAreas(test2, regionData(results));
    //console.log(merging);
    // Return both results and regions
    //return { results: groupedByArea(results), regions };
    return { results: ediData, regions };
  } catch (err) {
    throw err;
  }
};

// ----------------------------------------- GETTING BRANCH COUNT -----------------------------------------
const getBranchCounts = (data) => {
  const branchCount = {};

  data.forEach(({ region, branch, department }) => {
    // Initialize the region if it doesn't exist
    if (!branchCount[region]) {
      branchCount[region] = {
        countbranch: new Set(),
        countbranchdepartment: {},
      };
    }

    // Add branch to the set for unique branches in the region
    branchCount[region].countbranch.add(branch);

    // Initialize the department if it doesn't exist
    if (!branchCount[region].countbranchdepartment[department]) {
      branchCount[region].countbranchdepartment[department] = new Set();
    }

    // Add branch to the set for unique branches in the department
    branchCount[region].countbranchdepartment[department].add(branch);
  });

  // Format the output
  return Object.keys(branchCount).map((region) => ({
    region,
    countbranch: branchCount[region].countbranch.size,
    countbranchdepartment: Object.keys(
      branchCount[region].countbranchdepartment
    ).reduce((acc, dept) => {
      acc[dept] = branchCount[region].countbranchdepartment[dept].size;
      return acc;
    }, {}),
  }));
};
// ----------------------------------------- GETTING BRANCH COUNT -----------------------------------------

// ----------------------------------------- MERGE STAFF AND BRANCH COUNT -----------------------------------------
const mergeEmployeeWithCounter = (employees, counter) => {
  return employees.map((employee) => {
    // Find the matching region object in the counter
    const matchingRegion = counter.find((c) => c.region === employee.region);

    if (matchingRegion) {
      // Get the branch count for the employee's department
      const departmentCount =
        matchingRegion.countbranchdepartment[employee.department] || 0;

      // Add countbranch and department count to the employee object
      return {
        ...employee,
        regionBranchCount: matchingRegion.countbranch,
        areaBranchCount: departmentCount,
      };
    }

    // Return employee without modification if no matching region is found
    return employee;
  });
};
// ----------------------------------------- MERGE STAFF AND BRANCH COUNT -----------------------------------------

// ----------------------------------------- GETTING THE PAYROLL YEAR -----------------------------------------
const payrollYear = (dateString) => {
  const date = new Date(dateString);
  return date.getFullYear();
};
// ----------------------------------------- GETTING THE PAYROLL YEAR -----------------------------------------

// ----------------------------------------- GETTING RID OF ZEROS & NULL VALUES -----------------------------------------
const removeZeroValues = (employees) => {
  return employees.map((employee) => {
    // Iterate over the object and delete properties with 0 value
    Object.keys(employee).forEach((key) => {
      if (employee[key] === 0 || employee[key] === null) {
        delete employee[key];
      }
    });
    return employee;
  });
};
// ----------------------------------------- GETTING RID OF ZEROS & NULL VALUES -----------------------------------------

// ----------------------------------------- GETTING STAFF DATA -----------------------------------------
// const staffData = (data) => {
//   const filteredData = data.filter(
//     (item) =>
//       !item.designation.toLowerCase().includes("driver") &&
//       !item.designation.toLowerCase().includes("opec") &&
//       !item.designation.toLowerCase().includes("lptl") &&
//       !item.designation.toLowerCase().includes("reliever") &&
//       !item.designation.toLowerCase().includes("auditor") &&
//       !item.designation.toLowerCase().includes("ispd") &&
//       !item.designation.toLowerCase().includes("sales") &&
//       item.designation.toLowerCase() !== "fa" &&
//       item.designation.toLowerCase() !== "rst" &&
//       item.designation.toLowerCase() !== "rt" &&
//       item.designation.toLowerCase() !== "ram" &&
//       item.designation.toLowerCase() !== "am" &&
//       item.designation.toLowerCase() !== "rm"
//   );

//   // To store employee count by branch
//   const branchEmployeeCount = {};
//   // To store distinct branches by region
//   const regionBranchCount = {};

//   filteredData.forEach((item) => {
//     const { region, branch } = item;

//     // Count employees per branch
//     if (!branchEmployeeCount[branch]) {
//       branchEmployeeCount[branch] = 0;
//     }
//     branchEmployeeCount[branch]++;

//     // Count distinct branches per region
//     if (!regionBranchCount[region]) {
//       regionBranchCount[region] = new Set(); // Using Set to avoid duplicates
//     }
//     regionBranchCount[region].add(branch);
//   });

//   // Convert the Set of branches to the branch count per region
//   // const branchesPerRegion = {};
//   // for (let region in regionBranchCount) {
//   //   branchesPerRegion[region] = regionBranchCount[region].size;
//   // }

//   // Add the calculated counts to the data objects
//   const updatedData = filteredData.map((item) => ({
//     ...item,
//     employeeCountInBranch: branchEmployeeCount[item.branch],
//     //branchCountInRegion: branchesPerRegion[item.region],
//   }));

//   return updatedData;
// };
// ----------------------------------------- GETTING STAFF DATA -----------------------------------------

// ----------------------------------------- GETTING STAFF DATA -----------------------------------------
const staffData = (data) => {
  const filteredData = data.filter(
    (item) =>
      !item.designation.toLowerCase().includes("driver") &&
      !item.designation.toLowerCase().includes("opec") &&
      !item.designation.toLowerCase().includes("lptl") &&
      !item.designation.toLowerCase().includes("reliever") &&
      !item.designation.toLowerCase().includes("auditor") &&
      !item.designation.toLowerCase().includes("ispd") &&
      !item.designation.toLowerCase().includes("sales") &&
      item.designation.toLowerCase() !== "fa" &&
      item.designation.toLowerCase() !== "rst" &&
      item.designation.toLowerCase() !== "rt" &&
      item.designation.toLowerCase() !== "ram" &&
      item.designation.toLowerCase() !== "am" &&
      item.designation.toLowerCase() !== "rm"
  );
  return filteredData;
};
// ----------------------------------------- GETTING STAFF DATA -----------------------------------------

// ----------------------------------------- PROCESS STAFF DATA -----------------------------------------
const processStaffData = (data) => {
  // Initialize accumulators
  const branchData = {};

  // Iterate through data
  data.forEach(
    ({
      employmentStatus,
      basicPay,
      totalAllow,
      bmAllow,
      totalOT,
      incomeAmount1,
      incomeAmount2,
      nightpremium,
      lates,
      leaves,
      deductionwoLateLeave,
      totalNet,
      branch, // Group by branch
      region,
      department, // Include department
      boscode,
    }) => {
      if (!branchData[region]) {
        branchData[region] = {};
      }
      if (!branchData[region][branch]) {
        branchData[region][branch] = {
          department, // New property for department
          boscode,
          employeeBranchCount: 0, // New property for counting employees
          branchRegularBasicPay: 0,
          branchTraineeBasicPay: 0,
          branchAllowances: 0,
          branchBmAllowance: 0,
          branchRegularOT: 0,
          branchTraineeOT: 0,
          branchIncome1: 0,
          branchIncome2: 0,
          branchNightpremium: 0,
          branchRegularLate: 0,
          branchTraineeLate: 0,
          branchRegularLeave: 0,
          branchTraineeLeave: 0,
          branchOtherDeductions: 0,
          branchtotalNet: 0,
        };
      }

      // Increment employee count for the branch in this region
      branchData[region][branch].employeeBranchCount += 1;

      // Accumulate basic pay and lates
      if (employmentStatus === "REGULAR") {
        branchData[region][branch].branchRegularBasicPay += basicPay || 0;
        branchData[region][branch].branchRegularOT +=
          totalOT - nightpremium || 0;
        branchData[region][branch].branchRegularLate += lates || 0;
        branchData[region][branch].branchRegularLeave += leaves || 0;
      } else {
        branchData[region][branch].branchTraineeBasicPay += basicPay || 0;
        branchData[region][branch].branchTraineeOT +=
          totalOT - nightpremium || 0;
        branchData[region][branch].branchTraineeLate += lates || 0;
        branchData[region][branch].branchTraineeLeave += leaves || 0;
      }

      branchData[region][branch].branchAllowances += totalAllow - bmAllow || 0;
      branchData[region][branch].branchBmAllowance += bmAllow || 0;
      branchData[region][branch].branchIncome1 += incomeAmount1 || 0;
      branchData[region][branch].branchIncome2 += incomeAmount2 || 0;
      branchData[region][branch].branchNightpremium +=
        Number(nightpremium) || 0;
      branchData[region][branch].branchOtherDeductions +=
        Number(deductionwoLateLeave) || 0;
      branchData[region][branch].branchtotalNet += totalNet || 0;
    }
  );

  // Convert the results to the desired format and sort
  const sortedResults = [];

  for (const [region, branches] of Object.entries(branchData)) {
    for (const [
      branch,
      {
        department, // Include department in output
        boscode,
        employeeBranchCount, // Include employee count
        branchRegularBasicPay,
        branchTraineeBasicPay,
        branchAllowances,
        branchBmAllowance,
        branchRegularOT,
        branchTraineeOT,
        branchIncome1,
        branchIncome2,
        branchNightpremium,
        branchRegularLate,
        branchTraineeLate,
        branchRegularLeave,
        branchTraineeLeave,
        branchOtherDeductions,
        branchtotalNet,
      },
    ] of Object.entries(branches)) {
      sortedResults.push({
        region,
        branch,
        department, // Add department to the output
        boscode,
        employeeBranchCount, // Add employee count to the output
        branchRegularBasicPay,
        branchTraineeBasicPay,
        branchAllowances,
        branchBmAllowance,
        branchRegularOT,
        branchTraineeOT,
        branchIncome1,
        branchIncome2,
        branchNightpremium,
        branchRegularLate,
        branchTraineeLate,
        branchRegularLeave,
        branchTraineeLeave,
        branchOtherDeductions,
        branchtotalNet,
      });
    }
  }

  // Sort the results: first by region, then by branch
  return sortedResults.sort((a, b) => {
    if (a.region !== b.region) {
      return a.region.localeCompare(b.region);
    }
    if (a.branch !== b.branch) {
      return a.branch.localeCompare(b.branch);
    }
    return b.employeeBranchCount - a.employeeBranchCount;
  });
};
// ----------------------------------------- PROCESS STAFF DATA -----------------------------------------

// ----------------------------------------- GETTING AREA & REGION DATA -----------------------------------------
const areaRegionData = (data) => {
  const filteredData = data.filter(
    (item) =>
      item.designation.toLowerCase().includes("driver") ||
      item.designation.toLowerCase().includes("opec") ||
      item.designation.toLowerCase().includes("lptl") ||
      item.designation.toLowerCase().includes("reliever") ||
      item.designation.toLowerCase().includes("auditor") ||
      item.designation.toLowerCase().includes("ispd") ||
      item.designation.toLowerCase().includes("sales") ||
      item.designation.toLowerCase() === "fa" ||
      item.designation.toLowerCase() === "rst" ||
      item.designation.toLowerCase() === "rt" ||
      item.designation.toLowerCase() === "ram" ||
      item.designation.toLowerCase() === "am" ||
      item.designation.toLowerCase() === "rm"
  );
  return filteredData;
};
// ----------------------------------------- GETTING AREA & REGION DATA -----------------------------------------

// ----------------------------------------- PROCESS AREA & REGION DATA -----------------------------------------
const processAreaRegionData = (data) => {
  // Initialize accumulators
  const branchData = {};

  // Iterate through data
  data.forEach(
    ({
      employmentStatus,
      lates,
      leaves,
      //deductionwoLateLeave,
      //totalNet,
      branch, // Group by branch
      region,
      department, // Include department
    }) => {
      if (!branchData[region]) {
        branchData[region] = {};
      }
      if (!branchData[region][branch]) {
        branchData[region][branch] = {
          department, // New property for department
          branchRegularLate: 0,
          branchTraineeLate: 0,
          branchRegularLeave: 0,
          branchTraineeLeave: 0,
          //branchOtherDeductions: 0,
          //branchtotalNet: 0,
        };
      }

      // Increment employee count for the branch in this region
      //branchData[region][branch].employeeBranchCount += 1;

      // Accumulate basic pay and lates
      if (employmentStatus === "REGULAR") {
        branchData[region][branch].branchRegularLate += lates || 0;
        branchData[region][branch].branchRegularLeave += leaves || 0;
      } else {
        branchData[region][branch].branchTraineeLate += lates || 0;
        branchData[region][branch].branchTraineeLeave += leaves || 0;
      }

      // branchData[region][branch].branchOtherDeductions +=
      //   Number(deductionwoLateLeave) || 0;
      //branchData[region][branch].branchtotalNet += totalNet || 0;
    }
  );

  // Convert the results to the desired format and sort
  const sortedResults = [];

  for (const [region, branches] of Object.entries(branchData)) {
    for (const [
      branch,
      {
        department, // Include department in output
        branchRegularLate,
        branchTraineeLate,
        branchRegularLeave,
        branchTraineeLeave,
        //branchOtherDeductions,
        //branchtotalNet,
      },
    ] of Object.entries(branches)) {
      sortedResults.push({
        region,
        branch,
        department, // Add department to the output
        branchRegularLate,
        branchTraineeLate,
        branchRegularLeave,
        branchTraineeLeave,
        //branchOtherDeductions,
        //branchtotalNet,
      });
    }
  }

  // Sort the results: first by region, then by branch
  return sortedResults.sort((a, b) => {
    if (a.region !== b.region) {
      return a.region.localeCompare(b.region);
    }
    if (a.branch !== b.branch) {
      return a.branch.localeCompare(b.branch);
    }
    return b.employeeBranchCount - a.employeeBranchCount;
  });
};
// ----------------------------------------- PROCESS AREA & REGION -----------------------------------------

//MERGE STAFF DATA AREA REGION
const mergeStaffAreaRegionData = (staffData, areaRegionData) => {
  //console.log(staffData);
  return staffData.map((staff) => {
    const matchingArea = areaRegionData.find(
      (area) => area.region === staff.region && area.branch === staff.branch
    );

    // Return a new object that retains all staff properties and adds/merges specific ones
    return {
      ...staff, // Retain all original staffData properties
      branchRegularLate:
        staff.branchRegularLate + (matchingArea?.branchRegularLate || 0),
      branchTraineeLate:
        staff.branchTraineeLate + (matchingArea?.branchTraineeLate || 0),
      branchRegularLeave:
        staff.branchRegularLeave + (matchingArea?.branchRegularLeave || 0),
      branchTraineeLeave:
        staff.branchTraineeLeave + (matchingArea?.branchTraineeLeave || 0),
    };
  });
};

// ----------------------------------------- MERGING STAFF DATA & AREA DATA -----------------------------------------
//merging staffdata and area data - start
function mergeEmployeeAndAreas(employee, areas) {
  return employee.map((emp) => {
    // Find matching areas based on region and department
    const matchingArea = areas.find(
      (area) => area.region === emp.region && area.department === emp.department
    );

    // Merge matching area data if found
    if (matchingArea) {
      return { ...emp, ...matchingArea };
    }

    // If no matching area found, return the employee object as is
    return emp;
  });
}
// ----------------------------------------- MERGING STAFF DATA & AREA DATA -----------------------------------------

// ----------------------------------------- GETTING REGION DATA -----------------------------------------
const regionData = (data) => {
  const filteredData = data.filter(
    (item) =>
      item.designation.toLowerCase().includes("driver") ||
      item.designation.toLowerCase().includes("opec") ||
      item.designation.toLowerCase().includes("lptl") ||
      item.designation.toLowerCase().includes("auditor") ||
      item.designation.toLowerCase().includes("ispd") ||
      item.designation.toLowerCase().includes("sales") ||
      item.designation.toLowerCase() === "fa" ||
      item.designation.toLowerCase() === "rst" ||
      item.designation.toLowerCase() === "rt" ||
      item.designation.toLowerCase() === "ram" ||
      item.designation.toLowerCase() === "rm"
  );

  return filteredData;
};
// ----------------------------------------- GETTING REGION DATA -----------------------------------------

// ----------------------------------------- GETTING AREA DATA -----------------------------------------
const areaData = (data) => {
  const filteredData = data.filter(
    (item) =>
      item.designation.toLowerCase().includes("reliever") ||
      item.designation.toLowerCase() === "am"
  );
  return filteredData;
};
// ----------------------------------------- GETTING AREA DATA -----------------------------------------

// ----------------------------------------- PROCESSING AREA DATA -----------------------------------------
const processAreaData = (data) => {
  // Initialize accumulators
  const departmentData = {};

  // Iterate through data
  data.forEach(
    ({
      employmentStatus,
      basicPay,
      totalAllow,
      bmAllow,
      totalOT,
      incomeAmount1,
      incomeAmount2,
      nightpremium,
      lates,
      leaves,
      deductionwoLateLeave,
      totalNet,
      department,
      branch,
      region,
    }) => {
      if (!departmentData[region]) {
        departmentData[region] = {};
      }
      if (!departmentData[region][department]) {
        departmentData[region][department] = {
          areaEmployeeCount: 0, // New property for counting employees
          areaRegularBasicPay: 0,
          areaTraineeBasicPay: 0,
          areaAllowances: 0,
          areaBmAllowance: 0,
          areaRegularOT: 0,
          areaTraineeOT: 0,
          areaIncome1: 0,
          areaIncome2: 0,
          areaNightpremium: 0,
          areaRegularLate: 0,
          areaTraineeLate: 0,
          areaRegularLeave: 0,
          areaTraineeLeave: 0,
          areaOtherDeductions: 0,
          areaTotalNet: 0,
        };
      }

      // Increment employee count
      departmentData[region][department].areaEmployeeCount += 1;

      // Accumulate basic pay and lates
      if (employmentStatus === "REGULAR") {
        departmentData[region][department].areaRegularBasicPay += basicPay || 0;
        departmentData[region][department].areaRegularOT +=
          totalOT - nightpremium || 0;
        //departmentData[region][department].areaRegularLate += lates || 0;
        //departmentData[region][department].areaRegularLeave += leaves || 0;
      } else {
        departmentData[region][department].areaTraineeBasicPay += basicPay || 0;
        departmentData[region][department].areaTraineeOT +=
          totalOT - nightpremium || 0;
        //departmentData[region][department].areaTraineeLate += lates || 0;
        //departmentData[region][department].areaTraineeLeave += leaves || 0;
      }

      departmentData[region][department].areaAllowances +=
        totalAllow - bmAllow || 0;
      departmentData[region][department].areaBmAllow += bmAllow || 0;
      departmentData[region][department].areaIncome1 += incomeAmount1 || 0;
      departmentData[region][department].areaIncome2 += incomeAmount2 || 0;
      departmentData[region][department].areaTotalNet += totalNet || 0;
      departmentData[region][department].areaNightpremium +=
        Number(nightpremium) || 0;
      departmentData[region][department].areaOtherDeductions +=
        Number(deductionwoLateLeave) || 0;
    }
  );

  // Convert the results to the desired format and sort
  const sortedResults = [];

  for (const [region, departments] of Object.entries(departmentData)) {
    for (const [
      department,
      {
        areaEmployeeCount, // Include employee count
        areaRegularBasicPay,
        areaTraineeBasicPay,
        areaAllowances,
        areaBmAllowance,
        areaRegularOT,
        areaTraineeOT,
        areaIncome1,
        areaIncome2,
        areaNightpremium,
        //areaRegularLate,
        //areaTraineeLate,
        //areaRegularLeave,
        //areaTraineeLeave,
        areaOtherDeductions,
        areaTotalNet,
      },
    ] of Object.entries(departments)) {
      sortedResults.push({
        region,
        department,
        areaEmployeeCount, // Add employee count to the output
        areaRegularBasicPay,
        areaTraineeBasicPay,
        areaAllowances,
        areaBmAllowance,
        areaRegularOT,
        areaTraineeOT,
        areaIncome1,
        areaIncome2,
        areaNightpremium,
        //areaRegularLate,
        //areaTraineeLate,
        //areaRegularLeave,
        //areaTraineeLeave,
        areaOtherDeductions,
        areaTotalNet,
      });
    }
  }

  // Sort the results: first by region, then by department
  return sortedResults.sort((a, b) => {
    if (a.region !== b.region) {
      return a.region.localeCompare(b.region);
    }
    if (a.department !== b.department) {
      return a.department.localeCompare(b.department);
    }
    return b.areaEmployeeCount - a.areaEmployeeCount;
  });
};
// ----------------------------------------- PROCESSING AREA DATA -----------------------------------------

// ----------------------------------------- MERGE & CALCULATE AREA DATA -----------------------------------------
const mergeAreaAndCalculate = (department, branchcount) => {
  // Create a result array to store the merged and calculated data
  const result = [];

  // Loop through each department data
  department.forEach((dept) => {
    // Find matching branch count for the same region
    const matchingBranchCount = branchcount.find(
      (branch) => branch.region === dept.region
    );

    if (matchingBranchCount) {
      // Get the branch count for the corresponding department
      const branchCountForDepartment =
        matchingBranchCount.countbranchdepartment[dept.department];

      // If the branch count exists for the department, perform the calculations
      if (branchCountForDepartment) {
        // Perform the necessary calculations
        const calculatedData = {
          region: dept.region,
          department: dept.department,
          areaEmployeeCount: dept.areaEmployeeCount,
          areaRegularBasicPay:
            dept.areaRegularBasicPay / branchCountForDepartment,
          areaTraineeBasicPay:
            dept.areaTraineeBasicPay / branchCountForDepartment,
          areaAllowances: dept.areaAllowances / branchCountForDepartment,
          areaBmAllowance: dept.areaBmAllowance / branchCountForDepartment,
          areaRegularOT: dept.areaRegularOT / branchCountForDepartment,
          areaTraineeOT: dept.areaTraineeOT / branchCountForDepartment,
          areaIncome1: dept.areaIncome1 / branchCountForDepartment,
          areaIncome2: dept.areaIncome2 / branchCountForDepartment,
          areaNightpremium: dept.areaNightpremium / branchCountForDepartment,
          //areaRegularLate: dept.areaRegularLate,
          // areaTraineeLate: dept.areaTraineeLate,
          // areaRegularLeave: dept.areaRegularLeave,
          // areaTraineeLeave: dept.areaTraineeLeave,
          areaTotalNet: dept.areaTotalNet / branchCountForDepartment,
          areaOtherDeductions:
            dept.areaOtherDeductions / branchCountForDepartment,
        };

        // Push the calculated data to the result array
        result.push(calculatedData);
      }
    }
  });

  return result;
};
// ----------------------------------------- MERGE & CALCULATE AREA DATA -----------------------------------------

//merge region and calculate
const mergeRegionAndCalculate = (regionData, branchCountData) => {
  // Create a mapping of regions to branch counts
  const branchCountMap = branchCountData.reduce((acc, item) => {
    acc[item.region] = item.countbranch;
    return acc;
  }, {});

  // Calculate values for each region
  return regionData.map((region) => {
    const branchCount = branchCountMap[region.region] || 1; // Default to 1 to avoid division by zero
    return {
      region: region.region,
      regionEmployeeCount: region.regionEmployeeCount, // Include regionEmployeeCount here
      regionRegularBasicPay: region.regionRegularBasicPay / branchCount,
      regionAllowances: region.regionAllowances / branchCount,
      regionBmAllowance: region.regionBmAllowance / branchCount,
      regionRegularOT: region.regionRegularOT / branchCount,
      regionTraineeOT: region.regionTraineeOT / branchCount,
      regionIncome1: region.regionIncome1 / branchCount,
      regionIncome2: region.regionIncome2 / branchCount,
      regionNightpremium: region.regionNightpremium / branchCount,
      // regionRegularLate: region.regionRegularLate,
      // regionTraineeLate: region.regionTraineeLate,
      // regionRegularLeave: region.regionRegularLeave,
      // regionTraineeLeave: region.regionTraineeLeave,
      regionTotalNet: region.regionTotalNet / branchCount,
      regionOtherDeductions: region.regionOtherDeductions / branchCount,
    };
  });
};

//merge and calculate region

//merge staff and region
const mergeStaffAndRegionData = (staffdata, region) => {
  // Create a result array to store the merged and calculated data
  const result = [];

  // Loop through each region in the region array
  region.forEach((regionData) => {
    // Find matching staff data for the same region
    const matchingBranchData = staffdata.filter(
      (branchData) => branchData.region === regionData.region
    );

    // Loop through each matching branch
    matchingBranchData.forEach((branchData) => {
      // Perform the necessary calculations by adding branch and region values
      const mergedData = {
        ...branchData, // Retain all properties of branchData (staffdata)

        // Overwrite the specific properties that require merging
        regionEmployeeCount: regionData.regionEmployeeCount, // Added this line
        branchRegularBasicPay:
          branchData.branchRegularBasicPay + regionData.regionRegularBasicPay,
        branchTraineeBasicPay:
          branchData.branchTraineeBasicPay +
          (regionData.regionTraineeBasicPay || 0),
        branchAllowances:
          branchData.branchAllowances + regionData.regionAllowances,
        branchBmAllowance:
          branchData.branchBmAllowance + regionData.regionBmAllowance,
        branchRegularOT:
          branchData.branchRegularOT + regionData.regionRegularOT,
        branchTraineeOT:
          branchData.branchTraineeOT + (regionData.regionTraineeOT || 0),
        branchIncome1: branchData.branchIncome1 + regionData.regionIncome1,
        branchIncome2: branchData.branchIncome2 + regionData.regionIncome2,
        branchNightpremium:
          branchData.branchNightpremium + regionData.regionNightpremium,
        branchtotalNet:
          branchData.branchtotalNet + (regionData.regionTotalNet || 0),
        branchOtherDeductions:
          branchData.branchOtherDeductions + regionData.regionOtherDeductions,

        // Uncomment if you need these fields as well
        // branchRegularLate:
        //   branchData.branchRegularLate + regionData.regionRegularLate,
        // branchTraineeLate:
        //   branchData.branchTraineeLate + (regionData.regionTraineeLate || 0),
        // branchRegularLeave:
        //   branchData.branchRegularLeave + regionData.regionRegularLeave,
        // branchTraineeLeave:
        //   branchData.branchTraineeLeave + (regionData.regionTraineeLeave || 0),
      };

      // Push the merged data to the result array
      result.push(mergedData);
    });
  });

  return result;
};

//merge staff and region

//merge staff and area
const mergeStaffAndAreaData = (staffData, area) => {
  // Create a result array to store the merged and calculated data
  const result = [];

  // Loop through each staffData entry
  staffData.forEach((staff) => {
    // Find the corresponding area entry where region and department match
    const matchingArea = area.find(
      (areaData) =>
        areaData.region === staff.region &&
        areaData.department === staff.department
    );

    // If a match is found, merge the data and sum the specified fields
    if (matchingArea) {
      const mergedData = {
        ...staff, // Retain all properties from staffData

        // Override specific fields with the calculated values
        regionEmployeeCount:
          staff.regionEmployeeCount + matchingArea.areaEmployeeCount, // Sum of employee counts

        // Summing the corresponding fields from staffData and area
        branchRegularBasicPay:
          staff.branchRegularBasicPay + matchingArea.areaRegularBasicPay,
        branchTraineeBasicPay:
          staff.branchTraineeBasicPay + matchingArea.areaTraineeBasicPay,
        branchAllowances: staff.branchAllowances + matchingArea.areaAllowances,
        branchBmAllowance:
          staff.branchBmAllowance + matchingArea.areaBmAllowance,
        branchRegularOT: staff.branchRegularOT + matchingArea.areaRegularOT,
        branchTraineeOT: staff.branchTraineeOT + matchingArea.areaTraineeOT,
        branchIncome1: staff.branchIncome1 + matchingArea.areaIncome1,
        branchIncome2: staff.branchIncome2 + matchingArea.areaIncome2,
        branchNightpremium:
          staff.branchNightpremium + matchingArea.areaNightpremium,
        // branchRegularLate:
        //   staff.branchRegularLate + matchingArea.areaRegularLate,
        // branchTraineeLate:
        //   staff.branchTraineeLate + matchingArea.areaTraineeLate,
        // branchRegularLeave:
        //   staff.branchRegularLeave + matchingArea.areaRegularLeave,
        // branchTraineeLeave:
        //   staff.branchTraineeLeave + matchingArea.areaTraineeLeave,
        branchOtherDeductions:
          staff.branchOtherDeductions + matchingArea.areaOtherDeductions,
        //original code for branch totalnet ->branchtotalNet: staff.branchtotalNet + matchingArea.areaTotalNet,
        branchtotalNet:
          staff.branchRegularBasicPay +
          staff.branchTraineeBasicPay +
          staff.branchAllowances +
          staff.branchBmAllowance +
          staff.branchRegularOT +
          staff.branchTraineeOT +
          staff.branchIncome1 +
          staff.branchIncome2 +
          staff.branchNightpremium +
          matchingArea.areaRegularBasicPay + // Including matching area data
          matchingArea.areaTraineeBasicPay +
          matchingArea.areaAllowances +
          matchingArea.areaBmAllowance +
          matchingArea.areaRegularOT +
          matchingArea.areaTraineeOT +
          matchingArea.areaIncome1 +
          matchingArea.areaIncome2 +
          matchingArea.areaNightpremium -
          (staff.branchRegularLate +
            staff.branchTraineeLate +
            staff.branchRegularLeave +
            staff.branchTraineeLeave +
            staff.branchOtherDeductions +
            matchingArea.areaOtherDeductions),
      };

      // Push the merged data to the result array
      result.push(mergedData);
    }
  });

  return result;
};

//merge staff and area

// ----------------------------------------- MERGE STAFF DATA AND AREA ALLOCATION -----------------------------------------
const mergingStaffAndArea = (employeeData, areaData) => {
  return employeeData.map((emp) => {
    const matchingArea = areaData.find(
      (areaItem) =>
        areaItem.region === emp.region && areaItem.department === emp.department
    );
    return matchingArea ? { ...emp, ...matchingArea } : emp;
  });
};
// ----------------------------------------- MERGE STAFF DATA AND AREA ALLOCATION -----------------------------------------

function mergeEmployeeAndRegion(employeeData, regionData) {
  return employeeData.map((emp) => {
    const matchingRegion = regionData.find((reg) => reg.region === emp.region);

    if (matchingRegion) {
      return {
        ...emp,
        ...matchingRegion,
      };
    }

    // Return employee as is if no matching region found
    return emp;
  });
}

function computeNewBasicPay(employees) {
  // Create an object to store the sums of newBasicPay grouped by region and branch
  const groupedData = {};

  employees.forEach((employee) => {
    const {
      employmentStatus,
      basicPay,
      regionRegularBasicPay,
      regionTraineeBasicPay,
      areaRegularBasicPay,
      areaTraineeBasicPay,
      regionBranchCount,
      areaBranchCount,
      region,
      branch,
    } = employee;

    let newBasicPay;

    // Calculate newBasicPay based on employment status
    if (employmentStatus === "REGULAR") {
      newBasicPay =
        regionRegularBasicPay / regionBranchCount +
        areaRegularBasicPay / areaBranchCount +
        basicPay;
    } else {
      newBasicPay =
        regionTraineeBasicPay / regionBranchCount +
        areaTraineeBasicPay / areaBranchCount +
        basicPay;
    }

    // Check if the region exists, if not create it
    if (!groupedData[region]) {
      groupedData[region] = {};
    }

    // Check if the branch exists under the region, if not initialize newBasicPay for that branch
    if (!groupedData[region][branch]) {
      groupedData[region][branch] = 0;
    }

    // Sum newBasicPay for the branch
    groupedData[region][branch] += newBasicPay;
  });

  // Convert groupedData into the desired array format
  const result = [];

  // Iterate over regions and branches to push the final data into the result array
  for (const region in groupedData) {
    for (const branch in groupedData[region]) {
      result.push({
        region: region,
        branch: branch,
        newBasicPay: groupedData[region][branch],
      });
    }
  }

  return result;
}

// // COUNT THE EMPLOYEES BY BRANCH
// function countEmployeesByBranch(data) {
//   const filteredData = staffData(data);
//   const branchCount = filteredData.reduce((acc, item) => {
//     acc[item.branch] = (acc[item.branch] || 0) + 1;
//     return acc;
//   }, {});
//   return branchCount;
// }
// COUNT THE EMPLOYEES BY BRANCH

const processRegionData = (data) => {
  // Initialize accumulators
  const regionData = {};

  // Iterate through data
  data.forEach(
    ({
      employmentStatus,
      basicPay,
      totalAllow,
      bmAllow,
      totalOT,
      incomeAmount1,
      incomeAmount2,
      nightpremium,
      lates,
      leaves,
      deductionwoLateLeave,
      totalNet,
      region,
    }) => {
      // Initialize region object if it doesn't exist
      if (!regionData[region]) {
        regionData[region] = {
          regionRegularBasicPay: 0,
          regionraineeBasicPay: 0,
          regionAllowances: 0,
          regionBmAllowance: 0,
          regionRegularOT: 0,
          regionTraineeOT: 0,
          regionIncome1: 0,
          regionIncome2: 0,
          regionNightpremium: 0,
          //regionRegularLate: 0,
          //regionTraineeLate: 0,
          //regionRegularLeave: 0,
          //regionTraineeLeave: 0,
          regionOtherDeductions: 0,
          regionTotalNet: 0,
          regionEmployeeCount: 0, // Initialize employee count
        };
      }

      // Accumulate values based on employment status
      if (employmentStatus === "REGULAR") {
        regionData[region].regionRegularBasicPay += basicPay || 0;
        regionData[region].regionRegularOT += totalOT - nightpremium || 0;
        //regionData[region].regionRegularLate += lates || 0;
        //regionData[region].regionRegularLeave += leaves || 0;
      } else {
        regionData[region].regionTraineeBasicPay += basicPay || 0;
        regionData[region].regionTraineeOT += totalOT - nightpremium || 0;
        //regionData[region].regionTraineeLate += lates || 0;
        //regionData[region].regionTraineeLeave += leaves || 0;
      }

      regionData[region].regionAllowances += totalAllow - bmAllow || 0;
      regionData[region].regionBmAllowance += bmAllow || 0;
      regionData[region].regionIncome1 += incomeAmount1 || 0;
      regionData[region].regionIncome2 += incomeAmount2 || 0;
      regionData[region].regionTotalNet += totalNet || 0;
      regionData[region].regionNightpremium += Number(nightpremium) || 0;
      regionData[region].regionOtherDeductions += deductionwoLateLeave * 1 || 0;

      // Increment employee count for the region
      regionData[region].regionEmployeeCount += 1;
    }
  );

  // Convert the results to the desired format and sort
  const sortedResults = Object.entries(regionData).map(
    ([
      region,
      {
        regionRegularBasicPay,
        regionTraineeBasicPay,
        regionAllowances,
        regionBmAllowance,
        regionRegularOT,
        regionTraineeOT,
        regionIncome1,
        regionIncome2,
        regionNightpremium,
        //regionRegularLate,
        //regionTraineeLate,
        //regionRegularLeave,
        //regionTraineeLeave,
        regionOtherDeductions,
        regionEmployeeCount,
        regionTotalNet,
      },
    ]) => ({
      region,
      regionRegularBasicPay,
      regionTraineeBasicPay,
      regionAllowances,
      regionBmAllowance,
      regionRegularOT,
      regionTraineeOT,
      regionIncome1,
      regionIncome2,
      regionNightpremium,
      //regionRegularLate,
      //regionTraineeLate,
      //regionRegularLeave,
      //regionTraineeLeave,
      regionOtherDeductions,
      regionEmployeeCount, // Include employee count in results
      regionTotalNet,
    })
  );

  // Sort the results by region
  return sortedResults.sort((a, b) => a.region.localeCompare(b.region));
};

//console.log(countEmployeesByBranch(data));

function groupedByArea(data) {
  // Filter the data based on designation
  //TESTING FOR AM AND RELIEVERS
  const filteredData = data.filter(
    (item) =>
      item.designation.toLowerCase() === "am" ||
      item.designation.toLowerCase().includes("reliever")
  );

  const groupedData = {};

  filteredData.forEach((item) => {
    const branch = item.branch;

    if (!groupedData[branch]) {
      groupedData[branch] = {
        region: item.region,
        branch: item.branch,
        basicRegular: 0,
        basicTrainee: 0,
        allowance: 0,
        bmAllowance: 0,
        otRegular: 0,
        otTrainee: 0,
        incomeOne: 0,
        incomeTwo: 0,
        graveyard: 0,
        lateRegular: 0,
        lateTrainee: 0,
        leaveRegular: 0,
        leaveTrainee: 0,
        totalDeduction: 0,
        totalNet: 0,
      };
    }

    if (item.employmentStatus.toLowerCase() === "regular") {
      groupedData[branch].basicRegular += item.basicPay;
      groupedData[branch].otRegular += item.totalOT - item.nightpremium;
      groupedData[branch].lateRegular += item.lates;
      groupedData[branch].leaveRegular += item.leaves;
    } else {
      groupedData[branch].basicTrainee += item.basicPay;
      groupedData[branch].otTrainee += item.totalOT - item.nightpremium;
      groupedData[branch].lateTrainee += item.lates;
      groupedData[branch].leaveTrainee += item.leaves;
    }

    groupedData[branch].allowance += item.totalAllow - item.bmAllow;
    groupedData[branch].bmAllowance += item.bmAllow;
    groupedData[branch].incomeOne += item.incomeAmount1;
    groupedData[branch].incomeTwo += item.incomeAmount2;
    groupedData[branch].graveyard += item.nightpremium * 1;
    groupedData[branch].totalDeduction += item.deductionwoLateLeave * 1;
    groupedData[branch].totalNet += item.totalNet;
  });

  //console.log(groupedData);
  // Convert the groupedData object into an array of objects
  return Object.values(groupedData);
}

//testing start
// const dataS = [
//   {
//     startDate: "2024-07-31T16:00:00.000Z",
//     endDate: "2024-08-14T16:00:00.000Z",
//     lastName: "VIRTUDAZO",
//     firstName: "REYDEN",
//     designation: "ABM",
//     branch: "GUINDULMAN",
//     totalNet: 5000.0,
//     region: "BOHOL",
//     idno: "11056926",
//     department: "BOHOL AREA A",
//   },
//   {
//     startDate: "2024-07-31T16:00:00.000Z",
//     endDate: "2024-08-14T16:00:00.000Z",
//     lastName: "CUTANDA",
//     firstName: "REYNALYN",
//     designation: "TELLER/RELIEVER",
//     branch: "GUINDULMAN",
//     totalNet: 2000.0,
//     region: "BOHOL",
//     idno: "20237640",
//     department: "BOHOL AREA B",
//   },
//   {
//     startDate: "2024-07-31T16:00:00.000Z",
//     endDate: "2024-08-14T16:00:00.000Z",
//     lastName: "DUQUILLA",
//     firstName: "GERALDINE",
//     designation: "RT/LPTL",
//     branch: "ICM",
//     totalNet: 2000.0,
//     region: "BOHOL",
//     department: "BOHOL AREA B",
//   },
//   {
//     startDate: "2024-07-31T16:00:00.000Z",
//     endDate: "2024-08-14T16:00:00.000Z",
//     lastName: "GOLOSO",
//     firstName: "MARIA LORINA",
//     designation: "BM",
//     branch: "TAGBILARAN 1",
//     totalNet: 1000.01,
//     region: "BOHOL",
//     department: "BOHOL AREA C",
//   },
//   {
//     startDate: "2024-07-31T16:00:00.000Z",
//     endDate: "2024-08-14T16:00:00.000Z",
//     lastName: "MENDEZ",
//     firstName: "FRANCIS",
//     designation: "ABM",
//     branch: "CHOCOLATE HILLS",
//     totalNet: 1000.02,
//     region: "BOHOL",
//     department: "BOHOL AREA C",
//   },
//   {
//     startDate: "2024-07-31T16:00:00.000Z",
//     endDate: "2024-08-14T16:00:00.000Z",
//     lastName: "MENDEZ",
//     firstName: "FRANCIS",
//     designation: "ABM",
//     branch: "BOHOL CEBU",
//     totalNet: 1000.03,
//     region: "BOHOL",
//     department: "BOHOL AREA C",
//   },
// ];

// GETTING AREA/RELIEVER
// Function to compute branch count and divided totalNet
function computeBranchNetDivision(data) {
  // Initialize objects to hold total net and branch counts per department
  const departmentTotals = {};
  const departmentOvertime = {};
  const departmentBranches = {};

  // Iterate over data to populate departmentTotals and departmentBranches
  data.forEach((item) => {
    const department = item.department;
    const branch = item.branch;
    const totalNet = item.totalNet;
    const overtime = item.totalOT;

    if (department && branch !== undefined) {
      if (!departmentTotals[department]) {
        departmentTotals[department] = 0;
        departmentOvertime[department] = 0;
        departmentBranches[department] = new Set();
      }

      departmentTotals[department] += totalNet;
      departmentOvertime[department] += overtime;
      departmentBranches[department].add(branch);
    }
  });

  // Compute the result
  const result = {};
  for (const [department, totalNet] of Object.entries(departmentTotals)) {
    const branchesCount = departmentBranches[department].size;
    result[department] = {
      numberOfBranches: branchesCount,
      totalNet: totalNet,
      netPerBranch: totalNet / branchesCount,
      totalOvertime: departmentOvertime[department],
      overtimePerBranch: departmentOvertime[department] / branchesCount,
    };
  }

  return result;
}

//const result = computeBranchNetDivision(dataS);
//console.log(result);

//testing end

module.exports = { getDateData };
