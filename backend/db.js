import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ChatDB {
  constructor(dbPath = path.join(__dirname, 'chat_history.db')) {
    this.db = new sqlite3.Database(dbPath);
    this.init();
  }

  init() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,  -- должно быть NOT NULL
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  addMessage(chatId, role, content) {
    return new Promise((resolve, reject) => {
      // Проверяем, что content не пустой
      if (!content || content.trim() === '') {
        console.warn('⚠️ Попытка сохранить пустое сообщение');
        return resolve(null); // Просто пропускаем
      }

      this.db.run(
        'INSERT INTO chat_history (chat_id, role, content) VALUES (?, ?, ?)',
        [chatId, role, content],
        function(err) {
          if (err) {
            console.error('SQL Error:', err);
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  getHistory(chatId, limit = 20) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT role, content FROM chat_history WHERE chat_id = ? ORDER BY created_at ASC LIMIT ?',
        [chatId, limit],
        (err, rows) => {
          if (err) {
            console.error('SQL Get Error:', err);
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  close() {
    this.db.close();
  }
}

export default ChatDB;