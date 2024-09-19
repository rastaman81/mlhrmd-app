// controllers/dateController.js
const dateModel = require("../models/dateModel");

const getDatePage = async (req, res) => {
  try {
    const offices = await dateModel.getOffices();
    const reports = await dateModel.getReports();

    res.render("index", {
      data: null,
      offices: offices,
      reports: reports,
      regions: null,
      error: null,
      title: "home",
      date: null,
    });
  } catch (error) {
    console.error("Error loading data:", error); // Logs the error details

    res.render("index", {
      data: null,
      offices: [],
      reports: [],
      regions: null,
      error: "Error loading offices or reports",
      title: "home",
      date: null,
    });
  }
};

// const postDate = async (req, res) => {
//   try {
//     const { date } = req.body;
//     const { results, regions } = await dateModel.getDateData(date);

//     const dateObject = new Date(date);

//     // Format the Date object into a human-readable string
//     const formattedDate = dateObject.toLocaleDateString("en-US", {
//       year: "numeric",
//       month: "long",
//       day: "numeric",
//     });

//     // Sort the array by 'sourcename'
//     regions.sort((a, b) => {
//       if (a.sourcename < b.sourcename) return -1;
//       if (a.sourcename > b.sourcename) return 1;
//       return 0;
//     });

//     res.render("index", {
//       regions: regions,
//       data: results,
//       title: "home", // Ensure title is defined here
//       error: null,
//       date: formattedDate, // Pass formatted date here
//     });
//   } catch (err) {
//     res.render("index", {
//       data: null,
//       error: "Error fetching data",
//       title: "home",
//       date: null, // Ensure date is passed even in case of error
//     });
//   }
// };

const postDate = async (req, res) => {
  try {
    const { date, office, report } = req.body;
    const { results, regions } = await dateModel.generateReport(
      date,
      office,
      report
    );

    // Return the fetched data as JSON
    res.json({ data: results, error: null });
  } catch (err) {
    // Return the error message in JSON format
    res.json({ data: null, error: "Error fetching data" });
  }
};

module.exports = { getDatePage, postDate };
