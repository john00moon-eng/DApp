# Pulse Protocol (Tailwind + Vite)
# Pulse Protocol Frontend

## 🚀 Цель
Разработать адаптивный фронтенд для **Pulse Protocol** на базе **Tailwind + Vite**, интегрировать чарт, API и базовые компоненты DeFi-протокола.

---

## 🔧 Технологии
- **HTML5 / Tailwind CSS / Vite**
- **JavaScript (ESM)**
- **Lightweight Charts** для графиков
- **REST API моки** для сигналов и e-mail подписки
- **Node.js 18+**, **npm**

---

## 📐 Правила разработки
1. **Код-стайл**
   - Использовать `eslint:recommended` + `prettier`
   - Отступы — 2 пробела
   - Имена файлов в `kebab-case`

2. **Tailwind**
   - Все стили — через utility-классы
   - Избегать кастомного CSS, кроме edge-кейсов
   - Цвета/тени/радиусы брать из `tailwind.config.js`

3. **Компоненты**
   - Делить на секции: `Header`, `Hero`, `How`, `Indicator`, `Chart`, `APR`, `FAQ`, `Lore`, `Footer`
   - Каждая секция должна быть самодостаточной и переиспользуемой
   - Использовать семантические теги (`section`, `article`, `header`, `footer`)

4. **График**
   - Использовать `lightweight-charts`
   - BUY/SELL сигналы с mock API (`src/data/mockSignals.json`)
   - Поддержка e-mail бейджа и модалки при клике на маркер

5. **API**
   - Подписка: `POST /api/subscribe-email`
   - Сигналы: `GET /api/signals?symbol=BTCUSDT&timeframe=1h`
   - Пока использовать моковые ответы

6. **Адаптив**
   - Mobile first: 375px → 768px → 1024px → 1440px
   - Навигация на мобиле — бургер-меню

7. **Деплой**
   - Dev: `npm run dev` (Vite)
   - Prod: `npm run build`
   - Preview: `npm run preview`
   - Целевая платформа: Vercel/Netlify

8. **Качество**
   - Lighthouse ≥ 90 по Performance, SEO, Accessibility
   - Cross-browser: Chrome, Safari, Firefox
   - Accessibility: `aria`-теги, контрастность текста, семантические заголовки

---

## 📂 Структура
pulse-protocol/
├─ index.html
├─ src/
│ ├─ style.css
│ ├─ main.js
│ └─ data/mockSignals.json
├─ public/assets/
├─ tailwind.config.js
├─ postcss.config.js
├─ package.json
├─ README.md
└─ ROADMAP.md
