function searchActiveEmployees(page) {
  const office = document.getElementById('officeSelect').value;
  const idno = document.getElementById('idno').value;
  const lastName = document.getElementById('lastName').value;
  const firstName = document.getElementById('firstName').value;

  const loading = document.getElementById('loading');
  const errorMessage = document.getElementById('error-message');
  const tbody = document.querySelector('#employees-table tbody');
  const pagination = document.getElementById('pagination');
  let currentPage = 1;
  let totalPages = 1;

  loading.style.display = 'block';
  errorMessage.style.display = 'none';
  errorMessage.innerText = '';
  tbody.innerHTML = '';
  pagination.innerHTML = '';

  // No `status` param — backend now returns all employees
  fetch(
    `/search-activeemployees?office=${encodeURIComponent(office)}&idno=${encodeURIComponent(idno)}&lastName=${encodeURIComponent(lastName)}&firstName=${encodeURIComponent(firstName)}&page=${page}`,
  )
    .then((res) => res.json())
    .then((data) => {
      loading.style.display = 'none';

      if (!data.success) {
        errorMessage.innerText = data.message;
        errorMessage.style.display = 'block';
        return;
      }

      currentPage = page;
      totalPages = data.totalPages;

      data.employees.forEach((emp) => {
        // status = 1 → Active (green), anything else → Resigned (red)
        const isActive = emp.status === 1;
        const employeeStatus = isActive ? 'Active' : 'Resigned';
        const statusClass = isActive ? 'status-active' : 'status-resigned';

        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        row.innerHTML = `
          <td>${emp.idno}</td>
          <td>${emp.last_name}</td>
          <td>${emp.first_name}</td>
<td>${emp.middle_name}</td>
          <td class="${statusClass}">${employeeStatus}</td>
        `;
        row.addEventListener('click', () => {
          window.location.href = `/employeedetails?id=${emp.idno}&office=${encodeURIComponent(office)}`;
        });
        tbody.appendChild(row);
      });

      renderPagination(currentPage, totalPages);
    })
    .catch(() => {
      loading.style.display = 'none';
      errorMessage.innerText = 'Failed to fetch results.';
      errorMessage.style.display = 'block';
    });
}

function renderPagination(currentPage, totalPages) {
  const pagination = document.getElementById('pagination');
  pagination.innerHTML = '';

  pagination.innerHTML += `
    <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
      <a class="page-link" href="#" onclick="searchActiveEmployees(${currentPage - 1}); return false;">Previous</a>
    </li>
  `;

  const maxPagesToShow = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
  let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
  if (endPage - startPage + 1 < maxPagesToShow) {
    startPage = Math.max(1, endPage - maxPagesToShow + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pagination.innerHTML += `
      <li class="page-item ${i === currentPage ? 'active' : ''}">
        <a class="page-link" href="#" onclick="searchActiveEmployees(${i}); return false;">${i}</a>
      </li>
    `;
  }

  pagination.innerHTML += `
    <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
      <a class="page-link" href="#" onclick="searchActiveEmployees(${currentPage + 1}); return false;">Next</a>
    </li>
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  const inputs = ['officeSelect', 'idno', 'lastName', 'firstName'];

  inputs.forEach((id) => {
    document.getElementById(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        searchActiveEmployees(1);
      }
    });
  });
});
