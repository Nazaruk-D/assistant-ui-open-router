import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import ChatDB from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загружаем .env.local из корня проекта
const envPath = path.join(__dirname, '..', '.env.local');
console.log('📁 Загружаем .env из:', envPath);

dotenv.config({ path: envPath });

// Проверяем наличие API ключа
if (!process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY) {
  console.error('❌ API ключ не найден! Укажите OPENROUTER_API_KEY в .env.local');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3002;

// CORS настройки
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json());

// Инициализация OpenRouter клиента
const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1'
});

// Инициализация БД
const db = new ChatDB();
const MAX_HISTORY = parseInt(process.env.MAX_HISTORY) || 20;

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    apiKey: process.env.OPENROUTER_API_KEY ? '✅' : '❌',
    timestamp: new Date().toISOString() 
  });
});

// Основной streaming endpoint
app.post('/api/chat/stream', async (req, res) => {
  try {
    const { messages, sessionId = 'default' } = req.body;
    
    console.log(`\n📝 [${sessionId}] Новый запрос`);
    
    // Настройки SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Отключаем буферизацию для nginx
    
    // Проверяем входные данные
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error('Неверный формат сообщений');
    }
    
    const lastMessage = messages[messages.length - 1];
    
    // Сохраняем сообщение пользователя (если оно не пустое)
    if (lastMessage?.content && lastMessage.content.trim() !== '') {
      await db.addMessage(`web_${sessionId}`, 'user', lastMessage.content);
      console.log(`💬 Сообщение пользователя сохранено: "${lastMessage.content.substring(0, 50)}..."`);
    }
    
    // Получаем историю чата
    const history = await db.getHistory(`web_${sessionId}`, MAX_HISTORY);
    console.log(`📚 История загружена, сообщений: ${history.length}`);
    
    // Формируем сообщения для модели
    const modelMessages = [
      { role: 'system', content: 'Ты полезный ассистент. Отвечай на русском языке.' },
      ...history.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    ];
    
    console.log('🤖 Отправляем запрос в OpenRouter...');
    
    // Запрашиваем стриминг у OpenRouter
    const stream = await client.chat.completions.create({
      model: "openrouter/free",
      messages: modelMessages,
      temperature: 0.7,
      max_tokens: 2000,
      stream: true 
    });
    
    let fullResponse = '';
    let messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Отправляем начало сообщения
    const startEvent = {
      type: 'text-start',
      id: messageId
    };
    res.write(`data: ${JSON.stringify(startEvent)}\n\n`);
    console.log('📤 Отправлено: text-start');
    
    // Обрабатываем стрим от OpenRouter
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        
        // Отправляем чанк текста
        const deltaEvent = {
          type: 'text-delta',
          id: messageId,
          delta: content  // ВАЖНО: используем textDelta, а не delta
        };
        res.write(`data: ${JSON.stringify(deltaEvent)}\n\n`);
        
        // Логируем каждый чанк (можно закомментировать в продакшне)
        console.log(`📤 Чанк: "${content}"`);
      }
    }
    
    // Отправляем конец сообщения
    const endEvent = {
      type: 'text-end',
      id: messageId
    };
    res.write(`data: ${JSON.stringify(endEvent)}\n\n`);
    console.log('📤 Отправлено: text-end');
    
    // Сохраняем полный ответ в БД
    if (fullResponse && fullResponse.trim() !== '') {
      await db.addMessage(`web_${sessionId}`, 'assistant', fullResponse);
      console.log(`💾 Ответ сохранен в БД, длина: ${fullResponse.length} символов`);
    }
    
    res.end();
    console.log(`✅ Запрос завершен, всего символов: ${fullResponse.length}`);
    
  } catch (error) {
    console.error('❌ Streaming Error:', error);
    
    // Отправляем ошибку в правильном формате
    const errorEvent = {
      type: 'error',
      errorText: error.message || 'Internal server error'
    };
    res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    res.end();
  }
});

// Тестовый endpoint для проверки формата
app.get('/api/test-stream', (req, res) => {
  console.log('🧪 Тестовый стрим запрошен');
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const messageId = `test_${Date.now()}`;
  
  // Отправляем тестовые события
  const sendEvent = (type, data = {}) => {
    const event = { type, id: messageId, ...data };
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  
  sendEvent('text-start');
  
  setTimeout(() => {
    sendEvent('text-delta', { textDelta: 'При' });
  }, 100);
  
  setTimeout(() => {
    sendEvent('text-delta', { textDelta: 'вет' });
  }, 200);
  
  setTimeout(() => {
    sendEvent('text-delta', { textDelta: ', ' });
  }, 300);
  
  setTimeout(() => {
    sendEvent('text-delta', { textDelta: 'мир' });
  }, 400);
  
  setTimeout(() => {
    sendEvent('text-delta', { textDelta: '!' });
  }, 500);
  
  setTimeout(() => {
    sendEvent('text-end');
    res.end();
    console.log('✅ Тестовый стрим завершен');
  }, 600);
});

// Запуск сервера
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 Backend запущен:');
  console.log('='.repeat(50));
  console.log(`📡 Порт: ${PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}/api/chat/stream`);
  console.log(`🧪 Тест: http://localhost:${PORT}/api/test-stream`);
  console.log(`💓 Health: http://localhost:${PORT}/health`);
  console.log('='.repeat(50) + '\n');
});