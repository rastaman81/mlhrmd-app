// models/dateModel.js
const db = require("../config/db");
const fs = require("fs");

const getDateData = async (date) => {
  try {
    const year = payrollYear(date);
    //const query = `SELECT * FROM payroll_${year} WHERE enddate = ? and region not in ('mancomm', 'mancomml', 'support', 'supportl') ORDER BY region, branch`;
    const query = `SELECT * FROM payroll_${year} WHERE enddate = ? and region in ('bohol') ORDER BY region, branch`;

    // Query to get payroll data
    const results = await new Promise((resolve, reject) => {
      db.query(query, [date], (err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });

    // Query to get regions
    const regions = await new Promise((resolve, reject) => {
      db.query(`SELECT * FROM SOURCES`, (err, regions) => {
        if (err) return reject(err);
        resolve(regions);
      });
    });

    const staffPayroll = staffData(results);
    const branchCount = getBranchCounts(staffPayroll);
    let ediData = mergeEmployeeWithCounter(staffPayroll, branchCount);
    //ediData = removeZeroValues(ediData);
    const areaPayroll = areaData(results);
    console.log(processAreaData(areaPayroll));

    ediData = mergingStaffandArea(
      removeZeroValues(ediData),
      processAreaData(areaPayroll)
    );
    //console.log(results);
    //const test = regionData(results);
    // const test2 = areaData(results);
    // //console.log(test2);
    // console.log(countEmployeesByBranch(test2));
    const jsonString = JSON.stringify(ediData, null, 2);
    fs.writeFile("myobject.txt", jsonString, (err) => {
      if (err) throw err;
      console.log("Data written to myobject.txt");
    });

    // //const test = computeBranchNetDivision(results);
    // const test3 = processAreaData(test2);
    // //console.log(test3);

    // const merging = mergeEmployeeAndAreas(test2, regionData(results));
    //console.log(merging);
    // Return both results and regions
    return { results: groupedByArea(results), regions };
  } catch (err) {
    throw err;
  }
};

//getting the branch counts -> start

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

//getting the branch counts -> end

//merge branch count and branch area count - start
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
        countbranch: matchingRegion.countbranch,
        departmentCount: departmentCount,
      };
    }

    // Return employee without modification if no matching region is found
    return employee;
  });
};
//merge branch count and branch area count - end

//getting the year from the date selected -> start
const payrollYear = (dateString) => {
  const date = new Date(dateString);
  return date.getFullYear();
};
//getting the year from the date selected -> end

//getting rid of properties with zero or null values -> start
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
//getting rid of properties with zero or null values -> end

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

  // To store employee count by branch
  const branchEmployeeCount = {};
  // To store distinct branches by region
  const regionBranchCount = {};

  filteredData.forEach((item) => {
    const { region, branch } = item;

    // Count employees per branch
    if (!branchEmployeeCount[branch]) {
      branchEmployeeCount[branch] = 0;
    }
    branchEmployeeCount[branch]++;

    // Count distinct branches per region
    if (!regionBranchCount[region]) {
      regionBranchCount[region] = new Set(); // Using Set to avoid duplicates
    }
    regionBranchCount[region].add(branch);
  });

  // Convert the Set of branches to the branch count per region
  // const branchesPerRegion = {};
  // for (let region in regionBranchCount) {
  //   branchesPerRegion[region] = regionBranchCount[region].size;
  // }

  // Add the calculated counts to the data objects
  const updatedData = filteredData.map((item) => ({
    ...item,
    employeeCountInBranch: branchEmployeeCount[item.branch],
    //branchCountInRegion: branchesPerRegion[item.region],
  }));

  return updatedData;
};

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
//merging stffdate and area date - end

const regionData = (data) => {
  const filteredData = data.filter(
    (item) =>
      item.designation.toLowerCase().includes("reliever") &&
      item.designation.toLowerCase() !== "am"
  );

  return filteredData;
};

const areaData = (data) => {
  const filteredData = data.filter(
    (item) =>
      item.designation.toLowerCase().includes("reliever") ||
      item.designation.toLowerCase() === "am"
  );
  return filteredData;
};

//Preparing the data from Area
// Function to process the area data
// WRONG ANG BRANCH COUNT
const processAreaData = (data) => {
  // Initialize accumulators
  const departmentData = {};

  // Iterate through data
  data.forEach(
    ({
      enddate,
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
      department,
      branch,
      region,
    }) => {
      if (!departmentData[region]) {
        departmentData[region] = {};
      }
      if (!departmentData[region][department]) {
        departmentData[region][department] = {
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
          //branches: new Set(),
        };
      }

      // Accumulate basic pay and lates
      if (employmentStatus === "REGULAR") {
        departmentData[region][department].areaRegularBasicPay += basicPay || 0;
        departmentData[region][department].areaRegularOT +=
          totalOT - nightpremium || 0;
        departmentData[region][department].areaRegularLate += lates || 0;
        departmentData[region][department].areaRegularLeave += leaves || 0;
      } else {
        departmentData[region][department].areaTraineeBasicPay += basicPay || 0;
        departmentData[region][department].areaTraineeOT +=
          totalOT - nightpremium || 0;
        departmentData[region][department].areaTraineeLate += lates || 0;
        departmentData[region][department].areaTraineeLeave += leaves || 0;
      }

      departmentData[region][department].areaAllowances +=
        totalAllow - bmAllow || 0;
      departmentData[region][department].areaBmAllow += bmAllow || 0;
      departmentData[region][department].areaIncome1 += incomeAmount1 || 0;
      departmentData[region][department].areaIncome2 += incomeAmount2 || 0;
      departmentData[region][department].areaNightpremium +=
        Number(nightpremium) || 0;
      departmentData[region][department].areaOtherDeductions +=
        Number(deductionwoLateLeave) || 0;

      // Count branches per department
      //departmentData[region][department].branches.add(branch);
    }
  );

  // Convert the results to the desired format and sort
  const sortedResults = [];

  for (const [region, departments] of Object.entries(departmentData)) {
    for (const [
      department,
      {
        areaRegularBasicPay,
        areaTraineeBasicPay,
        areaAllowances,
        areaBmAllowance,
        areaRegularOT,
        areaTraineeOT,
        areaIncome1,
        areaIncome2,
        areaNightpremium,
        areaRegularLate,
        areaTraineeLate,
        areaRegularLeave,
        areaTraineeLeave,
        areaOtherDeductions,
        //branches,
      },
    ] of Object.entries(departments)) {
      sortedResults.push({
        region,
        department,
        areaRegularBasicPay,
        areaTraineeBasicPay,
        areaAllowances,
        areaBmAllowance,
        areaRegularOT,
        areaTraineeOT,
        areaIncome1,
        areaIncome2,
        areaNightpremium,
        areaRegularLate,
        areaTraineeLate,
        areaRegularLeave,
        areaTraineeLeave,
        areaOtherDeductions,
        //branchCount: branches.size,
      });
    }
  }

  // Sort the results: first by region, then by department, then by branchCount
  return sortedResults.sort((a, b) => {
    if (a.region !== b.region) {
      return a.region.localeCompare(b.region);
    }
    if (a.department !== b.department) {
      return a.department.localeCompare(b.department);
    }
    return a.branchCount - b.branchCount;
  });
};

// ----------------------------------------- MERGE STAFF DATA AND AREA ALLOCATION -----------------------------------------
const mergingStaffandArea = (employeeData, areaData) => {
  return employeeData.map((emp) => {
    const matchingArea = areaData.find(
      (areaItem) =>
        areaItem.region === emp.region && areaItem.department === emp.department
    );
    return matchingArea ? { ...emp, ...matchingArea } : emp;
  });
};
// ----------------------------------------- MERGE STAFF DATA AND AREA ALLOCATION -----------------------------------------

function countEmployeesByBranch(data) {
  const filteredData = staffData(data);
  const branchCount = filteredData.reduce((acc, item) => {
    acc[item.branch] = (acc[item.branch] || 0) + 1;
    return acc;
  }, {});
  return branchCount;
}

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
