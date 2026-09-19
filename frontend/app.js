const API = '/api';

const assets = [
    { key: 'gold', label: 'Gold', color: '#7f8cff' },
    { key: 'bitcoin', label: 'Bitcoin', color: '#ff5a3d' },
    { key: 'nvidia', label: 'NVIDIA', color: '#00d5a0' }
];

const views = {
    overview: ['◈', 'Overview', 'Market overview'],
    explorer: ['▣', 'Asset Explorer', 'Technical intelligence'],
    correlation: ['◫', 'Correlation Lab', 'Cross-asset dependency map'],
    strategy: ['⚡', 'Strategy Lab', 'Quantitative Strategy Lab & Backtest Execution'],
    regimes: ['△', 'Market Regimes', 'Macro climate decomposition'],
    adaptive: ['◎', 'Adaptive Lab', 'Regime-aware allocation'],
    stress: ['◇', 'Stress Lab', 'Edge-case resilience testing'],
    advanced: ['✦', 'Advanced Lab', 'Monte Carlo Forecast Engine'],
    'ml-regimes': ['◉', 'ML Market Regimes', 'Unsupervised market state detection'],
    'paper-trading': ['▤', 'Paper Trading Simulator', 'Live mark-to-market execution'],
    summary: ['✧', 'Research Summary', 'Executive decision brief']
};

const charts = {};
const $ = id => document.getElementById(id);

if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#8d95a5';
    Chart.defaults.font.family = 'IBM Plex Sans, Segoe UI, sans-serif';
}

function nav() {
    const html = Object.entries(views).map(([key, v]) => `<button class="nav-button" data-view-button="${key}"><b>${v[0]}</b>${v[1]}</button>`).join('');
    $('desktopNav').innerHTML = html;
    $('mobileNav').innerHTML = html;
    document.querySelectorAll('[data-view-button]').forEach(button => button.addEventListener('click', () => showView(button.dataset.viewButton)));
}

function showView(name) {
    prepareAdvanced();
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.dataset.view === name));
    document.querySelectorAll('[data-view-button]').forEach(button => button.classList.toggle('active', button.dataset.viewButton === name));
    $('sectionEyebrow').textContent = views[name][1];$('pageTitle').textContent = views[name][2];
    
    if (name === 'ml-regimes') {
        if ($('mlRegimeAsset')) {$('mlRegimeAsset').onchange = loadMLScatter;
        }
        loadMLScatter();
    }
    
    if (name === 'paper-trading') {
        if ($('paperOrder')) {
            $('paperOrder').onclick = () => placePaperOrder().catch(error =>$('paperMessage').innerHTML = `<div class="finding">${error.message}</div>`);
        }
        if ($('paperRefresh')) {$('paperRefresh').onclick = () => loadPaperPortfolio();
        }
        loadPaperPortfolio();
    }
}

async function get(path) {
    const response = await fetch(API + path);
    if (!response.ok) throw new Error(path);
    return response.json();
}

async function loadMLScatter() {
    const data = await get(`/advanced/ml-regimes?asset=${$('mlRegimeAsset').value}`);
    $('mlRegimeSource').textContent = data.source \vert{}\vert{} '';$('mlRegimeModel').textContent = data.model || '';
    const current = data.current || {};
    
    setMetrics('mlRegimeMetrics', [
        ['Current cluster', String(current.regime || 'Unknown'), `${data.label} · ${current.date || ''}`],
        ['Latest return', pct(current.return), '5-day rolling feature'],
        ['Volatility', pct(current.volatility), '21-day annualized feature']
    ]);
    
    $('mlRegimeTable').innerHTML = `<table class="trade-table"><thead><tr><th>Cluster</th><th>Days</th><th>Return</th><th>Volatility</th><th>Momentum</th></tr></thead><tbody>${(data.profiles || []).map(row => `<tr><td>${row.cluster} ·${row.regime}</td><td>${row.days}</td><td>${pct(row.return)}</td><td>${pct(row.volatility)}</td><td>${pct(row.momentum)}</td></tr>`).join('')}</tbody></table>`;
    
    if (typeof Plotly !== 'undefined') {
        const colors = ['#6671f2', '#ff5a3d', '#00c89b'];
        Plotly.newPlot('mlRegimeChart', [0, 1, 2].map(cluster => {
            const points = (data.observations || []).filter(row => row.cluster === cluster);
            return {
                x: points.map(row => row.return),
                y: points.map(row => row.volatility),
                customdata: points.map(row => row.date),
                mode: 'markers',
                type: 'scatter',
                name: String(cluster),
                marker: { color: colors[cluster], size: 6, opacity: .86 },
                hovertemplate: 'Date: %{customdata}<br>Return: %{x:.2%}<br>Volatility: %{y:.2f}<extra>Cluster ' + cluster + '</extra>'
            };
        }), {
            title: { text: `KMeans Market Regimes for ${data.label}`, font: { size: 14, color: '#e8ebf0' } },
            paper_bgcolor: '#10131a',
            plot_bgcolor: '#10131a',
            font: { color: '#e8ebf0' },
            margin: { l: 65, r: 20, t: 55, b: 55 },
            xaxis: { title: 'Return', tickformat: '.2%', gridcolor: 'rgba(148,163,184,.15)' },
            yaxis: { title: 'Volatility', tickformat: '.1f', gridcolor: 'rgba(148,163,184,.15)' },
            legend: { title: { text: 'Regime Cluster' } }
        }, { responsive: true, displaylogo: false });
    }
}

function metric(label, value, sub = '') {
    return `<article class="metric-card"><div class="metric-label">${label}</div><div class="metric-value">${value}</div>${sub ? `<div class="metric-sub">${sub}</div>` : ''}</article>`;
}

function prepareAdvanced() {
    if (document.querySelector('[data-advanced-panel="ml-regimes"]')) return;
    const advanced = document.querySelector('[data-view="advanced"]');
    const tabs = advanced.querySelector('.advanced-tabs');
    
    [['ml-regimes', '◉ ML Market Regimes'], ['paper-trading', '▤ Paper Trading Simulator']].forEach(([name, label]) => {
        const button = document.createElement('button');
        button.className = 'advanced-tab';
        button.dataset.advancedView = name;
        button.textContent = label;
        button.addEventListener('click', () => {
            document.querySelectorAll('[data-advanced-view]').forEach(item => item.classList.toggle('active', item === button));
            document.querySelectorAll('[data-advanced-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.advancedPanel === name));
            if (name === 'ml-regimes') loadMLScatter();
            if (name === 'paper-trading') loadPaperPortfolio();
        });
        tabs.append(button);
        const panel = document.querySelector(`[data-view="${name}"]`);
        panel.classList.remove('view');
        panel.classList.add('advanced-panel');
        panel.dataset.advancedPanel = name;
        advanced.append(panel);
    });
}

function pct(value, digits = 2) { return `${(Number(value || 0) * 100).toFixed(digits)}%`; }
function money(value) { return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
function normalize(series) {
    const first = Number(series[0]?.close) || 1;
    return series.map(row => Number(row.close) / first * 100);
}
function destroy(name) { if (charts[name]) charts[name].destroy(); }

function lineChart(name, id, labels, datasets, options = {}) {
    destroy(name);
    charts[name] = new Chart($(id), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            animation: { duration: 350 },
            plugins: {
                legend: { labels: { color: '#cbd2de' } },
                tooltip: { backgroundColor: '#171b23', borderColor: '#343b49', borderWidth: 1 }
            },
            scales: {
                x: { grid: { color: 'rgba(122,133,151,.12)' }, ticks: { maxTicksLimit: 8, maxRotation: 0, color: '#8d95a5' } },
                y: { grid: { color: 'rgba(122,133,151,.16)' }, ticks: { color: '#8d95a5' } }
            },
            ...options
        }
    });
}

async function loadOverview() {
    const data = await get('/assets');
    const cards = data.assets || [];
    $('overviewCards').innerHTML = cards.map(item => metric(item.label, money(item.summary.price), `Daily ${pct(item.summary.daily_change)} | Sharpe ${Number(item.summary.sharpe || 0).toFixed(2)}`)).join('');
    const period = $('overviewPeriod').value;
    const payloads = await Promise.all(assets.map(asset => get(`/assets/${asset.key}?period=${period}`)));
    const labels = payloads[0].series.map(row => row.date);
    const datasets = payloads.map((payload, i) => ({ label: assets[i].label, data: normalize(payload.series), borderColor: assets[i].color, pointRadius: 0, borderWidth: 2, tension: .12 }));
    lineChart('performance', 'performanceChart', labels, datasets);
    $('sourceStatus').textContent = payloads.every(p => p.live) ? 'Live sync online' : 'Fallback data online';$('lastUpdated').textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

async function loadExplorer() {
    const data = await get(`/assets/${$('assetSelect').value}?period=${$('assetPeriod').value}`);
    const s = data.series || [];
    const sum = data.summary || {};
    $('assetMetrics').innerHTML = [metric('Price', money(sum.price)), metric('Daily', pct(sum.daily_change)), metric('Sharpe', Number(sum.sharpe || 0).toFixed(2)), metric('Max drawdown', pct(sum.max_drawdown))].join('');
    const last = s[s.length - 1] || {};
    const signals = [
        ['50 EMA', last.close > last.ema50 ? 'Bullish' : 'Below average', last.close > last.ema50 ? 78 : 35],
        ['200 EMA', last.close > last.ema200 ? 'Trend support' : 'Trend risk', last.close > last.ema200 ? 72 : 30],
        ['Volatility', `${pct(last.volatility)} annualized`, Math.min(95, Number(last.volatility || 0) * 140)],
        ['Drawdown', pct(last.drawdown), Math.max(8, 100 + Number(last.drawdown || 0) * 180)]
    ];
    $('signals').innerHTML = signals.map(x => `<div class="signal"><div class="signal-top"><span>${x[0]}</span><span>${x[1]}</span></div><div class="signal-bar"><i style="width:${x[2]}%"></i></div></div>`).join('');
    lineChart('asset', 'assetChart', s.map(x => x.date), [['Close', 'close', '#e8ebf0'], ['SMA50', 'sma50', '#f5c451'], ['EMA50', 'ema50', '#7f8cff'], ['EMA200', 'ema200', '#00d5a0']].map(x => ({ label: x[0], data: s.map(row => row[x[1]]), borderColor: x[2], pointRadius: 0, borderWidth: x[0] === 'Close' ? 2 : 1.4, tension: .18 })));
}

async function loadCorrelation() {
    const data = await get('/correlation');
    $('correlationSource').textContent = data.source || '';
    const labels = data.labels || [];
    const matrix = data.matrix || [];
    Plotly.newPlot('correlationMatrix', [{
        z: matrix, x: labels, y: labels, type: 'heatmap',
        zmin: -1, zmax: 1,
        colorscale: [[0, '#063b73'], [.25, '#5ba5d8'], [.5, '#fff0e8'], [.75, '#f58f68'], [1, '#790021']],
        hovertemplate: 'Ticker: %{y}<br>Ticker: %{x}<br>Correlation: %{z:.6f}<extra></extra>',
        text: matrix.map(row => row.map(value => Number(value).toFixed(6))),
        texttemplate: '%{text}',
        textfont: { color: '#142033', size: 11 },
        showscale: true,
        colorbar: { title: 'Correlation', tickvals: [-1, -.5, 0, .5, 1], ticktext: ['-1', '-0.5', '0', '0.5', '1'], titlefont: { color: '#e8ebf0' }, tickfont: { color: '#e8ebf0' } }
    }], {
        paper_bgcolor: '#10131a', plot_bgcolor: '#10131a', font: { color: '#e8ebf0' },
        margin: { l: 100, r: 80, t: 20, b: 85 },
        xaxis: { title: 'Ticker', gridcolor: '#252b36' },
        yaxis: { title: 'Ticker', autorange: 'reversed', gridcolor: '#252b36' },
        hovermode: 'closest'
    }, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'] });
}

function setMetrics(id, items) { $(id).innerHTML = items.map(x => metric(x[0], x[1], x[2] || '')).join(''); }

async function runBacktest(asset = $('backtestAsset').value) {
    const body = { asset, initial_capital: Number($('capital').value) || 10000, position_size: Number($('position').value) \vert{}\vert{} 1, transaction_cost: Number($('cost').value) || 0 };
    const response = await fetch(API + '/backtest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    const m = data.metrics || {};
    setMetrics('backtestMetrics', [['Total return', pct(m.total_return)], ['Sharpe', Number(m.sharpe || 0).toFixed(2)], ['Max drawdown', pct(m.max_drawdown)], ['Final value', money(m.final_value)]]);
    lineChart('backtest', 'backtestChart', (data.curve || []).map(x => x.date), [{ label: 'Strategy', data: (data.curve || []).map(x => x.strategy), borderColor: '#00d5a0', pointRadius: 0, borderWidth: 2, tension: .2 }, { label: 'Buy & Hold', data: (data.curve || []).map(x => x.benchmark), borderColor: '#f5c451', pointRadius: 0, borderWidth: 1.5, tension: .2 }]);
    return m;
}

async function loadStrategy() {
    const body = { asset: $('strategyAsset').value, initial_capital: Number($('capital').value) || 140000, position_size: 1, transaction_cost: (Number($('cost').value) \vert{}\vert{} 0) / 100, strategy:$('strategySelect').value, fast_window: Number($('fastWindow').value), slow_window: Number($('slowWindow').value) };
    const response = await fetch(API + '/backtest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    const m = data.metrics || {};
    $('strategySource').textContent = data.source || '';
    setMetrics('strategyMetrics', [['Strategy Return', pct(m.total_return)], ['Benchmark Return', pct(m.benchmark_return)], ['Sharpe Ratio', Number(m.sharpe || 0).toFixed(2)], ['Total Trades Executed', String(m.total_trades || 0)]]);
    lineChart('strategy', 'strategyChart', (data.curve || []).map(x => x.date), [{ label: 'Strategy (EMA Trend)', data: (data.curve || []).map(x => x.strategy), borderColor: '#7f8cff', pointRadius: 0, borderWidth: 1.5, tension: .15 }, { label: 'Buy & Hold Benchmark', data: (data.curve || []).map(x => x.benchmark), borderColor: '#ff5a3d', pointRadius: 0, borderWidth: 1.5, tension: .15 }]);
    $('tradeLog').innerHTML = `<table class="trade-table"><thead><tr><th>Date</th><th>Action</th><th>Execution Price (₹)</th><th>Portfolio Valuation (₹)</th></tr></thead><tbody>${(data.trades || []).slice(-20).reverse().map(row => `<tr><td>${row.date}</td><td>${row.action}</td><td>${Number(row.execution_price).toLocaleString()}</td><td>${Number(row.portfolio_value).toLocaleString()}</td></tr>`).join('')}</tbody></table>`;
}

async function loadRegimes() {
    const asset = $('regimeAsset')?.value \vert{}\vert{}$('assetSelect').value;
    const data = await get(`/regimes/${asset}`);
    const rows = data.regimes || [];
    const current = data.current || {};
    $('regimeSource').textContent = data.source || '';
    $('currentRegime').textContent = current.regime \vert{}\vert{} 'Unknown';$('currentRegimeMeta').textContent = `${current.trend || 'Unknown'} trend · ${current.volatility_state || 'Unknown'} · ${current.date || ''}`;
    $('currentRegimeDot').style.background = current.color || '#93a4bc';
    $('regimeCards').innerHTML = rows.map(x => metric(x.regime, `${x.days} days`, `${pct(x.return)} return | ${pct(x.volatility)} vol`)).join('');
    $('regimeTable').innerHTML = `<table class="trade-table regime-table"><thead><tr><th>Regime</th><th>Days</th><th>Return</th><th>Volatility</th></tr></thead><tbody>${rows.map(x => `<tr><td><span class="regime-swatch" style="background:${x.color}"></span>${x.regime}</td><td>${x.days}</td><td>${pct(x.return)}</td><td>${pct(x.volatility)}</td></tr>`).join('')}</tbody></table>`;
    const timeline = data.timeline || [];
    if (typeof Plotly !== 'undefined') {
        Plotly.newPlot('regimeTimeline', [{
            x: timeline.map(x => x.date), y: timeline.map(x => 1), mode: 'markers', type: 'scatter',
            marker: { size: 10, color: timeline.map(x => x.color), symbol: 'square' },
            customdata: timeline.map(x => [x.regime, x.trend, x.volatility_state]),
            hovertemplate: 'Date: %{x}<br>Regime: %{customdata[0]}<br>Trend: %{customdata[1]}<br>Volatility: %{customdata[2]}<extra></extra>',
            showlegend: false
        }], {
            paper_bgcolor: '#10131a', plot_bgcolor: '#10131a', margin: { l: 25, r: 20, t: 20, b: 45 },
            xaxis: { gridcolor: 'rgba(148,163,184,.15)', tickfont: { color: '#a8b0bf' }, nticks: 8 },
            yaxis: { visible: false, fixedrange: true }, hovermode: 'closest'
        }, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'] });
    }
    destroy('regime');
    charts.regime = new Chart($('regimeChart'), {
        type: 'bar',
        data: { labels: rows.map(x => x.regime), datasets: [{ label: 'Regime return', data: rows.map(x => Number(x.return) * 100), backgroundColor: rows.map(x => x.color), borderRadius: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#a8b0bf' } }, y: { grid: { color: 'rgba(148,163,184,.14)' }, ticks: { color: '#a8b0bf', callback: v => `${v}%` } } } }
    });
}

async function loadRegimePerformance() {
    const asset = $('regimeAsset').value;
    const regime = $('regimeScenario').value;
    const data = await get(`/regime-performance/${asset}?regime=${regime}`);
    $('regimeStrategyTable').innerHTML = `<div class="panel-heading"><div><span class="eyebrow">Selected macro regime</span><h2>${data.regime_label}</h2></div><span class="status">${data.source}</span></div><table class="trade-table regime-comparison-table"><thead><tr><th>Quantitative Strategy</th><th>Period Return (%)</th><th>Sharpe Ratio</th><th>Max Drawdown (%)</th><th>Trades</th></tr></thead><tbody>${(data.strategies || []).map(row => `<tr><td>${row.strategy}</td><td>${pct(row.period_return)}</td><td>${Number(row.sharpe || 0).toFixed(2)}</td><td>${pct(row.max_drawdown)}</td><td>${row.trades}</td></tr>`).join('')}</tbody></table>`;
}

async function loadStress() {
    const asset = $('stressAsset').value;
    const scenario = $('stressScenario').value;
    const shock = Number($('shockSize').value) / 100;
    const data = await get(`/stress/${asset}?scenario=${scenario}&shock=${shock}`);
    const m = data.metrics || {};
    $('stressSource').textContent = data.source || '';
    setMetrics('stressMetrics', [['Baseline return', pct(m.baseline_return)], ['Stressed return', pct(m.stressed_return)], ['Stress loss', pct(m.stress_loss)], ['Stressed max drawdown', pct(m.stressed_drawdown)]]);
    lineChart('stress', 'stressChart', (data.curve || []).map(x => x.date), [{ label: 'Baseline', data: (data.curve || []).map(x => x.baseline), borderColor: '#00d5a0', pointRadius: 0, borderWidth: 2, tension: .15 }, { label: 'Stressed', data: (data.curve || []).map(x => x.stressed), borderColor: '#ff5a3d', pointRadius: 0, borderWidth: 2, tension: .15 }]);
    const descriptions = { market_crash: 'A sudden downward repricing tests immediate drawdown capacity.', volatility_spike: 'Daily moves are amplified to model an unstable volatility regime.', liquidity_shock: 'A concentrated gap and follow-through loss model poor execution conditions.', recovery: 'A sharp shock is followed by a measured recovery path.' };
    $('stressSummary').innerHTML = `<div class="finding">${descriptions[scenario]}</div><div class="finding">The stressed path ends ${pct(Math.abs(m.stress_loss))} below the baseline over the selected history.</div>`;
}

async function loadAdvanced() {
    const asset = $('advancedAsset').value;
    const horizon = Number($('horizonSize').value);
    const paths = Number($('pathsSize').value);
    const data = await get(`/advanced/forecast/${asset}?horizon=${horizon}&paths=${paths}`);
    $('advancedSource').textContent = data.source \vert{}\vert{} '';$('advancedChartTitle').textContent = `Monte Carlo Forecast for ${data.label} (${data.horizon} Trading Days)`;
    setMetrics('advancedMetrics', [['Current price', money(data.starting_price)], ['Expected final price', money(data.expected_final_price)], ['10th–90th range', `${money(data.lower_final_price)} – ${money(data.upper_final_price)}`]]);
    $('advancedSummary').innerHTML = `<div class="finding">${data.paths} simulated paths using real historical return behavior.</div><div class="finding">Annualized historical volatility: ${(Number(data.annualized_volatility || 0) * 100).toFixed(2)}%.</div>`;
    if (typeof Plotly !== 'undefined') {
        const traces = (data.simulations || []).map(path => ({ x: data.labels, y: path, type: 'scatter', mode: 'lines', line: { color: 'rgba(35,92,156,.28)', width: 1 }, hoverinfo: 'skip', showlegend: false }));
        traces.push({ x: data.labels, y: data.lower_band, type: 'scatter', mode: 'lines', line: { color: 'rgba(35,92,156,0)', width: 0 }, hoverinfo: 'skip', showlegend: false });
        traces.push({ x: data.labels, y: data.upper_band, type: 'scatter', mode: 'lines', fill: 'tonexty', fillcolor: 'rgba(28,77,132,.12)', line: { color: 'rgba(35,92,156,0)', width: 0 }, name: '10–90% range', hovertemplate: 'Day %{x}<br>Range: ₹%{y:,.0f}<extra></extra>' });
        traces.push({ x: data.labels, y: data.expected_path, type: 'scatter', mode: 'lines', line: { color: '#ffad16', width: 3 }, name: 'Expected Path (Mean)', hovertemplate: 'Day %{x}<br>Expected: ₹%{y:,.0f}<extra></extra>' });
        Plotly.newPlot('advancedChart', traces, { paper_bgcolor: '#10131a', plot_bgcolor: '#10131a', font: { color: '#e8ebf0' }, margin: { l: 70, r: 20, t: 10, b: 55 }, xaxis: { title: 'Future Trading Days', gridcolor: 'rgba(148,163,184,.14)', zeroline: false }, yaxis: { title: 'Simulated Price (₹)', gridcolor: 'rgba(148,163,184,.14)', tickformat: ',.0f' }, hovermode: 'x unified', legend: { orientation: 'h', x: .72, y: 1.08, font: { size: 11 } } }, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'] });
    }
}

async function loadOptimizer() {
    const data = await get(`/advanced/optimizer?risk_free_rate=${Number($('riskFreeSize').value) / 100}&iterations=${Number($('optimizerIterations').value)}`);
    $('advancedSource').textContent = data.source \vert{}\vert{} '';$('optimizerTable').innerHTML = `<table class="trade-table optimizer-table"><thead><tr><th>Asset</th><th>Optimal Weight (%)</th></tr></thead><tbody>${data.assets.map((asset, i) => `<tr><td>${asset}</td><td>${Number(data.weights[i]).toFixed(2)}%</td></tr>`).join('')}</tbody></table>`;
    if (typeof Plotly !== 'undefined') {
        Plotly.newPlot('optimizerChart', [{ labels: data.assets, values: data.weights, type: 'pie', textinfo: 'label+percent', marker: { colors: ['#6671f2', '#f6533d', '#00c89b'] }, hole: .02, hovertemplate: '%{label}: %{value:.2f}%<extra></extra>' }], { paper_bgcolor: '#10131a', font: { color: '#e8ebf0' }, margin: { l: 20, r: 20, t: 20, b: 20 }, showlegend: true, legend: { font: { color: '#e8ebf0' } } }, { responsive: true, displaylogo: false });
    }
}

async function loadRisk() {
    const data = await get(`/advanced/risk?confidence=0.95&days=1`);
    $('riskSource').textContent = data.source \vert{}\vert{} '';$('riskMetrics').innerHTML = [['1-Day VaR (95% Confidence)', pct(data.var_95)], ['1-Day VaR (99% Confidence)', pct(data.var_99)], ['Expected Shortfall / CVaR (95%)', pct(data.cvar)]].map(x => metric(x[0], x[1])).join('');
    if (typeof Plotly !== 'undefined') {
        Plotly.newPlot('riskChart', [{ x: data.distribution, type: 'histogram', nbinsx: 45, marker: { color: '#6671f2' }, name: 'Daily returns', hovertemplate: 'Return: %{x:.2%}<br>Count: %{y}<extra></extra>' }, { x: [data.var_95, data.var_95], y: [0, 1], type: 'scatter', mode: 'lines', line: { color: '#ffad16', dash: 'dash', width: 2 }, name: '95% VaR Cutoff' }, { x: [data.var_99, data.var_99], y: [0, 1], type: 'scatter', mode: 'lines', line: { color: '#ff3e4d', dash: 'dash', width: 2 }, name: '99% VaR Cutoff' }], { paper_bgcolor: '#10131a', plot_bgcolor: '#10131a', font: { color: '#e8ebf0' }, margin: { l: 55, r: 20, t: 20, b: 50 }, bargap: .02, xaxis: { title: 'Daily return', tickformat: '.0%', gridcolor: 'rgba(148,163,184,.14)' }, yaxis: { title: 'Count', gridcolor: 'rgba(148,163,184,.14)' }, legend: { orientation: 'h', x: .6, y: 1.1 } }, { responsive: true, displaylogo: false });
    }
}

async function loadMLRegimes() {
    const data = await get(`/advanced/ml-regimes?asset=${$('mlRegimeAsset').value}`);
    $('mlRegimeSource').textContent = data.source \vert{}\vert{} '';$('mlRegimeModel').textContent = data.model || '';
    const current = data.current || {};
    setMetrics('mlRegimeMetrics', [['Current state', current.regime || 'Unknown', `${data.label} · ${current.date || ''}`], ['5-day return', pct(current.return), 'Rolling feature average'], ['Annualized volatility', pct(current.volatility), '21-day feature average']]);
    $('mlRegimeTable').innerHTML = `<table class="trade-table"><thead><tr><th>State</th><th>Days</th><th>Return</th><th>Volatility</th><th>Momentum</th></tr></thead><tbody>${(data.profiles || []).map(row => `<tr><td>${row.regime}</td><td>${row.days}</td><td>${pct(row.return)}</td><td>${pct(row.volatility)}</td><td>${pct(row.momentum)}</td></tr>`).join('')}</tbody></table>`;
    if (typeof Plotly !== 'undefined') {
        const colors = { Defensive: '#7a8da6', Balanced: '#f5c451', 'Risk-on': '#42d392' };
        Plotly.newPlot('mlRegimeChart', [{ x: (data.timeline || []).map(row => row.date), y: (data.timeline || []).map(row => row.regime), mode: 'markers', type: 'scatter', marker: { size: 8, color: (data.timeline || []).map(row => colors[row.regime] || '#93a4bc') }, text: (data.timeline || []).map(row => row.regime), hovertemplate: 'Date: %{x}<br>State: %{text}<extra></extra>', showlegend: false }], { paper_bgcolor: '#10131a', plot_bgcolor: '#10131a', font: { color: '#e8ebf0' }, margin: { l: 90, r: 20, t: 20, b: 45 }, xaxis: { gridcolor: 'rgba(148,163,184,.15)', nticks: 8 }, yaxis: { gridcolor: 'rgba(148,163,184,.15)' }, hovermode: 'closest' }, { responsive: true, displaylogo: false });
    }
}

async function loadPaperPortfolio() {
    const data = await get('/advanced/paper');
    $('paperSource').textContent = data.source || '';
    setMetrics('paperMetrics', [['Account equity', money(data.equity)], ['Available cash', money(data.cash)], ['Total return', pct(data.return)]]);
    $('paperPositions').innerHTML = `<table class="trade-table"><thead><tr><th>Asset</th><th>Quantity</th><th>Last price</th><th>Value</th><th>Daily</th></tr></thead><tbody>${(data.positions || []).map(row => `<tr><td>${row.label}</td><td>${Number(row.quantity).toFixed(4)}</td><td>${money(row.price)}</td><td>${money(row.value)}</td><td>${pct(row.change)}</td></tr>`).join('')}</tbody></table>`;
    $('paperTrades').innerHTML = `<table class="trade-table"><thead><tr><th>Time</th><th>Asset</th><th>Side</th><th>Quantity</th><th>Price</th></tr></thead><tbody>${(data.trades || []).slice().reverse().map(row => `<tr><td>${row.time}</td><td>${row.asset}</td><td>${row.side.toUpperCase()}</td><td>${Number(row.quantity).toFixed(4)}</td><td>${money(row.price)}</td></tr>`).join('')}</tbody></table>`;
}

async function placePaperOrder() {
    const asset = $('paperAsset').value;
    const side = $('paperSide').value;
    const quantity = Number($('paperQuantity').value);
    const portfolio = await get('/advanced/paper');
    const position = (portfolio.positions || []).find(row => row.asset === asset);
    const price = Number(position?.price || 0);
    const held = Number(position?.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) { $('paperMessage').innerHTML = '<div class="finding">Enter a quantity greater than zero.</div>'; return; }
    if (side === 'buy' && quantity * price > Number(portfolio.cash || 0)) { $('paperMessage').innerHTML = `<div class="finding">Insufficient cash. Maximum buy quantity for ${position?.label || asset}: ${(Number(portfolio.cash || 0) / price).toFixed(6)}.</div>`; return; }
    if (side === 'sell' && quantity > held) { $('paperMessage').innerHTML = `<div class="finding">Insufficient ${position?.label || asset} position. Available quantity: ${held.toFixed(6)}.</div>`; return; }
    const response = await fetch(`${API}/advanced/paper/order?asset=${asset}&side=${side}&quantity=${quantity}`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Order rejected');
    $('paperMessage').innerHTML = `<div class="finding">Executed ${side} ${quantity} ${data.executed.asset} at ${money(data.executed.price)}.</div>`;
    await loadPaperPortfolio();
}

function loadStatic() {
    setMetrics('adaptiveCards', [['Adaptive score', '81.4', 'Risk-adjusted allocation score'], ['Suggested allocation', '42 / 33 / 25', 'BTC / Gold / NVIDIA'], ['Regime adjustment', 'Bullish tilt', 'Trend exposure maintained']]);
    destroy('adaptive');
    charts.adaptive = new Chart($('adaptiveChart'), { type: 'bar', data: { labels: ['Gold', 'Bitcoin', 'NVIDIA'], datasets: [{ label: 'Suggested weight', data: [33, 42, 25], backgroundColor: ['#f5c451', '#ff5a3d', '#00d5a0'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
    $('findings').innerHTML = ['Gold remains a defensive anchor while Bitcoin captures the strongest upside participation.', 'NVIDIA offers growth exposure with materially higher volatility.', 'Return correlations remain moderate, supporting diversification.', 'The trend strategy is strongest when directional persistence is high.'].map(x => `<div class="finding">${x}</div>`).join('');
    $('riskView').innerHTML = [['Risk budget', 'Moderate risk / high conviction'], ['Macro regime', 'Bullish risk-on with controlled volatility'], ['Action', 'Maintain trend exposure and rebalance on volatility expansion']].map(x => `<div class="risk-item"><strong>${x[0]}</strong>${x[1]}</div>`).join('');
}

async function init() {
    nav();
    showView('overview');
    document.querySelectorAll('[data-advanced-view]').forEach(button => button.addEventListener('click', () => {
        document.querySelectorAll('[data-advanced-view]').forEach(item => item.classList.toggle('active', item === button));
        document.querySelectorAll('[data-advanced-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.advancedPanel === button.dataset.advancedView));
        if (button.dataset.advancedView === 'optimizer') loadOptimizer();
        if (button.dataset.advancedView === 'risk') loadRisk();
    }));
    $('overviewPeriod').addEventListener('change', loadOverview);$('assetSelect').addEventListener('change', () => { loadExplorer(); });
    $('assetPeriod').addEventListener('change', loadExplorer);$('regimeAsset').addEventListener('change', () => { loadRegimes(); loadRegimePerformance(); });
    $('regimeScenario').addEventListener('change', loadRegimePerformance);$('strategyRun').addEventListener('click', loadStrategy);
    $('stressRun').addEventListener('click', loadStress);$('stressAsset').addEventListener('change', loadStress);
    $('stressScenario').addEventListener('change', loadStress);$('advancedRun').addEventListener('click', loadAdvanced);
    $('advancedAsset').addEventListener('change', loadAdvanced);$('optimizerRun').addEventListener('click', loadOptimizer);
    $('riskFreeSize').addEventListener('input', event =>$('riskFreeOutput').value = `${Number(event.target.value).toFixed(2)}%`);
    $('riskFreeSize').addEventListener('change', loadOptimizer);$('optimizerIterations').addEventListener('change', loadOptimizer);
    $('fastWindow').addEventListener('input', event =>$('fastOutput').value = event.target.value);
    $('slowWindow').addEventListener('input', event =>$('slowOutput').value = event.target.value);
    $('cost').addEventListener('input', event =>$('costOutput').value = `${Number(event.target.value).toFixed(2)}%`);
    $('shockSize').addEventListener('input', event =>$('shockOutput').value = `${event.target.value}%`);
    $('horizonSize').addEventListener('input', event =>$('horizonOutput').value = `${event.target.value} trading days`);
    $('pathsSize').addEventListener('input', event =>$('pathsOutput').value = `${event.target.value} paths`);
    await loadOverview();
    await loadExplorer();
    await loadCorrelation();
    await loadStrategy();
    await loadRegimes();
    await loadRegimePerformance();
    await loadStress();
    await loadAdvanced();
    loadStatic();
}

function start() {
    init().catch(error => {
        $('sourceStatus').textContent = 'Connection error';$('lastUpdated').textContent = `Error: ${error.message}`;
        console.error(error);
    });
}

if (typeof Chart === 'undefined') {
    const chartScript = document.createElement('script');
    chartScript.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    chartScript.onload = start;
    chartScript.onerror = () => { $('lastUpdated').textContent = 'Chart library unavailable'; };
    document.head.appendChild(chartScript);
} else {
    start();
}
