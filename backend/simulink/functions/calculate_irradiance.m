function [G_effective, G_front, G_rear_effective] = calculate_irradiance( ...
        GHI, Tilt, Height_cm, Albedo, Bifaciality, Latitude, Longitude, HourUTC, DayOfYear, PanelWidthM)
    % calculate_irradiance
    % Physics-based bifacial irradiance model using BTP-2 (Yusufoglu et al.)
    % rear irradiance equation with geometric shadow view factor F_V.
    %
    % Uses Liu-Jordan isotropic transposition for front,
    % Erbs (1982) diffuse-fraction decomposition,
    % and a 2D shadow projection + numerical integration for F_V.
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
    %   PanelWidthM    - Module width along the slope in meters, default 1.134

    if nargin < 5  || isempty(Bifaciality),   Bifaciality   = 0.7;    end
    if nargin < 6  || isempty(Latitude),      Latitude      = 28.47;  end
    if nargin < 7  || isempty(Longitude),     Longitude     = 77.50;  end
    if nargin < 8  || isempty(HourUTC),       HourUTC       = 12;     end
    if nargin < 9  || isempty(DayOfYear),     DayOfYear     = 172;    end
    if nargin < 10 || isempty(PanelWidthM),   PanelWidthM   = 1.134;  end

    if GHI <= 0
        G_effective = 0; G_front = 0; G_rear_effective = 0;
        return;
    end

    beta_rad = deg2rad(Tilt);
    lat_rad  = deg2rad(Latitude);

    % --- Solar position ---
    dec = 23.45 * sind(360/365 * (284 + DayOfYear));          % declination (deg)
    B   = deg2rad(360/365 * (DayOfYear - 81));
    eot = 9.87*sin(2*B) - 7.53*cos(B) - 1.5*sin(B);          % equation of time (min)
    solar_time = HourUTC + Longitude/15 + eot/60;
    ha  = (solar_time - 12) * 15;                              % hour angle (deg)

    cos_zenith = sind(Latitude)*sind(dec) + cosd(Latitude)*cosd(dec)*cosd(ha);

    if cos_zenith <= 0.01
        G_effective = 0; G_front = 0; G_rear_effective = 0;
        return;
    end

    % --- Solar elevation & azimuth ---
    sun_elev_rad = asin(min(max(cos_zenith, 0), 1));
    dec_rad = deg2rad(dec);
    ha_rad  = deg2rad(ha);
    sin_Z   = sqrt(max(0, 1 - cos_zenith^2));
    if sin_Z < 1e-6
        sun_az_rad = pi;
    else
        % Standard azimuth from NORTH:
        %   cos(Az) = (sin(dec) - sin(elev)*sin(lat)) / (cos(elev)*cos(lat))
        cos_az = (sin(dec_rad) - cos_zenith * sin(lat_rad)) / (sin_Z * cos(lat_rad));
        sin_az = -cos(dec_rad) * sin(ha_rad) / sin_Z;
        sun_az_rad = atan2(sin_az, cos_az);
        if sun_az_rad < 0
            sun_az_rad = sun_az_rad + 2*pi;
        end
    end
    % Panel azimuth: equator-facing
    if Latitude >= 0
        panel_az_rad = pi;   % south
    else
        panel_az_rad = 0;    % north
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
    G_front           = max(0, beam_tilted + diffuse_tilted + ground_refl_front);

    % --- Rear irradiance: BTP-2 Equation 9 (Yusufoglu et al. 2014) ---
    %   E_rear = alpha*DHI*(1+cos(beta))/2 + alpha*(GHI-DHI)*((1+cos(beta))/2 - F_V)
    %   F_V = shadow view factor from 2D geometry + numerical integration
    height_m = Height_cm / 100;
    rear_vf  = (1 + cos(beta_rad)) / 2;

    F_V = compute_shadow_view_factor(beta_rad, height_m, PanelWidthM, ...
                                     sun_elev_rad, sun_az_rad, panel_az_rad);

    rear_diffuse_comp = Albedo * GHI_diff * rear_vf;
    rear_direct_comp  = Albedo * GHI_beam * max(0, rear_vf - F_V);
    G_rear_effective  = max(0, (rear_diffuse_comp + rear_direct_comp) * Bifaciality);

    G_effective = max(0, G_front + G_rear_effective);
end


function F_V = compute_shadow_view_factor(beta_rad, height_m, width_m, ...
                                          sun_elev_rad, sun_az_rad, panel_az_rad)
    % 2D shadow view factor using Simpson's rule numerical integration.
    SIMPSON_N = 200;

    % Solar profile angle
    az_diff     = sun_az_rad - panel_az_rad;
    cos_az_diff = cos(az_diff);

    if sun_elev_rad <= 0.001 || cos_az_diff <= 0.001
        F_V = 0;
        return;
    end

    profile_angle = atan(tan(sun_elev_rad) / cos_az_diff);
    if profile_angle <= 0.001
        F_V = 0;
        return;
    end

    tan_profile = tan(profile_angle);
    if tan_profile <= 0.001
        F_V = 0;
        return;
    end

    % Shadow edges (x positive = behind panel, toward rear)
    shadow_lower = height_m / tan_profile;
    shadow_upper = width_m * cos(beta_rad) + (height_m + width_m * sin(beta_rad)) / tan_profile;
    if shadow_upper <= shadow_lower + 1e-6
        F_V = 0;
        return;
    end

    % Module rear-surface centroid in 2D
    %   Lower edge at (0, h), upper edge at (W*cos(beta), h + W*sin(beta))
    mid_x = (width_m * cos(beta_rad)) / 2;
    mid_y = height_m + (width_m * sin(beta_rad)) / 2;

    % Rear-surface outward normal: (sin(beta), -cos(beta))
    %   Panel tangent = (cos(beta), sin(beta))
    %   Front normal (toward sun) = (-sin(beta), cos(beta))
    %   Rear normal (away from sun) = (sin(beta), -cos(beta))
    rear_nx = sin(beta_rad);
    rear_ny = -cos(beta_rad);

    % Simpson's rule
    n  = SIMPSON_N;
    dx = (shadow_upper - shadow_lower) / n;

    total = vf_integrand(shadow_lower, mid_x, mid_y, rear_nx, rear_ny) + ...
            vf_integrand(shadow_upper, mid_x, mid_y, rear_nx, rear_ny);
    for i = 1:(n-1)
        x_i = shadow_lower + i * dx;
        if mod(i, 2) == 0
            weight = 2;
        else
            weight = 4;
        end
        total = total + weight * vf_integrand(x_i, mid_x, mid_y, rear_nx, rear_ny);
    end
    f_shadow = (dx / 3) * total;

    % F_V = view factor from rear to shadow strip (larger → more shadow blocking)
    f_total = (1 + cos(beta_rad)) / 2;
    F_V = max(0, min(f_shadow, f_total));
end


function val = vf_integrand(x, mid_x, mid_y, rear_nx, rear_ny)
    vx = x - mid_x;
    vy = -mid_y;
    r  = sqrt(vx^2 + vy^2);
    if r < 1e-9
        val = 0;
        return;
    end
    cos_theta1 = (rear_nx * vx + rear_ny * vy) / r;
    cos_theta2 = mid_y / r;  % ground normal (0,1) dot (-vx,-vy)/r = mid_y/r
    if cos_theta1 <= 0 || cos_theta2 <= 0
        val = 0;
        return;
    end
    val = (cos_theta1 * cos_theta2) / (2 * r);
end
