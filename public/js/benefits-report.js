document.addEventListener('DOMContentLoaded', function () {
  flatpickr('#dateRange', {
    mode: 'range',
    dateFormat: 'Y-m-d',
    allowInput: true,
  });

  document.getElementById('benefitsReportsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    generateReport();
  });

  document.getElementById('resetBtn').addEventListener('click', function () {
    document.getElementById('benefitsReportsForm').reset();
    document.getElementById('regionSelect').innerHTML =
      '<option value="" selected>All Regions</option>';
    document.getElementById('error-message').style.display = 'none';
  });
});

// ── REGION LOADER ────────────────────────────────────────────────────────────
document.getElementById('officeSelect').addEventListener('change', async function () {
  const office = this.value;
  const regionSelect = document.getElementById('regionSelect');

  if (!office) {
    regionSelect.innerHTML = '<option value="" selected>All Regions</option>';
    return;
  }

  try {
    regionSelect.disabled = true;
    regionSelect.innerHTML = '<option value="">Loading regions...</option>';

    const response = await fetch(`/benefits/reports/regions?office=${encodeURIComponent(office)}`);
    const data = await response.json();

    if (data.success) {
      regionSelect.innerHTML = '<option value="" selected>All Regions</option>';
      data.regions.forEach((region) => {
        const option = document.createElement('option');
        option.value = region.region_name;
        option.textContent = region.region_name;
        regionSelect.appendChild(option);
      });
    } else {
      showError(data.message || 'Failed to load regions');
    }
  } catch (error) {
    console.error(error);
    showError('Failed to load regions');
  } finally {
    regionSelect.disabled = false;
  }
});

// ── DATE PARSER ──────────────────────────────────────────────────────────────
function getDates(dateRange) {
  if (!dateRange) return { startDate: null, endDate: null };

  let startDate, endDate;

  if (dateRange.includes(' to ')) {
    [startDate, endDate] = dateRange.split(' to ');
  } else {
    startDate = endDate = dateRange;
  }

  return {
    startDate: startDate,
    endDate: endDate,
  };
}

// ── MAIN GENERATOR ───────────────────────────────────────────────────────────
async function generateReport() {
  const form = document.getElementById('benefitsReportsForm');
  const regionSelectEl = document.getElementById('regionSelect');
  const reportTypeEl = document.getElementById('reportType');
  const selectedOffice = document.getElementById('officeSelect').value;

  const dateRange = document.getElementById('dateRange').value;
  const { startDate, endDate } = getDates(dateRange);

  if (!startDate || !endDate) return showError('Invalid date range');
  if (!selectedOffice) return showError('Select office');
  if (!reportTypeEl.value) return showError('Select report type');

  const formDataObj = {};
  new FormData(form).forEach((v, k) => (formDataObj[k] = v));
  formDataObj.startDate = startDate;
  formDataObj.endDate = endDate;

  document.getElementById('report-loading').style.display = 'block';
  document.getElementById('error-message').style.display = 'none';

  try {
    const response = await fetch('/benefits/reports/generate-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formDataObj),
    });

    const data = await response.json();

    if (!data.success || !data.results.length) {
      return showError('No data found');
    }

    // Comparison types → render table instead of Excel
    if (data.isComparison) {
      renderComparisonTable(data.results, data.reportType, data.previousEndDate);
      renderComparisonSummary(data.summary || []);

      return;
    }

    const type = reportTypeEl.value.toLowerCase().trim();
    const region = regionSelectEl.value;

    if (type === 'sss contribution') {
      generateSSSContributionExcel(data.results, selectedOffice, region, endDate);
    } else if (type === 'pagibig contribution') {
      generatePagibigContributionExcel(data.results, selectedOffice, region, endDate);
    } else if (type === 'pagibig contribution final') {
      generatePagibigContributionFinalExcel(data.results, selectedOffice, region, endDate);
    } else if (type === 'philhealth contribution') {
      generatePhilhealthContributionExcel(data.results, selectedOffice, region, endDate);
    } else if (type === 'sss loan') {
      generateSSSLoanExcel(data.results, selectedOffice, region, endDate);
    } else if (type === 'pagibig loan') {
      generatePagibigLoanExcel(data.results, selectedOffice, region, endDate);
    } else {
      showError('No generator for this report type');
    }
  } catch (err) {
    showError(err.message);
  } finally {
    document.getElementById('report-loading').style.display = 'none';
  }
}

// ── HELPERS ────────────────────────────────────────────────────────────────
function groupByRegion(results) {
  const grouped = {};
  results.forEach((e) => {
    const key = (e.region || 'UNKNOWN').toUpperCase();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  });
  return grouped;
}

function safeSheetName(name) {
  return name.substring(0, 31).replace(/[\\/*?:[\]]/g, '');
}

function buildFileName(report, office, region, date) {
  return `${report} ${office} ${region || 'ALL'} ${date}.xlsx`;
}

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(
    2,
    '0',
  )}/${d.getFullYear()}`;
}

function applyNumericFormat(ws, cols) {
  Object.keys(ws).forEach((k) => {
    if (k[0] === '!') return;
    const c = XLSX.utils.decode_cell(k).c;
    if (cols.includes(c) && typeof ws[k].v === 'number') {
      ws[k].t = 'n';
      ws[k].z = '#,##0.00';
    }
  });
}

const PAGIBIG_ER = 200;

// ── SSS CONTRIBUTION ───────────────────────────────────────────────────────
function generateSSSContributionExcel(results, office, region, endDate) {
  const wb = XLSX.utils.book_new();
  const grouped = groupByRegion(results);

  Object.keys(grouped).forEach((reg) => {
    const wsData = [
      ['SSS CONTRIBUTION'],
      [`${reg} - ${endDate}`],
      ['DIVISION/AREA', 'IDNO', 'LAST NAME', 'FIRST NAME', 'M.I.', 'ER', 'EE', 'TOTAL'],
      [],
    ];

    let er = 0,
      ee = 0;

    grouped[reg].forEach((e) => {
      const s = parseFloat(e.ssser) || 0;
      const e2 = parseFloat(e.sssee) || 0;
      er += s;
      ee += e2;

      wsData.push([e.department, e.idno, e.lastname, e.firstname, e.middlename, s, e2, s + e2]);
    });

    //wsData.push(["", "", "", "TOTAL", "", er, ee, er + ee]);
    wsData.push([`Employees:`, `${grouped[reg].length}`, '', 'TOTAL', '', er, ee, er + ee]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    applyNumericFormat(ws, [5, 6, 7]);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(reg));
  });

  XLSX.writeFile(wb, buildFileName('SSS Contribution', office, region, endDate));
}

// ── PAGIBIG CONTRIBUTION ───────────────────────────────────────────────────
function generatePagibigContributionExcel(results, office, region, endDate) {
  const wb = XLSX.utils.book_new();
  const grouped = groupByRegion(results);

  Object.keys(grouped).forEach((reg) => {
    const wsData = [
      ['PAGIBIG CONTRIBUTION'],
      [`${reg} - ${endDate}`],
      ['DIVISION/AREA', 'IDNO', 'LAST NAME', 'FIRST NAME', 'M.I.', 'ER', 'EE', 'TOTAL'],
      [],
    ];

    let er = 0,
      ee = 0;

    grouped[reg].forEach((e) => {
      const eeVal = parseFloat(e.pagibigcontri) || 0;
      er += PAGIBIG_ER;
      ee += eeVal;

      wsData.push([
        e.department,
        e.idno,
        e.lastname,
        e.firstname,
        e.middlename,
        PAGIBIG_ER,
        eeVal,
        PAGIBIG_ER + eeVal,
      ]);
    });

    //wsData.push(["", "", "", "TOTAL", "", er, ee, er + ee]);
    wsData.push([`Employees:`, `${grouped[reg].length}`, '', 'TOTAL', '', er, ee, er + ee]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    applyNumericFormat(ws, [5, 6, 7]);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(reg));
  });

  XLSX.writeFile(wb, buildFileName('Pagibig Contribution', office, region, endDate));
}

// ── PAGIBIG FINAL ───────────────────────────────────────────────────────────
function generatePagibigContributionFinalExcel(results, office, region, endDate) {
  const wb = XLSX.utils.book_new();
  const grouped = groupByRegion(results);

  Object.keys(grouped).forEach((reg) => {
    const wsData = [
      ['PAGIBIG CONTRIBUTION'],
      [`${reg} - ${endDate}`],
      [
        'DIVISION/AREA',
        'IDNO',
        'LAST NAME',
        'FIRST NAME',
        'M.I.',
        'ER',
        'EE',
        'TOTAL',
        'PAGIBIG NO.',
        'BIRTH DATE',
      ],
      [],
    ];

    grouped[reg].forEach((e) => {
      const ee = parseFloat(e.pagibigcontri) || 0;

      wsData.push([
        e.department,
        e.idno,
        e.lastname,
        e.firstname,
        e.middlename,
        PAGIBIG_ER,
        ee,
        PAGIBIG_ER + ee,
        e.pagibigno || '',
        formatDate(e.birthdate),
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    applyNumericFormat(ws, [5, 6, 7]);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(reg));
  });

  XLSX.writeFile(wb, buildFileName('Pagibig Final', office, region, endDate));
}

// ── PHILHEALTH ──────────────────────────────────────────────────────────────
function generatePhilhealthContributionExcel(results, office, region, endDate) {
  const wb = XLSX.utils.book_new();
  const grouped = groupByRegion(results);

  Object.keys(grouped).forEach((reg) => {
    const wsData = [
      ['PHILHEALTH CONTRIBUTION'],
      [`${reg} - ${endDate}`],
      ['DIVISION/AREA', 'IDNO', 'LAST NAME', 'FIRST NAME', 'M.I.', 'ER', 'EE', 'TOTAL'],
      [],
    ];

    let er = 0,
      ee = 0;

    grouped[reg].forEach((e) => {
      const ph = parseFloat(e.philhealth) || 0;
      er += ph;
      ee += ph;

      wsData.push([e.department, e.idno, e.lastname, e.firstname, e.middlename, ph, ph, ph * 2]);
    });

    wsData.push([`Employees:`, `${grouped[reg].length}`, , '', 'TOTAL', er, ee, er + ee]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    applyNumericFormat(ws, [5, 6, 7]);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(reg));
  });

  XLSX.writeFile(wb, buildFileName('Philhealth', office, region, endDate));
}

// ── SSS LOAN ───────────────────────────────────────────────────────────────
function generateSSSLoanExcel(results, office, region, endDate) {
  const wb = XLSX.utils.book_new();
  const grouped = groupByRegion(results);

  Object.keys(grouped).forEach((reg) => {
    const wsData = [
      ['SSS LOAN'],
      [`${reg} - ${endDate}`],
      ['DIVISION/AREA', 'IDNO', 'LAST NAME', 'FIRST NAME', 'M.I.', 'AMOUNT'],
      [],
    ];

    let total = 0;

    grouped[reg].forEach((e) => {
      const amt = parseFloat(e.sssloan) || 0;
      total += amt;

      wsData.push([e.department, e.idno, e.lastname, e.firstname, e.middlename, amt]);
    });

    wsData.push([`Employees:`, `${grouped[reg].length}`, '', 'TOTAL', '', total]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    applyNumericFormat(ws, [5]);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(reg));
  });

  XLSX.writeFile(wb, buildFileName('SSS Loan', office, region, endDate));
}

// ── PAGIBIG LOAN ───────────────────────────────────────────────────────────
function generatePagibigLoanExcel(results, office, region, endDate) {
  const wb = XLSX.utils.book_new();
  const grouped = groupByRegion(results);

  Object.keys(grouped).forEach((reg) => {
    const wsData = [
      ['PAGIBIG LOAN'],
      [`${reg} - ${endDate}`],
      ['DIVISION/AREA', 'IDNO', 'LAST NAME', 'FIRST NAME', 'M.I.', 'AMOUNT'],
      [],
    ];

    let total = 0;

    grouped[reg].forEach((e) => {
      const amt = parseFloat(e.pagibigloan) || 0;
      total += amt;

      wsData.push([e.department, e.idno, e.lastname, e.firstname, e.middlename, amt]);
    });

    wsData.push([`Employees:`, `${grouped[reg].length}`, '', 'TOTAL', '', total]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    applyNumericFormat(ws, [5]);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(reg));
  });

  XLSX.writeFile(wb, buildFileName('Pagibig Loan', office, region, endDate));
}

// ── ERROR ────────────────────────────────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById('error-message');
  el.textContent = msg;
  el.style.display = 'block';
}

// ── COMPARISON TABLE ─────────────────────────────────────────────────────────
let allComparisonResults = [];
let comparisonPage = 1;
const COMP_PAGE_SIZE = 25;

function renderComparisonTable(results, reportType, previousEndDate) {
  allComparisonResults = results;
  comparisonPage = 1;

  const type = (reportType || '').toLowerCase().trim();
  const benefitIdLabel = type.includes('sss')
    ? 'SSS ID No'
    : type.includes('pagibig')
      ? 'Pagibig ID No'
      : type.includes('philhealth')
        ? 'Philhealth ID No'
        : 'Benefit ID No';

  const headers = [
    benefitIdLabel,
    'ID No',
    'Last Name',
    'First Name',
    'Middle Name',
    'Current EE',
    'Current ER',
    'Current Total',
    'Current Payroll Date', // ← moved here
    'Previous Payroll Date',
    'Previous EE',
    'Previous ER',
    'Previous Total',
  ];

  // Show comparison result card
  let container = document.getElementById('comparison-results-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'comparison-results-container';
    container.className = 'card mt-4';
    container.innerHTML = `
      <div class="card-header d-flex justify-content-between align-items-center">
        <span id="comp-title">Comparison Results</span>
        <span id="comp-record-count" class="text-muted small"></span>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-bordered mb-0" id="comparisonTable">
            <thead class="table-dark sticky-top">
              <tr id="comp-headers"></tr>
            </thead>
            <tbody id="comparisonTableBody"></tbody>
          </table>
        </div>
      </div>
      <div class="card-footer d-flex justify-content-between align-items-center">
        <span id="comp-pagination-info" class="text-muted small"></span>
        <nav><ul class="pagination pagination-sm mb-0" id="comp-pagination-controls"></ul></nav>
      </div>
    `;
    document.querySelector('.main-content').appendChild(container);
  }

  // Inject headers
  document.getElementById('comp-headers').innerHTML = headers.map((h) => `<th>${h}</th>`).join('');

  document.getElementById('comp-title').textContent = reportType;
  document.getElementById('comp-record-count').textContent = `${results.length} record(s) found`;

  // Add CSS for green highlight and red row if not already added
  if (!document.getElementById('comp-highlight-style')) {
    const style = document.createElement('style');
    style.id = 'comp-highlight-style';
    style.textContent = `
  #comparisonTable tbody td.changed-cell {
    background-color: #198754 !important;
    color: #000000 !important;
    font-weight: 600;
  }
  #comparisonTable tbody tr.no-current-payroll td {
    color: #dc3545 !important;
    font-weight: 600;
  }
  #comparisonTable tbody tr.has-current-only td {
    font-weight: 700;
  }
  #comparisonTable tbody tr.has-current-only td.curr-total-highlight {
    background-color: #d1e7dd !important;
  }
`;
    document.head.appendChild(style);
  }

  container.style.display = 'block';
  renderComparisonPage(comparisonPage, reportType);
  renderComparisonPagination(reportType);
}

function renderComparisonPage(page, reportType) {
  const tbody = document.getElementById('comparisonTableBody');
  tbody.innerHTML = '';

  if (!allComparisonResults.length) {
    tbody.innerHTML = `<tr><td colspan="12" class="text-center text-muted">No records found.</td></tr>`;
    return;
  }

  const type = (reportType || '').toLowerCase().trim();
  const start = (page - 1) * COMP_PAGE_SIZE;
  const end = start + COMP_PAGE_SIZE;
  const pageData = allComparisonResults.slice(start, end);

  const fmt = (n) => (n > 0 ? n.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '');

  // Render current page rows
  pageData.forEach((row) => {
    console.log('row row ', row);
    const hasPrev = !!row.prev_payroll_date;
    const hasCurr = !!row.curr_payroll_date;

    let prevEE, prevER, currEE, currER;

    if (type.includes('sss')) {
      prevEE = hasPrev ? parseFloat(row.prev_ee) || 0 : 0;
      prevER = hasPrev ? parseFloat(row.prev_er) || 0 : 0;
      currEE = hasCurr ? parseFloat(row.curr_ee) || 0 : 0;
      currER = hasCurr ? parseFloat(row.curr_er) || 0 : 0;
    } else if (type.includes('pagibig')) {
      prevEE = hasPrev ? parseFloat(row.prev_ee) || 0 : 0;
      prevER = hasPrev ? 200 : 0;
      currEE = hasCurr ? parseFloat(row.curr_ee) || 0 : 0;
      currER = hasCurr ? 200 : 0;
    } else {
      prevEE = hasPrev ? parseFloat(row.prev_ee) || 0 : 0;
      prevER = prevEE;
      currEE = hasCurr ? parseFloat(row.curr_ee) || 0 : 0;
      currER = currEE;
    }

    // Green highlight on Curr Total only when amounts changed between periods
    // AFTER (replace with these):
    const prevLastname = (row.prev_lastname || '').trim().toUpperCase();
    const currLastname = (row.curr_lastname || '').trim().toUpperCase();

    const lastnameChanged = hasPrev && hasCurr && prevLastname !== currLastname;
    const contribChanged = hasPrev && hasCurr && (prevEE !== currEE || prevER !== currER);

    const noCurrClass = !hasCurr ? 'no-current-payroll' : '';
    const currOnlyClass = hasCurr && !hasPrev ? 'has-current-only' : '';
    const totalCellClass = contribChanged ? 'changed-cell' : '';

    tbody.innerHTML += `
    <tr class="${noCurrClass} ${currOnlyClass}">
    <td>${row.benefit_number || ''}</td>
    <td>${row.idno || ''}</td>
    <td class="${lastnameChanged ? 'lastname-changed' : ''}">
  ${row.lastname || ''}
</td>
    <td>${row.firstname || ''}</td>
    <td>${row.middlename || ''}</td>

    <td>${fmt(currEE)}</td>
    <td>${fmt(currER)}</td>
    <td class="${totalCellClass} ${currOnlyClass ? 'curr-total-highlight' : ''}">${fmt(currEE + currER)}</td>
    <td>${formatDate(row.curr_payroll_date)}</td>

    <td>${formatDate(row.prev_payroll_date)}</td>
    <td>${fmt(prevEE)}</td>
    <td>${fmt(prevER)}</td>
    <td>${fmt(prevEE + prevER)}</td>
  </tr>
`;
  });

  const end1 = Math.min(end, allComparisonResults.length);
  document.getElementById('comp-pagination-info').textContent =
    `Showing ${start + 1}–${end1} of ${allComparisonResults.length}`;

  // // Make all cells clickable
  // document.querySelectorAll('#comparisonTable tbody td').forEach((td) => {
  //   td.addEventListener('click', function () {
  //     selectCell(this);
  //   });
  // });
  // Replace the click handler inside renderComparisonPage
  // Look for this section:
  // document.querySelectorAll('#comparisonTable tbody td').forEach((td) => {
  //   td.addEventListener('click', function () {
  //     selectCell(this);
  //   });
  // });

  // Replace with:
  document.querySelectorAll('#comparisonTable tbody tr').forEach((row) => {
    row.addEventListener('click', function () {
      selectRow(this);
    });
  });
}

let selectedRow = null;

function selectRow(row) {
  // Remove previous selection
  if (selectedRow) {
    selectedRow.classList.remove('selected-row');
  }

  // Toggle off if same row clicked
  if (selectedRow === row) {
    selectedRow = null;
    return;
  }

  row.classList.add('selected-row');
  selectedRow = row;
}

function renderComparisonPagination(reportType) {
  const totalPages = Math.ceil(allComparisonResults.length / COMP_PAGE_SIZE);
  const controls = document.getElementById('comp-pagination-controls');
  controls.innerHTML = '';

  if (totalPages <= 1) return;

  controls.innerHTML += `
    <li class="page-item ${comparisonPage === 1 ? 'disabled' : ''}">
      <a class="page-link" href="#" onclick="changeComparisonPage(${comparisonPage - 1}, '${reportType}'); return false;">&laquo;</a>
    </li>`;

  const winSize = 2;
  const startPage = Math.max(1, comparisonPage - winSize);
  const endPage = Math.min(totalPages, comparisonPage + winSize);

  if (startPage > 1) {
    controls.innerHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changeComparisonPage(1, '${reportType}'); return false;">1</a></li>`;
    if (startPage > 2)
      controls.innerHTML += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    controls.innerHTML += `
      <li class="page-item ${i === comparisonPage ? 'active' : ''}">
        <a class="page-link" href="#" onclick="changeComparisonPage(${i}, '${reportType}'); return false;">${i}</a>
      </li>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1)
      controls.innerHTML += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
    controls.innerHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changeComparisonPage(${totalPages}, '${reportType}'); return false;">${totalPages}</a></li>`;
  }

  controls.innerHTML += `
    <li class="page-item ${comparisonPage === totalPages ? 'disabled' : ''}">
      <a class="page-link" href="#" onclick="changeComparisonPage(${comparisonPage + 1}, '${reportType}'); return false;">&raquo;</a>
    </li>`;
}

function changeComparisonPage(page, reportType) {
  const totalPages = Math.ceil(allComparisonResults.length / COMP_PAGE_SIZE);
  if (page < 1 || page > totalPages) return;

  comparisonPage = page;
  renderComparisonPage(comparisonPage, reportType);
  renderComparisonPagination(reportType);
  document.querySelector('#comparison-results-container .table-responsive').scrollTop = 0;
}

function renderComparisonSummary(summary) {
  let card = document.getElementById('comparison-summary');
  if (!card) {
    card = document.createElement('div');
    card.id = 'comparison-summary';
    card.className = 'card mt-3';
    document.querySelector('#comparison-results-container').after(card);
  }
  const fmt = (v) => Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 });
  card.innerHTML = ` <div class="card-header"> Contribution Summary </div> <div class="card-body"> <div class="table-responsive"> <table class="table table-bordered"> <thead class="table-light"> <tr> <th>Month Year</th> <th>No. of Employees</th> <th>Employee Share</th> <th>Employer Share</th> <th>Total</th> </tr> </thead> <tbody> ${summary
    .map(
      (r) => ` <tr> <td>
  ${new Date(r.month).toLocaleDateString('en-PH', {
    month: 'long',
    year: 'numeric',
  })}
</td> <td> ${r.employeeCount.toLocaleString()} </td> <td> ${fmt(r.employeeShare)} </td> <td> ${fmt(r.employerShare)} </td> <td> ${fmt(r.total)} </td> </tr> `,
    )
    .join('')} </tbody> </table> </div> </div> `;
}

let selectedCell = null;

function selectCell(cell) {
  // Remove previous selection
  if (selectedCell) {
    selectedCell.classList.remove('selected-cell');
  }

  // Toggle off if same cell clicked
  if (selectedCell === cell) {
    selectedCell = null;
    return;
  }

  cell.classList.add('selected-cell');
  selectedCell = cell;
}
