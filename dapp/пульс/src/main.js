import './style.css';
import { createChart, CrosshairMode } from 'lightweight-charts';
import payload from './data/mockSignals.json';

const chartContainer = document.getElementById('chart-root');
const signalsList = document.getElementById('signals-list');
const detailsContainer = document.getElementById('signal-details');
const subtitleEl = document.getElementById('indicator-subtitle');
const symbolEl = document.getElementById('indicator-symbol');
const metricsGrid = document.getElementById('metrics-grid');
const emailBadge = document.getElementById('email-badge');

let candleSeries;
let chart;
let activeSignalElement = null;

if (!chartContainer || !signalsList || !detailsContainer) {
  console.warn('UI containers are missing. Check index.html layout.');
} else {
  initialiseDashboard();
}

function initialiseDashboard() {
  hydrateHeader();
  renderMetrics();
  renderChart();
  renderSignals();
}

function renderChart() {
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

  const candleData = payload.candles.map((point) => ({
    time: isoToUnix(point.time),
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close
  }));

  candleSeries.setData(candleData);
  candleSeries.setMarkers(payload.signals.map((signal) => ({
    time: isoToUnix(signal.timestamp),
    position: signal.type === 'BUY' ? 'belowBar' : 'aboveBar',
    color: signal.type === 'BUY' ? '#46C078' : '#DC5A78',
    shape: signal.type === 'BUY' ? 'arrowUp' : 'arrowDown',
    text: `${signal.type} ${formatPrice(signal.price)}`
  })));

  chart.timeScale().fitContent();

  window.addEventListener('resize', () => {
    chart.resize(chartContainer.clientWidth, chartContainer.clientHeight || height);
  });
}

function renderSignals() {
  signalsList.innerHTML = '';

  payload.signals.forEach((signal) => {
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

  if (payload.signals.length > 0) {
    setActiveSignal(payload.signals[0], signalsList.firstElementChild);
  }
}

function renderMetrics() {
  if (!metricsGrid) return;

  metricsGrid.innerHTML = '';
  payload.metrics.forEach((metric) => {
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

function hydrateHeader() {
  if (symbolEl) {
    symbolEl.textContent = payload.symbol;
  }
  if (subtitleEl) {
    subtitleEl.textContent = `${payload.timeframe} • обновлено ${formatRelative(payload.lastUpdated)}`;
  }
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

function formatPrice(value) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: payload.quoteAsset,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
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
