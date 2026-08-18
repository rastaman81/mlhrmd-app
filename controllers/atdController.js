//const atdModel = require("../models/atdModel");
const utilitiesModel = require("../models/utilitiesModel");

async function getAtdReportsPage(req, res) {
  try {
    const [offices, reportTypes, incomeTypes, deductionTypes] =
      await Promise.all([
        utilitiesModel.getOffice(),
        //utilitiesModel.getPayrollReportTypes(),
        utilitiesModel.getAtdReportTypes(),
        //utilitiesModel.getPayrollIncomeTypes(),
        //utilitiesModel.getPayrollDeductionTypes(),
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

module.exports = {
  getAtdReportsPage,
};
