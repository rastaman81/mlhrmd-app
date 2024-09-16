// config/db.js
const mysql = require("mysql2");
const dotenv = require("dotenv");

dotenv.config();

const luzonConnection = mysql.createConnection({
  host: process.env.LUZON_DB_HOST,
  user: process.env.LUZON_DB_USER, // use lowercase `user`
  password: process.env.LUZON_DB_PASSWORD,
  database: process.env.LUZON_DB_NAME,
});

const visminConnection = mysql.createConnection({
  host: process.env.VISMIN_DB_HOST,
  user: process.env.VISMIN_DB_USER, // use lowercase `user`
  password: process.env.VISMIN_DB_PASSWORD,
  database: process.env.VISMIN_DB_NAME,
});

const mlGroupConnection = mysql.createConnection({
  host: process.env.MLGROUP_DB_HOST,
  user: process.env.MLGROUP_DB_USER, // use lowercase `user`
  password: process.env.MLGROUP_DB_PASSWORD,
  database: process.env.MLGROUP_DB_NAME,
});

const connectDB = (dbName) => {
  switch (dbName) {
    case "luzon":
      return luzonConnection;
    case "vismin":
      return visminConnection;
    case "mlgroup":
      return mlGroupConnection;
    default:
      throw new Error("Invalid database name.");
  }
};

module.exports = connectDB;

//-------------------------------- ORIGINAL CONNECTION CODE
// const connection = mysql.createConnection({
//   host: process.env.DB_HOST,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME,
// });

// connection.connect((err) => {
//   if (err) {
//     console.error("Database connection failed:", err.stack);
//     return;
//   }
//   console.log("Connected to database.");
// });
//-------------------------------- ORIGINAL CONNECTION CODE
