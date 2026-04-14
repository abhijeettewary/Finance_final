# backend/app.py
import urllib3
import requests
from flask import Flask, jsonify
from flask_cors import CORS
import yfinance as yf
import pandas as pd
import numpy as np
import scipy.optimize as sco
import threading

# --- SSL BYPASS ---
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
old_request = requests.Session.request
def new_request(self, method, url, **kwargs):
    kwargs['verify'] = False
    return old_request(self, method, url, **kwargs)
requests.Session.request = new_request

# --- FLASK SETUP ---
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Removed TATAMOTORS.NS to prevent 404 errors
TICKERS = [
    'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'BHARTIARTL.NS', 
    'INFY.NS', 'ITC.NS', 'SBIN.NS', 'LT.NS', 'BAJFINANCE.NS', 
    'HCLTECH.NS', 'ASIANPAINT.NS', 'AXISBANK.NS', 'MARUTI.NS', 'SUNPHARMA.NS', 
    'TITAN.NS', 'KOTAKBANK.NS', 'ULTRACEMCO.NS', 'TATASTEEL.NS', 
    'NTPC.NS', 'POWERGRID.NS', 'M&M.NS', 'BAJAJFINSV.NS', 'NESTLEIND.NS', 
    'WIPRO.NS', 'ONGC.NS', 'HINDUNILVR.NS', 'INDUSINDBK.NS', 'COALINDIA.NS', 
    'JSWSTEEL.NS', 'GRASIM.NS', 'HINDALCO.NS', 'TECHM.NS', 'ADANIPORTS.NS', 
    'ADANIENT.NS', 'CIPLA.NS', 'DRREDDY.NS', 'BRITANNIA.NS', 'APOLLOHOSP.NS', 
    '^NSEI'
]

market_data = None

# --- BACKGROUND DATA LOADER ---
def load_data_background():
    global market_data
    print("\n[SYSTEM] Fetching 2 years of data in the background... Please wait.")
    try:
        raw_data = yf.download(TICKERS, period="2y", interval="1mo", progress=False)
        
        if isinstance(raw_data.columns, pd.MultiIndex):
            if 'Adj Close' in raw_data.columns.levels[0]:
                prices = raw_data['Adj Close']
            else:
                prices = raw_data['Close']
        else:
            if 'Adj Close' in raw_data: prices = raw_data['Adj Close']
            elif 'Close' in raw_data: prices = raw_data['Close']
            else: prices = raw_data
            
        temp_data = prices.dropna(axis=1, how='all')
        
        if temp_data.empty:
            print("\n❌ ERROR: Yahoo Finance returned NO data. Check your internet connection or update yfinance.")
            market_data = None
        else:
            market_data = temp_data
            print("\n==================================================")
            print("✅ DATA IS 100% READY! CLICK 'EXECUTE QUERY' IN YOUR BROWSER NOW!")
            print("==================================================\n")
    except Exception as e:
        print(f"\n❌ Error fetching data: {e}\n")
        market_data = None

# --- API ENDPOINTS ---
@app.route('/api/prices', methods=['GET'])
def get_prices():
    if market_data is None: return jsonify({"error": "Loading"}), 503
    
    # FIX: Removed .tail(3) so it sends the entire 24-month history
    df_safe = market_data.fillna(0)
    df_safe.index = df_safe.index.strftime('%Y-%m-%d')
    
    return jsonify(df_safe.to_dict())

@app.route('/api/returns', methods=['GET'])
def get_returns():
    if market_data is None: return jsonify({"error": "Loading"}), 503
    returns = market_data.pct_change().dropna()
    mean_ret = returns.mean() * 12
    volatility = returns.std() * np.sqrt(12)
    results = {col.replace('.NS', ''): {"Return": round(mean_ret[col], 4), "Risk": round(volatility[col], 4)} for col in returns.columns if col != '^NSEI'}
    return jsonify(results)

@app.route('/api/returns-capm', methods=['GET'])
def get_returns_and_capm():
    if market_data is None: return jsonify({"error": "Loading"}), 503
    returns = market_data.pct_change().dropna()
    mean_returns = returns.mean() * 12
    cov_matrix = returns.cov() * 12
    if '^NSEI' not in returns.columns: return jsonify({"error": "Benchmark missing"}), 400
    market_var = returns['^NSEI'].var() * 12
    market_return = mean_returns['^NSEI']
    risk_free_rate = 0.065 
    results = {}
    for stock in returns.columns:
        if stock == '^NSEI': continue
        beta = cov_matrix.loc[stock, '^NSEI'] / market_var
        capm = risk_free_rate + beta * (market_return - risk_free_rate)
        results[stock.replace('.NS', '')] = {"Ann_Return": round(mean_returns[stock], 4), "Beta": round(beta, 4), "CAPM": round(capm, 4)}
    return jsonify(results)

@app.route('/api/correlation', methods=['GET'])
def get_correlation():
    if market_data is None: return jsonify({"error": "Loading"}), 503
    stock_data = market_data.drop(columns=['^NSEI'], errors='ignore')
    returns = stock_data.pct_change().dropna()
    return jsonify(returns.corr().to_dict())

@app.route('/api/min-variance', methods=['GET'])
def calculate_min_variance():
    if market_data is None: return jsonify({"error": "Loading"}), 503
    stock_data = market_data.drop(columns=['^NSEI'], errors='ignore')
    returns = stock_data.pct_change().dropna()
    cov_matrix = returns.cov() * 12
    num_assets = len(stock_data.columns)
    
    def portfolio_volatility(weights, cov_matrix): 
        return np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))
    
    constraints = ({'type': 'eq', 'fun': lambda x: np.sum(x) - 1})
    bounds = tuple((0, 1) for _ in range(num_assets))
    initial_guess = num_assets * [1. / num_assets,]
    
    optimal = sco.minimize(portfolio_volatility, initial_guess, args=(cov_matrix,), method='SLSQP', bounds=bounds, constraints=constraints)
    weights = optimal['x']
    ann_returns = returns.mean() * 12
    
    portfolio_results = {
        "metrics": {
            "min_volatility": round(optimal['fun'], 4), 
            "expected_return": round(np.sum(ann_returns * weights), 4)
        },
        "weights": {stock_data.columns[i].replace('.NS', ''): round(weights[i], 4) for i in range(num_assets)}
    }
    return jsonify(portfolio_results)

@app.route('/api/frontier', methods=['GET'])
def get_frontier():
    if market_data is None: return jsonify({"error": "Loading"}), 503
    stock_data = market_data.drop(columns=['^NSEI'], errors='ignore')
    returns = stock_data.pct_change().dropna()
    cov_matrix = returns.cov() * 12
    ann_returns = returns.mean() * 12
    
    num_portfolios = 500
    results_ret = []
    results_vol = []
    
    for _ in range(num_portfolios):
        weights = np.random.random(len(stock_data.columns))
        weights /= np.sum(weights)
        port_ret = np.sum(ann_returns * weights)
        port_vol = np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))
        results_ret.append(round(port_ret, 4))
        results_vol.append(round(port_vol, 4))
        
    return jsonify({"returns": results_ret, "volatility": results_vol})

if __name__ == '__main__':
    threading.Thread(target=load_data_background, daemon=True).start()
    app.run(host='127.0.0.1', port=5001, debug=True, use_reloader=False)