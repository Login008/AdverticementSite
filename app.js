const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const { pool } = require('./database');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');

const app = express();

// Парсеры
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Сессии
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true
}));

// Подключение к БД (переподключение при необходимости)
app.use(async (req, res, next) => {
  try {
    if (!pool.connected) {
      console.log('Переподключение к базе данных...');
      await pool.connect();
    }
    next();
  } catch (err) {
    console.error('Ошибка подключения:', err);
    res.status(500).send('Ошибка сервера при подключении к БД');
  }
});

// Папка для статики
app.use(express.static(path.join(__dirname, 'public')));

// Настройка хранения файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Установка EJS как шаблонизатора
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Маршруты
app.use('/ads', require('./routes/ads')(upload));
app.use('/auth', require('./routes/auth'));
app.use('/users', require('./routes/users'));
app.use('/reviews', require('./routes/reviews'));

// Middleware авторизации — защита маршрутов
app.use((req, res, next) => {
  const publicRoutes = ['/auth/login', '/auth/register', '/css/style.css', '/'];
  if (!req.session.userId && !publicRoutes.includes(req.path)) {
    return res.redirect('/auth/login');
  }
  next();
});

// Главная страница
app.get('/', async (req, res) => {
  try {
    const result = await pool.request().query(`
      SELECT TOP 10 Ads.*, Users.Username, 
      STRING_AGG(Categories.Name, ', ') AS Categories 
      FROM Ads
      LEFT JOIN Users ON Ads.UserID = Users.UserID
      LEFT JOIN AdCategories ON Ads.AdID = AdCategories.AdID
      LEFT JOIN Categories ON AdCategories.CategoryID = Categories.CategoryID
      GROUP BY Ads.AdID, Ads.Title, Ads.Description, 
        Ads.Price, Ads.ImagePath, Ads.UserID, Ads.CreatedAt, Users.Username
    `);

    res.render('ads/list', {
      ads: result.recordset,
      categories: [],
      query: {},
      userId: req.session.userId
    });
  } catch (err) {
    console.error('Ошибка загрузки главной страницы:', err);
    res.status(500).render('error', { message: 'Ошибка загрузки данных' });
  }
});

// Запуск сервера
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});

