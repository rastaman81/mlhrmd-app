// const benefitsModel = require("../models/benefitsModel");
// const utilitiesModel = require("../models/utilitiesModel");

// async function getBenefitsReportsPage(req, res) {
//   try {
//     const [offices, reportTypes] = await Promise.all([
//       utilitiesModel.getOffice(),
//       benefitsModel.getBenefitsReportTypes(),
//     ]);

//     res.render("benefits/benefits-report", {
//       title: "Benefits Reports",
//       offices,
//       reportTypes,
//       username: req.session.user.username,
//     });
//   } catch (error) {
//     console.error("Error loading benefits reports page:", error);
//     res.status(500).render("error", {
//       error: "Error loading benefits reports page",
//     });
//   }
// }

// async function getRegionsByOffice(req, res) {
//   try {
//     const { office } = req.query;

//     if (!office) {
//       return res.json({
//         success: false,
//         message: "Office parameter is required",
//       });
//     }

//     const regions = await utilitiesModel.getPayrollRegions(office);

//     res.json({
//       success: true,
//       regions,
//     });
//   } catch (error) {
//     console.error("Error fetching regions:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error fetching regions",
//     });
//   }
// }

// async function generateBenefitsReport(req, res) {
//   try {
//     const { startDate, endDate, office, region, reportType } = req.body;

//     if (!office || !reportType) {
//       return res.status(400).json({
//         success: false,
//         message: "Office and report type are required fields",
//       });
//     }

//     const results = await benefitsModel.generateBenefitsReportData({
//       startDate,
//       endDate,
//       office,
//       region,
//       reportType,
//     });

//     if (!results.data || results.data.length === 0) {
//       return res.json({
//         success: true,
//         message: "No data found for the selected criteria",
//         hasIssues: false,
//         results: [],
//         reportType,
//       });
//     }

//     res.json({
//       success: true,
//       message: results.message,
//       hasIssues: results.hasIssues,
//       results: results.data,
//       reportType,
//     });
//   } catch (error) {
//     console.error("Error generating benefits report:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error generating benefits report",
//       error: error.message,
//     });
//   }
// }

// module.exports = {
//   getBenefitsReportsPage,
//   getRegionsByOffice,
//   generateBenefitsReport,
// };

const benefitsModel = require("../models/benefitsModel");
const utilitiesModel = require("../models/utilitiesModel");

// ── Page load ─────────────────────────────────────────────────────────────────
async function getBenefitsReportsPage(req, res) {
  try {
    const [offices, reportTypes] = await Promise.all([
      utilitiesModel.getOffice(), // FIX: was getOffice()
      benefitsModel.getBenefitsReportTypes(),
    ]);

    res.render("benefits/benefits-report", {
      title: "Benefits Reports",
      offices,
      reportTypes,
      username: req.session.user.username,
    });
  } catch (error) {
    console.error("Error loading benefits reports page:", error);
    res.status(500).render("error", {
      error: "Error loading benefits reports page",
    });
  }
}

// ── Regions by office ─────────────────────────────────────────────────────────
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

// ── Generate report ───────────────────────────────────────────────────────────
async function generateBenefitsReport(req, res) {
  try {
    const { startDate, endDate, office, region, reportType } = req.body;

    // FIX: added endDate to required-field check
    if (!office || !reportType || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Office, report type, and end date are required fields",
      });
    }

    const type = reportType.toLowerCase().trim();
    const isComparison = type.includes("comparison");

    if (isComparison) {
      const [comparison, summary] = await Promise.all([
        benefitsModel.getContributionComparison(
          office,
          endDate,
          region,
          reportType,
        ),
        benefitsModel.getContributionComparisonSummary(
          office,
          endDate,
          region,
          reportType,
        ),
      ]);
      const { rows, previousEndDate } = comparison;

      return res.json({
        success: true,
        message:
          rows.length > 0 ? `Found ${rows.length} records` : "No records found",
        hasData: rows.length > 0,
        results: rows,
        summary,
        reportType,
        previousEndDate,
        isComparison: true,
      });
    }

    const results = await benefitsModel.generateBenefitsReportData({
      startDate,
      endDate,
      office,
      region,
      reportType,
    });

    if (!results.data || results.data.length === 0) {
      return res.json({
        success: true,
        message: "No data found for the selected criteria",
        hasData: false, // FIX: was hasIssues
        results: [],
        reportType,
      });
    }

    res.json({
      success: true,
      message: results.message,
      hasData: results.hasData, // FIX: was hasIssues
      results: results.data,
      reportType,
    });
  } catch (error) {
    console.error("Error generating benefits report:", error);
    res.status(500).json({
      success: false,
      message: "Error generating benefits report",
      error: error.message,
    });
  }
}

async function getBenefitsEmployeeMovementPage(req, res) {
  try {
    const offices = await utilitiesModel.getOffice();

    res.render("benefits/benefits-employee-movement", {
      title: "Benefits Employee Movement",
      offices,
      username: req.session.user.username,
    });
  } catch (error) {
    console.error("Error loading Benefits Employee Movement page:", error);

    res.status(500).render("error", {
      error: "Error loading Benefits Employee Movement page",
    });
  }
}

async function getEmployeeMovement(req, res) {
  try {
    const { office, endDate } = req.body;

    if (!office || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Office and End Date are required",
      });
    }

    const results = await benefitsModel.getEmployeeMovement(office, endDate);

    res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

module.exports = {
  getBenefitsReportsPage,
  getRegionsByOffice,
  generateBenefitsReport,
  getBenefitsEmployeeMovementPage,

  getEmployeeMovement,
};
