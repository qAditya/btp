import os
import re

html_path = r"c:\Users\amsh9\OneDrive\Desktop\PV-Bifacial-Sim\frontend\index.html"
css_path = r"c:\Users\amsh9\OneDrive\Desktop\PV-Bifacial-Sim\frontend\styles.css"

with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Update Header to Hero
header_pattern = re.compile(r'<!-- Header -->\s*<header class="header">\s*<div class="container header-inner".*?</header>', re.DOTALL)
new_hero = """<!-- Header / Hero -->
  <header class="header hero">
    <div class="container hero-inner">
      <div class="hero-content animate-on-scroll">
        <div class="header-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>
        </div>
        <div>
          <h1 class="hero-title">Bifacial PV Optimizer</h1>
          <p class="subtitle hero-subtitle">24-hour bifacial simulation &middot; NASA POWER &middot; Advanced View-Factor Model</p>
        </div>
      </div>
      <div class="hero-visual animate-on-scroll">
        <div class="interactive-tilt-container">
            <img src="images/image2.png" alt="Bifacial View Factor Geometry" class="hero-image interactive-tilt">
            <div class="hero-image-glow"></div>
        </div>
      </div>
    </div>
  </header>"""

html = header_pattern.sub(new_hero, html)

# 2. Modify formulas images
images_pattern = re.compile(r'<!-- Equation & Geometry Images -->\s*<div class="formula-images">.*?</div>\s*</div>', re.DOTALL)
new_images = """<!-- Equation & Geometry Images -->
      <div class="formula-images" style="grid-template-columns: 1fr;">
        <div class="formula-img-card">
          <img src="images/image.png" alt="Bifacial panel radiation components diagram">
          <p class="caption">Bifacial Panel Radiation Components</p>
        </div>
      </div>"""
html = images_pattern.sub(new_images, html)

# 3. Add JS for interactive animations
js_addition = """    document.querySelectorAll('.animate-on-scroll').forEach(function(el) {
      mutObs.observe(el, { attributes: true });
    });

    // Interactive 3D tilt effect for hero image
    const tiltEl = document.querySelector('.interactive-tilt-container');
    const tiltImg = document.querySelector('.interactive-tilt');
    const glow = document.querySelector('.hero-image-glow');

    if(tiltEl) {
      tiltEl.addEventListener('mousemove', (e) => {
        const rect = tiltEl.getBoundingClientRect();
        const x = e.clientX - rect.left; // x position within the element.
        const y = e.clientY - rect.top;  // y position within the element.
        
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        const rotateX = ((y - centerY) / centerY) * -15; // Max 15deg
        const rotateY = ((x - centerX) / centerX) * 15;

        tiltImg.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`;
        
        if(glow) {
            glow.style.transform = `translate(${x - rect.width/2}px, ${y - rect.height/2}px)`;
            glow.style.opacity = '1';
        }
      });
      tiltEl.addEventListener('mouseleave', () => {
        tiltImg.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
        if(glow) glow.style.opacity = '0';
      });
    }

    // Modern Button hover effect positioning
    document.querySelectorAll('.btn').forEach(btn => {
      btn.addEventListener('mousemove', e => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        btn.style.setProperty('--x', `${x}px`);
        btn.style.setProperty('--y', `${y}px`);
      });
    });

  })();"""
html = html.replace("""    document.querySelectorAll('.animate-on-scroll').forEach(function(el) {
      mutObs.observe(el, { attributes: true });
    });
  })();""", js_addition)

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)


# Now read and modify styles.css
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

# Replace variables for a deeper, more premium dark mode
new_vars = """:root {
  --bg-deep: #020617;
  --bg: #09090b;
  --bg-surface: #18181b;
  --card: rgba(24, 24, 27, 0.45);
  --card-solid: #18181b;
  --glass-border: rgba(255, 255, 255, 0.05);
  --glass-highlight: rgba(255, 255, 255, 0.08);
  --glass-highlight-strong: rgba(255, 255, 255, 0.15);
  --text: #f8fafc;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --border: rgba(255, 255, 255, 0.08);
  --primary: #3b82f6;
  --primary-glow: rgba(59, 130, 246, 0.4);
  --primary-light: rgba(59, 130, 246, 0.15);
  --accent: #10b981;
  --accent-glow: rgba(16, 185, 129, 0.4);
  --cyan: #06b6d4;
  --cyan-glow: rgba(6, 182, 212, 0.3);
  --cyan-intense: #22d3ee;
  --amber: #f59e0b;
  --amber-glow: rgba(245, 158, 11, 0.3);
  --error: #ef4444;
  --radius: 20px;
  --radius-sm: 12px;
  --font: "Inter", system-ui, -apple-system, sans-serif;
  --ease: cubic-bezier(0.25, 1, 0.5, 1);
  --transition: all 0.4s var(--ease);
}"""
css = re.sub(r':root\s*\{.*?\}(?=\n\n|\n\*,\s*\*::before)', new_vars, css, flags=re.DOTALL)

# Add Hero styles & Interactive classes
hero_styles = """
/* ─── Header / Hero ─── */
.header.hero {
  position: relative;
  z-index: 10;
  background: transparent;
  padding: 60px 0 40px;
  border-bottom: 1px solid var(--glass-border);
  overflow: hidden;
}

.header.hero::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(circle at top, rgba(59, 130, 246, 0.08) 0%, transparent 70%);
  pointer-events: none;
}

.hero-inner {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: 40px;
}

.hero-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.hero-content .header-icon {
  width: 56px; height: 56px;
  border-radius: 16px;
  margin-bottom: 8px;
}

.hero-content .header-icon svg {
  width: 30px; height: 30px;
}

.hero-title {
  font-size: 3.2rem;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -1px;
  background: linear-gradient(135deg, #ffffff 0%, #a5b4fc 50%, #67e8f9 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 4px 30px rgba(6, 182, 212, 0.2);
}

.hero-subtitle {
  font-size: 1.1rem;
  color: var(--text-secondary);
  font-weight: 500;
  margin-top: 8px;
}

.hero-visual {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
}

.interactive-tilt-container {
  position: relative;
  border-radius: var(--radius);
  overflow: visible;
  padding: 2px;
}

.interactive-tilt {
  max-width: 100%;
  border-radius: var(--radius);
  border: 1px solid var(--glass-highlight-strong);
  box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5), 0 0 40px var(--cyan-glow);
  transform-style: preserve-3d;
  transition: transform 0.1s ease-out;
  cursor: crosshair;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);
}

.hero-image-glow {
  position: absolute;
  top: 50%; left: 50%;
  width: 200px; height: 200px;
  background: radial-gradient(circle, var(--cyan-intense) 0%, transparent 60%);
  border-radius: 50%;
  filter: blur(40px);
  pointer-events: none;
  opacity: 0;
  mix-blend-mode: screen;
  transition: opacity 0.3s var(--ease);
  z-index: -1;
}

@media (max-width: 768px) {
  .hero-inner {
    grid-template-columns: 1fr;
    text-align: center;
  }
  .hero-content {
    align-items: center;
  }
  .hero-title {
    font-size: 2.2rem;
  }
}
"""
css = re.sub(r'/\*\s*───\s*Header\s*───\s*\*/.*?(?=/\*\s*───\s*Layout)', hero_styles, css, flags=re.DOTALL)


# Update Aurora background for more prominence
aurora_styles = """/* ─── Animated Background ─── */
.aurora-bg {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  background: var(--bg-deep); /* Base dark */
}

.aurora-bg::before,
.aurora-bg::after,
.aurora-orb {
  content: '';
  position: absolute;
  border-radius: 50%;
  filter: blur(140px);
  opacity: 0.25;
}

.aurora-bg::before {
  width: 70vw; height: 70vh;
  background: var(--primary-glow);
  top: -20%; left: -10%;
  animation: aurora-drift 22s cubic-bezier(0.4, 0, 0.2, 1) infinite alternate;
}

.aurora-bg::after {
  width: 60vw; height: 60vh;
  background: var(--cyan-glow);
  bottom: -20%; right: -10%;
  animation: aurora-drift 18s cubic-bezier(0.4, 0, 0.2, 1) infinite alternate-reverse;
}

.aurora-orb {
  width: 50vw; height: 50vh;
  background: var(--accent-glow);
  top: 30%; left: 30%; 
  animation: aurora-drift 25s cubic-bezier(0.25, 1, 0.5, 1) infinite alternate;
}

@keyframes aurora-drift {
  0%   { transform: translate(0, 0) scale(1); }
  33%  { transform: translate(6vw, -5vh) scale(1.05); }
  66%  { transform: translate(-3vw, 4vh) scale(0.95); }
  100% { transform: translate(4vw, 2vh) scale(1.02); }
}"""
css = re.sub(r'/\*\s*───\s*Animated Background\s*───\s*\*/.*?(?=/\*\s*───\s*Header)', aurora_styles, css, flags=re.DOTALL)


# Update Cards for Glassmorphism & Hover Effects
card_styles = """/* ─── Glass Cards ─── */
.card {
  background: var(--card);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  padding: 32px;
  margin-top: 24px;
  box-shadow: 
    0 10px 30px -10px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255,255,255,0.05);
  transition: transform 0.4s var(--ease), box-shadow 0.4s var(--ease), border-color 0.4s var(--ease);
  position: relative;
  overflow: hidden;
}

.card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: radial-gradient(800px circle at var(--mouse-x, 50%) var(--mouse-y, -200%), rgba(255,255,255,0.03), transparent 40%);
  z-index: 1;
  pointer-events: none;
  transition: opacity 0.3s;
  opacity: 0;
}

.card:hover {
  border-color: var(--glass-highlight-strong);
  transform: translateY(-4px);
  box-shadow: 
    0 20px 40px -10px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(6, 182, 212, 0.1),
    inset 0 1px 0 rgba(255,255,255,0.1);
}

.card:hover::before {
  opacity: 1;
}

.card > * {
  position: relative;
  z-index: 2;
}

.card-header {
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-header h2 {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.5px;
  display: flex;
  align-items: center;
  gap: 10px;
}
"""
css = re.sub(r'/\*\s*───\s*Glass Cards\s*───\s*\*/.*?(?=h3\s*\{)', card_styles, css, flags=re.DOTALL)

# Update Inputs for focus glows and better appearance
input_styles = """/* ─── Form Elements ─── */
label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 14px;
}

.label-text {
  font-size: 10px;
  font-weight: 800;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1.2px;
}

input[type="text"],
input[type="date"],
input[type="number"],
select {
  height: 46px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 16px;
  font-size: 15px;
  font-family: var(--font);
  color: var(--text);
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  transition: var(--transition);
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
}

input[type="text"]::placeholder,
input[type="number"]::placeholder {
  color: rgba(161, 161, 170, 0.4);
}

input:focus, select:focus {
  outline: none;
  border-color: var(--cyan-intense);
  box-shadow: 0 0 0 1px var(--cyan-intense), 0 0 16px var(--cyan-glow), inset 0 2px 4px rgba(0,0,0,0.2);
  background: rgba(0, 0, 0, 0.6);
  transform: translateY(-1px);
}
"""
css = re.sub(r'/\*\s*───\s*Form Elements\s*───\s*\*/.*?(?=input:disabled)', input_styles, css, flags=re.DOTALL)

# Update Buttons for interactive cursor tracker
button_styles = """/* ─── Buttons ─── */
.actions {
  display: flex;
  gap: 16px;
  margin-top: 32px;
  flex-wrap: wrap;
}

.btn {
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: var(--radius-sm);
  padding: 14px 32px;
  font-size: 14px;
  font-weight: 800;
  font-family: var(--font);
  cursor: pointer;
  transition: transform 0.2s var(--ease), box-shadow 0.2s var(--ease);
  letter-spacing: 1px;
  text-transform: uppercase;
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* Mouse tracker glow effect */
.btn::before {
  content: '';
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  background: radial-gradient(circle at var(--x, 50%) var(--y, 50%), rgba(255,255,255,0.25) 0%, transparent 50%);
  opacity: 0;
  transition: opacity 0.3s;
}

.btn:hover::before { opacity: 1; }

.btn-primary {
  color: #fff;
  background: linear-gradient(135deg, var(--primary) 0%, #1d4ed8 100%);
  box-shadow: 0 4px 20px var(--primary-glow);
}
.btn-primary:hover {
  transform: scale(1.02) translateY(-2px);
  box-shadow: 0 8px 30px rgba(59, 130, 246, 0.5);
}
.btn-primary:active {
  transform: scale(0.98);
}

.btn-accent {
  color: #fff;
  background: linear-gradient(135deg, var(--cyan-intense) 0%, var(--primary) 100%);
  box-shadow: 0 4px 20px rgba(6, 182, 212, 0.4);
}

.btn-accent:hover {
  transform: scale(1.02) translateY(-2px);
  box-shadow: 0 8px 30px rgba(6, 182, 212, 0.6);
}
.btn-accent:active {
  transform: scale(0.98);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
  pointer-events: none;
}
"""
css = re.sub(r'/\*\s*───\s*Buttons\s*───\s*\*/.*?(?=/\*\s*───\s*Status\s*───\s*\*/)', button_styles, css, flags=re.DOTALL)


with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css)

print("Done making premium interactive modifications!")
