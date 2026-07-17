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
    moversCurrency: 'ARS', // 'ARS' | 'USD' | 'USDC'
    oldPrices: {} // Track prices for data-flash animations on update
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
    initRRG();
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
                if (state.cedears.length === 0) refreshAllData();
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

    window.addEventListener('resize', resizeAllCharts);

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
    // Save old prices for data flash animations
    state.oldPrices = {};
    if (state.stocks) {
        state.stocks.forEach(s => { state.oldPrices[s.ticker] = s.price; });
    }
    if (state.cedears) {
        state.cedears.forEach(s => { state.oldPrices[s.ticker] = s.price; });
    }
    const mervalPriceEl = document.getElementById('merval-ccl-price');
    if (mervalPriceEl && mervalPriceEl.textContent) {
        const val = parseFloat(mervalPriceEl.textContent.replace(/[^\d,.-]/g, '').replace(',', '.'));
        if (!isNaN(val)) state.oldPrices['MERVAL_CCL'] = val;
    }



    try {
        const fetchPromises = [
            fetch('/api/panel/stocks'),
            fetch('/api/merval-ccl')
        ];
        
        const needCedears = state.assetType === 'cedears' || state.cedears.length === 0 || (state.selectedTicker && state.cedears.some(c => c.ticker === state.selectedTicker));
        if (needCedears) {
            fetchPromises.push(fetch('/api/panel/cedears'));
        }

        const responses = await Promise.all(fetchPromises);
        const stocksRes = responses[0];
        const mervalRes = responses[1];
        const cedearsRes = needCedears ? responses[2] : null;

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

        if (cedearsRes && cedearsRes.ok) {
            state.cedears = await cedearsRes.json();
        }

        updateSectorDropdown();
        renderTable();
        renderMarketMovers();

        if (state.selectedTicker) {
            const asset = state.stocks.find(s => s.ticker === state.selectedTicker) ||
                          state.cedears.find(s => s.ticker === state.selectedTicker);
            if (asset) updateQuickMetrics(asset);

            // Actualizar velas del gráfico activo de forma progresiva
            try {
                const chartRes = await fetch(`/api/history/${state.selectedTicker}`);
                if (chartRes.ok) {
                    const historyData = await chartRes.json();
                    state.historyCache[state.selectedTicker] = historyData;
                    state.historyPoints = historyData;
                    updateChartWithTimeframe(true);
                }
            } catch (e) {
                console.error('Error actualizando gráfico en segundo plano:', e);
            }
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

        // Check if price changed to trigger flash animation
        const oldPrice = state.oldPrices[asset.ticker];
        let flashClass = '';
        if (oldPrice !== undefined && oldPrice !== null && oldPrice !== asset.price) {
            flashClass = asset.price > oldPrice ? 'flash-up' : 'flash-down';
        }

        return `
            <tr class="${isSelected}" data-ticker="${asset.ticker}">
                <td class="col-ticker">${asset.ticker}</td>
                <td class="col-price ${flashClass}">${formatter.format(asset.price)}</td>
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
    if (state.rrgTab === 'rotacion') {
        switchTab('tecnico');
    }
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
        updateChartWithTimeframe(true);
    } else {
        try {
            const res = await fetch(`/api/history/${ticker}`);
            if (res.ok) {
                const historyData = await res.json();
                state.historyCache[ticker] = historyData; // Guardar en caché
                state.historyPoints = historyData;
                state.selectedCurrency = asset.currency;
                updateChartWithTimeframe(true);
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

    // En móviles, mostrar el cajón del gráfico
    const chartSection = document.querySelector('.chart-section');
    if (chartSection) {
        chartSection.classList.add('open-mobile');
        // Esperar a que la animación de deslizamiento termine para redimensionar los gráficos correctamente
        setTimeout(resizeAllCharts, 310);
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

    if (state.currentTimeframe === 'all') {
        priceTimeScale.fitContent();
    } else {
        const lastPoint = historyPoints[historyPoints.length - 1];
        const cutoffStr = getCutoffDateStr(historyPoints, state.currentTimeframe);
        if (cutoffStr) {
            priceTimeScale.setVisibleRange({
                from: cutoffStr,
                to: lastPoint.date
            });
        } else {
            priceTimeScale.fitContent();
        }
    }
    updateHeaderFlag(); // Apply active theme colors to newly created charts
}

function getCutoffDateStr(points, timeframe) {
    if (!points || points.length === 0) return null;
    if (timeframe === 'all' || !timeframe) return null;

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
            return null;
    }

    const year = cutoffDate.getFullYear();
    const month = String(cutoffDate.getMonth() + 1).padStart(2, '0');
    const day = String(cutoffDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function updateChartWithTimeframe(forceRebuild = false) {
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

    if (forceRebuild || !state.chartInstance) {
        renderChart(state.historyPoints, state.selectedCurrency);
    } else {
        const priceTimeScale = state.chartInstance.timeScale();
        if (state.currentTimeframe === 'all') {
            priceTimeScale.fitContent();
        } else {
            const lastPoint = state.historyPoints[state.historyPoints.length - 1];
            const cutoffStr = getCutoffDateStr(state.historyPoints, state.currentTimeframe);
            if (cutoffStr) {
                priceTimeScale.setVisibleRange({
                    from: cutoffStr,
                    to: lastPoint.date
                });
            } else {
                priceTimeScale.fitContent();
            }
        }
    }
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
    
    // Check if price changed to trigger flash animation
    const oldPrice = state.oldPrices['MERVAL_CCL'];
    if (oldPrice !== undefined && oldPrice !== null && oldPrice !== mervalCcl) {
        const flashClass = mervalCcl > oldPrice ? 'flash-up-text' : 'flash-down-text';
        priceEl.classList.remove('flash-up-text', 'flash-down-text');
        void priceEl.offsetWidth; // Trigger reflow
        priceEl.classList.add(flashClass);
    }
    
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
    
    // Check if price changed to trigger flash animation
    const oldPrice = state.oldPrices[asset.ticker];
    if (oldPrice !== undefined && oldPrice !== null && oldPrice !== price) {
        const flashClass = price > oldPrice ? 'flash-up-text' : 'flash-down-text';
        priceEl.classList.remove('flash-up-text', 'flash-down-text');
        void priceEl.offsetWidth; // Trigger reflow
        priceEl.classList.add(flashClass);
    }
    
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

    let accentColor, gridColor;

    if (state.assetType === 'cedears') {
        document.body.classList.remove('theme-acciones');
        document.body.classList.add('theme-cedears');
        flagContainer.innerHTML = usFlag;
        flagContainer.title = "Viendo CEDEARs (Estados Unidos)";
        accentColor = 'rgba(226, 44, 60, 0.15)';
        gridColor = 'rgba(226, 44, 60, 0.04)';
    } else {
        document.body.classList.remove('theme-cedears');
        document.body.classList.add('theme-acciones');
        flagContainer.innerHTML = arFlag;
        flagContainer.title = "Viendo Acciones (Argentina)";
        accentColor = 'rgba(117, 170, 219, 0.15)';
        gridColor = 'rgba(117, 170, 219, 0.04)';
    }

    // Dynamic Chart Theme Updates
    const updateChartColors = (chart) => {
        if (chart) {
            chart.applyOptions({
                grid: {
                    vertLines: { color: gridColor },
                    horzLines: { color: gridColor }
                },
                timeScale: { borderColor: accentColor },
                rightPriceScale: { borderColor: accentColor }
            });
        }
    };
    updateChartColors(state.chartInstance);
    updateChartColors(state.rsiChartInstance);
    updateChartColors(state.macdChartInstance);
}

function resizeAllCharts() {
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
}

// ========= RRG (Relative Rotation Graph) LÓGICA Y CONTROLES =========

const TICKER_SECTORS_MAP = {
    // CEDEARs / US Sector ETFs
    "XLK": "Tecnología",
    "SMH": "Semiconductores",
    "XLF": "Financiero",
    "XLE": "Energía",
    "XLY": "Consumo Discrecional",
    "XLP": "Consumo Básico",
    "XLV": "Salud",
    "XLI": "Industrial",
    "XLB": "Materiales",
    "XLRE": "Real Estate",
    "XLU": "Servicios Públicos",
    "XLC": "Comunicaciones",
    
    // Acciones Locales (Short Names / Sectores)
    "ALUAD": "Aluar (Aluminio)",
    "BBARD": "Banco Francés",
    "BMA.D": "Banco Macro",
    "BYMAD": "BYMA (Mercado)",
    "CEPUD": "Central Puerto (Energía)",
    "COMED": "Soc. Comercial del Plata",
    "CRESD": "Cresud (Agro/Bienes Raíces)",
    "ECOGD": "Dist. de Gas Cuyana",
    "EDND": "Edenor (Energía)",
    "GGALD": "Grupo Fin. Galicia",
    "LOMAD": "Loma Negra (Cemento)",
    "METRD": "Metrogas",
    "PAMPD": "Pampa Energía",
    "SUPVD": "Banco Supervielle",
    "TGN4D": "Transp. Gas del Norte",
    "TGSUD": "Transp. Gas del Sur",
    "TRAND": "Transener (Energía)",
    "TXARD": "Ternium Argentina (Acero)",
    "VALOD": "Grupo Fin. Valores",
    "YPFDD": "YPF (Petróleo/Gas)"
};

const rrgBackgroundPlugin = {
    id: 'rrgBackground',
    beforeDraw: (chart) => {
        const { ctx, chartArea: { left, top, right, bottom }, scales: { x, y } } = chart;
        const centerX = x.getPixelForValue(100);
        const centerY = y.getPixelForValue(100);
        
        // Dibujar Cuadrantes coloreados de fondo (muy translúcidos para el dark mode)
        // Top-Right: Liderando (Verde)
        ctx.fillStyle = 'rgba(34, 197, 94, 0.04)';
        ctx.fillRect(centerX, top, right - centerX, centerY - top);
        
        // Top-Left: Mejorando (Azul)
        ctx.fillStyle = 'rgba(59, 130, 246, 0.04)';
        ctx.fillRect(left, top, centerX - left, centerY - top);
        
        // Bottom-Left: Rezagados (Rojo)
        ctx.fillStyle = 'rgba(239, 68, 68, 0.04)';
        ctx.fillRect(left, centerY, centerX - left, bottom - centerY);
        
        // Bottom-Right: Debilitándose (Amarillo)
        ctx.fillStyle = 'rgba(234, 179, 8, 0.04)';
        ctx.fillRect(centerX, centerY, right - centerX, bottom - centerY);
        
        // Dibujar líneas de cruce en (100, 100)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]); // Línea punteada
        
        // Eje Horizontal (100)
        ctx.beginPath();
        ctx.moveTo(left, centerY);
        ctx.lineTo(right, centerY);
        ctx.stroke();
        
        // Eje Vertical (100)
        ctx.beginPath();
        ctx.moveTo(centerX, top);
        ctx.lineTo(centerX, bottom);
        ctx.stroke();
        
        ctx.setLineDash([]); // Resetear
        
        // Dibujar etiquetas de texto en las esquinas
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.font = 'bold 12px Inter, Outfit, sans-serif';
        
        ctx.fillText('LÍDERES', right - 80, top + 22);
        ctx.fillText('MEJORANDO', left + 15, top + 22);
        ctx.fillText('REZAGADOS', left + 15, bottom - 15);
        ctx.fillText('DEBILITÁNDOSE', right - 115, bottom - 15);
    }
};

const rrgLabelsPlugin = {
    id: 'rrgLabels',
    afterDatasetsDraw: (chart) => {
        const { ctx } = chart;
        chart.data.datasets.forEach((dataset, datasetIndex) => {
            const meta = chart.getDatasetMeta(datasetIndex);
            if (meta.hidden) return;
            
            const points = meta.data;
            if (points.length === 0) return;
            
            const lastPoint = points[points.length - 1];
            if (!lastPoint || lastPoint.skip) return;
            
            const { x: px, y: py } = lastPoint;
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.font = 'bold 9px Inter, Outfit, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            
            ctx.fillText(dataset.label, px + 12, py);
        });
    }
};

function initRRG() {
    state.rrgTab = 'tecnico';
    state.rrgChartInstance = null;
    state.rrgData = null;
    state.rrgPlayInterval = null;
    state.rrgCurrentIndex = 0;
    state.rrgZoom = 1.0;

    const tabTecnico = document.getElementById('tab-btn-tecnico');
    const tabRotacion = document.getElementById('tab-btn-rotacion');
    
    if (tabTecnico) {
        tabTecnico.addEventListener('click', () => switchTab('tecnico'));
    }
    if (tabRotacion) {
        tabRotacion.addEventListener('click', () => switchTab('rotacion'));
    }
    
    const playBtn = document.getElementById('rrg-play-btn');
    const slider = document.getElementById('rrg-time-slider');
    
    if (playBtn) {
        playBtn.addEventListener('click', toggleRRGPlay);
    }
    if (slider) {
        slider.addEventListener('input', (e) => {
            state.rrgCurrentIndex = parseInt(e.target.value);
            renderRRGFrame();
        });
    }

    const zoomInBtn = document.getElementById('rrg-zoom-in-btn');
    const zoomOutBtn = document.getElementById('rrg-zoom-out-btn');
    const zoomLabel = document.getElementById('rrg-zoom-label');
    
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            state.rrgZoom = Math.min(5.0, state.rrgZoom * 1.25);
            if (zoomLabel) zoomLabel.textContent = `${state.rrgZoom.toFixed(1)}x`;
            renderRRGFrame();
        });
    }
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            state.rrgZoom = Math.max(1.0, state.rrgZoom / 1.25);
            if (zoomLabel) zoomLabel.textContent = `${state.rrgZoom.toFixed(1)}x`;
            renderRRGFrame();
        });
    }
    
    // Al cambiar de tipo de activo, si RRG está activo, recargar los cuadrantes
    const assetTabs = document.querySelectorAll('.asset-type-tab');
    assetTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            setTimeout(() => {
                if (state.rrgTab === 'rotacion') {
                    loadRotationGraph();
                }
            }, 50);
        });
    });
}

function switchTab(tabId) {
    state.rrgTab = tabId;
    const btnTecnico = document.getElementById('tab-btn-tecnico');
    const btnRotacion = document.getElementById('tab-btn-rotacion');
    const workspaceTecnico = document.getElementById('chart-workspace');
    const workspaceEmpty = document.getElementById('chart-empty-state');
    const workspaceRotation = document.getElementById('chart-rotation-workspace');
    const controlsRow = document.querySelector('.controls-row');
    const metricsRow = document.querySelector('.asset-metrics');
    const fundamentalsBox = document.getElementById('fundamentals-section');
    const tecnicoHeader = document.getElementById('tecnico-header');
    
    if (tabId === 'tecnico') {
        if (btnTecnico) btnTecnico.classList.add('active');
        if (btnRotacion) btnRotacion.classList.remove('active');
        if (workspaceRotation) workspaceRotation.style.display = 'none';
        
        // Mostrar header de técnico
        if (tecnicoHeader) tecnicoHeader.style.display = 'flex';
        
        // Restaurar controles del gráfico de TV
        if (controlsRow) controlsRow.style.display = 'flex';
        if (metricsRow) metricsRow.style.display = 'flex';
        
        if (state.selectedTicker) {
            if (workspaceTecnico) workspaceTecnico.style.display = 'flex';
            if (workspaceEmpty) workspaceEmpty.style.display = 'none';
            if (fundamentalsBox && !['USD_MAYORISTA', 'USD_MEP', 'USD_CCL', 'MERVAL_CCL'].includes(state.selectedTicker)) {
                fundamentalsBox.style.display = 'block';
            }
        } else {
            if (workspaceTecnico) workspaceTecnico.style.display = 'none';
            if (workspaceEmpty) workspaceEmpty.style.display = 'flex';
        }
        
        setTimeout(resizeAllCharts, 50);
    } else {
        if (btnTecnico) btnTecnico.classList.remove('active');
        if (btnRotacion) btnRotacion.classList.add('active');
        if (workspaceTecnico) workspaceTecnico.style.display = 'none';
        if (workspaceEmpty) workspaceEmpty.style.display = 'none';
        if (fundamentalsBox) fundamentalsBox.style.display = 'none';
        if (controlsRow) controlsRow.style.display = 'none';
        if (metricsRow) metricsRow.style.display = 'none';
        
        // Ocultar header de técnico
        if (tecnicoHeader) tecnicoHeader.style.display = 'none';
        
        if (workspaceRotation) workspaceRotation.style.display = 'flex';
        
        loadRotationGraph();
    }
}

async function loadRotationGraph() {
    const rrgBenchmarkName = document.getElementById('rrg-benchmark-name');
    if (rrgBenchmarkName) {
        rrgBenchmarkName.textContent = state.assetType === 'acciones' ? 'S&P MERVAL (MEP)' : 'S&P 500 (SPY)';
    }
    
    stopRRGPlay();
    
    try {
        const res = await fetch(`/api/rotation?panel=${state.assetType}`);
        if (!res.ok) {
            console.error('Error cargando rotación');
            return;
        }
        const data = await res.json();
        if (data.error) {
            console.error(data.error);
            return;
        }
        
        state.rrgData = data;
        
        const slider = document.getElementById('rrg-time-slider');
        if (slider) {
            slider.min = 0;
            slider.max = data.dates.length - 1;
            slider.value = data.dates.length - 1;
            state.rrgCurrentIndex = data.dates.length - 1;
        }
        
        renderRRGFrame();
    } catch (e) {
        console.error('Error en loadRotationGraph:', e);
    }
}

function toggleRRGPlay() {
    const playBtn = document.getElementById('rrg-play-btn');
    if (state.rrgPlayInterval) {
        stopRRGPlay();
    } else {
        if (playBtn) playBtn.textContent = '⏸ Pause';
        
        const slider = document.getElementById('rrg-time-slider');
        if (slider && state.rrgCurrentIndex >= state.rrgData.dates.length - 1) {
            state.rrgCurrentIndex = 0;
            slider.value = 0;
            renderRRGFrame();
        }
        
        state.rrgPlayInterval = setInterval(() => {
            state.rrgCurrentIndex++;
            if (slider) slider.value = state.rrgCurrentIndex;
            
            if (state.rrgCurrentIndex >= state.rrgData.dates.length - 1) {
                stopRRGPlay();
            }
            renderRRGFrame();
        }, 150);
    }
}

function stopRRGPlay() {
    if (state.rrgPlayInterval) {
        clearInterval(state.rrgPlayInterval);
        state.rrgPlayInterval = null;
    }
    const playBtn = document.getElementById('rrg-play-btn');
    if (playBtn) playBtn.textContent = '▶ Play';
}

function renderRRGFrame() {
    if (!state.rrgData || state.rrgData.dates.length === 0) return;
    
    const currentDate = state.rrgData.dates[state.rrgCurrentIndex];
    const dateLabel = document.getElementById('rrg-current-date');
    if (dateLabel) {
        try {
            const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            const [y, m, d] = currentDate.split('-');
            dateLabel.textContent = `Fecha: ${d} ${months[parseInt(m)-1]} ${y}`;
        } catch(e) {
            dateLabel.textContent = `Fecha: ${currentDate}`;
        }
    }
    
    const datasets = [];
    const tickers = Object.keys(state.rrgData.assets);
    
    const getColorForPoint = (x, y) => {
        if (x >= 100 && y >= 100) return { opaque: '#22c55e', trans: 'rgba(34, 197, 94, 0.45)' };
        if (x < 100 && y >= 100) return { opaque: '#3b82f6', trans: 'rgba(59, 130, 246, 0.45)' };
        if (x < 100 && y < 100) return { opaque: '#ef4444', trans: 'rgba(239, 68, 68, 0.45)' };
        return { opaque: '#eab308', trans: 'rgba(234, 179, 8, 0.45)' };
    };
    
    tickers.forEach(ticker => {
        const points = state.rrgData.assets[ticker];
        const dateIdx = points.findIndex(p => p.date === currentDate);
        
        if (dateIdx === -1) return;
        
        const startIdx = Math.max(0, dateIdx - 5);
        const tailPoints = points.slice(startIdx, dateIdx + 1);
        
        if (tailPoints.length === 0) return;
        
        const currentPt = tailPoints[tailPoints.length - 1];
        const colors = getColorForPoint(currentPt.x, currentPt.y);
        
        const pointRadii = tailPoints.map((p, idx) => idx === tailPoints.length - 1 ? 8 : 2.5);
        const bgColors = tailPoints.map((p, idx) => idx === tailPoints.length - 1 ? colors.opaque : colors.trans);
        const borderColors = tailPoints.map((p, idx) => idx === tailPoints.length - 1 ? '#ffffff' : colors.trans);
        const borderWidths = tailPoints.map((p, idx) => idx === tailPoints.length - 1 ? 2 : 0.8);
        
        datasets.push({
            label: ticker,
            data: tailPoints.map(p => ({ x: p.x, y: p.y })),
            showLine: true,
            borderColor: colors.trans,
            borderWidth: 1.5,
            fill: false,
            pointRadius: pointRadii,
            pointBackgroundColor: bgColors,
            pointBorderColor: borderColors,
            pointBorderWidth: borderWidths,
            pointHoverRadius: tailPoints.map((p, idx) => idx === tailPoints.length - 1 ? 11 : 4),
            tension: 0.15
        });
    });
    
    if (state.rrgChartInstance) {
        state.rrgChartInstance.destroy();
    }
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    datasets.forEach(ds => {
        ds.data.forEach(pt => {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
        });
    });
    
    // Fallbacks si no hay datos
    if (minX === Infinity || maxX === -Infinity) { minX = 95; maxX = 105; }
    if (minY === Infinity || maxY === -Infinity) { minY = 95; maxY = 105; }
    
    let rangeX = maxX - minX;
    let rangeY = maxY - minY;
    
    // Forzar rangos mínimos para evitar escalas microscópicas
    if (rangeX < 1.0) {
        const midX = (minX + maxX) / 2;
        minX = midX - 0.5;
        maxX = midX + 0.5;
        rangeX = 1.0;
    }
    if (rangeY < 1.0) {
        const midY = (minY + maxY) / 2;
        minY = midY - 0.5;
        maxY = midY + 0.5;
        rangeY = 1.0;
    }
    
    // Agregar un 8% de padding dinámico
    const padX = rangeX * 0.08;
    const padY = rangeY * 0.08;
    
    const centerValX = (minX + maxX) / 2;
    const centerValY = (minY + maxY) / 2;
    
    const halfWidthX = (rangeX / 2 + padX) / (state.rrgZoom || 1.0);
    const halfHeightY = (rangeY / 2 + padY) / (state.rrgZoom || 1.0);
    
    const minValX = centerValX - halfWidthX;
    const maxValX = centerValX + halfWidthX;
    const minValY = centerValY - halfHeightY;
    const maxValY = centerValY + halfHeightY;
    
    const ctx = document.getElementById('rrgCanvas').getContext('2d');
    state.rrgChartInstance = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 0
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const ticker = context.dataset.label;
                            const desc = TICKER_SECTORS_MAP[ticker] || '';
                            const labelText = desc ? `${ticker} (${desc})` : ticker;
                            const x = context.raw.x;
                            const y = context.raw.y;
                            return `${labelText} — Fuerza: ${x.toFixed(2)}, Momentum: ${y.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    min: minValX,
                    max: maxValX,
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.4)',
                        font: {
                            family: 'Inter, Outfit, sans-serif',
                            size: 11
                        }
                    },
                    title: {
                        display: true,
                        text: 'FUERZA RELATIVA (RS-RATIO)',
                        color: 'rgba(255, 255, 255, 0.3)',
                        font: {
                            family: 'Outfit, sans-serif',
                            size: 11,
                            weight: 'bold'
                        }
                    }
                },
                y: {
                    min: minValY,
                    max: maxValY,
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.4)',
                        font: {
                            family: 'Inter, Outfit, sans-serif',
                            size: 11
                        }
                    },
                    title: {
                        display: true,
                        text: 'MOMENTUM RELATIVO (RS-MOMENTUM)',
                        color: 'rgba(255, 255, 255, 0.3)',
                        font: {
                            family: 'Outfit, sans-serif',
                            size: 11,
                            weight: 'bold'
                        }
                    }
                }
            }
        },
        plugins: [rrgBackgroundPlugin, rrgLabelsPlugin]
    });
}
