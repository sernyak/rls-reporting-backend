// server.js
// Імпортуємо необхідні бібліотеки
const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const cors = require('cors');
const crypto = require('crypto'); // Імпортуємо модуль для генерації ID

// --- КОНФІГУРАЦІЯ ---
const SPREADSHEET_ID = '1K9uUgDlomh_Xpnrc_C2pBAaKbCxzUDylm89UGtdhmPQ';
// Назви аркушів згідно з вашою новою структурою
const SHIFTS_SHEET_TITLE = 'shifts';
const RADAR_TARGETS_SHEET_TITLE = 'radar_targets';
const INTERCEPTOR_SORTIES_SHEET_TITLE = 'interceptor_sorties';
const PORT = process.env.PORT || 3000;

// Ключі доступу до сервісного акаунту
const creds = {
  type: "service_account",
  project_id: process.env.GOOGLE_PROJECT_ID,
  private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
  private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  client_id: process.env.GOOGLE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL
};

const app = express();

// Налаштування CORS
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static('public'));

/**
 * Головний ендпоінт для прийому даних з обох форм
 */
app.post('/submit', async (req, res) => {
  try {
    const { formType, shiftData } = req.body;

    // Ініціалізуємо доступ до таблиці
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();

    // Отримуємо всі необхідні аркуші
    const shiftsSheet = doc.sheetsByTitle[SHIFTS_SHEET_TITLE];
    const targetsSheet = doc.sheetsByTitle[RADAR_TARGETS_SHEET_TITLE];
    const sortiesSheet = doc.sheetsByTitle[INTERCEPTOR_SORTIES_SHEET_TITLE];

    if (!shiftsSheet || !targetsSheet || !sortiesSheet) {
        throw new Error('Один або декілька необхідних аркушів (shifts, radar_targets, interceptor_sorties) не знайдено!');
    }

    // 1. СТВОРЮЄМО НОВУ ЗМІНУ
    const shiftId = crypto.randomUUID(); // Генеруємо унікальний ID для зміни
    const newShiftRow = {
        id: shiftId,
        crew_type: formType, // 'rls' або 'interceptor'
        crew_id: shiftData.crewId,
        shift_start_time: shiftData.shiftStartTime,
        created_at: new Date().toISOString()
    };
    
    let rowsToAdd = [];
    let sheetToAddRowsTo;

    // ================== НОВА ЛОГІКА ДЛЯ РЕЛЯЦІЙНОЇ МОДЕЛІ ==================
    if (formType === 'rls') {
        const { targetsData } = req.body;
        if (!targetsData || targetsData.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Немає даних про цілі для запису.' });
        }

        // Додаємо специфічні для РЛС поля до зміни
        newShiftRow.rls_id = shiftData.rlsId;
        newShiftRow.rls_position = shiftData.rlsPosition;
        
        // Готуємо рядки для додавання в `radar_targets`
        sheetToAddRowsTo = targetsSheet;
        rowsToAdd = targetsData.map(target => ({
            unique_target_id: target.uniqueId,
            shift_id: shiftId, // <--- ЗВ'ЯЗОК ЗІ ЗМІНОЮ
            turn_number: target.turnNumber,
            rada_number: target.radaTargetNumber,
            entry_time: target.radarEntryTime,
            target_type: target.type,
            is_hit: target.isHit,
            on_radar_edge: target.onRadarEdge,
            video_link: target.killVideoLink
        }));

    } else if (formType === 'interceptor') {
        const { sortiesData } = req.body;
        if (!sortiesData || sortiesData.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Немає даних про вильоти для запису.' });
        }

        // Додаємо специфічні для перехоплювача поля до зміни
        newShiftRow.takeoff_point = shiftData.takeoffPoint;
        // Додаємо номер борту, якщо він є в даних
        if(shiftData.boardNumber) newShiftRow.board_number = shiftData.boardNumber;

        // Готуємо рядки для додавання в `interceptor_sorties`
        sheetToAddRowsTo = sortiesSheet;
        rowsToAdd = sortiesData.map(sortie => ({
            id: crypto.randomUUID(), // Генеруємо унікальний ID для кожного вильоту
            shift_id: shiftId, // <--- ЗВ'ЯЗОК ЗІ ЗМІНОЮ
            target_id_to_intercept: sortie.targetIdToIntercept,
            takeoff_time: sortie.takeoffTime,
            target_type: sortie.type,
            hit_success: sortie.hitSuccess,
            warhead_triggered: sortie.warheadTriggered,
            target_destroyed: sortie.targetDestroyed,
            target_status: sortie.targetStatus,
            board_status: sortie.boardStatus,
            target_coordinates: sortie.targetCoordinates,
            video_link: sortie.killVideoLink
        }));

    } else {
        return res.status(400).json({ status: 'error', message: 'Невідомий тип форми.' });
    }

    // 2. ВИКОНУЄМО ЗАПИСИ В ТАБЛИЦІ
    await shiftsSheet.addRow(newShiftRow); // Додаємо одну зміну
    await sheetToAddRowsTo.addRows(rowsToAdd); // Додаємо всі пов'язані події

    res.status(200).json({ status: 'success', message: `Звіт успішно надіслано. Створено 1 зміну та додано ${rowsToAdd.length} записів.` });

  } catch (error) {
    console.error('Помилка при обробці запиту:', error);
    res.status(500).json({ status: 'error', message: `Помилка сервера: ${error.message}` });
  }
});

// Запускаємо сервер
app.listen(PORT, () => {
  console.log(`Сервер запущено на порті ${PORT}`);
});
