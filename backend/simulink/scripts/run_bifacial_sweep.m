function run_bifacial_sweep(configPath, outputPath)
    % run_bifacial_sweep
    % MATLAB sweep runner invoked by backend.
    %
    % Usage:
    %   run_bifacial_sweep('C:\path\config.json', 'C:\path\output.json')

    if nargin < 2
        error('run_bifacial_sweep requires configPath and outputPath.');
    end

    if ~isfile(configPath)
        error('Config file not found: %s', configPath);
    end

    rawConfig = fileread(configPath);
    cfg = jsondecode(rawConfig);

    if ~isfield(cfg, 'irradiance') || ~isfield(cfg.irradiance, 'ghi')
        error('Config must contain irradiance.ghi array.');
    end

    if ~isfield(cfg, 'irradiance') || ~isfield(cfg.irradiance, 'time')
        error('Config must contain irradiance.time array.');
    end

    ghi = cfg.irradiance.ghi(:)';
    time = cfg.irradiance.time;

    if numel(ghi) ~= numel(time)
        error('irradiance.ghi and irradiance.time must have equal length.');
    end

    tempC = [];
    if isfield(cfg.irradiance, 'tempC')
        tempC = cfg.irradiance.tempC(:)';
    end

    % Location (needed for solar position)
    lat = 28.47; lon = 77.50;   % defaults
    if isfield(cfg, 'location')
        if isfield(cfg.location, 'latitude'),  lat = cfg.location.latitude;  end
        if isfield(cfg.location, 'longitude'), lon = cfg.location.longitude; end
    end

    panel = cfg.panelConfig;
    areaM2 = panel.areaM2;
    frontEfficiency = panel.frontEfficiency;
    inverterEfficiency = panel.inverterEfficiency;
    bifaciality = panel.bifaciality;
    if isfield(panel, 'widthM')
        panelWidthM = panel.widthM;
    else
        panelWidthM = 1.134;
    end
    if isfield(panel, 'azimuthDeg')
        panelAzimuthDeg = panel.azimuthDeg;
    else
        if lat >= 0
            panelAzimuthDeg = 180;
        else
            panelAzimuthDeg = 0;
        end
    end
    if isfield(panel, 'rearStructureLossFraction')
        rearStructureLossFraction = panel.rearStructureLossFraction;
    else
        rearStructureLossFraction = 0.08;
    end
    if isfield(panel, 'noctC')
        noctC = panel.noctC;
    else
        noctC = 45;
    end
    if isfield(panel, 'temperatureCoeffPerC')
        temperatureCoeffPerC = panel.temperatureCoeffPerC;
    else
        temperatureCoeffPerC = -0.004;
    end

    heightValues = cfg.ranges.heightCm(:)';
    tiltValues = cfg.ranges.tiltDeg(:)';
    albedoValues = cfg.ranges.albedo(:)';

    results = struct([]);
    idx = 0;

    for h = heightValues
        for t = tiltValues
            for a = albedoValues
                idx = idx + 1;
                [metrics, hourlySeries] = evaluate_config(ghi, time, h, t, a, ...
                    areaM2, frontEfficiency, inverterEfficiency, bifaciality, lat, lon, panelWidthM, panelAzimuthDeg, rearStructureLossFraction, tempC, noctC, temperatureCoeffPerC);
                results(idx).configuration = struct('heightCm', h, 'tiltDeg', t, 'albedo', a); %#ok<AGROW>
                results(idx).metrics = metrics; %#ok<AGROW>
                results(idx).hourlySeries = hourlySeries; %#ok<AGROW>
            end
        end
    end

    if isempty(results)
        error('No configuration combinations were generated.');
    end

    energy = arrayfun(@(x) x.metrics.totalEnergyKWh, results);
    peak = arrayfun(@(x) x.metrics.peakPowerKW, results);
    rear = arrayfun(@(x) x.metrics.rearGainPercent, results);
    score = [-energy(:), -peak(:), -rear(:)];
    [~, order] = sortrows(score, [1 2 3]);
    sorted = results(order);

    topN = min(10, numel(sorted));
    top = sorted(1:topN);
    best = sorted(1);

    output = struct();
    output.source = 'matlab-bifacial-sweep';
    output.location = cfg.location;
    output.dateRange = cfg.dateRange;
    output.irradianceSource = cfg.irradianceSource;
    output.panelModel = panel;
    output.ranges = cfg.ranges;
    output.combinationsTested = numel(sorted);
    output.optimalConfiguration = map_summary(best, 1, true);
    output.topConfigurations = arrayfun(@(i) map_summary(top(i), i, false), 1:topN, 'UniformOutput', false);
    output.chartData = arrayfun(@(i) map_summary(sorted(i), i, false), 1:numel(sorted), 'UniformOutput', false);
    output.matlabStatus = 'ok';

    jsonText = jsonencode(output);
    write_text_file(outputPath, jsonText);
end

function [metrics, hourlySeries] = evaluate_config(ghi, time, heightCm, tiltDeg, albedo, ...
    areaM2, frontEfficiency, inverterEfficiency, bifaciality, lat, lon, panelWidthM, panelAzimuthDeg, rearStructureLossFraction, tempC, noctC, temperatureCoeffPerC)
    totalEnergyKWh = 0;
    peakPowerKW = 0;
    totalFront = 0;
    totalRear = 0;
    totalGhi = 0;
    totalEffective = 0;

    hourlySeries = repmat(struct( ...
        'time', '', ...
        'ghiWm2', 0, ...
        'frontEffectiveIrradianceWm2', 0, ...
        'effectiveIrradianceWm2', 0, ...
        'rearEffectiveIrradianceWm2', 0, ...
        'powerKW', 0), 1, numel(ghi));

    for i = 1:numel(ghi)
        ghiVal = max(0, double(ghi(i)));

        % Parse UTC hour and day-of-year from time string
        tStr = read_time_value(time, i);
        hourUTC = 12;  doy = 172;  % fallback defaults
        try
            dt = datetime(tStr, 'InputFormat', 'yyyy-MM-dd''T''HH:mm:ssXXX', 'TimeZone', 'UTC');
            hourUTC = hour(dt) + minute(dt)/60;
            doy = day(dt, 'dayofyear');
        catch
            try
                dt = datetime(tStr, 'InputFormat', 'yyyy-MM-dd''T''HH:mm:ss', 'TimeZone', 'UTC');
                hourUTC = hour(dt) + minute(dt)/60;
                doy = day(dt, 'dayofyear');
            catch
                % use defaults
            end
        end

        [effVal, frontVal, rearVal] = calculate_irradiance( ...
            ghiVal, tiltDeg, heightCm, albedo, bifaciality, lat, lon, hourUTC, doy, panelWidthM, panelAzimuthDeg, rearStructureLossFraction);

        if ~isempty(tempC) && numel(tempC) >= i && isfinite(tempC(i))
            tAmb = tempC(i);
        else
            tAmb = 25;
        end

        cellTemp = tAmb + (effVal / 800) * (noctC - 20);
        tempDerate = 1 + temperatureCoeffPerC * (cellTemp - 25);
        tempDerate = max(0.5, min(1.15, tempDerate));

        powerKW = (effVal / 1000) * areaM2 * frontEfficiency * inverterEfficiency * tempDerate;

        totalEnergyKWh = totalEnergyKWh + powerKW;
        peakPowerKW = max(peakPowerKW, powerKW);
        totalFront = totalFront + frontVal;
        totalRear = totalRear + rearVal;
        totalGhi = totalGhi + ghiVal;
        totalEffective = totalEffective + effVal;

        hourlySeries(i).time = read_time_value(time, i);
        hourlySeries(i).ghiWm2 = round3(ghiVal);
        hourlySeries(i).frontEffectiveIrradianceWm2 = round3(frontVal);
        hourlySeries(i).effectiveIrradianceWm2 = round3(effVal);
        hourlySeries(i).rearEffectiveIrradianceWm2 = round3(rearVal);
        hourlySeries(i).powerKW = round6(powerKW);
    end

    if totalGhi > 0
        rearGainPercent = (totalRear / totalGhi) * 100;
    else
        rearGainPercent = 0;
    end

    if totalEffective > 0
        frontSharePercent = (totalFront / totalEffective) * 100;
    else
        frontSharePercent = 0;
    end

    metrics = struct();
    metrics.totalEnergyKWh = round6(totalEnergyKWh);
    metrics.peakPowerKW = round6(peakPowerKW);
    metrics.rearGainPercent = round4(rearGainPercent);
    metrics.frontSharePercent = round4(frontSharePercent);
    metrics.totalEffectiveIrradianceWhM2 = round3(totalEffective);
    metrics.averageEffectiveIrradianceWm2 = round3(totalEffective / max(1, numel(ghi)));
end

function out = map_summary(entry, rankValue, includeHourly)
    cfg = entry.configuration;
    out = struct();
    out.rank = rankValue;
    out.configurationId = sprintf('H%s_T%s_A%s', num2str(cfg.heightCm), num2str(cfg.tiltDeg), num2str(cfg.albedo));
    out.heightCm = cfg.heightCm;
    out.tiltDeg = cfg.tiltDeg;
    out.albedo = cfg.albedo;
    out.totalEnergyKWh = entry.metrics.totalEnergyKWh;
    out.peakPowerKW = entry.metrics.peakPowerKW;
    out.rearGainPercent = entry.metrics.rearGainPercent;
    out.frontSharePercent = entry.metrics.frontSharePercent;
    out.averageEffectiveIrradianceWm2 = entry.metrics.averageEffectiveIrradianceWm2;
    out.totalEffectiveIrradianceWhM2 = entry.metrics.totalEffectiveIrradianceWhM2;

    if includeHourly
        out.hourlySeries = entry.hourlySeries;
    end
end

function write_text_file(pathValue, content)
    fid = fopen(pathValue, 'w');
    if fid == -1
        error('Unable to open output file for writing: %s', pathValue);
    end
    cleanup = onCleanup(@() fclose(fid));
    fwrite(fid, content, 'char');
end

function t = read_time_value(timeSeries, index)
    if iscell(timeSeries)
        raw = timeSeries{index};
        if isstring(raw)
            t = char(raw);
        else
            t = char(string(raw));
        end
        return;
    end

    if isstring(timeSeries)
        t = char(timeSeries(index));
        return;
    end

    if ischar(timeSeries)
        t = timeSeries(index, :);
        return;
    end

    t = char(string(timeSeries(index)));
end

function v = round3(x)
    v = round(x, 3);
end

function v = round4(x)
    v = round(x, 4);
end

function v = round6(x)
    v = round(x, 6);
end
