const sql = require('mssql');

const config = {
  server: 'localhost',
  database: 'AdvertisementsDB',
  user: 'Berzerk',
  password: '8126',
  options: {
    trustedConnection: true,
    encrypt: false,
    domain: 'MSI',
    userName: 'Berzerk',
    authentication: {
      type: 'ntlm',
      options: {
        domain: 'MSI',
        userName: 'Berzerk',
        password: '8126'
      }
    }
  }
};

const pool = new sql.ConnectionPool(config);

// Обработчик ошибок пула
pool.on('error', err => {
  console.error('Ошибка пула соединений:', err);
});

// Подключение с повторными попытками
let retryCount = 0;
const connectWithRetry = async () => {
  try {
    await pool.connect();
    console.log('Успешное подключение к SQL Server');
  } catch (err) {
    if (retryCount < 3) {
      console.error(`Ошибка подключения (попытка ${retryCount + 1}/3):`, err.message);
      retryCount++;
      setTimeout(connectWithRetry, 5000);
    } else {
      console.error('Не удалось подключиться к SQL Server после 3 попыток');
      process.exit(1);
    }
  }
};

connectWithRetry();

module.exports = { pool, sql };