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
const AUTOMATION_STATUS_ENDPOINT = '/api/zapier-hook/latest';
const AUTOMATION_STATUS_REFRESH_INTERVAL = 60_000;
const automationWebhookPortSource =
  import.meta.env?.VITE_WEBHOOK_PORT ??
  (typeof window !== 'undefined' ? window.location.port : undefined) ??
  '3001';
const automationWebhookPort =
  typeof automationWebhookPortSource === 'string'
    ? automationWebhookPortSource.trim() || '3001'
    : String(automationWebhookPortSource ?? '3001');

initHeroAnimations();

const chartContainer = document.getElementById('chart-root');
const signalsList = document.getElementById('signals-list');
const detailsContainer = document.getElementById('signal-details');
const subtitleEl = document.getElementById('indicator-subtitle');
const symbolEl = document.getElementById('indicator-symbol');
const metricsGrid = document.getElementById('metrics-grid');
const coinSummaryCard = document.getElementById('coin-summary-card');
const coinSummaryAssetEl = document.getElementById('coin-summary-asset');
const coinSummaryPriceEl = document.getElementById('coin-summary-price');
const coinSummaryChangeEl = document.getElementById('coin-summary-change');
const coinSummaryTimeframeEl = document.getElementById('coin-summary-timeframe');
const coinSummaryUpdatedEl = document.getElementById('coin-summary-updated');
const coinSummaryCoinEl = document.getElementById('coin-summary-coin');
const coinSummarySignalTypeEl = document.getElementById('coin-summary-signal-type');
const coinSummaryEntryEl = document.getElementById('coin-summary-entry');
const coinSummaryRrEl = document.getElementById('coin-summary-rr');
const coinSummaryTakeProfitEl = document.getElementById('coin-summary-take-profit');
const coinSummaryStopLossEl = document.getElementById('coin-summary-stop-loss');
const coinSummarySignalTimeEl = document.getElementById('coin-summary-signal-time');
const automationStatusContainer = document.getElementById('automation-status');
const automationStatusBadge = document.getElementById('automation-status-badge');
const automationPortIndicator = document.getElementById('automation-port-indicator');
const automationInsightsContainer = document.getElementById('automation-insights');
const automationInsightsMessage = document.getElementById('automation-insights-message');
const automationInsightsTimestamp = document.getElementById('automation-insights-timestamp');
const automationInsightsGrid = document.getElementById('automation-insights-grid');
const accordionTriggers = document.querySelectorAll('[data-accordion-trigger]');
const tickerContent = document.getElementById('ticker-content');

let candleSeries;
let chart;
let activeSignalElement = null;
let activeSignalId = null;
let dashboardData = null;
let refreshTimerId = null;
let isRefreshing = false;
let tickerTimerId = null;
let tickerRefreshInProgress = false;
let automationStatusTimerId = null;
let automationStatusRefreshInProgress = false;
let latestAutomationEvent = null;

bindFaqAccordion();
initAutomationStatus();

if (chartContainer && signalsList && detailsContainer) {
  initialiseDashboard().catch((error) => {
    console.error('Не удалось инициализировать дашборд', error);
    dashboardData = createPayloadFromMock(mockPayload);
    dashboardData.metrics = buildMetricsFromCandles(dashboardData);
    hydrateHeader(dashboardData);
    renderMetrics(dashboardData);
    renderChart(dashboardData);
    renderCoinSummary(dashboardData);
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
  renderCoinSummary(dashboardData);
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

function initAutomationStatus() {
  if (!automationStatusContainer && !automationStatusBadge && !automationPortIndicator) {
    return;
  }

  refreshAutomationStatus();
  scheduleAutomationStatusRefresh();
}

function scheduleAutomationStatusRefresh() {
  if (automationStatusTimerId) {
    clearInterval(automationStatusTimerId);
  }

  if (!automationStatusContainer && !automationStatusBadge && !automationPortIndicator) {
    automationStatusTimerId = null;
    return;
  }

  automationStatusTimerId = setInterval(() => {
    refreshAutomationStatus();
  }, AUTOMATION_STATUS_REFRESH_INTERVAL);
}

async function refreshAutomationStatus() {
  if (automationStatusRefreshInProgress) {
    return;
  }

  if (!automationStatusContainer && !automationStatusBadge && !automationPortIndicator) {
    return;
  }

  automationStatusRefreshInProgress = true;

  try {
    const response = await fetch(AUTOMATION_STATUS_ENDPOINT, {
      headers: { Accept: 'application/json' }
    });

    const resolvedPort = resolveAutomationEndpointPort(response);

    if (response.status === 204) {
      latestAutomationEvent = null;
      renderAutomationStatus(null, { message: 'Нет событий автоматизации.' });
      renderAutomationPortStatus(resolvedPort, { statusLabel: 'OK' });
      renderAutomationInsights(null);
      return;
    }

    if (!response.ok) {
      throw new Error(`Automation status responded with ${response.status}`);
    }

    const rawPayload = await response.text();

    if (!rawPayload) {
      latestAutomationEvent = null;
      renderAutomationStatus(null, { message: 'Нет событий автоматизации.' });
      renderAutomationPortStatus(resolvedPort, { statusLabel: 'OK' });
      renderAutomationInsights(null);
      return;
    }

    let payload = null;

    try {
      payload = JSON.parse(rawPayload);
    } catch (parseError) {
      console.error('Не удалось обработать JSON webhook', parseError);
      payload = null;
    }

    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      latestAutomationEvent = payload;
      renderAutomationStatus(payload);
      renderAutomationInsights(payload);
    } else {
      latestAutomationEvent = null;
      renderAutomationStatus(null, { message: 'Нет событий автоматизации.' });
      renderAutomationInsights(null);
    }

    renderAutomationPortStatus(resolvedPort, { statusLabel: 'OK' });
  } catch (error) {
    console.error('Не удалось получить статус автоматизаций', error);
    latestAutomationEvent = null;
    renderAutomationStatus(null, { message: 'Webhook недоступен', isError: true });
    renderAutomationInsights(null);
    renderAutomationPortStatus(automationWebhookPort, {
      statusLabel: 'недоступен',
      isError: true
    });
  } finally {
    automationStatusRefreshInProgress = false;
  }
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
  const previouslyActiveId = activeSignalId;

  activeSignalElement = null;
  signalsList.innerHTML = '';

  signals.forEach((signal) => {
    const item = document.createElement('li');
    item.className = 'card p-4 transition hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer';
    item.tabIndex = 0;

    const signalDomId = getSignalDomId(signal);
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

    const automationState = resolveSignalAutomationState(signal);
    const automationTag = document.createElement('span');
    const automationClasses = ['badge', 'mt-3'];

    if (automationState.tone === 'danger') {
      automationClasses.push('bg-danger/10', 'text-danger');
    } else if (automationState.tone === 'success') {
      automationClasses.push('bg-success/10', 'text-success');
    } else {
      automationClasses.push('bg-accent2/30', 'text-muted');
    }

    automationTag.className = automationClasses.join(' ');
    if (signalDomId) {
      automationTag.dataset.signalAutomation = signalDomId;
    }
    automationTag.textContent = automationState.badgeText;

    item.append(header, meta, context, automationTag);
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
    activeSignalId = null;
    renderCoinSummary(data, null);
    return;
  }

  const desiredSignal = previouslyActiveId
    ? signals.find((candidate) => getSignalDomId(candidate) === previouslyActiveId)
    : signals[0];
  const targetSignal = desiredSignal || signals[0];
  const targetId = targetSignal ? getSignalDomId(targetSignal) : null;

  if (targetSignal && targetId) {
    const targetElement = Array.from(signalsList.children).find((child) => child.dataset.signalId === targetId);
    if (targetElement) {
      setActiveSignal(targetSignal, targetElement, data);
    }
  }
}

function renderCoinSummary(data, activeSignal = null) {
  if (!coinSummaryCard) return;

  const coinId = data?.coinId || DEFAULT_COIN_ID;
  coinSummaryCard.dataset.coinId = coinId;

  const assetParts = [data?.baseAsset, data?.quoteAsset].filter(Boolean);
  const assetLabel = assetParts.length ? assetParts.join('/') : data?.symbol || '—';

  if (coinSummaryAssetEl) {
    coinSummaryAssetEl.textContent = assetLabel;
  }

  if (coinSummaryTimeframeEl) {
    coinSummaryTimeframeEl.textContent = `Таймфрейм ${data?.timeframe ?? '—'}`;
  }

  if (coinSummaryUpdatedEl) {
    coinSummaryUpdatedEl.textContent = data?.lastUpdated
      ? `Обновлено ${formatRelative(data.lastUpdated)}`
      : 'Обновлено —';
  }

  if (coinSummaryCoinEl) {
    coinSummaryCoinEl.textContent = `CoinGecko ID ${coinId}`;
  }

  const candles = Array.isArray(data?.candles) ? data.candles : [];
  let changePct = null;
  let changePriceInfo = null;
  let lastPriceInfo = null;

  if (candles.length) {
    const sorted = [...candles].sort((a, b) => a.time - b.time);
    const firstCandle = sorted[0];
    const lastCandle = sorted[sorted.length - 1];

    if (firstCandle && lastCandle) {
      const absoluteChange = lastCandle.close - firstCandle.open;
      changePct = firstCandle.open ? (absoluteChange / firstCandle.open) * 100 : 0;
      changePriceInfo = formatPrice(absoluteChange, data);
      lastPriceInfo = formatPrice(lastCandle.close, data);
    }
  }

  if (coinSummaryPriceEl) {
    if (lastPriceInfo) {
      coinSummaryPriceEl.innerHTML = formatPriceMarkup(lastPriceInfo, 'coin-summary__ticker');
    } else {
      coinSummaryPriceEl.textContent = '—';
    }
  }

  if (coinSummaryChangeEl) {
    coinSummaryChangeEl.classList.remove('coin-summary__change--positive', 'coin-summary__change--negative');
    if (typeof changePct === 'number' && changePriceInfo && lastPriceInfo) {
      const pctPrefix = changePct >= 0 ? '+' : '';
      coinSummaryChangeEl.textContent = `${pctPrefix}${changePct.toFixed(2)}% (${changePriceInfo.plainText})`;
      if (changePct > 0) {
        coinSummaryChangeEl.classList.add('coin-summary__change--positive');
      } else if (changePct < 0) {
        coinSummaryChangeEl.classList.add('coin-summary__change--negative');
      }
    } else {
      coinSummaryChangeEl.textContent = '—';
    }
  }

  const signals = Array.isArray(data?.signals) ? data.signals : [];
  let resolvedSignal = activeSignal || null;

  if (!resolvedSignal && activeSignalId) {
    resolvedSignal = signals.find((candidate) => getSignalDomId(candidate) === activeSignalId) || null;
  }

  if (!resolvedSignal && signals.length) {
    resolvedSignal = signals[0];
  }

  if (coinSummarySignalTypeEl) {
    coinSummarySignalTypeEl.classList.remove('text-success', 'text-danger', 'text-muted');
    if (resolvedSignal) {
      coinSummarySignalTypeEl.textContent = resolvedSignal.type === 'BUY' ? 'Покупка' : 'Продажа';
      coinSummarySignalTypeEl.classList.add(resolvedSignal.type === 'BUY' ? 'text-success' : 'text-danger');
    } else {
      coinSummarySignalTypeEl.textContent = '—';
      coinSummarySignalTypeEl.classList.add('text-muted');
    }
  }

  if (coinSummaryEntryEl) {
    if (resolvedSignal && Number.isFinite(resolvedSignal.price)) {
      coinSummaryEntryEl.innerHTML = formatPriceMarkup(formatPrice(resolvedSignal.price, data));
    } else {
      coinSummaryEntryEl.textContent = '—';
    }
  }

  if (coinSummaryRrEl) {
    if (resolvedSignal && Number.isFinite(resolvedSignal.riskReward)) {
      coinSummaryRrEl.textContent = resolvedSignal.riskReward.toFixed(1);
    } else {
      coinSummaryRrEl.textContent = '—';
    }
  }

  if (coinSummaryTakeProfitEl) {
    if (resolvedSignal && Number.isFinite(resolvedSignal.takeProfit)) {
      coinSummaryTakeProfitEl.innerHTML = formatPriceMarkup(formatPrice(resolvedSignal.takeProfit, data));
    } else {
      coinSummaryTakeProfitEl.textContent = '—';
    }
  }

  if (coinSummaryStopLossEl) {
    if (resolvedSignal && Number.isFinite(resolvedSignal.stopLoss)) {
      coinSummaryStopLossEl.innerHTML = formatPriceMarkup(formatPrice(resolvedSignal.stopLoss, data));
    } else {
      coinSummaryStopLossEl.textContent = '—';
    }
  }

  if (coinSummarySignalTimeEl) {
    if (resolvedSignal?.timestamp) {
      coinSummarySignalTimeEl.textContent = formatDateTime(resolvedSignal.timestamp);
    } else {
      coinSummarySignalTimeEl.textContent = '—';
    }
  }
}

function getSignalDomId(signal) {
  if (!signal) return null;

  const fallback = signal.type && signal.timestamp ? `${signal.type}-${signal.timestamp}` : null;
  const rawId = signal.id ?? fallback;

  return rawId != null ? String(rawId) : null;
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

function renderAutomationPortStatus(port, options = {}) {
  if (!automationPortIndicator) {
    return;
  }

  const { statusLabel = null, isError = false } = options;
  const normalizedPort =
    typeof port === 'number' || typeof port === 'string' ? String(port).trim() : '';
  const fallbackPort =
    typeof automationWebhookPort === 'string'
      ? automationWebhookPort.trim()
      : String(automationWebhookPort ?? '');
  const portText = normalizedPort || fallbackPort || '—';
  const resolvedStatus = statusLabel || (isError ? 'недоступен' : 'OK');

  automationPortIndicator.classList.remove('hidden', 'port-indicator--ok', 'port-indicator--error');
  automationPortIndicator.classList.add(isError ? 'port-indicator--error' : 'port-indicator--ok');
  const labelEl = automationPortIndicator.querySelector('.port-indicator__label');
  const valueEl = automationPortIndicator.querySelector('.port-indicator__value');
  const statusEl = automationPortIndicator.querySelector('.port-indicator__status');

  if (labelEl) {
    labelEl.textContent = 'Webhook порт';
  }

  if (valueEl) {
    valueEl.textContent = portText;
  }

  if (statusEl) {
    statusEl.textContent = resolvedStatus;
  }

  if (!valueEl || !statusEl) {
    automationPortIndicator.textContent = `Webhook порт ${portText} • ${resolvedStatus}`;
  }
}

function renderAutomationStatus(event, options = {}) {
  if (!automationStatusContainer && !automationStatusBadge && !automationPortIndicator) {
    return;
  }

  const { message = null, isError = false } = options;
  let resolvedText = message;
  let tone = null;

  if (event) {
    tone = resolveAutomationEventTone(event);
    const summary = getAutomationEventSummary(event);
    const statusLabel = getAutomationEventStatus(event);
    const destination = getAutomationEventDestination(event);
    const signalId = extractAutomationSignalId(event);
    const timestamp = getAutomationEventTimestamp(event);

    const parts = [];
    if (summary) {
      parts.push(summary);
    }
    if (statusLabel && (!summary || summary.toLowerCase() !== statusLabel.toLowerCase())) {
      parts.push(statusLabel);
    }
    if (destination) {
      parts.push(destination);
    }
    if (signalId) {
      parts.push(`Сигнал ${signalId}`);
    }
    if (timestamp) {
      parts.push(formatRelative(timestamp));
    }

    resolvedText = parts.length
      ? `Последнее событие автоматизации: ${parts.join(' • ')}`
      : 'Получено событие автоматизации.';

    if (signalsList && dashboardData?.signals && signalId) {
      const normalizedId = String(signalId);
      const safeId =
        typeof CSS?.escape === 'function'
          ? CSS.escape(normalizedId)
          : normalizedId.replace(/["\\]/g, '\\$&');
      const tag = signalsList.querySelector(`[data-signal-automation="${safeId}"]`);
      if (tag) {
        const relatedSignal = dashboardData.signals.find(
          (candidate) => getSignalDomId(candidate) === normalizedId
        );
        if (relatedSignal) {
          const state = resolveSignalAutomationState(relatedSignal);
          tag.textContent = state.badgeText;
          tag.classList.remove('bg-danger/10', 'text-danger', 'bg-success/10', 'text-success', 'bg-accent2/30', 'text-muted');
          if (state.tone === 'danger') {
            tag.classList.add('bg-danger/10', 'text-danger');
          } else if (state.tone === 'success') {
            tag.classList.add('bg-success/10', 'text-success');
          } else {
            tag.classList.add('bg-accent2/30', 'text-muted');
          }
        }
      }
    }
  } else if (!message) {
    resolvedText = 'Webhook ещё не получил событий.';
  }

  if (automationStatusContainer) {
    automationStatusContainer.textContent = resolvedText || '';
    automationStatusContainer.classList.toggle('hidden', !resolvedText);
    automationStatusContainer.classList.remove('text-danger', 'text-success', 'text-muted');

    if (isError) {
      automationStatusContainer.classList.add('text-danger');
    } else if (tone === 'success') {
      automationStatusContainer.classList.add('text-success');
    } else {
      automationStatusContainer.classList.add('text-muted');
    }
  }

  if (automationStatusBadge) {
    automationStatusBadge.className = 'badge';
    automationStatusBadge.classList.add('hidden');

    if (isError) {
      automationStatusBadge.textContent = 'Webhook недоступен';
      automationStatusBadge.classList.remove('hidden');
      automationStatusBadge.classList.add('bg-danger/10', 'text-danger');
    } else if (event) {
      const statusLabel = getAutomationEventStatus(event) || 'Webhook активен';
      automationStatusBadge.textContent = statusLabel;
      automationStatusBadge.classList.remove('hidden');

      if (tone === 'danger') {
        automationStatusBadge.classList.add('bg-danger/10', 'text-danger');
      } else if (tone === 'success') {
        automationStatusBadge.classList.add('bg-success/10', 'text-success');
      } else {
        automationStatusBadge.classList.add('bg-accent/10', 'text-accent');
      }
    } else if (message) {
      automationStatusBadge.textContent = message;
      automationStatusBadge.classList.remove('hidden');
      automationStatusBadge.classList.add('bg-surface/70', 'text-muted');
    }
  }

  refreshActiveSignalAutomationSummary();
}

function renderAutomationInsights(event) {
  if (
    !automationInsightsContainer ||
    !automationInsightsGrid ||
    !automationInsightsMessage ||
    !automationInsightsTimestamp
  ) {
    return;
  }

  const payload = extractAutomationPayload(event);

  if (!payload) {
    automationInsightsContainer.classList.add('hidden');
    automationInsightsMessage.textContent = '';
    automationInsightsMessage.classList.add('hidden');
    automationInsightsTimestamp.textContent = '';
    automationInsightsTimestamp.classList.add('hidden');
    automationInsightsGrid.innerHTML = '';
    automationInsightsGrid.classList.add('hidden');
    return;
  }

  const message = getAutomationPayloadMessage(event, payload);
  const timestampParts = getAutomationPayloadTimestamps(event, payload);
  const metrics = buildAutomationInsightsMetrics(payload);

  if (!message && !timestampParts.length && !metrics.length) {
    automationInsightsContainer.classList.add('hidden');
    automationInsightsMessage.textContent = '';
    automationInsightsMessage.classList.add('hidden');
    automationInsightsTimestamp.textContent = '';
    automationInsightsTimestamp.classList.add('hidden');
    automationInsightsGrid.innerHTML = '';
    automationInsightsGrid.classList.add('hidden');
    return;
  }

  automationInsightsContainer.classList.remove('hidden');

  if (message) {
    automationInsightsMessage.textContent = message;
    automationInsightsMessage.classList.remove('hidden');
  } else {
    automationInsightsMessage.textContent = '';
    automationInsightsMessage.classList.add('hidden');
  }

  if (timestampParts.length) {
    automationInsightsTimestamp.textContent = timestampParts.join(' • ');
    automationInsightsTimestamp.classList.remove('hidden');
  } else {
    automationInsightsTimestamp.textContent = '';
    automationInsightsTimestamp.classList.add('hidden');
  }

  automationInsightsGrid.innerHTML = '';

  if (metrics.length) {
    metrics.forEach((metric) => {
      const item = document.createElement('div');
      item.className = 'rounded-xl bg-surface/80 p-4';

      const label = document.createElement('div');
      label.className = 'text-[11px] uppercase tracking-wide text-muted';
      label.textContent = metric.label;

      const value = document.createElement('div');
      value.className = 'mt-2 text-sm font-semibold text-text';
      value.textContent = metric.value;

      item.append(label, value);
      automationInsightsGrid.append(item);
    });
    automationInsightsGrid.classList.remove('hidden');
  } else {
    automationInsightsGrid.classList.add('hidden');
  }
}

function extractAutomationPayload(event) {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const seen = new Set();
  const queue = [];

  const enqueue = (candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return;
    }

    if (seen.has(candidate)) {
      return;
    }

    seen.add(candidate);
    queue.push(candidate);
  };

  enqueue(event.payload?.data);
  enqueue(event.payload?.body);
  enqueue(event.payload?.payload);
  enqueue(event.payload);
  enqueue(event.data);
  enqueue(event.eventData);
  enqueue(event.record);
  enqueue(event);

  while (queue.length) {
    const candidate = queue.shift();
    if (hasAutomationInsightFields(candidate)) {
      return candidate;
    }

    for (const value of Object.values(candidate)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        enqueue(value);
      }
    }
  }

  return null;
}

function hasAutomationInsightFields(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  const keys = Object.keys(candidate);
  if (!keys.length) {
    return false;
  }

  return keys.some((key) => {
    const normalized = normalizeKey(key);
    return (
      normalized.includes('mvrvz') ||
      normalized.includes('price') ||
      normalized.includes('ticker') ||
      normalized.includes('symbol') ||
      normalized.includes('timeframe') ||
      normalized.includes('condition') ||
      normalized.includes('message')
    );
  });
}

function getAutomationPayloadMessage(event, payload) {
  const candidates = [
    resolvePayloadValue(payload, [
      'payload_alert_message',
      'payload message',
      'message',
      'alert_message',
      'summary',
      'title'
    ]),
    getAutomationEventSummary(event),
    typeof event?.event === 'string' ? event.event : null
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return '';
}

function getAutomationPayloadTimestamps(event, payload) {
  const triggered = resolvePayloadDate(payload, [
    'triggered_at',
    'triggeredAt',
    'event_time',
    'time'
  ]) || (event?.triggeredAt ? new Date(event.triggeredAt) : null);

  const received = resolvePayloadDate(payload, [
    'received_at',
    'receivedAt',
    'updated_at',
    'updatedAt'
  ]) || (event?.receivedAt ? new Date(event.receivedAt) : null);

  const parts = [];

  if (triggered instanceof Date && !Number.isNaN(triggered.getTime())) {
    parts.push(`Триггер: ${formatDateTime(triggered.toISOString())} (${formatRelative(triggered.toISOString())})`);
  }

  if (received instanceof Date && !Number.isNaN(received.getTime())) {
    parts.push(`Получено: ${formatDateTime(received.toISOString())} (${formatRelative(received.toISOString())})`);
  }

  return parts;
}

function buildAutomationInsightsMetrics(payload) {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const metrics = [];

  const pair = coerceString(
    resolvePayloadValue(payload, ['ticker', 'symbol', 'pair', 'market_pair'])
  );
  if (pair) {
    metrics.push({ label: 'Пара', value: pair.toUpperCase() });
  }

  const exchange = coerceString(resolvePayloadValue(payload, ['exchange', 'market', 'venue']));
  if (exchange) {
    metrics.push({ label: 'Биржа', value: exchange });
  }

  const timeframe = coerceString(resolvePayloadValue(payload, ['timeframe', 'interval', 'resolution']));
  if (timeframe) {
    metrics.push({ label: 'Таймфрейм', value: timeframe.toUpperCase() });
  }

  const condition = coerceString(resolvePayloadValue(payload, ['condition', 'rule', 'direction']));
  if (condition) {
    metrics.push({ label: 'Условие', value: formatTitleCase(condition) });
  }

  const price = coerceNumber(resolvePayloadValue(payload, ['price', 'close', 'last_price']));
  if (price != null) {
    metrics.push({ label: 'Цена отчёта', value: formatAutomationPrice(price) });
  }

  const mvrvzBtc = coerceNumber(resolvePayloadValue(payload, ['mvrvz_btc', 'mvrvzbtc', 'mvrvz_btc_value']));
  if (mvrvzBtc != null) {
    metrics.push({ label: 'MVRVZ (BTC)', value: formatAutomationRatio(mvrvzBtc) });
  }

  const mvrvzEth = coerceNumber(resolvePayloadValue(payload, ['mvrvz_eth', 'mvrvzeth', 'mvrvz_eth_value']));
  if (mvrvzEth != null) {
    metrics.push({ label: 'MVRVZ (ETH)', value: formatAutomationRatio(mvrvzEth) });
  }

  const source = coerceString(resolvePayloadValue(payload, ['source', 'origin', 'channel']));
  if (source) {
    metrics.push({ label: 'Источник', value: formatTitleCase(source) });
  }

  const ok = coerceBoolean(resolvePayloadValue(payload, ['ok', 'status']));
  if (ok != null) {
    metrics.push({ label: 'Статус', value: ok ? 'OK' : 'Ошибка' });
  }

  const sent = coerceBoolean(resolvePayloadValue(payload, ['sent', 'delivered', 'forwarded']));
  if (sent != null) {
    metrics.push({ label: 'Отправлено', value: sent ? 'Да' : 'Нет' });
  }

  return metrics;
}

function resolvePayloadValue(payload, keys) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(keys)) {
    return undefined;
  }

  const normalizedEntries = new Map();

  for (const [rawKey, value] of Object.entries(payload)) {
    const normalized = normalizeKey(rawKey);
    if (!normalizedEntries.has(normalized)) {
      normalizedEntries.set(normalized, value);
    }
  }

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      const value = payload[key];
      if (value !== undefined) {
        return value;
      }
    }

    const normalizedKey = normalizeKey(key);
    if (normalizedEntries.has(normalizedKey)) {
      const value = normalizedEntries.get(normalizedKey);
      if (value !== undefined) {
        return value;
      }
    }
  }

  return undefined;
}

function resolvePayloadDate(payload, keys) {
  const value = resolvePayloadValue(payload, keys);
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }

  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && String(numeric).length >= 10) {
      const fromNumeric = new Date(numeric);
      if (!Number.isNaN(fromNumeric.getTime())) {
        return fromNumeric;
      }
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function normalizeKey(key) {
  return String(key ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '');
}

function coerceString(value) {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return '';
}

function coerceNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/[^0-9.,-]/g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function coerceBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (['true', 'yes', 'on', '1', 'ok', 'sent', 'success'].includes(normalized)) {
      return true;
    }

    if (['false', 'no', 'off', '0', 'error', 'failed'].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function formatTitleCase(text) {
  if (!text) {
    return '';
  }

  return text
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function formatAutomationPrice(value) {
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${value.toFixed(2)} USD`;
  }
}

function formatAutomationRatio(value) {
  return value.toFixed(2);
}

function resolveAutomationEndpointPort(source) {
  const fallback = automationWebhookPort;
  if (!source) {
    return fallback;
  }

  const candidateUrl = typeof source === 'string' ? source : source?.url;
  if (!candidateUrl) {
    return fallback;
  }

  try {
    const base =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost';
    const parsed = new URL(candidateUrl, base);
    return parsed.port || fallback;
  } catch (error) {
    return fallback;
  }
}

function refreshActiveSignalAutomationSummary() {
  if (!detailsContainer || !dashboardData || !activeSignalId) {
    return;
  }

  const signals = Array.isArray(dashboardData.signals) ? dashboardData.signals : [];
  const activeSignal = signals.find((candidate) => getSignalDomId(candidate) === activeSignalId);
  if (!activeSignal) {
    return;
  }

  const state = resolveSignalAutomationState(activeSignal);
  const summaryElement = detailsContainer.querySelector('[data-signal-automation-summary]');
  if (!summaryElement) {
    return;
  }

  summaryElement.textContent = state.detailsText;
  summaryElement.classList.remove('text-success', 'text-danger', 'text-muted');

  if (state.tone === 'danger') {
    summaryElement.classList.add('text-danger');
  } else if (state.tone === 'success') {
    summaryElement.classList.add('text-success');
  } else {
    summaryElement.classList.add('text-muted');
  }
}

function resolveSignalAutomationState(signal) {
  const forwarded = Boolean(signal?.automationForwarded);
  const fallbackBadgeText = forwarded ? 'Автоматизация отправлена' : 'Ожидает автоматизацию';
  const fallbackDetailsText = forwarded ? 'Передано в Zapier' : 'Ожидает webhook';
  const fallbackTone = forwarded ? 'success' : 'pending';

  if (!latestAutomationEvent || !signal) {
    return {
      badgeText: fallbackBadgeText,
      detailsText: fallbackDetailsText,
      tone: fallbackTone
    };
  }

  const eventSignalId = extractAutomationSignalId(latestAutomationEvent);
  const signalDomId = getSignalDomId(signal);

  if (!eventSignalId || !signalDomId || String(eventSignalId) !== signalDomId) {
    return {
      badgeText: fallbackBadgeText,
      detailsText: fallbackDetailsText,
      tone: fallbackTone
    };
  }

  const tone = resolveAutomationEventTone(latestAutomationEvent) || fallbackTone;
  const statusLabel = getAutomationEventStatus(latestAutomationEvent);
  const summary = getAutomationEventSummary(latestAutomationEvent);
  const destination = getAutomationEventDestination(latestAutomationEvent);
  const timestamp = getAutomationEventTimestamp(latestAutomationEvent);

  const detailsParts = [];
  if (summary) {
    detailsParts.push(summary);
  }
  if (statusLabel && (!summary || summary.toLowerCase() !== statusLabel.toLowerCase())) {
    detailsParts.push(statusLabel);
  }
  if (destination) {
    detailsParts.push(destination);
  }
  if (timestamp) {
    detailsParts.push(formatRelative(timestamp));
  }

  let badgeText = fallbackBadgeText;
  if (tone === 'danger') {
    badgeText = statusLabel || 'Ошибка автоматизации';
  } else if (tone === 'pending') {
    badgeText = statusLabel || 'Автоматизация в очереди';
  } else if (tone === 'success') {
    badgeText = statusLabel || 'Автоматизация доставлена';
  }

  return {
    badgeText,
    detailsText: detailsParts.length ? detailsParts.join(' • ') : fallbackDetailsText,
    tone
  };
}

function extractAutomationSignalId(event) {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const candidates = [
    event.signalId,
    event.signal_id,
    event.signalID,
    event.signal?.id,
    event.signal?.signalId,
    event.payload?.signalId,
    event.data?.signalId
  ];

  for (const candidate of candidates) {
    if (candidate != null) {
      return String(candidate);
    }
  }

  return null;
}

function getAutomationEventTimestamp(event) {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const candidates = [
    event.receivedAt,
    event.deliveredAt,
    event.sentAt,
    event.triggeredAt,
    event.createdAt,
    event.timestamp,
    event.time
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
}

function getAutomationEventSummary(event) {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const candidates = [event.summary, event.message, event.description, event.event, event.title];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function getAutomationEventStatus(event) {
  if (!event || typeof event !== 'object') {
    return null;
  }

  if (typeof event.success === 'boolean') {
    return event.success ? 'success' : 'failed';
  }

  const candidates = [event.status, event.state, event.result, event.outcome];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function getAutomationEventDestination(event) {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const candidates = [event.destination, event.target, event.integration, event.channel, event.to];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function resolveAutomationEventTone(event) {
  if (!event || typeof event !== 'object') {
    return null;
  }

  if (event.error || event.errorMessage || event.success === false) {
    return 'danger';
  }

  if (event.success === true) {
    return 'success';
  }

  const status = getAutomationEventStatus(event);
  if (status) {
    const normalized = status.toLowerCase();
    if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('cancel') || normalized.includes('stop') || normalized.includes('timeout')) {
      return 'danger';
    }
    if (normalized.includes('pending') || normalized.includes('wait') || normalized.includes('queue') || normalized.includes('processing')) {
      return 'pending';
    }
    if (normalized.includes('success') || normalized.includes('delivered') || normalized.includes('sent') || normalized.includes('forwarded') || normalized.includes('ok')) {
      return 'success';
    }
  }

  return null;
}

function setActiveSignal(signal, element, data = dashboardData) {
  if (activeSignalElement) {
    activeSignalElement.classList.remove('ring-2', 'ring-accent', 'ring-offset-2', 'ring-offset-surface');
  }

  activeSignalElement = element;
  activeSignalElement?.classList.add('ring-2', 'ring-accent', 'ring-offset-2', 'ring-offset-surface');

  const signalDomId = getSignalDomId(signal);
  activeSignalId = signalDomId;

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
    const automationState = resolveSignalAutomationState(signal);
    const automationToneClass =
      automationState.tone === 'danger'
        ? 'text-danger'
        : automationState.tone === 'success'
        ? 'text-success'
        : 'text-muted';
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
          <div class="rounded-xl bg-surface/80 p-3">
            <div class="text-[11px]">Автоматизация</div>
            <div class="mt-1 text-sm font-semibold ${automationToneClass}" data-signal-automation-summary data-signal-id="${signalDomId ?? ''}"></div>
          </div>
        </div>
      </div>
    `;

    const automationSummaryEl = detailsContainer.querySelector('[data-signal-automation-summary]');
    if (automationSummaryEl) {
      automationSummaryEl.textContent = automationState.detailsText;
    }
  }

  if (chart && candleSeries) {
    const focusTime = isoToUnix(signal.timestamp);
    chart.timeScale().setVisibleRange({
      from: focusTime - 60 * 60 * 12,
      to: focusTime + 60 * 60 * 12
    });
  }

  renderCoinSummary(data, signal);
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

function initHeroAnimations() {
  const heroSection = document.querySelector('[data-hero]');
  if (!heroSection) {
    return;
  }

  const heroItems = heroSection.querySelectorAll('[data-hero-item]');
  if (!heroItems.length) {
    return;
  }

  const mediaQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  let observer = null;

  const cleanupObserver = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };

  const resetHeroState = () => {
    cleanupObserver();
    heroSection.removeAttribute('data-hero-ready');
    heroItems.forEach((item) => {
      item.classList.remove('is-hero-visible');
      item.style.removeProperty('--hero-delay');
    });
  };

  const revealHeroItems = () => {
    heroItems.forEach((item) => {
      item.classList.add('is-hero-visible');
    });
  };

  const startAnimation = () => {
    cleanupObserver();
    heroSection.setAttribute('data-hero-ready', 'true');

    heroItems.forEach((item, index) => {
      item.classList.remove('is-hero-visible');
      item.style.setProperty('--hero-delay', `${index * 120}ms`);
    });

    const schedule = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 16);

    const runReveal = () => {
      schedule(() => {
        revealHeroItems();
      });
    };

    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              runReveal();
              cleanupObserver();
            }
          });
        },
        {
          threshold: 0.35
        }
      );
      observer.observe(heroSection);
    } else {
      runReveal();
    }
  };

  const handleMotionChange = (event) => {
    if (event.matches) {
      resetHeroState();
    } else {
      startAnimation();
    }
  };

  if (mediaQuery?.matches) {
    resetHeroState();
  } else {
    startAnimation();
  }

  if (typeof mediaQuery?.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleMotionChange);
  } else if (typeof mediaQuery?.addListener === 'function') {
    mediaQuery.addListener(handleMotionChange);
  }
}
