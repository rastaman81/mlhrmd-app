// controllers/dateController.js
const dateModel = require("../models/dateModel");

const getDatePage = (req, res) => {
  res.render("index", {
    data: null,
    regions: null,
    error: null,
    title: "home",
    date: null,
  });
};

const postDate = async (req, res) => {
  try {
    const { date } = req.body;
    const { results, regions } = await dateModel.getDateData(date);

    const dateObject = new Date(date);

    // Format the Date object into a human-readable string
    const formattedDate = dateObject.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Sort the array by 'sourcename'
    regions.sort((a, b) => {
      if (a.sourcename < b.sourcename) return -1;
      if (a.sourcename > b.sourcename) return 1;
      return 0;
    });

    res.render("index", {
      regions: regions,
      data: results,
      title: "home", // Ensure title is defined here
      error: null,
      date: formattedDate, // Pass formatted date here
    });
  } catch (err) {
    res.render("index", {
      data: null,
      error: "Error fetching data",
      title: "home",
      date: null, // Ensure date is passed even in case of error
    });
  }
};

module.exports = { getDatePage, postDate };