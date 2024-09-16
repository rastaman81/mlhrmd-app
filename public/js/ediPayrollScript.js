// public/js/dateScript.js
document
  .getElementById("downloadButton")
  .addEventListener("click", async function () {
    const officeSelect = document.getElementById("officeSelect");
    const selectedOffice = officeSelect.value;
    const reportSelect = document.getElementById("reportSelect");
    const selectedReport = reportSelect.value;

    const selectedDate = document.getElementById("myDateInput").value;
    const messageElement = document.getElementById("message");
    const loadingElement = document.getElementById("loading");

    if (selectedOffice === "") {
      messageElement.innerHTML =
        "<p style='color: red;'>Please select an office.</p>";
      return;
    }

    if (selectedReport === "") {
      messageElement.innerHTML =
        "<p style='color: red;'>Please select report type.</p>";
      return;
    }

    if (!selectedDate) {
      messageElement.innerHTML =
        "<p style='color: red;'>Please select a date.</p>";
      return;
    }

    // Show loading GIF
    loadingElement.style.display = "block";

    // Send a POST request to fetch the data based on the selected date
    try {
      const response = await fetch("/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: selectedDate,
          office: selectedOffice,
          report: selectedReport,
        }),
      });

      const result = await response.json();
      const data = result.data;

      if (result.error) {
        messageElement.innerHTML = `<p style='color: red;'>${result.error}</p>`;
      } else {
        messageElement.innerHTML =
          "<p style='color: green;'>Payroll Report has been exported successfully!</p>";

        // Group data by region
        const groupedData = {};
        data.forEach((item) => {
          if (!groupedData[item.region]) {
            groupedData[item.region] = [];
          }
          groupedData[item.region].push(item);
        });

        // Create Excel file
        const wb = XLSX.utils.book_new();

        function autoFitColumns(aoa) {
          const colWidths = aoa[0].map((_, colIndex) =>
            Math.max(
              ...aoa.map((row) =>
                row[colIndex] ? row[colIndex].toString().length : 0
              )
            )
          );
          return colWidths.map((width) => ({ wch: width + 2 }));
        }

        function formatNumberCell(cell, value) {
          cell.v = value;
          cell.t = "n"; // Number type
          cell.z = "#,##0.00"; // Comma as thousand separator and 2 decimal places
        }

        // Create a sheet for each region
        Object.keys(groupedData).forEach((region) => {
          const ws_data = [
            [
              "",
              "PAYROLL DATE",
              "BASIC PAY REGULAR",
              "BASIC PAY TRAINEE",
              "ALLOWANCE",
              "BM ALLOWANCE",
              "OVERTIME REGULAR",
              "OVERTIME TRAINEE",
              "COLA",
              "OTHER INCOME 1",
              "OTHER INCOME 2",
              "GRAVEYARD",
              "LATE REGULAR",
              "LATE TRAINEE",
              "LEAVE REGULAR",
              "LEAVE TRAINEE",
              "ALL OTHER DEDUCTIONS",
              "TOTAL",
              "NO. OF EMPLOYEE IN BRANCH",
              "NO. OF EMPLOYEES ALLOCATED",
            ],
            [
              "",
              "",
              "debit",
              "debit",
              "debit",
              "debit",
              "debit",
              "debit",
              "debit",
              "debit",
              "debit",
              "debit",
              "credit",
              "credit",
              "credit",
              "credit",
              "credit",
              "",
              "",
            ],
            [
              "BOS CODE",
              "BRANCH NAME",
              "5100001",
              "5100002",
              "5100001",
              "5212001",
              "5100003",
              "5100002",
              "5210001",
              "5220002",
              "5220001",
              "5212001",
              "5100001",
              "5100002",
              "5100001",
              "5100002",
              "3100001",
              "3100001",
              "",
              "",
            ],
            [],
            ...groupedData[region].map((item) => [
              item.boscode,
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

          const ws = XLSX.utils.aoa_to_sheet(ws_data);

          ws_data.forEach((row, rIndex) => {
            row.forEach((cell, cIndex) => {
              if (typeof cell === "number" && cIndex !== 18 && cIndex !== 19) {
                const cellRef = XLSX.utils.encode_cell({
                  c: cIndex,
                  r: rIndex,
                });
                if (!ws[cellRef]) ws[cellRef] = {};
                formatNumberCell(ws[cellRef], cell);
              }
            });
          });

          ws["!cols"] = autoFitColumns(ws_data);

          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < ws_data[i].length; j++) {
              const cell = ws[XLSX.utils.encode_cell({ c: j, r: i })];
              if (cell) {
                cell.s = {
                  font: { bold: true },
                  alignment: { horizontal: "center" },
                };
              }
            }
          }

          XLSX.utils.book_append_sheet(wb, ws, region);
        });

        XLSX.writeFile(
          wb,
          `Payroll Report (E.D.I.) ${selectedOffice} ${selectedDate}.xlsx`
        );
      }
    } catch (error) {
      messageElement.innerHTML = `<p style='color: red;'>Error: ${error.message}</p>`;
    } finally {
      loadingElement.style.display = "none";
    }
  });
