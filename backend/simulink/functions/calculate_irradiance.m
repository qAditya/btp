function [G_effective, G_front, G_rear_effective] = calculate_irradiance(GHI, Tilt, Height_cm, Albedo, Bifaciality)
    % calculate_irradiance
    % Effective bifacial irradiance model used by backend and Simulink support scripts.
    %
    % Inputs:
    %   GHI         - Front-side global horizontal irradiance (W/m^2)
    %   Tilt        - Panel tilt angle in degrees
    %   Height_cm   - Panel ground clearance in cm
    %   Albedo      - Ground reflectivity (0-1)
    %   Bifaciality - Rear-side contribution factor (0-1), optional default 0.7
    %
    % Outputs:
    %   G_effective      - Effective irradiance to PV model (W/m^2)
    %   G_front          - Front effective irradiance (W/m^2)
    %   G_rear_effective - Rear effective irradiance (W/m^2)

    if nargin < 5 || isempty(Bifaciality)
        Bifaciality = 0.7;
    end

    beta_rad = deg2rad(Tilt);
    front_tilt_factor = max(0.58, cos(beta_rad * 0.8));
    G_front = max(0, GHI * front_tilt_factor);

    view_factor = (1 - cos(beta_rad)) / 2;
    clamped_height_cm = max(0, Height_cm);
    elevation_gain = 1 + (min(clamped_height_cm, 120) / 900);
    elevation_saturation = 1 / (1 + (max(0, clamped_height_cm - 120) / 220));
    albedo_factor = sqrt(max(0, Albedo));

    G_rear_raw = GHI * albedo_factor * view_factor * elevation_gain * elevation_saturation;
    G_rear_effective = G_rear_raw * Bifaciality;
    G_rear_effective = max(0, G_rear_effective);

    G_effective = max(0, G_front + G_rear_effective);
end
