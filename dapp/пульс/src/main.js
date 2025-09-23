import './style.css';
import { createChart, CrosshairMode } from 'lightweight-charts';
import mockPayload from './data/mockSignals.json';

const chartContainer = document.getElementById('chart-root');
const signalsList = document.getElementById('signals-list');
const detailsContainer = document.getElementById('signal-details');
const subtitleEl = document.getElementById('indicator-subtitle');
const symbolEl = document.getElementById('indicator-symbol');
const metricsGrid = document.getElementById('metrics-grid');
const emailBadge = document.getElementById('email-badge');
const accordionTriggers = document.querySelectorAll('[data-accordion-trigger]');
const subscribeForm = document.getElementById('subscribe-form');
const subscribeInput = document.getElementById('subscribe-email');
const subscribeStatus = document.getElementById('subscribe-status');
const subscribeButton = document.getElementById('subscribe-button');

const MARKET_CONFIG = {
  coinId: 'bitcoin',
  vsCurrency: 'usd',
  timeframe: '1h',
  days: 1,
  autoUpdateMs: 60_000
};

const payload = JSON.parse(JSON.stringify(mockPayload));
payload.quoteAsset = (MARKET_CONFIG.vsCurrency || payload.quoteAsset || 'usd').toUpperCase();
payload.timeframe = MARKET_CONFIG.timeframe || payload.timeframe;
payload.symbol = composeSymbol(payload.quoteAsset);
payload.lastUpdated = new Date().toISOString();

let candleSeries;
let chart;
let activeSignalElement = null;
let latestCandles = [];
let autoUpdateTimerId = null;
let isAutoUpdating = false;

bindFaqAccordion();
bindEmailSubscribe();

if (chartContainer && signalsList && detailsContainer) {
  initialiseDashboard().catch((error) => {
    console.error('Dashboard initialisation failed', error);
  });
} else {
  console.warn('UI containers are missing. Check index.html layout.');
}

async function initialiseDashboard() {
  try {
    const marketData = await fetchOhlcData();

    payload.symbol = marketData.symbol;
    payload.timeframe = marketData.timeframe;
    payload.lastUpdated = marketData.lastUpdated.toISOString();
    payload.quoteAsset = marketData.vsCurrency.toUpperCase();

    hydrateHeader();
    renderMetrics();
    renderChart(marketData.candles);
    renderSignals();
    startAutoUpdate();
  } catch (error) {
    console.error('Failed to initialise dashboard with live data', error);

    payload.quoteAsset = (MARKET_CONFIG.vsCurrency || payload.quoteAsset || 'usd').toUpperCase();
    payload.symbol = composeSymbol(payload.quoteAsset);
    payload.timeframe = MARKET_CONFIG.timeframe || payload.timeframe;
    payload.lastUpdated = new Date().toISOString();

    hydrateHeader({
      message: 'Не удалось загрузить данные CoinGecko — показаны демонстрационные цены.'
    });
    renderMetrics();

    const fallbackCandles = Array.isArray(mockPayload.candles)
      ? mockPayload.candles.map((point) => ({
          time: isoToUnix(point.time),
          open: Number(point.open),
          high: Number(point.high),
          low: Number(point.low),
          close: Number(point.close)
        }))
      : [];

    renderChart(fallbackCandles);
    renderSignals();
  }
}

function renderChart(candles = []) {
  clearAutoUpdateTimer();

  if (chart) {
    chart.remove();
  }

  chartContainer.innerHTML = '';

  const width = chartContainer.clientWidth || 720;
  const height = chartContainer.clientHeight || 360;

  chart = createChart(chartContainer, {
    width,
    height,
    layout: {
      background: { type: 'solid', color: 'transparent' },
      textColor: '#E6E7ED',
      fontFamily: 'Inter, system-ui, sans-serif'
    },
    grid: {
      vertLines: { color: 'rgba(40, 44, 63, 0.45)' },
      horzLines: { color: 'rgba(40, 44, 63, 0.45)' }
    },
    rightPriceScale: { borderColor: 'rgba(40, 44, 63, 0.45)' },
    timeScale: {
      borderColor: 'rgba(40, 44, 63, 0.45)',
      timeVisible: true,
      secondsVisible: false,
      fixLeftEdge: true,
      fixRightEdge: true,
      barSpacing: 12
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: 'rgba(255, 60, 120, 0.35)', labelBackgroundColor: '#FF3C78' },
      horzLine: { color: 'rgba(255, 255, 255, 0.2)', labelBackgroundColor: '#3A3E59' }
    }
  });

  candleSeries = chart.addCandlestickSeries({
    upColor: '#46C078',
    borderUpColor: '#46C078',
    wickUpColor: '#46C078',
    downColor: '#DC5A78',
    borderDownColor: '#DC5A78',
    wickDownColor: '#DC5A78'
  });

  const candleData = Array.isArray(candles)
    ? candles
        .map((point) => ({
          time: Number(point.time),
          open: Number(point.open),
          high: Number(point.high),
          low: Number(point.low),
          close: Number(point.close)
        }))
        .filter((point) =>
          Number.isFinite(point.time) &&
          Number.isFinite(point.open) &&
          Number.isFinite(point.high) &&
          Number.isFinite(point.low) &&
          Number.isFinite(point.close)
        )
    : [];

  candleSeries.setData(candleData);
  latestCandles = candleData;
  payload.candles = candleData;

  if (Array.isArray(payload.signals) && payload.signals.length > 0) {
    candleSeries.setMarkers(
      payload.signals.map((signal) => ({
        time: isoToUnix(signal.timestamp),
        position: signal.type === 'BUY' ? 'belowBar' : 'aboveBar',
        color: signal.type === 'BUY' ? '#46C078' : '#DC5A78',
        shape: signal.type === 'BUY' ? 'arrowUp' : 'arrowDown',
        text: `${signal.type} ${formatPrice(signal.price)}`
      }))
    );
  }

  if (candleData.length > 0) {
    chart.timeScale().fitContent();
  }

  window.addEventListener('resize', () => {
    chart.resize(chartContainer.clientWidth, chartContainer.clientHeight || height);
  });
}

async function fetchOhlcData({
  coinId = MARKET_CONFIG.coinId,
  vsCurrency = MARKET_CONFIG.vsCurrency,
  days = MARKET_CONFIG.days
} = {}) {
  const resolvedCoinId = coinId || MARKET_CONFIG.coinId;
  const resolvedCurrency = (vsCurrency || MARKET_CONFIG.vsCurrency || 'usd').toLowerCase();
  const resolvedDays = days ?? MARKET_CONFIG.days ?? 1;

  if (!resolvedCoinId) {
    throw new Error('Coin identifier is required to request OHLC data.');
  }

  const query = new URLSearchParams({
    vs_currency: resolvedCurrency,
    days: String(resolvedDays)
  });

  const endpoint = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
    resolvedCoinId
  )}/ohlc?${query.toString()}`;

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`CoinGecko responded with status ${response.status}`);
  }

  const rawData = await response.json();
  if (!Array.isArray(rawData)) {
    throw new Error('Unexpected OHLC response format from CoinGecko.');
  }

  const candles = rawData
    .map((entry) => {
      if (!Array.isArray(entry) || entry.length < 5) {
        return null;
      }

      const [timestamp, open, high, low, close] = entry;
      const normalised = {
        time: Math.floor(Number(timestamp) / 1000),
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close)
      };

      if (
        !Number.isFinite(normalised.time) ||
        !Number.isFinite(normalised.open) ||
        !Number.isFinite(normalised.high) ||
        !Number.isFinite(normalised.low) ||
        !Number.isFinite(normalised.close)
      ) {
        return null;
      }

      return normalised;
    })
    .filter((entry) => entry !== null)
    .sort((a, b) => a.time - b.time);

  return {
    candles,
    symbol: composeSymbol(resolvedCurrency),
    timeframe: MARKET_CONFIG.timeframe || payload.timeframe,
    lastUpdated: new Date(),
    vsCurrency: resolvedCurrency
  };
}

function startAutoUpdate() {
  if (!MARKET_CONFIG.autoUpdateMs || !candleSeries) {
    return;
  }

  clearAutoUpdateTimer();

  autoUpdateTimerId = setInterval(async () => {
    if (isAutoUpdating) return;
    isAutoUpdating = true;

    try {
      const marketData = await fetchOhlcData();
      if (!Array.isArray(marketData.candles) || marketData.candles.length === 0) {
        return;
      }

      const previousLength = latestCandles.length;
      const newCandles = marketData.candles;
      const lastIncoming = newCandles[newCandles.length - 1];
      const lastKnown = previousLength > 0 ? latestCandles[previousLength - 1] : undefined;

      if (!lastKnown || newCandles.length < previousLength) {
        candleSeries.setData(newCandles);
      } else if (newCandles.length > previousLength) {
        newCandles.slice(previousLength).forEach((bar) => candleSeries.update(bar));
      } else if (lastIncoming) {
        candleSeries.update(lastIncoming);
      }

      latestCandles = newCandles;
      payload.candles = newCandles;
      payload.lastUpdated = marketData.lastUpdated.toISOString();
      payload.symbol = marketData.symbol;
      payload.timeframe = marketData.timeframe;
      payload.quoteAsset = marketData.vsCurrency.toUpperCase();

      hydrateHeader();
    } catch (error) {
      console.error('Failed to refresh OHLC data', error);
    } finally {
      isAutoUpdating = false;
    }
  }, MARKET_CONFIG.autoUpdateMs);
}

function clearAutoUpdateTimer() {
  if (autoUpdateTimerId) {
    clearInterval(autoUpdateTimerId);
    autoUpdateTimerId = null;
  }
  isAutoUpdating = false;
}

function renderSignals() {
  signalsList.innerHTML = '';

  const signals = Array.isArray(payload.signals) ? payload.signals : [];

  signals.forEach((signal) => {
    const item = document.createElement('li');
    item.className = 'card p-4 transition hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer';
    item.tabIndex = 0;

    const header = document.createElement('div');
    header.className = 'flex items-start justify-between gap-3';

    const badge = document.createElement('span');
    badge.className = `badge ${signal.type === 'BUY' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`;
    badge.textContent = signal.type === 'BUY' ? 'Buy сигнал' : 'Sell сигнал';

    const price = document.createElement('div');
    price.className = 'text-lg font-bold';
    price.textContent = formatPrice(signal.price);

    header.append(badge, price);

    const meta = document.createElement('div');
    meta.className = 'mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs uppercase tracking-wide text-muted';
    meta.innerHTML = `
      <span>${formatDateTime(signal.timestamp)}</span>
      <span>${signal.emaTrend}</span>
      <span>${signal.volumeDelta}</span>
    `;

    const context = document.createElement('p');
    context.className = 'mt-3 text-sm leading-relaxed text-muted';
    context.textContent = signal.context;

    const emailTag = document.createElement('span');
    emailTag.className = `badge mt-3 ${signal.emailSent ? 'bg-accent/10 text-accent' : 'bg-accent2/30 text-muted'}`;
    emailTag.textContent = signal.emailSent ? 'Email отправлен' : 'Email в очереди';

    item.append(header, meta, context, emailTag);
    signalsList.append(item);

    item.addEventListener('click', () => setActiveSignal(signal, item));
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setActiveSignal(signal, item);
      }
    });
  });

  if (signals.length > 0 && signalsList.firstElementChild) {
    setActiveSignal(signals[0], signalsList.firstElementChild);
  }
}

function renderMetrics() {
  if (!metricsGrid) return;

  metricsGrid.innerHTML = '';
  const metrics = Array.isArray(payload.metrics) ? payload.metrics : [];

  metrics.forEach((metric) => {
    const card = document.createElement('div');
    card.className = 'card p-5 flex flex-col gap-2';
    card.innerHTML = `
      <span class="text-xs uppercase tracking-wide text-muted">${metric.label}</span>
      <span class="text-2xl font-semibold">${metric.value}</span>
      <p class="text-sm leading-relaxed text-muted">${metric.description}</p>
    `;
    metricsGrid.append(card);
  });
}

function hydrateHeader({ message, lastUpdated } = {}) {
  if (symbolEl) {
    symbolEl.textContent = payload.symbol || composeSymbol(payload.quoteAsset);
  }
  if (subtitleEl) {
    const updatedAt = lastUpdated || payload.lastUpdated || new Date().toISOString();
    const timeframe = payload.timeframe || MARKET_CONFIG.timeframe || '';
    const baseText = timeframe
      ? `${timeframe} • обновлено ${formatRelative(updatedAt)}`
      : `Обновлено ${formatRelative(updatedAt)}`;
    subtitleEl.textContent = message ? `${baseText} • ${message}` : baseText;
  }
}

function bindFaqAccordion() {
  if (!accordionTriggers.length) return;

  accordionTriggers.forEach((trigger) => {
    const panelId = trigger.getAttribute('aria-controls');
    if (!panelId) return;

    const panel = document.getElementById(panelId);
    if (!panel) return;

    trigger.addEventListener('click', () => toggleAccordion(trigger, panel));
  });
}

function toggleAccordion(trigger, panel) {
  const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
  trigger.setAttribute('aria-expanded', String(!isExpanded));
  panel.classList.toggle('hidden', isExpanded);
  panel.setAttribute('aria-hidden', String(isExpanded));

  const icon = trigger.querySelector('[data-accordion-icon]');
  if (icon) {
    icon.classList.toggle('rotate-180', !isExpanded);
  }
}

function bindEmailSubscribe() {
  if (!subscribeForm || !subscribeInput || !subscribeButton || !subscribeStatus) return;

  const defaultButtonText = subscribeButton.textContent;

  subscribeForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = subscribeInput.value.trim();

    subscribeStatus.textContent = '';
    subscribeStatus.classList.remove('text-danger', 'text-success');
    subscribeStatus.classList.add('text-muted');

    subscribeInput.classList.remove('ring-2', 'ring-danger', 'ring-success', 'ring-offset-2', 'ring-offset-bg');

    if (!isValidEmail(email)) {
      subscribeStatus.textContent = 'Проверьте адрес электронной почты.';
      subscribeStatus.classList.remove('text-muted');
      subscribeStatus.classList.add('text-danger');
      subscribeInput.classList.add('ring-2', 'ring-danger', 'ring-offset-2', 'ring-offset-bg');
      subscribeInput.focus();
      return;
    }

    subscribeButton.disabled = true;
    subscribeButton.textContent = 'Отправляем…';

    try {
      const response = await mockSubscribe(email);
      if (!response.ok) {
        throw new Error('Mock request failed');
      }

      subscribeStatus.textContent = 'Готово! Мы пришлём актуальные сигналы на почту.';
      subscribeStatus.classList.remove('text-muted');
      subscribeStatus.classList.add('text-success');
      subscribeInput.classList.add('ring-2', 'ring-success', 'ring-offset-2', 'ring-offset-bg');
      subscribeForm.reset();
    } catch (error) {
      console.error(error);
      subscribeStatus.textContent = 'Не удалось отправить подписку. Попробуйте снова.';
      subscribeStatus.classList.remove('text-muted');
      subscribeStatus.classList.add('text-danger');
      subscribeInput.classList.add('ring-2', 'ring-danger', 'ring-offset-2', 'ring-offset-bg');
    } finally {
      subscribeButton.disabled = false;
      subscribeButton.textContent = defaultButtonText;
    }
  });
}

function setActiveSignal(signal, element) {
  if (activeSignalElement) {
    activeSignalElement.classList.remove('ring-2', 'ring-accent', 'ring-offset-2', 'ring-offset-surface');
  }

  activeSignalElement = element;
  activeSignalElement?.classList.add('ring-2', 'ring-accent', 'ring-offset-2', 'ring-offset-surface');

  if (emailBadge) {
    if (signal.emailSent) {
      emailBadge.classList.remove('hidden');
      emailBadge.textContent = 'Email отправлен';
    } else {
      emailBadge.classList.add('hidden');
    }
  }

  if (detailsContainer) {
    const confidence = Math.round(signal.confidence * 100);
    detailsContainer.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between text-xs uppercase tracking-wide text-muted">
          <span>${formatDateTime(signal.timestamp)}</span>
          <span>${payload.timeframe}</span>
        </div>
        <div class="text-2xl font-bold ${signal.type === 'BUY' ? 'text-success' : 'text-danger'}">
          ${signal.type === 'BUY' ? 'Покупка' : 'Продажа'} @ ${formatPrice(signal.price)}
        </div>
        <p class="text-sm leading-relaxed text-muted">${signal.context}</p>
        <div class="grid grid-cols-2 gap-3 text-xs uppercase tracking-wide text-muted">
          <div class="rounded-xl bg-surface/80 p-3">
            <div class="text-[11px]">Вероятность</div>
            <div class="mt-1 text-sm font-semibold text-text">${confidence}%</div>
          </div>
          <div class="rounded-xl bg-surface/80 p-3">
            <div class="text-[11px]">R/R</div>
            <div class="mt-1 text-sm font-semibold text-text">${signal.riskReward.toFixed(1)}</div>
          </div>
          <div class="rounded-xl bg-surface/80 p-3">
            <div class="text-[11px]">Take-profit</div>
            <div class="mt-1 text-sm font-semibold text-success">${formatPrice(signal.takeProfit)}</div>
          </div>
          <div class="rounded-xl bg-surface/80 p-3">
            <div class="text-[11px]">Stop-loss</div>
            <div class="mt-1 text-sm font-semibold text-danger">${formatPrice(signal.stopLoss)}</div>
          </div>
        </div>
      </div>
    `;
  }

  if (chart && candleSeries && latestCandles.length > 0) {
    const focusTime = isoToUnix(signal.timestamp);
    const firstCandleTime = latestCandles[0]?.time;
    const lastCandleTime = latestCandles[latestCandles.length - 1]?.time;

    if (
      Number.isFinite(firstCandleTime) &&
      Number.isFinite(lastCandleTime) &&
      focusTime >= firstCandleTime &&
      focusTime <= lastCandleTime
    ) {
      chart.timeScale().setVisibleRange({
        from: focusTime - 60 * 60 * 12,
        to: focusTime + 60 * 60 * 12
      });
    } else if (Number.isFinite(firstCandleTime) && Number.isFinite(lastCandleTime)) {
      chart.timeScale().setVisibleRange({
        from: firstCandleTime,
        to: lastCandleTime
      });
    }
  }
}

function composeSymbol(quoteCurrency = payload?.quoteAsset) {
  const baseAsset = (payload?.baseAsset || mockPayload?.baseAsset || MARKET_CONFIG.coinId || '')
    .toString()
    .toUpperCase();
  const quoteAsset = (quoteCurrency || MARKET_CONFIG.vsCurrency || 'usd').toString().toUpperCase();

  if (!baseAsset) {
    return quoteAsset;
  }

  return `${baseAsset}/${quoteAsset}`;
}

function isoToUnix(isoString) {
  return Math.floor(new Date(isoString).getTime() / 1000);
}

function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return value;
  }

  const fallbackCurrency = (MARKET_CONFIG.vsCurrency || 'usd').toUpperCase();
  let currency = (payload.quoteAsset || fallbackCurrency).toUpperCase();

  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch (error) {
    console.warn(`Unsupported currency "${currency}". Falling back to ${fallbackCurrency}.`, error);

    currency = fallbackCurrency;

    try {
      return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  }
}

function formatDateTime(isoString) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(isoString));
}

function formatRelative(value) {
  const targetDate = value instanceof Date ? value : new Date(value);
  const targetTime = targetDate.getTime();

  if (!Number.isFinite(targetTime)) {
    return '—';
  }

  const diffMs = Date.now() - targetTime;
  const minutes = Math.max(Math.round(diffMs / 60000), 0);

  if (minutes <= 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  return `${days} дн назад`;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function mockSubscribe() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ ok: true });
    }, 700);
  });
}
