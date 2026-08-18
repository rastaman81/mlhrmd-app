const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const menuController = require('../controllers/menuController');
const adminController = require('../controllers/adminController');
const dashboardController = require('../controllers/dashboardController');
const payrollController = require('../controllers/payrollController');
const payrollEmployeeController = require('../controllers/payrollEmployeeController');
const recordsController = require('../controllers/recordsController');
const multer = require('multer');
const atdController = require('../controllers/atdController');
const inventoryController = require('../controllers/inventoryController');

// Resigned Employee - Payroll Breakdown routes
const resignedEmployeeController = require('../controllers/resignedEmployeeController');
const lastPayController = require('../controllers/lastPayController');
const benefitsReportsController = require('../controllers/benefitsReportsController');

const fs = require('fs');
const path = require('path');

const uploadDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// const {
//   isAuthenticated,
//   redirectIfAuthenticated,
//   isSuperAdmin,
// } = require("../middleware/authMiddleware");

const {
  isAuthenticated,
  redirectIfAuthenticated,
  isSuperAdmin,
  hasMenuAccess,
} = require('../middleware/authMiddleware');

//const addViewData = require("../middleware/viewDataMiddleware"); // Add this line

// START -> CODE FOR UPLOADING A FILE AND STORING IT IN A FOLDER
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, "uploads/"); // make sure this folder exists
//   },
//   filename: (req, file, cb) => {
//     const uniqueName = Date.now() + "-" + file.originalname;
//     cb(null, uniqueName);
//   },
// });

// const upload = multer({
//   storage: storage,
//   limits: {
//     fileSize: 10 * 1024 * 1024, // 10MB limit
//   },
// });
// END -> CODE FOR UPLOADING A FILE AND STORING IT IN A FOLDER

//START CODE FOR READING A FILE AND NOT STORING IT
const upload = multer({
  storage: multer.memoryStorage(), // 🔥 store in RAM, not disk
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});
//END CODE FOR READING A FILE AND NOT STORING IT

// Apply the middleware to all routes
//router.use(addViewData);

// console.log("Middleware check:");
// console.log("isAuthenticated:", typeof isAuthenticated, isAuthenticated);
// console.log(
//   "redirectIfAuthenticated:",
//   typeof redirectIfAuthenticated,
//   redirectIfAuthenticated
// );

// console.log("\nAuth Controller check:");
// console.log("loginPage:", typeof authController.loginPage);
// console.log("loginUser:", typeof authController.loginUser);
// console.log("logoutUser:", typeof authController.logoutUser);
// console.log("registerPage:", typeof authController.registerPage);
// console.log("registerUser:", typeof authController.registerUser);

// console.log("\nMenu Controller check:");
// console.log("getDashboard:", typeof menuController.getDashboard);

// Auth routes
router.get('/', redirectIfAuthenticated, authController.loginPage);
router.post('/login', authController.loginUser);
router.get('/logout', authController.logoutUser);

// Protected dashboard
router.get('/dashboard', isAuthenticated, menuController.getDashboard);

// User registration (for admin, basic demo here)
router.get('/admin/register', isAuthenticated, isSuperAdmin, authController.registerPage);
router.post('/admin/register', isAuthenticated, isSuperAdmin, authController.registerUser);

// Super Admin routes
router.get('/admin/users', isAuthenticated, isSuperAdmin, adminController.viewUsers);
router.get('/admin/users/edit/:id', isAuthenticated, adminController.editUserPage);
router.post('/admin/users/edit/:id', isAuthenticated, isSuperAdmin, adminController.updateUser);
router.get('/admin/users/delete/:id', isAuthenticated, isSuperAdmin, adminController.deleteUser);

// View Menus
router.get('/admin/menus', isAuthenticated, isSuperAdmin, adminController.viewMenus);

// Assign Menus to Roles
router.get('/admin/assign-menus', isAuthenticated, isSuperAdmin, adminController.assignMenusPage);
router.post('/admin/assign-menus', isAuthenticated, isSuperAdmin, adminController.assignMenus);

// ➕ Add menu (form + save)
router.get('/admin/menus/add', isAuthenticated, isSuperAdmin, menuController.addMenuPage);
router.post('/admin/menus/add', isAuthenticated, isSuperAdmin, menuController.saveMenu);

//dashboard for searching employees
// router.get(
//   "/search-activeemployees",
//   isAuthenticated,
//   dashboardController.searchActiveEmployees,
// );

router.get('/search-activeemployees', isAuthenticated, dashboardController.searchEmployees);

// Add this to your routes.js
router.get('/employeedetails', isAuthenticated, dashboardController.getEmployeeDetails);

router.get(
  '/payroll/utilities',
  isAuthenticated,
  hasMenuAccess('/payroll/utilities'),

  payrollController.getPayrollUtilitiesPage,
);

// router.post(
//   "/payroll/utilities/execute-task",
//   isAuthenticated,
//   payrollController.executeTask,
// );

router.post(
  '/payroll/utilities/execute-task',
  isAuthenticated,
  hasMenuAccess('/payroll/utilities'),
  upload.single('file'), // 🔥 THIS IS THE KEY
  payrollController.executeTask,
);

// Add this with your other routes
router.get(
  '/payroll/utilities/regions',
  isAuthenticated,
  hasMenuAccess('/payroll/utilities'),
  payrollController.getRegionsByOffice,
);

router.get(
  '/payroll/reports',
  isAuthenticated,
  hasMenuAccess('/payroll/reports'),

  payrollController.getPayrollReportsPage,
);

router.post(
  '/payroll/reports/generate-report',
  isAuthenticated,
  hasMenuAccess('/payroll/reports'),

  payrollController.generatePayrollReports,
);

// Add this with your other routes
router.get(
  '/payroll/reports/regions',
  isAuthenticated,
  hasMenuAccess('/payroll/reports'),

  payrollController.getRegionsByOffice,
);

// Add this new route for PDF generation
router.post(
  '/payroll/reports/generate-pdf',
  isAuthenticated,
  hasMenuAccess('/payroll/reports'),

  payrollController.generatePayrollPdf,
);

router.get('/payroll/employee-edit', isAuthenticated, payrollController.getPayrollDBFSearch);

//Getting employees throught their regions DBF
// Getting employees through their regions DBF
router.get('/payroll/employee/search', isAuthenticated, payrollEmployeeController.getDBFEmployees);

router.get(
  '/payroll/employee-update',
  isAuthenticated,
  payrollEmployeeController.showEmployeeUpdatePage,
);

router.post('/payroll/employee-update', isAuthenticated, payrollEmployeeController.updateEmployee);

//records start
// =====================
// Employee Records
// =====================

// =====================
// Employee Entry
// =====================

// Step 1: Office selection page
router.get(
  '/records/employee-entry',
  isAuthenticated,
  hasMenuAccess('/records/employee-entry'),
  recordsController.showEmployeeEntryPage,
);

// Step 2: Decide flow based on selected office
// VISMIN -> applicant search
// LUZON / ML GROUP -> manual employee entry form
router.get(
  '/records/employee-entry/select-office',
  isAuthenticated,
  hasMenuAccess('/records/employee-entry'),
  recordsController.handleEmployeeEntryOfficeSelection,
);

// Step 3A: Applicant search page for offices with applicant module
router.get(
  '/records/employee-entry/applicants',
  isAuthenticated,
  hasMenuAccess('/records/employee-entry'),
  recordsController.showApplicantSearchPage,
);

// Step 3B: Employee entry form
// Can be blank manual entry or prefilled from applicant
router.get(
  '/records/employee-entry/form',
  isAuthenticated,
  hasMenuAccess('/records/employee-entry'),
  recordsController.showEmployeeEntryForm,
);

// START ->LOADING REGIONS, AREA & BRANCHES
router.get(
  '/records/employee-entry/regions',
  isAuthenticated,
  hasMenuAccess('/records/employee-entry'),
  recordsController.getRegionsByOffice,
);

router.get(
  '/records/employee-entry/areas',
  isAuthenticated,
  hasMenuAccess('/records/employee-entry'),
  recordsController.getAreasByOffice,
);

router.get(
  '/records/employee-entry/branches',
  isAuthenticated,
  hasMenuAccess('/records/employee-entry'),
  recordsController.getBranchesByOffice,
);

// ── UNASSIGNED BRANCHES ──────────────────────────────
// ── UNASSIGNED BRANCHES ──────────────────────────────
router.get(
  '/records/branches/unassigned', // <-- Make sure this matches the frontend fetch URL
  isAuthenticated,
  hasMenuAccess('/records/branches'),
  recordsController.getBranchesWithoutArea,
);

router.post(
  '/records/branches/bulk-assign',
  isAuthenticated,
  hasMenuAccess('/records/branches'),
  recordsController.bulkAssignBranches,
);
// END ->LOADING REGIONS, AREA & BRANCHES

// Save new employee record
router.post(
  '/records/employee-entry/save',
  isAuthenticated,
  hasMenuAccess('/records/employee-entry'),
  recordsController.saveEmployee,
);

router.get(
  '/employee/reports',
  isAuthenticated,
  hasMenuAccess('/employee/reports'),
  recordsController.getRecordsReportsPage,
);

// Add this with your other routes
router.get(
  '/records/reports/regions',
  isAuthenticated,
  hasMenuAccess('/employee/reports'),
  recordsController.getRegionsByOffice,
);
///records/reports/areas
router.get(
  '/records/reports/areas',
  isAuthenticated,
  hasMenuAccess('/employee/reports'),
  recordsController.getAreasByOffice,
);

router.get(
  '/records/reports/branches',
  isAuthenticated,
  hasMenuAccess('/employee/reports'),
  recordsController.getBranchesByOffice,
);

router.get(
  '/records/reports/statuses',
  isAuthenticated,
  hasMenuAccess('/employee/reports'),
  recordsController.getEmployeeStatuses,
);

router.get(
  '/records/reports/employee-types',
  isAuthenticated,
  hasMenuAccess('/employee/reports'),
  recordsController.getEmployeeTypes,
);

router.get(
  '/records/reports/sort-options',
  isAuthenticated,
  hasMenuAccess('/employee/reports'),
  recordsController.getSortOptions,
);

router.post(
  '/records/reports/masterlist',
  isAuthenticated,
  hasMenuAccess('/employee/reports'),
  recordsController.generateRecordsReport,
);

router.get(
  '/records/reports/masterlist/export',
  isAuthenticated,
  hasMenuAccess('/employee/reports'),
  recordsController.exportMasterlistExcel,
);

router.get(
  '/records/reports/masterlist/pdf',
  isAuthenticated,
  hasMenuAccess('/employee/reports'),
  recordsController.exportMasterlistPDF,
);

router.get(
  '/records/reports/designations',
  isAuthenticated,
  hasMenuAccess('/employee/reports'),
  recordsController.getDesignationsForReports,
);
// =====================
// Employee Update
// =====================

router.get(
  '/employee/update',
  isAuthenticated,
  hasMenuAccess('/employee/update'),
  recordsController.showEmployeeUpdatePage,
);

router.get(
  '/employee/update/search',
  isAuthenticated,
  hasMenuAccess('/employee/update'),
  recordsController.searchEmployeesForUpdate,
);

router.get(
  '/employee/update/form/:employeeId',
  isAuthenticated,
  hasMenuAccess('/employee/update'),
  recordsController.showEmployeeUpdateForm,
);

router.put(
  '/employee/update/save/:employeeId',
  isAuthenticated,
  hasMenuAccess('/employee/update'),
  recordsController.updateEmployeeRecord,
);

router.get(
  '/employee/update/regions',
  isAuthenticated,
  hasMenuAccess('/employee/update'),
  recordsController.getRegionsByOffice,
);

router.get(
  '/employee/update/areas',
  isAuthenticated,
  hasMenuAccess('/employee/update'),
  recordsController.getAreasByOffice,
);

router.get(
  '/employee/update/branches',
  isAuthenticated,
  hasMenuAccess('/employee/update'),
  recordsController.getBranchesByOffice,
);
// =====================

// router.get("/masterlist/export", recordsController.exportMasterlistExcel);
// router.get("/masterlist/pdf", recordsController.exportMasterlistPDF);

// (fetch("/records/reports/statuses")
//   .then((res) => res.json())
//   .catch(() => statusesData),
//   fetch("/records/reports/employee-types")
//     .then((res) => res.json())
//     .catch(() => typesData),
//   fetch("/records/reports/sort-options")
//     .then((res) => res.json())
//     .catch(() => sortOptionsData));

//records end

// //START REGION MANAGEMENT
// // Region Management Page
// router.get(
//   "/records/regions",
//   isAuthenticated,
//   recordsController.getRegionManagementPage,
// );

// // Search employee to assign as region manager
// router.get(
//   "/records/regions/search-manager",
//   isAuthenticated,
//   recordsController.searchRegionManager,
// );

// // Save new region
// router.post(
//   "/records/regions/save",
//   isAuthenticated,
//   recordsController.saveRegion,
// );
// //END REGION MANAGEMENT

// ======================================================
// START REGION MANAGEMENT
// ======================================================

// REGION LIST PAGE
router.get(
  '/records/regions',
  isAuthenticated,
  hasMenuAccess('/records/regions'),
  recordsController.getRegionListPage,
);

// CREATE REGION PAGE
router.get(
  '/records/regions/create',
  isAuthenticated,
  hasMenuAccess('/records/regions'),
  recordsController.getRegionCreatePage,
);

// EDIT REGION PAGE
router.get(
  '/records/regions/edit/:id',
  isAuthenticated,
  hasMenuAccess('/records/regions'),
  recordsController.getRegionEditPage,
);

// SEARCH EMPLOYEE
router.get(
  '/records/regions/search-manager',
  isAuthenticated,
  hasMenuAccess('/records/regions'),
  recordsController.searchRegionManager,
);

// SAVE REGION
router.post(
  '/records/regions/save',
  isAuthenticated,
  hasMenuAccess('/records/regions'),
  recordsController.saveRegion,
);

// UPDATE REGION
router.put(
  '/records/regions/update/:id',
  isAuthenticated,
  hasMenuAccess('/records/regions'),
  recordsController.updateRegion,
);

// ======================================================
// END REGION MANAGEMENT
// ======================================================

// START OF ADDING DESIGNATIONS
// DESIGNATION MANAGEMENT PAGE
router.get(
  '/records/designations',
  isAuthenticated,
  hasMenuAccess('/records/designations'),
  recordsController.getDesignationManagementPage,
);

// SAVE NEW DESIGNATION
router.post(
  '/records/designations/save',
  isAuthenticated,
  hasMenuAccess('/records/designations'),
  recordsController.saveDesignation,
);

router.put(
  '/records/designations/update/:id',
  isAuthenticated,
  hasMenuAccess('/records/designations'),
  recordsController.updateDesignation,
);
// END OF ADDING DESIGNATIONS
// ======================================================
// START OF BENEFITS
// ======================================================
const benefitsController = require('../controllers/benefitsController');

// Benefits Reports
router.get(
  '/benefits/reports',
  isAuthenticated,
  hasMenuAccess('/benefits/reports'),
  benefitsController.getBenefitsReportsPage,
);

router.post(
  '/benefits/reports/generate-report',
  isAuthenticated,
  hasMenuAccess('/benefits/reports'),
  benefitsController.generateBenefitsReport,
);

router.get(
  '/benefits/reports/regions',
  isAuthenticated,
  hasMenuAccess('/benefits/reports'),
  benefitsController.getRegionsByOffice,
);

router.get(
  '/benefits/employee-movement',
  isAuthenticated,
  hasMenuAccess('/benefits/employee-movement'),
  benefitsController.getBenefitsEmployeeMovementPage,
);

router.post(
  '/benefits/employee-movement/view',
  isAuthenticated,
  hasMenuAccess('/benefits/employee-movement'),
  benefitsController.getEmployeeMovement,
);
// ======================================================
// END OF BENEFITS
// ======================================================

//

router.get('/atd/reports', isAuthenticated, atdController.getAtdReportsPage);

// Start Change Password
router.get(
  '/admin/change-password',
  isAuthenticated,
  hasMenuAccess('/admin/change-password'),
  authController.changePasswordPage,
);

router.post(
  '/admin/change-password',
  isAuthenticated,
  hasMenuAccess('/admin/change-password'),
  authController.changePassword,
);
// End Change Password

// Start Reset Password
router.get(
  '/admin/users/reset-password/:id',
  isAuthenticated,
  isSuperAdmin,
  authController.resetPasswordPage,
);

router.post(
  '/admin/users/reset-password/:id',
  isAuthenticated,
  isSuperAdmin,
  authController.resetPassword,
);
// End Reset Password

// Loan Calculator START
const loanController = require('../controllers/loanController');

// New Loan page
router.get(
  '/loans/new-loan',
  isAuthenticated,
  hasMenuAccess('/loans/new-loan'),
  loanController.getNewLoanPage,
);

// Employee search with pagination
router.get(
  '/loan/search-employee',
  isAuthenticated,
  hasMenuAccess('/loans/new-loan'),
  loanController.searchEmployee,
);

// Bracket table
router.get('/loan/bracket', loanController.getBracket);

// routes.js
// Get employee payroll data (including all loan deductions)
router.get(
  '/loan/employee-payroll',
  isAuthenticated,
  hasMenuAccess('/loans/new-loan'),
  loanController.getEmployeePayroll,
);

// routes.js

// Check if employee has existing loan of specific type
router.get(
  '/loan/check-existing-loan',
  isAuthenticated,
  hasMenuAccess('/loans/new-loan'),
  loanController.checkExistingLoan,
);

// routes.js - Add this route

// Save loan
router.post(
  '/loan/save',
  isAuthenticated,
  hasMenuAccess('/loans/new-loan'),
  loanController.saveLoan,
);

// Calculate loan (server-side calculation)
router.post(
  '/loan/calculate',
  isAuthenticated,
  hasMenuAccess('/loans/new-loan'),
  loanController.calculateLoan,
);

// Process loan type (frontend helper)
router.post(
  '/loan/process',
  isAuthenticated,
  hasMenuAccess('/loans/new-loan'),
  loanController.processLoan,
);

// routes.js - Add PDF route

// Generate PDF for existing loan
router.get(
  '/loan/generate-pdf/:controlNo',
  isAuthenticated,
  hasMenuAccess('/loans/new-loan'),
  loanController.generatePDF,
);

// routes.js - Add this route

// Search co-maker (for co-maker selection)
router.get(
  '/loan/search-comaker',
  isAuthenticated,
  hasMenuAccess('/loans/new-loan'),
  loanController.searchCoMaker,
);

router.get(
  '/loan/loan-type-config',
  isAuthenticated,
  hasMenuAccess('/loans/new-loan'),
  loanController.getLoanTypeConfig,
);

// Update Loan Status page
router.get(
  '/loans/update-status',
  isAuthenticated,
  hasMenuAccess('/loans/update-status'),
  loanController.getUpdateLoanStatusPage,
);

// Search loan by control number
router.get(
  '/loan/status/by-control',
  isAuthenticated,
  hasMenuAccess('/loans/update-status'),
  loanController.getLoanByControlNo,
);

// Search loans by employee name
router.get(
  '/loan/status/search-by-name',
  isAuthenticated,
  hasMenuAccess('/loans/update-status'),
  loanController.searchLoanByName,
);

// Update loan status + remarks
router.post(
  '/loan/status/update',
  isAuthenticated,
  hasMenuAccess('/loans/update-status'),
  loanController.updateLoanStatus,
);

// Recompute Loan page
router.get(
  '/loans/recompute',
  isAuthenticated,
  hasMenuAccess('/loans/recompute'),
  loanController.getRecomputePage,
);

// Find loan by control number (reuses Update Status's logic)
router.get(
  '/loan/recompute/by-control',
  isAuthenticated,
  hasMenuAccess('/loans/recompute'),
  loanController.getLoanByControlNo,
);

// Search loans by employee name (reuses Update Status's logic)
router.get(
  '/loan/recompute/search-by-name',
  isAuthenticated,
  hasMenuAccess('/loans/recompute'),
  loanController.searchLoanByName,
);

router.get(
  '/loan/recompute/search-by-name-recompute',
  isAuthenticated,
  hasMenuAccess('/loans/recompute'),
  loanController.searchLoanByNameRecompute,
);

// Fresh payroll data for the loan's employee (reuses New Loan's logic)
router.get(
  '/loan/recompute/employee-payroll',
  isAuthenticated,
  hasMenuAccess('/loans/recompute'),
  loanController.getEmployeePayroll,
);

// Co-maker search (reuses New Loan's logic)
router.get(
  '/loan/recompute/search-comaker',
  isAuthenticated,
  hasMenuAccess('/loans/recompute'),
  loanController.searchCoMaker,
);

// Loan type config, for months-based loans
router.get(
  '/loan/recompute/loan-type-config',
  isAuthenticated,
  hasMenuAccess('/loans/recompute'),
  loanController.getLoanTypeConfig,
);

// Save recomputed values back to the same loanmonitoring row
router.post(
  '/loan/recompute/update',
  isAuthenticated,
  hasMenuAccess('/loans/recompute'),
  loanController.recomputeUpdate,
);

// ─────────────────────────────────────────────────────────────
// LOAN REPORTS ROUTES
// ─────────────────────────────────────────────────────────────
router.get(
  '/loans/reports',
  isAuthenticated,
  hasMenuAccess('/loans/reports'),
  loanController.getLoanReportsPage,
);

// Get loan types by provider (AJAX)
router.get(
  '/loan/reports/loan-types-by-provider',
  isAuthenticated,
  hasMenuAccess('/loans/reports'),
  loanController.getLoanTypesByProvider,
);

// Get report data (AJAX)
router.get(
  '/loan/reports/data',
  isAuthenticated,
  hasMenuAccess('/loans/reports'),
  loanController.getLoanReportData,
);

// Export report (CSV)
router.get(
  '/loan/reports/export',
  isAuthenticated,
  hasMenuAccess('/loans/reports'),
  loanController.exportLoanReport,
);

// Export report (PDF)
router.get(
  '/loan/reports/pdf',
  isAuthenticated,
  hasMenuAccess('/loans/reports'),
  loanController.exportLoanReportPDF,
);

// Loan Calculator END

// BRANCH MANAGEMENT PAGE
router.get(
  '/records/branches',
  isAuthenticated,
  hasMenuAccess('/records/branches'),
  recordsController.getBranchManagementPage,
);

// REGIONS BY OFFICE (reused by filter bar AND transfer modal)
router.get(
  '/records/branches/regions',
  isAuthenticated,
  hasMenuAccess('/records/branches'),
  recordsController.getRegionsForBranch,
);

// AREAS BY REGION
router.get(
  '/records/branches/areas',
  isAuthenticated,
  hasMenuAccess('/records/branches'),
  recordsController.getAreasForBranch,
);

// BRANCHES BY AREA
router.get(
  '/records/branches/by-area',
  isAuthenticated,
  hasMenuAccess('/records/branches'),
  recordsController.getBranchesByArea,
);

// SAVE NEW BRANCH
router.post(
  '/records/branches/save',
  isAuthenticated,
  hasMenuAccess('/records/branches'),
  recordsController.saveBranch,
);

// UPDATE BRANCH (inline edit)
router.put(
  '/records/branches/update/:id',
  isAuthenticated,
  hasMenuAccess('/records/branches'),
  recordsController.updateBranch,
);

// TRANSFER BRANCH (rezoning) - KEEP ONLY THIS ONE
router.put(
  '/records/branches/transfer/:id',
  isAuthenticated,
  hasMenuAccess('/records/branches'),
  recordsController.transferBranch,
);

// TOGGLE ACTIVE/INACTIVE
router.put(
  '/records/branches/toggle-status/:id',
  isAuthenticated,
  hasMenuAccess('/records/branches'),
  recordsController.toggleBranchStatus,
);

// CHECK BRANCH EMPLOYEES BEFORE DEACTIVATION
router.get(
  '/records/branches/check-employees/:id',
  isAuthenticated,
  hasMenuAccess('/records/branches'),
  recordsController.checkBranchEmployees,
);

// GET AFFECTED EMPLOYEES PREVIEW
router.get(
  '/records/branches/affected-employees/:id',
  isAuthenticated,
  hasMenuAccess('/records/branches'),
  recordsController.getAffectedEmployeesPreview,
);

// ======================================================
// END BRANCH MANAGEMENT
// ======================================================

// =============================================
// INVENTORY MODULE ROUTES
// =============================================

// ----- SPECIFIC ROUTES FIRST (no parameters) -----

// Item List - View all items
router.get(
  '/inventory/items',
  isAuthenticated,
  hasMenuAccess('/inventory/items'),
  inventoryController.getItemListPage,
);

// Item Entry - New item form
router.get(
  '/inventory/items/new',
  isAuthenticated,
  hasMenuAccess('/inventory/items'),
  (req, res, next) => {
    console.log('✅ /inventory/items/new route was hit!');
    next();
  },
  inventoryController.getItemEntryPage,
);

// API - Search items (autocomplete)
router.get(
  '/inventory/items/search',
  isAuthenticated,
  hasMenuAccess('/inventory/request'),
  inventoryController.searchItems,
);

// ----- PARAMETERIZED ROUTES (with :id) -----

// Item Edit - Edit existing item
router.get(
  '/inventory/items/:id/edit',
  isAuthenticated,
  hasMenuAccess('/inventory/items'),
  inventoryController.getItemEditPage,
);

// API - Get item details
router.get(
  '/inventory/items/:id',
  isAuthenticated,
  hasMenuAccess('/inventory/request'),
  inventoryController.getItemDetails,
);

// API - Delete item (soft delete)
router.delete(
  '/inventory/items/:id/delete',
  isAuthenticated,
  hasMenuAccess('/inventory/items'),
  inventoryController.deleteItem,
);

// API - Save item (create or update)
router.post(
  '/inventory/items/save',
  isAuthenticated,
  hasMenuAccess('/inventory/items'),
  inventoryController.saveItem,
);

// ----- REQUEST ROUTES -----

// ITEM REQUEST - User facing
router.get(
  '/inventory/request',
  isAuthenticated,
  hasMenuAccess('/inventory/request'),
  inventoryController.getRequestPage,
);

// API - Get request reasons
router.get(
  '/inventory/request/reasons',
  isAuthenticated,
  hasMenuAccess('/inventory/request'),
  inventoryController.getRequestReasons,
);

// API - Save request
router.post(
  '/inventory/request/save',
  isAuthenticated,
  hasMenuAccess('/inventory/request'),
  inventoryController.saveRequest,
);

// =============================================
// INVENTORY MODULE ROUTES - STOCK ADJUSTMENT
// =============================================

// Stock Adjustment - Main page
router.get(
  '/inventory/adjustment',
  isAuthenticated,
  hasMenuAccess('/inventory/adjustment'),
  inventoryController.getAdjustmentPage,
);

// Stock Adjustment - List/History
router.get(
  '/inventory/adjustments',
  isAuthenticated,
  hasMenuAccess('/inventory/adjustment'),
  inventoryController.getAdjustmentList,
);

// Stock Adjustment - Get reasons (API)
router.get(
  '/inventory/adjustment/reasons',
  isAuthenticated,
  hasMenuAccess('/inventory/adjustment'),
  inventoryController.getAdjustmentReasons,
);

// Stock Adjustment - Get details (API)
router.get(
  '/inventory/adjustment/:id',
  isAuthenticated,
  hasMenuAccess('/inventory/adjustment'),
  inventoryController.getAdjustmentDetails,
);

// Stock Adjustment - Save (API)
router.post(
  '/inventory/adjustment/save',
  isAuthenticated,
  hasMenuAccess('/inventory/adjustment'),
  inventoryController.saveAdjustment,
);

// Stock Adjustment - Approve (API)
router.put(
  '/inventory/adjustment/:id/approve',
  isAuthenticated,
  hasMenuAccess('/inventory/adjustment'),
  inventoryController.approveAdjustment,
);

// Stock Adjustment - Reject (API)
router.put(
  '/inventory/adjustment/:id/reject',
  isAuthenticated,
  hasMenuAccess('/inventory/adjustment'),
  inventoryController.rejectAdjustment,
);

// Stock Adjustment - List/History (JSON for recent)
router.get(
  '/inventory/adjustments',
  isAuthenticated,
  hasMenuAccess('/inventory/adjustment'),
  (req, res, next) => {
    // If format=json, return JSON, otherwise render HTML
    if (req.query.format === 'json') {
      // Call the controller but intercept the response
      const originalRender = res.render;
      res.render = function () {
        // Don't render HTML for JSON requests
      };
      next();
    } else {
      next();
    }
  },
  inventoryController.getAdjustmentList,
);

// =============================================
// INVENTORY MODULE ROUTES - REQUEST APPROVAL
// =============================================

// Approval Dashboard
router.get(
  '/inventory/approval',
  isAuthenticated,
  hasMenuAccess('/inventory/approval'),
  inventoryController.getApprovalDashboard,
);

// Pending Requests List
router.get(
  '/inventory/approval/pending',
  isAuthenticated,
  hasMenuAccess('/inventory/approval'),
  inventoryController.getPendingRequests,
);

// Request Approval Page
router.get(
  '/inventory/approval/:id',
  isAuthenticated,
  hasMenuAccess('/inventory/approval'),
  inventoryController.getRequestApprovalPage,
);

// API - Approve Request
router.put(
  '/inventory/approval/:id/approve',
  isAuthenticated,
  hasMenuAccess('/inventory/approval'),
  inventoryController.approveRequest,
);

// API - Reject Request
router.put(
  '/inventory/approval/:id/reject',
  isAuthenticated,
  hasMenuAccess('/inventory/approval'),
  inventoryController.rejectRequest,
);

// My Requests - User's own requests
router.get(
  '/inventory/my-requests',
  isAuthenticated,
  hasMenuAccess('/inventory/request'),
  inventoryController.getMyRequests,
);

// =============================================
// INVENTORY MODULE ROUTES - USER REQUESTS
// =============================================

// My Requests - User's own requests
router.get(
  '/inventory/my-requests',
  isAuthenticated,
  hasMenuAccess('/inventory/my-requests'),
  inventoryController.getMyRequests,
);

// API - Get request status (JSON)
router.get(
  '/inventory/request/:id/status',
  isAuthenticated,
  hasMenuAccess('/inventory/my-requests'),
  inventoryController.getRequestStatus,
);

// API - Cancel request
router.put(
  '/inventory/request/:id/cancel',
  isAuthenticated,
  hasMenuAccess('/inventory/my-requests'),
  inventoryController.cancelRequest,
);

// =============================================
// INVENTORY MODULE ROUTES - REPORTS
// =============================================

// Reports Dashboard
router.get(
  '/inventory/reports',
  isAuthenticated,
  hasMenuAccess('/inventory/reports'),
  inventoryController.getReportsDashboard,
);

// Request Summary Report
router.get(
  '/inventory/reports/request-summary',
  isAuthenticated,
  hasMenuAccess('/inventory/reports'),
  inventoryController.getRequestSummaryReport,
);

// Inventory Movement Report
router.get(
  '/inventory/reports/movement',
  isAuthenticated,
  hasMenuAccess('/inventory/reports'),
  inventoryController.getMovementReport,
);

// Stock Status Report
router.get(
  '/inventory/reports/stock-status',
  isAuthenticated,
  hasMenuAccess('/inventory/reports'),
  inventoryController.getStockStatusReport,
);

// User Activity Report
router.get(
  '/inventory/reports/user-activity',
  isAuthenticated,
  hasMenuAccess('/inventory/reports'),
  inventoryController.getUserActivityReport,
);

// Export Report (Excel/PDF)
router.get(
  '/inventory/reports/export',
  isAuthenticated,
  hasMenuAccess('/inventory/reports'),
  inventoryController.exportReportExcel,
);

// Add these routes to your routes.js file

// Get the resigned employee breakdown page
router.get(
  '/resigned/resigned-employee',
  isAuthenticated,
  hasMenuAccess('/resigned/resigned-employee'),
  resignedEmployeeController.getResignedEmployeePage,
);

// Search resigned employees
router.get(
  '/resigned/resigned-employee/search',
  isAuthenticated,
  hasMenuAccess('/resigned/resigned-employee'),
  resignedEmployeeController.searchResignedEmployees,
);

// Get payroll breakdown for a specific resigned employee
router.get(
  '/resigned/resigned-employee/breakdown',
  isAuthenticated,
  hasMenuAccess('/resigned/resigned-employee'),
  resignedEmployeeController.getResignedEmployeeBreakdown,
);

// Generate PDF for resigned employee breakdown
router.post(
  '/resigned/resigned-employee/generate-pdf',
  isAuthenticated,
  hasMenuAccess('/resigned/resigned-employee'),
  resignedEmployeeController.generateResignedEmployeePDF,
);

//last pay computation start
router.get(
  '/resigned/last-pay',
  isAuthenticated,
  hasMenuAccess('/resigned/last-pay'),
  lastPayController.getLastPayPage,
);

router.get(
  '/resigned/last-pay/details',
  isAuthenticated,
  hasMenuAccess('/resigned/last-pay'),
  lastPayController.getLastPayDetails,
);

router.post(
  '/resigned/last-pay/generate-pdf',
  isAuthenticated,
  hasMenuAccess('/resigned/last-pay'),
  lastPayController.generateLastPayPDF,
);

// Add to routes/resignedRoutes.js

// =============================================
// Last Pay Reports Routes
// =============================================

// Reports page
router.get(
  '/resigned/last-pay-reports',
  isAuthenticated,
  hasMenuAccess('/resigned/last-pay-reports'),
  benefitsReportsController.getReportsPage,
);

// Search resigned employees (reuses existing search)
router.get(
  '/resigned/last-pay-reports/search',
  isAuthenticated,
  hasMenuAccess('/resigned/last-pay-reports'),
  benefitsReportsController.searchResignedEmployees,
);

// Get employee's saved computations
router.get(
  '/resigned/last-pay-reports/computations',
  isAuthenticated,
  hasMenuAccess('/resigned/last-pay-reports'),
  benefitsReportsController.getEmployeeComputations,
);

// Reprint Last Pay PDF
router.post(
  '/resigned/last-pay-reports/reprint',
  isAuthenticated,
  hasMenuAccess('/resigned/last-pay-reports'),
  benefitsReportsController.reprintLastPayPDF,
);

// Generate Deduction Type Report
router.post(
  '/resigned/last-pay-reports/deduction-report',
  isAuthenticated,
  hasMenuAccess('/resigned/last-pay-reports'),
  benefitsReportsController.generateDeductionReport,
);

// Save the computation (blocked if already exists) and return the PDF
router.post(
  '/resigned/last-pay/save',
  isAuthenticated,
  hasMenuAccess('/resigned/last-pay'),
  lastPayController.saveLastPayComputation,
);

// Regenerate the PDF for an already-saved employee, straight from the DB
router.get(
  '/resigned/last-pay/download-saved-pdf',
  isAuthenticated,
  hasMenuAccess('/resigned/last-pay'),
  lastPayController.downloadSavedPDF,
);

// Update a previously saved computation
router.post(
  '/resigned/last-pay/update',
  isAuthenticated,
  hasMenuAccess('/resigned/last-pay'),
  lastPayController.updateLastPayComputation,
);
//last pay computation end

// ======================================================
// EMPLOYEE RECORDS VIEWER (VIEW-ONLY)
// ======================================================

// Main viewer page
router.get(
  '/records/viewer',
  isAuthenticated,
  hasMenuAccess('/records/viewer'),
  recordsController.getEmployeeRecordsViewerPage,
);

// API endpoint to get employees by filters
router.get(
  '/records/viewer/employees',
  isAuthenticated,
  hasMenuAccess('/records/viewer'),
  recordsController.getEmployeesByFilters,
);

// API endpoints with employee counts
router.get(
  '/records/viewer/regions',
  isAuthenticated,
  hasMenuAccess('/records/viewer'),
  recordsController.getRegionsWithCount,
);

router.get(
  '/records/viewer/areas',
  isAuthenticated,
  hasMenuAccess('/records/viewer'),
  recordsController.getAreasWithCount,
);

router.get(
  '/records/viewer/branches',
  isAuthenticated,
  hasMenuAccess('/records/viewer'),
  recordsController.getBranchesWithCount,
);

// END EMPLOYEE BRANCH ASSIGNMENT

// newly hired start
// Add these routes after your existing report routes

// New Hires Report routes
router.post(
  '/records/reports/newhires',
  isAuthenticated,
  hasMenuAccess('/employee/reports'),
  recordsController.generateNewHiresReport,
);

router.get(
  '/records/reports/newhires/export',
  isAuthenticated,
  hasMenuAccess('/employee/reports'),
  recordsController.exportNewHiresExcel,
);

router.get(
  '/records/reports/newhires/pdf',
  isAuthenticated,
  hasMenuAccess('/employee/reports'),
  recordsController.exportNewHiresPDF,
);
// end newly hired

module.exports = router;
