const db = require('../config/db').default;
const bcrypt = require('bcrypt');

// View Users
exports.viewUsers = async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT u.user_id, u.user_name, r.role_name FROM main_users u JOIN main_roles r ON u.role_id = r.id',
    );
    res.render('admin/users', { users });
  } catch (err) {
    console.error(err);
    res.status(500).render('error');
  }
};

// Edit User Form
exports.editUserPage = async (req, res) => {
  try {
    const userId = req.params.id;
    const [userResults] = await db.query('SELECT * FROM main_users WHERE id = ?', [userId]);
    const [roleResults] = await db.query('SELECT * FROM main_roles');

    res.render('admin/editUser', {
      user: userResults[0],
      roles: roleResults,
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error');
  }
};

// Update User
exports.updateUser = async (req, res) => {
  try {
    const { username, password, role_id } = req.body;
    const userId = req.params.id;

    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      await db.query('UPDATE main_users SET username = ?, password = ?, role_id = ? WHERE id = ?', [
        username,
        hashed,
        role_id,
        userId,
      ]);
    } else {
      await db.query('UPDATE main_users SET username = ?, role_id = ? WHERE id = ?', [
        username,
        role_id,
        userId,
      ]);
    }

    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    res.status(500).render('error');
  }
};

// Delete User
exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    await db.query('DELETE FROM main_users WHERE id = ?', [userId]);
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    res.status(500).render('error');
  }
};

// View Menus
exports.viewMenus = async (req, res) => {
  try {
    const [menus] = await db.query('SELECT * FROM main_menus order by menu_name');
    res.render('admin/menus', { menus });
  } catch (err) {
    console.error(err);
    res.status(500).render('error');
  }
};

// Assign Menus Page
exports.assignMenusPage = async (req, res) => {
  try {
    const [roles] = await db.query('SELECT * FROM main_roles');
    const [menus] = await db.query('SELECT * FROM main_menus order by menu_name');

    res.render('admin/assignMenus', { roles, menus });
  } catch (err) {
    console.error(err);
    res.status(500).render('error');
  }
};

// Assign Menus to Role
exports.assignMenus = async (req, res) => {
  try {
    const { role_id, menu_ids } = req.body;

    await db.query('DELETE FROM main_role_menus WHERE role_id = ?', [role_id]);

    if (Array.isArray(menu_ids)) {
      const inserts = menu_ids.map((id) => [role_id, id]);
      await db.query('INSERT INTO main_role_menus (role_id, menu_id) VALUES ?', [inserts]);
    }

    res.redirect('/admin/assign-menus');
  } catch (err) {
    console.error(err);
    res.status(500).render('error');
  }
};
