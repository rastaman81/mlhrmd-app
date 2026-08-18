document.addEventListener("DOMContentLoaded", function () {
  flatpickr("#dateRange", {
    mode: "range",
    dateFormat: "Y-m-d",
    allowInput: true,
  });

  document
    .getElementById("benefitsEmployeeMovementForm")
    .addEventListener("submit", function (e) {
      e.preventDefault();
      loadEmployeeMovement();
    });

  document.getElementById("resetBtn").addEventListener("click", function () {
    location.reload();
  });
});

function getDates(dateRange) {
  if (!dateRange)
    return {
      startDate: null,
      endDate: null,
    };

  let startDate;
  let endDate;

  if (dateRange.includes(" to ")) {
    [startDate, endDate] = dateRange.split(" to ");
  } else {
    startDate = endDate = dateRange;
  }

  return {
    startDate,
    endDate,
  };
}

async function loadEmployeeMovement() {
  const office = document.getElementById("officeSelect").value;

  const dateRange = document.getElementById("dateRange").value;

  const { endDate } = getDates(dateRange);

  if (!office) return showError("Please select office");

  if (!endDate) return showError("Please select date");

  document.getElementById("report-loading").style.display = "block";

  try {
    const response = await fetch("/benefits/employee-movement/view", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        office,
        endDate,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      showError(data.message);
      return;
    }

    renderTable(data.results);
  } catch (error) {
    showError(error.message);
  } finally {
    document.getElementById("report-loading").style.display = "none";
  }
}

function renderTable(results) {
  const tbody = document.getElementById("movementTableBody");

  tbody.innerHTML = "";

  if (!results || results.length === 0) {
    tbody.innerHTML = `
  <tr>
    <td colspan="8" class="text-center text-muted">No records found.</td>
  </tr>
`;
    document.getElementById("results-container").style.display = "block";
    return;
  }

  results.forEach((row) => {
    const previousRegionDisplay =
      !row.previous_payroll_date && !row.previous_region
        ? "NEW EMPLOYEE/NO PAYROLL"
        : row.previous_region || "";

    tbody.innerHTML += `
      <tr>
        <td>${row.idno}</td>
        <td>${row.lastname}, ${row.firstname}</td>
        <td>${formatDate(row.datehired) || ""}</td>
        <td>${formatDate(row.previous_payroll_date) || ""}</td>
        <td>${previousRegionDisplay}</td>
        <td>${formatDate(row.current_payroll_date) || ""}</td>
        <td>${row.current_region || ""}</td>
      </tr>
    `;
  });

  document.getElementById("results-container").style.display = "block";
}

function showError(message) {
  const el = document.getElementById("error-message");

  el.textContent = message;
  el.style.display = "block";
}

let allResults = [];
let currentPage = 1;
const PAGE_SIZE = 50;

function renderTable(results) {
  allResults = results;
  currentPage = 1;

  const recordCount = document.getElementById("record-count");
  recordCount.textContent = `${results.length} record(s) found`;

  document.getElementById("results-container").style.display = "block";

  renderPage(currentPage);
  renderPagination();
}

function renderPage(page) {
  const tbody = document.getElementById("movementTableBody");
  tbody.innerHTML = "";

  if (!allResults || allResults.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted">No records found.</td>
      </tr>
    `;
    return;
  }

  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageData = allResults.slice(start, end);

  pageData.forEach((row) => {
    const isNewEmployee = !row.previous_payroll_date && !row.previous_region;
    const isRegionTransfer =
      row.previous_region &&
      row.current_region &&
      row.previous_region !== row.current_region;

    tbody.innerHTML += `
    <tr class="${isRegionTransfer ? "table-danger text-white" : ""}">
      <td>${row.idno}</td>
      <td>${row.lastname}, ${row.firstname}</td>
      <td>${formatDate(row.datehired) || ""}</td>
      <td>${formatDate(row.previous_payroll_date) || ""}</td>
      <td>${row.previous_region || ""}</td>
      <td>${formatDate(row.current_payroll_date) || ""}</td>
      <td>${row.current_region || ""}</td>
      <td>${isNewEmployee ? "NEW EMPLOYEE/NO PREVIOUS PAYROLL" : isRegionTransfer ? "REGION TRANSFER" : ""}</td>
    </tr>
  `;
  });

  const start1 = start + 1;
  const end1 = Math.min(end, allResults.length);
  document.getElementById("pagination-info").textContent =
    `Showing ${start1}–${end1} of ${allResults.length}`;
}

function renderPagination() {
  const totalPages = Math.ceil(allResults.length / PAGE_SIZE);
  const controls = document.getElementById("pagination-controls");
  controls.innerHTML = "";

  if (totalPages <= 1) return;

  // Prev
  controls.innerHTML += `
    <li class="page-item ${currentPage === 1 ? "disabled" : ""}">
      <a class="page-link" href="#" onclick="changePage(${currentPage - 1}); return false;">
        &laquo;
      </a>
    </li>
  `;

  // Page numbers (show window of 5 around current)
  const window = 2;
  const startPage = Math.max(1, currentPage - window);
  const endPage = Math.min(totalPages, currentPage + window);

  if (startPage > 1) {
    controls.innerHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(1); return false;">1</a></li>`;
    if (startPage > 2)
      controls.innerHTML += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    controls.innerHTML += `
      <li class="page-item ${i === currentPage ? "active" : ""}">
        <a class="page-link" href="#" onclick="changePage(${i}); return false;">${i}</a>
      </li>
    `;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1)
      controls.innerHTML += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
    controls.innerHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${totalPages}); return false;">${totalPages}</a></li>`;
  }

  // Next
  controls.innerHTML += `
    <li class="page-item ${currentPage === totalPages ? "disabled" : ""}">
      <a class="page-link" href="#" onclick="changePage(${currentPage + 1}); return false;">
        &raquo;
      </a>
    </li>
  `;
}

function changePage(page) {
  const totalPages = Math.ceil(allResults.length / PAGE_SIZE);
  if (page < 1 || page > totalPages) return;

  currentPage = page;
  renderPage(currentPage);
  renderPagination();

  // Scroll table back to top on page change
  document.querySelector(".table-responsive").scrollTop = 0;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
}
