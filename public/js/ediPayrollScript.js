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

    const supportedReports = [
      "NET PAY",
      "ML Fund",
      "Sako",
      "GPA",
      "Income TAX",
    ]; // Add more as needed

    // Check if selected report is for PDF generation
    if (supportedReports.includes(selectedReport)) {
      console.log(supportedReports.includes(selectedReport));
      try {
        const response = await fetch("/generate-pdf", {
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

        if (response.ok) {
          const blob = await response.blob(); // Get the PDF blob
          const url = window.URL.createObjectURL(blob); // Create a URL for the blob
          const a = document.createElement("a"); // Create an anchor element
          a.href = url; // Set the href to the blob URL
          a.download = `${selectedReport}_${selectedOffice}_${selectedDate}.pdf`; // Set the desired filename
          document.body.appendChild(a); // Append to the document
          a.click(); // Trigger download
          a.remove(); // Clean up
          window.URL.revokeObjectURL(url); // Release the blob URL
        } else {
          const errorData = await response.json(); // Read JSON error response
          console.error("Error response:", errorData);
        }
      } catch (error) {
        console.error("Error fetching PDF:", error);
      } finally {
        loadingElement.style.display = "none";
      }
    } else {
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
          console.log(selectedReport);
          messageElement.innerHTML = `<p style='color: green;'>${selectedReport} Report has been exported successfully!</p>`;

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

          if (selectedReport === "EDI Payroll") {
            // Payroll Report Logic
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
                  if (
                    typeof cell === "number" &&
                    cIndex !== 18 &&
                    cIndex !== 19
                  ) {
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
          } else if (selectedReport === "EDI Deduction Details") {
            // Initialize an array to hold all the data across regions
            let combinedData = [];

            // Add header rows
            const ws_data = [
              [
                `PAYROLL DATE - ${selectedDate}`,
                "INCOME TAX",
                "SSS CONTRIBUTION",
                "SSS LOAN",
                "PAGIBIG CONTRIBUTION",
                "PAGIBIG LOAN",
                "PHILHEALTH",
                "COATED",
                "HMO",
                "CANTEEN",
                "DEDUCTION 1",
                "DEDUCTION 2",
                "ML FUND",
                "OPEC",
                "OVER APPRAISAL",
                "VPO COLLECTION",
                "INSTALLMENT ACCOUNT",
                "TICKET",
                "MOBILE BILL",
                "SAKO",
                "SAKO SAVINGS",
              ],
              [
                "",
                "credit",
                "credit",
                "credit",
                "credit",
                "credit",
                "credit",
                "credit",
                "credit",
                "credit",
                "credit",
                "credit",
                "credit",
                "credit",
                "credit",
                "credit",
                "credit",
                "credit",
                "credit",
                "credit",
              ],
              [
                "REGION",
                "3100001",
                "3100001",
                "3100001",
                "3100001",
                "3100001",
                "3100001",
                "3100001",
                "3100001",
                "3100001",
                "3100001",
                "3100001",
                "3100001",
                "3100001",
                "3100001",
                "3100001",
                "3100001",
                "3100001",
                "3100001",
                "3100001",
              ],
              [], // Add an empty row between header and data
            ];

            // Merge data from all regions into one array
            Object.keys(groupedData).forEach((region) => {
              groupedData[region].forEach((item) => {
                combinedData.push([
                  item.region,
                  item.tax,
                  item.ssscontri,
                  item.sssloan,
                  item.pagibigcontri,
                  item.pagibigloan,
                  item.philhealth,
                  item.coated,
                  item.hmo,
                  item.canteen,
                  item.deduction1,
                  item.deduction2,
                  item.mlfund,
                  item.opec,
                  item.over,
                  item.vpo,
                  item.install,
                  item.ticket,
                  item.bill,
                  item.sako1,
                  item.sakosavings,
                ]);
              });
            });

            // Append the combined data to ws_data
            ws_data.push(...combinedData);

            // Create the worksheet
            const ws = XLSX.utils.aoa_to_sheet(ws_data);

            // Apply formatting for numbers and adjust column widths
            ws_data.forEach((row, rIndex) => {
              row.forEach((cell, cIndex) => {
                if (typeof cell === "number") {
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

            // Bold and center-align the first 3 rows
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

            // Append the worksheet to the workbook and write the file
            XLSX.utils.book_append_sheet(wb, ws, "Deduction Details");
            XLSX.writeFile(
              wb,
              `Operation Deduction ${selectedOffice} ${selectedDate}.xlsx`
            );
          }

          // Create a sheet for each region
        }
      } catch (error) {
        messageElement.innerHTML = `<p style='color: red;'>Error: ${error.message}</p>`;
      } finally {
        loadingElement.style.display = "none";
      }
    }
  });
