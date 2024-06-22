const express = require("express");
const dotenv = require("dotenv");
const session = require("express-session");
const flash = require("connect-flash");
const bodyParser = require("body-parser");
const mysql = require("mysql");
const hbs = require("hbs");
const morgan = require("morgan");

const app = express();
const path = require("path");

//get the db credentials
dotenv.config({ path: "./.env" });

//setting up session
app.use(
  session({
    secret: "secret",
    resave: true,
    saveUninitialized: true,
  })
);

//using flash
app.use(flash());

//using bodyParser
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//creating mysql connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DATABASE,
});

//Create Connection Pool to handle multiple connections
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DATABASE,
  //connectionLimit: 100 // Adjust the connection limit as per your requirements
});

db.connect((error) => {
  if (error) {
    console.log(error);
  } else {
    console.log("Successfully connected to MySQL");
  }
});

// setup for view engine
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "views"));
hbs.registerPartials(path.join(__dirname, "views", "partials"));

//A middleware for (console)request logger
app.use(morgan("dev"));

app.use(express.static("public"));

//Login - get
app.get("/", (req, res) => {
  res.render("login", { error: req.flash("error") }); //login alert(flash) for incorrect input
});

app.post("/home", (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  if (username && password) {
    db.query(
      "SELECT * FROM usercredentials WHERE username = ? AND password = PASSWORD(?)",
      [username, password],
      (error, results, fields) => {
        if (results.length > 0) {
          req.session.loggedin = true;
          req.session.username = username;

          res.redirect("/home"); // direct to home link
        } else {
          console.log("Incorrect Username and/or Password.");
          req.flash(
            "error",
            "Incorrect Username and/or Password! Please try again."
          ); // Store error message in flash
          //res.send('<script>alert("Incorrect Username and/or Password! Please try again."); window.location.href = "/";</script>');
          res.redirect("/");
        }
        res.end();
      }
    );
  } else {
    console.log("Please enter Username and Password!");
    res.end();
  }
});

//Start server with port
app.listen(3000, () => {
  console.log(`The server has started on port ${3000}`);
});
