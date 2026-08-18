// // // Middleware to check if user is authenticated
// // exports.isAuthenticated = (req, res, next) => {
// //   if (req.session.user) {
// //     return next();
// //   }
// //   res.redirect("/");
// // };

// // // Middleware to redirect if user is already authenticated (for login/register pages)
// // exports.redirectIfAuthenticated = (req, res, next) => {
// //   if (req.session.user) {
// //     return res.redirect("/dashboard"); // Or wherever authenticated users should go
// //   }
// //   next(); // Continue if not authenticated
// // };

// // // ✅ NEW: Middleware to allow only Super Admin (role_id === 1)
// // exports.isSuperAdmin = (req, res, next) => {
// //   console.log("role_id", req.session.user.role_id);
// //   if (req.session.user && req.session.user.role_id === 6) {
// //     return next();
// //   }
// //   res.status(403).render("error/403"); // Optional: friendly error view
// // };

// // middleware/authMiddleware.js
// const db = require("../config/db").default;

// // Check if user is logged in
// exports.isAuthenticated = (req, res, next) => {
//   if (req.session && req.session.user) {
//     return next();
//   }

//   return res.redirect("/");
// };

// // Redirect logged-in users away from login/register
// exports.redirectIfAuthenticated = (req, res, next) => {
//   if (req.session && req.session.user) {
//     return res.redirect("/dashboard");
//   }

//   return next();
// };

// // Super Admin only
// exports.isSuperAdmin = (req, res, next) => {
//   if (
//     req.session &&
//     req.session.user &&
//     Number(req.session.user.role_id) === 6
//   ) {
//     return next();
//   }

//   return res.status(403).render("error/403", {
//     title: "Access Denied",
//     message: "You are not allowed to access this page.",
//   });
// };

// // Route-level menu authorization
// exports.hasMenuAccess = (requiredMenuUrl) => {
//   return async (req, res, next) => {
//     try {
//       if (!req.session || !req.session.user) {
//         return res.redirect("/");
//       }

//       const roleId = req.session.user.role_id;

//       // Super Admin bypass
//       if (Number(roleId) === 6) {
//         return next();
//       }

//       const [menus] = await db.query(
//         `
//         SELECT m.url
//         FROM main_menus m
//         INNER JOIN main_role_menus rm ON rm.menu_id = m.id
//         WHERE rm.role_id = ?
//           AND m.url = ?
//         LIMIT 1
//         `,
//         [roleId, requiredMenuUrl],
//       );

//       if (!menus.length) {
//         return res.status(403).render("error/403", {
//           title: "Access Denied",
//           message: "You do not have permission to access this module.",
//         });
//       }

//       return next();
//     } catch (error) {
//       console.error("Menu authorization error:", error);
//       return res.status(500).render("error", {
//         title: "Server Error",
//         message: "Authorization check failed.",
//       });
//     }
//   };
// };
// new code below 06302026

// middleware/authMiddleware.js
const db = require('../config/db').default;

// Check if user is logged in
exports.isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }

  return res.redirect('/');
};

// Redirect logged-in users away from login/register
exports.redirectIfAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }

  return next();
};

// Super Admin only
exports.isSuperAdmin = (req, res, next) => {
  if (req.session && req.session.user && Number(req.session.user.role_id) === 6) {
    return next();
  }

  return res.status(403).render('error/403', {
    title: 'Access Denied',
    message: 'You are not allowed to access this page.',
  });
};

// Route-level menu authorization
exports.hasMenuAccess = (requiredMenuUrl) => {
  return async (req, res, next) => {
    try {
      if (!req.session || !req.session.user) {
        return res.redirect('/');
      }

      const roleId = req.session.user.role_id;

      // Super Admin bypass
      if (Number(roleId) === 6) {
        return next();
      }
      console.log('%%%%%%% ', roleId, requiredMenuUrl);
      const [menus] = await db.query(
        `
        SELECT m.url
        FROM main_menus m
        INNER JOIN main_role_menus rm ON rm.menu_id = m.id
        WHERE rm.role_id = ?
          AND m.url = ?
        LIMIT 1
        `,
        [roleId, requiredMenuUrl],
      );

      if (!menus.length) {
        return res.status(403).render('error/403', {
          title: 'Access Denied',
          message: 'You do not have permission to access this module.',
        });
      }

      return next();
    } catch (error) {
      console.error('Menu authorization error:', error);
      return res.status(500).render('error', {
        title: 'Server Error',
        message: 'Authorization check failed.',
      });
    }
  };
};

// ✅ NEW: Middleware to make user data available to all views
exports.addUserToViews = (req, res, next) => {
  // Make user data available to all views
  if (req.session && req.session.user) {
    const user = req.session.user;

    // Expose individual fields for easy access in templates
    res.locals.user = user;
    res.locals.firstName = user.firstName;
    res.locals.lastName = user.lastName;
    res.locals.designation = user.designation;
    res.locals.userId = user.id;
    res.locals.roleId = user.role_id;

    // Convenience fields
    res.locals.fullName = `${user.firstName} ${user.lastName}`;
    res.locals.isSuperAdmin = Number(user.role_id) === 6;

    // For debugging (remove in production)
    // console.log('User data available in views:', {
    //   firstName: res.locals.firstName,
    //   lastName: res.locals.lastName,
    //   designation: res.locals.designation
    // });
  }

  // Add other global view data here if needed
  res.locals.appName = 'HRMD Portal';
  res.locals.currentYear = new Date().getFullYear();

  next();
};
