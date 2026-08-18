document.addEventListener('DOMContentLoaded', () => {
  // ─────────────────────────────────────────────
  // Element refs
  // ─────────────────────────────────────────────
  const officeSelect = document.getElementById('officeSelect');
  const btnSearchEmployee = document.getElementById('btnSearchEmployee');

  const employeeModalEl = document.getElementById('employeeModal');
  const employeeModal = bootstrap.Modal.getOrCreateInstance(employeeModalEl);

  const searchInput = document.getElementById('searchInput');
  const btnSearch = document.getElementById('btnSearch');
  const searchResults = document.getElementById('searchResults');

  const loanTypeSelect = document.getElementById('loanType');

  // Dynamic bracket button
  const btnViewBracket = document.getElementById('btnViewBracket');
  const bracketBtnText = document.getElementById('bracketBtnText');
  const bracketBtnIcon = document.getElementById('bracketBtnIcon');
  const bracketBtnLabel = document.getElementById('bracketBtnLabel');

  // Bracket modal
  const bracketModalEl = document.getElementById('bracketModal');
  const bracketModal = bootstrap.Modal.getOrCreateInstance(bracketModalEl);
  const bracketModalTitle = document.getElementById('bracketModalTitle');
  const bracketModalIcon = document.getElementById('bracketModalIcon');
  const bracketModalBody = document.getElementById('bracketModalBody');

  const comakerCard = document.getElementById('comakerCard');
  const btnCalculate = document.getElementById('btnCalculate');

  btnCalculate.addEventListener('click', () => {
    comakerCard.classList.remove('d-none');
  });

  // ─────────────────────────────────────────────
  // Bracket config — maps loan type names (lowercase)
  // to the bracket key the server expects, a display
  // label, and a Font Awesome icon class.
  // ─────────────────────────────────────────────
  const BRACKET_MAP = [
    {
      test: (name) => /^ml\s+fund\s+regular(?:\s+reloan)?$/i.test(name.trim()),
      key: 'ml_fund',
      label: 'ML Fund Table',
      icon: 'fas fa-university',
    },
    {
      test: (name) => /sako\s*maxi/i.test(name),
      key: 'sako_maxi',
      label: 'Sako Maxi Table',
      icon: 'fas fa-piggy-bank',
    },
    {
      test: (name) => /sako\s*petty/i.test(name),
      key: 'sako_petty',
      label: 'Sako Petty Cash Table',
      icon: 'fas fa-coins',
    },
    {
      test: (name) => /^sss/i.test(name),
      key: 'sss',
      label: 'SSS Table',
      icon: 'fas fa-id-card',
    },
  ];

  // Currently-active bracket config (null = no match / button hidden)
  let activeBracket = null;

  // ─────────────────────────────────────────────
  // STEP 1: Open the employee search modal
  // ─────────────────────────────────────────────
  btnSearchEmployee.addEventListener('click', () => {
    const office = officeSelect.value;

    if (!office) {
      alert('Please select an office first.');
      return;
    }

    searchInput.value = '';
    showMessageRow('Type an ID, last name, or first name, then press Search.');
    employeeModal.show();
  });

  employeeModalEl.addEventListener('shown.bs.modal', () => {
    searchInput.focus();
  });

  // ─────────────────────────────────────────────
  // STEP 2: Search employees — button click OR Enter key
  // ─────────────────────────────────────────────
  btnSearch.addEventListener('click', performSearch);

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      performSearch();
    }
  });

  async function performSearch() {
    const query = searchInput.value.trim();
    const office = officeSelect.value;

    if (!query) {
      searchInput.focus();
      return;
    }

    showMessageRow('Searching…');

    try {
      const res = await fetch(
        `/loan/search-employee?query=${encodeURIComponent(query)}&office=${encodeURIComponent(office)}`,
      );
      const data = await res.json();

      if (!Array.isArray(data)) {
        showMessageRow(data.message || 'Search failed.', 'danger');
        return;
      }

      if (data.length === 0) {
        showMessageRow('No employees found.');
        return;
      }

      renderResults(data);
    } catch (err) {
      console.error('Employee search error:', err);
      showMessageRow('Something went wrong. Please try again.', 'danger');
    }
  }

  // ─────────────────────────────────────────────
  // STEP 3: Render results and handle selection
  // ─────────────────────────────────────────────
  function renderResults(employees) {
    searchResults.innerHTML = '';

    employees.forEach((emp) => {
      const row = document.createElement('tr');
      row.style.cursor = 'pointer';

      [emp.idno, emp.lastname, emp.firstname].forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value;
        row.appendChild(td);
      });

      const tdSelect = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline-primary btn-sm';
      btn.textContent = 'Select';
      tdSelect.appendChild(btn);
      row.appendChild(tdSelect);

      row.addEventListener('click', () => selectEmployee(emp));
      searchResults.appendChild(row);
    });
  }

  function selectEmployee(emp) {
    document.getElementById('empIdno').textContent = emp.idno;
    document.getElementById('empLast').textContent = emp.lastname;
    document.getElementById('empFirst').textContent = emp.firstname;
    document.getElementById('empRegion').textContent = emp.region;
    document.getElementById('empBranch').textContent = emp.branch;
    document.getElementById('empArea').textContent = emp.area;

    employeeModal.hide();
  }

  function showMessageRow(message, variant = 'muted') {
    searchResults.innerHTML = '';
    const row = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = `text-center text-${variant} py-3`;
    td.textContent = message;
    row.appendChild(td);
    searchResults.appendChild(row);
  }

  // ─────────────────────────────────────────────
  // DYNAMIC BRACKET BUTTON
  // Watches the loan type dropdown and shows/hides
  // the single "View Table" button accordingly.
  // ─────────────────────────────────────────────
  loanTypeSelect.addEventListener('change', () => {
    const loanName = loanTypeSelect.value;
    const match = BRACKET_MAP.find((b) => b.test(loanName));

    if (match) {
      activeBracket = match;

      // Update button appearance
      bracketBtnIcon.className = `${match.icon} me-1`;
      bracketBtnText.textContent = match.label;

      // Reveal with a quick pop-in animation
      if (btnViewBracket.classList.contains('d-none')) {
        btnViewBracket.classList.remove('d-none');
        btnViewBracket.classList.add('nla-btn-appear');
        btnViewBracket.addEventListener(
          'animationend',
          () => btnViewBracket.classList.remove('nla-btn-appear'),
          { once: true },
        );
      }

      bracketBtnLabel.style.display = '';
    } else {
      activeBracket = null;
      btnViewBracket.classList.add('d-none');
      bracketBtnLabel.style.display = 'none';
    }
  });

  // ─────────────────────────────────────────────
  // BRACKET MODAL — fetch and render table
  // ─────────────────────────────────────────────
  btnViewBracket.addEventListener('click', async () => {
    if (!activeBracket) return;

    // Set modal header
    bracketModalIcon.className = `${activeBracket.icon} me-1`;
    bracketModalTitle.textContent = activeBracket.label;

    // Show loading state
    bracketModalBody.innerHTML = `
      <div class="nla-bracket-loading">
        <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
        <span>Loading table…</span>
      </div>
    `;

    bracketModal.show();

    try {
      const res = await fetch(`/loan/bracket?type=${encodeURIComponent(activeBracket.key)}`);
      const data = await res.json();

      if (!data.success) {
        showBracketError(data.message || 'Failed to load table.');
        return;
      }

      renderBracketTable(data.columns, data.rows);
    } catch (err) {
      console.error('Bracket fetch error:', err);
      showBracketError('Something went wrong. Please try again.');
    }
  });

  function renderBracketTable(columns, rows) {
    if (!columns.length) {
      bracketModalBody.innerHTML = '<p class="text-center text-muted py-3">No data available.</p>';
      return;
    }

    // Build <thead>
    const ths = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('');

    // Build <tbody>
    const trs = rows
      .map((row) => {
        const tds = columns.map((col) => `<td>${escapeHtml(row[col] ?? '')}</td>`).join('');
        return `<tr>${tds}</tr>`;
      })
      .join('');

    bracketModalBody.innerHTML = `
      <div class="table-responsive">
        <table class="table table-hover table-bordered align-middle mb-0">
          <thead><tr>${ths}</tr></thead>
          <tbody>${trs}</tbody>
        </table>
      </div>
    `;
  }

  function showBracketError(message) {
    bracketModalBody.innerHTML = `
      <div class="nla-bracket-error">
        <i class="fas fa-circle-exclamation me-1"></i>${escapeHtml(message)}
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
});
