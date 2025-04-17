const express = require('express');
const router = express.Router();
const { pool, sql } = require('../database'); // Добавлен импорт sql
const bcrypt = require('bcrypt');

// Регистрация
router.get('/register', (req, res) => res.render('users/register'));
router.post('/register', async (req, res) => {
  const { username, password, email } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  
  try {
    await pool.request()
      .input('username', sql.NVarChar(50), username) // Указана длина
      .input('password', sql.NVarChar(255), hashedPassword)
      .input('email', sql.NVarChar(100), email)
      .query('INSERT INTO Users (Username, PasswordHash, Email) VALUES (@username, @password, @email)');
      
    res.redirect('/auth/login');
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка регистрации');
  }
});

// Вход
router.get('/login', (req, res) => res.render('users/login'));
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  // Исправленный запрос с CONVERT
  const result = await pool.request()
    .input('username', sql.NVarChar(50), username)
    .query(`
      SELECT * 
      FROM Users 
      WHERE CONVERT(NVARCHAR(50), Username) = @username
    `);

  if (result.recordset.length === 0 || !await bcrypt.compare(password, result.recordset[0].PasswordHash)) {
    return res.status(401).send('Неверные учетные данные');
  }

  req.session.userId = result.recordset[0].UserID;
  res.redirect('/');
});

// Выход
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;