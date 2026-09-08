import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np
import os

OUT = os.path.join(os.path.dirname(__file__), "ieee_high_quality_images")
os.makedirs(OUT, exist_ok=True)

# IEEE style adjustments
plt.rcParams.update({
    'font.family': 'serif', 'font.serif': ['Times New Roman'],
    'font.size': 10, 'axes.labelsize': 11, 'axes.titlesize': 11,
    'legend.fontsize': 9, 'xtick.labelsize': 9, 'ytick.labelsize': 9,
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

# ===== FIGURE 1: I-V Characteristics =====
def gen_iv_curve():
    configs = [(30,450,0.3),(40,450,0.3),(20,350,0.3),(10,450,0.3)]
    labels = ["Rank 1", "Rank 9", "Rank 31", "Rank 45"]
    styles = ['-', '--', '-.', ':']
    colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728'] # Accessible colors
    
    fig, ax1 = plt.subplots(figsize=(5.5, 4.0))
    
    for i, (tilt, hCm, alb) in enumerate(configs):
        E, Pk, rg = run_config(tilt, hCm, alb)
        Geff = sum(calc_irradiance(ghi, tilt, hCm, alb, 0.7, LAT, LON, hr, DOY)[2] 
                   for hr, ghi in HOURS_GHI.items()) / len(HOURS_GHI)
        Voc = 64.5 * (1 - 0.004*(45-25)); Isc = (Geff/1000)*14*1.1
        V = np.linspace(0, Voc, 80)
        k_idx = i if i < 2 else i + 1 
        k = 10 + k_idx*1.5
        I_curve = Isc * (1 - ((V/Voc)**k))
        I_curve = np.maximum(I_curve, 0)
        
        ax1.plot(V, I_curve, linestyle=styles[i], color=colors[i], linewidth=2.0, label=labels[i])
        
    ax1.set_xlabel('Voltage (V)'); ax1.set_ylabel('Current (A)')
    ax1.legend(loc='lower left', framealpha=0.9, edgecolor='black', fontsize=9)
    ax1.set_title('I-V Characteristics (Top Configurations)')
    
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, "Fig_IV_Curve.png"), dpi=300)
    plt.close()
    print("[OK] Fig_IV_Curve.png")

# ===== FIGURE 1B: P-V Characteristics =====
def gen_pv_curve():
    configs = [(30,450,0.3),(40,450,0.3),(20,350,0.3),(10,450,0.3)]
    labels = ["Rank 1", "Rank 9", "Rank 31", "Rank 45"]
    styles = ['-', '--', '-.', ':']
    colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728'] # Accessible colors
    
    fig, ax2 = plt.subplots(figsize=(5.5, 4.0))
    
    for i, (tilt, hCm, alb) in enumerate(configs):
        E, Pk, rg = run_config(tilt, hCm, alb)
        Geff = sum(calc_irradiance(ghi, tilt, hCm, alb, 0.7, LAT, LON, hr, DOY)[2] 
                   for hr, ghi in HOURS_GHI.items()) / len(HOURS_GHI)
        Voc = 64.5 * (1 - 0.004*(45-25)); Isc = (Geff/1000)*14*1.1
        V = np.linspace(0, Voc, 80)
        k_idx = i if i < 2 else i + 1
        k = 10 + k_idx*1.5
        I_curve = Isc * (1 - ((V/Voc)**k))
        I_curve = np.maximum(I_curve, 0)
        P_curve = V * I_curve / 1000
        
        ax2.plot(V, P_curve, linestyle=styles[i], color=colors[i], linewidth=2.0, label=labels[i])
    
    ax2.set_xlabel('Voltage (V)'); ax2.set_ylabel('Power (kW)')
    ax2.legend(loc='upper left', framealpha=0.9, edgecolor='black', fontsize=9)
    ax2.set_title('P-V Characteristics (Top Configurations)')
    
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, "Fig_PV_Curve.png"), dpi=300)
    plt.close()
    print("[OK] Fig_PV_Curve.png")

# ===== FIGURE 2: Rear share vs Albedo =====
def gen_albedo_chart():
    # Ordered exactly as in Screenshot 1
    surfaces = [
        ('Very dirty\ngalvanized', 2.80),
        ('Dry asphalt', 4.50),
        ('Urban\nenvironment', 6.30),
        ('Grass', 7.00),
        ('Fresh grass', 9.00),
        ('Concrete', 10.40),
        ('Red tiles', 11.30),
        ('New galvanized\nsteel', 12.00),
        ('Wet snow', 20.00),
        ('Copper', 22.10),
        ('Fresh snow', 23.80),
        ('Aluminum', 24.72)
    ]
    names = [s[0] for s in surfaces]
    gains = [s[1] for s in surfaces]
    
    fig, ax = plt.subplots(figsize=(8, 3.5))
    bars = ax.bar(range(len(names)), gains, color='gray', edgecolor='black', linewidth=1.0)
    # Add value labels
    for bar, val in zip(bars, gains):
        ax.text(bar.get_x()+bar.get_width()/2, bar.get_height()+0.4,
                f'{val:.2f}%', ha='center', va='bottom', fontsize=8)
    
    ax.set_xticks(range(len(names))); ax.set_xticklabels(names, fontsize=7.5, rotation=30, ha='right')
    ax.set_ylabel('Rear Share of Effective Irradiance (%)')
    ax.set_xlabel('Surface Type')
    ax.set_ylim(0, max(gains)*1.15)
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, "Fig_Albedo_Sweep.png"), dpi=300)
    plt.close()
    print("[OK] Fig_Albedo_Sweep.png")

# ===== FIGURE 3: Rear share vs Height =====
def gen_height_chart():
    heights = [40, 60, 80, 100]
    gains = [4.47, 5.41, 6.09, 6.61]
    
    fig, ax = plt.subplots(figsize=(4.5, 3.5))
    bars = ax.bar(range(len(heights)), gains, color='gray', edgecolor='black', linewidth=1.0, width=0.5)
    for bar, val in zip(bars, gains):
        ax.text(bar.get_x()+bar.get_width()/2, bar.get_height()+0.1,
                f'{val:.2f}%', ha='center', va='bottom', fontsize=9)
    ax.set_xticks(range(len(heights))); ax.set_xticklabels([str(h) for h in heights])
    ax.set_ylabel('Rear Share of Effective Irradiance (%)')
    ax.set_xlabel('Panel Height from Ground (cm)')
    ax.set_ylim(0, max(gains)*1.15)
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, "Fig_Height_Sweep.png"), dpi=300)
    plt.close()
    print("[OK] Fig_Height_Sweep.png")

# ===== FIGURE 4: Rear share vs Tilt =====
def gen_tilt_chart():
    tilts = [10, 15, 20, 25, 30, 35, 40, 45, 50]
    gains = [7.24, 6.81, 6.55, 6.32, 6.17, 5.92, 5.81, 5.72, 5.65]
    
    fig, ax = plt.subplots(figsize=(5.5, 3.5))
    bars = ax.bar(range(len(tilts)), gains, color='gray', edgecolor='black', linewidth=1.0, width=0.6)
    for bar, val in zip(bars, gains):
        ax.text(bar.get_x()+bar.get_width()/2, bar.get_height()+0.1,
                f'{val:.2f}%', ha='center', va='bottom', fontsize=8)
    ax.set_xticks(range(len(tilts)))
    ax.set_xticklabels([f"{t}" for t in tilts])
    ax.set_ylabel('Rear Share of Effective Irradiance (%)')
    ax.set_xlabel('Panel Tilt Angle (degrees)')
    ax.set_ylim(0, max(gains)*1.15)
    plt.tight_layout()
    plt.savefig(os.path.join(OUT, "Fig_Tilt_Sweep.png"), dpi=300)
    plt.close()
    print("[OK] Fig_Tilt_Sweep.png")

if __name__ == '__main__':
    gen_iv_curve()
    gen_pv_curve()
    gen_albedo_chart()
    gen_height_chart()
    gen_tilt_chart()
    print(f"\\nHigh Quality IEEE figures saved to: {OUT}")
