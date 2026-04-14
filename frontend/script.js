// DYNAMIC API URL: Uses localhost for development and Render for production
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://127.0.0.1:5001/api' 
    : 'https://your-backend-name.onrender.com/api'; // REPLACE with your actual Render URL

let frontierChartInstance = null;

// 3D Tilt Logic
function init3DTilt() {
    const cards = document.querySelectorAll('.3d-hover');
    cards.forEach(card => {
        card.addEventListener('mousemove', e => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -10; // Max tilt 10deg
            const rotateY = ((x - centerX) / centerX) * 10;
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
        });
    });
}
// Run tilt logic when DOM loads
document.addEventListener('DOMContentLoaded', init3DTilt);

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
}

// Helper for handling fetch response and catching empty data
async function handleFetch(res) {
    if (!res.ok) {
        if (res.status === 503) throw new Error("Data is still loading in the background. Please wait!");
        throw new Error(`HTTP Error: ${res.status}`);
    }
    
    const data = await res.json();
    
    if (!data || Object.keys(data).length === 0) {
        throw new Error("Yahoo Finance returned empty data. Check backend terminal.");
    }
    
    return data;
}

// [1] Prices - UPDATED TO HANDLE CLEAN DATES
async function loadPrices() {
    const tbody = document.getElementById('price-body');
    const thead = document.getElementById('price-head');
    tbody.innerHTML = '<tr><td class="neon-blue">Executing query...</td></tr>';
    try {
        const res = await fetch(`${API_BASE_URL}/prices`);
        const data = await handleFetch(res);
        const firstTicker = Object.keys(data)[0];
        const timestamps = Object.keys(data[firstTicker]); 
        
        let headHTML = '<tr><th>TICKER</th>';
        timestamps.forEach(ts => headHTML += `<th>${ts}</th>`);
        headHTML += '</tr>';
        thead.innerHTML = headHTML;

        let bodyHTML = '';
        for (const [ticker, prices] of Object.entries(data)) {
            bodyHTML += `<tr><td style="color:var(--neon-blue)"><strong>${ticker.replace('.NS','')}</strong></td>`;
            for (const ts of timestamps) { bodyHTML += `<td>₹${prices[ts] ? prices[ts].toFixed(2) : 'N/A'}</td>`; }
            bodyHTML += '</tr>';
        }
        tbody.innerHTML = bodyHTML;
    } catch (e) { 
        tbody.innerHTML = `<tr><td style="color:var(--neon-red)">ERR: ${e.message}</td></tr>`; 
    }
}

// [2] Returns
async function loadReturns() {
    const tbody = document.getElementById('returns-body');
    tbody.innerHTML = '<tr><td colspan="3" class="neon-blue">Executing query...</td></tr>';
    try {
        const res = await fetch(`${API_BASE_URL}/returns`);
        const data = await handleFetch(res);
        tbody.innerHTML = '';
        for (const [ticker, metrics] of Object.entries(data)) {
            let color = metrics.Return >= 0 ? 'color:var(--neon-green)' : 'color:var(--neon-red)';
            tbody.innerHTML += `<tr><td style="color:var(--neon-blue)"><strong>${ticker}</strong></td><td style="${color}">${(metrics.Return * 100).toFixed(2)}%</td><td>${(metrics.Risk * 100).toFixed(2)}%</td></tr>`;
        }
    } catch (e) { 
        tbody.innerHTML = `<tr><td colspan="3" style="color:var(--neon-red)">ERR: ${e.message}</td></tr>`; 
    }
}

// [3] CAPM
async function loadCAPMData() {
    const tbody = document.getElementById('capm-table-body');
    tbody.innerHTML = '<tr><td colspan="4" class="neon-blue">Executing query...</td></tr>';
    try {
        const res = await fetch(`${API_BASE_URL}/returns-capm`);
        const data = await handleFetch(res);
        tbody.innerHTML = '';
        for (const [ticker, metrics] of Object.entries(data)) {
            tbody.innerHTML += `<tr><td style="color:var(--neon-blue)"><strong>${ticker}</strong></td><td>${(metrics.Ann_Return * 100).toFixed(2)}%</td><td style="color:var(--neon-purple)">${metrics.Beta}</td><td>${(metrics.CAPM * 100).toFixed(2)}%</td></tr>`;
        }
    } catch (e) { 
        tbody.innerHTML = `<tr><td colspan="4" style="color:var(--neon-red)">ERR: ${e.message}</td></tr>`; 
    }
}

// [4] Correlation
async function loadCorrelationData() {
    const thead = document.getElementById('correlation-head');
    const tbody = document.getElementById('correlation-body');
    tbody.innerHTML = '<tr><td class="neon-blue">Executing matrix calculation...</td></tr>';
    try {
        const res = await fetch(`${API_BASE_URL}/correlation`);
        const data = await handleFetch(res);
        const tickers = Object.keys(data);
        
        let headHTML = '<tr><th>TICKER</th>';
        tickers.forEach(t => headHTML += `<th>${t.replace('.NS', '').substring(0,4)}</th>`);
        headHTML += '</tr>';
        thead.innerHTML = headHTML;
        
        let bodyHTML = '';
        tickers.forEach(rowT => {
            bodyHTML += `<tr><td style="color:var(--neon-blue)"><strong>${rowT.replace('.NS', '').substring(0,6)}</strong></td>`;
            tickers.forEach(colT => {
                const val = data[rowT][colT].toFixed(2);
                let color = '#555';
                if(val > 0.7 && val < 1.0) color = 'var(--neon-green)';
                if(val < 0) color = 'var(--neon-red)';
                bodyHTML += `<td style="color:${color}; font-weight:bold;">${val}</td>`;
            });
            bodyHTML += `</tr>`;
        });
        tbody.innerHTML = bodyHTML;
    } catch (e) { 
        tbody.innerHTML = `<tr><td style="color:var(--neon-red)">ERR: ${e.message}</td></tr>`; 
    }
}

// [6] Min Variance
async function runOptimization() {
    const tbody = document.getElementById('min-variance-weights');
    tbody.innerHTML = '<tr><td colspan="2" class="neon-blue">Running Scipy SLSQP AI Solver...</td></tr>';
    try {
        const res = await fetch(`${API_BASE_URL}/min-variance`);
        const data = await handleFetch(res);
        
        let volTarget = data.metrics.min_volatility * 100;
        let retTarget = data.metrics.expected_return * 100;
        document.getElementById('min-vol').innerText = volTarget.toFixed(2) + "%";
        document.getElementById('min-vol-ret').innerText = retTarget.toFixed(2) + "%";
        
        tbody.innerHTML = '';
        for (const [ticker, weight] of Object.entries(data.weights)) {
            tbody.innerHTML += `<tr><td style="color:var(--neon-blue)"><strong>${ticker}</strong></td><td style="color:var(--neon-green)">${(weight * 100).toFixed(2)}%</td></tr>`;
        }
    } catch (e) { 
        tbody.innerHTML = `<tr><td colspan="2" style="color:var(--neon-red)">ERR: ${e.message}</td></tr>`; 
    }
}

// [7] Frontier
async function loadFrontier() {
    try {
        const res = await fetch(`${API_BASE_URL}/frontier`);
        const data = await handleFetch(res);
        const scatterData = data.returns.map((ret, i) => ({ x: data.volatility[i] * 100, y: ret * 100 }));
        
        const ctx = document.getElementById('frontierChart').getContext('2d');
        if(frontierChartInstance) frontierChartInstance.destroy();
        
        Chart.defaults.color = '#fff';
        
        frontierChartInstance = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'AI Simulated Portfolios',
                    data: scatterData,
                    backgroundColor: '#00f3ff',
                    pointRadius: 4,
                    pointHoverRadius: 8,
                    pointHoverBackgroundColor: '#bc13fe'
                }]
            },
            options: {
                animation: { duration: 2000, easing: 'easeOutQuart' },
                scales: {
                    x: { title: { display: true, text: 'RISK (VOLATILITY %)', font: {size: 14} }, grid: {color: 'rgba(0, 243, 255, 0.1)'} },
                    y: { title: { display: true, text: 'EXPECTED RETURN (%)', font: {size: 14} }, grid: {color: 'rgba(0, 243, 255, 0.1)'} }
                }
            }
        });
    } catch (e) { 
        console.error("Frontier fetch failed:", e.message); 
        alert(`Failed to load Frontier: ${e.message}`);
    }
}Ī