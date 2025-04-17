const express = require('express');
const router = express.Router();
const { pool, sql } = require('../database');
const csrf = require('csurf');

// Используем CSRF через сессии
const csrfProtection = csrf();

// Middleware проверки прав владельца объявления
const checkAdOwnership = async (req, res, next) => {
    try {
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT UserID FROM Ads WHERE AdID = @id');

        if (!result.recordset[0] || result.recordset[0].UserID !== req.session.userId) {
            return res.status(403).send('Доступ запрещён');
        }
        next();
    } catch (err) {
        next(err);
    }
};

module.exports = (upload) => {
    // GET: форма создания объявления
    router.get('/create', csrfProtection, async (req, res) => {
        if (!req.session.userId) return res.redirect('/auth/login');

        try {
            const categories = await pool.request().query('SELECT * FROM Categories');
            res.render('ads/create', {
                categories: categories.recordset,
                csrfToken: req.csrfToken(),
                userId: req.session.userId
            });
        } catch (err) {
            console.error(err);
            res.status(500).send('Ошибка загрузки формы');
        }
    });

    // POST: создание объявления
    router.post('/create', csrfProtection, upload.single('image'), async (req, res) => {
        if (!req.session.userId) return res.redirect('/auth/login');

        const { title, description, price, categories } = req.body;
        const userId = req.session.userId;
        const imagePath = req.file?.filename || null;

        try {
            const adResult = await pool.request()
                .input('title', sql.NVarChar(255), title)
                .input('description', sql.NVarChar(sql.MAX), description)
                .input('price', sql.Decimal(10, 2), price)
                .input('userId', sql.Int, userId)
                .input('image', sql.NVarChar(255), imagePath)
                .query(`INSERT INTO Ads (Title, Description, Price, UserID, ImagePath) 
                    OUTPUT INSERTED.AdID 
                    VALUES (@title, @description, @price, @userId, @image)
                `);

            const adId = adResult.recordset[0].AdID;

            if (categories?.length) {
                const categoryArray = Array.isArray(categories) ? categories : [categories];
                await Promise.all(categoryArray.map(categoryId =>
                    pool.request()
                        .input('adId', sql.Int, adId)
                        .input('categoryId', sql.Int, categoryId)
                        .query('INSERT INTO AdCategories (AdID, CategoryID) VALUES (@adId, @categoryId)')
                ));
            }

            res.redirect(`/ads/${adId}`);
        } catch (err) {
            console.error(err);
            const categoriesList = await pool.request().query('SELECT * FROM Categories');
            res.status(500).render('ads/create', {
                error: 'Ошибка создания',
                categories: categoriesList.recordset,
                csrfToken: req.csrfToken(),
                userId: req.session.userId
            });
        }
    });

    // GET: просмотр объявления
    router.get('/:id', csrfProtection, async (req, res) => {
        try {
            const ad = await pool.request()
                .input('id', sql.Int, req.params.id)
                .query(`
                    SELECT Ads.*, Users.Username,
                        STRING_AGG(CAST(Categories.Name AS NVARCHAR(MAX)), ', ') AS Categories
                    FROM Ads
                    LEFT JOIN Users ON Ads.UserID = Users.UserID
                    LEFT JOIN AdCategories ON Ads.AdID = AdCategories.AdID
                    LEFT JOIN Categories ON AdCategories.CategoryID = Categories.CategoryID
                    WHERE Ads.AdID = @id
                    GROUP BY Ads.AdID, Ads.Title, Ads.Description, Ads.Price, Ads.ImagePath,
                             Ads.UserID, Ads.CreatedAt, Users.Username
                `);

            if (!ad.recordset[0]) return res.status(404).send('Объявление не найдено');

            const reviews = await pool.request()
                .input('targetId', sql.Int, req.params.id)
                .query(`
                    SELECT Reviews.*, Users.Username 
                    FROM Reviews
                    LEFT JOIN Users ON Reviews.ReviewerUserID = Users.UserID
                    WHERE TargetID = @targetId AND TargetType = 'ad'
                `);

            res.render('ads/view', {
                ad: ad.recordset[0],
                reviews: reviews.recordset,
                userId: req.session.userId,
                csrfToken: req.csrfToken()
            });
        } catch (err) {
            console.error(err);
            res.status(500).send('Ошибка загрузки');
        }
    });

    // GET: форма редактирования
    router.get('/:id/edit', checkAdOwnership, csrfProtection, async (req, res) => {
        try {
            const [ad, categories] = await Promise.all([
                pool.request().input('id', sql.Int, req.params.id).query('SELECT * FROM Ads WHERE AdID = @id'),
                pool.request().query(`
                    SELECT 
                        Categories.*,
                        CASE WHEN AdCategories.AdID IS NOT NULL THEN 1 ELSE 0 END AS Selected
                    FROM Categories
                    LEFT JOIN AdCategories 
                        ON Categories.CategoryID = AdCategories.CategoryID 
                        AND AdCategories.AdID = ${req.params.id}
                `)
            ]);

            res.render('ads/edit', {
                ad: ad.recordset[0],
                categories: categories.recordset,
                csrfToken: req.csrfToken(),
                userId: req.session.userId
            });
        } catch (err) {
            console.error(err);
            res.status(500).send('Ошибка загрузки формы');
        }
    });

    // POST: редактирование объявления
    router.post('/:id/edit', checkAdOwnership, csrfProtection, upload.single('image'), async (req, res) => {
        const { title, description, price, categories, deleteImage } = req.body;
        const adId = req.params.id;
        let imagePath;

        try {
            if (req.file) {
                imagePath = req.file.filename;
            } else {
                const current = await pool.request()
                    .input('id', sql.Int, adId)
                    .query('SELECT ImagePath FROM Ads WHERE AdID = @id');
                imagePath = deleteImage ? null : current.recordset[0].ImagePath;
            }

            await pool.request()
                .input('title', sql.NVarChar(255), title)
                .input('description', sql.NVarChar(sql.MAX), description)
                .input('price', sql.Decimal(10, 2), price)
                .input('image', sql.NVarChar(255), imagePath)
                .input('id', sql.Int, adId)
                .query(`UPDATE Ads SET 
                    Title = @title,
                    Description = @description,
                    Price = @price,
                    ImagePath = @image
                    WHERE AdID = @id`
                );

            await pool.request().input('adId', sql.Int, adId).query('DELETE FROM AdCategories WHERE AdID = @adId');

            if (categories?.length) {
                const categoryArray = Array.isArray(categories) ? categories : [categories];
                await Promise.all(categoryArray.map(categoryId =>
                    pool.request()
                        .input('adId', sql.Int, adId)
                        .input('categoryId', sql.Int, categoryId)
                        .query('INSERT INTO AdCategories VALUES (@adId, @categoryId)')
                ));
            }

            res.redirect(`/ads/${adId}`);
        } catch (err) {
            console.error(err);
            res.status(500).send('Ошибка обновления');
        }
    });

    // POST: удаление объявления
    router.post('/:id/delete', checkAdOwnership, csrfProtection, async (req, res) => {
        try {
            await pool.request()
                .input('id', sql.Int, req.params.id)
                .query('DELETE FROM Ads WHERE AdID = @id');
            res.redirect('/ads?success=Удалено');
        } catch (err) {
            console.error(err);
            res.redirect(`/ads/${req.params.id}?error=Ошибка`);
        }
    });

    // GET: список объявлений с фильтрацией
    router.get('/', async (req, res) => {
        const { q, category, minPrice, maxPrice, startDate, endDate, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        try {
            let baseQuery = `
                SELECT 
                    Ads.*, 
                    Users.Username,
                    STRING_AGG(CAST(Categories.Name AS NVARCHAR(MAX)), ', ') AS Categories,
                    COUNT(*) OVER() AS Total
                FROM Ads
                LEFT JOIN Users ON Ads.UserID = Users.UserID
                LEFT JOIN AdCategories ON Ads.AdID = AdCategories.AdID
                LEFT JOIN Categories ON AdCategories.CategoryID = Categories.CategoryID
                WHERE 1=1
            `;

            const params = [];
            if (q) {
                baseQuery += ' AND (Ads.Title LIKE @q OR Ads.Description LIKE @q)';
                params.push({ name: 'q', value: `%${q}%`, type: sql.NVarChar });
            }
            if (category) {
                baseQuery += ' AND Categories.CategoryID = @category';
                params.push({ name: 'category', value: category, type: sql.Int });
            }
            if (minPrice) {
                baseQuery += ' AND Ads.Price >= @minPrice';
                params.push({ name: 'minPrice', value: parseFloat(minPrice), type: sql.Decimal(10, 2) });
            }
            if (maxPrice) {
                baseQuery += ' AND Ads.Price <= @maxPrice';
                params.push({ name: 'maxPrice', value: parseFloat(maxPrice), type: sql.Decimal(10, 2) });
            }
            if (startDate) {
                baseQuery += ' AND Ads.CreatedAt >= @startDate';
                params.push({ name: 'startDate', value: new Date(startDate), type: sql.DateTime });
            }
            if (endDate) {
                baseQuery += ' AND Ads.CreatedAt <= @endDate';
                params.push({ name: 'endDate', value: new Date(endDate), type: sql.DateTime });
            }

            baseQuery += `
                GROUP BY 
                    Ads.AdID, Ads.Title, Ads.Description, Ads.Price, 
                    Ads.ImagePath, Ads.UserID, Ads.CreatedAt, Users.Username
                ORDER BY Ads.CreatedAt DESC
                OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
            `;

            const request = pool.request();
            params.forEach(param => request.input(param.name, param.type, param.value));
            const result = await request.query(baseQuery);
            const total = result.recordset[0]?.Total || 0;

            const categoriesList = await pool.request().query('SELECT * FROM Categories');

            res.render('ads/list', {
                ads: result.recordset,
                categories: categoriesList.recordset,
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit) || 1,
                query: req.query,
                userId: req.session.userId
            });
        } catch (err) {
            console.error(err);
            res.status(500).send('Ошибка поиска');
        }
    });

    return router;
};
