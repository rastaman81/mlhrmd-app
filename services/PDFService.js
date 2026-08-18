// services/PDFService.js - PROFESSIONAL REDESIGN (co-maker labels retained)
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────
// SHARED DESIGN TOKENS
// ─────────────────────────────────────────────────────────────
const COLORS = {
  navy: '#16304A',
  navyDeep: '#0F2233',
  blue: '#2E6F9E',
  teal: '#1F7A6C',
  gold: '#A8762A',
  bg: '#F6F7F9',
  panel: '#F8FAFC',
  border: '#E3E6EB',
  borderStrong: '#C7CDD6',
  muted: '#6B7686',
  danger: '#C1483D',
  green: '#1E7A34',
  black: '#1A1F27',
  white: '#FFFFFF',
};

class PDFService {
  isBonusLoanType(loanType) {
    const bonusTypes = [
      'ml fund 13th month',
      'ml fund a.l.l. bonus',
      'sako 13th month',
      'sako a.l.l. bonus',
    ];
    return bonusTypes.includes((loanType || '').toLowerCase().trim());
  }

  // ───────────────────────────────────────────────────────────
  // FONT REGISTRATION HELPER (Unicode support for ₱)
  // ───────────────────────────────────────────────────────────
  _registerFonts(doc) {
    let pesoFontOk = false;
    const fontCandidates = [
      path.join(__dirname, '../public/fonts/NotoSans-Regular.ttf'),
      path.join(__dirname, '../assets/fonts/NotoSans-Regular.ttf'),
      path.join(__dirname, '../fonts/NotoSans-Regular.ttf'),
    ];
    const fontCandidatesBold = [
      path.join(__dirname, '../public/fonts/NotoSans-Bold.ttf'),
      path.join(__dirname, '../assets/fonts/NotoSans-Bold.ttf'),
      path.join(__dirname, '../fonts/NotoSans-Bold.ttf'),
    ];
    const regularFontPath = fontCandidates.find((p) => fs.existsSync(p));
    const boldFontPath = fontCandidatesBold.find((p) => fs.existsSync(p));

    if (regularFontPath && boldFontPath) {
      try {
        doc.registerFont('AppRegular', regularFontPath);
        doc.registerFont('AppBold', boldFontPath);
        pesoFontOk = true;
      } catch (e) {
        pesoFontOk = false;
      }
    }
    return pesoFontOk;
  }
  _getSignaturePath(idno) {
    if (!idno) return null;
    const candidate = path.join(__dirname, `../public/images/signature_${idno}.png`);
    return fs.existsSync(candidate) ? candidate : null;
  }

  formatCurrency(value, usePeso = true) {
    const prefix = usePeso ? '₱' : 'PHP ';
    if (value === null || value === undefined || isNaN(value)) {
      return `${prefix}0.00`;
    }
    return `${prefix}${parseFloat(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  formatDate(date) {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  // ───────────────────────────────────────────────────────────
  // LOAN COMPUTATION PDF
  // ───────────────────────────────────────────────────────────
  // ───────────────────────────────────────────────────────────
  // LOAN COMPUTATION PDF (compact spacing, black/white)
  // ───────────────────────────────────────────────────────────
  async generateLoanPDF(loanData, employeeData, credentials, office, processedBy) {
    return new Promise((resolve, reject) => {
      try {
        const isBonus = this.isBonusLoanType(loanData.loantype);
        const totalMonthlyDeduction =
          loanData.deductionpermonth !== undefined && loanData.deductionpermonth !== null
            ? parseFloat(loanData.deductionpermonth) || 0
            : (loanData.loandeduction || 0) * (loanData.monthlyDeductionCount || 2);

        console.log('📊 PDF Generation - percent35:', loanData.percent35);
        console.log('📊 PDF Generation - isBonus:', isBonus);

        const displayData = isBonus
          ? {
              ...loanData,
              netpay1: 0,
              netpay2: 0,
              existingloan: 0,
              percent35: 0,
              deductionpermonth: 0,
            }
          : loanData;

        // Short bond paper (8.5x11) folded in half -> 8.5 x 5.5 half-sheet.
        const PAGE_WIDTH = 8.5 * 72;
        const PAGE_HEIGHT = 11 * 72;
        const MARGIN = 24;

        const doc = new PDFDocument({
          size: [PAGE_WIDTH, PAGE_HEIGHT],
          // Bottom margin kept near-zero on purpose: this is a fixed
          // single-page half-sheet form with no page-break logic of its
          // own. Leaving PDFKit's default bottom margin in place makes it
          // silently insert extra blank pages the moment content gets
          // close to that margin (same issue fixed in the report PDF).
          margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 1 },
          bufferPages: true,
          info: { Title: 'Loan Computation', Author: 'HRMS System' },
        });

        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const PAGE_LEFT = MARGIN;
        const PAGE_RIGHT = PAGE_WIDTH - MARGIN;
        const CONTENT_WIDTH = PAGE_RIGHT - PAGE_LEFT;

        const pesoFontOk = this._registerFonts(doc);
        const REGULAR_FONT = pesoFontOk ? 'AppRegular' : 'Helvetica';
        const BOLD_FONT = pesoFontOk ? 'AppBold' : 'Helvetica-Bold';

        // ─── Helper: Proper Case (with acronyms) ──────────────
        const acronyms = ['ML', 'SSS', 'PAGIBIG', 'A.L.L.', 'O.P.I.'];
        const toProperCase = (str) => {
          if (!str) return str;
          return str
            .toLowerCase()
            .split(' ')
            .map((word) => {
              const upper = word.toUpperCase();
              if (acronyms.includes(upper)) return upper;
              return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
        };

        // ─── HEADER ────────────────────────────────────────────
        const BANNER_HEIGHT = 44;
        const LOGO_BOX_W = 100;
        const TEXT_BLOCK_TOP = 8;
        const TEXT_BLOCK_HEIGHT = 28;

        const logoPath = path.join(__dirname, '../public/images/logo.png');
        let titleStartX = PAGE_LEFT;
        try {
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, PAGE_LEFT, TEXT_BLOCK_TOP, {
              fit: [LOGO_BOX_W, TEXT_BLOCK_HEIGHT],
              align: 'left',
              valign: 'center',
            });
            titleStartX = PAGE_LEFT + LOGO_BOX_W + 14;
          }
        } catch (e) {
          /* ignore */
        }

        doc
          .font('Helvetica-Bold')
          .fontSize(6.5)
          .fillColor(COLORS.muted)
          .text('HUMAN RESOURCES MANAGEMENT OFFICE', titleStartX, TEXT_BLOCK_TOP + 3, {
            characterSpacing: 0.4,
          });

        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor(COLORS.black)
          .text('Loan Computation', titleStartX, TEXT_BLOCK_TOP + 13);

        const chipText = `${(office || 'N/A').toUpperCase()}   •   CONTROL NO. ${loanData.controlNo || 'N/A'}`;
        doc
          .font('Helvetica-Bold')
          .fontSize(6.5)
          .fillColor(COLORS.black)
          .text(chipText, PAGE_LEFT, TEXT_BLOCK_TOP + 3, {
            width: CONTENT_WIDTH,
            align: 'right',
          });

        doc
          .moveTo(PAGE_LEFT, BANNER_HEIGHT)
          .lineTo(PAGE_RIGHT, BANNER_HEIGHT)
          .lineWidth(1)
          .strokeColor(COLORS.black)
          .stroke();

        let y = BANNER_HEIGHT + 12;

        // ─── EMPLOYEE / LOAN DETAILS CARD ──────────────────────
        const cardPadX = 10;
        const cardPadY = 7;
        const rowHeight = 20;
        const cardRows = 4;
        const cardHeight = cardPadY * 2 + rowHeight * cardRows - 6;

        doc
          .roundedRect(PAGE_LEFT, y, CONTENT_WIDTH, cardHeight, 4)
          .fillAndStroke(COLORS.panel, COLORS.border);

        const leftColX = PAGE_LEFT + cardPadX;
        const rightColX = PAGE_LEFT + CONTENT_WIDTH / 2 + 16;
        const fieldWidth = CONTENT_WIDTH / 2 - cardPadX - 20;

        // ─── Updated field helper: all values bold, properCase option ──
        const field = (label, value, x, cy, opts = {}) => {
          const { color = COLORS.black, properCase = false } = opts;
          let displayValue = value || 'N/A';
          if (properCase && typeof displayValue === 'string') {
            displayValue = toProperCase(displayValue);
          }
          doc
            .font('Helvetica-Bold')
            .fontSize(5.5)
            .fillColor(COLORS.muted)
            .text(label.toUpperCase(), x, cy, { characterSpacing: 0.3 });
          doc
            .font(BOLD_FONT) // always bold
            .fontSize(8)
            .fillColor(color)
            .text(displayValue, x, cy + 8, { width: fieldWidth });
        };

        let fy = y + cardPadY;
        field('Date Received', this.formatDate(loanData.datereceived), leftColX, fy);
        field('Loan Type', loanData.loantype, rightColX, fy, { properCase: true });
        fy += rowHeight;

        field('Region', loanData.region, leftColX, fy, { properCase: true });
        field('Loan Amount', this.formatCurrency(loanData.loanamount, pesoFontOk), rightColX, fy, {
          color: COLORS.black,
        });
        fy += rowHeight;

        const employeeName = `${toProperCase(loanData.lastname || '')}, ${toProperCase(loanData.firstname || '')}  (${loanData.idno || ''})`;
        field('Employee', employeeName, leftColX, fy);
        field(
          'Loan Deduction',
          this.formatCurrency(loanData.loandeduction, pesoFontOk),
          rightColX,
          fy,
        );
        fy += rowHeight;

        field('Branch / Department', loanData.branch, leftColX, fy, { properCase: true });
        field('Wallet Number', loanData.account_no || 'N/A', rightColX, fy);

        y = y + cardHeight + 12;

        // ─── PARTICULARS HEADER ───────────────────────────────
        doc.rect(PAGE_LEFT, y, 3, 11).fill(COLORS.black);
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .fillColor(COLORS.black)
          .text('LOAN COMPUTATION BREAKDOWN', PAGE_LEFT + 8, y + 1, {
            characterSpacing: 0.2,
          });
        y += 20;

        // ─── COMPUTATION TABLE ────────────────────────────────
        const leftX = PAGE_LEFT + 4;
        const LABEL_X = leftX + 300;
        const LABEL_WIDTH = 130;
        const SIGN_X = LABEL_X + LABEL_WIDTH;
        const SIGN_WIDTH = 16;
        const AMOUNT_X = SIGN_X + SIGN_WIDTH;
        const AMOUNT_WIDTH = PAGE_RIGHT - AMOUNT_X;
        const ledgerTop = y;

        const particularRow = (label, amount, cy, opts = {}) => {
          const {
            sign = null,
            signColor = COLORS.black,
            amountColor = COLORS.black,
            bold = false,
            fontSize = 8,
          } = opts;

          doc
            .font('Helvetica')
            .fontSize(fontSize)
            .fillColor(COLORS.muted)
            .text(label, LABEL_X, cy, { width: LABEL_WIDTH });

          if (sign) {
            doc
              .font('Helvetica-Bold')
              .fontSize(fontSize)
              .fillColor(signColor)
              .text(sign, SIGN_X, cy, { width: SIGN_WIDTH, align: 'center' });
          }

          doc
            .font(bold ? BOLD_FONT : REGULAR_FONT)
            .fontSize(fontSize)
            .fillColor(amountColor)
            .text(amount, AMOUNT_X, cy, { width: AMOUNT_WIDTH, align: 'right' });
        };

        const cycleChip = (label, dateVal, cy) => {
          doc.font('Helvetica-Bold').fontSize(6.5).fillColor(COLORS.black).text(label, leftX, cy);
          doc
            .font('Helvetica')
            .fontSize(7.5)
            .fillColor(COLORS.black)
            .text(this.formatDate(dateVal), leftX + 90, cy);
        };

        cycleChip('1ST PAYROLL CYCLE', loanData.firstpayrolldate, y);
        particularRow('Net Pay 1', this.formatCurrency(displayData.netpay1, pesoFontOk), y);
        y += 17;

        cycleChip('2ND PAYROLL CYCLE', loanData.secondpayrolldate, y);
        particularRow('Net Pay 2', this.formatCurrency(displayData.netpay2, pesoFontOk), y);
        y += 17;
        const existingLoanMonthly =
          (displayData.existingloan || 0) * (loanData.monthlyDeductionCount || 2);
        particularRow('Existing Loan', this.formatCurrency(existingLoanMonthly, pesoFontOk), y, {
          sign: '+',
          signColor: COLORS.black,
          amountColor: COLORS.black,
        });
        y += 17;

        doc
          .moveTo(leftX + 280, y)
          .lineTo(PAGE_RIGHT, y)
          .lineWidth(0.5)
          .strokeColor(COLORS.border)
          .stroke();
        y += 8;

        const isNegative = (displayData.netproceeds || 0) < 0;

        particularRow(
          '35% Take Home Pay',
          this.formatCurrency(displayData.percent35, pesoFontOk),
          y,
          { sign: '-', signColor: COLORS.black, amountColor: COLORS.black },
        );
        y += 17;

        particularRow(
          'Deduction Per Month',
          this.formatCurrency(totalMonthlyDeduction, pesoFontOk),
          y,
          { sign: '-', signColor: COLORS.black, amountColor: COLORS.black },
        );
        y += 18;

        doc
          .roundedRect(
            leftX - 12,
            ledgerTop - 8,
            CONTENT_WIDTH - 2 * (leftX - PAGE_LEFT) + 16,
            y - ledgerTop + 4,
            4,
          )
          .lineWidth(0.75)
          .strokeColor(COLORS.border)
          .stroke();

        y += 4;

        // ─── NET PROCEEDS ──────────────────────────────────────
        const netTextColor = isNegative ? COLORS.danger : COLORS.black;

        doc
          .moveTo(PAGE_LEFT, y)
          .lineTo(PAGE_RIGHT, y)
          .lineWidth(1)
          .strokeColor(COLORS.black)
          .stroke();

        y += 6;
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor(COLORS.black)
          .text('NET PROCEEDS', PAGE_LEFT, y);
        doc
          .font(BOLD_FONT)
          .fontSize(10)
          .fillColor(netTextColor)
          .text(this.formatCurrency(displayData.netproceeds, pesoFontOk), PAGE_LEFT, y, {
            width: CONTENT_WIDTH - 5,
            align: 'right',
          });

        y += 20;

        // ─── CO-MAKERS ──────────────────────────────────────────
        const comakerList = [
          { number: 1, name: loanData.comaker1 },
          { number: 2, name: loanData.comaker2 },
          { number: 3, name: loanData.comaker3 },
          { number: 4, name: loanData.comaker4 },
        ].filter((c) => c.name && c.name.trim() !== '');

        if (comakerList.length > 0) {
          doc.rect(PAGE_LEFT, y, 3, 9).fill(COLORS.black);
          doc
            .font('Helvetica-Bold')
            .fontSize(6.5)
            .fillColor(COLORS.black)
            .text('CO-MAKERS', PAGE_LEFT + 8, y - 1, { characterSpacing: 0.2 });
          y += 13;

          // Single row, up to 4 across — positioned by co-maker slot number
          // (1–4) rather than list index, so gaps line up with missing slots.
          const comakerBlockTop = y - 3;
          const colWidth = CONTENT_WIDTH / 4;
          const badgeRadius = 4;
          const rowCy = y + 6;

          comakerList.forEach((cm) => {
            const cx = PAGE_LEFT + (cm.number - 1) * colWidth + 6;
            doc.circle(cx + badgeRadius, rowCy, badgeRadius).fill(COLORS.black);
            doc
              .font('Helvetica-Bold')
              .fontSize(5)
              .fillColor(COLORS.white)
              .text(String(cm.number), cx, rowCy - 2.3, {
                width: badgeRadius * 2,
                align: 'center',
              });
            doc
              .font('Helvetica')
              .fontSize(6.5)
              .fillColor(COLORS.black)
              .text(cm.name, cx + badgeRadius * 2 + 4, rowCy - 3.2, {
                width: colWidth - badgeRadius * 2 - 10,
              });
          });

          y = rowCy + 8;

          doc
            .roundedRect(PAGE_LEFT, comakerBlockTop, CONTENT_WIDTH, y - comakerBlockTop + 3, 4)
            .lineWidth(0.75)
            .strokeColor(COLORS.border)
            .stroke();

          y += 8;
        }

        // ─── SIGNATURES ─────────────────────────────────────────
        y += 4;

        const gap = 24;
        const sigColWidth = (CONTENT_WIDTH - gap) / 2;
        const preparedColX = PAGE_LEFT;
        const notedColX = preparedColX + sigColWidth + gap;
        const preparedByName = loanData?.preparedBy || processedBy || '______________';
        const preparedByDesignation = loanData?.designation || '';
        const notedByName = credentials?.notedBy || '______________';
        const notedByDesignation = credentials?.notedTitle || '';
        const preparedBySignaturePath = this._getSignaturePath(loanData?.preparedByIdno); // ← ADD

        const signatureBlock = (x, label, name, designation, signaturePath = null) => {
          doc
            .font('Helvetica-Bold')
            .fontSize(6.5)
            .fillColor(COLORS.muted)
            .text(label.toUpperCase(), x, y, {
              width: sigColWidth,
              align: 'center',
              characterSpacing: 0.4,
            });

          if (signaturePath) {
            try {
              doc.image(signaturePath, x + 4, y - 10, {
                fit: [sigColWidth - 8, 40],
                align: 'center',
              });
            } catch (e) {
              doc
                .moveTo(x + 16, y + 18)
                .lineTo(x + sigColWidth - 16, y + 18)
                .lineWidth(0.75)
                .strokeColor(COLORS.borderStrong)
                .stroke();
            }
          } else {
            doc
              .moveTo(x + 16, y + 18)
              .lineTo(x + sigColWidth - 16, y + 18)
              .lineWidth(0.75)
              .strokeColor(COLORS.borderStrong)
              .stroke();
          }

          doc
            .font('Helvetica-Bold')
            .fontSize(8)
            .fillColor(COLORS.black)
            .text(name, x, y + 21, { width: sigColWidth, align: 'center' });

          doc
            .font('Helvetica-Oblique')
            .fontSize(6)
            .fillColor(COLORS.muted)
            .text(designation, x, y + 32, { width: sigColWidth, align: 'center' });
        };

        signatureBlock(
          preparedColX,
          'Prepared By',
          preparedByName,
          preparedByDesignation,
          preparedBySignaturePath,
        );
        signatureBlock(notedColX, 'Noted By', notedByName, notedByDesignation);

        signatureBlock(preparedColX, 'Prepared By', preparedByName, preparedByDesignation);
        signatureBlock(notedColX, 'Noted By', notedByName, notedByDesignation);

        // ─── FOOTER ─────────────────────────────────────────────
        // Placed directly below the "Noted By" designation, on the right
        // side, instead of a separate rule spanning the page bottom.
        doc
          .font('Helvetica-Oblique')
          .fontSize(5.5)
          .fillColor(COLORS.muted)
          .text(
            `Processed on: ${new Date().toLocaleString('en-PH', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true,
            })}`,
            notedColX,
            y + 42,
            { width: sigColWidth, align: 'center' },
          );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  // ───────────────────────────────────────────────────────────
  // LOAN REPORT PDF
  // ───────────────────────────────────────────────────────────
  async generateLoanReportPDF(loans, filters, userInfo, logoPath) {
    return new Promise((resolve, reject) => {
      try {
        const PAGE_WIDTH = 8.5 * 72;
        const PAGE_HEIGHT = 11 * 72;
        const MARGIN = 40;

        const doc = new PDFDocument({
          size: [PAGE_WIDTH, PAGE_HEIGHT],
          // Bottom margin kept near-zero on purpose: every page break in this
          // document (table rows, summary, signatures, footer) is handled
          // explicitly below. If PDFKit's own bottom margin is left at a
          // normal value, its internal auto-flow silently inserts extra
          // blank pages the moment a row gets close to it — which is exactly
          // what happened when FOOTER_RESERVE was tightened to fit more rows.
          margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 1 },
          bufferPages: true,
          info: { Title: 'Loan Report', Author: 'HRIS System' },
        });

        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const PAGE_LEFT = MARGIN;
        const PAGE_RIGHT = PAGE_WIDTH - MARGIN;
        const CONTENT_WIDTH = PAGE_RIGHT - PAGE_LEFT;

        const pesoFontOk = this._registerFonts(doc);
        const REGULAR_FONT = pesoFontOk ? 'AppRegular' : 'Helvetica';
        const BOLD_FONT = pesoFontOk ? 'AppBold' : 'Helvetica-Bold';

        const formatCurrency = (value) => this.formatCurrency(value, pesoFontOk);
        const formatDate = (date) => this.formatDate(date);

        // ═══════════════════════════════════════════════════════
        // HEADER (plain — no colored fills, black/grey ink only)
        // ═══════════════════════════════════════════════════════
        const BANNER_HEIGHT = 78;
        const LOGO_BOX_W = 120;
        // Height of the text block (subtitle + title) the logo must align with
        const TEXT_BLOCK_TOP = 30;
        const TEXT_BLOCK_HEIGHT = 40;

        const drawBanner = () => {
          let titleStartX = PAGE_LEFT;
          try {
            if (logoPath && fs.existsSync(logoPath)) {
              doc.image(logoPath, PAGE_LEFT, TEXT_BLOCK_TOP, {
                fit: [LOGO_BOX_W, TEXT_BLOCK_HEIGHT],
                align: 'left',
                valign: 'center',
              });
              titleStartX = PAGE_LEFT + LOGO_BOX_W + 16;
            }
          } catch (e) {
            /* ignore */
          }

          // --- SUBTITLE ---
          doc
            .font('Helvetica-Bold')
            .fontSize(8)
            .fillColor(COLORS.muted)
            .text('HUMAN RESOURCES MANAGEMENT OFFICE', titleStartX, TEXT_BLOCK_TOP + 6, {
              characterSpacing: 0.5,
            });

          // --- TITLE ---
          doc
            .font('Helvetica-Bold')
            .fontSize(12)
            .fillColor(COLORS.black)
            .text('Loan Report', titleStartX, TEXT_BLOCK_TOP + 19);

          // --- CHIP (now directly above the rule) ---
          const chipText = `${(filters.office || 'ALL OFFICES').toUpperCase()}   •   ${(filters.provider || 'ALL PROVIDERS').toUpperCase()}`;
          doc
            .font('Helvetica-Bold')
            .fontSize(8)
            .fillColor(COLORS.muted)
            .text(chipText, PAGE_LEFT, BANNER_HEIGHT - 10, {
              width: CONTENT_WIDTH,
              align: 'right',
            });

          // --- RULE ---
          doc
            .moveTo(PAGE_LEFT, BANNER_HEIGHT)
            .lineTo(PAGE_RIGHT, BANNER_HEIGHT)
            .lineWidth(1)
            .strokeColor(COLORS.black)
            .stroke();
        };

        drawBanner();
        doc.on('pageAdded', drawBanner);

        let y = BANNER_HEIGHT + 22;

        // ═══════════════════════════════════════════════════════
        // TABLE
        // ═══════════════════════════════════════════════════════
        const columns = [
          { label: 'NO.', width: 34, align: 'center' },
          { label: 'EMPLOYEE NAME', width: 168, align: 'left' },
          { label: 'LOAN TYPE', width: 148, align: 'left' },
          { label: 'AMOUNT', width: 90, align: 'right' },
          { label: 'REGION', width: CONTENT_WIDTH - 34 - 168 - 148 - 90, align: 'left' },
        ];
        const tableLeft = PAGE_LEFT;
        const tableWidth = CONTENT_WIDTH;
        const rowHeight = 20;
        const headerHeight = 22;

        const drawTableHeader = (topY) => {
          let x = tableLeft;
          columns.forEach((col) => {
            doc
              .font('Helvetica-Bold')
              .fontSize(7.5)
              .fillColor(COLORS.black)
              .text(col.label, x + 8, topY + 7, {
                width: col.width - 12,
                align: col.align || 'left',
                characterSpacing: 0.3,
              });
            x += col.width;
          });
          doc
            .moveTo(tableLeft, topY + headerHeight)
            .lineTo(tableLeft + tableWidth, topY + headerHeight)
            .lineWidth(1)
            .strokeColor(COLORS.black)
            .stroke();
        };

        let tableY = y;
        drawTableHeader(tableY);
        tableY += headerHeight;

        // Only the footer needs to be reserved on every page — the summary
        // and signature blocks below the loop already have their own
        // "does this fit, otherwise addPage()" checks, so they don't need
        // to steal room from every table page up front.
        // Measure from where rows actually start (banner + gap + header row),
        // not just BANNER_HEIGHT, or the last row ends up landing on the footer.
        const TABLE_TOP = BANNER_HEIGHT + 22 + headerHeight;
        const FOOTER_RESERVE = 35;
        const maxRowsPerPage = Math.floor((PAGE_HEIGHT - TABLE_TOP - FOOTER_RESERVE) / rowHeight);

        let rowIndex = 0;
        for (const loan of loans) {
          if (rowIndex > 0 && rowIndex % maxRowsPerPage === 0) {
            doc.addPage();
            tableY = BANNER_HEIGHT + 22;
            drawTableHeader(tableY);
            tableY += headerHeight;
          }

          const bgColor = rowIndex % 2 === 0 ? COLORS.panel : COLORS.white;
          doc.rect(tableLeft, tableY, tableWidth, rowHeight).fill(bgColor);

          const rowData = [
            (rowIndex + 1).toString(),
            `${loan.lastname || ''}, ${loan.firstname || ''}`.trim(),
            loan.loantype || '',
            formatCurrency(loan.loanamount),
            loan.region || '',
          ];

          let x = tableLeft;
          rowData.forEach((text, colIdx) => {
            const col = columns[colIdx];
            doc
              .font(colIdx === 3 ? REGULAR_FONT : 'Helvetica')
              .fontSize(8)
              .fillColor(COLORS.black)
              .text(text, x + 8, tableY + 5, {
                width: col.width - 12,
                align: col.align || 'left',
              });
            x += col.width;
          });

          doc
            .moveTo(tableLeft, tableY + rowHeight)
            .lineTo(tableLeft + tableWidth, tableY + rowHeight)
            .lineWidth(0.5)
            .strokeColor(COLORS.border)
            .stroke();

          tableY += rowHeight;
          rowIndex++;
        }

        // outer border around table
        doc
          .rect(tableLeft, y, tableWidth, tableY - y)
          .lineWidth(0.75)
          .strokeColor(COLORS.borderStrong)
          .stroke();

        // ═══════════════════════════════════════════════════════
        // SUMMARY
        // ═══════════════════════════════════════════════════════
        let summaryY = tableY + 20;

        const summaryMap = {};
        loans.forEach((loan) => {
          const type = loan.loantype || 'Unknown';
          summaryMap[type] = (summaryMap[type] || 0) + 1;
        });
        const summaryKeys = Object.keys(summaryMap);
        const summaryRows = Math.ceil(summaryKeys.length / 3) || 1;
        const estSummaryHeight = 34 + summaryRows * 16 + 20;

        if (summaryY + estSummaryHeight > PAGE_HEIGHT - 130) {
          doc.addPage();
          summaryY = BANNER_HEIGHT + 22;
        }

        doc.rect(PAGE_LEFT, summaryY, 3, 12).fill(COLORS.black);
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor(COLORS.black)
          .text('LOAN SUMMARY', PAGE_LEFT + 10, summaryY, { characterSpacing: 0.3 });
        summaryY += 22;

        // Total loans — single stat, border only (no fill)
        const statCardH = 34;
        doc
          .roundedRect(PAGE_LEFT, summaryY, CONTENT_WIDTH, statCardH, 4)
          .lineWidth(0.75)
          .strokeColor(COLORS.border)
          .stroke();
        doc
          .font('Helvetica-Bold')
          .fontSize(7)
          .fillColor(COLORS.muted)
          .text('TOTAL LOANS', PAGE_LEFT + 12, summaryY + 8, { characterSpacing: 0.4 });
        doc
          .font(BOLD_FONT)
          .fontSize(14)
          .fillColor(COLORS.black)
          .text(String(loans.length), PAGE_LEFT + 12, summaryY + 17);

        summaryY += statCardH + 14;

        // breakdown by loan type, 3-per-row chip list
        const chipGap = 8;
        const chipW = (CONTENT_WIDTH - chipGap * 2) / 3;
        let chipX = PAGE_LEFT;
        let col = 0;
        summaryKeys.forEach((key) => {
          doc
            .roundedRect(chipX, summaryY, chipW, 22, 3)
            .lineWidth(0.75)
            .strokeColor(COLORS.border)
            .stroke();
          doc
            .font('Helvetica')
            .fontSize(7.5)
            .fillColor(COLORS.muted)
            .text(key, chipX + 8, summaryY + 4, { width: chipW - 40 });
          doc
            .font('Helvetica-Bold')
            .fontSize(9)
            .fillColor(COLORS.black)
            .text(String(summaryMap[key]), chipX, summaryY + 5, {
              width: chipW - 8,
              align: 'right',
            });

          col++;
          if (col === 3) {
            col = 0;
            chipX = PAGE_LEFT;
            summaryY += 22 + 6;
          } else {
            chipX += chipW + chipGap;
          }
        });
        if (col !== 0) summaryY += 22 + 6;

        // ═══════════════════════════════════════════════════════
        // SIGNATORIES
        // ═══════════════════════════════════════════════════════
        let sigY = summaryY + 14;
        if (sigY > PAGE_HEIGHT - 130) {
          doc.addPage();
          sigY = BANNER_HEIGHT + 30;
        }

        doc
          .moveTo(PAGE_LEFT, sigY)
          .lineTo(PAGE_RIGHT, sigY)
          .lineWidth(0.75)
          .strokeColor(COLORS.border)
          .stroke();
        sigY += 22;

        const sigColWidth = 220;
        const gap = 40;
        const sigLeftX = PAGE_LEFT;
        const sigRightX = PAGE_LEFT + sigColWidth + gap;

        // One consistent signature-line style for all three rows.
        // Verified by / Received by use grey; Prepared by uses black.
        // showLine draws the blank underline — skip it when the value is
        // already printed (e.g. Prepared by / Date), only show it when
        // the field is left empty for a manual signature.
        const sigLine = (x, label, color = COLORS.muted, showLine = true) => {
          doc
            .font('Helvetica-Bold')
            .fontSize(8)
            .fillColor(color)
            .text(label.toUpperCase(), x, sigY, { width: sigColWidth, characterSpacing: 0.4 });
          if (showLine) {
            doc
              .moveTo(x, sigY + 22)
              .lineTo(x + sigColWidth - 40, sigY + 22)
              .lineWidth(0.75)
              .strokeColor(COLORS.borderStrong)
              .stroke();
          }
        };

        sigLine(sigLeftX, 'Verified by', COLORS.muted);
        sigLine(sigRightX, 'Date', COLORS.muted);
        sigY += 40;

        sigLine(sigLeftX, 'Received by', COLORS.muted);
        sigLine(sigRightX, 'Date', COLORS.muted);
        sigY += 40;

        const preparedName = userInfo.preparedBy || 'Unknown';
        const preparedDate = userInfo.date ? formatDate(userInfo.date) : formatDate(new Date());
        sigLine(sigLeftX, 'Prepared by', COLORS.black, false);
        sigLine(sigRightX, 'Date', COLORS.black, false);
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor(COLORS.black)
          .text(preparedName, sigLeftX, sigY + 14, { width: sigColWidth })
          .text(preparedDate, sigRightX, sigY + 14, { width: sigColWidth });

        // ═══════════════════════════════════════════════════════
        // PAGE FOOTER
        // ═══════════════════════════════════════════════════════
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
          doc.switchToPage(i);
          const pageNum = i + 1;
          const totalPages = pages.count;
          const now = new Date();
          const dateTime = now.toLocaleString('en-PH', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          });
          // Keep the footer inside the page's writable area (PAGE_HEIGHT - MARGIN)
          // or PDFKit's auto page-break logic silently spawns a blank trailing page.
          const footerLineY = PAGE_HEIGHT - 20;
          const footerTextY = footerLineY + 4;
          doc
            .moveTo(PAGE_LEFT, footerLineY)
            .lineTo(PAGE_RIGHT, footerLineY)
            .lineWidth(0.5)
            .strokeColor(COLORS.border)
            .stroke();
          doc
            .font('Helvetica')
            .fontSize(7)
            .fillColor(COLORS.muted)
            .text(`Page ${pageNum} of ${totalPages}`, PAGE_LEFT, footerTextY, {
              width: CONTENT_WIDTH / 2,
              align: 'left',
            });
          doc
            .font('Helvetica')
            .fontSize(7)
            .fillColor(COLORS.muted)
            .text(dateTime, PAGE_LEFT + CONTENT_WIDTH / 2, footerTextY, {
              width: CONTENT_WIDTH / 2,
              align: 'right',
            });
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = new PDFService();
