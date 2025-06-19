// Ждем, пока вся структура страницы (DOM) будет загружена
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. КОНФИГУРАЦИЯ ---
    // ВАЖНО: Замените 'YOUR_API_KEY' на ваш ключ от OpenWeatherMap!
    const API_KEY = 'd243e79aea8a70aaeeeda6f16f6ccf63';
    
    // Координаты Белорусской АЭС
    const NPP_COORDS = [54.773, 26.096];

    // Координаты ключевых городов
        const CITIES = {
        "Вильнюс": [54.687, 25.279],
        "Минск": [53.904, 27.561],
        "Варшава": [52.229, 21.012],
        "Рига": [56.949, 24.105],
        "Каунас": [54.898, 23.903],
        "Даугавпилс": [55.874, 26.516],
        "Киев": [50.450, 30.523],
        "Новогрудок": [53.596, 25.827],
        "Жодино": [54.093, 28.340],
        "Гродно": [53.669, 23.826],
        "Брест": [52.097, 23.734],
        "Москва": [55.755, 37.617],
        "Витебск": [55.190, 30.205]
    };
    
    const SIMULATION_SPEED_MULTIPLIER = 3600; 
    const UPDATE_INTERVAL_MS = 100;
    const PLUME_SPREAD_ANGLE = 45;

    // --- 2. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И UI ЭЛЕМЕНТЫ ---
    let map;
    let windData = {};
    let simulationInterval = null;
    let plumeLayer = null;
    let cityMarkers = {};  // <<-- ИЗМЕНЕНИЕ: Добавили хранилище для маркеров
    let arrivedCities = {};

    const windInfoPanel = document.getElementById('windInfo');
    const simulateBtn = document.getElementById('simulateBtn');

    // --- 3. ИНИЦИАЛИЗАЦИЯ КАРТЫ ---
    function initMap() {
        map = L.map('map').setView(NPP_COORDS, 6);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        L.marker(NPP_COORDS, {
            icon: L.divIcon({ className: 'npp-icon', html: '☢️' })
        }).addTo(map).bindPopup("Белорусская АЭС");
        
        // <<-- ИЗМЕНЕНИЕ: Теперь сохраняем маркеры и привязываем тултипы -->>
        for (const cityName in CITIES) {
            const marker = L.marker(CITIES[cityName])
                .addTo(map)
                .bindPopup(cityName);

            marker.bindTooltip(cityName, { permanent: false, direction: 'top' });
            cityMarkers[cityName] = marker;
        }
    }

    // --- 4. ПОЛУЧЕНИЕ ДАННЫХ О ПОГОДЕ (без изменений) ---
    async function fetchWindData() { /* ... код без изменений ... */ }

    // --- 5. ОБНОВЛЕНИЕ ИНТЕРФЕЙСА (без изменений) ---
    function updateWindInfo() { /* ... код без изменений ... */ }
    function updateCityTimer(city, text) { /* ... код без изменений ... */ }
    function resetTimers() { /* ... код без изменений ... */ }

    // --- 6. ЛОГИКА СИМУЛЯЦИИ ---
    function startSimulation() {
        // ... код без изменений ...
    }
    
    function createPlumePolygon(radius) {
        // ... код без изменений ...
    }
    
    // <<-- ИЗМЕНЕНИЕ: Эта функция была обновлена для работы с тултипами -->>
    function checkCityArrival() {
        if (!plumeLayer) return;

        for (const cityName in CITIES) {
            if (!arrivedCities[cityName]) {
                const cityLatLng = L.latLng(CITIES[cityName]);

                if (isMarkerInsidePolygon(cityLatLng, plumeLayer)) {
                    arrivedCities[cityName] = true;
                    
                    const distanceToCity = map.distance(NPP_COORDS, CITIES[cityName]);
                    const timeToArrivalSeconds = distanceToCity / windData.speed;
                    const hours = Math.floor(timeToArrivalSeconds / 3600);
                    const minutes = Math.floor((timeToArrivalSeconds % 3600) / 60);
                    
                    const arrivalTimeText = `~ ${hours} ч. ${minutes} мин.`;
                    
                    // Обновляем таймер на боковой панели
                    updateCityTimer(cityName, arrivalTimeText);

                    // Находим маркер и обновляем его тултип
                    const markerToUpdate = cityMarkers[cityName];
                    if (markerToUpdate) {
                        markerToUpdate.setTooltipContent(arrivalTimeText);
                        markerToUpdate.openTooltip(); // Делаем тултип постоянно видимым
                    }
                }
            }
        }
    }
    
    // --- 7. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (без изменений) ---
    function getDestinationPoint(startPoint, bearing, distance) { /* ... код без изменений ... */ }
    function isMarkerInsidePolygon(markerLatLng, polygonLayer) { /* ... код без изменений ... */ }

    // --- 8. ЗАПУСК СКРИПТА ---
    initMap();
    fetchWindData();
    setInterval(fetchWindData, 15 * 60 * 1000); 

    simulateBtn.addEventListener('click', startSimulation);

    // Вспомогательные функции, которые я скрыл выше для краткости.
    // Они нужны, но остались без изменений
    async function fetchWindData() {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${NPP_COORDS[0]}&lon=${NPP_COORDS[1]}&appid=${API_KEY}&units=metric&lang=ru`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Ошибка API: ${response.statusText}`);
            }
            const data = await response.json();
            windData = {
                speed: data.wind.speed,
                deg: data.wind.deg
            };
            updateWindInfo();
        } catch (error) {
            console.error("Ошибка при получении данных о погоде:", error);
            windInfoPanel.innerHTML = `<strong>Не удалось получить данные о погоде.</strong><br>Проверьте API-ключ или попробуйте позже.`;
        }
    }
    function updateWindInfo() {
        if (!windData.speed) return;
        const windDirection = windData.deg ? `${windData.deg}°` : 'Н/Д';
        windInfoPanel.innerHTML = `Ветер над АЭС: <strong>${windData.speed.toFixed(1)} м/с</strong>, направление: <strong>${windDirection}</strong><i class="arrow" style="transform: rotate(${windData.deg || 0}deg);">↑</i>`;
    }
    function updateCityTimer(city, text) {
        const timerElement = document.getElementById(`timer-${city.toLowerCase().replace(' ', '-')}`); // fix for multi-word city names if any
        if (timerElement) {
            timerElement.innerText = text;
        }
    }
    function resetTimers() {
        for (const cityName in CITIES) {
            updateCityTimer(cityName, '-');
            const marker = cityMarkers[cityName];
            if (marker) {
                marker.closeTooltip();
                marker.setTooltipContent(cityName);
            }
        }
        arrivedCities = {};
    }
    function startSimulation() {
        if (!windData.speed) {
            alert('Данные о ветре еще не загружены. Пожалуйста, подождите.');
            return;
        }
        if (simulationInterval) clearInterval(simulationInterval);
        if (plumeLayer) map.removeLayer(plumeLayer);
        resetTimers();
        let totalDistance = 0;
        let totalSeconds = 0;
        simulationInterval = setInterval(() => {
            const timeDelta = (UPDATE_INTERVAL_MS / 1000) * SIMULATION_SPEED_MULTIPLIER;
            totalSeconds += timeDelta;
            totalDistance += windData.speed * timeDelta;
            const plumePoints = createPlumePolygon(totalDistance);
            if (!plumeLayer) {
                plumeLayer = L.polygon(plumePoints, { color: 'red', fillColor: '#f03', fillOpacity: 0.5, weight: 1 }).addTo(map);
            } else {
                plumeLayer.setLatLngs(plumePoints);
            }
            checkCityArrival();
        }, UPDATE_INTERVAL_MS);
    }
    function createPlumePolygon(radius) {
        const center = L.latLng(NPP_COORDS);
        const points = [center];
        const startAngle = windData.deg - PLUME_SPREAD_ANGLE / 2;
        const endAngle = windData.deg + PLUME_SPREAD_ANGLE / 2;
        for (let i = 0; i <= 20; i++) {
            const angle = startAngle + (i / 20) * PLUME_SPREAD_ANGLE;
            points.push(getDestinationPoint(center, angle, radius));
        }
        return points;
    }
    function getDestinationPoint(startPoint, bearing, distance) {
        const R = 6371e3;
        const lat1 = startPoint.lat * Math.PI / 180;
        const lon1 = startPoint.lng * Math.PI / 180;
        const brng = bearing * Math.PI / 180;
        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance / R) + Math.cos(lat1) * Math.sin(distance / R) * Math.cos(brng));
        const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(distance / R) * Math.cos(lat1), Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2));
        return L.latLng(lat2 * 180 / Math.PI, lon2 * 180 / Math.PI);
    }
    function isMarkerInsidePolygon(markerLatLng, polygonLayer) {
        let inside = false;
        const x = markerLatLng.lng;
        const y = markerLatLng.lat;
        const points = polygonLayer.getLatLngs()[0];
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].lng, yi = points[i].lat;
            const xj = points[j].lng, yj = points[j].lat;
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
});
