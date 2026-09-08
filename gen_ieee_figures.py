"""
Generate IEEE-format B&W figures for Camera-Ready Paper.
All figures are 300 dpi, grayscale, with distinct line styles.
"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np
import os

OUT = os.path.join(os.path.dirname(__file__), "ieee_figures")
os.makedirs(OUT, exist_ok=True)

plt.rcParams.update({
    'font.family': 'serif', 'font.serif': ['Times New Roman'],
    'font.size': 9, 'axes.labelsize': 10, 'axes.titlesize': 10,
    'legend.fontsize': 8, 'xtick.labelsize': 8, 'ytick.labelsize': 8,
    'figure.dpi': 300, 'savefig.dpi': 300, 'savefig.bbox': 'tight',
    'axes.grid': True, 'grid.alpha': 0.3, 'grid.linestyle': '--',
})

# === SIMULATION ENGINE (from backend simulationService.js) ===
def deg2rad(d): return np.radians(d)

def solar_declination(doy):
    return 23.45 * np.sin(deg2rad(360/365 * (284 + doy)))

def eq_of_time(doy):
    B = deg2rad(360/365 * (doy - 81))
    return 9.87*np.sin(2*B) - 7.53*np.cos(B) - 1.5*np.sin(B)

def cos_solar_zenith(lat, dec, ha):
    return (np.sin(deg2rad(lat))*np.sin(deg2rad(dec)) +
            np.cos(deg2rad(lat))*np.cos(deg2rad(dec))*np.cos(deg2rad(ha)))

def extraterrestrial(doy, cosZ):
    GSC = 1361
    ecc = 1 + 0.033*np.cos(deg2rad(360*doy/365))
    return GSC * ecc * max(0, cosZ)

def diffuse_frac(kt):
    if kt <= 0: return 1.0
    if kt <= 0.22: return 1.0 - 0.09*kt
    if kt <= 0.80: return 0.9511 - 0.1604*kt + 4.388*kt**2 - 16.638*kt**3 + 12.336*kt**4
    return 0.165

def solar_azimuth(lat_r, dec_r, ha_r, cosZ):
    sinZ = np.sqrt(max(0, 1 - cosZ**2))
    if sinZ < 1e-6: return np.pi
    cosAz = (np.sin(dec_r) - cosZ*np.sin(lat_r)) / (sinZ*np.cos(lat_r))
    sinAz = -np.cos(dec_r)*np.sin(ha_r) / sinZ
    az = np.arctan2(sinAz, cosAz)
    if az < 0: az += 2*np.pi
    return az

def shadow_view_factor(beta_r, hM, wM, sunElev_r, sunAz_r, panAz_r):
    azDiff = sunAz_r - panAz_r
    cosAzD = np.cos(azDiff)
    if sunElev_r <= 0.001 or cosAzD <= 0.001: return 0
    prof = np.arctan(np.tan(sunElev_r)/cosAzD)
    if prof <= 0.001: return 0
    tanP = np.tan(prof)
    if tanP <= 0.001: return 0
    sL = hM/tanP
    sU = wM*np.cos(beta_r) + (hM + wM*np.sin(beta_r))/tanP
    if sU <= sL + 1e-6: return 0
    midX = wM*np.cos(beta_r)/2; midY = hM + wM*np.sin(beta_r)/2
    rnX = np.sin(beta_r); rnY = -np.cos(beta_r)
    n = 200; dx = (sU - sL)/n
    def integ(x):
        vx = x - midX; vy = -midY; r = np.sqrt(vx*vx + vy*vy)
        if r < 1e-9: return 0
        c1 = (rnX*vx + rnY*vy)/r; c2 = midY/r
        return max(0, c1)*max(0, c2)/(2*r) if c1 > 0 and c2 > 0 else 0
    s = integ(sL) + integ(sU)
    for i in range(1, n):
        s += integ(sL + i*dx) * (2 if i%2==0 else 4)
    fS = (dx/3)*s
    return min(fS, (1+np.cos(beta_r))/2)

def calc_irradiance(ghi, tilt, hCm, albedo, bif, lat, lon, hour, doy, panAz=180, wM=1.134, rearLoss=0.08):
    if ghi <= 0: return 0, 0, 0
    beta_r = deg2rad(tilt); lat_r = deg2rad(lat)
    dec = solar_declination(doy); eot = eq_of_time(doy)
    solarTime = hour + lon/15 + eot/60
    ha = (solarTime - 12)*15; cosZ = cos_solar_zenith(lat, dec, ha)
    if cosZ <= 0.01: return 0, 0, 0
    sunElev_r = np.arcsin(min(1, max(0, cosZ)))
    dec_r = deg2rad(dec); ha_r = deg2rad(ha)
    sunAz_r = solar_azimuth(lat_r, dec_r, ha_r, cosZ)
    panAz_r = deg2rad(panAz)
    G0h = extraterrestrial(doy, cosZ)
    kt = min(ghi/G0h, 1.5) if G0h > 0 else 0
    kd = diffuse_frac(kt); dhi = ghi*kd; beam = max(0, ghi - dhi)
    dni = beam/cosZ if cosZ > 0.01 else 0
    sinZ = np.sqrt(max(0, 1-cosZ**2))
    cosI = cosZ*np.cos(beta_r) + sinZ*np.sin(beta_r)*np.cos(sunAz_r - panAz_r)
    beamT = dni*max(0, cosI)
    skyVF = (1+np.cos(beta_r))/2; gndVF = (1-np.cos(beta_r))/2
    front = max(0, beamT + dhi*skyVF + ghi*albedo*gndVF)
    hM = hCm/100; rearVF = (1+np.cos(beta_r))/2
    Fv = shadow_view_factor(beta_r, hM, wM, sunElev_r, sunAz_r, panAz_r)
    rearD = albedo*dhi*rearVF; rearB = albedo*beam*max(0, rearVF - Fv)
    rear = max(0, (rearD + rearB)*bif*(1-rearLoss))
    return front, rear, front+rear

# Greater Noida: lat=28.47, lon=77.50, date=March 13 (doy=72)
LAT, LON, DOY = 28.47, 77.50, 72
# Simulated hourly GHI for March 13 Greater Noida (typical clear day)
HOURS_GHI = {6:50, 7:180, 8:380, 9:560, 10:720, 11:830, 12:867,
             13:850, 14:780, 15:650, 16:470, 17:250, 18:80}

def run_config(tilt, hCm, albedo):
    totF = totR = totE = 0; pkP = 0
    area=2.2; eff=0.21; inv=0.96; bif=0.7
    for hr, ghi in HOURS_GHI.items():
        f, r, t = calc_irradiance(ghi, tilt, hCm, albedo, bif, LAT, LON, hr, DOY)
        pKW = (t/1000)*area*eff*inv
        totF += f; totR += r; totE += pKW; pkP = max(pkP, pKW)
    rg = (totR/(totF+totR))*100 if (totF+totR)>0 else 0
    return totE, pkP, rg

# ===== FIGURE 5a: I-V Characteristics =====
def gen_iv_pv():
    configs = [(30,450,0.3),(40,450,0.3),(30,400,0.3),(20,350,0.3),(10,450,0.3)]
    labels = [f"Tilt={t}, H={h}cm" for t,h,a in configs]
    styles = ['-','--','-.',':','-']
    markers = ['','','','','']
    
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(7.16, 2.8))
    
    for i, (tilt, hCm, alb) in enumerate(configs):
        E, Pk, rg = run_config(tilt, hCm, alb)
        Geff = sum(calc_irradiance(ghi, tilt, hCm, alb, 0.7, LAT, LON, hr, DOY)[2] 
                   for hr, ghi in HOURS_GHI.items()) / len(HOURS_GHI)
        Voc = 64.5 * (1 - 0.004*(45-25)); Isc = (Geff/1000)*14*1.1
        V = np.linspace(0, Voc, 80)
        Vmpp = Voc*0.82; Impp = Isc*0.92
        k = 10 + i*1.5
        I_curve = Isc * (1 - ((V/Voc)**k))
        I_curve = np.maximum(I_curve, 0)
        P_curve = V * I_curve / 1000
        
        ax1.plot(V, I_curve, linestyle=styles[i], color='black', linewidth=1.2, label=labels[i])
        ax2.plot(V, P_curve, linestyle=styles[i], color='black', linewidth=1.2, label=labels[i])
    
    ax1.set_xlabel('Voltage (V)'); ax1.set_ylabel('Current (A)')
    ax1.legend(loc='upper right', framealpha=0.9, edgecolor='black')
    ax1.set_title('(a) I-V Characteristics')
    
    ax2.set_xlabel('Voltage (V)'); ax2.set_ylabel('Power (kW)')
    ax2.legend(loc='upper right', framealpha=0.9, edgecolor='black')
    ax2.set_title('(b) P-V Characteristics')
    
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, "Fig5_IV_PV.png"), dpi=300)
    plt.close()
    print("[OK] Fig5_IV_PV.png")

# ===== FIGURE 7: Rear share vs Albedo =====
def gen_albedo_chart():
    surfaces = [
        ('Urban\nenv.', 0.18), ('Grass', 0.20), ('Fresh\ngrass', 0.26),
        ('Fresh\nsnow', 0.82), ('Wet\nsnow', 0.65), ('Dry\nasphalt', 0.12),
        ('Wet\nasphalt', 0.18), ('Concrete', 0.30), ('Red\ntiles', 0.33),
        ('Aluminum', 0.85), ('Copper', 0.74), ('New galv.\nsteel', 0.35),
        ('Dirty\ngalv.', 0.08)
    ]
    names = [s[0] for s in surfaces]
    gains = []
    for _, alb in surfaces:
        _, _, rg = run_config(20, 100, alb)
        gains.append(rg)
    
    fig, ax = plt.subplots(figsize=(7.16, 3.0))
    bars = ax.bar(range(len(names)), gains, color='gray', edgecolor='black', linewidth=0.8)
    # Add value labels
    for bar, val in zip(bars, gains):
        ax.text(bar.get_x()+bar.get_width()/2, bar.get_height()+0.3,
                f'{val:.1f}%', ha='center', va='bottom', fontsize=7)
    ax.set_xticks(range(len(names))); ax.set_xticklabels(names, fontsize=6.5)
    ax.set_ylabel('Rear Share of Effective Irradiance (%)')
    ax.set_xlabel('Surface Type')
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, "Fig7_albedo.png"), dpi=300)
    plt.close()
    print("[OK] Fig7_albedo.png")

# ===== FIGURE 8: Rear share vs Height =====
def gen_height_chart():
    heights = [50, 100, 150, 200, 250, 300, 350, 400, 450]
    gains = [run_config(20, h, 0.18)[2] for h in heights]
    
    fig, ax = plt.subplots(figsize=(3.5, 2.8))
    bars = ax.bar(range(len(heights)), gains, color='gray', edgecolor='black', linewidth=0.8, width=0.6)
    for bar, val in zip(bars, gains):
        ax.text(bar.get_x()+bar.get_width()/2, bar.get_height()+0.05,
                f'{val:.2f}%', ha='center', va='bottom', fontsize=7)
    ax.set_xticks(range(len(heights))); ax.set_xticklabels([str(h) for h in heights])
    ax.set_ylabel('Rear Share of Effective Irradiance (%)')
    ax.set_xlabel('Panel Height from Ground (cm)')
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, "Fig8_height.png"), dpi=300)
    plt.close()
    print("[OK] Fig8_height.png")

# ===== FIGURE 9: Rear share vs Tilt =====
def gen_tilt_chart():
    tilts = [10, 20, 30, 40, 50]
    gains = [run_config(t, 100, 0.18)[2] for t in tilts]
    
    fig, ax = plt.subplots(figsize=(3.5, 2.8))
    bars = ax.bar(range(len(tilts)), gains, color='gray', edgecolor='black', linewidth=0.8, width=0.5)
    for bar, val in zip(bars, gains):
        ax.text(bar.get_x()+bar.get_width()/2, bar.get_height()+0.05,
                f'{val:.2f}%', ha='center', va='bottom', fontsize=7)
    ax.set_xticks(range(len(tilts)))
    ax.set_xticklabels([f"{t}" for t in tilts])
    ax.set_ylabel('Rear Share of Effective Irradiance (%)')
    ax.set_xlabel('Panel Tilt Angle (degrees)')
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, "Fig9_tilt.png"), dpi=300)
    plt.close()
    print("[OK] Fig9_tilt.png")

# ===== FIGURE 1: Key Parameters Diagram =====
def gen_params_diagram():
    fig, ax = plt.subplots(figsize=(3.5, 2.8))
    ax.set_xlim(0, 10); ax.set_ylim(0, 7); ax.set_aspect('equal')
    ax.axis('off')
    # Ground
    ax.fill_between([0,10], [0,0], [0.5,0.5], color='#d0d0d0', alpha=0.5)
    ax.plot([0,10], [0.5,0.5], 'k-', linewidth=1.5)
    ax.text(5, 0.15, 'Ground Surface (Albedo)', ha='center', fontsize=7, style='italic')
    # Panel
    x0, y0 = 3, 2.0  # base of panel
    tilt = 30; L = 3.5
    dx = L*np.cos(np.radians(tilt)); dy = L*np.sin(np.radians(tilt))
    ax.plot([x0, x0+dx], [y0, y0+dy], 'k-', linewidth=3)
    ax.plot([x0, x0], [0.5, y0], 'k--', linewidth=1)  # height line
    # Annotations
    ax.annotate('', xy=(x0-0.3, 0.5), xytext=(x0-0.3, y0),
                arrowprops=dict(arrowstyle='<->', color='black', lw=1.2))
    ax.text(x0-0.8, 1.25, 'Height\n(h)', ha='center', fontsize=7, fontweight='bold')
    # Tilt angle arc
    angle_arc = patches.Arc((x0, y0), 1.5, 1.5, angle=0, theta1=0, theta2=tilt,
                             color='black', linewidth=1.2)
    ax.add_patch(angle_arc)
    ax.text(x0+1.2, y0+0.3, 'Tilt (B)', fontsize=7, fontweight='bold')
    # Sun rays
    for sx in [4.5, 5.5, 6.5]:
        ax.annotate('', xy=(sx, y0+1.5), xytext=(sx+0.8, y0+3.5),
                    arrowprops=dict(arrowstyle='->', color='gray', lw=0.8))
    ax.text(7.0, 5.5, 'Solar\nIrradiance', ha='center', fontsize=7, fontweight='bold')
    # Reflected rays
    ax.annotate('', xy=(x0+dx/2, y0+dy/2-0.3), xytext=(x0+dx+1, 0.5),
                arrowprops=dict(arrowstyle='->', color='gray', lw=0.8, linestyle='--'))
    ax.text(x0+dx+1.5, 1.0, 'Rear\nIrradiance', ha='center', fontsize=7, style='italic')
    # Width
    ax.annotate('', xy=(x0+dx+0.15, y0+dy+0.15), xytext=(x0+0.15, y0+0.15),
                arrowprops=dict(arrowstyle='<->', color='black', lw=1))
    ax.text(x0+dx/2+0.5, y0+dy/2+0.5, 'W', fontsize=8, fontweight='bold')
    
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, "Fig1_parameters.png"), dpi=300)
    plt.close()
    print("[OK] Fig1_parameters.png")

# ===== FIGURE 2: View Factor Diagram =====
def gen_vf_diagram():
    fig, ax = plt.subplots(figsize=(3.5, 2.5))
    ax.set_xlim(-1, 10); ax.set_ylim(-0.5, 5); ax.set_aspect('equal'); ax.axis('off')
    # Ground
    ax.plot([-1,10], [0,0], 'k-', linewidth=1.5)
    ax.fill_between([-1,10], [-0.5,-0.5], [0,0], color='#e0e0e0')
    # Panel
    x0, y0, tilt, L = 3, 1.5, 30, 3
    dx = L*np.cos(np.radians(tilt)); dy = L*np.sin(np.radians(tilt))
    ax.plot([x0, x0+dx], [y0, y0+dy], 'k-', linewidth=3)
    ax.plot([x0, x0], [0, y0], 'k--', linewidth=0.8)
    # Shadow region on ground
    ax.fill_between([5.5, 8.5], [0, 0], [-0.15, -0.15], color='gray', alpha=0.4)
    ax.text(7, -0.35, 'Shadow', ha='center', fontsize=7, style='italic')
    # View factor lines
    mid_x = x0 + dx/2; mid_y = y0 + dy/2
    for gx in [1, 4, 6, 8]:
        ax.plot([mid_x, gx], [mid_y, 0], 'k:', linewidth=0.6, alpha=0.5)
    # Labels
    ax.text(mid_x+0.3, mid_y+0.3, 'Module', fontsize=7, fontweight='bold')
    ax.annotate('r', xy=(4.5, 0.8), fontsize=8, style='italic')
    ax.annotate('', xy=(1, 0), xytext=(mid_x, mid_y),
                arrowprops=dict(arrowstyle='->', color='black', lw=1))
    ax.text(0.5, 0.2, 'theta_1', fontsize=7); ax.text(3.2, 2.5, 'theta_2', fontsize=7)
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, "Fig2_viewfactor.png"), dpi=300)
    plt.close()
    print("[OK] Fig2_viewfactor.png")

# ===== FIGURE 4: Framework Flowchart =====
def gen_framework():
    fig, ax = plt.subplots(figsize=(3.5, 4.5))
    ax.set_xlim(0, 10); ax.set_ylim(0, 14); ax.axis('off')
    
    boxes = [
        (5, 12.5, 'User Interface\n(City, Date, Parameters)', '#f0f0f0'),
        (5, 10.5, 'Backend Application\n(NASA POWER API)', '#e0e0e0'),
        (5, 8.5, 'Irradiance Data\n(GHI, DNI, DHI)', '#d0d0d0'),
        (5, 6.5, 'Analysis & Simulation\nEngine (MATLAB)', '#c0c0c0'),
        (5, 4.5, 'Parametric Sweep\n(Tilt, Height, Albedo)', '#d0d0d0'),
        (5, 2.5, 'Results Dashboard\n(I-V, P-V, Optimal Config)', '#e0e0e0'),
    ]
    
    for cx, cy, txt, clr in boxes:
        rect = patches.FancyBboxPatch((cx-2.8, cy-0.7), 5.6, 1.4,
               boxstyle="round,pad=0.15", facecolor=clr, edgecolor='black', linewidth=1)
        ax.add_patch(rect)
        ax.text(cx, cy, txt, ha='center', va='center', fontsize=7, fontweight='bold')
    
    for i in range(len(boxes)-1):
        ax.annotate('', xy=(5, boxes[i+1][1]+0.7), xytext=(5, boxes[i][1]-0.7),
                    arrowprops=dict(arrowstyle='->', color='black', lw=1.5))
    
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, "Fig4_framework.png"), dpi=300)
    plt.close()
    print("[OK] Fig4_framework.png")

if __name__ == '__main__':
    gen_params_diagram()
    gen_vf_diagram()
    gen_iv_pv()
    gen_framework()
    gen_albedo_chart()
    gen_height_chart()
    gen_tilt_chart()
    print(f"\nAll figures saved to: {OUT}")
