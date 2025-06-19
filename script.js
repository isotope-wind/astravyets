// Ждем, пока вся структура страницы (DOM) будет загружена
document.addEventListener('DOMContentLoaded', () => {
    // --- 1. КОНФИГУРАЦИЯ И КОНСТАНТЫ ---
    const API_KEY = 'd243e79aea8a70aaeeeda6f16f6ccf63';
    const NPP_COORDS = [54.773, 26.096];
    const CITIES = {
        "Вильнюс": [54.687, 25.279], "Минск": [53.904, 27.561], "Варшава": [52.229, 21.012], "Рига": [56.949, 24.105],
        "Каунас": [54.898, 23.903], "Даугавпилс": [55.874, 26.516], "Киев": [50.450, 30.523], "Новогрудок": [53.596, 25.827],
        "Жодино": [54.093, 28.340], "Гродно": [53.669, 23.826], "Брест": [52.097, 23.734], "Москва": [55.755, 37.617], "Витебск": [55.190, 30.205]
    };
    const SIMULATION_SPEED_MULTIPLIER = 3600; // 1 сек. реального времени = 1 час симуляции
    const UPDATE_INTERVAL_MS = 100;
    const PLUME_SPREAD_ANGLE = 45;

    // --- 2. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И UI ЭЛЕМЕНТЫ ---
    let map, windData = {}, simulationInterval = null, plumeLayer = null, cityMarkers = {}, arrivedCities = {};

    const windInfoPanel = document.getElementById('windInfo');
    const simulateBtn = document.getElementById('simulateBtn');
    const mainTitle = document.getElementById('mainTitle');
    const cityTimersPanel = document.getElementById('cityTimers');
    const iodinePopup = document.getElementById('iodine-tooltip');
    const closePopupBtn = document.getElementById('close-popup-btn');

    // --- 3. ФУНКЦИИ ИНИЦИАЛИЗАЦИИ И СЕТИ ---
    function initMap() {
        map = L.map('map', {zoomControl: false}).setView(NPP_COORDS, 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
        L.marker(NPP_COORDS, { icon: L.divIcon({ className: 'npp-icon', html: '☢️' }) }).addTo(map).bindPopup("Белорусская АЭС");
        for (const cityName in CITIES) {
            const marker = L.marker(CITIES[cityName]).addTo(map).bindPopup(cityName);
            marker.bindTooltip(cityName, { permanent: false, direction: 'top' });
            cityMarkers[cityName] = marker;
        }
    }

    async function fetchWindData() {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${NPP_COORDS[0]}&lon=${NPP_COORDS[1]}&appid=${API_KEY}&units=metric&lang=ru`;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Ошибка API: ${response.statusText}`);
            const data = await response.json();
            windData = { speed: data.wind.speed, deg: data.wind.deg };
            updateWindInfo();
        } catch (error) {
            console.error("Ошибка при получении данных о погоде:", error);
            windInfoPanel.innerHTML = `<strong>Не удалось получить данные о погоде.</strong>`;
        }
    }

    // --- 4. ФУНКЦИИ ОБНОВЛЕНИЯ ИНТЕРФЕЙСА (UX) ---
    function updateWindInfo() {
        if (!windData.speed) return;
        const windDirection = windData.deg ? `${windData.deg}°` : 'Н/Д';
        windInfoPanel.innerHTML = `Ветер: <strong>${windData.speed.toFixed(1)} м/с</strong>, направление: <strong>${windDirection}</strong><i class="arrow" style="transform: rotate(${windData.deg || 0}deg);">↑</i>`;
    }
    
    function resetTimers() {
        // Возвращаем кнопку в исходное состояние
        simulateBtn.classList.remove('active');
        simulateBtn.innerText = '▶︎ Начать симуляцию';

        // Сбрасываем таймеры и тултипы
        for (const cityName in CITIES) {
            updateCityTimer(cityName, '-');
            const marker = cityMarkers[cityName];
            if (marker && marker.isTooltipOpen()) {
                marker.closeTooltip();
                marker.setTooltipContent(cityName);
            }
        }
        arrivedCities = {};
    }
    
    function updateCityTimer(city, text) {
        const timerElement = document.getElementById(`timer-${city.toLowerCase().replace(/ /g, '-')}`);
        if (timerElement) timerElement.innerText = text;
    }

    // --- 5. ОСНОВНАЯ ЛОГИКА СИМУЛЯЦИИ ---
    function startSimulation() {
        if (!windData.speed || windData.speed === 0) { 
            alert('Данные о ветре еще не загружены или ветер отсутствует. Пожалуйста, подождите или попробуйте позже.'); 
            return; 
        }
        
        // UX: Прячем заголовок, меняем кнопку, показываем результаты
        mainTitle.style.opacity = '0';
        mainTitle.style.pointerEvents = 'none';
        simulateBtn.classList.add('active');
        simulateBtn.innerText = 'Симуляция запущена...';
        cityTimersPanel.style.display = 'block';

        // Сброс предыдущей симуляции
        if (simulationInterval) clearInterval(simulationInterval);
        if (plumeLayer) map.removeLayer(plumeLayer);
        resetTimers();

        let totalDistance = 0;
        simulationInterval = setInterval(() => {
            const timeDelta = (UPDATE_INTERVAL_MS / 1000) * SIMULATION_SPEED_MULTIPLIER;
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
                // HTML-содержимое для тултипа с кликабельной иконкой
                const tooltipContent = `
                    <div style="text-align: center; line-height: 1.5;">
                        <strong>${arrivalTimeText}</strong><br>
                        Эфф. йода: ${iodineEffectiveness} <span class="iodine-info-btn" title="Что это значит?">(?)</span>
                    </div>`;

                const markerToUpdate = cityMarkers[cityName];
                if (markerToUpdate) {
                    markerToUpdate.setTooltipContent(tooltipContent);
                    markerToUpdate.openTooltip();
                }
            }
        }
    }
    
    // --- 6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
    function getIodineEffectiveness(hours) {
        if (hours <= 0.5) return '90-100%';
        if (hours <= 1) return '~75%';
        if (hours <= 2) return '~66%';
        if (hours <= 5) return '50%';
        if (hours <= 8) return 'очень низкая';
        return 'нецелесообразна';
    }

    function createPlumePolygon(radius) {
        const center = L.latLng(NPP_COORDS), points = [center];
        const startAngle = windData.deg - PLUME_SPREAD_ANGLE / 2;
        for (let i = 0; i <= 20; i++) {
            const angle = startAngle + (i / 20) * PLUME_SPREAD_ANGLE;
            points.push(getDestinationPoint(center, angle, radius));
        }
        return points;
    }
    
    function getDestinationPoint(startPoint, bearing, distance) {
        const R = 6371e3, lat1 = startPoint.lat * Math.PI / 180, lon1 = startPoint.lng * Math.PI / 180, brng = bearing * Math.PI / 180;
        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance / R) + Math.cos(lat1) * Math.sin(distance / R) * Math.cos(brng));
        const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(distance / R) * Math.cos(lat1), Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2));
        return L.latLng(lat2 * 180 / Math.PI, lon2 * 180 / Math.PI);
    }
    
    function isMarkerInsidePolygon(markerLatLng, polygonLayer) {
        let inside = false; const x = markerLatLng.lng, y = markerLatLng.lat; const points = polygonLayer.getLatLngs()[0];
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].lng, yi = points[i].lat, xj = points[j].lng, yj = points[j].lat;
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    // --- 7. ОБРАБОТЧИКИ СОБЫТИЙ ---
    simulateBtn.addEventListener('click', startSimulation);

    // Обработчик для показа поп-апа с информацией о йоде (через делегирование)
    document.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('iodine-info-btn')) {
            iodinePopup.style.display = 'block';
        }
    });
    // Обработчик для закрытия поп-апа
    closePopupBtn.addEventListener('click', function() {
        iodinePopup.style.display = 'none';
    });
    // Закрытие поп-апа по клику на фон (за его пределами)
    window.addEventListener('click', function(e) {
        if (e.target === iodinePopup) {
            iodinePopup.style.display = 'none';
        }
    });
    
    // --- 8. ЗАПУСК СКРИПТА ---
    initMap();
    fetchWindData();
    setInterval(fetchWindData, 5 * 60 * 1000); // Обновлять погоду каждые 5 минут
});
