// Estado Global de la App
const state = {
    stocks: [],
    cedears: [],
    assetType: 'acciones', // 'acciones' | 'cedears'
    currentPanel: 'lider', // 'lider', 'general'
    currentCurrency: 'ARS', // 'ARS', 'USD', 'USDC'
    searchQuery: '',
    currentSector: 'all',
    selectedTicker: null,
    chartInstance: null,
    candleSeries: null,
    volumeSeries: null,
    sma20Series: null,
    sma50Series: null,
    sma100Series: null,
    sma200Series: null,
    bbUpperSeries: null,
    bbLowerSeries: null,
    bbMiddleSeries: null,
    rsiChartInstance: null,
    rsiSeries: null,
    rsiMaSeries: null,
    rsiBand70Series: null,
    rsiBand30Series: null,
    macdChartInstance: null,
    macdLineSeries: null,
    macdSignalSeries: null,
    macdHistSeries: null,
    showSMA: false,
    showBollinger: false,
    countdown: 30,
    timerId: null,
    countdownIntervalId: null,
    historyPoints: [],
    historyCache: {}, // Caché en memoria para datos históricos
    selectedCurrency: 'ARS',
    currentTimeframe: 'YTD',
    sortBy: 'ticker',
    sortDirection: 'asc',
    moversTab: 'gainers', // 'gainers' | 'losers'
    moversCurrency: 'ARS' // 'ARS' | 'USD' | 'USDC'
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

// Formateador de moneda USDC (Cable)
const formatUSDC = {
    format: (val) => {
        if (val === null || val === undefined || isNaN(val)) return 'N/A';
        const num = new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(val);
        return `USDC ${num}`;
    }
};

// Función para calcular SMA en el frontend
function calculateSMA(data, period) {
    const sma = [];
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
        sum += data[i].close;
        if (i >= period) {
            sum -= data[i - period].close;
        }
        if (i >= period - 1) {
            sma.push({ time: data[i].time, value: parseFloat((sum / period).toFixed(2)) });
        }
    }
    return sma;
}

// Función para calcular SMA de valores simples (RSI) en el frontend
function calculateSMAOnValue(data, period) {
    const sma = [];
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
        sum += data[i].value;
        if (i >= period) {
            sum -= data[i - period].value;
        }
        if (i >= period - 1) {
            sma.push({ time: data[i].time, value: parseFloat((sum / period).toFixed(2)) });
        }
    }
    return sma;
}

document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    updateHeaderFlag();
    refreshAllData();
    startCountdown();
});

function initEventListeners() {
    // Eventos de click para el selector de Acciones / CEDEARs
    const assetTypeTabs = document.querySelectorAll('.asset-type-tab');
    assetTypeTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            assetTypeTabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            state.assetType = e.target.dataset.type;
            updateHeaderFlag();
            
            const panelContainer = document.getElementById('panel-filter-container');
            const usdcTab = document.getElementById('currency-usdc-tab');
            const moversUsdcTab = document.getElementById('movers-currency-usdc-tab');
            
            if (state.assetType === 'cedears') {
                if (panelContainer) panelContainer.style.display = 'none';
                if (usdcTab) usdcTab.style.display = 'block';
                if (moversUsdcTab) moversUsdcTab.style.display = 'block';
            } else {
                if (panelContainer) panelContainer.style.display = 'flex';
                if (usdcTab) usdcTab.style.display = 'none';
                if (moversUsdcTab) moversUsdcTab.style.display = 'none';
                
                // Si la moneda seleccionada era USDC, resetear a ARS
                if (state.currentCurrency === 'USDC') {
                    state.currentCurrency = 'ARS';
                    const currencyTabs = document.querySelectorAll('.currency-tab');
                    currencyTabs.forEach(t => {
                        if (t.dataset.currency === 'ARS') t.classList.add('active');
                        else t.classList.remove('active');
                    });
                }
                if (state.moversCurrency === 'USDC') {
                    state.moversCurrency = 'ARS';
                    const moversCurrencyTabs = document.querySelectorAll('.movers-currency-tab');
                    moversCurrencyTabs.forEach(t => {
                        if (t.dataset.currency === 'ARS') t.classList.add('active');
                        else t.classList.remove('active');
                    });
                }
            }
            
            state.currentSector = 'all';
            const btnText = document.getElementById('sector-filter-btn-text');
            if (btnText) btnText.textContent = 'Sector: Todos';
            updateSectorDropdown();

            renderTable();
            renderMarketMovers();
        });
    });

    // Evento de click para el widget del Merval CCL
    const mervalWidget = document.getElementById('merval-ccl-widget');
    if (mervalWidget) {
        mervalWidget.style.cursor = 'pointer';
        mervalWidget.addEventListener('click', () => {
            selectAsset('MERVAL_CCL');
        });
    }

    // Eventos de click para los widgets de dólares
    const a3500Widget = document.getElementById('dolar-a3500-widget');
    if (a3500Widget) {
        a3500Widget.addEventListener('click', () => {
            selectAsset('USD_MAYORISTA');
        });
    }
    const mepWidget = document.getElementById('dolar-mep-widget');
    if (mepWidget) {
        mepWidget.addEventListener('click', () => {
            selectAsset('USD_MEP');
        });
    }
    const cclWidget = document.getElementById('dolar-ccl-widget');
    if (cclWidget) {
        cclWidget.addEventListener('click', () => {
            selectAsset('USD_CCL');
        });
    }

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

    // Market Movers currency tabs
    const moversCurrencyTabs = document.querySelectorAll('.movers-currency-tab');
    moversCurrencyTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            moversCurrencyTabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            state.moversCurrency = e.target.dataset.currency;
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

    // Evento para abrir/cerrar el dropdown de indicadores
    const dropdownBtn = document.getElementById('indicators-dropdown-btn');
    const dropdownContainer = document.querySelector('.indicators-dropdown-container');
    if (dropdownBtn && dropdownContainer) {
        dropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownContainer.classList.toggle('open');
        });
        
        // Cerrar al hacer click afuera
        document.addEventListener('click', (e) => {
            if (!dropdownContainer.contains(e.target)) {
                dropdownContainer.classList.remove('open');
            }
        });
    }

    // Inicializar estado de checkboxes desde state
    const smaCheckbox = document.getElementById('indicator-sma');
    const bollingerCheckbox = document.getElementById('indicator-bollinger');

    if (smaCheckbox) {
        smaCheckbox.checked = state.showSMA;
        smaCheckbox.addEventListener('change', (e) => {
            state.showSMA = e.target.checked;
            const visible = state.showSMA;
            if (state.sma20Series) state.sma20Series.applyOptions({ visible });
            if (state.sma50Series) state.sma50Series.applyOptions({ visible });
            if (state.sma100Series) state.sma100Series.applyOptions({ visible });
            if (state.sma200Series) state.sma200Series.applyOptions({ visible });
        });
    }

    if (bollingerCheckbox) {
        bollingerCheckbox.checked = state.showBollinger;
        bollingerCheckbox.addEventListener('change', (e) => {
            state.showBollinger = e.target.checked;
            const visible = state.showBollinger;
            if (state.bbUpperSeries) state.bbUpperSeries.applyOptions({ visible });
            if (state.bbLowerSeries) state.bbLowerSeries.applyOptions({ visible });
            if (state.bbMiddleSeries) state.bbMiddleSeries.applyOptions({ visible });
        });
    }

    window.addEventListener('resize', () => {
        const resizeChart = (chart, containerId) => {
            if (chart) {
                const el = document.getElementById(containerId);
                if (el) {
                    chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
                }
            }
        };
        resizeChart(state.chartInstance, 'tv-chart-container');
        resizeChart(state.rsiChartInstance, 'tv-rsi-container');
        resizeChart(state.macdChartInstance, 'tv-macd-container');
    });

    // Evento para abrir/cerrar el dropdown de sectores
    const sectorBtn = document.getElementById('sector-filter-btn');
    const sectorContainer = document.getElementById('sector-filter-container');
    if (sectorBtn && sectorContainer) {
        sectorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sectorContainer.classList.toggle('open');
        });
        
        // Cerrar al hacer click afuera
        document.addEventListener('click', (e) => {
            if (!sectorContainer.contains(e.target)) {
                sectorContainer.classList.remove('open');
            }
        });
    }
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
        const [stocksRes, cedearsRes, mervalRes] = await Promise.all([
            fetch('/api/panel/stocks'),
            fetch('/api/panel/cedears'),
            fetch('/api/merval-ccl')
        ]);

        if (stocksRes.ok) {
            state.stocks = await stocksRes.json();
            
            // Actualizar widgets de dólares en el encabezado
            const usdMay = state.stocks.find(s => s.ticker === 'USD_MAYORISTA');
            const usdMep = state.stocks.find(s => s.ticker === 'USD_MEP');
            const usdCcl = state.stocks.find(s => s.ticker === 'USD_CCL');
            
            if (usdMay) updateDolarWidget('dolar-a3500', usdMay);
            if (usdMep) updateDolarWidget('dolar-mep', usdMep);
            if (usdCcl) updateDolarWidget('dolar-ccl', usdCcl);
        }

        if (cedearsRes.ok) {
            state.cedears = await cedearsRes.json();
        }

        updateSectorDropdown();
        renderTable();
        renderMarketMovers();

        if (state.selectedTicker) {
            const asset = state.stocks.find(s => s.ticker === state.selectedTicker) ||
                          state.cedears.find(s => s.ticker === state.selectedTicker);
            if (asset) updateQuickMetrics(asset);
        }

        if (mervalRes.ok) {
            const mervalData = await mervalRes.json();
            updateMervalWidget(mervalData);
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

    const listToFilter = state.assetType === 'cedears' ? state.cedears : state.stocks;

    const valid = listToFilter.filter(s => 
        s.price > 0 && 
        s.ticker !== 'USD_MAYORISTA' && 
        s.ticker !== 'USD_MEP' && 
        s.ticker !== 'USD_CCL' &&
        s.currency === state.moversCurrency
    );

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
        const formatter = asset.currency === 'USDC' ? formatUSDC : (asset.currency === 'USD' ? formatUSD : formatARS);
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
    
    const listToFilter = state.assetType === 'cedears' ? state.cedears : state.stocks;
    
    let filtered = listToFilter.filter(s => s.ticker !== 'USD_MAYORISTA' && s.ticker !== 'USD_MEP' && s.ticker !== 'USD_CCL');

    if (state.assetType === 'acciones' && state.currentPanel !== 'all') {
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

    if (state.currentSector && state.currentSector !== 'all') {
        filtered = filtered.filter(s => s.sector === state.currentSector);
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
        document.getElementById('total-count').textContent = listToFilter.length;
        return;
    }

    document.getElementById('showing-count').textContent = filtered.length;
    document.getElementById('total-count').textContent = listToFilter.length;

    tbody.innerHTML = filtered.map(asset => {
        const isSelected = state.selectedTicker === asset.ticker ? 'active-row' : '';
        const pillClass = asset.change_pct > 0 ? 'up' : asset.change_pct < 0 ? 'down' : 'neutral';
        const sign = asset.change_pct > 0 ? '+' : '';
        const formatter = asset.currency === 'USDC' ? formatUSDC : (asset.currency === 'USD' ? formatUSD : formatARS);

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

    let asset = state.stocks.find(s => s.ticker === ticker) || state.cedears.find(s => s.ticker === ticker);
    if (ticker === 'MERVAL_CCL') {
        asset = {
            ticker: 'MERVAL_CCL',
            name: 'Índice S&P Merval CCL',
            currency: 'USD',
            price: 0.0
        };
        const priceText = document.getElementById('merval-ccl-price').textContent;
        // Parsear el precio actual del widget (ej. "USD 2.011,93" -> 2011.93)
        const parsedPrice = parseFloat(priceText.replace('USD ', '').replace(/\./g, '').replace(',', '.'));
        if (!isNaN(parsedPrice)) {
            asset.price = parsedPrice;
        }
    }
    
    if (!asset) return;

    let displayTicker = ticker;
    let displayName = asset.name || 'Acción del Panel BCBA';
    if (ticker === 'USD_MAYORISTA') {
        displayTicker = 'A3500';
        displayName = 'Dólar Mayorista (A3500)';
    } else if (ticker === 'USD_MEP') {
        displayTicker = 'MEP';
        displayName = 'Dólar MEP';
    } else if (ticker === 'USD_CCL') {
        displayTicker = 'CCL';
        displayName = 'Dólar CCL';
    }
    
    document.getElementById('drawer-ticker').textContent = displayTicker;
    document.getElementById('drawer-name').textContent = displayName;
    document.getElementById('chart-empty-state').style.display = 'none';
    document.getElementById('chart-workspace').style.display = 'flex';

    updateQuickMetrics(asset);

    // Determine if this is a stock (not FX or index) for fundamentals
    const isEquity = !['USD_MAYORISTA', 'USD_MEP', 'USD_CCL', 'MERVAL_CCL'].includes(ticker);

    // Si ya está en caché del frontend, lo cargamos instantáneamente sin petición de red
    if (state.historyCache[ticker]) {
        state.historyPoints = state.historyCache[ticker];
        state.selectedCurrency = asset.currency;
        updateChartWithTimeframe();
    } else {
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

    // Fetch fundamentals for equities only
    if (isEquity) {
        fetchFundamentals(ticker);
    } else {
        const fundSection = document.getElementById('fundamentals-section');
        if (fundSection) fundSection.style.display = 'none';
    }
}

function updateQuickMetrics(asset) {
    const formatter = asset.currency === 'USDC' ? formatUSDC : (asset.currency === 'USD' ? formatUSD : formatARS);
    document.getElementById('metric-close').textContent = formatter.format(asset.price);
}

function renderChart(historyPoints, currency) {
    const container = document.getElementById('tv-chart-container');
    const rsiContainer = document.getElementById('tv-rsi-container');
    const macdContainer = document.getElementById('tv-macd-container');
    
    // Clear containers
    container.innerHTML = '';
    if (rsiContainer) rsiContainer.innerHTML = '';
    if (macdContainer) macdContainer.innerHTML = '';

    // Remove existing instances if they exist
    const dest = (chart) => {
        if (chart) {
            try { chart.remove(); } catch (e) { console.error('Error al destruir gráfico:', e); }
        }
    };
    dest(state.chartInstance);
    dest(state.rsiChartInstance);
    dest(state.macdChartInstance);
    
    state.chartInstance = null;
    state.rsiChartInstance = null;
    state.macdChartInstance = null;
    
    state.candleSeries = null;
    state.volumeSeries = null;
    state.sma20Series = null;
    state.sma50Series = null;
    state.sma100Series = null;
    state.sma200Series = null;
    state.bbUpperSeries = null;
    state.bbLowerSeries = null;
    state.bbMiddleSeries = null;
    state.rsiSeries = null;
    state.rsiMaSeries = null;
    state.rsiBand70Series = null;
    state.rsiBand30Series = null;
    state.macdLineSeries = null;
    state.macdSignalSeries = null;
    state.macdHistSeries = null;

    if (!historyPoints || historyPoints.length === 0) return;

    // Common layout options
    const commonLayout = {
        background: { type: 'solid', color: '#050505' },
        textColor: '#8a8078',
        fontFamily: 'Inter, sans-serif'
    };
    
    const commonGrid = {
        vertLines: { color: 'rgba(255, 140, 0, 0.03)' },
        horzLines: { color: 'rgba(255, 140, 0, 0.03)' }
    };

    // 1. PRICE CHART
    state.chartInstance = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight || 300,
        layout: commonLayout,
        grid: commonGrid,
        timeScale: {
            visible: false, // Hide time scale for price chart
            borderColor: 'rgba(255, 140, 0, 0.12)'
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

    state.volumeSeries = state.chartInstance.addHistogramSeries({
        priceFormat: {
            type: 'volume',
        },
        priceScaleId: 'volume',
    });

    state.chartInstance.priceScale('volume').applyOptions({
        scaleMargins: {
            top: 0.8, // Volume bars occupy bottom 20%
            bottom: 0,
        },
        visible: false,
    });

    state.sma20Series = state.chartInstance.addLineSeries({
        color: '#ffb300', // Gold Yellow (highly visible)
        lineWidth: 2,
        title: 'SMA 20',
        visible: state.showSMA
    });

    state.sma50Series = state.chartInstance.addLineSeries({
        color: '#00e5ff', // Neon Cyan (highly visible)
        lineWidth: 2,
        title: 'SMA 50',
        visible: state.showSMA
    });

    state.sma100Series = state.chartInstance.addLineSeries({
        color: '#ec4899', // Hot Pink (highly visible)
        lineWidth: 2,
        title: 'SMA 100',
        visible: state.showSMA
    });

    state.sma200Series = state.chartInstance.addLineSeries({
        color: '#ffffff', // White (highly visible)
        lineWidth: 2,
        title: 'SMA 200',
        visible: state.showSMA
    });

    state.bbUpperSeries = state.chartInstance.addLineSeries({
        color: 'rgba(168, 85, 247, 0.4)', // Violet (subtle, doesn't clash)
        lineWidth: 1.5,
        lineStyle: 1, // Dashed
        title: 'BB Upper',
        visible: state.showBollinger
    });

    state.bbLowerSeries = state.chartInstance.addLineSeries({
        color: 'rgba(168, 85, 247, 0.4)',
        lineWidth: 1.5,
        lineStyle: 1, // Dashed
        title: 'BB Lower',
        visible: state.showBollinger
    });

    state.bbMiddleSeries = state.chartInstance.addLineSeries({
        color: 'rgba(168, 85, 247, 0.25)',
        lineWidth: 1,
        lineStyle: 2, // Dotted
        title: 'BB Middle',
        visible: state.showBollinger
    });

    // 2. RSI CHART
    if (rsiContainer) {
        state.rsiChartInstance = LightweightCharts.createChart(rsiContainer, {
            width: rsiContainer.clientWidth,
            height: 100,
            layout: commonLayout,
            grid: commonGrid,
            timeScale: {
                visible: false, // Hide time scale
                borderColor: 'rgba(255, 140, 0, 0.12)'
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 140, 0, 0.12)'
            }
        });

        state.rsiBand70Series = state.rsiChartInstance.addAreaSeries({
            topColor: 'rgba(139, 92, 246, 0.08)',
            bottomColor: 'rgba(139, 92, 246, 0.08)',
            lineColor: 'rgba(0, 0, 0, 0)',
            lineWidth: 0,
            lineVisible: false,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
        });

        state.rsiBand30Series = state.rsiChartInstance.addAreaSeries({
            topColor: '#050505',
            bottomColor: '#050505',
            lineColor: 'rgba(0, 0, 0, 0)',
            lineWidth: 0,
            lineVisible: false,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
        });

        state.rsiSeries = state.rsiChartInstance.addLineSeries({
            color: '#7e57c2', // TradingView Violet
            lineWidth: 1.5
        });

        state.rsiMaSeries = state.rsiChartInstance.addLineSeries({
            color: '#fbbf24', // TradingView Yellow MA
            lineWidth: 1.5
        });

        // RSI Levels (TradingView Style)
        state.rsiSeries.createPriceLine({
            price: 70,
            color: 'rgba(139, 92, 246, 0.3)',
            lineWidth: 1,
            lineStyle: 2, // Dotted
            axisLabelVisible: false,
            title: '70'
        });
        state.rsiSeries.createPriceLine({
            price: 30,
            color: 'rgba(139, 92, 246, 0.3)',
            lineWidth: 1,
            lineStyle: 2, // Dotted
            axisLabelVisible: false,
            title: '30'
        });
        state.rsiSeries.createPriceLine({
            price: 50,
            color: 'rgba(139, 92, 246, 0.15)',
            lineWidth: 1,
            lineStyle: 2, // Dotted
            axisLabelVisible: false
        });
    }

    // 3. MACD CHART
    if (macdContainer) {
        state.macdChartInstance = LightweightCharts.createChart(macdContainer, {
            width: macdContainer.clientWidth,
            height: 110,
            layout: commonLayout,
            grid: commonGrid,
            timeScale: {
                visible: true, // Show time scale on the bottom chart
                borderColor: 'rgba(255, 140, 0, 0.12)',
                timeVisible: true
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 140, 0, 0.12)'
            }
        });

        state.macdLineSeries = state.macdChartInstance.addLineSeries({
            color: '#2962FF', // TradingView MACD Blue
            lineWidth: 1.5
        });

        state.macdSignalSeries = state.macdChartInstance.addLineSeries({
            color: '#FF6D00', // TradingView Signal Orange
            lineWidth: 1.5
        });

        state.macdHistSeries = state.macdChartInstance.addHistogramSeries({
            priceFormat: {
                type: 'volume'
            }
        });
    }

    // Data lists
    const candles = [];
    const volumeData = [];
    const bbUpperData = [];
    const bbLowerData = [];
    const bbMiddleData = [];
    const rsiData = [];
    const macdLineData = [];
    const macdSignalData = [];
    const macdHistData = [];

    let prevMacdHist = null;
    historyPoints.forEach(p => {
        const time = p.date;
        candles.push({ time, open: p.open, high: p.high, low: p.low, close: p.close });

        if (p.volume !== null && p.volume !== undefined) {
            const isUp = p.close >= p.open;
            const color = isUp ? 'rgba(38, 166, 154, 0.45)' : 'rgba(239, 83, 80, 0.45)';
            volumeData.push({ time, value: p.volume, color });
        }

        if (p.bb_upper !== null && p.bb_upper !== undefined) {
            bbUpperData.push({ time, value: p.bb_upper });
        }
        if (p.bb_lower !== null && p.bb_lower !== undefined) {
            bbLowerData.push({ time, value: p.bb_lower });
        }
        if (p.bb_middle !== null && p.bb_middle !== undefined) {
            bbMiddleData.push({ time, value: p.bb_middle });
        }
        if (state.rsiSeries && p.rsi !== null && p.rsi !== undefined) {
            rsiData.push({ time, value: p.rsi });
        }
        if (state.macdLineSeries && p.macd !== null && p.macd !== undefined) {
            macdLineData.push({ time, value: p.macd });
        }
        if (state.macdSignalSeries && p.macd_signal !== null && p.macd_signal !== undefined) {
            macdSignalData.push({ time, value: p.macd_signal });
        }
        if (state.macdHistSeries && p.macd_hist !== null && p.macd_hist !== undefined) {
            let color;
            if (p.macd_hist >= 0) {
                if (prevMacdHist === null || p.macd_hist > prevMacdHist) {
                    color = '#26a69a'; // Creciente positivo (Teal oscuro)
                } else {
                    color = '#b2dfdb'; // Decreciente positivo (Teal claro)
                }
            } else {
                if (prevMacdHist === null || p.macd_hist < prevMacdHist) {
                    color = '#ef5350'; // Decreciente negativo (Rojo oscuro)
                } else {
                    color = '#ffcdd2'; // Creciente negativo (Rojo claro)
                }
            }
            macdHistData.push({ time, value: p.macd_hist, color });
            prevMacdHist = p.macd_hist;
        }
    });

    state.candleSeries.setData(candles);
    if (state.volumeSeries) state.volumeSeries.setData(volumeData);

    // Calcular SMAs usando la serie HISTÓRICA COMPLETA (state.historyPoints) para evitar desvirtuar los indicadores según el plazo visible
    const fullCandles = state.historyPoints.map(p => ({
        time: p.date,
        close: p.close
    }));
    const fullSma20 = calculateSMA(fullCandles, 20);
    const fullSma50 = calculateSMA(fullCandles, 50);
    const fullSma100 = calculateSMA(fullCandles, 100);
    const fullSma200 = calculateSMA(fullCandles, 200);

    // Filtrar los datos calculados para que coincidan únicamente con las fechas visibles en el gráfico
    const visibleDates = new Set(candles.map(c => c.time));
    const sma20Data = fullSma20.filter(d => visibleDates.has(d.time));
    const sma50Data = fullSma50.filter(d => visibleDates.has(d.time));
    const sma100Data = fullSma100.filter(d => visibleDates.has(d.time));
    const sma200Data = fullSma200.filter(d => visibleDates.has(d.time));

    state.sma20Series.setData(sma20Data);
    state.sma50Series.setData(sma50Data);
    state.sma100Series.setData(sma100Data);
    state.sma200Series.setData(sma200Data);
    state.bbUpperSeries.setData(bbUpperData);
    state.bbLowerSeries.setData(bbLowerData);
    state.bbMiddleSeries.setData(bbMiddleData);
    if (state.rsiSeries) {
        // Generar las bandas sombreadas
        const rsiBand70Data = rsiData.map(d => ({ time: d.time, value: 70 }));
        const rsiBand30Data = rsiData.map(d => ({ time: d.time, value: 30 }));
        if (state.rsiBand70Series) state.rsiBand70Series.setData(rsiBand70Data);
        if (state.rsiBand30Series) state.rsiBand30Series.setData(rsiBand30Data);

        // Calcular la media del RSI usando la serie histórica completa de RSI para evitar desvirtuaciones
        const fullRsi = state.historyPoints
            .filter(p => p.rsi !== null && p.rsi !== undefined)
            .map(p => ({ time: p.date, value: p.rsi }));
        const fullRsiMa = calculateSMAOnValue(fullRsi, 14);
        const rsiMaData = fullRsiMa.filter(d => visibleDates.has(d.time));

        state.rsiSeries.setData(rsiData);
        if (state.rsiMaSeries) state.rsiMaSeries.setData(rsiMaData);
    }
    if (state.macdLineSeries) state.macdLineSeries.setData(macdLineData);
    if (state.macdSignalSeries) state.macdSignalSeries.setData(macdSignalData);
    if (state.macdHistSeries) state.macdHistSeries.setData(macdHistData);

    // Sync Time Scales
    const priceTimeScale = state.chartInstance.timeScale();
    const rsiTimeScale = state.rsiChartInstance ? state.rsiChartInstance.timeScale() : null;
    const macdTimeScale = state.macdChartInstance ? state.macdChartInstance.timeScale() : null;

    if (rsiTimeScale && macdTimeScale) {
        let isSyncing = false;
        const syncTimeScale = (source, targets) => {
            source.subscribeVisibleTimeRangeChange(range => {
                if (isSyncing || !range) return;
                isSyncing = true;
                targets.forEach(t => {
                    if (t) t.setVisibleRange(range);
                });
                isSyncing = false;
            });
        };
        syncTimeScale(priceTimeScale, [rsiTimeScale, macdTimeScale]);
        syncTimeScale(rsiTimeScale, [priceTimeScale, macdTimeScale]);
        syncTimeScale(macdTimeScale, [priceTimeScale, rsiTimeScale]);
    }

    if (historyPoints.length > 0) {
        const last = historyPoints[historyPoints.length - 1];
        const formatter = currency === 'USDC' ? formatUSDC : (currency === 'USD' ? formatUSD : formatARS);
        
        const lastSma20 = sma20Data.length > 0 ? sma20Data[sma20Data.length - 1].value : null;
        const lastSma50 = sma50Data.length > 0 ? sma50Data[sma50Data.length - 1].value : null;
        const lastSma100 = sma100Data.length > 0 ? sma100Data[sma100Data.length - 1].value : null;
        const lastSma200 = sma200Data.length > 0 ? sma200Data[sma200Data.length - 1].value : null;

        document.getElementById('metric-sma20').textContent = lastSma20 ? formatter.format(lastSma20) : 'N/A';
        document.getElementById('metric-sma50').textContent = lastSma50 ? formatter.format(lastSma50) : 'N/A';
        document.getElementById('metric-sma100').textContent = lastSma100 ? formatter.format(lastSma100) : 'N/A';
        document.getElementById('metric-sma200').textContent = lastSma200 ? formatter.format(lastSma200) : 'N/A';
        document.getElementById('metric-rsi').textContent = last.rsi ? `${last.rsi} pts` : 'N/A';
    }

    priceTimeScale.fitContent();
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

function updateMervalWidget(data) {
    const priceEl = document.getElementById('merval-ccl-price');
    const changeEl = document.getElementById('merval-ccl-change');
    
    if (!priceEl || !changeEl) return;
    
    const mervalCcl = data && data.merval_ccl !== undefined ? data.merval_ccl : 0;
    const changePct = data && data.change_pct !== undefined ? data.change_pct : 0;
    
    // Formato de miles y decimales estándar
    const formattedPrice = new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(mervalCcl);
    
    priceEl.textContent = `USD ${formattedPrice}`;
    
    const sign = changePct > 0 ? '+' : '';
    changeEl.textContent = `${sign}${Number(changePct).toFixed(2)}%`;
    
    changeEl.className = 'change-pill';
    if (changePct > 0) {
        changeEl.classList.add('up');
    } else if (changePct < 0) {
        changeEl.classList.add('down');
    } else {
        changeEl.classList.add('neutral');
    }
}

function updateDolarWidget(prefix, asset) {
    const priceEl = document.getElementById(`${prefix}-price`);
    const changeEl = document.getElementById(`${prefix}-change`);
    if (!priceEl || !changeEl) return;
    
    const price = asset.price || 0;
    const changePct = asset.change_pct || 0;
    
    const formattedPrice = new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(price);
    
    priceEl.textContent = `ARS ${formattedPrice}`;
    
    const sign = changePct > 0 ? '+' : '';
    changeEl.textContent = `${sign}${Number(changePct).toFixed(2)}%`;
    
    changeEl.className = 'change-pill';
    if (changePct > 0) {
        changeEl.classList.add('up');
    } else if (changePct < 0) {
        changeEl.classList.add('down');
    } else {
        changeEl.classList.add('neutral');
    }
}

// ========= FUNDAMENTALS =========

async function fetchFundamentals(ticker) {
    const fundSection = document.getElementById('fundamentals-section');
    if (!fundSection) return;

    // Show section with loading state
    fundSection.style.display = 'block';
    populateFundamentals(null); // Reset to loading

    try {
        const res = await fetch(`/api/fundamentals/${encodeURIComponent(ticker)}`);
        if (res.ok) {
            const data = await res.json();
            populateFundamentals(data);
        } else {
            console.warn(`Fundamentals not available for ${ticker} (status ${res.status})`);
            populateFundamentals(null, true);
        }
    } catch (e) {
        console.error('Error fetching fundamentals:', e);
        populateFundamentals(null, true);
    }
}

function populateFundamentals(data, isError = false) {
    const setValue = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || '---';
    };

    if (!data || isError) {
        const loadingText = isError ? 'No disponible' : 'Cargando...';
        setValue('f-sector', loadingText);
        setValue('f-industry', loadingText);
        setValue('f-market-cap', loadingText);
        setValue('f-pe-ratio', loadingText);
        setValue('f-div-yield', loadingText);
        setValue('f-eps', loadingText);
        setValue('f-beta', loadingText);
        setValue('f-price-to-book', loadingText);
        setValue('f-profit-margin', loadingText);
        const descEl = document.getElementById('f-description');
        if (descEl) descEl.textContent = isError ? 'Información no disponible para este activo.' : 'Cargando descripción...';
        return;
    }

    setValue('f-sector', data.sector);
    setValue('f-industry', data.industry);
    setValue('f-market-cap', data.market_cap);
    setValue('f-pe-ratio', data.pe_ratio);
    setValue('f-div-yield', data.dividend_yield);
    setValue('f-eps', data.eps);
    setValue('f-beta', data.beta);
    setValue('f-price-to-book', data.price_to_book);
    setValue('f-profit-margin', data.profit_margin);
    const descEl = document.getElementById('f-description');
    if (descEl) descEl.textContent = data.description || 'No hay descripción disponible.';
}

// ========= SECTOR FILTER DROPDOWN =========

function updateSectorDropdown() {
    const listToProcess = state.assetType === 'cedears' ? state.cedears : state.stocks;
    
    const sectorsSet = new Set();
    listToProcess.forEach(asset => {
        if (asset.sector && asset.sector !== 'Monedas' && asset.sector !== 'Índices' && asset.ticker !== 'USD_MAYORISTA' && asset.ticker !== 'USD_MEP' && asset.ticker !== 'USD_CCL') {
            sectorsSet.add(asset.sector);
        }
    });
    
    const sortedSectors = Array.from(sectorsSet).sort();
    
    const dropdown = document.getElementById('sector-filter-dropdown');
    if (!dropdown) return;
    
    let html = `
        <div class="sector-dropdown-item ${state.currentSector === 'all' ? 'active' : ''}" data-sector="all">
            Todos los sectores
        </div>
    `;
    
    sortedSectors.forEach(sector => {
        const isActive = state.currentSector === sector ? 'active' : '';
        html += `
            <div class="sector-dropdown-item ${isActive}" data-sector="${sector}">
                ${sector}
            </div>
        `;
    });
    
    dropdown.innerHTML = html;
    
    dropdown.querySelectorAll('.sector-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const sector = e.currentTarget.dataset.sector;
            state.currentSector = sector;
            
            const btnText = document.getElementById('sector-filter-btn-text');
            if (btnText) {
                btnText.textContent = sector === 'all' ? 'Sector: Todos' : sector;
            }
            
            dropdown.querySelectorAll('.sector-dropdown-item').forEach(el => el.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            renderTable();
            
            const sectorContainer = document.getElementById('sector-filter-container');
            if (sectorContainer) {
                sectorContainer.classList.remove('open');
            }
        });
    });
}

function updateHeaderFlag() {
    const flagContainer = document.getElementById('brand-flag');
    if (!flagContainer) return;

    const arFlag = `<svg viewBox="0 0 18 12" width="24" height="16" class="flag-icon" xmlns="http://www.w3.org/2000/svg">
  <rect width="18" height="4" fill="#75AADB"/>
  <rect y="4" width="18" height="4" fill="#FFFFFF"/>
  <rect y="8" width="18" height="4" fill="#75AADB"/>
  <circle cx="9" cy="6" r="1.2" fill="#F6B426"/>
  <circle cx="9" cy="6" r="0.5" fill="#E5A515"/>
</svg>`;

    const usFlag = `<svg viewBox="0 0 18 12" width="24" height="16" class="flag-icon" xmlns="http://www.w3.org/2000/svg">
  <rect width="18" height="12" fill="#B22234"/>
  <rect y="0.92" width="18" height="0.92" fill="#FFFFFF"/>
  <rect y="2.77" width="18" height="0.92" fill="#FFFFFF"/>
  <rect y="4.62" width="18" height="0.92" fill="#FFFFFF"/>
  <rect y="6.46" width="18" height="0.92" fill="#FFFFFF"/>
  <rect y="8.31" width="18" height="0.92" fill="#FFFFFF"/>
  <rect y="10.15" width="18" height="0.92" fill="#FFFFFF"/>
  <rect width="7.5" height="6.46" fill="#3C3B6E"/>
  <g fill="#FFFFFF">
    <circle cx="1.5" cy="1.3" r="0.3"/>
    <circle cx="3.0" cy="1.3" r="0.3"/>
    <circle cx="4.5" cy="1.3" r="0.3"/>
    <circle cx="6.0" cy="1.3" r="0.3"/>
    <circle cx="2.25" cy="2.6" r="0.3"/>
    <circle cx="3.75" cy="2.6" r="0.3"/>
    <circle cx="5.25" cy="2.6" r="0.3"/>
    <circle cx="1.5" cy="3.9" r="0.3"/>
    <circle cx="3.0" cy="3.9" r="0.3"/>
    <circle cx="4.5" cy="3.9" r="0.3"/>
    <circle cx="6.0" cy="3.9" r="0.3"/>
    <circle cx="2.25" cy="5.2" r="0.3"/>
    <circle cx="3.75" cy="5.2" r="0.3"/>
    <circle cx="5.25" cy="5.2" r="0.3"/>
  </g>
</svg>`;

    if (state.assetType === 'cedears') {
        document.body.classList.remove('theme-acciones');
        document.body.classList.add('theme-cedears');
        flagContainer.innerHTML = usFlag;
        flagContainer.title = "Viendo CEDEARs (Estados Unidos)";
    } else {
        document.body.classList.remove('theme-cedears');
        document.body.classList.add('theme-acciones');
        flagContainer.innerHTML = arFlag;
        flagContainer.title = "Viendo Acciones (Argentina)";
    }
}
