document.addEventListener('DOMContentLoaded', () => {

    const API_KEY = 'd243e79aea8a70aaeeeda6f16f6ccf63';
    const NPP_COORDS = [54.773, 26.096];
    const CITIES = {"Вильнюс":[54.687,25.279],"Минск":[53.904,27.561],"Варшава":[52.229,21.012],"Рига":[56.949,24.105],"Каунас":[54.898,23.903],"Даугавпилс":[55.874,26.516],"Киев":[50.45,30.523],"Новогрудок":[53.596,25.827],"Жодино":[54.093,28.34],"Гродно":[53.669,23.826],"Брест":[52.097,23.734],"Москва":[55.755,37.617],"Витебск":[55.19,30.205]};
    const SIMULATION_SPEED_MULTIPLIER = 3600; 
    const UPDATE_INTERVAL_MS = 100; 
    const PLUME_SPREAD_ANGLE = 45;

    let appState = { status: 'loading' }; 
    let map, windData = {}, simulationInterval = null, plumeLayer = null, cityMarkers = {}, arrivedCities = {};

    const simulateBtn = document.getElementById('simulateBtn');
    const mainTitle = document.getElementById('mainTitle');
    const infoPanel = document.getElementById('infoPanel');
    const panelToggleBtn = document.getElementById('panelToggleBtn');
    const panelHeader = document.querySelector('.panel-header');
    const windInfoPanel = document.getElementById('windInfo');
    const cityTimersPanel = document.getElementById('cityTimers');
    const iodinePopup = document.getElementById('iodine-tooltip');
    const closePopupBtn = document.getElementById('close-popup-btn');

    const isMobile = window.innerWidth <= 768;

    function initializeApp() {
        initMap();
        setupEventListeners();
        setAppState('loading');
        fetchWindData(); 
    }

    function setAppState(newState) {
        appState.status = newState;
        
        // Эта функция теперь надежно работает с null, если элемента нет
        const updateElement = (element, action) => {
            if (element) action(element);
        };
        
        switch (newState) {
            case 'loading':
                updateElement(simulateBtn, el => { el.disabled = true; el.textContent = 'Загрузка...'; });
                break;
            case 'ready':
                updateElement(simulateBtn, el => { el.disabled = false; el.textContent = '▶︎ Начать симуляцию'; el.style.display = 'block'; });
                updateElement(mainTitle, el => el.style.display = 'block');
                updateElement(cityTimersPanel, el => el.style.display = 'none');
                break;
            case 'simulating':
                updateElement(simulateBtn, el => el.style.display = 'none');
                updateElement(mainTitle, el => el.style.display = 'none');
                updateElement(cityTimersPanel, el => el.style.display = 'block');
                if (isMobile && infoPanel) infoPanel.classList.remove('visible');
                break;
            case 'error':
                 updateElement(simulateBtn, el => { el.disabled = true; el.textContent = 'Ошибка загрузки'; });
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
            if(infoPanel) infoPanel.style.display = 'flex';
            if(panelToggleBtn) panelToggleBtn.style.display = 'block';
        } else {
            if(infoPanel) infoPanel.style.display = 'flex';
            if(panelToggleBtn) panelToggleBtn.style.display = 'none';
        }
    }

    function setupEventListeners() {
        if (simulateBtn) simulateBtn.addEventListener('click', startSimulation);
    
        if (isMobile && panelToggleBtn && infoPanel && panelHeader) {
            panelToggleBtn.addEventListener('click', () => infoPanel.classList.add('visible'));
            panelHeader.addEventListener('click', () => infoPanel.classList.remove('visible'));
        }
        
        document.addEventListener('click', (e) => {
            if (e.target && e.target.classList.contains('iodine-info-btn') && iodinePopup) {
                iodinePopup.style.display = 'block';
            }
        });
        
        if (closePopupBtn) {
            closePopupBtn.addEventListener('click', () => { if (iodinePopup) iodinePopup.style.display = 'none'; });
        }
        
        window.addEventListener('click', (e) => {
            if (e.target === iodinePopup) {
                iodinePopup.style.display = 'none';
            }
        });
    }

    async function fetchWindData() {
        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=${NPP_COORDS[0]}&lon=${NPP_COORDS[1]}&appid=${API_KEY}&units=metric&lang=ru`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Код ответа API: ${response.status}`);
            
            const data = await response.json();
            if (!data.wind || typeof data.wind.speed === 'undefined') throw new Error('API вернул некорректные данные');

            windData = { speed: data.wind.speed, deg: data.wind.deg || 0 };
            updateWindInfo();
            setAppState('ready');
        } catch(error) {
            console.error("Критическая ошибка загрузки данных:", error.message);
            if (windInfoPanel) windInfoPanel.innerHTML = "<strong>Не удалось получить данные.</strong>";
            setAppState('error');
        }
    }

    function startSimulation() {
        if (appState.status !== 'ready') return;
        if (windData.speed === 0) { alert("Ветер отсутствует. Распространение аэрозолей невозможно."); return; }
        
        setAppState('simulating');
        
        if (simulationInterval) clearInterval(simulationInterval);
        if (plumeLayer) map.removeLayer(plumeLayer);
        resetTimers();
        
        let totalDistance = 0;
        simulationInterval = setInterval(() => {
            totalDistance += windData.speed * (UPDATE_INTERVAL_MS / 1000) * SIMULATION_SPEED_MULTIPLIER;
            const plumePoints = createPlumePolygon(totalDistance);
            
            if (!plumeLayer) plumeLayer = L.polygon(plumePoints, { color: 'red', fillColor: '#f03', fillOpacity: 0.5, weight: 1 }).addTo(map);
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
                const hours = Math.floor(timeToArrivalSeconds / 3600);
                const minutes = Math.floor((timeToArrivalSeconds % 3600) / 60);
                
                const arrivalTimeText = `~ ${hours} ч. ${minutes} мин.`;
                updateCityTimer(cityName, arrivalTimeText);
                
                const iodineEffectiveness = getIodineEffectiveness(hours);
                const tooltipContent = `<div style="text-align:center;line-height:1.5;"><strong>${arrivalTimeText}</strong><br>Эфф. йода: ${iodineEffectiveness} <span class="iodine-info-btn" title="Что это значит?">(?)</span></div>`;
                
                const markerToUpdate = cityMarkers[cityName];
                if (markerToUpdate) markerToUpdate.setTooltipContent(tooltipContent).openTooltip();
            }
        }
    }
    
    function resetTimers() {
        for (const cityName in CITIES) {
            updateCityTimer(cityName, "-");
            const marker = cityMarkers[cityName];
            if (marker && marker.isTooltipOpen()) marker.closeTooltip().setTooltipContent(cityName);
        }
        arrivedCities = {};
    }
    
    function updateWindInfo() {
        if (typeof windData.speed !== "undefined") {
            const directionText = windData.deg ? `${Math.round(windData.deg)}°` : "Н/Д";
            if (windInfoPanel) windInfoPanel.innerHTML = `Ветер: <strong>${windData.speed.toFixed(1)} м/с</strong>, направление: <strong>${directionText}</strong><i class="arrow" style="transform: rotate(${windData.deg}deg);">↑</i>`;
        }
    }

    function updateCityTimer(cityName, text) {
        const timerElement = document.getElementById(`timer-${cityName.toLowerCase().replace(/ /g, "-")}`);
        if (timerElement) timerElement.innerText = text;
    }
    
    function getIodineEffectiveness(hours) {
        if (hours <= 0.5) return "90-100%"; if (hours <= 1) return "~75%"; if (hours <= 2) return "~66%";
        if (hours <= 5) return "50%"; if (hours <= 8) return "очень низкая"; return "нецелесообразна";
    }

    function createPlumePolygon(radius) {
        const center = L.latLng(NPP_COORDS);
        const points = [center];
        const startAngle = windData.deg - PLUME_SPREAD_ANGLE / 2;
        for (let i = 0; i <= 20; i++) {
            const angle = startAngle + (i / 20) * PLUME_SPREAD_ANGLE;
            points.push(getDestinationPoint(center, angle, radius));
        }
        return points;
    }

    function getDestinationPoint(startPoint, bearing, distance) {
        const R = 6371e3;
        const lat1 = startPoint.lat * Math.PI / 180, lon1 = startPoint.lng * Math.PI / 180, brng = bearing * Math.PI / 180;
        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance / R) + Math.cos(lat1) * Math.sin(distance / R) * Math.cos(brng));
        const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(distance / R) * Math.cos(lat1), Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2));
        return L.latLng(lat2 * 180 / Math.PI, lon2 * 180 / Math.PI);
    }
    
    function isMarkerInsidePolygon(markerLatLng, polygonLayer) {
        let inside = false;
        const x = markerLatLng.lng, y = markerLatLng.lat, points = polygonLayer.getLatLngs()[0];
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].lng, yi = points[i].lat, xj = points[j].lng, yj = points[j].lat;
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    initializeApp();
});
