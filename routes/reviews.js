const express = require('express');
const router = express.Router();
const { pool, sql } = require('../database');

// Добавление отзыва
router.post('/', async (req, res) => {
  try {
    const { targetType, targetId, rating, comment } = req.body;
    const reviewerId = req.session.userId;

    await pool.request()
      .input('reviewerId', sql.Int, reviewerId)
      .input('targetType', sql.NVarChar(20), targetType)
      .input('targetId', sql.Int, targetId)
      .input('rating', sql.Int, rating)
      .input('comment', sql.NVarChar(sql.MAX), comment) // Исправлено
      .query(`
        IF NOT EXISTS (
          SELECT 1 FROM Reviews 
          WHERE ReviewerUserID = @reviewerId 
          AND TargetType = @targetType 
          AND TargetID = @targetId
        )
        BEGIN
          INSERT INTO Reviews (ReviewerUserID, TargetType, TargetID, Rating, Comment)
          VALUES (@reviewerId, @targetType, @targetId, @rating, @comment)
        END
      `);

    res.redirect('back');
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка добавления отзыва');
  }
});

// Удаление отзыва
router.post('/:id/delete', async (req, res) => {
  await pool.request()
    .input('id', sql.Int, req.params.id)
    .query('DELETE FROM Reviews WHERE ReviewID = @id');
  res.redirect('back');
});

module.exports = router;