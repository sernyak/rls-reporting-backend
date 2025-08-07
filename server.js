// server.js
// Імпортуємо необхідні бібліотеки
const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const cors = require('cors');

// --- КОНФІГУРАЦІЯ ---
// ID вашої Google Таблиці (з URL)
const SPREADSHEET_ID = '1K9uUgDlomh_Xpnrc_C2pBAaKbCxzUDylm89UGtdhmPQ';
// Назва аркуша, куди будуть записуватися дані
const SHEET_TITLE = 'RLS_Data';
// Порт, на якому буде працювати сервер. Render надасть свій.
const PORT = process.env.PORT || 3000;

// Ключі доступу до сервісного акаунту.
// ВАЖЛИВО: На Render ми будемо зберігати їх в Environment Variables для безпеки.
const creds = {
  type: "service_account",
  project_id: process.env.GOOGLE_PROJECT_ID,
  private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
  private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Важливо для Render
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  client_id: process.env.GOOGLE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL
};

// Створюємо екземпляр Express-додатку
const app = express();

// ======================= FIX FOR CORS ERROR =======================
// Явно вказуємо, що наш сервер дозволяє запити з будь-якого джерела ('*').
// Це вирішує проблему з CORS, яку ви бачите на скріншоті.
app.use(cors({ origin: '*' }));
// ==================================================================

// Дозволяємо серверу працювати з JSON-даними
app.use(express.json());
// Віддаємо статичні файли (наш index.html) з папки 'public'
app.use(express.static('public'));

/**
 * Головний ендпоінт для прийому даних з форми
 */
app.post('/submit', async (req, res) => {
  try {
    const { shiftData, targetsData } = req.body;

    // Перевірка, чи є дані для запису
    if (!shiftData || !targetsData || targetsData.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Немає даних для запису.' });
    }

    // Ініціалізуємо доступ до таблиці
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();

    // Отримуємо потрібний аркуш
    const sheet = doc.sheetsByTitle[SHEET_TITLE];
    if (!sheet) {
        throw new Error(`Аркуш з назвою "${SHEET_TITLE}" не знайдено!`);
    }

    // Готуємо рядки для запису
    const rowsToAdd = targetsData.map(target => ({
      // Ключі тут повинні ТОЧНО ВІДПОВІДАТИ назвам колонок у вашій таблиці
      'Shift_Start_Time': shiftData.shiftStartTime,
      'Crew_ID': shiftData.crewId,
      'RLS_ID': shiftData.rlsId,
      'RLS_Position': shiftData.rlsPosition,
      'RLS_Type': shiftData.rlsType,
      'Sector': shiftData.sector,
      'Target_Unique_ID': target.uniqueId,
      'Target_Turn_Number': target.turnNumber,
      'Radar_Entry_Time': target.radarEntryTime,
      'Rada_Target_Number': target.radaTargetNumber,
      'Target_Type': target.type,
      'Is_Hit': target.isHit,
      'On_Radar_Edge': target.onRadarEdge,
      'Kill_Video_Link': target.killVideoLink,
      'Submission_Timestamp': new Date().toISOString() // Додаємо час відправки
    }));

    // Додаємо рядки в таблицю
    await sheet.addRows(rowsToAdd);

    res.status(200).json({ status: 'success', message: `Звіт успішно надіслано. Додано ${rowsToAdd.length} цілей.` });

  } catch (error) {
    console.error('Помилка при записі в Google Sheet:', error);
    res.status(500).json({ status: 'error', message: `Помилка сервера: ${error.message}` });
  }
});

// Запускаємо сервер
app.listen(PORT, () => {
  console.log(`Сервер запущено на порті ${PORT}`);
});
