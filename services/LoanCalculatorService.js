// services/LoanCalculatorService.js - COMPLETE VERSION
const utilitiesModel = require('../models/utilitiesModel');
const BracketService = require('./BracketService');

class LoanCalculatorService {
  /**
   * Main calculation entry point
   */
  async calculate(loanType, employeeData, loanAmount, bracketRow = null) {
    console.log(`💰 Calculating ${loanType} for ${employeeData.idno}`);

    const normalizedType = loanType.toLowerCase().trim();

    // Route to appropriate calculation method
    if (this.isBonusLoan(normalizedType)) {
      return this.calculateBonusLoan(normalizedType, employeeData);
    }

    if (this.isBracketBasedLoan(normalizedType)) {
      return this.calculateBracketBased(normalizedType, employeeData, bracketRow);
    }

    if (this.isFixedLoan(normalizedType)) {
      return this.calculateFixedLoan(normalizedType, employeeData);
    }

    if (this.isSakoLoan(normalizedType)) {
      return this.calculateSakoLoan(normalizedType, employeeData, bracketRow);
    }

    // Default fallback
    return this.calculateDefault(normalizedType, employeeData, loanAmount);
  }

  // ─────────────────────────────────────────────
  // LOAN TYPE CLASSIFICATION
  // ─────────────────────────────────────────────

  isBonusLoan(loanType) {
    return [
      'ml fund a.l.l. bonus',
      'sako a.l.l. bonus',
      'ml fund 13th month',
      'sako 13th month',
    ].includes(loanType);
  }

  isBracketBasedLoan(loanType) {
    return ['ml fund regular', 'ml fund regular reloan', 'sss'].includes(loanType);
  }

  isFixedLoan(loanType) {
    return loanType === 'pagibig';
  }

  isSakoLoan(loanType) {
    return [
      'sako maxi',
      'sako pettycash',
      'sako emergency',
      'sako preferential',
      'sako retirement',
    ].includes(loanType);
  }

  isMLFundLoan(loanType) {
    return [
      'ml fund regular',
      'ml fund regular reloan',
      'ml fund pettycash',
      'ml fund pettycash reloan',
      'ml fund jewelry loan',
      'ml fund o.p.i.',
    ].includes(loanType);
  }

  // ─────────────────────────────────────────────
  // BONUS LOAN CALCULATIONS
  // ─────────────────────────────────────────────

  calculateBonusLoan(loanType, employeeData) {
    const serviceYears = employeeData.service_years || 0;
    const monthlyRate = employeeData.monthlyrate || 0;
    const employeeName = `${employeeData.firstname} ${employeeData.lastname}`;
    const currentMonth = new Date().getMonth() + 1;

    let netProceeds = 0;
    let formula = '';
    let isEligible = true;
    let message = '';
    let loanDeduction = 0;

    switch (loanType) {
      case 'ml fund a.l.l. bonus':
        if (serviceYears < 5) {
          return {
            success: false,
            notEligible: true,
            message: `${employeeName} is not eligible for ML Fund A.L.L. Bonus. Length of service: ${serviceYears} year(s). Minimum 5 years required.`,
            data: { employeeName, serviceYears, requiredYears: 5, monthlyRate },
          };
        }
        netProceeds = monthlyRate * 0.8;
        formula = 'monthlyRate * 0.80';
        message = `✅ ${employeeName} is eligible for ML Fund A.L.L. Bonus.`;
        break;

      case 'sako a.l.l. bonus':
        netProceeds = serviceYears < 5 ? monthlyRate * 0.5 : monthlyRate * 0.8;
        formula = serviceYears < 5 ? 'monthlyRate * 0.50' : 'monthlyRate * 0.80';
        message = `✅ ${employeeName} is eligible for Sako A.L.L. Bonus.`;
        break;

      case 'ml fund 13th month':
        if (serviceYears < 5) {
          const monthlyAmount = (monthlyRate * 0.8) / 12;
          netProceeds = monthlyAmount * currentMonth;
          formula = `((monthlyRate * 0.80) / 12) * ${currentMonth} months`;
          message = `✅ ${employeeName} is eligible for ML Fund 13th Month (prorated).`;
        } else {
          netProceeds = monthlyRate * 0.8;
          formula = 'monthlyRate * 0.80';
          message = `✅ ${employeeName} is eligible for ML Fund 13th Month.`;
        }
        break;

      case 'sako 13th month':
        netProceeds = serviceYears < 5 ? monthlyRate * 0.5 : monthlyRate * 0.8;
        formula = serviceYears < 5 ? 'monthlyRate * 0.50' : 'monthlyRate * 0.80';
        message = `✅ ${employeeName} is eligible for Sako 13th Month.`;
        break;

      default:
        return {
          success: false,
          message: `Unknown bonus loan type: ${loanType}`,
          data: null,
        };
    }

    return {
      success: true,
      message,
      data: {
        employeeName,
        serviceYears,
        monthlyRate,
        netProceeds: parseFloat(netProceeds.toFixed(2)),
        loanAmount: parseFloat(netProceeds.toFixed(2)),
        loanDeduction,
        formula,
        loanType,
      },
    };
  }

  // ─────────────────────────────────────────────
  // BRACKET-BASED LOAN CALCULATIONS (ML Fund, SSS)
  // ─────────────────────────────────────────────

  calculateBracketBased(loanType, employeeData, bracketRow) {
    if (!bracketRow) {
      return {
        success: false,
        message: 'Bracket row is required for bracket-based loans',
        data: null,
      };
    }

    const payrollRecords = employeeData.payrollRecords || [];
    const latestPayroll = payrollRecords[0] || {};
    const loanComputation = employeeData.loanComputation || {};

    // Parse bracket values
    const bracketLoanAmount = BracketService.parseBracketNumber(bracketRow['LOAN AMOUNT']);
    const loanDeduction = BracketService.parseBracketNumber(bracketRow['DEDUCTION']);

    // Calculate existing loan total for this type
    const existingLoan = this.calculateExistingLoanTotal(latestPayroll, loanType);

    // Get net pay and percentage from computation
    const netPay = loanComputation.totalNetPay || 0;
    const percentage = loanComputation.percentage || 0;

    // Monthly deduction count (2 for most loans, 1 for SSS/PagIBIG)
    const monthlyDeductionCount = loanType === 'sss' ? 1 : 2;

    // Apply formula: ((netpay + (loan_exist * count)) - percentage) - (loan_deduct * count)
    const netProceeds =
      netPay +
      existingLoan * monthlyDeductionCount -
      percentage -
      loanDeduction * monthlyDeductionCount;

    return {
      success: true,
      data: {
        netProceeds: parseFloat(netProceeds.toFixed(2)),
        loanAmount: parseFloat(bracketLoanAmount.toFixed(2)),
        loanDeduction: parseFloat(loanDeduction.toFixed(2)),
        existingLoan: parseFloat(existingLoan.toFixed(2)),
        percentage: parseFloat(percentage.toFixed(2)),
        netPay: parseFloat(netPay.toFixed(2)),
        monthlyDeductionCount,
        formula: '((netpay + (loan_exist * count)) - percentage) - (loan_deduct * count)',
        loanType,
      },
    };
  }

  // ─────────────────────────────────────────────
  // SAKO LOAN CALCULATIONS
  // ─────────────────────────────────────────────

  calculateSakoLoan(loanType, employeeData, bracketRow) {
    const payrollRecords = employeeData.payrollRecords || [];
    const latestPayroll = payrollRecords[0] || {};
    const loanComputation = employeeData.loanComputation || {};

    // For Sako loans, we need to handle differently based on type
    let bracketType;
    let loanDeduction = 0;
    let bracketLoanAmount = 0;

    switch (loanType) {
      case 'sako maxi':
        bracketType = 'sako_maxi';
        if (bracketRow) {
          loanDeduction = BracketService.parseBracketNumber(bracketRow['DEDUCTION']);
          bracketLoanAmount = BracketService.parseBracketNumber(bracketRow['LOAN AMOUNT']);
        }
        break;
      case 'sako pettycash':
        bracketType = 'sako_petty';
        if (bracketRow) {
          loanDeduction = BracketService.parseBracketNumber(bracketRow['DEDUCTION']);
          bracketLoanAmount = BracketService.parseBracketNumber(bracketRow['LOAN AMOUNT']);
        }
        break;
      case 'sako emergency':
      case 'sako preferential':
      case 'sako retirement':
        // These may use different logic - for now use default
        return this.calculateDefault(loanType, employeeData, 0);
      default:
        return this.calculateDefault(loanType, employeeData, 0);
    }

    // Get existing Sako loans
    const existingSako = (latestPayroll.sakoemergency || 0) + (latestPayroll.sako_buyout || 0);

    // Get net pay and percentage
    const netPay = loanComputation.totalNetPay || 0;
    const percentage = loanComputation.percentage || 0;

    // Monthly deduction count for Sako loans
    const monthlyDeductionCount = 2;

    // Apply formula
    const netProceeds =
      netPay +
      existingSako * monthlyDeductionCount -
      percentage -
      loanDeduction * monthlyDeductionCount;

    return {
      success: true,
      data: {
        netProceeds: parseFloat(netProceeds.toFixed(2)),
        loanAmount: parseFloat(bracketLoanAmount.toFixed(2)),
        loanDeduction: parseFloat(loanDeduction.toFixed(2)),
        existingLoan: parseFloat(existingSako.toFixed(2)),
        percentage: parseFloat(percentage.toFixed(2)),
        netPay: parseFloat(netPay.toFixed(2)),
        monthlyDeductionCount,
        loanType,
      },
    };
  }

  // ─────────────────────────────────────────────
  // FIXED LOAN CALCULATIONS (PagIBIG)
  // ─────────────────────────────────────────────

  calculateFixedLoan(loanType, employeeData) {
    const loanDeduction = 1000; // Fixed amount for PagIBIG
    const netProceeds = 1000;

    return {
      success: true,
      data: {
        netProceeds,
        loanAmount: netProceeds,
        loanDeduction,
        loanType,
      },
    };
  }

  // ─────────────────────────────────────────────
  // DEFAULT CALCULATION
  // ─────────────────────────────────────────────

  calculateDefault(loanType, employeeData, loanAmount) {
    const netProceeds = loanAmount * 0.95;
    const loanDeduction = netProceeds / 12;

    return {
      success: true,
      data: {
        netProceeds: parseFloat(netProceeds.toFixed(2)),
        loanAmount: parseFloat(loanAmount.toFixed(2)),
        loanDeduction: parseFloat(loanDeduction.toFixed(2)),
        loanType,
      },
    };
  }

  // ─────────────────────────────────────────────
  // HELPER FUNCTIONS
  // ─────────────────────────────────────────────

  /**
   * Calculate total existing loans for a specific type
   */
  calculateExistingLoanTotal(record, loanType) {
    const loanFields = {
      'ml fund': [
        'mlfund_regular',
        'mlfund_comakership',
        'mlfund_jewelry',
        'mlfund_opi',
        'mlfund_pcl',
        'mlfund_emergency',
        'mlfund_all_buyout',
        'mlfund_bday',
        'mlfund_ssl',
      ],
      sako: ['sakoemergency', 'sako_buyout'],
      sss: ['sssloan'],
      pagibig: ['pagibigloan'],
    };

    let fields = [];
    for (const [key, value] of Object.entries(loanFields)) {
      if (loanType.toLowerCase().includes(key)) {
        fields = value;
        break;
      }
    }

    if (fields.length === 0) {
      fields = Object.values(loanFields).flat();
    }

    return fields.reduce((sum, field) => {
      return sum + parseFloat(record[field] || 0);
    }, 0);
  }

  /**
   * Check if employee is eligible for bonus loan
   */
  checkBonusEligibility(loanType, employeeData) {
    const serviceYears = employeeData.service_years || 0;
    const employeeName = `${employeeData.firstname} ${employeeData.lastname}`;

    if (loanType === 'ml fund a.l.l. bonus') {
      if (serviceYears < 5) {
        return {
          eligible: false,
          message: `${employeeName} is not eligible for ML Fund A.L.L. Bonus. Length of service: ${serviceYears} year(s). Minimum 5 years required.`,
          serviceYears,
          requiredYears: 5,
        };
      }
    }

    if (loanType === 'ml fund 13th month') {
      return {
        eligible: true,
        prorated: serviceYears < 5,
        message:
          serviceYears < 5
            ? 'Prorated amount for less than 5 years service'
            : 'Full amount for 5+ years service',
      };
    }

    return { eligible: true };
  }

  /**
   * Get bracket type for loan type
   */
  getBracketType(loanType) {
    const normalized = loanType.toLowerCase().trim();
    const map = {
      'ml fund regular': 'ml_fund',
      'ml fund regular reloan': 'ml_fund',
      'sako maxi': 'sako_maxi',
      'sako pettycash': 'sako_petty',
      sss: 'sss',
    };
    return map[normalized] || null;
  }
}

module.exports = new LoanCalculatorService();
