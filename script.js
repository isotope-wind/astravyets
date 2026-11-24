/*
 * Куда дует ветер от БелАЭС? Учебная симуляция.
 * Модель: облако идет по прямой в сторону, куда дует ветер, с постоянной скоростью
 * и расширяется конусом. Ветер берется один раз при запуске (Open-Meteo, 10 м).
 * Подробности и ограничения: README.md
 */
(function () {
    'use strict';

    // ===== Настройки модели =====
    const NPP_COORDS = [54.773, 26.096];
    const WIND_API_URL = 'https://api.open-meteo.com/v1/forecast';
    const WIND_REFRESH_MS = 5 * 60 * 1000;      // Open-Meteo обновляет текущие значения примерно раз в 15 минут
    const WIND_FETCH_TIMEOUT_MS = 10 * 1000;
    const SIMULATION_SPEED_MULTIPLIER = 3600;   // 1 секунда реального времени = 1 час модельного
    const UPDATE_INTERVAL_MS = 100;
    const MAX_SIMULATION_HOURS = 48;            // после этого симуляция останавливается
    const PLUME_HALF_ANGLE_DEG = 15;            // полуугол конуса облака (условный)
    const AXIS_UNCERTAINTY_DEG = 15;            // сдвиг оси облака для «коридора неопределенности» (условный)
    const PLUME_SEGMENTS = 50;
    const OPACITY_START = 0.5;                  // условная прозрачность: плотность облака с расстоянием падает
    const OPACITY_END = 0.12;
    const EARTH_RADIUS_M = 6371000;

    const CITIES = {"Вильнюс":[54.687,25.279],"Минск":[53.904,27.561],"Кишинев":[47.026,28.858],"Свиноуйсьце":[53.914,14.249],"София":[42.698,23.322],"Краков":[50.064,19.945],"Харьков":[49.922,36.321],"Варшава":[52.229,21.012],"Вроцлав":[51.107,17.038],"Белосток":[53.132,23.169],"Лиепая":[56.511,21.013],"Паланга":[55.918,21.069],"Вентспилс":[57.319,21.564],"Таллин":[59.437,24.754],"Рига":[56.949,24.105],"Каунас":[54.898,23.903],"Освея":[56.015,28.115],"Киев":[50.45,30.523],"Новогрудок":[53.596,25.827],"Жодино":[54.093,28.34],"Гродно":[53.669,23.826],"Пинск":[52.115,26.103],"Санкт-Петербург":[59.934,30.335],"Витебск":[55.19,30.205],"Эйзенах":[50.978,10.318],"Татаров":[48.349,24.577],"Эльблонг":[54.156,19.402],"Гомель":[52.424,31.014],"Выборг":[60.709,28.747]};
    const CITY_NAMES = Object.keys(CITIES);

    // ===== Геометрия и разбор данных (чистые функции, без DOM и Leaflet) =====

    function normalizeAngle(deg) {
        return ((deg % 360) + 360) % 360;
    }

    // Метеорологическое направление ветра это направление, ОТКУДА он дует.
    // Облако движется в противоположную сторону.
    function windToBearing(windFromDeg) {
        return normalizeAngle(windFromDeg + 180);
    }

    function destinationPoint(point, bearingDeg, distanceM) {
        const lat1 = point[0] * Math.PI / 180;
        const lng1 = point[1] * Math.PI / 180;
        const bearing = bearingDeg * Math.PI / 180;
        const ang = distanceM / EARTH_RADIUS_M;
        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(bearing));
        const lng2 = lng1 + Math.atan2(Math.sin(bearing) * Math.sin(ang) * Math.cos(lat1), Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2));
        return [lat2 * 180 / Math.PI, ((lng2 * 180 / Math.PI + 540) % 360) - 180];
    }

    function distanceBetween(a, b) {
        const lat1 = a[0] * Math.PI / 180;
        const lat2 = b[0] * Math.PI / 180;
        const dLat = lat2 - lat1;
        const dLng = (b[1] - a[1]) * Math.PI / 180;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
        return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    // Конус от источника: ось длиной distanceM, ширина растет линейно (полуугол halfAngleDeg).
    function createPlumePolygon(origin, bearingDeg, distanceM, halfAngleDeg, segments) {
        const spread = distanceM * Math.tan(halfAngleDeg * Math.PI / 180);
        const step = distanceM / segments;
        const axis = [origin];
        for (let i = 0; i < segments; i++) {
            axis.push(destinationPoint(axis[i], bearingDeg, step));
        }
        const left = [];
        const right = [];
        for (let i = 1; i < axis.length; i++) {
            const offset = i / segments * spread;
            left.push(destinationPoint(axis[i], bearingDeg - 90, offset));
            right.push(destinationPoint(axis[i], bearingDeg + 90, offset));
        }
        return [origin, ...left, ...right.reverse()];
    }

    // Алгоритм луча. point и вершины в формате [широта, долгота].
    function pointInPolygon(point, polygon) {
        const lat = point[0];
        const lng = point[1];
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const latI = polygon[i][0], lngI = polygon[i][1];
            const latJ = polygon[j][0], lngJ = polygon[j][1];
            const crosses = (latI > lat) !== (latJ > lat) &&
                lng < (lngJ - lngI) * (lat - latI) / (latJ - latI) + lngI;
            if (crosses) inside = !inside;
        }
        return inside;
    }

    function formatArrival(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `~ ${hours} ч. ${minutes} мин.`;
    }

    function plumeOpacity(elapsedHours) {
        const k = Math.min(1, Math.max(0, elapsedHours / MAX_SIMULATION_HOURS));
        return OPACITY_START + (OPACITY_END - OPACITY_START) * k;
    }

    // Ответ Open-Meteo: current.wind_speed_10m (м/с) и current.wind_direction_10m (откуда дует, градусы).
    function parseWindResponse(json) {
        const current = json && json.current;
        if (!current) throw new Error('В ответе нет блока current');
        const speed = current.wind_speed_10m;
        const fromDeg = current.wind_direction_10m;
        if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0) throw new Error('Нет скорости ветра');
        if (typeof fromDeg !== 'number' || !Number.isFinite(fromDeg)) throw new Error('Нет направления ветра');
        const time = current.time ? new Date(current.time + 'Z') : null;   // время приходит в GMT
        return { speed, fromDeg: normalizeAngle(fromDeg), time: time && !isNaN(time) ? time : null };
    }

    function buildWindUrl() {
        const params = new URLSearchParams({
            latitude: String(NPP_COORDS[0]),
            longitude: String(NPP_COORDS[1]),
            current: 'wind_speed_10m,wind_direction_10m',
            wind_speed_unit: 'ms',
            timezone: 'GMT'
        });
        return `${WIND_API_URL}?${params.toString()}`;
    }

    // ===== Приложение =====

    function initApp() {
        let appState = 'loading';   // loading | ready | simulating | finished | error
        let map = null;
        let windData = null;        // { speed, fromDeg, time }
        let simulationInterval = null;
        let arrivedCities = {};
        const cityMarkers = {};
        const plumeLayers = { center: null, left: null, right: null };

        const ui = {
            simulateBtn: document.getElementById('simulateBtn'),
            mainTitle: document.getElementById('mainTitle'),
            infoPanel: document.getElementById('infoPanel'),
            panelToggleBtn: document.getElementById('panelToggleBtn'),
            panelHeader: document.querySelector('.panel-header'),
            cityTimers: document.getElementById('cityTimers'),
            iodineInfoFooter: document.getElementById('iodine-info-footer'),
            overlay: document.getElementById('infoPanelOverlay'),
            statusMessage: document.getElementById('statusMessage')
        };
        const isMobile = window.innerWidth <= 768;

        function show(el, display) { if (el) el.style.display = display || 'block'; }
        function hide(el) { if (el) el.style.display = 'none'; }

        function showStatus(text) {
            if (!ui.statusMessage) return;
            ui.statusMessage.textContent = text || '';
            ui.statusMessage.style.display = text ? 'block' : 'none';
        }

        function setButton(text, disabled) {
            if (!ui.simulateBtn) return;
            ui.simulateBtn.textContent = text;
            ui.simulateBtn.disabled = !!disabled;
            ui.simulateBtn.style.display = 'block';
        }

        function setAppState(newState) {
            appState = newState;
            switch (newState) {
                case 'loading':
                    setButton('Загрузка...', true);
                    hide(ui.iodineInfoFooter);
                    break;
                case 'ready':
                    setButton('▶︎ Начать симуляцию', false);
                    show(ui.mainTitle);
                    hide(ui.cityTimers);
                    hide(ui.iodineInfoFooter);
                    break;
                case 'simulating':
                    hide(ui.simulateBtn);
                    hide(ui.mainTitle);
                    showStatus('');
                    show(ui.cityTimers);
                    show(ui.iodineInfoFooter);
                    if (isMobile && ui.infoPanel) ui.infoPanel.classList.remove('visible');
                    if (ui.overlay) ui.overlay.classList.remove('visible');
                    break;
                case 'finished':
                    setButton('↻ Запустить заново', false);
                    hide(ui.mainTitle);
                    show(ui.cityTimers);
                    show(ui.iodineInfoFooter);
                    showStatus(`Симуляция остановлена через ${MAX_SIMULATION_HOURS} ч модельного времени. Дальше модель теряет смысл.`);
                    break;
                case 'error':
                    setButton('Повторить', false);
                    show(ui.mainTitle);
                    hide(ui.iodineInfoFooter);
                    showStatus('Не удалось получить данные о ветре. Проверьте соединение и нажмите «Повторить».');
                    break;
            }
        }

        // --- Карта ---

        function initMap() {
            map = L.map('map', { zoomControl: false }).setView(NPP_COORDS, isMobile ? 5 : 6);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
            L.marker(NPP_COORDS, { icon: L.divIcon({ className: 'npp-icon', html: '☢️' }) }).addTo(map).bindPopup('Белорусская АЭС');

            CITY_NAMES.forEach((name) => {
                const marker = L.marker(CITIES[name]).addTo(map).bindPopup(name);
                marker.bindTooltip(name, { permanent: false, direction: 'top' });
                cityMarkers[name] = marker;
            });

            show(ui.infoPanel, 'flex');
            if (ui.panelToggleBtn) ui.panelToggleBtn.style.display = isMobile ? 'block' : 'none';
        }

        function populateCityTimers() {
            const grid = ui.cityTimers && ui.cityTimers.querySelector('.timers-grid');
            if (!grid) return;
            grid.textContent = '';
            CITY_NAMES.forEach((name, index) => {
                const row = document.createElement('p');
                row.appendChild(document.createTextNode(`${name}: `));
                const span = document.createElement('span');
                span.id = `timer-${index}`;
                span.textContent = '-';
                row.appendChild(span);
                grid.appendChild(row);
            });
        }

        function setCityTimer(name, text) {
            const span = document.getElementById(`timer-${CITY_NAMES.indexOf(name)}`);
            if (span) span.textContent = text;
        }

        function resetTimers() {
            CITY_NAMES.forEach((name) => {
                setCityTimer(name, '-');
                const marker = cityMarkers[name];
                if (marker && marker.isTooltipOpen()) marker.closeTooltip();
                if (marker) marker.setTooltipContent(name);
            });
            arrivedCities = {};
        }

        function resetSimulation() {
            Object.keys(plumeLayers).forEach((key) => {
                if (plumeLayers[key]) map.removeLayer(plumeLayers[key]);
                plumeLayers[key] = null;
            });
            resetTimers();
        }

        function updatePlumeLayer(key, points, style) {
            if (!plumeLayers[key]) {
                plumeLayers[key] = L.polygon(points, style).addTo(map);
            } else {
                plumeLayers[key].setLatLngs(points);
                plumeLayers[key].setStyle(style);
            }
        }

        // --- Ветер ---

        function updateWindInfoUI(isError) {
            const pointer = document.getElementById('wind-pointer');
            const speedDisplay = document.getElementById('wind-speed');
            const updateTimeDisplay = document.getElementById('update-time');
            if (!pointer || !speedDisplay || !updateTimeDisplay) return;
            if (isError || !windData) {
                speedDisplay.textContent = 'Ошибка';
                speedDisplay.classList.remove('has-data');
                updateTimeDisplay.textContent = 'нет данных';
                return;
            }
            // Стрелка показывает, КУДА дует ветер (куда пойдет облако).
            pointer.style.transform = `rotate(${windToBearing(windData.fromDeg)}deg)`;
            speedDisplay.textContent = windData.speed.toFixed(1);
            speedDisplay.classList.add('has-data');
            const shown = windData.time || new Date();
            updateTimeDisplay.textContent = `данные на ${shown.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
        }

        // Возвращает true, если свежие данные получены. strict: при сбое всегда переходить в состояние error.
        async function refreshWind(strict) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), WIND_FETCH_TIMEOUT_MS);
            try {
                const response = await fetch(buildWindUrl(), { signal: controller.signal });
                if (!response.ok) throw new Error(`API ${response.status}`);
                windData = parseWindResponse(await response.json());
                updateWindInfoUI(false);
                if (appState === 'loading' || appState === 'error') {
                    showStatus('');
                    setAppState('ready');
                }
                return true;
            } catch (error) {
                console.error('Wind fetch error:', error.message);
                const running = appState === 'simulating' || appState === 'finished';
                if (strict || !running) {
                    windData = null;
                    updateWindInfoUI(true);
                    setAppState('error');
                }
                return false;
            } finally {
                clearTimeout(timer);
            }
        }

        // --- Симуляция ---

        function checkCityArrival(centerPolygon, windSpeed) {
            CITY_NAMES.forEach((name) => {
                if (arrivedCities[name]) return;
                if (!pointInPolygon(CITIES[name], centerPolygon)) return;
                arrivedCities[name] = true;
                const arrivalText = formatArrival(distanceBetween(NPP_COORDS, CITIES[name]) / windSpeed);
                setCityTimer(name, arrivalText);
                const marker = cityMarkers[name];
                if (marker) marker.setTooltipContent(`<strong>${arrivalText}</strong>`).openTooltip();
            });
        }

        function drawPlume(bearing, distanceM, elapsedHours) {
            const center = createPlumePolygon(NPP_COORDS, bearing, distanceM, PLUME_HALF_ANGLE_DEG, PLUME_SEGMENTS);
            const left = createPlumePolygon(NPP_COORDS, bearing - AXIS_UNCERTAINTY_DEG, distanceM, PLUME_HALF_ANGLE_DEG, PLUME_SEGMENTS);
            const right = createPlumePolygon(NPP_COORDS, bearing + AXIS_UNCERTAINTY_DEG, distanceM, PLUME_HALF_ANGLE_DEG, PLUME_SEGMENTS);
            const opacity = plumeOpacity(elapsedHours);
            updatePlumeLayer('center', center, { color: 'red', fillColor: '#f03', fillOpacity: opacity, weight: 1.5 });
            updatePlumeLayer('left', left, { color: '#f03', fillColor: '#f03', fillOpacity: opacity * 0.3, weight: 0 });
            updatePlumeLayer('right', right, { color: '#f03', fillColor: '#f03', fillOpacity: opacity * 0.3, weight: 0 });
            return center;
        }

        async function startSimulation() {
            if (appState !== 'ready' && appState !== 'finished') return;
            setButton('Получение данных...', true);
            const success = await refreshWind(true);
            if (!success) return;   // refreshWind уже перевел приложение в состояние error
            if (windData.speed <= 0) {
                setAppState('ready');
                showStatus('Ветра нет, распространение по этой модели невозможно.');
                return;
            }

            // Ветер фиксируется на время симуляции: облако не должно «переписываться» задним числом.
            const frozenSpeed = windData.speed;
            const bearing = windToBearing(windData.fromDeg);

            if (simulationInterval) clearInterval(simulationInterval);
            resetSimulation();
            setAppState('simulating');

            let elapsedSeconds = 0;
            const maxSeconds = MAX_SIMULATION_HOURS * 3600;
            simulationInterval = setInterval(() => {
                elapsedSeconds = Math.min(maxSeconds, elapsedSeconds + (UPDATE_INTERVAL_MS / 1000) * SIMULATION_SPEED_MULTIPLIER);
                const distanceM = frozenSpeed * elapsedSeconds;
                const centerPolygon = drawPlume(bearing, distanceM, elapsedSeconds / 3600);
                checkCityArrival(centerPolygon, frozenSpeed);
                if (elapsedSeconds >= maxSeconds) {
                    clearInterval(simulationInterval);
                    simulationInterval = null;
                    setAppState('finished');
                }
            }, UPDATE_INTERVAL_MS);
        }

        async function onMainButtonClick() {
            if (appState === 'error') {
                setAppState('loading');
                await refreshWind(false);
            } else {
                await startSimulation();
            }
        }

        function setupEventListeners() {
            if (ui.simulateBtn) ui.simulateBtn.addEventListener('click', onMainButtonClick);
            const togglePanel = () => {
                if (ui.infoPanel) ui.infoPanel.classList.toggle('visible');
                if (ui.overlay) ui.overlay.classList.toggle('visible');
            };
            if (ui.panelToggleBtn) ui.panelToggleBtn.addEventListener('click', togglePanel);
            if (ui.panelHeader) ui.panelHeader.addEventListener('click', togglePanel);
            if (ui.overlay) ui.overlay.addEventListener('click', togglePanel);
        }

        populateCityTimers();
        initMap();
        setupEventListeners();
        setAppState('loading');
        refreshWind(false);
        setInterval(() => refreshWind(false), WIND_REFRESH_MS);
    }

    // ===== Запуск и экспорт для тестов =====

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            normalizeAngle, windToBearing, destinationPoint, distanceBetween, createPlumePolygon,
            pointInPolygon, formatArrival, plumeOpacity, parseWindResponse, buildWindUrl,
            CITIES, NPP_COORDS, initApp
        };
    }
    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initApp);
        } else {
            initApp();
        }
    }
})();
