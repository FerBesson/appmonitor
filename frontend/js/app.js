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
    macdDummySeries: null,
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
    oldPrices: {}, // Track prices for data-flash animations on update
    isOnline: true,
    consecutiveFailures: 0,
    cedearRatios: {},
    usQuotes: {},
    currentRatio: 1
};

function getBaseTicker(ticker) {
    if (!ticker) return '';
    const t = ticker.toUpperCase();
    if (t === 'BRKBC' || t === 'BRKBD' || t === 'BRKB') return 'BRKB';
    if (t.length > 3 && (t.endsWith('D') || t.endsWith('C')) && !t.startsWith('USD_')) {
        let base = t.slice(0, -1);
        if (base.endsWith('D')) base = base.slice(0, -1);
        return base;
    }
    return t;
}

function getCompanyLogoSrc(ticker) {
    if (!ticker) return '';
    const cleanSym = ticker.toUpperCase().replace('.BA', '').trim();
    const base = getBaseTicker(cleanSym);
    return `https://assets.parqet.com/logos/symbol/${base}`;
}
window.getCompanyLogoSrc = getCompanyLogoSrc;

function handleLogoError(img, ticker) {
    if (!img) return;
    const cleanSym = (ticker || '').toUpperCase().replace('.BA', '').trim();
    const base = getBaseTicker(cleanSym);
    
    const fmpLogo = `https://financialmodelingprep.com/image-stock/${base}.png`;
    const localSvg = `assets/logos/${base}.svg`;
    const localPng = `assets/logos/${base}.png`;

    if (!img.dataset.triedFmp) {
        img.dataset.triedFmp = '1';
        img.src = fmpLogo;
        return;
    }
    if (!img.dataset.triedLocalSvg) {
        img.dataset.triedLocalSvg = '1';
        img.src = localSvg;
        return;
    }
    if (!img.dataset.triedLocalPng) {
        img.dataset.triedLocalPng = '1';
        img.src = localPng;
        return;
    }

    img.style.display = 'none';
    const fallback = img.nextElementSibling;
    if (fallback && (fallback.classList.contains('ticker-logo-fallback') || fallback.classList.contains('company-tile-fallback') || fallback.classList.contains('monthly-mini-fallback'))) {
        fallback.style.display = 'inline-flex';
    }
}
window.handleLogoError = handleLogoError;

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
    loadCedearRatios();
    updateArbitrageTabVisibility();
    refreshAllData();
    startCountdown();
    initRRG();
    setTimeout(updateAssetTabPill, 50);
    window.addEventListener('resize', updateAssetTabPill);
});

function updateArbitrageTabVisibility() {
    const btnArbitraje = document.getElementById('tab-btn-arbitraje');
    if (!btnArbitraje) return;

    if (state.assetType === 'cedears') {
        btnArbitraje.style.display = 'flex';
    } else {
        btnArbitraje.style.display = 'none';
        if (state.rrgTab === 'arbitraje') {
            switchTab('tecnico');
        }
    }
}

async function loadCedearRatios() {
    try {
        const res = await fetch('/api/cedear-ratios');
        if (res.ok) {
            state.cedearRatios = await res.json();
        }
    } catch (e) {
        console.error('Error cargando ratios de CEDEARs:', e);
    }
}

function updateAssetTabPill() {
    const sliderPill = document.getElementById('asset-type-slider-pill');
    const activeTab = document.querySelector('.asset-type-tab.active');
    const container = document.getElementById('asset-type-select-tabs');
    if (!sliderPill || !activeTab || !container) return;

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeTab.getBoundingClientRect();

    const leftOffset = activeRect.left - containerRect.left;
    const width = activeRect.width;

    sliderPill.style.left = `${leftOffset}px`;
    sliderPill.style.width = `${width}px`;
}

function initEventListeners() {
    window.addEventListener('online', () => {
        console.log('Conexión a internet restablecida');
        updateConnectionStatus(true);
        refreshAllData();
    });

    window.addEventListener('offline', () => {
        console.warn('Sin conexión a internet');
        updateConnectionStatus(false, 'SIN CONEXIÓN');
    });

    // Eventos de click para el selector de Acciones / CEDEARs
    const assetTypeTabs = document.querySelectorAll('.asset-type-tab');
    assetTypeTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const targetType = e.target.dataset.type;
            if (state.assetType === targetType) return;

            // 1. Mover el pill deslizante de inmediato para respuesta táctil instantánea
            assetTypeTabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            updateAssetTabPill();

            const tableContainer = document.querySelector('.table-container');
            const moversSection = document.querySelector('.movers-section');
            const sidebarEarnings = document.querySelector('.sidebar-earnings-section');
            const animatedElements = [tableContainer, moversSection, sidebarEarnings].filter(Boolean);

            // 2. Iniciar transición de salida (fade + micro blur)
            animatedElements.forEach(el => {
                el.classList.remove('asset-transition-in');
                el.classList.add('asset-transition-out');
            });

            setTimeout(() => {
                state.assetType = targetType;
                updateHeaderFlag();
                updateArbitrageTabVisibility();

                const panelContainer = document.getElementById('panel-filter-container');
                const usdcTab = document.getElementById('currency-usdc-tab');
                const moversUsdcTab = document.getElementById('movers-currency-usdc-tab');

                if (state.assetType === 'cedears') {
                    if (panelContainer) panelContainer.classList.add('hidden-filter');
                    if (usdcTab) {
                        usdcTab.style.display = '';
                        usdcTab.classList.remove('hidden-filter');
                    }
                    if (moversUsdcTab) {
                        moversUsdcTab.style.display = '';
                        moversUsdcTab.classList.remove('hidden-filter');
                    }
                    if (state.cedears.length === 0) refreshAllData();
                } else {
                    if (panelContainer) panelContainer.classList.remove('hidden-filter');
                    if (usdcTab) usdcTab.classList.add('hidden-filter');
                    if (moversUsdcTab) moversUsdcTab.classList.add('hidden-filter');

                    // Reset USDC a ARS si era la moneda seleccionada
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
                loadSidebarEarnings();

                // 3. Iniciar transición de entrada (fade-in en cascada)
                animatedElements.forEach(el => {
                    el.classList.remove('asset-transition-out');
                    el.classList.add('asset-transition-in');
                });

                setTimeout(() => {
                    animatedElements.forEach(el => el.classList.remove('asset-transition-in'));
                }, 350);
            }, 140);
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

function updateConnectionStatus(isOk, message = null) {
    const statusPill = document.querySelector('.status-pill');
    const statusText = document.getElementById('status-text');
    if (!statusPill || !statusText) return;

    if (isOk) {
        state.isOnline = true;
        state.consecutiveFailures = 0;
        statusPill.classList.remove('offline', 'reconnecting');
        statusPill.classList.add('live-pulse');
        statusPill.style.color = '';
        statusText.textContent = 'ACTUALIZADO';
    } else {
        state.consecutiveFailures++;
        statusPill.classList.remove('live-pulse');
        if (navigator.onLine === false || state.consecutiveFailures >= 2) {
            state.isOnline = false;
            statusPill.classList.remove('reconnecting');
            statusPill.classList.add('offline');
            statusPill.style.color = '';
            statusText.textContent = 'SIN CONEXIÓN';
        } else {
            state.isOnline = false;
            statusPill.classList.remove('offline');
            statusPill.classList.add('reconnecting');
            statusPill.style.color = '';
            statusText.textContent = message || 'RECONECTANDO...';
        }
    }
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

        let anySuccess = false;

        if (stocksRes.ok) {
            state.stocks = await stocksRes.json();
            anySuccess = true;
            
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
            anySuccess = true;
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
            anySuccess = true;
        }
        
        loadSidebarEarnings();

        if (anySuccess) {
            updateConnectionStatus(true);
        } else {
            updateConnectionStatus(false, 'ERROR SERVIDOR');
        }
    } catch (err) {
        console.error('Error conectando al backend:', err);
        updateConnectionStatus(false);
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
                    <div class="ticker-cell">
                        <img src="${getCompanyLogoSrc(asset.ticker)}" 
                             class="ticker-logo" 
                             alt="${asset.ticker}" 
                             onerror="handleLogoError(this, '${asset.ticker}')" />
                        <span class="ticker-logo-fallback" style="display:none;">${asset.ticker.charAt(0)}</span>
                        <span class="mover-ticker">${asset.ticker}</span>
                    </div>
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
                <td class="col-ticker">
                    <div class="ticker-cell">
                        <img src="${getCompanyLogoSrc(asset.ticker)}" 
                             class="ticker-logo" 
                             alt="${asset.ticker}" 
                             onerror="handleLogoError(this, '${asset.ticker}')" />
                        <span class="ticker-logo-fallback" style="display:none;">${asset.ticker.charAt(0)}</span>
                        <span>${asset.ticker}</span>
                    </div>
                </td>
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
    if (state.rrgTab === 'rotacion' || state.rrgTab === 'ema200' || state.rrgTab === 'earnings') {
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
    
    document.getElementById('drawer-ticker').innerHTML = `
        <div class="ticker-cell">
            <img src="${getCompanyLogoSrc(ticker)}" class="ticker-logo" alt="${ticker}" onerror="handleLogoError(this, '${ticker}')" />
            <span class="ticker-logo-fallback" style="display:none;">${ticker.charAt(0)}</span>
            <span>${displayTicker}</span>
        </div>
    `;
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
    updateCedearCalculator(asset);
}

function updateCedearCalculator(asset) {
    const calcSection = document.getElementById('cedear-calc-section');
    if (!calcSection) return;

    if (!asset || (asset.panel !== 'cedear' && state.assetType !== 'cedears')) {
        calcSection.style.display = 'none';
        return;
    }

    calcSection.style.display = 'block';

    const cleanSym = (asset.ticker || '').toUpperCase().replace('.BA', '').trim();
    const baseTicker = getBaseTicker(cleanSym);

    // 1. Obtener Ratio
    const ratio = state.cedearRatios[baseTicker] || state.cedearRatios[cleanSym] || 1;
    state.currentRatio = ratio;

    const ratioValEl = document.getElementById('calc-ratio-val');
    const ratioDescEl = document.getElementById('calc-ratio-desc');
    if (ratioValEl) ratioValEl.textContent = `${ratio} : 1`;
    if (ratioDescEl) ratioDescEl.textContent = `${ratio} CEDEARs = 1 acción EE.UU. (${baseTicker})`;

    // 2. Precios en ARS y USD
    let priceARS = asset.currency === 'ARS' ? asset.price : 0;
    let priceUSDD = asset.currency === 'USD' ? asset.price : 0;

    // Buscar variante equivalente en ARS y USD (D) en state.cedears
    const arsAsset = state.cedears.find(c => c.currency === 'ARS' && getBaseTicker(c.ticker) === baseTicker);
    const usdAsset = state.cedears.find(c => (c.currency === 'USD' || c.ticker.endsWith('D')) && getBaseTicker(c.ticker) === baseTicker);

    if (arsAsset && arsAsset.price > 0) priceARS = arsAsset.price;
    if (usdAsset && usdAsset.price > 0) priceUSDD = usdAsset.price;

    // Benchmark CCL de mercado
    let benchmarkCCL = 0;
    const usdCclQuote = state.stocks.find(s => s.ticker === 'USD_CCL');
    if (usdCclQuote && usdCclQuote.price > 0) {
        benchmarkCCL = usdCclQuote.price;
    }
    if (!benchmarkCCL) {
        const mervalPriceEl = document.getElementById('merval-ccl-price');
        if (mervalPriceEl && mervalPriceEl.textContent) {
            const val = parseFloat(mervalPriceEl.textContent.replace(/[^\d,.-]/g, '').replace(',', '.'));
            if (!isNaN(val)) benchmarkCCL = val;
        }
    }
    if (!benchmarkCCL) benchmarkCCL = 1580;

    let implicitCCL = 0;
    let usUnderlyingPrice = 0;

    if (priceARS > 0 && priceUSDD > 0) {
        implicitCCL = priceARS / priceUSDD;
        usUnderlyingPrice = priceUSDD * ratio;
    } else if (priceARS > 0 && benchmarkCCL > 0) {
        implicitCCL = benchmarkCCL;
        usUnderlyingPrice = (priceARS * ratio) / benchmarkCCL;
    }

    const usPriceEl = document.getElementById('calc-us-price');
    const implicitCclEl = document.getElementById('calc-implicit-ccl');
    const cclDiffLabelEl = document.getElementById('calc-ccl-diff-label');
    const brechaPillEl = document.getElementById('calc-brecha-pill');

    if (usPriceEl) {
        usPriceEl.textContent = usUnderlyingPrice > 0 
            ? `USD ${usUnderlyingPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
            : 'USD N/A';
    }

    if (implicitCclEl) {
        implicitCclEl.textContent = implicitCCL > 0 
            ? `ARS ${implicitCCL.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
            : 'ARS N/A';
    }

    if (cclDiffLabelEl) {
        cclDiffLabelEl.textContent = benchmarkCCL > 0 
            ? `vs CCL Mercado (ARS ${benchmarkCCL.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` 
            : 'vs CCL Mercado';
    }

    // Brecha % vs CCL Benchmark
    if (implicitCCL > 0 && benchmarkCCL > 0 && brechaPillEl) {
        const brechaPct = ((implicitCCL - benchmarkCCL) / benchmarkCCL) * 100;
        const sign = brechaPct >= 0 ? '+' : '';
        brechaPillEl.textContent = `${sign}${brechaPct.toFixed(2)}% Brecha`;
        
        brechaPillEl.classList.remove('discount', 'premium', 'neutral');
        if (brechaPct < -0.3) {
            brechaPillEl.classList.add('discount');
            brechaPillEl.title = 'CEDEAR con descuento (CCL Implícito menor que el mercado)';
        } else if (brechaPct > 0.3) {
            brechaPillEl.classList.add('premium');
            brechaPillEl.title = 'CEDEAR con sobreprecio / prima (CCL Implícito mayor que el mercado)';
        } else {
            brechaPillEl.classList.add('neutral');
            brechaPillEl.title = 'CCL Implícito alineado con el mercado';
        }
    }

    // Configurar Simulador
    const simUsQtyInput = document.getElementById('sim-us-qty');
    const simCedearQtyInput = document.getElementById('sim-cedear-qty');
    const simTotalArsEl = document.getElementById('sim-total-ars');

    if (simUsQtyInput && simCedearQtyInput && simTotalArsEl) {
        const updateSimulator = (fromField) => {
            const currentRatio = state.currentRatio || 1;
            const currentPriceARS = priceARS || 0;

            if (fromField === 'us') {
                const usQty = parseFloat(simUsQtyInput.value) || 0;
                const cedearQty = Math.round(usQty * currentRatio);
                simCedearQtyInput.value = cedearQty;
                const totalARS = cedearQty * currentPriceARS;
                simTotalArsEl.textContent = `ARS ${totalARS.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            } else {
                const cedearQty = parseFloat(simCedearQtyInput.value) || 0;
                const usQty = parseFloat((cedearQty / currentRatio).toFixed(4)) || 0;
                simUsQtyInput.value = usQty;
                const totalARS = cedearQty * currentPriceARS;
                simTotalArsEl.textContent = `ARS ${totalARS.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
        };

        simUsQtyInput.oninput = () => updateSimulator('us');
        simCedearQtyInput.oninput = () => updateSimulator('cedear');

        simUsQtyInput.value = 1;
        updateSimulator('us');
    }
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
    state.macdDummySeries = null;

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
            borderColor: 'rgba(255, 140, 0, 0.12)',
            rightOffset: 12,
            fixLeftEdge: false,
            fixRightEdge: false
        },
        rightPriceScale: {
            borderColor: 'rgba(255, 140, 0, 0.12)',
            minimumWidth: 80
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
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
                borderColor: 'rgba(255, 140, 0, 0.12)',
                rightOffset: 12,
                fixLeftEdge: false,
                fixRightEdge: false
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 140, 0, 0.12)',
                minimumWidth: 80
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
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
                timeVisible: true,
                rightOffset: 12,
                fixLeftEdge: false,
                fixRightEdge: false
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 140, 0, 0.12)',
                minimumWidth: 80
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
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

        state.macdDummySeries = state.macdChartInstance.addLineSeries({
            visible: false,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false
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
        // Generar las bandas sombreadas cubriendo todo el rango histórico de velas
        const rsiBand70Data = candles.map(c => ({ time: c.time, value: 70 }));
        const rsiBand30Data = candles.map(c => ({ time: c.time, value: 30 }));
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
    if (state.macdDummySeries) state.macdDummySeries.setData(candles.map(c => ({ time: c.time, value: 0 })));
    if (state.macdLineSeries) state.macdLineSeries.setData(macdLineData);
    if (state.macdSignalSeries) state.macdSignalSeries.setData(macdSignalData);
    if (state.macdHistSeries) state.macdHistSeries.setData(macdHistData);

    // Sync Time Scales
    const priceTimeScale = state.chartInstance.timeScale();
    const rsiTimeScale = state.rsiChartInstance ? state.rsiChartInstance.timeScale() : null;
    const macdTimeScale = state.macdChartInstance ? state.macdChartInstance.timeScale() : null;

    const timeScales = [priceTimeScale, rsiTimeScale, macdTimeScale].filter(Boolean);

    if (timeScales.length > 1) {
        let isSyncing = false;
        timeScales.forEach(source => {
            const targets = timeScales.filter(t => t !== source);
            source.subscribeVisibleLogicalRangeChange(range => {
                if (isSyncing || !range) return;
                isSyncing = true;
                targets.forEach(t => {
                    if (t) t.setVisibleLogicalRange(range);
                });
                isSyncing = false;
            });
        });
    }

    // Sync Crosshairs (Free Moving synchronized crosshairs)
    const handleCrosshairMove = (chartType, param) => {
        // Prevent recursive updates from programmatic setCrosshairPosition calls
        if (!param || !param.sourceEvent) return;

        const time = param.time;
        const point = time ? historyPoints.find(p => p.date === time) : null;

        // 1. PRICE CHART
        if (state.chartInstance && chartType !== 'price') {
            if (time && point) {
                state.chartInstance.setCrosshairPosition(point.close, time, state.candleSeries);
            } else {
                state.chartInstance.clearCrosshairPosition();
            }
        }

        // 2. RSI CHART
        if (state.rsiChartInstance && chartType !== 'rsi') {
            if (time && point && point.rsi !== null && point.rsi !== undefined) {
                state.rsiChartInstance.setCrosshairPosition(point.rsi, time, state.rsiSeries);
            } else {
                state.rsiChartInstance.clearCrosshairPosition();
            }
        }

        // 3. MACD CHART
        if (state.macdChartInstance && chartType !== 'macd') {
            if (time && point && point.macd !== null && point.macd !== undefined) {
                state.macdChartInstance.setCrosshairPosition(point.macd, time, state.macdLineSeries);
            } else {
                state.macdChartInstance.clearCrosshairPosition();
            }
        }
    };

    state.chartInstance.subscribeCrosshairMove(param => handleCrosshairMove('price', param));
    if (state.rsiChartInstance) {
        state.rsiChartInstance.subscribeCrosshairMove(param => handleCrosshairMove('rsi', param));
    }
    if (state.macdChartInstance) {
        state.macdChartInstance.subscribeCrosshairMove(param => handleCrosshairMove('macd', param));
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

    flagContainer.classList.remove('flag-pop');
    void flagContainer.offsetWidth;
    flagContainer.classList.add('flag-pop');

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

    const tabTecnico = document.getElementById('tab-btn-tecnico');
    const tabRotacion = document.getElementById('tab-btn-rotacion');
    const tabEMA200 = document.getElementById('tab-btn-ema200');
    const tabEarnings = document.getElementById('tab-btn-earnings');
    
    if (tabTecnico) {
        tabTecnico.addEventListener('click', () => switchTab('tecnico'));
    }
    if (tabRotacion) {
        tabRotacion.addEventListener('click', () => switchTab('rotacion'));
    }
    if (tabEMA200) {
        tabEMA200.addEventListener('click', () => switchTab('ema200'));
    }
    if (tabEarnings) {
        tabEarnings.addEventListener('click', () => switchTab('earnings'));
    }

    initEMA200Controls();
    
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
    
    // Al cambiar de tipo de activo, actualizar si RRG, EMA200 o Earnings están activos
    const assetTabs = document.querySelectorAll('.asset-type-tab');
    assetTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            setTimeout(() => {
                if (state.rrgTab === 'rotacion') {
                    loadRotationGraph();
                } else if (state.rrgTab === 'ema200') {
                    loadEMA200Pullbacks(state.assetType);
                } else if (state.rrgTab === 'earnings') {
                    loadEarningsData();
                }
            }, 50);
        });
    });
}

function switchTab(tabId) {
    state.rrgTab = tabId;
    const btnTecnico = document.getElementById('tab-btn-tecnico');
    const btnRotacion = document.getElementById('tab-btn-rotacion');
    const btnEMA200 = document.getElementById('tab-btn-ema200');
    const btnEarnings = document.getElementById('tab-btn-earnings');
    const btnArbitraje = document.getElementById('tab-btn-arbitraje');
    
    const workspaceTecnico = document.getElementById('chart-workspace');
    const workspaceEmpty = document.getElementById('chart-empty-state');
    const workspaceRotation = document.getElementById('chart-rotation-workspace');
    const workspaceEMA200 = document.getElementById('chart-ema200-workspace');
    const workspaceEarnings = document.getElementById('chart-earnings-workspace');
    const workspaceArbitraje = document.getElementById('chart-arbitraje-workspace');
    
    const controlsRow = document.querySelector('.controls-row');
    const metricsRow = document.querySelector('.asset-metrics');
    const fundamentalsBox = document.getElementById('fundamentals-section');
    const tecnicoHeader = document.getElementById('tecnico-header');
    
    if (tabId === 'tecnico') {
        if (btnTecnico) btnTecnico.classList.add('active');
        if (btnRotacion) btnRotacion.classList.remove('active');
        if (btnEMA200) btnEMA200.classList.remove('active');
        if (btnEarnings) btnEarnings.classList.remove('active');
        if (btnArbitraje) btnArbitraje.classList.remove('active');
        
        if (workspaceRotation) workspaceRotation.style.display = 'none';
        if (workspaceEMA200) workspaceEMA200.style.display = 'none';
        if (workspaceEarnings) workspaceEarnings.style.display = 'none';
        if (workspaceArbitraje) workspaceArbitraje.style.display = 'none';
        
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
    } else if (tabId === 'rotacion') {
        if (btnTecnico) btnTecnico.classList.remove('active');
        if (btnRotacion) btnRotacion.classList.add('active');
        if (btnEMA200) btnEMA200.classList.remove('active');
        if (btnEarnings) btnEarnings.classList.remove('active');
        if (btnArbitraje) btnArbitraje.classList.remove('active');
        
        if (workspaceTecnico) workspaceTecnico.style.display = 'none';
        if (workspaceEmpty) workspaceEmpty.style.display = 'none';
        if (workspaceEMA200) workspaceEMA200.style.display = 'none';
        if (workspaceEarnings) workspaceEarnings.style.display = 'none';
        if (workspaceArbitraje) workspaceArbitraje.style.display = 'none';
        if (fundamentalsBox) fundamentalsBox.style.display = 'none';
        if (controlsRow) controlsRow.style.display = 'none';
        if (metricsRow) metricsRow.style.display = 'none';
        if (tecnicoHeader) tecnicoHeader.style.display = 'none';
        
        if (workspaceRotation) workspaceRotation.style.display = 'flex';
        
        loadRotationGraph();
    } else if (tabId === 'ema200') {
        if (btnTecnico) btnTecnico.classList.remove('active');
        if (btnRotacion) btnRotacion.classList.remove('active');
        if (btnEMA200) btnEMA200.classList.add('active');
        if (btnEarnings) btnEarnings.classList.remove('active');
        if (btnArbitraje) btnArbitraje.classList.remove('active');
        
        if (workspaceTecnico) workspaceTecnico.style.display = 'none';
        if (workspaceEmpty) workspaceEmpty.style.display = 'none';
        if (workspaceRotation) workspaceRotation.style.display = 'none';
        if (workspaceEarnings) workspaceEarnings.style.display = 'none';
        if (workspaceArbitraje) workspaceArbitraje.style.display = 'none';
        if (fundamentalsBox) fundamentalsBox.style.display = 'none';
        if (controlsRow) controlsRow.style.display = 'none';
        if (metricsRow) metricsRow.style.display = 'none';
        if (tecnicoHeader) tecnicoHeader.style.display = 'none';
        
        if (workspaceEMA200) workspaceEMA200.style.display = 'flex';
        
        loadEMA200Pullbacks(state.assetType);
    } else if (tabId === 'earnings') {
        if (btnTecnico) btnTecnico.classList.remove('active');
        if (btnRotacion) btnRotacion.classList.remove('active');
        if (btnEMA200) btnEMA200.classList.remove('active');
        if (btnEarnings) btnEarnings.classList.add('active');
        if (btnArbitraje) btnArbitraje.classList.remove('active');
        
        if (workspaceTecnico) workspaceTecnico.style.display = 'none';
        if (workspaceEmpty) workspaceEmpty.style.display = 'none';
        if (workspaceRotation) workspaceRotation.style.display = 'none';
        if (workspaceEMA200) workspaceEMA200.style.display = 'none';
        if (workspaceArbitraje) workspaceArbitraje.style.display = 'none';
        if (fundamentalsBox) fundamentalsBox.style.display = 'none';
        if (controlsRow) controlsRow.style.display = 'none';
        if (metricsRow) metricsRow.style.display = 'none';
        if (tecnicoHeader) tecnicoHeader.style.display = 'none';
        
        if (workspaceEarnings) workspaceEarnings.style.display = 'flex';
        
        loadEarningsData();
    } else if (tabId === 'arbitraje') {
        if (btnTecnico) btnTecnico.classList.remove('active');
        if (btnRotacion) btnRotacion.classList.remove('active');
        if (btnEMA200) btnEMA200.classList.remove('active');
        if (btnEarnings) btnEarnings.classList.remove('active');
        if (btnArbitraje) btnArbitraje.classList.add('active');
        
        if (workspaceTecnico) workspaceTecnico.style.display = 'none';
        if (workspaceEmpty) workspaceEmpty.style.display = 'none';
        if (workspaceRotation) workspaceRotation.style.display = 'none';
        if (workspaceEMA200) workspaceEMA200.style.display = 'none';
        if (workspaceEarnings) workspaceEarnings.style.display = 'none';
        if (fundamentalsBox) fundamentalsBox.style.display = 'none';
        if (controlsRow) controlsRow.style.display = 'none';
        if (metricsRow) metricsRow.style.display = 'none';
        if (tecnicoHeader) tecnicoHeader.style.display = 'none';
        
        if (workspaceArbitraje) workspaceArbitraje.style.display = 'flex';
        
        if (Object.keys(state.usQuotes).length === 0) {
            loadUsQuotes().then(() => renderArbitrageScanner());
        } else {
            renderArbitrageScanner();
        }
    }
}

async function loadUsQuotes() {
    try {
        const res = await fetch('/api/us-quotes');
        if (res.ok) {
            state.usQuotes = await res.json();
        }
    } catch (e) {
        console.error('Error cargando cotizaciones de EE.UU. desde Yahoo Finance:', e);
    }
}

function renderArbitrageScanner() {
    const tbody = document.getElementById('arbitraje-tbody');
    const marketCclValEl = document.getElementById('arb-market-ccl-val');
    if (!tbody) return;

    // 1. Obtener CCL de mercado Benchmark
    let benchmarkCCL = 0;
    const usdCclQuote = state.stocks.find(s => s.ticker === 'USD_CCL');
    if (usdCclQuote && usdCclQuote.price > 0) {
        benchmarkCCL = usdCclQuote.price;
    }
    if (!benchmarkCCL) {
        const mervalPriceEl = document.getElementById('merval-ccl-price');
        if (mervalPriceEl && mervalPriceEl.textContent) {
            const val = parseFloat(mervalPriceEl.textContent.replace(/[^\d,.-]/g, '').replace(',', '.'));
            if (!isNaN(val)) benchmarkCCL = val;
        }
    }
    if (!benchmarkCCL) benchmarkCCL = 1580;

    if (marketCclValEl) {
        marketCclValEl.textContent = `ARS ${benchmarkCCL.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // 2. Escanear exclusivamente los CEDEARs en ARS de la base de datos local
    const arsCedearsList = state.cedears.filter(c => c.currency === 'ARS');
    if (arsCedearsList.length === 0) {
        tbody.innerHTML = `<tr class="loading-row"><td colspan="7">Cargando datos de CEDEARs en ARS...</td></tr>`;
        return;
    }

    const processedMap = new Map();

    arsCedearsList.forEach(asset => {
        const cleanSym = (asset.ticker || '').toUpperCase().replace('.BA', '').trim();
        const baseTicker = getBaseTicker(cleanSym);
        
        if (processedMap.has(baseTicker)) return;

        const ratioEntry = state.cedearRatios[cleanSym] || state.cedearRatios[baseTicker];
        let ratio = 1;
        let ratioStr = '1:1';

        if (ratioEntry) {
            if (typeof ratioEntry === 'object') {
                ratio = ratioEntry.ratio || 1;
                ratioStr = ratioEntry.ratio_str || `${ratio}:1`;
            } else if (typeof ratioEntry === 'number') {
                ratio = ratioEntry;
                ratioStr = `${ratio}:1`;
            }
        }
        
        let priceARS = asset.price || 0;
        let priceUSDD = 0;

        const usdAsset = state.cedears.find(c => (c.currency === 'USD' || c.ticker === cleanSym + 'D' || c.ticker === baseTicker + 'D') && getBaseTicker(c.ticker) === baseTicker && c.ticker !== cleanSym);
        if (usdAsset && usdAsset.price > 0) priceUSDD = usdAsset.price;

        if (priceARS <= 0) return;

        // Obtener precio en vivo del subyacente en EE.UU. directamente de Yahoo Finance
        let yfPrice = state.usQuotes[cleanSym] || state.usQuotes[baseTicker] || 0;
        let priceUS = 0;

        if (yfPrice > 0) {
            priceUS = yfPrice;
        } else if (priceUSDD > 0 && (priceARS / priceUSDD) > 300) {
            priceUS = priceUSDD * ratio;
        } else {
            priceUS = (priceARS * ratio) / benchmarkCCL;
        }

        // Modelo Cuantitativo MTaurus Sheets:
        // 1. CCL Implícito = (Price_ARS * Ratio) / Price_US
        const implicitCCL = priceUS > 0 ? (priceARS * ratio) / priceUS : benchmarkCCL;

        // 2. Precio Hipotético = (Price_US * CCL_Benchmark) / Ratio
        const priceHipotetico = ratio > 0 ? (priceUS * benchmarkCCL) / ratio : priceARS;

        // 3. Variación % (Desvío Teórico vs Precio ARS Actual) = (Price_Hipotético / Price_ARS) - 1
        const variacionPct = priceARS > 0 ? ((priceHipotetico / priceARS) - 1) * 100 : 0;

        let category = 'neutral';
        if (variacionPct > 0.15) category = 'discount'; // Oportunidad: Precio teórico > Precio actual (CEDEAR barato)
        else if (variacionPct < -0.15) category = 'premium'; // Sobreprecio: Precio teórico < Precio actual (CEDEAR caro)

        processedMap.set(baseTicker, {
            ticker: baseTicker,
            name: asset.name || baseTicker,
            ratio: ratio,
            ratio_str: ratioStr,
            price_ars: priceARS,
            price_us: priceUS,
            implicit_ccl: implicitCCL,
            price_hipotetico: priceHipotetico,
            variacion_pct: variacionPct,
            category: category
        });
    });

    let results = Array.from(processedMap.values());

    // 3. Aplicar Filtro de Categoría
    const currentFilter = state.arbitrajeFilter || 'all';
    if (currentFilter !== 'all') {
        results = results.filter(r => r.category === currentFilter);
    }

    // 4. Aplicar Ordenamiento
    const sortBy = state.arbitrajeSortBy || 'variacion_pct';
    const sortDir = state.arbitrajeSortDirection || 'desc';

    results.sort((a, b) => {
        let valA = a[sortBy];
        let valB = b[sortBy];

        if (typeof valA === 'string') {
            return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return sortDir === 'asc' ? (valA - valB) : (valB - valA);
    });

    // 5. Renderizar Filas
    if (results.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">No se encontraron CEDEARs para el filtro seleccionado.</td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    results.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'arbitraje-row';
        tr.onclick = () => {
            state.assetType = 'cedears';
            selectAsset(item.ticker);
            switchTab('tecnico');
        };

        const sign = item.variacion_pct >= 0 ? '+' : '';
        const pillClass = item.category === 'discount' ? 'discount' : (item.category === 'premium' ? 'premium' : 'neutral');
        const pillLabel = item.category === 'discount' ? '🟢 Oportunidad' : (item.category === 'premium' ? '🔴 Sobreprecio' : '⚪ Alineado');

        tr.innerHTML = `
            <td class="col-ticker">
                <div class="ticker-cell">
                    <img src="${getCompanyLogoSrc(item.ticker)}" class="ticker-logo" onerror="handleLogoError(this, '${item.ticker}')" alt="">
                    <span class="ticker-logo-fallback" style="display:none;">${item.ticker.slice(0, 2)}</span>
                    <strong class="ticker-code">${item.ticker}</strong>
                </div>
            </td>
            <td><strong style="color: var(--accent-primary);">${item.ratio_str}</strong></td>
            <td>USD ${item.price_us > 0 ? item.price_us.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'}</td>
            <td><strong style="color: #ffffff;">ARS ${item.implicit_ccl.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
            <td><strong>$ ${item.price_ars.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
            <td><strong style="color: var(--accent-primary-light);">$ ${item.price_hipotetico.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
            <td>
                <span class="brecha-pill ${pillClass}">
                    ${sign}${item.variacion_pct.toFixed(2)}% (${pillLabel})
                </span>
            </td>
        `;
        fragment.appendChild(tr);
    });

    tbody.innerHTML = '';
    tbody.appendChild(fragment);

    initArbitrageTableEvents();
}

function initArbitrageTableEvents() {
    const filterTabs = document.querySelectorAll('.arbitraje-tab');
    filterTabs.forEach(tab => {
        tab.onclick = (e) => {
            filterTabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            state.arbitrajeFilter = e.target.dataset.filter;
            renderArbitrageScanner();
        };
    });

    const headers = document.querySelectorAll('.arbitraje-table th');
    headers.forEach(th => {
        th.onclick = () => {
            const sortKey = th.dataset.sort;
            if (!sortKey) return;

            if (state.arbitrajeSortBy === sortKey) {
                state.arbitrajeSortDirection = state.arbitrajeSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                state.arbitrajeSortBy = sortKey;
                state.arbitrajeSortDirection = 'asc';
            }

            headers.forEach(h => {
                h.classList.remove('sorted');
                const icon = h.querySelector('.sort-icon');
                if (icon) icon.textContent = '';
            });

            th.classList.add('sorted');
            const icon = th.querySelector('.sort-icon');
            if (icon) {
                icon.textContent = state.arbitrajeSortDirection === 'asc' ? '▲' : '▼';
            }

            renderArbitrageScanner();
        };
    });
}

window.switchTab = switchTab;

async function loadEMA200Pullbacks(panel) {
    const currentPanel = panel || state.assetType || 'acciones';
    state.ema200Panel = currentPanel;
    
    const tbody = document.getElementById('ema200-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = `
        <tr class="loading-row">
            <td colspan="5">Calculando activos cerca de la EMA200...</td>
        </tr>
    `;
    
    try {
        const res = await fetch(`/api/ema200-pullbacks?panel=${state.ema200Panel}`);
        if (!res.ok) {
            tbody.innerHTML = `
                <tr class="loading-row">
                    <td colspan="5" style="color: var(--accent-red)">Error al obtener datos de la EMA200</td>
                </tr>
            `;
            return;
        }
        
        const data = await res.json();
        if (!data || data.length === 0) {
            tbody.innerHTML = `
                <tr class="loading-row">
                    <td colspan="5">No se encontraron activos cerca de la EMA200.</td>
                </tr>
            `;
            return;
        }
        
        state.ema200RawData = data;
        renderEMA200Table();
    } catch (e) {
        console.error('Error cargando pullbacks EMA200:', e);
        tbody.innerHTML = `
            <tr class="loading-row">
                <td colspan="5" style="color: var(--accent-red)">Error de conexión al cargar EMA200</td>
            </tr>
        `;
    }
}

function parseLastVisitDays(str) {
    if (!str) return 9999;
    const match = str.match(/hace (\d+)/);
    const num = match ? parseInt(match[1]) : 1;
    if (str.includes('día')) return num;
    if (str.includes('semana')) return num * 7;
    if (str.includes('mes')) return num * 30.4;
    if (str.includes('año')) return num * 365;
    return 999;
}

function renderEMA200Table(data) {
    if (data) {
        state.ema200RawData = data;
    }
    
    const tbody = document.getElementById('ema200-tbody');
    if (!tbody) return;
    
    let list = state.ema200RawData ? [...state.ema200RawData] : [];
    if (list.length === 0) {
        tbody.innerHTML = `
            <tr class="loading-row">
                <td colspan="5">No hay datos disponibles para mostrar.</td>
            </tr>
        `;
        return;
    }
    
    // 1. Filtrar por Frecuencia
    const freqFilter = state.ema200FreqFilter || 'all';
    if (freqFilter !== 'all') {
        list = list.filter(item => item.freq_cat === freqFilter);
    }
    
    if (list.length === 0) {
        tbody.innerHTML = `
            <tr class="loading-row">
                <td colspan="5">No hay activos con frecuencia "${freqFilter}".</td>
            </tr>
        `;
        return;
    }
    
    // 2. Ordenar por Columna activa
    const sortBy = state.ema200SortBy || 'dist_atrs';
    const sortDir = state.ema200SortDirection || 'asc';
    const mult = sortDir === 'asc' ? 1 : -1;
    
    list.sort((a, b) => {
        if (sortBy === 'ticker') {
            return mult * a.ticker.localeCompare(b.ticker);
        } else if (sortBy === 'last_visit') {
            return mult * (parseLastVisitDays(a.last_visit) - parseLastVisitDays(b.last_visit));
        } else if (sortBy === 'dist_atrs') {
            return mult * (a.dist_atrs - b.dist_atrs);
        } else if (sortBy === 'freq_cat') {
            const freqRank = { 'rara': 1, 'ocasional': 2, 'habitual': 3 };
            return mult * ((freqRank[a.freq_cat] || 0) - (freqRank[b.freq_cat] || 0));
        } else if (sortBy === 'rs_now') {
            return mult * ((a.rs_now || 0) - (b.rs_now || 0));
        }
        return 0;
    });
    
    // 3. Actualizar Encabezados de Tabla (Iconos de Ordenamiento)
    const headers = document.querySelectorAll('.ema200-table th[data-sort]');
    headers.forEach(th => {
        const key = th.getAttribute('data-sort');
        const iconSpan = th.querySelector('.sort-icon');
        if (key === sortBy) {
            th.classList.add('sorted');
            if (iconSpan) iconSpan.textContent = sortDir === 'asc' ? '▲' : '▼';
        } else {
            th.classList.remove('sorted');
            if (iconSpan) iconSpan.textContent = '';
        }
    });
    
    // 4. Renderizar Filas
    let html = '';
    list.forEach(item => {
        const freqClass = item.freq_cat === 'rara' ? 'freq-rara' : (item.freq_cat === 'ocasional' ? 'freq-ocasional' : 'freq-habitual');
        
        html += `
            <tr class="ema200-row" data-ticker="${item.ticker}">
                <td class="col-ticker">
                    <div class="ticker-badge-cell">
                        <div class="ticker-cell">
                            <img src="${getCompanyLogoSrc(item.ticker)}" 
                                 class="ticker-logo" 
                                 alt="${item.ticker}" 
                                 onerror="handleLogoError(this, '${item.ticker}')" />
                            <span class="ticker-logo-fallback" style="display:none;">${item.ticker.charAt(0)}</span>
                            <span class="ticker-box">${item.ticker}</span>
                        </div>
                        <span class="ticker-subicon">🏗️ ${item.sector || ''}</span>
                    </div>
                </td>
                <td class="col-last">
                    <div class="last-visit-cell">
                        ${item.last_visit}
                    </div>
                </td>
                <td class="col-dist">
                    <div class="dist-cell">
                        <span>${item.dist_str}</span>
                    </div>
                </td>
                <td class="col-freq">
                    <span class="freq-pill ${freqClass}">${item.freq_label}</span>
                </td>
                <td class="col-rs">
                    <div class="rs-cell">
                        ${item.rs_str}
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    // Bind click handlers a filas para abrir gráfico técnico
    const rows = tbody.querySelectorAll('.ema200-row');
    rows.forEach(row => {
        row.addEventListener('click', () => {
            const ticker = row.getAttribute('data-ticker');
            if (ticker) {
                let matchedAsset = state.stocks.find(s => s.ticker === ticker) || state.cedears.find(s => s.ticker === ticker);
                if (!matchedAsset && ticker.endsWith('D')) {
                    const baseTkr = ticker.slice(0, -1);
                    matchedAsset = state.stocks.find(s => s.ticker === baseTkr) || state.cedears.find(s => s.ticker === baseTkr);
                }
                const targetTicker = matchedAsset ? matchedAsset.ticker : ticker;
                selectAsset(targetTicker);
            }
        });
    });
}

function initEMA200Controls() {
    state.ema200FreqFilter = 'all';
    state.ema200SortBy = 'dist_atrs';
    state.ema200SortDirection = 'asc';
    
    // Listeners para filtros de frecuencia
    const freqTabs = document.querySelectorAll('#ema200-freq-filter-tabs .ema200-freq-tab');
    freqTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            freqTabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            state.ema200FreqFilter = e.target.getAttribute('data-freq') || 'all';
            renderEMA200Table();
        });
    });
    
    // Listeners para ordenamiento por columnas
    const ths = document.querySelectorAll('.ema200-table th[data-sort]');
    ths.forEach(th => {
        th.addEventListener('click', () => {
            const sortKey = th.getAttribute('data-sort');
            if (state.ema200SortBy === sortKey) {
                state.ema200SortDirection = state.ema200SortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                state.ema200SortBy = sortKey;
                state.ema200SortDirection = (sortKey === 'rs_now' || sortKey === 'freq_cat') ? 'desc' : 'asc';
            }
            renderEMA200Table();
        });
    });
}

window.loadEMA200Pullbacks = loadEMA200Pullbacks;
window.renderEMA200Table = renderEMA200Table;

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
    
    const minValX = minX - padX;
    const maxValX = maxX + padX;
    const minValY = minY - padY;
    const maxValY = maxY + padY;
    
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

/* ═══════════════════════════════════════
   EARNINGS CALENDAR LOGIC & RENDERING
   ═══════════════════════════════════════ */
state.earningsMode = 'week';
state.earningsCurrentDate = new Date();
state.lastEarningsData = null;

function setEarningsMode(mode) {
    state.earningsMode = mode;
    const btnWeek = document.getElementById('earnings-mode-week');
    const btnMonth = document.getElementById('earnings-mode-month');
    const gridWeek = document.getElementById('earnings-weekly-grid');
    const gridMonth = document.getElementById('earnings-monthly-grid');
    
    if (btnWeek) btnWeek.classList.toggle('active', mode === 'week');
    if (btnMonth) btnMonth.classList.toggle('active', mode === 'month');
    if (gridWeek) gridWeek.style.display = mode === 'week' ? 'grid' : 'none';
    if (gridMonth) gridMonth.style.display = mode === 'month' ? 'grid' : 'none';
    
    loadEarningsData();
}
window.setEarningsMode = setEarningsMode;

function navigateEarnings(direction) {
    if (!state.earningsCurrentDate) state.earningsCurrentDate = new Date();
    if (state.earningsMode === 'week') {
        state.earningsCurrentDate.setDate(state.earningsCurrentDate.getDate() + (direction * 7));
    } else {
        state.earningsCurrentDate.setMonth(state.earningsCurrentDate.getMonth() + direction);
    }
    loadEarningsData();
}
window.navigateEarnings = navigateEarnings;

function resetEarningsDate() {
    state.earningsCurrentDate = new Date();
    loadEarningsData();
}
window.resetEarningsDate = resetEarningsDate;

let statePickerYear = new Date().getFullYear();
let statePickerMonth = new Date().getMonth();

function openMonthPickerModal() {
    const modal = document.getElementById('earnings-picker-modal');
    if (!modal) return;
    
    if (state.earningsCurrentDate) {
        statePickerYear = state.earningsCurrentDate.getFullYear();
        statePickerMonth = state.earningsCurrentDate.getMonth();
    } else {
        const now = new Date();
        statePickerYear = now.getFullYear();
        statePickerMonth = now.getMonth();
    }
    
    renderPickerContent();
    modal.style.display = 'flex';
}
window.openMonthPickerModal = openMonthPickerModal;

function closeMonthPickerModal() {
    const modal = document.getElementById('earnings-picker-modal');
    if (modal) modal.style.display = 'none';
}
window.closeMonthPickerModal = closeMonthPickerModal;

function changePickerYear(delta) {
    statePickerYear += delta;
    renderPickerContent();
}
window.changePickerYear = changePickerYear;

function renderPickerContent() {
    const titleEl = document.getElementById('picker-title');
    const yearDisplay = document.getElementById('picker-year-display');
    const monthTabsEl = document.getElementById('picker-month-tabs');
    const contentArea = document.getElementById('picker-content-area');
    
    if (yearDisplay) yearDisplay.innerText = statePickerYear;
    if (!contentArea) return;
    
    if (state.earningsMode === 'month') {
        // MODO MENSUAL: Seleccionar Mes
        if (titleEl) titleEl.innerText = "Seleccionar Mes";
        if (monthTabsEl) monthTabsEl.style.display = "none";
        
        contentArea.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'picker-months-grid';
        
        const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        const selectedMonth = state.earningsCurrentDate ? state.earningsCurrentDate.getMonth() : new Date().getMonth();
        const selectedYear = state.earningsCurrentDate ? state.earningsCurrentDate.getFullYear() : new Date().getFullYear();
        
        months.forEach((mName, idx) => {
            const btn = document.createElement('button');
            btn.className = `picker-month-btn ${idx === selectedMonth && statePickerYear === selectedYear ? 'selected' : ''}`;
            btn.innerText = mName;
            btn.onclick = () => selectPickerMonth(idx);
            grid.appendChild(btn);
        });
        
        contentArea.appendChild(grid);
    } else {
        // MODO SEMANAL: Seleccionar Semana por Mes
        if (titleEl) titleEl.innerText = "Seleccionar Semana";
        if (monthTabsEl) {
            monthTabsEl.style.display = "grid";
            monthTabsEl.innerHTML = '';
            const shortMonths = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
            shortMonths.forEach((mName, idx) => {
                const tab = document.createElement('button');
                tab.className = `picker-month-tab ${idx === statePickerMonth ? 'active' : ''}`;
                tab.innerText = mName;
                tab.onclick = () => {
                    statePickerMonth = idx;
                    renderPickerContent();
                };
                monthTabsEl.appendChild(tab);
            });
        }
        
        contentArea.innerHTML = '';
        const weeksList = document.createElement('div');
        weeksList.className = 'picker-weeks-list';
        
        const monthsStr = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        const weeks = getWeeksForMonth(statePickerYear, statePickerMonth);
        
        const curDate = state.earningsCurrentDate || new Date();
        const curDateStr = curDate.toISOString().split('T')[0];
        
        weeks.forEach((w, idx) => {
            const card = document.createElement('div');
            const monStr = w.monday.toISOString().split('T')[0];
            const friStr = w.friday.toISOString().split('T')[0];
            
            const isSel = curDateStr >= monStr && curDateStr <= friStr;
            card.className = `picker-week-card ${isSel ? 'selected' : ''}`;
            
            card.innerHTML = `
                <div class="picker-week-info">
                    <span class="picker-week-num">Semana ${idx + 1} de ${monthsStr[statePickerMonth]}</span>
                    <span class="picker-week-dates">${w.monday.getDate()} ${monthsStr[w.monday.getMonth()]} - ${w.friday.getDate()} ${monthsStr[w.friday.getMonth()]} ${w.friday.getFullYear()}</span>
                </div>
                <span style="font-size:16px; color:#eab308;">›</span>
            `;
            
            card.onclick = () => selectPickerWeek(w.monday);
            weeksList.appendChild(card);
        });
        
        contentArea.appendChild(weeksList);
    }
}

function getWeeksForMonth(year, monthIndex) {
    const weeks = [];
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    
    let currentMonday = new Date(firstDay);
    const dayOfWeek = currentMonday.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    currentMonday.setDate(currentMonday.getDate() + diffToMonday);
    
    while (currentMonday <= lastDay) {
        const friday = new Date(currentMonday);
        friday.setDate(friday.getDate() + 4);
        
        weeks.push({
            monday: new Date(currentMonday),
            friday: friday
        });
        
        currentMonday.setDate(currentMonday.getDate() + 7);
    }
    
    return weeks;
}

function selectPickerMonth(monthIndex) {
    state.earningsCurrentDate = new Date(statePickerYear, monthIndex, 1);
    closeMonthPickerModal();
    loadEarningsData();
}
window.selectPickerMonth = selectPickerMonth;

function selectPickerWeek(mondayDate) {
    state.earningsCurrentDate = new Date(mondayDate);
    closeMonthPickerModal();
    loadEarningsData();
}
window.selectPickerWeek = selectPickerWeek;

async function loadEarningsData() {
    const rangeText = document.getElementById('earnings-date-range-text');
    if (!state.earningsCurrentDate) state.earningsCurrentDate = new Date();
    const d = state.earningsCurrentDate;
    const currentPanel = state.assetType || 'cedears';
    
    if (state.earningsMode === 'week') {
        const dateStr = d.toISOString().split('T')[0];
        if (rangeText) rangeText.innerText = "Cargando...";
        try {
            const res = await fetch(`/api/earnings/week?date=${dateStr}&panel=${currentPanel}`);
            if (!res.ok) throw new Error("Error HTTP");
            const data = await res.json();
            state.lastEarningsData = data;
            renderWeeklyEarnings(data);
        } catch (e) {
            console.error("Error cargando earnings semanales:", e);
            if (rangeText) rangeText.innerText = "Error cargando datos";
        }
    } else {
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        if (rangeText) rangeText.innerHTML = `${monthNames[d.getMonth()]} ${year} <span style="font-size:10px; opacity:0.8; margin-left:4px;">▾</span>`;
        try {
            const res = await fetch(`/api/earnings/month?year=${year}&month=${month}&panel=${currentPanel}`);
            if (!res.ok) throw new Error("Error HTTP");
            const data = await res.json();
            state.lastEarningsData = data;
            renderMonthlyEarnings(data);
        } catch (e) {
            console.error("Error cargando earnings mensuales:", e);
            if (rangeText) rangeText.innerText = "Error cargando datos";
        }
    }
}

function renderWeeklyEarnings(data) {
    const rangeText = document.getElementById('earnings-date-range-text');
    if (rangeText && data.startDate && data.endDate) {
        const s = new Date(data.startDate + "T00:00:00");
        const e = new Date(data.endDate + "T00:00:00");
        const monthsStr = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        rangeText.innerHTML = `${s.getDate()} ${monthsStr[s.getMonth()]} - ${e.getDate()} ${monthsStr[e.getMonth()]} <span style="font-size:10px; opacity:0.8; margin-left:4px;">▾</span>`;
    }
    
    const grid = document.getElementById('earnings-weekly-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const dayNames = ["LUN", "MAR", "MIÉ", "JUE", "VIE"];
    
    (data.days || []).forEach((day) => {
        const dObj = new Date(day.date + "T00:00:00");
        const dayHeaderStr = `${dayNames[dObj.getDay() - 1] || 'DÍA'} ${dObj.getDate()} ${["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][dObj.getMonth()]}`;
        
        const dayCard = document.createElement('div');
        dayCard.className = 'earnings-day-card';
        
        const todayStr = new Date().toISOString().split('T')[0];
        const isPastOrToday = day.date <= todayStr;
        const otherTitle = isPastOrToday ? '📋 Balances Publicados' : '🕒 Horario por Confirmar';
        
        const totalCount = day.total_count || 0;
        
        const boList = day.before_open || [];
        const topBo = boList.slice(0, 6);
        const remainingBo = boList.length - 6;
        
        let beforeOpenHtml = '';
        if (boList.length > 0) {
            beforeOpenHtml = `
                <div class="earnings-timing-section">
                    <div class="timing-section-title before-open">☀️ Before Open</div>
                    <div class="company-tiles-grid">
                        ${topBo.map(comp => renderCompanyTile(comp, isPastOrToday)).join('')}
                    </div>
                    ${remainingBo > 0 ? `<button class="see-more-btn" onclick="event.stopPropagation(); openEarningsModalForDay('${day.date}')">+ ${remainingBo} más (Ver todas)</button>` : ''}
                </div>
            `;
        }
        
        const acList = day.after_close || [];
        const topAc = acList.slice(0, 6);
        const remainingAc = acList.length - 6;
        
        let afterCloseHtml = '';
        if (acList.length > 0) {
            afterCloseHtml = `
                <div class="earnings-timing-section">
                    <div class="timing-section-title after-close">🌙 After Close</div>
                    <div class="company-tiles-grid">
                        ${topAc.map(comp => renderCompanyTile(comp, isPastOrToday)).join('')}
                    </div>
                    ${remainingAc > 0 ? `<button class="see-more-btn" onclick="event.stopPropagation(); openEarningsModalForDay('${day.date}')">+ ${remainingAc} más (Ver todas)</button>` : ''}
                </div>
            `;
        }
        
        const otList = day.other || [];
        const topOt = otList.slice(0, 6);
        const remainingOt = otList.length - 6;
        
        let otherHtml = '';
        if (otList.length > 0) {
            otherHtml = `
                <div class="earnings-timing-section">
                    <div class="timing-section-title" style="color: #60a5fa;">${otherTitle}</div>
                    <div class="company-tiles-grid">
                        ${topOt.map(comp => renderCompanyTile(comp, isPastOrToday)).join('')}
                    </div>
                    ${remainingOt > 0 ? `<button class="see-more-btn" onclick="event.stopPropagation(); openEarningsModalForDay('${day.date}')">+ ${remainingOt} más (Ver todas)</button>` : ''}
                </div>
            `;
        }
        
        let contentHtml = '';
        const sections = [beforeOpenHtml, afterCloseHtml, otherHtml].filter(Boolean);
        if (sections.length > 0) {
            contentHtml = sections.join('<div class="timing-divider"></div>');
        } else {
            contentHtml = `<div style="text-align:center; padding:30px 10px; color:var(--text-muted); font-size:12px;">Sin presentaciones reportadas</div>`;
        }
        
        dayCard.innerHTML = `
            <div class="earnings-day-header" style="cursor: pointer;" onclick="openEarningsModalForDay('${day.date}')" title="Ver todas las empresas del día">
                <span>${dayHeaderStr}</span>
                <span class="count-pill">${totalCount}</span>
            </div>
            <div class="earnings-day-content">
                ${contentHtml}
            </div>
        `;
        grid.appendChild(dayCard);
    });
}

function renderCompanyTile(comp, isPastOrToday = false) {
    const sym = comp.symbol;
    const hasReported = isPastOrToday && comp.eps && comp.eps.trim() !== '' && comp.eps.trim() !== 'N/A';
    const epsDisplay = hasReported ? `Real: ${comp.eps}` : (comp.epsForecast ? `Est: ${comp.epsForecast}` : '');
    const primaryLogo = getCompanyLogoSrc(sym);
    const fallbackLogo = `https://financialmodelingprep.com/image-stock/${sym}.png`;
    
    return `
        <div class="company-tile" title="${comp.name || sym}" onclick="openCompanyEarningsCardBySymbol('${sym}')">
            <img src="${primaryLogo}" class="company-tile-logo" onerror="if(this.src !== '${fallbackLogo}'){this.src='${fallbackLogo}';}else{this.style.display='none';this.nextElementSibling.style.display='flex';}" alt="${sym}">
            <div class="company-tile-fallback" style="display:none;">${sym.slice(0, 3)}</div>
            <span class="company-tile-symbol">${sym}</span>
            ${epsDisplay ? `<span class="company-tile-eps" style="${hasReported ? 'color: #38bdf8;' : ''}">${epsDisplay}</span>` : ''}
        </div>
    `;
}

function showEarningsToast(message) {
    let existing = document.getElementById('earnings-toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.id = 'earnings-toast';
    toast.className = 'earnings-toast';
    toast.innerHTML = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast) toast.remove();
    }, 4000);
}
window.showEarningsToast = showEarningsToast;

function selectAssetFromEarnings(symbol) {
    if (!symbol) return;
    const cleanSym = symbol.toUpperCase().trim();
    
    // Buscar coincidencia en CEDEARs o Acciones Locales
    let matchedAsset = state.cedears.find(s => s.ticker === cleanSym) || state.stocks.find(s => s.ticker === cleanSym);
    
    if (!matchedAsset) {
        matchedAsset = state.cedears.find(s => s.ticker.replace('.BA', '') === cleanSym) ||
                       state.stocks.find(s => s.ticker.replace('.BA', '') === cleanSym);
    }
    
    if (!matchedAsset) {
        showEarningsToast(`⚠️ El activo <strong>${cleanSym}</strong> no cotiza actualmente como CEDEAR ni Acción Local en la plataforma.`);
        return;
    }
    
    closeEarningsModal();
    closeCompanyEarningsModal();
    switchTab('tecnico');
    selectAsset(matchedAsset.ticker);
}
window.selectAssetFromEarnings = selectAssetFromEarnings;

function renderMonthlyMiniLogo(comp) {
    const sym = comp.symbol;
    const primaryLogo = getCompanyLogoSrc(sym);
    const fallbackLogo = `https://financialmodelingprep.com/image-stock/${sym}.png`;
    return `
        <div class="monthly-mini-tile" title="${comp.name || sym} (${sym})">
            <img src="${primaryLogo}" class="monthly-mini-logo" onerror="if(this.src !== '${fallbackLogo}'){this.src='${fallbackLogo}';}else{this.style.display='none';this.nextElementSibling.style.display='flex';}" alt="${sym}">
            <div class="monthly-mini-fallback" style="display:none;">${sym.slice(0, 2)}</div>
        </div>
    `;
}

function parseMarketCapNum(mcStr) {
    if (!mcStr || typeof mcStr !== 'string') return 0;
    const s = mcStr.toUpperCase().replace(/\$/g, '').replace(/,/g, '').trim();
    try {
        if (s.endsWith('T')) return parseFloat(s.slice(0, -1)) * 1_000_000_000_000;
        if (s.endsWith('B')) return parseFloat(s.slice(0, -1)) * 1_000_000_000;
        if (s.endsWith('M')) return parseFloat(s.slice(0, -1)) * 1_000_000;
        if (s.endsWith('K')) return parseFloat(s.slice(0, -1)) * 1_000;
        return parseFloat(s) || 0;
    } catch (e) {
        return 0;
    }
}

function renderMonthlyEarnings(data) {
    const grid = document.getElementById('earnings-monthly-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const headers = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    headers.forEach(h => {
        const hCell = document.createElement('div');
        hCell.className = 'monthly-day-header-cell';
        hCell.innerText = h;
        grid.appendChild(hCell);
    });
    
    const year = data.year;
    const month = data.month;
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    
    const dayMap = {};
    (data.days || []).forEach(d => {
        dayMap[d.dayNum] = d;
    });
    
    for (let i = 0; i < startDayOfWeek; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'monthly-day-cell other-month';
        grid.appendChild(emptyCell);
    }
    
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && (today.getMonth() + 1) === month;
    
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
        const cell = document.createElement('div');
        cell.className = 'monthly-day-cell';
        if (isCurrentMonth && today.getDate() === dayNum) {
            cell.classList.add('today');
        }
        
        const dayData = dayMap[dayNum] || { before_open: [], after_close: [], other: [] };
        const allComps = [...(dayData.before_open || []), ...(dayData.after_close || []), ...(dayData.other || [])];
        allComps.sort((a, b) => parseMarketCapNum(b.marketCap) - parseMarketCapNum(a.marketCap));
        
        const maxLogos = 5;
        const topComps = allComps.slice(0, maxLogos);
        const remainingCount = allComps.length - maxLogos;
        
        let logosHtml = '';
        if (allComps.length > 0) {
            logosHtml = `
                <div class="monthly-logos-container">
                    ${topComps.map(comp => renderMonthlyMiniLogo(comp)).join('')}
                    ${remainingCount > 0 ? `<span class="monthly-more-badge">+${remainingCount}</span>` : ''}
                </div>
            `;
        }
        
        cell.innerHTML = `
            <div class="monthly-day-header-row">
                <span class="monthly-day-number">${dayNum}</span>
                ${allComps.length > 0 ? `<span class="monthly-day-count">${allComps.length}</span>` : ''}
            </div>
            ${logosHtml}
        `;
        
        const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        cell.onclick = () => {
            if (allComps.length > 0) {
                openEarningsModalForDay(dayStr);
            } else {
                state.earningsCurrentDate = new Date(year, month - 1, dayNum);
                setEarningsMode('week');
            }
        };
        
        grid.appendChild(cell);
    }
}

function openEarningsModalForDay(dateStr) {
    if (!state.lastEarningsData || !state.lastEarningsData.days) return;
    const dayObj = state.lastEarningsData.days.find(d => d.date === dateStr);
    if (!dayObj) return;
    
    const modal = document.getElementById('earnings-day-modal');
    const titleEl = document.getElementById('earnings-modal-date-title');
    const subEl = document.getElementById('earnings-modal-subtitle');
    const bodyEl = document.getElementById('earnings-modal-body');
    
    if (!modal || !bodyEl) return;
    
    const d = new Date(dateStr + "T00:00:00");
    const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    
    if (titleEl) titleEl.innerText = `Earnings del ${dayNames[d.getDay()]} ${d.getDate()} de ${monthNames[d.getMonth()]}`;
    if (subEl) subEl.innerText = `${dayObj.total_count || 0} presentaciones de reportes trimestrales`;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const isPastOrToday = dayObj.date <= todayStr;
    const otherTitle = isPastOrToday ? '📋 Balances Publicados' : '🕒 Horario por Confirmar';
    
    let html = '';
    
    if (dayObj.before_open && dayObj.before_open.length > 0) {
        html += `
            <div class="timing-section-title before-open" style="font-size:14px; margin-top:4px;">☀️ Before Open (${dayObj.before_open.length})</div>
            ${dayObj.before_open.map(comp => renderModalRow(comp, isPastOrToday)).join('')}
        `;
    }
    
    if (dayObj.after_close && dayObj.after_close.length > 0) {
        if (html) html += `<div class="timing-divider" style="margin: 12px 0;"></div>`;
        html += `
            <div class="timing-section-title after-close" style="font-size:14px;">🌙 After Close (${dayObj.after_close.length})</div>
            ${dayObj.after_close.map(comp => renderModalRow(comp, isPastOrToday)).join('')}
        `;
    }

    if (dayObj.other && dayObj.other.length > 0) {
        if (html) html += `<div class="timing-divider" style="margin: 12px 0;"></div>`;
        html += `
            <div class="timing-section-title" style="font-size:14px; color: #60a5fa;">${otherTitle} (${dayObj.other.length})</div>
            ${dayObj.other.map(comp => renderModalRow(comp, isPastOrToday)).join('')}
        `;
    }
    
    if (!html) {
        html = `<div style="text-align:center; padding:40px; color:var(--text-muted);">No hay empresas reportadas para esta fecha.</div>`;
    }
    
    bodyEl.innerHTML = html;
    modal.style.display = 'flex';
}
window.openEarningsModalForDay = openEarningsModalForDay;

function renderModalRow(comp, isPastOrToday = false) {
    const sym = comp.symbol;
    const name = comp.name || sym;
    const hasReported = isPastOrToday && comp.eps && comp.eps.trim() !== '' && comp.eps.trim() !== 'N/A';
    const epsDisplay = hasReported ? `Real: ${comp.eps}` : (comp.epsForecast ? `Est. EPS: ${comp.epsForecast}` : '');
    const cap = comp.marketCap ? `Cap: ${comp.marketCap}` : '';
    const primaryLogo = getCompanyLogoSrc(sym);
    const fallbackLogo = `https://financialmodelingprep.com/image-stock/${sym}.png`;
    
    return `
        <div class="modal-company-row" onclick="openCompanyEarningsCardBySymbol('${sym}')">
            <div class="modal-company-left">
                <img src="${primaryLogo}" class="company-tile-logo" onerror="if(this.src !== '${fallbackLogo}'){this.src='${fallbackLogo}';}else{this.style.display='none';this.nextElementSibling.style.display='flex';}" alt="${sym}">
                <div class="company-tile-fallback" style="display:none; width:36px; height:36px;">${sym.slice(0, 3)}</div>
                <div class="modal-company-info">
                    <span class="modal-company-symbol">${sym}</span>
                    <span class="modal-company-name">${name}</span>
                </div>
            </div>
            <div class="modal-company-right">
                ${cap ? `<span class="modal-company-eps">${cap}</span>` : ''}
                ${epsDisplay ? `<span class="modal-company-eps" style="${hasReported ? 'color: #38bdf8;' : ''}">${epsDisplay}</span>` : ''}
            </div>
        </div>
    `;
}

function closeEarningsModal() {
    const modal = document.getElementById('earnings-day-modal');
    if (modal) modal.style.display = 'none';
}
window.closeEarningsModal = closeEarningsModal;

function openCompanyEarningsCardBySymbol(symbol) {
    let targetComp = null;
    if (state.lastEarningsData && state.lastEarningsData.days) {
        for (const day of state.lastEarningsData.days) {
            const allComps = [...(day.before_open || []), ...(day.after_close || []), ...(day.other || [])];
            const found = allComps.find(c => c.symbol.toUpperCase() === symbol.toUpperCase());
            if (found) {
                targetComp = { ...found, date: day.date };
                break;
            }
        }
    }
    
    if (!targetComp) {
        targetComp = { symbol: symbol, name: symbol };
    }
    
    showCompanyEarningsCard(targetComp);
}
window.openCompanyEarningsCardBySymbol = openCompanyEarningsCardBySymbol;

function showCompanyEarningsCard(comp) {
    const modal = document.getElementById('company-earnings-modal');
    if (!modal) return;
    
    const sym = comp.symbol || '---';
    const name = comp.name || sym;
    const logoImg = document.getElementById('cec-logo');
    const fallbackDiv = document.getElementById('cec-fallback');
    const symbolEl = document.getElementById('cec-symbol');
    const nameEl = document.getElementById('cec-name');
    const badgeEl = document.getElementById('cec-timing-badge');
    
    const metricLabelEl = document.getElementById('cec-metric-label');
    const metricPrimaryEl = document.getElementById('cec-eps-primary');
    const statusBadgeEl = document.getElementById('cec-status-badge');
    
    const mini1LabelEl = document.getElementById('cec-mini1-label');
    const mini1ValEl = document.getElementById('cec-mini1-val');
    const mini2LabelEl = document.getElementById('cec-mini2-label');
    const mini2ValEl = document.getElementById('cec-mini2-val');
    
    const marketCapEl = document.getElementById('cec-market-cap');
    const quarterEl = document.getElementById('cec-quarter');
    const chartBtn = document.getElementById('cec-btn-chart');
    
    const primaryLogo = getCompanyLogoSrc(sym);
    const fallbackLogo = `https://financialmodelingprep.com/image-stock/${sym}.png`;
    
    if (logoImg) {
        logoImg.style.display = 'block';
        if (fallbackDiv) fallbackDiv.style.display = 'none';
        logoImg.src = primaryLogo;
        logoImg.onerror = function() {
            if (this.src !== fallbackLogo) {
                this.src = fallbackLogo;
            } else {
                this.style.display = 'none';
                if (fallbackDiv) {
                    fallbackDiv.innerText = sym.slice(0, 3);
                    fallbackDiv.style.display = 'flex';
                }
            }
        };
    }
    
    if (symbolEl) symbolEl.innerText = sym;
    if (nameEl) nameEl.innerText = name;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const isPastOrToday = comp.date ? (comp.date <= todayStr) : true;
    
    if (badgeEl) {
        const tStr = (comp.timing || comp.time || '').toLowerCase();
        if (tStr.includes('after') || tStr.includes('post') || tStr === 'after-close') {
            badgeEl.className = 'timing-badge after-close';
            badgeEl.innerText = '🌙 After Close (Post-Mercado)';
        } else if (tStr.includes('pre') || tStr.includes('before') || tStr === 'before-open') {
            badgeEl.className = 'timing-badge before-open';
            badgeEl.innerText = '☀️ Before Open (Pre-Mercado)';
        } else {
            badgeEl.className = 'timing-badge';
            badgeEl.innerText = isPastOrToday ? '📋 Horario Confirmado / Reportado' : '🕒 Horario por Confirmar';
        }
    }
    
    const hasReported = isPastOrToday && comp.eps && comp.eps.trim() !== '' && comp.eps.trim() !== 'N/A';
    const forecastVal = comp.epsForecast ? comp.epsForecast.trim() : 'N/D';
    const lastVal = comp.lastYearEPS ? comp.lastYearEPS.trim() : 'N/D';
    
    if (hasReported) {
        // MODO POST-PUBLICACIÓN (RESULTADO REAL)
        if (metricLabelEl) metricLabelEl.innerText = '📊 Resultado Real Publicado (EPS)';
        if (metricPrimaryEl) {
            metricPrimaryEl.innerText = comp.eps.trim();
            metricPrimaryEl.style.color = '#38bdf8';
        }
        
        const surpriseVal = comp.surprise ? parseFloat(comp.surprise) : null;
        if (statusBadgeEl) {
            if (surpriseVal !== null && !isNaN(surpriseVal)) {
                statusBadgeEl.style.display = 'inline-block';
                if (surpriseVal > 0) {
                    statusBadgeEl.innerText = `🟢 Superó Expectativas (+${surpriseVal.toFixed(2)}%)`;
                    statusBadgeEl.className = 'cec-status-badge beat';
                } else if (surpriseVal < 0) {
                    statusBadgeEl.innerText = `🔴 Debajo de Expectativas (${surpriseVal.toFixed(2)}%)`;
                    statusBadgeEl.className = 'cec-status-badge miss';
                } else {
                    statusBadgeEl.innerText = `⚪ En Línea con Consenso (0.00%)`;
                    statusBadgeEl.className = 'cec-status-badge inline';
                }
            } else {
                statusBadgeEl.style.display = 'none';
            }
        }
        
        if (mini1LabelEl) mini1LabelEl.innerText = 'Consenso Estimado';
        if (mini1ValEl) mini1ValEl.innerText = forecastVal;
        
        if (mini2LabelEl) mini2LabelEl.innerText = 'Sorpresa %';
        if (mini2ValEl) {
            if (surpriseVal !== null && !isNaN(surpriseVal)) {
                const sign = surpriseVal >= 0 ? '+' : '';
                mini2ValEl.innerText = `${sign}${surpriseVal.toFixed(2)}%`;
                mini2ValEl.className = `mini-val ${surpriseVal >= 0 ? 'positive' : 'negative'}`;
            } else {
                mini2ValEl.innerText = '---';
                mini2ValEl.className = 'mini-val';
            }
        }
    } else {
        // MODO PRE-PUBLICACIÓN (EXPECTATIVA / ESTIMACIÓN)
        if (metricLabelEl) metricLabelEl.innerText = 'Expectativa EPS de Mercado (Consenso)';
        if (metricPrimaryEl) {
            metricPrimaryEl.innerText = forecastVal;
            metricPrimaryEl.style.color = '#fbbf24';
        }
        if (statusBadgeEl) statusBadgeEl.style.display = 'none';
        
        if (mini1LabelEl) mini1LabelEl.innerText = 'EPS Año Anterior';
        if (mini1ValEl) mini1ValEl.innerText = lastVal;
        
        if (mini2LabelEl) mini2LabelEl.innerText = 'Var. Estimada (YoY)';
        if (mini2ValEl) {
            const numForecast = parseFloat(forecastVal.replace(/[^0-9.-]/g, ''));
            const numLast = parseFloat(lastVal.replace(/[^0-9.-]/g, ''));
            
            if (!isNaN(numForecast) && !isNaN(numLast) && numLast !== 0) {
                const growth = ((numForecast - numLast) / Math.abs(numLast)) * 100;
                const sign = growth >= 0 ? '+' : '';
                mini2ValEl.innerText = `${sign}${growth.toFixed(1)}%`;
                mini2ValEl.className = `mini-val ${growth >= 0 ? 'positive' : 'negative'}`;
            } else {
                mini2ValEl.innerText = '---';
                mini2ValEl.className = 'mini-val';
            }
        }
    }
    
    if (marketCapEl) marketCapEl.innerText = comp.marketCap ? comp.marketCap : 'N/D';
    if (quarterEl) quarterEl.innerText = comp.fiscalQuarterEnding ? comp.fiscalQuarterEnding : 'N/D';
    
    if (chartBtn) {
        chartBtn.onclick = function() {
            selectAssetFromEarnings(sym);
        };
    }
    
    modal.style.display = 'flex';
}

function closeCompanyEarningsModal() {
    const modal = document.getElementById('company-earnings-modal');
    if (modal) modal.style.display = 'none';
}
window.closeCompanyEarningsModal = closeCompanyEarningsModal;

/* Sidebar Featured Earnings Widget (Right Column) */
let stateSidebarEarningsTab = 'today';
let sidebarEarningsData = { today: [], tomorrow: [] };

async function loadSidebarEarnings() {
    const listEl = document.getElementById('sidebar-earnings-list');
    if (!listEl) return;
    
    try {
        const now = new Date();
        const formatYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        
        const todayStr = formatYMD(now);
        
        let nextDay = new Date(now);
        nextDay.setDate(nextDay.getDate() + 1);
        
        const currentPanel = state.assetType || 'cedears';
        
        const res = await fetch(`/api/earnings/week?date=${todayStr}&panel=${currentPanel}`);
        if (!res.ok) return;
        const data = await res.json();
        
        const daysList = data.days || [];
        let todayObj = daysList.find(d => d.date === todayStr);
        let tomorrowObj = daysList.find(d => d.date === formatYMD(nextDay));
        
        // Si mañana no tiene balances o cae en fin de semana, tomar el siguiente día con balances en la semana
        if (!tomorrowObj || ((tomorrowObj.before_open.length + tomorrowObj.after_close.length + tomorrowObj.other.length) === 0)) {
            tomorrowObj = daysList.find(d => d.date > todayStr && (d.before_open.length + d.after_close.length + d.other.length) > 0);
        }
        
        const processDayComps = (dayObj) => {
            if (!dayObj) return [];
            const comps = [...(dayObj.before_open || []), ...(dayObj.after_close || []), ...(dayObj.other || [])];
            comps.sort((a, b) => parseMarketCapNum(b.marketCap) - parseMarketCapNum(a.marketCap));
            return comps;
        };
        
        sidebarEarningsData.today = processDayComps(todayObj);
        sidebarEarningsData.tomorrow = processDayComps(tomorrowObj);
        
        renderSidebarEarnings();
    } catch (e) {
        console.error("Error cargando balances destacados lateral:", e);
    }
}
window.loadSidebarEarnings = loadSidebarEarnings;

function switchSidebarEarningsTab(tab) {
    stateSidebarEarningsTab = tab;
    const btnToday = document.getElementById('sb-tab-today');
    const btnTomorrow = document.getElementById('sb-tab-tomorrow');
    if (btnToday) btnToday.classList.toggle('active', tab === 'today');
    if (btnTomorrow) btnTomorrow.classList.toggle('active', tab === 'tomorrow');
    renderSidebarEarnings();
}
window.switchSidebarEarningsTab = switchSidebarEarningsTab;

function selectSidebarEarningsItem(idx) {
    const comps = sidebarEarningsData[stateSidebarEarningsTab] || [];
    const comp = comps[idx];
    if (!comp) return;
    showCompanyEarningsCard(comp);
}
window.selectSidebarEarningsItem = selectSidebarEarningsItem;

function renderSidebarEarnings() {
    const listEl = document.getElementById('sidebar-earnings-list');
    if (!listEl) return;
    
    const comps = sidebarEarningsData[stateSidebarEarningsTab] || [];
    if (comps.length === 0) {
        listEl.innerHTML = `<div style="text-align:center; padding:18px 10px; font-size:12px; color:var(--text-secondary);">Sin balances destacados para ${stateSidebarEarningsTab === 'today' ? 'hoy' : 'próxima fecha'}</div>`;
        return;
    }
    
    const maxItems = 6;
    const topComps = comps.slice(0, maxItems);
    
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    listEl.innerHTML = topComps.map((comp, idx) => {
        const sym = comp.symbol;
        const logo = getCompanyLogoSrc(sym);
        const fallbackLogo = `https://financialmodelingprep.com/image-stock/${sym}.png`;
        
        const isPastOrToday = (comp.date || todayStr) <= todayStr;
        const hasReported = isPastOrToday && comp.eps && comp.eps.trim() !== '' && comp.eps.trim() !== 'N/A';
        
        let valText = '';
        let valClass = '';
        let badgeHtml = '';
        
        if (hasReported) {
            valText = `$${comp.eps}`;
            const actualNum = parseFloat(comp.eps.replace('$', ''));
            const estNum = parseFloat((comp.epsForecast || '').replace('$', ''));
            if (!isNaN(actualNum) && !isNaN(estNum)) {
                if (actualNum > estNum) {
                    valClass = '';
                    badgeHtml = `<span class="sidebar-earnings-badge beat">Beat</span>`;
                } else if (actualNum < estNum) {
                    valClass = 'miss';
                    badgeHtml = `<span class="sidebar-earnings-badge miss">Miss</span>`;
                } else {
                    valClass = 'forecast';
                    badgeHtml = `<span class="sidebar-earnings-badge pending">Inline</span>`;
                }
            } else {
                badgeHtml = `<span class="sidebar-earnings-badge beat">Real</span>`;
            }
        } else {
            valText = comp.epsForecast ? `Est: $${comp.epsForecast}` : 'Pend';
            valClass = 'forecast';
            badgeHtml = `<span class="sidebar-earnings-badge pending">Est</span>`;
        }
        
        let timeLabel = '☀️ Pre';
        const tStr = (comp.timing || comp.time || '').toLowerCase();
        if (tStr.includes('after') || tStr.includes('post') || tStr === 'after-close') {
            timeLabel = '🌙 Post';
        } else if (tStr.includes('pre') || tStr.includes('before') || tStr === 'before-open') {
            timeLabel = '☀️ Pre';
        } else {
            timeLabel = isPastOrToday ? '📋 Rep' : '🕒 Pend';
        }
        
        return `
            <div class="sidebar-earnings-row" onclick="selectSidebarEarningsItem(${idx})">
                <div class="sidebar-earnings-left">
                    <img src="${logo}" class="sidebar-earnings-logo" onerror="if(this.src !== '${fallbackLogo}'){this.src='${fallbackLogo}';}else{this.style.display='none';this.nextElementSibling.style.display='flex';}" alt="${sym}">
                    <div class="monthly-mini-fallback" style="display:none; width:22px; height:22px; font-size:8px;">${sym.slice(0, 2)}</div>
                    <div class="sidebar-earnings-info">
                        <span class="sidebar-earnings-sym">${sym}</span>
                        <span class="sidebar-earnings-timing">${timeLabel}</span>
                    </div>
                </div>
                <div class="sidebar-earnings-right">
                    <span class="sidebar-earnings-val ${valClass}">${valText}</span>
                    ${badgeHtml}
                </div>
            </div>
        `;
    }).join('');
}
window.renderSidebarEarnings = renderSidebarEarnings;
