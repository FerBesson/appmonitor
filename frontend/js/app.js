// Estado Global de la App
const state = {
    stocks: [],
    currentPanel: 'all', // 'all', 'lider', 'general'
    currentCurrency: 'ARS', // 'ARS', 'USD'
    searchQuery: '',
    selectedTicker: null,
    chartInstance: null,
    candleSeries: null,
    sma20Series: null,
    sma50Series: null,
    countdown: 30,
    timerId: null,
    countdownIntervalId: null,
    historyPoints: [],
    historyCache: {}, // Caché en memoria para datos históricos
    selectedCurrency: 'ARS',
    currentTimeframe: 'all',
    sortBy: 'ticker',
    sortDirection: 'asc',
    moversTab: 'gainers' // 'gainers' | 'losers'
};

// Formateador de moneda argentina
const formatARS = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2
});

// Formateador de moneda estadounidense
const formatUSD = {
    format: (val) => {
        if (val === null || val === undefined || isNaN(val)) return 'N/A';
        const num = new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(val);
        return `USD ${num}`;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    refreshAllData();
    startCountdown();
});

function initEventListeners() {
    document.getElementById('refresh-btn').addEventListener('click', () => {
        state.countdown = 30;
        state.historyCache = {}; // Limpiar caché histórico al refrescar manualmente
        refreshAllData();
        startCountdown();
    });

    const searchInput = document.getElementById('search-input');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim().toUpperCase();
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            renderTable();
        }, 150);
    });

    // Evento para ordenar la tabla haciendo click en los encabezados
    const headers = document.querySelectorAll('.market-table th');
    headers.forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (state.sortBy === field) {
                state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortBy = field;
                state.sortDirection = field === 'ticker' ? 'asc' : 'desc';
            }
            renderTable();
        });
    });

    const panelTabs = document.querySelectorAll('.panel-tab');
    panelTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            panelTabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            state.currentPanel = e.target.dataset.panel;
            renderTable();
        });
    });

    const currencyTabs = document.querySelectorAll('.currency-tab');
    currencyTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            currencyTabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            state.currentCurrency = e.target.dataset.currency;
            renderTable();
        });
    });

    document.getElementById('close-drawer').addEventListener('click', () => {
        // En mobile, ocultar la sección de gráfico
        document.querySelector('.chart-section').classList.remove('open-mobile');
    });

    // Market Movers tabs
    const moversTabs = document.querySelectorAll('.movers-tab');
    moversTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            moversTabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            state.moversTab = e.target.dataset.movers;
            renderMarketMovers();
        });
    });

    // Eventos de selección de plazo (tarjetas de gráfico)
    const tfSelector = document.getElementById('timeframe-selector');
    if (tfSelector) {
        tfSelector.querySelectorAll('.timeframe-card').forEach(btn => {
            btn.addEventListener('click', (e) => {
                state.currentTimeframe = e.target.dataset.range;
                updateChartWithTimeframe();
            });
        });
    }

    window.addEventListener('resize', () => {
        if (state.chartInstance) {
            const container = document.getElementById('tv-chart-container');
            state.chartInstance.applyOptions({
                width: container.clientWidth,
                height: container.clientHeight
            });
        }
    });
}

function startCountdown() {
    if (state.countdownIntervalId) {
        clearInterval(state.countdownIntervalId);
    }
    state.countdownIntervalId = setInterval(() => {
        state.countdown--;
        document.getElementById('countdown').textContent = state.countdown;
        if (state.countdown <= 0) {
            state.countdown = 30;
            refreshAllData();
        }
    }, 1000);
}

async function refreshAllData() {
    try {
        const stocksRes = await fetch('/api/panel/stocks');

        if (stocksRes.ok) {
            state.stocks = await stocksRes.json();
            renderTable();
            renderMarketMovers();
            if (state.selectedTicker) {
                const asset = state.stocks.find(s => s.ticker === state.selectedTicker);
                if (asset) updateQuickMetrics(asset);
            }
        }
    } catch (err) {
        console.error('Error conectando al backend:', err);
        document.getElementById('status-text').textContent = 'DESCONECTADO';
        document.querySelector('.status-pill').style.color = '#ef4444';
    }
}

// ═══════════════════════════════════════
// MARKET MOVERS (Right Panel)
// ═══════════════════════════════════════
function renderMarketMovers() {
    const container = document.getElementById('movers-list');
    if (!container) return;

    const valid = state.stocks.filter(s => s.price > 0);

    let movers;
    if (state.moversTab === 'gainers') {
        movers = [...valid].sort((a, b) => b.change_pct - a.change_pct).slice(0, 5);
    } else {
        movers = [...valid].sort((a, b) => a.change_pct - b.change_pct).slice(0, 5);
    }

    if (movers.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Sin datos</div>';
        return;
    }

    container.innerHTML = movers.map(asset => {
        const formatter = asset.currency === 'USD' ? formatUSD : formatARS;
        const sign = asset.change_pct > 0 ? '+' : '';
        const changeClass = asset.change_pct > 0 ? 'up' : asset.change_pct < 0 ? 'down' : '';

        return `
            <div class="mover-row" data-ticker="${asset.ticker}">
                <div class="mover-info">
                    <span class="mover-ticker">${asset.ticker}</span>
                    <span class="mover-price">${formatter.format(asset.price)}</span>
                </div>
                <span class="mover-change ${changeClass}">${sign}${asset.change_pct.toFixed(2)}%</span>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.mover-row').forEach(row => {
        row.addEventListener('click', () => {
            selectAsset(row.dataset.ticker);
        });
    });
}

// ═══════════════════════════════════════
// STOCKS TABLE (Left Panel)
// ═══════════════════════════════════════
function renderTable() {
    const tbody = document.getElementById('stocks-tbody');
    let filtered = [...state.stocks];

    if (state.currentPanel !== 'all') {
        filtered = filtered.filter(s => s.panel === state.currentPanel);
    }

    if (state.currentCurrency !== 'all') {
        filtered = filtered.filter(s => s.currency === state.currentCurrency);
    }

    if (state.searchQuery) {
        filtered = filtered.filter(s =>
            s.ticker.includes(state.searchQuery) ||
            (s.name && s.name.toUpperCase().includes(state.searchQuery))
        );
    }

    // Ordenar según columna seleccionada
    const sortField = state.sortBy;
    const sortDir = state.sortDirection === 'asc' ? 1 : -1;

    filtered.sort((a, b) => {
        let valA, valB;
        if (sortField === 'ticker') {
            valA = a.ticker;
            valB = b.ticker;
            return valA.localeCompare(valB) * sortDir;
        } else if (sortField === 'price') {
            valA = a.price;
            valB = b.price;
        } else if (sortField === 'change') {
            valA = a.change_pct;
            valB = b.change_pct;
        }

        if (valA < valB) return -1 * sortDir;
        if (valA > valB) return 1 * sortDir;
        return 0;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 20px; color:#64748b;">Sin resultados</td></tr>`;
        document.getElementById('showing-count').textContent = '0';
        document.getElementById('total-count').textContent = state.stocks.length;
        return;
    }

    document.getElementById('showing-count').textContent = filtered.length;
    document.getElementById('total-count').textContent = state.stocks.length;

    tbody.innerHTML = filtered.map(asset => {
        const isSelected = state.selectedTicker === asset.ticker ? 'active-row' : '';
        const pillClass = asset.change_pct > 0 ? 'up' : asset.change_pct < 0 ? 'down' : 'neutral';
        const sign = asset.change_pct > 0 ? '+' : '';
        const formatter = asset.currency === 'USD' ? formatUSD : formatARS;

        return `
            <tr class="${isSelected}" data-ticker="${asset.ticker}">
                <td class="col-ticker">${asset.ticker}</td>
                <td class="col-price">${formatter.format(asset.price)}</td>
                <td class="col-change"><span class="change-pill ${pillClass}">${sign}${asset.change_pct.toFixed(2)}%</span></td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('tr').forEach(row => {
        row.addEventListener('click', () => {
            const ticker = row.dataset.ticker;
            selectAsset(ticker);
        });
    });

    updateHeaderIndicators();
}

// ═══════════════════════════════════════
// ASSET SELECTION & CHART
// ═══════════════════════════════════════
async function selectAsset(ticker) {
    state.selectedTicker = ticker;
    renderTable();

    const asset = state.stocks.find(s => s.ticker === ticker);
    if (!asset) return;

    document.getElementById('drawer-ticker').textContent = ticker;
    document.getElementById('drawer-name').textContent = asset.name || 'Acción del Panel BCBA';
    document.getElementById('chart-empty-state').style.display = 'none';
    document.getElementById('chart-workspace').style.display = 'flex';

    updateQuickMetrics(asset);

    // Si ya está en caché del frontend, lo cargamos instantáneamente sin petición de red
    if (state.historyCache[ticker]) {
        state.historyPoints = state.historyCache[ticker];
        state.selectedCurrency = asset.currency;
        updateChartWithTimeframe();
        return;
    }

    try {
        const res = await fetch(`/api/history/${ticker}`);
        if (res.ok) {
            const historyData = await res.json();
            state.historyCache[ticker] = historyData; // Guardar en caché
            state.historyPoints = historyData;
            state.selectedCurrency = asset.currency;
            updateChartWithTimeframe();
        } else {
            console.warn('Histórico no disponible para este ticker');
        }
    } catch (e) {
        console.error('Error obteniendo gráfico:', e);
    }
}

function updateQuickMetrics(asset) {
    const formatter = asset.currency === 'USD' ? formatUSD : formatARS;
    document.getElementById('metric-close').textContent = formatter.format(asset.price);
}

function renderChart(historyPoints, currency) {
    const container = document.getElementById('tv-chart-container');
    container.innerHTML = '';

    if (state.chartInstance) {
        try {
            state.chartInstance.remove();
        } catch (e) {
            console.error('Error al destruir el gráfico previo:', e);
        }
        state.chartInstance = null;
        state.candleSeries = null;
        state.sma20Series = null;
        state.sma50Series = null;
    }

    state.chartInstance = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight || 380,
        layout: {
            background: { type: 'solid', color: '#050505' },
            textColor: '#8a8078',
            fontFamily: 'Inter, sans-serif'
        },
        grid: {
            vertLines: { color: 'rgba(255, 140, 0, 0.04)' },
            horzLines: { color: 'rgba(255, 140, 0, 0.04)' }
        },
        timeScale: {
            borderColor: 'rgba(255, 140, 0, 0.12)',
            timeVisible: true
        },
        rightPriceScale: {
            borderColor: 'rgba(255, 140, 0, 0.12)'
        }
    });

    state.candleSeries = state.chartInstance.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderDownColor: '#ef4444',
        borderUpColor: '#22c55e',
        wickDownColor: '#ef4444',
        wickUpColor: '#22c55e',
    });

    state.sma20Series = state.chartInstance.addLineSeries({
        color: '#fbbf24',
        lineWidth: 2,
        title: 'SMA 20'
    });

    state.sma50Series = state.chartInstance.addLineSeries({
        color: '#60a5fa',
        lineWidth: 2,
        title: 'SMA 50'
    });

    const candles = [];
    const sma20Data = [];
    const sma50Data = [];

    historyPoints.forEach(p => {
        candles.push({
            time: p.date,
            open: p.open,
            high: p.high,
            low: p.low,
            close: p.close
        });

        if (p.sma20 !== null && p.sma20 !== undefined) {
            sma20Data.push({ time: p.date, value: p.sma20 });
        }
        if (p.sma50 !== null && p.sma50 !== undefined) {
            sma50Data.push({ time: p.date, value: p.sma50 });
        }
    });

    state.candleSeries.setData(candles);
    state.sma20Series.setData(sma20Data);
    state.sma50Series.setData(sma50Data);

    if (historyPoints.length > 0) {
        const last = historyPoints[historyPoints.length - 1];
        const formatter = currency === 'USD' ? formatUSD : formatARS;
        document.getElementById('metric-sma20').textContent = last.sma20 ? formatter.format(last.sma20) : 'N/A';
        document.getElementById('metric-sma50').textContent = last.sma50 ? formatter.format(last.sma50) : 'N/A';
        document.getElementById('metric-rsi').textContent = last.rsi ? `${last.rsi} pts` : 'N/A';
    }

    state.chartInstance.timeScale().fitContent();
}

function updateChartWithTimeframe() {
    if (!state.historyPoints || state.historyPoints.length === 0) return;

    // Sincronizar UI de botones de plazo
    const tfSelector = document.getElementById('timeframe-selector');
    if (tfSelector) {
        tfSelector.querySelectorAll('.timeframe-card').forEach(btn => {
            if (btn.dataset.range === state.currentTimeframe) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    const filteredPoints = filterPointsByTimeframe(state.historyPoints, state.currentTimeframe);
    renderChart(filteredPoints, state.selectedCurrency);
}

function filterPointsByTimeframe(points, timeframe) {
    if (!points || points.length === 0) return [];
    if (timeframe === 'all' || !timeframe) return points;

    const lastPoint = points[points.length - 1];
    const refDate = new Date(lastPoint.date + 'T00:00:00');
    let cutoffDate = new Date(refDate);

    switch (timeframe) {
        case '7d':
            cutoffDate.setDate(refDate.getDate() - 7);
            break;
        case '1m':
            cutoffDate.setMonth(refDate.getMonth() - 1);
            break;
        case '3m':
            cutoffDate.setMonth(refDate.getMonth() - 3);
            break;
        case '6m':
            cutoffDate.setMonth(refDate.getMonth() - 6);
            break;
        case 'YTD':
            cutoffDate = new Date(refDate.getFullYear(), 0, 1);
            break;
        case '1a':
            cutoffDate.setFullYear(refDate.getFullYear() - 1);
            break;
        default:
            return points;
    }

    const year = cutoffDate.getFullYear();
    const month = String(cutoffDate.getMonth() + 1).padStart(2, '0');
    const day = String(cutoffDate.getDate()).padStart(2, '0');
    const cutoffStr = `${year}-${month}-${day}`;

    return points.filter(p => p.date >= cutoffStr);
}

function updateHeaderIndicators() {
    const headers = document.querySelectorAll('.market-table th');
    headers.forEach(th => {
        const sortField = th.dataset.sort;
        const iconSpan = th.querySelector('.sort-icon');
        if (!iconSpan) return;

        if (sortField === state.sortBy) {
            iconSpan.textContent = state.sortDirection === 'asc' ? ' ▲' : ' ▼';
            th.classList.add('sorted');
        } else {
            iconSpan.textContent = '';
            th.classList.remove('sorted');
        }
    });
}
