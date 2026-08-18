const bcrypt = require('bcrypt');
const db = require('../config/db');

exports.loginPage = (req, res) => {
  res.render('auth/login', { title: 'Login' });
};

exports.loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.render('auth/login', {
        error: 'Please provide both username and password',
      });
    }

    //const [users] = await db.query(
    const [users] = await db.default.query('SELECT * FROM main_users WHERE user_name = ?', [
      username,
    ]);

    if (!users.length) {
      return res.render('auth/login', {
        error: 'Invalid username or password',
      });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.user_password);

    if (!isMatch) {
      return res.render('auth/login', {
        error: 'Invalid username or password',
      });
    }

    // const userSessionData = {
    //   id: user.id,
    //   username: user.user_name,
    //   role_id: user.role_id,
    // };
    const userSessionData = {
      id: user.user_id,
      user_id: user.user_id, // For consistency
      idno: user.idno, // Employee ID number
      username: user.user_name, // Login username
      firstName: user.first_name,
      lastName: user.last_name,
      fullName: `${user.first_name} ${user.last_name}`.trim(), // Full name
      designation: user.designation,
      email: user.user_email,
      role_id: user.role_id,
    };
    console.log('--------------- ', userSessionData);
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration error:', err);
        return res.status(500).render('error');
      }

      req.session.user = userSessionData;

      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).render('error');
        }

        console.log('Login successful, redirecting to dashboard');
        return res.redirect('/dashboard');
      });
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).render('error');
  }
};

exports.logoutUser = (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
};

// exports.registerPage = (req, res) => {
//   res.render("auth/register", { title: "Register User" });
// };

exports.registerPage = async (req, res) => {
  try {
    const [roles] = await db.default.query(`
      SELECT
        id,
        role_name
      FROM main_roles
      WHERE is_active = 1
      ORDER BY role_name
    `);

    res.render('auth/register', {
      title: 'Register User',
      roles,
    });
  } catch (err) {
    console.error('Load Register Page Error:', err);

    res.render('auth/register', {
      title: 'Register User',
      error: 'Unable to load roles.',
    });
  }
};

exports.registerUser = async (req, res) => {
  try {
    const [roles] = await db.default.query(`
      SELECT
        id,
        role_name
      FROM main_roles
      WHERE is_active = 1
      ORDER BY role_name
    `);

    // Get all fields from the form
    const { username, password, role_id, idno, firstname, lastname, designation, email } = req.body;

    console.log('Registration data:', req.body);

    // Validate required fields
    if (
      !username ||
      !password ||
      !role_id ||
      !idno ||
      !firstname ||
      !lastname ||
      !designation ||
      !email
    ) {
      return res.render('auth/register', {
        title: 'Register User',
        roles,
        error: 'All fields are required.',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.render('auth/register', {
        title: 'Register User',
        roles,
        error: 'Please enter a valid email address.',
      });
    }

    // Check if username already exists
    const [existingUsers] = await db.default.query(
      'SELECT user_id FROM main_users WHERE user_name = ?',
      [username],
    );

    if (existingUsers.length) {
      return res.render('auth/register', {
        title: 'Register User',
        roles,
        error: 'Username already exists. Please choose a different one.',
      });
    }

    // Check if ID number already exists
    const [existingIdno] = await db.default.query('SELECT user_id FROM main_users WHERE idno = ?', [
      idno,
    ]);

    if (existingIdno.length) {
      return res.render('auth/register', {
        title: 'Register User',
        roles,
        error: 'ID Number already exists. Please use a unique ID number.',
      });
    }

    // Check if email already exists
    const [existingEmail] = await db.default.query(
      'SELECT user_id FROM main_users WHERE user_email = ?',
      [email],
    );

    if (existingEmail.length) {
      return res.render('auth/register', {
        title: 'Register User',
        roles,
        error: 'Email address already registered. Please use a different email.',
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user with all fields
    // created_at will be automatically set by MySQL default
    await db.default.query(
      `INSERT INTO main_users 
       (idno, user_name, user_password, first_name, last_name, designation, user_email, role_id, is_active) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [idno, username, hashedPassword, firstname, lastname, designation, email, role_id, 1],
    );

    console.log('User registration successful at:', new Date().toISOString());

    return res.render('auth/register', {
      title: 'Register User',
      roles,
      success: 'User successfully registered.',
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.render('auth/register', {
      title: 'Register User',
      error: 'Registration failed. Please try again.',
    });
  }
};

exports.changePasswordPage = (req, res) => {
  res.render('auth/change-password', {
    title: 'Change Password',
  });
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.render('auth/change-password', {
        title: 'Change Password',
        error: 'All fields are required.',
      });
    }

    if (newPassword !== confirmPassword) {
      return res.render('auth/change-password', {
        title: 'Change Password',
        error: 'New password and confirmation password do not match.',
      });
    }

    const userId = req.session.user.id;

    const [users] = await db.default.query(
      `
      SELECT user_id,
             user_password
      FROM main_users
      WHERE user_id = ?
      `,
      [userId],
    );

    if (!users.length) {
      return res.render('auth/change-password', {
        title: 'Change Password',
        error: 'User not found.',
      });
    }

    const user = users[0];

    const passwordMatch = await bcrypt.compare(currentPassword, user.user_password);

    if (!passwordMatch) {
      return res.render('auth/change-password', {
        title: 'Change Password',
        error: 'Current password is incorrect.',
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.default.query(
      `
      UPDATE main_users
      SET user_password = ?
      WHERE user_id = ?
      `,
      [hashedPassword, userId],
    );

    return res.render('auth/change-password', {
      title: 'Change Password',
      success: 'Password successfully updated.',
    });
  } catch (err) {
    console.error('Change Password Error:', err);

    return res.render('auth/change-password', {
      title: 'Change Password',
      error: 'An unexpected error occurred.',
    });
  }
};

exports.resetPasswordPage = async (req, res) => {
  try {
    const userId = req.params.id;
    console.log('user id: ', userId);
    const [users] = await db.default.query(
      `
      SELECT
          user_id,
          user_name,
          first_name, 
          last_name,
          designation
      FROM main_users
      WHERE user_id = ?
      `,
      [userId],
    );

    if (!users.length) {
      return res.redirect('/admin/users');
    }

    res.render('admin/reset-password', {
      title: 'Reset Password',
      user: users[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error');
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const userId = req.params.id;
    const { newPassword, confirmPassword } = req.body;

    // 🔥 fetch user first (IMPORTANT)
    const [users] = await db.default.query(
      `
      SELECT user_id, user_name, first_name, last_name, designation
      FROM main_users
      WHERE user_id = ?
      `,
      [userId],
    );

    if (!users.length) {
      return res.redirect('/admin/users');
    }

    const user = users[0];

    // ❌ validation: missing fields
    if (!newPassword || !confirmPassword) {
      return res.render('admin/reset-password', {
        title: 'Reset Password',
        user,
        error: 'All fields are required.',
        clearFields: true,
      });
    }

    // ❌ validation: mismatch
    if (newPassword !== confirmPassword) {
      return res.render('admin/reset-password', {
        title: 'Reset Password',
        user,
        error: 'Passwords do not match.',
        clearFields: true,
      });
    }

    // ✅ update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.default.query(
      `
      UPDATE main_users
      SET user_password = ?
      WHERE user_id = ?
      `,
      [hashedPassword, userId],
    );

    return res.render('admin/reset-password', {
      title: 'Reset Password',
      user,
      success: 'Password successfully reset.',
    });
  } catch (err) {
    console.error(err);

    return res.render('admin/reset-password', {
      title: 'Reset Password',
      error: 'Unable to reset password.',
      clearFields: true,
    });
  }
};
