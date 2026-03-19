// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand(); // Раскрыть на весь экран

// Конфигурация
const HF_TOKEN = 'YOUR_HF_TOKEN'; // Вставь свой токен Hugging Face здесь
const MODEL_ID = 'Qwen/Qwen2.5-72B-Instruct';

// Состояние
let robot;
let chatHistory = JSON.parse(localStorage.getItem('pixel_chat_history')) || [];
let currentChatId = Date.now();
let isProcessing = false;

// DOM Элементы
const screens = {
    main: document.getElementById('main-screen'),
    history: document.getElementById('history-screen'),
    profile: document.getElementById('profile-screen')
};

const elements = {
    input: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn'),
    messagesList: document.getElementById('messages-list'),
    robotStatus: document.getElementById('robot-status'),
    historyList: document.getElementById('history-list'),
    userName: document.getElementById('user-name'),
    userId: document.getElementById('user-id')
};

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    // Настройка цветов под тему Telegram
    document.documentElement.style.setProperty('--bg-color', tg.backgroundColor || '#0f1419');
    
    // Запуск робота
    robot = new PixelRobot('robotCanvas');
    
    // Данные пользователя из Telegram
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const user = tg.initDataUnsafe.user;
        elements.userName.textContent = `${user.first_name} ${user.last_name || ''}`;
        elements.userId.textContent = `@${user.username || user.id}`;
    }

    loadChat(currentChatId);
    renderHistoryList();
    
    // Обработчики событий
    elements.sendBtn.addEventListener('click', handleSend);
    elements.input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSend();
    });

    // Навигация
    document.getElementById('history-btn').addEventListener('click', () => openScreen('history'));
    document.getElementById('close-history').addEventListener('click', () => openScreen('main'));
    
    // Кнопка профиля (добавим её в хедер или сделаем через меню Telegram, пока добавим в историю для примера)
    // Для демо добавим кнопку в историю или сделаем свайп. 
    // В реальном TMA лучше использовать MainButton или Settings Button, но пока сделаем так:
    const profileBtn = document.createElement('button');
    profileBtn.innerHTML = '👤';
    profileBtn.className = 'icon-btn';
    profileBtn.style.marginRight = '10px';
    profileBtn.onclick = () => openScreen('profile');
    document.querySelector('.tg-header').insertBefore(profileBtn, document.getElementById('history-btn'));

    document.getElementById('close-profile').addEventListener('click', () => openScreen('main'));
    
    // Тема
    document.getElementById('theme-select').addEventListener('change', (e) => {
        // Логика смены темы (упрощенно)
        if(e.target.value === 'dark') {
            document.body.style.setProperty('--bg-color', '#0f1419');
            document.body.style.setProperty('--text-color', '#ffffff');
        } else if (e.target.value === 'light') {
            document.body.style.setProperty('--bg-color', '#ffffff');
            document.body.style.setProperty('--text-color', '#000000');
        } else {
            // System
            tg.setHeaderColor('secondary_bg_color');
        }
    });
});

function openScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active', 'modal'));
    const target = screens[screenName];
    target.classList.add('active');
    if (screenName !== 'main') {
        setTimeout(() => target.classList.add('modal'), 10);
    }
    
    if (screenName === 'history') renderHistoryList();
}

async function handleSend() {
    const text = elements.input.value.trim();
    if (!text || isProcessing) return;

    isProcessing = true;
    elements.input.value = '';
    
    // Добавляем сообщение пользователя
    addMessageToUI(text, 'user');
    saveMessageToHistory(currentChatId, text, 'user');

    // Анимация робота
    updateRobotState('working');
    
    // Показываем индикатор набора
    const typingId = showTypingIndicator();

    try {
        // ЗАПРОС К QWEN
        const responseText = await fetchQwenResponse(text);
        
        removeTypingIndicator(typingId);
        addMessageToUI(responseText, 'bot');
        saveMessageToHistory(currentChatId, responseText, 'bot');
        
        updateRobotState('idle');
    } catch (error) {
        console.error(error);
        removeTypingIndicator(typingId);
        addMessageToUI('Ошибка соединения с мозгом робота. Проверьте токен API.', 'bot');
        updateRobotState('idle');
    } finally {
        isProcessing = false;
    }
}

// Функция вызова Qwen через Hugging Face Inference API
async function fetchQwenResponse(prompt) {
    // Системный промпт для сценариста
    const systemPrompt = "Ты профессиональный ИИ-сценарист и эксперт по промптам. Твоя задача - создавать качественные сценарии для видео, тайм-коды и промпты для генерации изображений/видео. Отвечай структурированно, используй эмодзи для навигации. Стиль: дружеский, наставнический.";

    const payload = {
        inputs: prompt,
        parameters: {
            max_new_tokens: 1024,
            temperature: 0.7,
            top_p: 0.95,
            return_full_text: false
        },
        options: {
            wait_for_model: true
        }
    };

    // Если токена нет, возвращаем мок-ответ для демонстрации
    if (HF_TOKEN === 'YOUR_HF_TOKEN' || !HF_TOKEN) {
        await new Promise(r => setTimeout(r, 2000)); // Имитация задержки
        return `🎬 **Сценарий для: "${prompt}"**\n\n1. **Вступление (0:00-0:15)**\n   - Кадр: Крупный план, динамичный монтаж.\n   - Текст: "Привет! Сегодня мы разберем..."\n\n2. **Основная часть**\n   - Промпт для генерации: "Cinematic shot, futuristic city, neon lights, 8k, unreal engine 5"\n\n💡 *Совет:* Используй теплый голос для озвучки.`;
    }

    try {
        const response = await fetch(`https://api-inference.huggingface.co/models/${MODEL_ID}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${HF_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\n${prompt}<|im_end|>\n<|im_start|>assistant\n`,
                parameters: {
                    max_new_tokens: 1024,
                    temperature: 0.7,
                    return_full_text: false
                }
            })
        });

        if (!response.ok) throw new Error('API Error');
        
        const result = await response.json();
        // Обработка ответа HF (может быть массивом или объектом)
        let text = "";
        if (Array.isArray(result)) {
            text = result[0].generated_text;
        } else if (result.generated_text) {
            text = result.generated_text;
        } else {
            text = "Не удалось получить ответ.";
        }
        
        // Очистка от служебных токенов если остались
        return text.replace(/<\|im_end\|>/g, '').trim();

    } catch (e) {
        console.error("Qwen API Error:", e);
        throw e;
    }
}

function addMessageToUI(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Простая обработка переносов строк и жирного текста
    let formattedText = text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\n/g, '<br>');

    msgDiv.innerHTML = `
        <div class="message-bubble">${formattedText}</div>
        <div class="message-time">${time}</div>
    `;
    
    elements.messagesList.appendChild(msgDiv);
    scrollToBottom();
}

function showTypingIndicator() {
    const id = 'typing-' + Date.now();
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message bot';
    msgDiv.id = id;
    msgDiv.innerHTML = `
        <div class="message-bubble typing-indicator">
            <span></span><span></span><span></span>
        </div>
    `;
    elements.messagesList.appendChild(msgDiv);
    scrollToBottom();
    return id;
}

function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function scrollToBottom() {
    const chatArea = document.getElementById('chat-container');
    chatArea.scrollTop = chatArea.scrollHeight;
}

function updateRobotState(state) {
    if (state === 'working') {
        elements.robotStatus.textContent = 'Генерирую сценарий...';
        elements.robotStatus.style.background = 'rgba(255, 149, 0, 0.2)';
        elements.robotStatus.style.color = '#ff9500';
        if(robot && robot.animateShortRequest) robot.animateShortRequest();
    } else {
        elements.robotStatus.textContent = 'Готов к работе';
        elements.robotStatus.style.background = 'rgba(52, 199, 89, 0.2)';
        elements.robotStatus.style.color = '#34c759';
        if(robot && robot.reset) robot.reset();
    }
}

// --- Логика Истории ---

function saveMessageToHistory(chatId, text, role) {
    let chat = chatHistory.find(c => c.id === chatId);
    if (!chat) {
        chat = {
            id: chatId,
            date: new Date().toISOString(),
            pinned: false,
            messages: []
        };
        chatHistory.unshift(chat);
    }
    
    chat.messages.push({ text, role, timestamp: Date.now() });
    // Обновляем дату последнего сообщения
    chat.date = new Date().toISOString();
    
    // Перемещаем активный чат вверх, если он не закреплен
    if (!chat.pinned) {
        chatHistory = chatHistory.filter(c => c.id !== chatId);
        chatHistory.unshift(chat);
    }

    localStorage.setItem('pixel_chat_history', JSON.stringify(chatHistory));
}

function loadChat(chatId) {
    currentChatId = chatId;
    elements.messagesList.innerHTML = '';
    const chat = chatHistory.find(c => c.id === chatId);
    
    if (chat && chat.messages) {
        chat.messages.forEach(msg => addMessageToUI(msg.text, msg.role));
    } else {
        addMessageToUI('Привет! Я готов написать сценарий. О чем будет видео?', 'bot');
    }
    scrollToBottom();
}

function renderHistoryList() {
    elements.historyList.innerHTML = '';
    
    if (chatHistory.length === 0) {
        elements.historyList.innerHTML = '<div style="text-align:center;color:var(--hint-color);margin-top:50px;">История пуста</div>';
        return;
    }

    chatHistory.forEach(chat => {
        const firstMsg = chat.messages.find(m => m.role === 'user')?.text || 'Новый чат';
        const dateObj = new Date(chat.date);
        const dateStr = dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        
        const item = document.createElement('div');
        item.className = `history-item ${chat.pinned ? 'pinned' : ''}`;
        item.onclick = (e) => {
            if (!e.target.closest('.action-btn')) {
                loadChat(chat.id);
                openScreen('main');
            }
        };
        
        item.innerHTML = `
            <div class="history-date">${dateStr} ${chat.pinned ? '• 📌 Закреплено' : ''}</div>
            <div class="history-preview">${firstMsg}</div>
            <div class="history-actions">
                <button class="action-btn" onclick="togglePin(${chat.id}, event)">
                    ${chat.pinned ? 'Открепить' : 'Закрепить'}
                </button>
                <button class="action-btn" style="color:#ff453a" onclick="deleteChat(${chat.id}, event)">
                    Удалить
                </button>
            </div>
        `;
        elements.historyList.appendChild(item);
    });
}

window.togglePin = (id, e) => {
    e.stopPropagation();
    const chat = chatHistory.find(c => c.id === id);
    if (chat) {
        chat.pinned = !chat.pinned;
        // Сортировка: закрепленные сверху
        chatHistory.sort((a, b) => (b.pinned === a.pinned) ? 0 : b.pinned ? 1 : -1);
        localStorage.setItem('pixel_chat_history', JSON.stringify(chatHistory));
        renderHistoryList();
    }
};

window.deleteChat = (id, e) => {
    e.stopPropagation();
    if(confirm('Удалить этот чат?')) {
        chatHistory = chatHistory.filter(c => c.id !== id);
        localStorage.setItem('pixel_chat_history', JSON.stringify(chatHistory));
        if (currentChatId === id) {
            currentChatId = Date.now(); // Создаем новый ID
            loadChat(currentChatId);
        }
        renderHistoryList();
    }
};

window.clearAllData = () => {
    if(confirm('Вы уверены? Это удалит всю историю.')) {
        localStorage.removeItem('pixel_chat_history');
        chatHistory = [];
        location.reload();
    }
};