const db = require('../config/db');
const utilitiesModel = require('../models/utilitiesModel');

exports.getDashboard = async (req, res) => {
  console.log('1 - Session verification start');
  if (!req.session.user) {
    console.log('Redirecting to login - no user in session');
    return res.redirect('/');
  }

  console.log('2 - Preparing to query menus for role:', req.session.user.role_id);

  try {
    const offices = await utilitiesModel.getOffice();

    const query = `
        SELECT m.menu_name, m.url, m.icon
        FROM main_menus m
        JOIN main_role_menus rm ON m.id = rm.menu_id
        WHERE rm.role_id = ? order by menu_name
      `;

    console.log('3 - Executing query...');
    //const [results] = await db.query(query, [req.session.user.role_id]);
    const [results] = await db.default.query(query, [req.session.user.role_id]);

    console.log('4 - Query successful, results count:', results.length);
    console.log('5 - Sample menu item:', results[0]);
    console.log('%%%% ', req.session.user.username);
    const viewData = {
      title: 'Dashboard',
      username: req.session.user.username,
      menus: results,
      offices: offices,
      selectedOffice: req.query.office || '',
    };

    console.log('6 - Rendering dashboard...');
    return res.render('dashboard', viewData);
  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).render('error', { error: err.message });
  }
};

exports.addMenuPage = (req, res) => {
  res.render('admin/addMenu', {
    title: 'Add Menu',
    username: req.session.user.username,
  });
};
exports.saveMenu = async (req, res) => {
  const { menu_name, url, icon } = req.body;

  try {
    //await db.query(
    await db.default.query('INSERT INTO main_menus (menu_name, url, icon) VALUES (?, ?, ?)', [
      menu_name,
      url,
      icon,
    ]);
    res.redirect('/admin/menus');
  } catch (err) {
    console.error('Error saving menu:', err);
    res.status(500).render('error', { error: err.message });
  }
};
