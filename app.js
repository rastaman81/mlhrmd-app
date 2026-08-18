const express = require('express');
const session = require('express-session');
const path = require('path');
const dotenv = require('dotenv');
const hbs = require('hbs');
const routes = require('./routes/routes');
const addViewData = require('./middleware/viewDataMiddleware');
// Load environment variables
dotenv.config();

const app = express();

// Configure request size limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configure Handlebars helpers and partials
hbs.registerPartials(path.join(__dirname, 'views/partials'));

// =============================================
// Enhanced Handlebars Helpers
// =============================================

// Condition helper
hbs.registerHelper('ifCond', function (v1, operator, v2, options) {
  if (!options) {
    // Fallback if called inline
    return '';
  }

  switch (operator) {
    case '==':
      return v1 == v2 ? options.fn(this) : options.inverse(this);
    case '===':
      return v1 === v2 ? options.fn(this) : options.inverse(this);
    case '!=':
      return v1 != v2 ? options.fn(this) : options.inverse(this);
    case '!==':
      return v1 !== v2 ? options.fn(this) : options.inverse(this);
    case '<':
      return v1 < v2 ? options.fn(this) : options.inverse(this);
    case '<=':
      return v1 <= v2 ? options.fn(this) : options.inverse(this);
    case '>':
      return v1 > v2 ? options.fn(this) : options.inverse(this);
    case '>=':
      return v1 >= v2 ? options.fn(this) : options.inverse(this);
    default:
      return options.inverse(this);
  }
});

// Date formatter
hbs.registerHelper('formatDate', function (dateString, options) {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  // HTML5 date input format (when format='html' is passed)
  if (options && options.hash && options.hash.format === 'html') {
    const pad = (num) => num.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  // Default formatting for display
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
});

hbs.registerHelper('val', function (value) {
  if (
    value === null ||
    value === undefined ||
    value === 'null' ||
    value === '(null)' ||
    value === ''
  ) {
    return '';
  }
  return value;
});

hbs.registerHelper('formatNumericDate', function (dateString, format) {
  const date = new Date(dateString);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
});

// Custom helper to format a number to 2 decimal places or return 0.00 if no value is provided
hbs.registerHelper('formatNumber', function (value) {
  // If value is null, undefined, or an empty string, return "0.00"
  if (value === null || value === undefined || value === '' || isNaN(value)) {
    return '0.00';
  }
  // Otherwise, return the number formatted to 2 decimal places
  return parseFloat(value).toFixed(2);
});

// =============================================
// NEW HELPERS FOR INVENTORY MANAGEMENT
// =============================================

// Equality checker (you already have this but I'm including it for completeness)
hbs.registerHelper('eq', function (a, b) {
  return a === b;
});

// Greater than
hbs.registerHelper('gt', function (a, b) {
  return a > b;
});

// Less than
hbs.registerHelper('lt', function (a, b) {
  return a < b;
});

// Addition
hbs.registerHelper('add', function (a, b) {
  return a + b;
});

// Subtraction
hbs.registerHelper('dec', function (a, b) {
  return a - b;
});

// Addition (alias for inc)
hbs.registerHelper('inc', function (a, b) {
  return a + b;
});

// Range helper for pagination
hbs.registerHelper('range', function (start, end) {
  const result = [];
  for (let i = start; i <= end; i++) {
    result.push(i);
  }
  return result;
});

// JSON stringifier (you already have this too)
hbs.registerHelper('json', function (context) {
  return JSON.stringify(context);
});

// Sum helper for arrays
hbs.registerHelper('sum', function (items) {
  if (!items || !items.length) return 0;
  return items.reduce((sum, item) => sum + (item || 0), 0);
});

// =============================================
// Middleware Configuration
// =============================================

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      httpOnly: true,
      //secure: process.env.NODE_ENV === 'production',
      secure: false,
      sameSite: 'lax',
    },
  }),
);
app.use(addViewData);

// View Engine
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/', routes);

// =============================================
// Error Handling
// =============================================

// 404 Handler
app.use((req, res, next) => {
  res.status(404).render('error/404', {
    title: 'Page Not Found',
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    error: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
    layout: false,
  });
});

// =============================================
// Server Initialization
// =============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
