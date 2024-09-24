// routes/routes.js
const express = require("express");
const dateController = require("../controllers/dateController");
const pdfController = require("../controllers/pdfController");
const authController = require("../controllers/authController");
const employeeController = require("../controllers/employeeController");

const router = express.Router();

// Route to render registration form
router.get("/register", (req, res) => {
  res.render("register");
});

// Registration route (to handle form submission)
router.post("/register", authController.registerUser);
// Middleware to check if user is logged in
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next(); // If user is authenticated, proceed to the next middleware or route handler
  } else {
    res.redirect("/login"); // If not authenticated, redirect to login page
  }
}

// Search page
router.get("/search", employeeController.searchPage);

// Search for employees
router.post("/employees/search", employeeController.searchEmployees);
router.get("/employees/search", employeeController.searchEmployees); // Add this line

// Get employee details by ID
router.get("/employees/:id", employeeController.getEmployeeDetails);

// Protected routes that require authentication
router.get("/reports", isAuthenticated, dateController.getDatePage);
router.post("/reports", isAuthenticated, dateController.postDate);
router.post("/generate-pdf", isAuthenticated, pdfController.generatePDF);

// Login and Logout routes
router.get("/login", authController.getLoginPage);
router.post("/login", authController.postLogin);
router.get("/logout", authController.logout);

module.exports = router;
