// controllers/authController.js
const bcrypt = require("bcrypt");
//const connectDB = require("../models/db"); // Your database connection
const connectDB = require("../config/db");

// ----------------------------------------- REGISTER NEW USER ----------------------------------------- //
exports.registerUser = async (req, res) => {
  const { username, password, email } = req.body;
  const db = connectDB("vismin"); // Replace with your actual database name

  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user into the database
    const query = `INSERT INTO main_users (user_name, user_password, user_email) VALUES (?, ?, ?)`;
    db.query(query, [username, hashedPassword, email], (err, result) => {
      if (err) {
        console.error("Error during registration:", err);
        return res.status(500).send("Error during registration");
      }
      res.redirect("/login"); // Redirect to login page after successful registration
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send("Server error");
  }
};
// ----------------------------------------- REGISTER NEW USER ----------------------------------------- //

// ----------------------------------------- RENDER LOGIN PAGE ----------------------------------------- //
exports.getLoginPage = (req, res) => {
  res.render("login", { error: null });
};
// ----------------------------------------- REGISTER NEW USER ----------------------------------------- //

// ----------------------------------------- AUTHENTICATE USER FROM MYSQL DATABASE ----------------------------------------- //
exports.postLogin = async (req, res) => {
  const { username, password } = req.body;
  const db = connectDB("vismin");
  //const db = connectDB("your_database_name");

  try {
    const query = `SELECT * FROM main_users WHERE user_name = ?`;
    db.query(query, [username], async (err, results) => {
      if (err) throw err;

      if (results.length > 0) {
        const user = results[0];

        // Compare the hashed password stored in the DB with the entered password
        const isMatch = await bcrypt.compare(password, user.user_password);

        if (isMatch) {
          // Passwords match, create a session
          req.session.user = { id: user.id, username: user.username };
          return res.redirect("/reports");
        } else {
          // Passwords do not match
          res.render("login", { error: "Invalid username or password" });
        }
      } else {
        // User not found
        res.render("login", { message: "User not found" });
      }
    });
  } catch (err) {
    console.error("Error during login:", err);
    res.status(500).send("Server Error");
  }
};
// ----------------------------------------- AUTHENTICATE USER FROM MYSQL DATABASE ----------------------------------------- //

// ----------------------------------------- LOGOUT FROM THE APP ----------------------------------------- //
exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send("Failed to log out");
    }
    res.redirect("/login");
  });
};
// ----------------------------------------- LOGOUT FROM THE APP ----------------------------------------- //

// // controllers/authController.js
// const users = [
//   { username: "admin", password: "password123" }, // Sample user
// ];

// // GET route for login page
// exports.getLoginPage = (req, res) => {
//   res.render("login", { error: null });
// };

// // POST route for login form submission
// exports.postLogin = (req, res) => {
//   const { username, password } = req.body;

//   const user = users.find(
//     (u) => u.username === username && u.password === password
//   );

//   if (user) {
//     req.session.user = user; // Store user session
//     res.redirect("/reports"); // Redirect to reports page on success
//   } else {
//     res.render("login", { error: "Invalid username or password" });
//   }
// };

// // GET route for logout
// exports.logout = (req, res) => {
//   req.session.destroy(() => {
//     res.redirect("/login"); // Redirect to login after logout
//   });
// };
