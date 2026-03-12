import os
import re

html_path = r"c:\Users\amsh9\OneDrive\Desktop\PV-Bifacial-Sim\frontend\index.html"
css_path = r"c:\Users\amsh9\OneDrive\Desktop\PV-Bifacial-Sim\frontend\styles.css"

with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

# --- HTML Replacements ---

# 1. Remove Top Aurora Background
html = re.sub(r'<!-- Animated Aurora Background -->\s*<div class="aurora-bg".*?</div>', '', html, flags=re.DOTALL)

# 2. Re-write Header to Nav Bar
nav_header = """<!-- Top Navigation -->
  <nav class="top-nav">
    <div class="nav-left">
      <div class="nav-logo">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1z"/></svg>
      </div>
      <h1 class="nav-brand">Bifacial PV Optimizer</h1>
      <div class="nav-links">
        <a href="#" class="active">Dashboard</a>
        <a href="#">Configurations</a>
        <a href="#">Analytics</a>
        <a href="#">Presets</a>
      </div>
    </div>
    <div class="nav-right">
      <div class="search-bar">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>
        <input type="text" placeholder="Search systems...">
      </div>
      <button class="icon-btn" aria-label="Notifications">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zM8 1.918l-.797.161A4.002 4.002 0 0 0 4 6c0 .628-.134 2.197-.459 3.742-.16.767-.376 1.566-.663 2.258h10.244c-.287-.692-.502-1.49-.663-2.258C12.134 8.197 12 6.628 12 6a4.002 4.002 0 0 0-3.203-3.92L8 1.917zM14.22 12c.223.447.481.801.78 1H1c.299-.199.557-.553.78-1C2.68 10.2 3 6.88 3 6c0-2.42 1.72-4.44 4.005-4.901a1 1 0 1 1 1.99 0A5.002 5.002 0 0 1 13 6c0 .88.32 4.2 1.22 6z"/></svg>
      </button>
      <div class="avatar"><img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User"></div>
    </div>
  </nav>"""
html = re.sub(r'<!-- Header.*?</header>', nav_header, html, flags=re.DOTALL)


# 3. Main Dashboard Layout Structure
# We need to wrap existing sections into the new layout grid.
# Find `<main class="container">`
main_start_pattern = r'<main class="container">'
layout_top = """<main class="dashboard-wrap">
    <!-- Top KPIs -->
    <div class="dashboard-grid-top animate-on-scroll">
      <div class="feature-card">
        <span class="badge">PREMIUM INTELLIGENCE</span>
        <h2>Optimize for Maximum<br><span class="text-blue">Albedo Gain</span></h2>
        <p>Our AI-driven model calculates rear-side irradiance with 99.4% accuracy across diverse terrain types.</p>
      </div>
      <div class="kpi-stack">
        <div class="kpi-card">
          <div class="kpi-header"><span>Total Configurations</span><div class="kpi-icon blue"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M0 0h1v15h15v1H0V0Zm14.817 3.113a.5.5 0 0 1 .07.704l-4.5 5.5a.5.5 0 0 1-.74.037L7.06 6.767l-3.656 5.027a.5.5 0 0 1-.808-.588l4-5.5a.5.5 0 0 1 .758-.06l2.609 2.61 4.15-5.073a.5.5 0 0 1 .704-.07Z"/></svg></div></div>
          <div class="kpi-value">1,284</div>
          <div class="kpi-trend up">↗ +12.4% this month</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-header"><span>Best Energy Yield</span><div class="kpi-icon yellow"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M5.52.359A.5.5 0 0 1 6 0h4a.5.5 0 0 1 .474.658L8.694 6H12.5a.5.5 0 0 1 .395.807l-7 9a.5.5 0 0 1-.873-.454L6.823 9.5H3.5a.5.5 0 0 1-.48-.641l2.5-8.5z"/></svg></div></div>
          <div class="kpi-value">4.2 <span class="unit">MWh</span></div>
          <div class="kpi-trend up">↗ +5.2% vs baseline</div>
        </div>
        <div class="kpi-card highlighted">
          <div class="kpi-header"><span>Peak Rear Gain</span><div class="kpi-icon teal"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M11.5 6.027a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0zm-1.5 1.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm2.5-.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0zm-1.5 1.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm-6.5-3h1v1h1v1h-1v1h-1v-1h-1v-1h1v-1z"/><path d="M3.051 3.26a.5.5 0 0 1 .354-.613l1.932-.518a.5.5 0 0 1 .62.39c.655-.079 1.35-.117 2.043-.117.72 0 1.443.041 2.12.126a.5.5 0 0 1 .622-.399l1.932.518a.5.5 0 0 1 .306.729c.14.09.266.19.373.297.408.408.616.97.616 1.59 0 .72-.252 1.393-.687 1.954l-.451.583a5.002 5.002 0 0 1-.363.418L13.882 12A1.5 1.5 0 0 1 12.38 13.5H3.62a1.5 1.5 0 0 1-1.502-1.5l1.399-3.702a5.003 5.003 0 0 1-.362-.418l-.452-.583C2.251 6.738 2 6.065 2 5.345c0-.62.208-1.182.616-1.59.106-.107.233-.207.373-.298L3.05 3.26z"/></svg></div></div>
          <div class="kpi-value">24.8%</div>
          <div class="kpi-trend success">✓ Optimized state</div>
        </div>
      </div>
    </div>
    
    <!-- Config Grid -->
    <div class="dashboard-grid-mid">
"""
html = html.replace(main_start_pattern, layout_top)

# Update Location Card
location_pattern = re.compile(r'<!-- Location & Date -->\s*<section class="card animate-on-scroll">.*?</section>', re.DOTALL)
new_location = """<!-- Location & Date -->
      <section class="dash-card animate-on-scroll">
        <div class="card-header"><div class="icon-wrap blue"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg></div><h2>Location &amp; Date</h2></div>
        <div class="map-placeholder">
          <!-- We put map pin styling here -->
          <div class="map-pin"></div>
        </div>
        <div class="grid cols-2 mt-md">
          <label>
            <span class="label-text">Site Location (Lat/Lon or City)</span>
            <input id="locationInput" type="text" placeholder="e.g. Greater Noida">
          </label>
          <label>
            <span class="label-text">Analysis Date</span>
            <input id="startDateInput" type="date">
            <input id="endDateInput" type="date" disabled style="display:none;"> <!-- Hidden but kept for JS -->
          </label>
        </div>
      </section>"""
html = location_pattern.sub(new_location, html)


# Update Sweep Card
sweep_pattern = re.compile(r'<!-- Sweep Parameters -->\s*<section class="card animate-on-scroll">.*?</section>', re.DOTALL)
new_sweep = """<!-- Sweep Parameters -->
      <section class="dash-card animate-on-scroll">
        <div class="card-header"><div class="icon-wrap orange"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M6 11.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/></svg></div><h2>Sweep Parameters</h2></div>
        
        <div class="param-row">
          <div class="param-label-row">
            <span class="param-label">Hub Height (cm) Sweep</span>
          </div>
          <div class="slider-mock-container">
            <input id="heightMin" type="number" class="inline-input" placeholder="Min" value="50">
            <div class="slider-track"><div class="slider-knob"></div></div>
            <input id="heightMax" type="number" class="inline-input" placeholder="Max" value="450">
            <input id="heightStep" type="number" class="inline-input step-input" title="Step" placeholder="Step" value="50">
          </div>
        </div>

        <div class="param-row">
          <div class="param-label-row">
            <span class="param-label">System Tilt (&deg;) Sweep</span>
          </div>
          <div class="slider-mock-container">
            <input id="tiltMin" type="number" class="inline-input" placeholder="Min" value="10">
            <div class="slider-track"><div class="slider-knob" style="left: 30%"></div></div>
            <input id="tiltMax" type="number" class="inline-input" placeholder="Max" value="50">
            <input id="tiltStep" type="number" class="inline-input step-input" title="Step" placeholder="Step" value="10">
          </div>
        </div>

        <div class="param-row mt-md">
          <div class="param-label-row">
            <span class="param-label">Surface Albedo Settings</span>
          </div>
          <div class="grid cols-3 albedo-controls">
             <select id="albedoModeSelect" class="inline-input">
                <option value="single">Single Value</option>
                <option value="sweep">Sweep Range</option>
             </select>
             <select id="albedoPresetSelect" class="inline-input bg-blue-light">
                <option value="custom">Custom</option>
                <option value="0.20">Grass (0.20)</option>
                <option value="0.35">Sand (0.35)</option>
                <option value="0.82">Snow (0.82)</option>
             </select>
             <div id="albedoSingleLabel" class="slider-mock-container albedo-inputs">
                <input id="albedoSingle" type="number" class="inline-input" value="0.2" step="0.01">
             </div>
             <div id="albedoSweepGroup" style="display:none; gap:6px; flex: 2;">
                <input id="albedoMin" type="number" class="inline-input" value="0.2" step="0.01" placeholder="Min">
                <input id="albedoMax" type="number" class="inline-input" value="0.6" step="0.01" placeholder="Max">
                <input id="albedoStep" type="number" class="inline-input" value="0.1" step="0.01" placeholder="Step">
             </div>
          </div>
        </div>

        <div class="dev-controls mt-sm is-hidden">
          <label class="checkbox"><input id="useMatlabInput" type="checkbox"><span>Use MATLAB engine</span></label>
          <label class="checkbox"><input id="strictMatlabInput" type="checkbox" checked><span>Strict MATLAB (no JS fallback)</span></label>
        </div>

      </section>
    </div> <!-- end Config Grid -->
    
    <div class="main-action-area">
      <button id="fetchIrradianceBtn" type="button" style="display:none;">Fetch</button>
      <button id="runAnalysisBtn" type="button" class="btn-mega">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="margin-right: 8px;"><path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg>
        RUN FULL OPTIMIZATION SWEEP
      </button>
      <div id="statusText" class="status-msg">Ready</div>
    </div>
"""
html = sweep_pattern.sub(new_sweep, html)

# Modify Results section headers
models_pattern = re.compile(r'<!-- Model Formulas -->.*?</section>', re.DOTALL)
html = models_pattern.sub('', html)

irradiance_pattern = re.compile(r'<div class="card-header"><h2>☀️ Irradiance Data</h2></div>')
html = irradiance_pattern.sub('<div class="section-badge"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M12.5 8a.5.5 0 0 1-.5.5h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3a.5.5 0 0 1 1 0v3h3a.5.5 0 0 1 .5.5zM8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm0 1A8 8 0 1 1 8 0a8 8 0 0 1 0 16z"/></svg> Irradiance Data</div>', html)

analysis_pattern = re.compile(r'<div class="card-header"><h2>📊 Analysis Results</h2></div>')
html = analysis_pattern.sub('<div class="section-badge"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M0 0h1v15h15v1H0V0Zm14.817 3.113a.5.5 0 0 1 .07.704l-4.5 5.5a.5.5 0 0 1-.74.037L7.06 6.767l-3.656 5.027a.5.5 0 0 1-.808-.588l4-5.5a.5.5 0 0 1 .758-.06l2.609 2.61 4.15-5.073a.5.5 0 0 1 .704-.07Z"/></svg> Analysis Results</div>', html)

card_class_pattern = re.compile(r'<section id="(irradianceSection|analysisSection)" class="card is-hidden animate-on-scroll">')
html = card_class_pattern.sub(r'<section id="\1" class="is-hidden animate-on-scroll results-wrapper">', html)

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)
    
# --- CSS Overhaul ---
new_css = """@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap');

:root {
  --bg-main: #f8fafc;
  --bg-card: #ffffff;
  --text-main: #0f172a;
  --text-muted: #64748b;
  --text-light: #94a3b8;
  --border: #e2e8f0;
  --border-light: #f1f5f9;
  
  --primary: #3b82f6;
  --primary-hover: #2563eb;
  --primary-light: #eff6ff;
  --primary-bg: #bfdbfe;
  
  --success: #10b981;
  --success-bg: #d1fae5;
  --warning: #f59e0b;
  --warning-bg: #fef3c7;
  
  --radius-lg: 16px;
  --radius: 12px;
  --radius-sm: 8px;
  
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  
  --font-sans: 'Inter', sans-serif;
  --font-display: 'Space Grotesk', sans-serif;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-sans);
  background-color: var(--bg-main);
  color: var(--text-main);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* ─── Top Navigation ─── */
.top-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 32px;
  background-color: var(--bg-card);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0; z-index: 50;
}

.nav-left, .nav-right {
  display: flex;
  align-items: center;
  gap: 24px;
}

.nav-logo {
  width: 32px; height: 32px;
  background: var(--primary);
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
}
.nav-logo svg { width: 18px; }

.nav-brand {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  margin-right: 16px;
}

.nav-links { display: flex; gap: 20px; }
.nav-links a {
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  padding: 8px 0;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}
.nav-links a:hover { color: var(--text-main); }
.nav-links a.active { color: var(--primary); border-bottom-color: var(--primary); }

.search-bar {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-main);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 6px 16px;
}
.search-bar input {
  border: none; background: transparent; outline: none;
  font-size: 13px; width: 180px;
}
.search-bar svg { color: var(--text-muted); }

.icon-btn {
  background: none; border: none; cursor: pointer; color: var(--text-muted);
}
.avatar {
  width: 32px; height: 32px; border-radius: 50%; background: var(--bg-main); border: 2px solid var(--border); overflow: hidden;
}
.avatar img { width: 100%; height: 100%; }

/* ─── Layout ─── */
.dashboard-wrap {
  max-width: 1280px;
  margin: 0 auto;
  padding: 32px 24px;
}

.dashboard-grid-top {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 24px;
  margin-bottom: 24px;
}

.dashboard-grid-mid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 32px;
}

/* ─── Cards ─── */
.dash-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid #e7ecf3;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.02);
}

.card-header {
  display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
}
.card-header h2 {
  font-size: 15px; font-weight: 600; color: var(--text-main);
}
.icon-wrap {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.icon-wrap.blue { background: var(--primary-light); color: var(--primary); }
.icon-wrap.orange { background: var(--warning-bg); color: #d97706; }

/* ─── Features & KPIs ─── */
.feature-card {
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  border-radius: var(--radius-lg);
  padding: 40px;
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border);
}
/* Abstract bg pattern */
.feature-card::before {
  content:''; position: absolute; right: -5%; top: -20%; width: 60%; height: 140%;
  background-image: linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px);
  background-size: 40px 40px;
  transform: perspective(500px) rotateX(45deg) rotateZ(-30deg);
  opacity: 0.8;
}

.feature-card .badge {
  background: var(--primary-light); color: var(--primary);
  font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 12px;
  letter-spacing: 0.5px;
}
.feature-card h2 {
  font-family: var(--font-display);
  font-size: 32px; margin: 16px 0; color: #0f172a; line-height: 1.2;
}
.feature-card .text-blue { color: var(--primary); }
.feature-card p {
  font-size: 13px; color: var(--text-muted); max-width: 320px;
}

.kpi-stack { display: flex; flex-direction: column; gap: 16px; }
.kpi-card {
  background: var(--bg-card); border-radius: var(--radius-lg); padding: 16px 20px;
  border: 1px solid var(--border);
}
.kpi-card.highlighted {
  border-color: var(--primary); border-left: 4px solid var(--primary);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
}
.kpi-header {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12px; font-weight: 500; color: var(--text-muted); margin-bottom: 8px;
}
.kpi-value {
  font-size: 24px; font-weight: 700; color: var(--text-main); font-family: var(--font-display);
}
.kpi-value .unit { font-size: 14px; font-weight: 500; color: var(--text-muted); }
.kpi-trend { font-size: 11px; font-weight: 500; margin-top: 4px; }
.kpi-trend.up { color: var(--success); }
.kpi-trend.success { color: var(--success); }

.kpi-icon { width: 24px; height: 24px; border-radius: 6px; display:flex; align-items:center; justify-content:center; }
.kpi-icon.blue { background: var(--primary-light); color: var(--primary); }
.kpi-icon.yellow { background: var(--warning-bg); color: #d97706; }
.kpi-icon.teal { background: #ccfbf1; color: #0d9488; }

/* ─── Forms & Map ─── */
.map-placeholder {
  width: 100%; height: 160px;
  background-image: url('https://images.unsplash.com/photo-1508514177221-188b1c7dc41c?auto=format&fit=crop&q=80&w=800');
  background-size: cover; background-position: center;
  border-radius: var(--radius);
  position: relative;
}
.map-pin {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 32px; height: 32px; background: var(--primary-bg); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.map-pin::after {
  content: ''; width: 12px; height: 12px; background: var(--primary); border-radius: 50%;
}

.grid { display: grid; gap: 16px; }
.cols-2 { grid-template-columns: 1fr 1fr; }
.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
.mt-md { margin-top: 20px; }

label { display: flex; flex-direction: column; gap: 6px; }
.label-text { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }

input[type="text"], input[type="date"], input[type="number"], select {
  height: 40px; border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding: 0 12px; font-size: 13px; color: var(--text-main); font-family: var(--font-sans);
  outline: none; transition: border-color 0.2s;
}
input:focus, select:focus { border-color: var(--primary); }

/* ─── Sweep Controls (Slider mocks) ─── */
.param-row { margin-bottom: 24px; }
.param-label-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
.param-label { font-size: 12px; font-weight: 600; color: var(--text-main); }

.slider-mock-container {
  display: flex; align-items: center; gap: 12px;
}
.slider-track {
  flex: 1; height: 6px; background: var(--border-light); border-radius: 4px;
  position: relative;
}
.slider-knob {
  width: 14px; height: 14px; background: var(--primary); border-radius: 50%;
  position: absolute; top: 50%; left: 20%; transform: translate(-50%, -50%);
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.4);
}

.inline-input {
  width: 70px; text-align: center; height: 28px !important;
  background: white; border: 1px solid var(--border); color: var(--primary); font-weight: 600;
  border-radius: 4px !important;
}
.step-input { width: 50px; background: var(--border-light); color: var(--text-muted); }
.inline-input.bg-blue-light { background: var(--primary-light); border-color: var(--primary-bg); }

.albedo-controls select.inline-input { width: 100%; text-align: left; }
.albedo-inputs .inline-input { width: 100%; }

/* ─── Button ─── */
.main-action-area { text-align: center; margin: 40px 0; }
.btn-mega {
  background: linear-gradient(135deg, var(--primary) 0%, #1d4ed8 100%);
  color: white; border: none; border-radius: 24px;
  padding: 16px 40px; font-size: 14px; font-weight: 700; font-family: var(--font-display);
  cursor: pointer; display: inline-flex; align-items: center;
  box-shadow: 0 8px 16px rgba(59, 130, 246, 0.25); transition: transform 0.2s;
}
.btn-mega:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(59, 130, 246, 0.35); }

.status-msg { margin-top: 12px; font-size: 12px; color: var(--text-muted); }

/* ─── Results Section ─── */
.section-badge {
  display: inline-flex; align-items: center; gap: 8px;
  background: #e0f2fe; color: #0284c7; padding: 6px 12px; border-radius: 12px;
  font-size: 14px; font-weight: 600; font-family: var(--font-display);
  margin-bottom: 24px;
}

.results-wrapper {
  background: white; border: 1px solid var(--border); border-radius: var(--radius-lg);
  padding: 32px; margin-bottom: 32px;
}

/* Charts */
.chart-wrap { margin-top: 24px; }
.chart-wrap canvas { max-height: 300px; width: 100% !important; }

/* Table */
.table-wrap { margin-top: 24px; overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); }
table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; }
th { background: #f8fafc; padding: 12px 16px; font-weight: 600; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--border); }
td { padding: 14px 16px; border-bottom: 1px solid var(--border-light); color: var(--text-main); font-weight: 500; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: var(--bg-main); }

td:first-child { color: var(--text-muted); font-weight: 700; }
/* Fake a rank badge for rows */
td:first-child::before {
  content:''; display:inline-block; width:20px; height:20px; line-height:20px; text-align:center;
  background: var(--warning-bg); color: var(--warning); border-radius:50%; margin-right: 8px;
  font-size: 10px;
}

.is-hidden { display: none !important; }

/* Remove old components logic if they leak */
.summary, .csv-row { display: none; }
"""

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(new_css)

print("Light mode UI implemented successfully!")
