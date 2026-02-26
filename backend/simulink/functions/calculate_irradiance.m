function [G_effective, G_front, G_rear_effective, temp_derate] = calculate_irradiance( ...
        GHI, Tilt, Height_cm, Albedo, Bifaciality, Latitude, Longitude, HourUTC, DayOfYear, AmbientTempC, TempCoeffPerC, PanelAzimuth)
    % calculate_irradiance
    % Physics-based bifacial irradiance model with mild azimuth correction.
    %
    % Uses Liu-Jordan isotropic transposition,
    % Erbs (1982) diffuse-fraction decomposition, and NOCT temperature derating.
    % Azimuth correction: f_az = 0.85 + 0.15*max(0,cos(solarAz-panelAz))
    %
    % References:
    %   [1] Erbs, Klein, Duffie (1982) Solar Energy 28(4):293-302
    %   [2] Liu & Jordan (1960) Solar Energy 4(3):1-19
    %   [3] Raina, Vijay, Sinha (2022) Int. J. Energy Res. 46(2):1696-1711
    %   [4] Marion, MacAlpine, Deline (2017) IEEE PVSC-44
    %
    % Inputs:
    %   GHI            - Global Horizontal Irradiance (W/m^2 or Wh/m^2)
    %   Tilt           - Panel tilt angle in degrees
    %   Height_cm      - Panel ground clearance in cm
    %   Albedo         - Ground reflectivity (0-1)
    %   Bifaciality    - Rear-side contribution factor (0-1), default 0.7
    %   Latitude       - Site latitude in degrees (positive N)
    %   Longitude      - Site longitude in degrees (positive E)
    %   HourUTC        - Hour of day in UTC (fractional, 0-24)
    %   DayOfYear      - Day of year (1-366)
    %   AmbientTempC   - Ambient temperature in deg C (NaN to skip derating)
    %   TempCoeffPerC  - Power temperature coefficient (%/C), default -0.004
    %   PanelAzimuth   - Panel azimuth in degrees (0=N,180=S), default equator-facing
    %
    % Outputs:
    %   G_effective      - Total effective irradiance (W/m^2)
    %   G_front          - Front effective irradiance (W/m^2)
    %   G_rear_effective - Rear effective irradiance (W/m^2)
    %   temp_derate      - Temperature derating factor (0.7 - 1.15)

    if nargin < 5  || isempty(Bifaciality),   Bifaciality   = 0.7;    end
    if nargin < 6  || isempty(Latitude),      Latitude      = 28.47;   end
    if nargin < 7  || isempty(Longitude),     Longitude     = 77.50;   end
    if nargin < 8  || isempty(HourUTC),       HourUTC       = 12;      end
    if nargin < 9  || isempty(DayOfYear),     DayOfYear     = 172;     end
    if nargin < 10 || isempty(AmbientTempC),  AmbientTempC  = NaN;     end
    if nargin < 11 || isempty(TempCoeffPerC), TempCoeffPerC = -0.004;  end
    if nargin < 12 || isempty(PanelAzimuth)
        if Latitude >= 0, PanelAzimuth = 180; else, PanelAzimuth = 0; end
    end

    if GHI <= 0
        G_effective = 0; G_front = 0; G_rear_effective = 0; temp_derate = 1;
        return;
    end

    beta_rad = deg2rad(Tilt);

    % --- Solar position ---
    dec = 23.45 * sind(360/365 * (284 + DayOfYear));          % declination (deg)
    B   = deg2rad(360/365 * (DayOfYear - 81));
    eot = 9.87*sin(2*B) - 7.53*cos(B) - 1.5*sin(B);          % equation of time (min)
    solar_time = HourUTC + Longitude/15 + eot/60;
    ha  = (solar_time - 12) * 15;                              % hour angle (deg)

    cos_zenith = sind(Latitude)*sind(dec) + cosd(Latitude)*cosd(dec)*cosd(ha);

    if cos_zenith <= 0.01
        G_effective = 0; G_front = 0; G_rear_effective = 0; temp_derate = 1;
        return;
    end

    % --- Erbs decomposition: GHI -> beam + diffuse ---
    GSC   = 1361;
    ecc   = 1 + 0.033 * cosd(360 * DayOfYear / 365);
    G0h   = GSC * ecc * max(0, cos_zenith);
    kt    = min(max(GHI / max(G0h, 1e-6), 0), 1.5);

    if kt <= 0
        kd = 1.0;
    elseif kt <= 0.22
        kd = 1.0 - 0.09 * kt;
    elseif kt <= 0.80
        kd = 0.9511 - 0.1604*kt + 4.388*kt^2 - 16.638*kt^3 + 12.336*kt^4;
    else
        kd = 0.165;
    end

    GHI_diff = GHI * kd;
    GHI_beam = max(0, GHI - GHI_diff);
    DNI      = GHI_beam / max(cos_zenith, 0.01);

    % --- Front irradiance: equator-facing AOI + Liu-Jordan isotropic ---
    %  Equator-facing: effective latitude = lat - tilt (N-hem) or lat + tilt (S-hem)
    if Latitude >= 0
        eff_lat = Latitude - Tilt;
    else
        eff_lat = Latitude + Tilt;
    end
    cos_AOI = sind(dec)*sind(eff_lat) + cosd(dec)*cosd(eff_lat)*cosd(ha);

    beam_tilted       = DNI * max(0, cos_AOI);
    sky_vf            = (1 + cos(beta_rad)) / 2;
    gnd_vf            = (1 - cos(beta_rad)) / 2;
    diffuse_tilted    = GHI_diff * sky_vf;
    ground_refl_front = GHI * Albedo * gnd_vf;
    G_front_base      = max(0, beam_tilted + diffuse_tilted + ground_refl_front);

    % --- Azimuth correction: mild nudge on front term ---
    % Normalized so equator-facing (180 N-hem, 0 S-hem) gives f_az = 1.0 exactly.
    sin_zenith = sqrt(max(0, 1 - cos_zenith^2));
    if sin_zenith < 0.01
        sun_az = 180;
    else
        cos_az = (sind(dec) - cos_zenith * sind(Latitude)) / (sin_zenith * cosd(Latitude));
        cos_az = max(-1, min(1, cos_az));
        sun_az = acosd(cos_az);
        if ha > 0, sun_az = 360 - sun_az; end
    end
    if Latitude >= 0, ref_az = 180; else, ref_az = 0; end
    raw_panel = 0.85 + 0.15 * max(0, cos(deg2rad(sun_az - PanelAzimuth)));
    raw_ref   = 0.85 + 0.15 * max(0, cos(deg2rad(sun_az - ref_az)));
    f_az = max(0.85, min(1.15, raw_panel / raw_ref));
    G_front = G_front_base * f_az;

    % --- Rear irradiance: ground-reflected bifacial model ---
    rear_gnd_vf   = (1 + cos(beta_rad)) / 2;       % rear faces opposite direction
    height_m      = max(0, Height_cm) / 100;
    H_opt         = 1.0;   % optimal clearance (m), approx half collector width
    height_factor = (2 * height_m * H_opt) / (height_m^2 + H_opt^2);
    rear_raw      = GHI * Albedo * rear_gnd_vf * height_factor;
    G_rear_effective = max(0, rear_raw * Bifaciality);

    G_effective = max(0, G_front + G_rear_effective);

    % --- Temperature derating (NOCT model) ---
    temp_derate = 1.0;
    if ~isnan(AmbientTempC) && G_effective > 0
        NOCT       = 45;
        T_NOCT_AMB = 20;
        G_NOCT     = 800;
        T_cell     = AmbientTempC + (NOCT - T_NOCT_AMB) * G_effective / G_NOCT;
        temp_derate = 1 + TempCoeffPerC * (T_cell - 25);
        temp_derate = max(0.70, min(1.15, temp_derate));
    end
end
