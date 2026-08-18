const payrollModel = require("../models/payrollModel");
const utilitiesModel = require("../models/utilitiesModel");

// Render the payroll utilities page
async function getPayrollUtilitiesPage(req, res) {
  try {
    const [offices, utilities, deductionTypes] = await Promise.all([
      utilitiesModel.getOffice(),
      utilitiesModel.getPayrollUtilities(),
      utilitiesModel.getPayrollDeductionTypes(),
    ]);

    res.render("payroll-utilities", {
      title: "Payroll Utilities",
      offices,
      utilities,
      deductionTypes,
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
    const [offices, reportTypes, incomeTypes, deductionTypes] =
      await Promise.all([
        utilitiesModel.getOffice(),
        utilitiesModel.getPayrollReportTypes(),
        utilitiesModel.getPayrollIncomeTypes(),
        utilitiesModel.getPayrollDeductionTypes(),
      ]);

    res.render("payroll-reports", {
      title: "Payroll Reports",
      offices,
      reportTypes,
      incomeTypes,
      deductionTypes,
      username: req.session.user.username,
    });
  } catch (error) {
    console.error("Error loading payroll reports page:", error);
    res.status(500).render("error", {
      error: "Error loading payroll reports page",
    });
  }
}

async function getPayrollDBFSearch(req, res) {
  try {
    const [offices, reportTypes, incomeTypes, deductionTypes] =
      await Promise.all([
        utilitiesModel.getOffice(),
        utilitiesModel.getPayrollReportTypes(),
        utilitiesModel.getPayrollIncomeTypes(),
        utilitiesModel.getPayrollDeductionTypes(),
      ]);

    res.render("payroll-employee-edit", {
      title: "Edit Employee",
      offices,
      reportTypes,
      incomeTypes,
      deductionTypes,
      username: req.session.user.username,
    });
  } catch (error) {
    console.error("Error loading payroll reports page:", error);
    res.status(500).render("error", {
      error: "Error loading payroll reports page",
    });
  }
}

async function generatePayrollPdf(req, res) {
  try {
    const { reportData, reportType, category, office } = req.body;
    //console.log("controller: ", office);
    if (!reportData || !reportType) {
      return res.status(400).json({
        success: false,
        message: "Report data and type are required",
      });
    }

    //console.log("controller category", category);
    // Generate the PDF (implementation depends on your PDF library)
    const pdfBuffer = await payrollModel.generatePdf({
      data: reportData,
      type: reportType,
      category: category,
      office: office,
    });

    // Set the appropriate headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${reportType}_${category}_Report_${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`,
    );

    // Send the PDF
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({
      success: false,
      message: "Error generating PDF",
      error: error.message,
    });
  }
}

async function generatePayrollReports(req, res) {
  try {
    const {
      startDate,
      endDate,
      dateRange,
      office,
      region,
      reportType,
      incomeType,
      deductionType,
    } = req.body;
    //console.log(`region: ${region}`);
    if (!office || !reportType) {
      return res.status(400).json({
        success: false,
        message: "Office, region, and utility name are required fields",
      });
    }

    const results = await payrollModel.generatePayrollReportData({
      startDate,
      endDate,
      dateRange,
      office,
      region,
      reportType,
      incomeType,
      deductionType,
    });
    //console.log("resulelelele", results);

    // Check if we have data before proceeding
    if (!results.data || results.data.length === 0) {
      return res.json({
        success: true,
        message: "No data found for the selected criteria",
        hasIssues: false,
        results: [],
        reportType,
      });
    }

    res.json({
      success: true,
      message: results.message,
      hasIssues: results.hasIssues,
      results: results.data,
      reportType,
    });
  } catch (error) {
    console.error("Error generating payroll reports:", error);
    res.status(500).json({
      success: false,
      message: "Error generating payroll reports",
      error: error.message,
    });
  }
}

async function getRegionsByOffice(req, res) {
  try {
    const { office } = req.query;

    if (!office) {
      return res.json({
        success: false,
        message: "Office parameter is required",
      });
    }

    const regions = await utilitiesModel.getPayrollRegions(office);

    res.json({
      success: true,
      regions,
    });
  } catch (error) {
    console.error("Error fetching regions:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching regions",
    });
  }
}

// async function executeTask(req, res) {
//   try {
//     const {
//       startDate,
//       endDate,
//       dateRange,
//       office,
//       region,
//       reportType,
//       incomeType,
//       deductionType,
//       utilityName,
//       amount,
//       description,
//     } = req.body;
//     //console.log(`execute task region: ${region}`);
//     //console.log(`execute task region: ${office}`);
//     if (!office || !region || !utilityName) {
//       return res.status(400).json({
//         success: false,
//         message: "Office, region, and utility name are required fields",
//       });
//     }

//     const result = await payrollModel.executePayrollTask({
//       startDate,
//       endDate,
//       dateRange,
//       office,
//       region,
//       utilityName,
//       amount,
//       description,
//     });

//     res.json({
//       success: true,
//       message: result.message,
//       hasIssues: result.hasIssues,
//       results: result.data,
//       utilityName,
//     });
//   } catch (error) {
//     console.error("Error in executeTask:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error executing task: " + error.message,
//     });
//   }
// }

//START - WORKING CODE FOR UPLOADING AND STORING THE FILE INTO THE UPLOADS FOLDER
// async function executeTask(req, res) {
//   try {
//     const {
//       startDate,
//       endDate,
//       dateRange,
//       office,
//       region,
//       reportType,
//       incomeType,
//       deductionType,
//       utilityName,
//       amount,
//       description,
//     } = req.body;

//     // 🔍 Debug (remove later)
//     //console.log("BODY:", req.body);
//     //console.log("FILE:", req.file);

//     // ===============================
//     // 🔥 CASE 1: UPLOAD PAYROLL DATA
//     // ===============================
//     if (
//       utilityName &&
//       utilityName.toLowerCase().includes("upload payroll data")
//     ) {
//       // ✅ Validate file
//       if (!req.file) {
//         return res.status(400).json({
//           success: false,
//           message: "Please upload a file (.xlsx or .csv)",
//         });
//       }

//       const filePath = req.file.path;

//       // 🔥 Call NEW model function (you will create this next)
//       // console.log(
//       //   "+++++++++++ ",
//       //   typeof office,
//       //   office,
//       //   typeof dateRange,
//       //   "dateRange: ",
//       //   dateRange,
//       // );
//       const result = await payrollModel.processUploadedPayroll({
//         dateRange,
//         filePath,
//         office,
//         region,
//         user: req.session.user.username,
//       });

//       return res.json({
//         success: true,
//         message: result.message || "Payroll uploaded successfully",
//         hasIssues: result.hasIssues || false,
//         results: result.data || [],
//         utilityName,
//       });
//     }

//     // ===============================
//     // 🔥 CASE 2: NORMAL TASKS (EXISTING)
//     // ===============================

//     if (!office || !region || !utilityName) {
//       return res.status(400).json({
//         success: false,
//         message: "Office, region, and utility name are required fields",
//       });
//     }

//     const result = await payrollModel.executePayrollTask({
//       startDate,
//       endDate,
//       dateRange,
//       office,
//       region,
//       utilityName,
//       amount,
//       description,
//     });

//     res.json({
//       success: true,
//       message: result.message,
//       hasIssues: result.hasIssues,
//       results: result.data,
//       utilityName,
//     });
//   } catch (error) {
//     console.error("Error in executeTask:", error);

//     res.status(500).json({
//       success: false,
//       message: "Error executing task: " + error.message,
//     });
//   }
// }
//END - WORKING CODE FOR UPLOADING AND STORING THE FILE INTO THE UPLOADS FOLDER

async function executeTask(req, res) {
  try {
    const {
      startDate,
      endDate,
      dateRange,
      office,
      region,
      reportType,
      incomeType,
      deductionType,
      utilityName,
      amount,
      description,
    } = req.body;

    // ===============================
    // 🔥 CASE 1: UPLOAD PAYROLL DATA
    // ===============================
    if (
      utilityName &&
      utilityName.toLowerCase().includes("upload payroll data")
    ) {
      // ✅ Validate file
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please upload a file (.xlsx or .csv)",
        });
      }

      // 🔥 NEW: use buffer instead of path
      const fileBuffer = req.file.buffer;
      const fileName = req.file.originalname;

      // (Optional debug)
      // console.log("Uploaded file:", fileName);
      // console.log("Buffer size:", fileBuffer.length);

      // 🔥 Call model (UPDATED PARAMS)
      const result = await payrollModel.processUploadedPayroll({
        dateRange,
        fileBuffer, // ✅ changed
        fileName, // ✅ added (optional but useful)
        office,
        region,
        user: req.session.user.username,
      });

      return res.json({
        success: true,
        message: result.message || "Payroll uploaded successfully",
        hasIssues: result.hasIssues || false,
        results: result.data || [],
        utilityName,
      });
    }

    // ===============================
    // 🔥 CASE 2: NORMAL TASKS
    // ===============================
    if (!office || !region || !utilityName) {
      return res.status(400).json({
        success: false,
        message: "Office, region, and utility name are required fields",
      });
    }

    const result = await payrollModel.executePayrollTask({
      startDate,
      endDate,
      dateRange,
      office,
      region,
      utilityName,
      amount,
      description,
    });

    return res.json({
      success: true,
      message: result.message,
      hasIssues: result.hasIssues,
      results: result.data,
      utilityName,
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
  generatePayrollReports,
  getPayrollReportsPage,
  executeTask,
  generatePayrollPdf,
  getPayrollDBFSearch,
};
