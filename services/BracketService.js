// services/BracketService.js
const utilitiesModel = require('../models/utilitiesModel');

const BRACKET_TABLES = {
  ml_fund: 'loan_bracket_mlfund',
  sako_maxi: 'loan_bracket_sakomaxi',
  sako_petty: 'loan_bracket_sakopettycash',
  sss: 'loan_bracket_sss',
};

class BracketService {
  /**
   * Get bracket data for a specific loan type
   */
  async getBracketData(type, office) {
    const tableName = BRACKET_TABLES[type];
    if (!tableName) {
      throw new Error(`Unknown bracket type: ${type}`);
    }

    const pool = utilitiesModel.getDbPool(office || 'default');

    let query;
    switch (type) {
      case 'ml_fund':
        query = `
          SELECT 
            los AS 'LENGTH OF SERVICE',
            FORMAT(loanamount, 2) AS 'LOAN AMOUNT',
            FORMAT(PRINCIPAL, 2) AS 'PRINCIPAL',
            FORMAT(INTEREST, 2) AS 'INTEREST',
            FORMAT(INSURANCE, 2) AS 'INSURANCE',
            FORMAT(DEDUCTION, 2) AS 'DEDUCTION',
            noyear AS 'YEARS TO PAY',
            lengthofservice AS 'LOS',
            Months AS 'MONTHS'
          FROM ${tableName}
          ORDER BY loanamount
        `;
        break;
      case 'sako_maxi':
        query = `
          SELECT 
            FORMAT(loanamount, 2) AS 'LOAN AMOUNT',
            FORMAT(YEAR1, 2) AS 'ONE YEAR',
            FORMAT(YEAR2, 2) AS 'TWO YEARS',
            FORMAT(YEAR3, 2) AS 'THREE YEARS',
            FORMAT(YEAR4, 2) AS 'FOUR YEARS',
            FORMAT(YEAR5, 2) AS 'FIVE YEARS',
            FORMAT(YEAR6, 2) AS 'SIX YEARS'
          FROM ${tableName}
          ORDER BY loanamount
        `;
        break;
      case 'sako_petty':
        query = `
          SELECT 
            FORMAT(loanamount, 2) AS 'LOAN AMOUNT',
            FORMAT(month3, 2) AS '3 MONTHS',
            FORMAT(month4, 2) AS '4 MONTHS',
            FORMAT(month5, 2) AS '5 MONTHS',
            FORMAT(month6, 2) AS '6 MONTHS',
            FORMAT(month7, 2) AS '7 MONTHS',
            FORMAT(month8, 2) AS '8 MONTHS',
            FORMAT(month9, 2) AS '9 MONTHS',
            FORMAT(month10, 2) AS '10 MONTHS',
            FORMAT(month11, 2) AS '11 MONTHS',
            FORMAT(month12, 2) AS '12 MONTHS'
          FROM ${tableName}
          ORDER BY loanamount
        `;
        break;
      case 'sss':
        query = `
          SELECT 
            FORMAT(monthlyrate, 2) AS 'MONTHLY RATE',
            FORMAT(loandeduction, 2) AS 'DEDUCTION'
          FROM ${tableName}
          ORDER BY monthlyrate
        `;
        break;
      default:
        throw new Error(`No query defined for bracket type: ${type}`);
    }

    const [rows] = await pool.query(query);
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return { columns, rows };
  }

  /**
   * Parse a bracket number (remove formatting)
   */
  parseBracketNumber(value) {
    if (value === null || value === undefined) return 0;
    const cleaned = String(value).replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
}

module.exports = new BracketService();
