// export.js

document.getElementById("exportButton").addEventListener("click", function () {
  console.log("Button clicked!"); // Debugging line

  const selectedDate = document.getElementById("date").dataset.date; // Get the date from a data attribute

  var wb = XLSX.utils.book_new();

  // Convert the EJS `data` array to a JSON object and make it available to JavaScript
  const data = JSON.parse(document.getElementById("dataTable").dataset.json); // JSON data in a data attribute

  // Group data by region
  const groupedData = {};
  data.forEach((item) => {
    if (!groupedData[item.region]) {
      groupedData[item.region] = [];
    }
    groupedData[item.region].push(item);
  });

  // Create a sheet for each region
  Object.keys(groupedData).forEach((region) => {
    const ws_data = [
      [
        "REGION",
        "BRANCH",
        "BASIC PAY REGULAR",
        "BASIC PAY TRAINEE",
        "ALLOWANCES",
        "BM ALLOWANCE",
        "OT REGULAR",
        "OT TRAINEE",
        "COLA",
        "OTHER INCOME 1",
        "OTHER INCOME 2",
        "GRAVEYARD",
        "LATE REGULAR",
        "LATE TRAINEE",
        "LEAVE REGULAR",
        "LEAVE TRAINEE",
        "TOTAL DEDUCTION",
        "TOTAL NET",
        "NO. OF BRANCH EMPLOYEE",
        "NO. OF EMPLOYEES ALLOCATED",
      ],
      ...groupedData[region].map((item) => [
        item.region,
        item.branch,
        item.branchRegularBasicPay,
        item.branchTraineeBasicPay,
        item.branchAllowances,
        item.branchBmAllowance,
        item.branchRegularOT,
        item.branchTraineeOT,
        0.0,
        item.branchIncome1,
        item.branchIncome2,
        item.branchNightpremium,
        item.branchRegularLate,
        item.branchTraineeLate,
        item.branchRegularLeave,
        item.branchTraineeLeave,
        item.branchOtherDeductions,
        item.branchtotalNet,
        item.employeeBranchCount,
        item.regionEmployeeCount,
      ]),
    ];

    var ws = XLSX.utils.aoa_to_sheet(ws_data);
    XLSX.utils.book_append_sheet(wb, ws, region);
  });

  // Write the Excel file with the formatted date in the filename
  XLSX.writeFile(wb, `Payroll_EDI_${selectedDate}.xlsx`);
});
