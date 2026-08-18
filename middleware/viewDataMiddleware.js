// middleware/viewDataMiddleware.js
const db = require('../config/db');

async function addViewData(req, res, next) {
  try {
    // Check if user is authenticated using your session system
    if (req.session && req.session.user) {
      const user = req.session.user;

      // ✅ ADD THESE LINES - Make all user data available to views
      res.locals.user = user;
      res.locals.firstName = user.firstName;
      res.locals.lastName = user.lastName;
      res.locals.designation = user.designation;
      res.locals.userId = user.id;
      res.locals.roleId = user.role_id;

      // Keep existing username for backward compatibility
      res.locals.username = user.username || user.user_name;

      // Convenience fields
      res.locals.fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
      res.locals.isSuperAdmin = Number(user.role_id) === 6;

      // Get menus for the user's role (existing functionality - KEEP THIS)
      const [menus] = await db.default.query(
        `SELECT m.menu_name, m.url, m.icon
         FROM main_menus m
         JOIN main_role_menus rm ON m.id = rm.menu_id
         WHERE rm.role_id = ? order by menu_name`,
        [req.session.user.role_id],
      );

      res.locals.menus = menus;
    }

    next();
  } catch (error) {
    console.error('Error in viewDataMiddleware:', error);
    next();
  }
}

module.exports = addViewData;
