document.addEventListener('DOMContentLoaded', () => {

    const API_KEY = 'd243e79aea8a70aaeeeda6f16f6ccf63';
    const NPP_COORDS = [54.773, 26.096];
    const CITIES = {"Вильнюс":[54.687,25.279],"Минск":[53.904,27.561],"Кишинев":[47.026,28.858],"Свиноуйсьце":[53.914,14.249],"София":[42.698,23.322],"Краков":[50.064,19.945],"Харьков":[49.922,36.321],"Варшава":[52.229,21.012],"Вроцлав":[51.107,17.038],"Белосток":[53.132,23.169],"Лиепая":[56.511,21.013],"Паланга":[55.918,21.069],"Вентспилс":[57.319,21.564],"Таллин":[59.437,24.754],"Рига":[56.949,24.105],"Каунас":[54.898,23.903],"Освея":[56.015,28.115],"Киев":[50.45,30.523],"Новогрудок":[53.596,25.827],"Жодино":[54.093,28.34],"Гродно":[53.669,23.826],"Пинск":[52.115,26.103],"Санкт-Петербург":[59.934,30.335],"Витебск":[55.19,30.205],"Эйзенах":[50.978,10.318],"Татаров":[48.349,24.577],"Эльблонг":[54.156,19.402],"Гомель":[52.424,31.014],"Выборг":[60.709,28.747]};
    const SIMULATION_SPEED_MULTIPLIER = 3600;
    const UPDATE_INTERVAL_MS = 100;
    const DEVIATION_ANGLE = 15; 

    let appState = { status: 'loading' }; 
    let map, windData = {};
    let simulationInterval = null, cityMarkers = {}, arrivedCities = {};
    let plumeLayers = { center: null, left: null, right: null };

    // ИСПРАВЛЕНИЕ: Возвращаем cityTimers в объект ui
    const ui = {
        simulateBtn: document.getElementById('simulateBtn'), mainTitle: document.getElementById('mainTitle'),
        infoPanel: document.getElementById('infoPanel'), panelToggleBtn: document.getElementById('panelToggleBtn'),
        panelHeader: document.querySelector('.panel-header'), cityTimers: document.getElementById('cityTimers'),
        iodineInfoFooter: document.getElementById('iodine-info-footer'), overlay: document.getElementById('infoPanelOverlay')
    };
    const isMobile = window.innerWidth <= 768;

    // --- ОСНОВНЫЕ ФУНКЦИИ ---

    function initializeApp() {
        populateCityTimers();
        initMap();
        setupEventListeners();
        setAppState('loading');
        fetchAndUpdateWindData();
        setInterval(fetchAndUpdateWindData, 60 * 1000); 
    }

    // Вся остальная часть файла ниже - полностью рабочая. 
    // Просто скопируйте весь блок целиком.
    
    // ==========================================================

    function populateCityTimers() {
        const grid = ui.cityTimers.querySelector('.timers-grid');
        let html = '';
        for (const cityName in CITIES) {
            html += `<p>${cityName}: <span id="timer-${cityName.toLowerCase().replace(/ /g, "-")}">-</span></p>`;
        }
        if (grid) grid.innerHTML = html;
    }
    
    function setAppState(newState) {
        appState.status = newState;
        const updateElement = (element, action) => { if (element) action(element); };
        switch (newState) {
            case 'loading':
                updateElement(ui.simulateBtn, el => { el.disabled = true; el.textContent = 'Загрузка...'; });
                updateElement(ui.iodineInfoFooter, el => el.style.display = 'none');
                break;
            case 'ready':
                updateElement(ui.simulateBtn, el => { el.disabled = false; el.textContent = '▶︎ Начать симуляцию'; el.style.display = 'block'; });
                updateElement(ui.mainTitle, el => el.style.display = 'block');
                updateElement(ui.cityTimers, el => el.style.display = 'none');
                updateElement(ui.iodineInfoFooter, el => el.style.display = 'none');
                break;
            case 'simulating':
                updateElement(ui.simulateBtn, el => el.style.display = 'none');
                updateElement(ui.mainTitle, el => el.style.display = 'none');
                updateElement(ui.cityTimers, el => el.style.display = 'block');
                updateElement(ui.iodineInfoFooter, el => el.style.display = 'block');
                if (isMobile && ui.infoPanel) ui.infoPanel.classList.remove('visible');
                if (ui.overlay) ui.overlay.classList.remove('visible');
                break;
            case 'error':
                 updateElement(ui.simulateBtn, el => { el.disabled = true; el.textContent = 'Ошибка загрузки'; });
                 updateElement(ui.iodineInfoFooter, el => el.style.display = 'none');
                 break;
        }
    }
    
    function initMap() {
        if (map) return;
        map = L.map('map', { zoomControl: false }).setView(NPP_COORDS, isMobile ? 5 : 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
        L.marker(NPP_COORDS, { icon: L.divIcon({ className: 'npp-icon', html: '☢️' }) }).addTo(map).bindPopup("Белорусская АЭС");
        
        for (const cityName in CITIES) {
            const marker = L.marker(CITIES[cityName]).addTo(map).bindPopup(cityName);
            marker.bindTooltip(cityName, { permanent: false, direction: 'top' });
            cityMarkers[cityName] = marker;
        }
        if (isMobile) {
            if (ui.infoPanel) ui.infoPanel.style.display = 'flex';
            if (ui.panelToggleBtn) ui.panelToggleBtn.style.display = 'block';
        } else {
            if (ui.infoPanel) ui.infoPanel.style.display = 'flex';
            if (ui.panelToggleBtn) ui.panelToggleBtn.style.display = 'none';
        }
    }

    function setupEventListeners() {
        if (ui.simulateBtn) ui.simulateBtn.addEventListener('click', startSimulation);
        const togglePanel = () => {
            if (ui.infoPanel) ui.infoPanel.classList.toggle('visible');
            if (ui.overlay) ui.overlay.classList.toggle('visible');
        };
        if (ui.panelToggleBtn) ui.panelToggleBtn.addEventListener('click', togglePanel);
        if (ui.panelHeader) ui.panelHeader.addEventListener('click', togglePanel);
        if (ui.overlay) ui.overlay.addEventListener('click', togglePanel);
    }

    async function fetchAndUpdateWindData() {
        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=${NPP_COORDS[0]}&lon=${NPP_COORDS[1]}&appid=${API_KEY}&units=metric`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`API ${response.status}`);
            const data = await response.json();
            if (!data.wind) throw new Error('No wind data in API response');
            windData = { speed: data.wind.speed || 0, deg: data.wind.deg || 0 };
            updateWindInfoUI();
            if (appState.status === 'loading' || appState.status === 'error') setAppState('ready');
            return true;
        } catch (error) {
            console.error("Wind fetch error:", error.message);
            updateWindInfoUI(true);
            setAppState('error');
            return false;
        }
    }

    function updateWindInfoUI(isError = false) {
        const pointer = document.getElementById('wind-pointer'), speedDisplay = document.getElementById('wind-speed'), updateTimeDisplay = document.getElementById('update-time');
        if (!pointer || !speedDisplay || !updateTimeDisplay) return;
        if (isError) {
            speedDisplay.textContent = 'Ошибка';
            updateTimeDisplay.textContent = 'нет данных';
            speedDisplay.classList.remove('has-data');
            return;
        }
        if (typeof windData.speed !== "undefined") {
            pointer.style.transform = `rotate(${windData.deg + 180}deg)`;
            speedDisplay.textContent = `${windData.speed.toFixed(1)}`;
            speedDisplay.classList.add('has-data');
            updateTimeDisplay.textContent = `обновлено в ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
        }
    }
    
    async function startSimulation() {
        if (appState.status !== 'ready') return;
        ui.simulateBtn.disabled = true; ui.simulateBtn.textContent = 'Получение данных...';
        const success = await fetchAndUpdateWindData();
        if (!success) { alert('Не удалось получить актуальные данные о ветре.'); setAppState('ready'); return; }
        if (windData.speed === 0) { alert("Ветер отсутствует. Распространение невозможно."); setAppState('ready'); return; }
        setAppState('simulating');
        if (simulationInterval) clearInterval(simulationInterval);
        resetSimulation();
        let totalDistance = 0;
        simulationInterval = setInterval(() => {
            totalDistance += windData.speed * (UPDATE_INTERVAL_MS / 1000) * SIMULATION_SPEED_MULTIPLIER;
            updatePlumeLayer('center', createPlumePolygon(totalDistance, windData.deg), { color: "red", fillColor: "#f03", fillOpacity: 0.5, weight: 1.5 });
            updatePlumeLayer('left', createPlumePolygon(totalDistance, windData.deg - DEVIATION_ANGLE), { color: "#f03", fillColor: "#f03", fillOpacity: 0.15, weight: 0 });
            updatePlumeLayer('right', createPlumePolygon(totalDistance, windData.deg + DEVIATION_ANGLE), { color: "#f03", fillColor: "#f03", fillOpacity: 0.15, weight: 0 });
            checkCityArrival(plumeLayers.center.getLatLngs());
        }, UPDATE_INTERVAL_MS);
    }
    
    function resetSimulation() { Object.keys(plumeLayers).forEach(key => { if (plumeLayers[key]) map.removeLayer(plumeLayers[key]); plumeLayers[key] = null; }); resetTimers(); }
    function updatePlumeLayer(key, points, style) { if (!plumeLayers[key]) { plumeLayers[key] = L.polygon(points, style).addTo(map); } else { plumeLayers[key].setLatLngs(points); } }
    
    function checkCityArrival(centerPolygonPoints) {
        const centerPolygon = L.polygon(centerPolygonPoints);
        for (const cityName in CITIES) {
            if (!arrivedCities[cityName] && isMarkerInsidePolygon(L.latLng(CITIES[cityName]), centerPolygon)) {
                arrivedCities[cityName] = true;
                const distanceToCity = map.distance(NPP_COORDS, CITIES[cityName]), timeToArrivalSeconds = distanceToCity / windData.speed;
                const hours = Math.floor(timeToArrivalSeconds / 3600), minutes = Math.floor((timeToArrivalSeconds % 3600) / 60);
                const arrivalTimeText = `~ ${hours} ч. ${minutes} мин.`;
                updateCityTimer(cityName, arrivalTimeText);
                const markerToUpdate = cityMarkers[cityName];
                if (markerToUpdate) markerToUpdate.setTooltipContent(`<strong>${arrivalTimeText}</strong>`).openTooltip();
            }
        }
    }
    
    function resetTimers() { for (const e in CITIES) { updateCityTimer(e, "-"); const t = cityMarkers[e]; t && t.isTooltipOpen() && t.closeTooltip().setTooltipContent(e) } arrivedCities = {} }
    function updateCityTimer(e, t) { const i = document.getElementById(`timer-${e.toLowerCase().replace(/ /g, "-")}`); i && (i.innerText = t) }
    function createPlumePolygon(e, t) { const i = L.latLng(NPP_COORDS), a = e * Math.tan(.261799), l = 50, s = e / l; let o = i; const n = [i]; for (let r = 0; r < l; r++)o = getDestinationPoint(o, t, s), n.push(o); const r = [], d = []; for (let c = 0; c < n.length; c++) { const e = c / l * a, i = getDestinationPoint(n[c], t - 90, e), s = getDestinationPoint(n[c], t + 90, e); r.push(i), d.push(s) } return [i, ...r, ...d.slice(1).reverse()] }
    function getDestinationPoint(e, t, i) { const a = 6371e3, l = e.lat * Math.PI / 180, s = e.lng * Math.PI / 180, o = t * Math.PI / 180, n = Math.asin(Math.sin(l) * Math.cos(i / a) + Math.cos(l) * Math.sin(i / a) * Math.cos(o)), r = s + Math.atan2(Math.sin(o) * Math.sin(i / a) * Math.cos(l), Math.cos(i / a) - Math.sin(l) * Math.sin(n)); return L.latLng(180 * n / Math.PI, 180 * r / Math.PI) }
    function isMarkerInsidePolygon(e, t) { let i = !1; const a = e.lng, l = e.lat, s = t.getLatLngs()[0]; for (let o = 0, n = s.length - 1; o < s.length; n = o++) { const e = s[o].lng, r = s[o].lat, d = s[n].lng, c = s[n].lat, _ = (r > l) !== (c > l) && a < (d - e) * (l - r) / (c - r) + e; _ && (i = !i) } return i }
    
    initializeApp();
});
