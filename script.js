document.addEventListener('DOMContentLoaded', () => {

    // --- 1. КОНСТАНТЫ И СОСТОЯНИЕ ---
    const API_KEY = 'd243e79aea8a70aaeeeda6f16f6ccf63';
    const NPP_COORDS = [54.773, 26.096];
    const CITIES = {"Вильнюс":[54.687,25.279],"Минск":[53.904,27.561],"Варшава":[52.229,21.012],"Рига":[56.949,24.105],"Каунас":[54.898,23.903],"Даугавпилс":[55.874,26.516],"Киев":[50.45,30.523],"Новогрудок":[53.596,25.827],"Жодино":[54.093,28.34],"Гродно":[53.669,23.826],"Брест":[52.097,23.734],"Москва":[55.755,37.617],"Витебск":[55.19,30.205]};
    const SIMULATION_SPEED_MULTIPLIER = 3600;
    const UPDATE_INTERVAL_MS = 100;
    const PLUME_SPREAD_ANGLE = 45;

    let appState = { status: 'loading' }; 
    let map, windData = {}, simulationInterval = null, plumeLayer = null, cityMarkers = {}, arrivedCities = {};

    const ui = {
        simulateBtn: document.getElementById('simulateBtn'),
        mainTitle: document.getElementById('mainTitle'),
        infoPanel: document.getElementById('infoPanel'),
        panelToggleBtn: document.getElementById('panelToggleBtn'),
        panelHeader: document.querySelector('.panel-header'),
        cityTimers: document.getElementById('cityTimers'),
        iodinePopup: document.getElementById('iodine-tooltip'),
        closePopupBtn: document.getElementById('close-popup-btn'),
        overlay: document.getElementById('infoPanelOverlay')
    };
    const isMobile = window.innerWidth <= 768;

    // --- ОСНОВНЫЕ ФУНКЦИИ ---

    function initializeApp() {
        populateCityTimers();
        initMap();
        setupEventListeners();
        setAppState('loading');
        fetchAndUpdateWindData();
        // ИЗМЕНЕНИЕ: Интервал обновления данных теперь 1 минута (60 * 1000 миллисекунд)
        setInterval(fetchAndUpdateWindData, 60 * 1000); 
    }

    function populateCityTimers() {
        const grid = ui.cityTimers.querySelector('.timers-grid');
        let html = '';
        for (const cityName in CITIES) {
            html += `<p>${cityName}: <span id="timer-${cityName.toLowerCase().replace(/ /g, "-")}">-</span></p>`;
        }
        grid.innerHTML = html;
    }

    function setAppState(newState) {
        appState.status = newState;
        const updateElement = (element, action) => { if (element) action(element); };
        
        switch (newState) {
            case 'loading':
                updateElement(ui.simulateBtn, el => { el.disabled = true; el.textContent = 'Загрузка...'; });
                break;
            case 'ready':
                updateElement(ui.simulateBtn, el => { el.disabled = false; el.textContent = '▶︎ Начать симуляцию'; el.style.display = 'block'; });
                updateElement(ui.mainTitle, el => el.style.display = 'block');
                updateElement(ui.cityTimers, el => el.style.display = 'none');
                break;
            case 'simulating':
                updateElement(ui.simulateBtn, el => el.style.display = 'none');
                updateElement(ui.mainTitle, el => el.style.display = 'none');
                updateElement(ui.cityTimers, el => el.style.display = 'block');
                if (isMobile && ui.infoPanel) ui.infoPanel.classList.remove('visible');
                if (ui.overlay) ui.overlay.classList.remove('visible');
                break;
            case 'error':
                 updateElement(ui.simulateBtn, el => { el.disabled = true; el.textContent = 'Ошибка загрузки'; });
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
            if(ui.infoPanel) ui.infoPanel.style.display = 'flex';
            if(ui.panelToggleBtn) ui.panelToggleBtn.style.display = 'block';
        } else {
            if(ui.infoPanel) ui.infoPanel.style.display = 'flex';
            if(ui.panelToggleBtn) ui.panelToggleBtn.style.display = 'none';
        }
    }

    function setupEventListeners() {
        if (ui.simulateBtn) ui.simulateBtn.addEventListener('click', startSimulation);
        
        const togglePanel = () => {
            if (ui.infoPanel) ui.infoPanel.classList.toggle('visible');
            if (ui.overlay) ui.overlay.classList.toggle('visible');
        };
        if(ui.panelToggleBtn) ui.panelToggleBtn.addEventListener('click', togglePanel);
        if(ui.panelHeader) ui.panelHeader.addEventListener('click', togglePanel);
        if(ui.overlay) ui.overlay.addEventListener('click', togglePanel);
        
        if (ui.closePopupBtn) {
            ui.closePopupBtn.addEventListener('click', () => { if (ui.iodinePopup) ui.iodinePopup.style.display = 'none'; });
        }
        if (ui.iodinePopup) {
            window.addEventListener('click', (e) => { if (e.target === ui.iodinePopup) ui.iodinePopup.style.display = 'none'; });
        }
    }

    async function fetchAndUpdateWindData() {
        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=${NPP_COORDS[0]}&lon=${NPP_COORDS[1]}&appid=${API_KEY}&units=metric`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`API ${response.status}`);
            const data = await response.json();
            if (!data.wind) throw new Error('No wind data');
            windData = { speed: data.wind.speed || 0, deg: data.wind.deg || 0 };
            updateWindInfoUI();
            if(appState.status === 'loading' || appState.status === 'error') setAppState('ready');
            return true;
        } catch (error) {
            console.error("Wind fetch error:", error.message);
            updateWindInfoUI(true);
            setAppState('error');
            return false;
        }
    }

    function updateWindInfoUI(isError = false) {
        const pointer = document.getElementById('wind-pointer');
        const speedDisplay = document.getElementById('wind-speed');
        const updateTimeDisplay = document.getElementById('update-time');

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
        } else {
            speedDisplay.textContent = '--';
            speedDisplay.classList.remove('has-data');
            updateTimeDisplay.textContent = 'ожидание...';
        }
    }
    
    async function startSimulation() {
        if (appState.status !== 'ready') return;
        ui.simulateBtn.disabled = true;
        ui.simulateBtn.textContent = 'Получение данных...';
        
        const success = await fetchAndUpdateWindData();
        if (!success) {
            alert('Не удалось получить актуальные данные о ветре.');
            setAppState('ready');
            return;
        }
        if (windData.speed === 0) {
            alert("Ветер отсутствует. Распространение аэрозолей невозможно.");
            setAppState('ready');
            return;
        }
        setAppState('simulating');

        if (simulationInterval) clearInterval(simulationInterval);
        if (plumeLayer) map.removeLayer(plumeLayer);
        resetTimers();
        
        let totalDistance = 0;
        simulationInterval = setInterval(() => {
            totalDistance += windData.speed * (UPDATE_INTERVAL_MS / 1000) * SIMULATION_SPEED_MULTIPLIER;
            const plumePoints = createPlumePolygon(totalDistance);
            if (!plumeLayer) plumeLayer = L.polygon(plumePoints, { color: "red", fillColor: "#f03", fillOpacity: .5, weight: 1 }).addTo(map);
            else plumeLayer.setLatLngs(plumePoints);
            checkCityArrival();
        }, UPDATE_INTERVAL_MS);
    }
    
    function checkCityArrival() {
        if (!plumeLayer) return;
        for (const cityName in CITIES) {
            if (!arrivedCities[cityName] && isMarkerInsidePolygon(L.latLng(CITIES[cityName]), plumeLayer)) {
                arrivedCities[cityName] = true;
                
                const distanceToCity = map.distance(NPP_COORDS, CITIES[cityName]);
                const timeToArrivalSeconds = distanceToCity / windData.speed;
                const hours = Math.floor(timeToArrivalSeconds / 3600), minutes = Math.floor((timeToArrivalSeconds % 3600) / 60);
                
                const arrivalTimeText = `~ ${hours} ч. ${minutes} мин.`;
                updateCityTimer(cityName, arrivalTimeText);
                
                const iodineEffectiveness = getIodineEffectiveness(hours);
                const tooltipContent = `<div style="text-align:center;line-height:1.5;"><strong>${arrivalTimeText}</strong><br>Эфф. йода: ${iodineEffectiveness} <span class="iodine-info-btn" title="Что это значит?">(?)</span></div>`;
                
                const markerToUpdate = cityMarkers[cityName];
                if (markerToUpdate) {
                    markerToUpdate.setTooltipContent(tooltipContent);
                    markerToUpdate.once("tooltipopen", (e) => {
                        const infoBtn = e.tooltip._container.querySelector(".iodine-info-btn");
                        if (infoBtn && ui.iodinePopup) {
                            infoBtn.addEventListener("click", event => {
                                event.stopPropagation();
                                ui.iodinePopup.style.display = "block";
                            });
                        }
                    });
                    markerToUpdate.openTooltip();
                }
            }
        }
    }
    
    function resetTimers() {
        for(const cityName in CITIES) {
            updateCityTimer(cityName,"-");
            const marker = cityMarkers[cityName];
            if(marker && marker.isTooltipOpen()) {
                marker.closeTooltip().setTooltipContent(cityName);
            }
        }
        arrivedCities = {};
    }
    
    function updateCityTimer(cityName, text) {
        const timerElement = document.getElementById(`timer-${cityName.toLowerCase().replace(/ /g,"-")}`);
        if(timerElement) timerElement.innerText = text;
    }
    
    function getIodineEffectiveness(hours) {
        if (hours <= 0.5) return "90-100%";
        if (hours <= 1) return "~75%";
        if (hours <= 2) return "~66%";
        if (hours <= 5) return "50%";
        if (hours <= 8) return "очень низкая";
        return "нецелесообразна";
    }

    function createPlumePolygon(distance) {
        const center = L.latLng(NPP_COORDS);
        // Модель "Гауссовой струи"
        const plumeHalfWidth = distance * Math.tan(15 * Math.PI / 180); // Угол расширения ~15 градусов
        const segments = 50;
        const segmentLength = distance / segments;
        
        let currentPoint = center;
        const centerLine = [center];
        for (let i = 0; i < segments; i++) {
            currentPoint = getDestinationPoint(currentPoint, windData.deg, segmentLength);
            centerLine.push(currentPoint);
        }

        const leftBoundary = [], rightBoundary = [];
        for (let i = 0; i < centerLine.length; i++) {
            const currentWidth = (i / segments) * plumeHalfWidth;
            const leftPoint = getDestinationPoint(centerLine[i], windData.deg - 90, currentWidth);
            const rightPoint = getDestinationPoint(centerLine[i], windData.deg + 90, currentWidth);
            leftBoundary.push(leftPoint);
            rightBoundary.push(rightPoint);
        }
        return [center, ...leftBoundary, ...rightBoundary.slice(1).reverse()];
    }

    function getDestinationPoint(startPoint, bearing, distance) {
        const R = 6371e3;
        const lat1 = startPoint.lat * Math.PI / 180, lon1 = startPoint.lng * Math.PI / 180;
        const brng = bearing * Math.PI / 180;
        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance/R) + Math.cos(lat1) * Math.sin(distance/R) * Math.cos(brng));
        const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(distance/R) * Math.cos(lat1), Math.cos(distance/R) - Math.sin(lat1) * Math.sin(lat2));
        return L.latLng(lat2 * 180 / Math.PI, lon2 * 180 / Math.PI);
    }
    
    function isMarkerInsidePolygon(markerLatLng, polygonLayer) {
        let inside = false;
        const x = markerLatLng.lng, y = markerLatLng.lat;
        const points = polygonLayer.getLatLngs()[0];
        for(let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].lng, yi = points[i].lat;
            const xj = points[j].lng, yj = points[j].lat;
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    // --- ЗАПУСК ПРИЛОЖЕНИЯ ---
    initializeApp();
});
