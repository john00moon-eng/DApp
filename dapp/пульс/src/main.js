import './style.css';
import { createChart, CrosshairMode } from 'lightweight-charts';
import mockPayload from './data/mockSignals.json';

const DEFAULT_COIN_ID = 'bitcoin';
const REFRESH_INTERVAL = 60_000;
const TICKER_REFRESH_INTERVAL = 60_000;
const TICKER_STATUS_UNAVAILABLE = 'Данные недоступны';
const TICKER_ASSETS = [
  { id: 'bitcoin', symbol: 'BTC' },
  { id: 'ethereum', symbol: 'ETH' },
  { id: 'solana', symbol: 'SOL' },
  { id: 'binancecoin', symbol: 'BNB' },
  { id: 'ripple', symbol: 'XRP' },
  { id: 'cardano', symbol: 'ADA' },
  { id: 'dogecoin', symbol: 'DOGE' }
];
const FALLBACK_TICKER_QUOTES = [
  { symbol: 'BTC', price: '$68 500', change: '+1.8%' },
  { symbol: 'ETH', price: '$3 750', change: '+2.1%' },
  { symbol: 'SOL', price: '$162', change: '-0.5%' },
  { symbol: 'BNB', price: '$575', change: '+0.8%' },
  { symbol: 'XRP', price: '$0,52', change: '+0.3%' },
  { symbol: 'ADA', price: '$0,48', change: '+1.1%' },
  { symbol: 'DOGE', price: '$0,14', change: '+4.2%' }
];

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
const tickerContent = document.getElementById('ticker-content');

let candleSeries;
let chart;
let activeSignalElement = null;
let dashboardData = null;
let refreshTimerId = null;
let isRefreshing = false;
let tickerTimerId = null;
let tickerRefreshInProgress = false;

bindFaqAccordion();
bindEmailSubscribe();

if (chartContainer && signalsList && detailsContainer) {
  initialiseDashboard().catch((error) => {
    console.error('Не удалось инициализировать дашборд', error);
    dashboardData = createPayloadFromMock(mockPayload);
    dashboardData.metrics = buildMetricsFromCandles(dashboardData);
    hydrateHeader(dashboardData);
    renderMetrics(dashboardData);
    renderChart(dashboardData);
    renderSignals(dashboardData);
    if (tickerContent) {
      renderTicker(FALLBACK_TICKER_QUOTES, { message: TICKER_STATUS_UNAVAILABLE });
    }
  });
} else {
  console.warn('UI containers are missing. Check index.html layout.');
}

async function initialiseDashboard() {
  await refreshDashboard();
  await refreshTicker();
  scheduleAutoRefresh();
  scheduleTickerRefresh();
}

async function refreshDashboard() {
  if (isRefreshing) return;

  isRefreshing = true;

  try {
    dashboardData = await fetchOhlcData(DEFAULT_COIN_ID);
  } catch (error) {
    console.error('Не удалось получить данные CoinGecko. Используем mockSignals.json.', error);
    dashboardData = createPayloadFromMock(mockPayload);
  } finally {
    isRefreshing = false;
  }

  if (!dashboardData) return;

  dashboardData.metrics = buildMetricsFromCandles(dashboardData);
  hydrateHeader(dashboardData);
  renderMetrics(dashboardData);
  renderChart(dashboardData);
  renderSignals(dashboardData);
}

function scheduleAutoRefresh() {
  if (refreshTimerId) {
    clearInterval(refreshTimerId);
  }

  refreshTimerId = setInterval(() => {
    refreshDashboard();
  }, REFRESH_INTERVAL);
}

function scheduleTickerRefresh() {
  if (tickerTimerId) {
    clearInterval(tickerTimerId);
  }

  if (!tickerContent) {
    tickerTimerId = null;
    return;
  }

  tickerTimerId = setInterval(() => {
    refreshTicker();
  }, TICKER_REFRESH_INTERVAL);
}

async function fetchOhlcData(coinId = DEFAULT_COIN_ID) {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/ohlc?vs_currency=usd&days=1`
  );

  if (!response.ok) {
    throw new Error(`CoinGecko responded with status ${response.status}`);
  }

  const raw = await response.json();
  if (!Array.isArray(raw)) {
    throw new Error('CoinGecko OHLC response is not an array.');
  }

  const candles = raw
    .map((entry) => {
      if (!Array.isArray(entry) || entry.length < 5) {
        return null;
      }

      const [timestamp, open, high, low, close] = entry;
      const time = Math.floor(Number(timestamp) / 1000);
      const parsed = {
        time,
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close)
      };

      if (Object.values(parsed).some((value) => !Number.isFinite(value))) {
        return null;
      }

      return parsed;
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  if (!candles.length) {
    throw new Error('CoinGecko OHLC response does not contain candle data.');
  }

  const basePayload = createPayloadFromMock(mockPayload);
  basePayload.candles = candles;
  basePayload.lastUpdated = new Date().toISOString();
  basePayload.coinId = coinId;

  return basePayload;
}

async function fetchTickerQuotes() {
  const ids = TICKER_ASSETS.map((asset) => asset.id).join(',');
  const endpoint =
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;

  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`CoinGecko ticker responded with status ${response.status}`);
  }

  const payload = await response.json();

  if (!payload || typeof payload !== 'object') {
    throw new Error('CoinGecko ticker payload is malformed.');
  }

  return TICKER_ASSETS.map((asset) => {
    const entry = payload[asset.id];
    if (!entry || typeof entry.usd !== 'number') {
      return null;
    }

    const price = formatTickerPrice(entry.usd);
    const changeValue = Number(entry.usd_24h_change);

    let change = '—';
    if (Number.isFinite(changeValue)) {
      const roundedChange = Math.round(changeValue * 10) / 10;
      const sign = roundedChange >= 0 ? '+' : '';
      change = `${sign}${roundedChange.toFixed(1)}%`;
    }

    return {
      symbol: asset.symbol,
      price,
      change
    };
  }).filter(Boolean);
}

async function refreshTicker() {
  if (!tickerContent) {
    if (tickerTimerId) {
      clearInterval(tickerTimerId);
      tickerTimerId = null;
    }
    return;
  }

  if (tickerRefreshInProgress) {
    return;
  }

  tickerRefreshInProgress = true;

  try {
    const quotes = await fetchTickerQuotes();
    if (!quotes.length) {
      renderTicker(FALLBACK_TICKER_QUOTES, { message: TICKER_STATUS_UNAVAILABLE });
      return;
    }

    renderTicker(quotes);
  } catch (error) {
    console.error('Не удалось обновить тикер котировок', error);
    renderTicker(FALLBACK_TICKER_QUOTES, { message: TICKER_STATUS_UNAVAILABLE });
  } finally {
    tickerRefreshInProgress = false;
  }
}

function renderTicker(quotes, options = {}) {
  if (!tickerContent) {
    return;
  }

  const { message = null } = options;

  tickerContent.innerHTML = '';
  tickerContent.classList.toggle('has-message', Boolean(message));

  if (message) {
    const messageEl = document.createElement('span');
    messageEl.className = 'ticker-message';
    messageEl.textContent = message;
    tickerContent.append(messageEl);
  }

  if (!Array.isArray(quotes) || !quotes.length) {
    tickerContent.classList.add('is-empty');

    if (!message) {
      const emptyMessage = document.createElement('span');
      emptyMessage.className = 'ticker-message';
      emptyMessage.textContent = TICKER_STATUS_UNAVAILABLE;
      tickerContent.append(emptyMessage);
    }

    return;
  }

  tickerContent.classList.remove('is-empty');

  const fragment = document.createDocumentFragment();
  const items = [...quotes, ...quotes];

  items.forEach((quote) => {
    const item = document.createElement('span');
    item.className = 'ticker-item';

    const symbolEl = document.createElement('span');
    symbolEl.className = 'ticker-symbol';
    symbolEl.textContent = quote.symbol;

    const priceEl = document.createElement('span');
    priceEl.className = 'ticker-price';
    const priceValue =
      typeof quote.price === 'number'
        ? formatTickerPrice(quote.price)
        : String(quote.price ?? '—');
    priceEl.textContent = priceValue;

    const changeEl = document.createElement('span');
    changeEl.className = 'ticker-change';

    let changeText = '—';
    if (typeof quote.change === 'number') {
      changeText = `${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(1)}%`;
    } else if (typeof quote.change === 'string') {
      changeText = quote.change.trim();
    }

    if (changeText.startsWith('-')) {
      changeEl.classList.add('ticker-change--negative');
    } else if (changeText.startsWith('+')) {
      changeEl.classList.add('ticker-change--positive');
    }

    changeEl.textContent = changeText || '—';

    item.append(symbolEl, priceEl, changeEl);
    fragment.append(item);
  });

  tickerContent.append(fragment);
}

function formatTickerPrice(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }

  let minimumFractionDigits = 0;
  let maximumFractionDigits = 0;

  if (value < 1) {
    minimumFractionDigits = 2;
    maximumFractionDigits = 4;
  } else if (value < 10) {
    maximumFractionDigits = 2;
  } else if (value < 100) {
    maximumFractionDigits = 1;
  }

  const formatter = new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits,
    maximumFractionDigits
  });

  return formatter.format(value).replace(/\u00A0/g, '\u202F').trim();
}

function renderChart(data) {
  if (!chart) {
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

    const initialHeight = height;
    window.addEventListener('resize', () => {
      if (!chart || !chartContainer) return;
      chart.resize(chartContainer.clientWidth, chartContainer.clientHeight || initialHeight);
    });
  }

  if (!candleSeries || !data?.candles?.length) {
    return;
  }

  const candleData = data.candles.map((point) => ({
    time: point.time,
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close
  }));

  candleSeries.setData(candleData);
  candleSeries.setMarkers(
    (data.signals || []).map((signal) => {
      const priceInfo = formatPrice(signal.price, data);

      return {
        time: isoToUnix(signal.timestamp),
        position: signal.type === 'BUY' ? 'belowBar' : 'aboveBar',
        color: signal.type === 'BUY' ? '#46C078' : '#DC5A78',
        shape: signal.type === 'BUY' ? 'arrowUp' : 'arrowDown',
        text: `${signal.type} ${priceInfo.plainText}`
      };
    })
  );

  chart.timeScale().fitContent();
}

function renderSignals(data) {
  if (!signalsList) return;

  const signals = Array.isArray(data?.signals) ? data.signals : [];
  const previouslyActiveId = activeSignalElement?.dataset?.signalId || null;

  activeSignalElement = null;
  signalsList.innerHTML = '';

  signals.forEach((signal) => {
    const item = document.createElement('li');
    item.className = 'card p-4 transition hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer';
    item.tabIndex = 0;

    const signalDomId = String(signal.id ?? `${signal.type}-${signal.timestamp}`);
    item.dataset.signalId = signalDomId;

    const header = document.createElement('div');
    header.className = 'flex items-start justify-between gap-3';

    const badge = document.createElement('span');
    badge.className = `badge ${signal.type === 'BUY' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`;
    badge.textContent = signal.type === 'BUY' ? 'Buy сигнал' : 'Sell сигнал';

    const priceInfo = formatPrice(signal.price, data);
    const price = document.createElement('div');
    price.className = 'text-lg font-bold';
    price.innerHTML = formatPriceMarkup(priceInfo);

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

    item.addEventListener('click', () => setActiveSignal(signal, item, data));
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setActiveSignal(signal, item, data);
      }
    });
  });

  if (!signals.length) {
    detailsContainer.innerHTML = '';
    if (emailBadge) {
      emailBadge.classList.add('hidden');
    }
    return;
  }

  const desiredSignal = previouslyActiveId
    ? signals.find((candidate) => String(candidate.id ?? `${candidate.type}-${candidate.timestamp}`) === previouslyActiveId)
    : signals[0];
  const targetSignal = desiredSignal || signals[0];
  const targetId = targetSignal ? String(targetSignal.id ?? `${targetSignal.type}-${targetSignal.timestamp}`) : null;

  if (targetSignal && targetId) {
    const targetElement = Array.from(signalsList.children).find((child) => child.dataset.signalId === targetId);
    if (targetElement) {
      setActiveSignal(targetSignal, targetElement, data);
    }
  }
}

function renderMetrics(data) {
  if (!metricsGrid) return;

  metricsGrid.innerHTML = '';
  const metrics = Array.isArray(data?.metrics) ? data.metrics : [];

  if (!metrics.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'card p-5 text-sm text-muted';
    placeholder.textContent = 'Нет доступных метрик для отображения.';
    metricsGrid.append(placeholder);
    return;
  }

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

function hydrateHeader(data) {
  if (!data) return;

  if (symbolEl) {
    const fallbackSymbol = [data.baseAsset, data.quoteAsset].filter(Boolean).join('/') || data.symbol || '—';
    symbolEl.textContent = fallbackSymbol;
  }

  if (subtitleEl) {
    const subtitleParts = [];
    if (data.timeframe) {
      subtitleParts.push(data.timeframe);
    }
    if (data.lastUpdated) {
      subtitleParts.push(`обновлено ${formatRelative(data.lastUpdated)}`);
    }
    subtitleEl.textContent = subtitleParts.join(' • ');
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

function setActiveSignal(signal, element, data = dashboardData) {
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
    const entryPriceInfo = formatPrice(signal.price, data);
    const takeProfitInfo = formatPrice(signal.takeProfit, data);
    const stopLossInfo = formatPrice(signal.stopLoss, data);
    const entryPriceMarkup = formatPriceMarkup(entryPriceInfo, 'ml-2 text-xs uppercase tracking-wide text-muted');
    const takeProfitMarkup = formatPriceMarkup(
      takeProfitInfo,
      'ml-2 text-[10px] uppercase tracking-wide text-muted'
    );
    const stopLossMarkup = formatPriceMarkup(stopLossInfo, 'ml-2 text-[10px] uppercase tracking-wide text-muted');
    detailsContainer.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between text-xs uppercase tracking-wide text-muted">
          <span>${formatDateTime(signal.timestamp)}</span>
          <span>${data?.timeframe ?? ''}</span>
        </div>
        <div class="text-2xl font-bold ${signal.type === 'BUY' ? 'text-success' : 'text-danger'}">
          ${signal.type === 'BUY' ? 'Покупка' : 'Продажа'} @ ${entryPriceMarkup}
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
            <div class="mt-1 text-sm font-semibold text-success">${takeProfitMarkup}</div>
          </div>
          <div class="rounded-xl bg-surface/80 p-3">
            <div class="text-[11px]">Stop-loss</div>
            <div class="mt-1 text-sm font-semibold text-danger">${stopLossMarkup}</div>
          </div>
        </div>
      </div>
    `;
  }

  if (chart && candleSeries) {
    const focusTime = isoToUnix(signal.timestamp);
    chart.timeScale().setVisibleRange({
      from: focusTime - 60 * 60 * 12,
      to: focusTime + 60 * 60 * 12
    });
  }
}

function isoToUnix(isoString) {
  return Math.floor(new Date(isoString).getTime() / 1000);
}

function createPayloadFromMock(source) {
  const clone = JSON.parse(JSON.stringify(source));
  const candles = Array.isArray(clone.candles) ? clone.candles : [];

  clone.candles = candles
    .map((point) => {
      const time = typeof point.time === 'number' ? point.time : isoToUnix(point.time);
      const open = Number(point.open);
      const high = Number(point.high);
      const low = Number(point.low);
      const close = Number(point.close);

      if ([time, open, high, low, close].some((value) => !Number.isFinite(value))) {
        return null;
      }

      return { time, open, high, low, close };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  clone.lastUpdated = new Date().toISOString();
  clone.coinId = clone.coinId || DEFAULT_COIN_ID;

  return clone;
}

function buildMetricsFromCandles(data) {
  const candles = Array.isArray(data?.candles) ? data.candles : [];
  if (!candles.length) {
    return Array.isArray(data?.metrics) ? data.metrics : [];
  }

  const sortedCandles = [...candles].sort((a, b) => a.time - b.time);
  const first = sortedCandles[0];
  const last = sortedCandles[sortedCandles.length - 1];

  const high = sortedCandles.reduce((acc, candle) => Math.max(acc, candle.high), Number.NEGATIVE_INFINITY);
  const low = sortedCandles.reduce((acc, candle) => Math.min(acc, candle.low), Number.POSITIVE_INFINITY);
  const absoluteChange = last.close - first.open;
  const changePct = first.open ? (absoluteChange / first.open) * 100 : 0;

  const lastPrice = formatPrice(last.close, data);
  const changePrice = formatPrice(absoluteChange, data);
  const highPrice = formatPrice(high, data);
  const lowPrice = formatPrice(low, data);

  const pctPrefix = changePct >= 0 ? '+' : '';

  return [
    {
      label: 'Последняя цена',
      value: lastPrice.plainText,
      description: 'Закрытие последней свечи по данным CoinGecko'
    },
    {
      label: 'Изменение за 24ч',
      value: `${pctPrefix}${changePct.toFixed(2)}% (${changePrice.plainText})`,
      description: 'Разница между первой и последней свечами выбранного периода'
    },
    {
      label: 'Диапазон 24ч',
      value: `${highPrice.plainText} / ${lowPrice.plainText}`,
      description: 'Максимум и минимум цены за последние сутки'
    }
  ];
}

function formatPrice(value, data = dashboardData) {
  const ticker = data?.quoteAsset || 'USD';
  const currencyOverrides = {
    USDT: 'USD',
    USDC: 'USD',
    USDX: 'USD'
  };

  const isoCurrency = currencyOverrides[ticker] || ticker;
  const numberFormatOptions = {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  };

  let formatted;
  let showTicker = false;

  try {
    formatted = new Intl.NumberFormat('ru-RU', {
      ...numberFormatOptions,
      style: 'currency',
      currency: isoCurrency
    }).format(value);
    showTicker = isoCurrency !== ticker;
  } catch {
    formatted = new Intl.NumberFormat('ru-RU', numberFormatOptions).format(value);
    showTicker = true;
  }

  return {
    formatted,
    plainText: showTicker ? `${formatted} ${ticker}` : formatted,
    showTicker,
    ticker
  };
}

function formatPriceMarkup(priceInfo, tickerClass = 'ml-2 text-xs uppercase tracking-wide text-muted') {
  if (!priceInfo.showTicker) {
    return priceInfo.formatted;
  }

  return `${priceInfo.formatted} <span class="${tickerClass}">${priceInfo.ticker}</span>`;
}

function formatDateTime(isoString) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(isoString));
}

function formatRelative(isoString) {
  const target = new Date(isoString).getTime();
  const diffMs = Date.now() - target;
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
