const express = require('express');
const router = express.Router();
const { pool, sql } = require('../database');
const bcrypt = require('bcrypt');

// Просмотр профиля
router.get('/:id', async (req, res) => {
  if (!req.session.userId) return res.redirect('/auth/login');
  
  try {
    // Запрос данных пользователя
    const userRequest = await pool.request()
  .input('id', sql.Int, req.params.id)
  .query(`
    SELECT 
      UserID,
      Username,
      Email,
      CreatedAt,
      ISNULL((
        SELECT AVG(CAST(Rating AS DECIMAL(3,1))) 
        FROM Reviews 
        WHERE TargetID = Users.UserID 
          AND TargetType = 'user'
      ), 0) AS AvgRating
    FROM Users
    WHERE UserID = @id
  `);

    if (userRequest.recordset.length === 0) {
      return res.status(404).send('Пользователь не найден');
    }

    // Запрос объявлений пользователя
    const adsRequest = await pool.request()
      .input('userId', sql.Int, req.params.id)
      .query('SELECT * FROM Ads WHERE UserID = @userId');

    res.render('users/profile', {
      user: userRequest.recordset[0],
      ads: adsRequest.recordset,
      userId: req.session.userId
    });

  } catch (err) {
    console.error('Ошибка загрузки профиля:', err);
    res.status(500).send('Ошибка загрузки профиля');
  }
});

// Форма редактирования профиля
router.get('/:id/edit', async (req, res) => {
  if (req.session.userId != req.params.id) {
    return res.status(403).send('Доступ запрещен');
  }

  try {
    const user = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT UserID, Email FROM Users WHERE UserID = @id');

    res.render('users/edit', {
      user: user.recordset[0],
      userId: req.session.userId // Добавлено
    });
  } catch (err) {
    console.error('Ошибка загрузки формы:', err);
    res.status(500).send('Ошибка загрузки формы');
  }
});

// Обработка редактирования профиля
router.post('/:id/edit', async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;
    const updates = [];
    const inputs = {};

    // Проверка прав доступа
    if (req.session.userId != req.params.id) {
      return res.status(403).send('Доступ запрещен');
    }

    // Валидация email
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.redirect(`/users/${req.params.id}/edit?error=Некорректный email`);
      }
      
      updates.push('Email = @email');
      inputs.email = {
        type: sql.NVarChar(100),
        value: email.trim()
      };
    }

    // Обработка смены пароля
    if (oldPassword && newPassword) {
      if (newPassword.length < 6) {
        return res.redirect(`/users/${req.params.id}/edit?error=Пароль должен быть не менее 6 символов`);
      }

      const user = await pool.request()
        .input('id', sql.Int, req.params.id)
        .query('SELECT PasswordHash FROM Users WHERE UserID = @id');

      if (!await bcrypt.compare(oldPassword, user.recordset[0].PasswordHash)) {
        return res.redirect(`/users/${req.params.id}/edit?error=Неверный текущий пароль`);
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updates.push('PasswordHash = @password');
      inputs.password = {
        type: sql.NVarChar(255),
        value: hashedPassword
      };
    }

    // Обновление данных
    if (updates.length > 0) {
      const request = pool.request()
        .input('id', sql.Int, req.params.id);

      for (const [key, value] of Object.entries(inputs)) {
        request.input(key, value.type, value.value);
      }

      await request.query(`UPDATE Users SET ${updates.join(', ')} WHERE UserID = @id`);
    }

    res.redirect(`/users/${req.params.id}`);

  } catch (err) {
    console.error('Ошибка обновления:', err);
    res.redirect(`/users/${req.params.id}/edit?error=Ошибка сохранения данных`);
  }
});

module.exports = router;