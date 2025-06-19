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
		"Москва": [55.755, 37.617],
		"Витебск": [55.190, 30.205]
    };
    
    // Параметры симуляции
    const SIMULATION_SPEED_MULTIPLIER = 3600; // 1 секунда реального времени = 3600 секунд (1 час) симуляции
    const UPDATE_INTERVAL_MS = 100; // Обновление анимации 10 раз в секунду
    const PLUME_SPREAD_ANGLE = 45; // Угол "конуса" облака в градусах


    // --- 2. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И UI ЭЛЕМЕНТЫ ---
    let map; // Переменная для хранения объекта карты
    let windData = {}; // Объект для хранения данных о ветре
    let simulationInterval = null; // Для остановки интервала анимации
    let plumeLayer = null; // Слой на карте для "облака"
    let arrivedCities = {}; // Для отслеживания городов, которых достигло облако

    const windInfoPanel = document.getElementById('windInfo');
    const simulateBtn = document.getElementById('simulateBtn');


    // --- 3. ИНИЦИАЛИЗАЦИЯ КАРТЫ ---
    function initMap() {
        map = L.map('map').setView(NPP_COORDS, 7); // Центр на АЭС, зум 7

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // Добавляем маркер для АЭС
        L.marker(NPP_COORDS, {
            icon: L.divIcon({ className: 'npp-icon', html: '☢️' })
        }).addTo(map).bindPopup("Белорусская АЭС");

        // Добавляем маркеры для городов
        for (const cityName in CITIES) {
            L.marker(CITIES[cityName]).addTo(map).bindPopup(cityName);
        }
    }


    // --- 4. ПОЛУЧЕНИЕ ДАННЫХ О ПОГОДЕ ---
    async function fetchWindData() {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${NPP_COORDS[0]}&lon=${NPP_COORDS[1]}&appid=${API_KEY}&units=metric&lang=ru`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Ошибка API: ${response.statusText}`);
            }
            const data = await response.json();

            windData = {
                speed: data.wind.speed, // в м/с
                deg: data.wind.deg      // в градусах
            };
            
            updateWindInfo();

        } catch (error) {
            console.error("Ошибка при получении данных о погоде:", error);
            windInfoPanel.innerHTML = `<strong>Не удалось получить данные о погоде.</strong><br>Проверьте API-ключ или попробуйте позже.`;
        }
    }


    // --- 5. ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ---
    function updateWindInfo() {
        if (!windData.speed) return;
        const windDirection = windData.deg ? `${windData.deg}°` : 'Н/Д';
        windInfoPanel.innerHTML = `
            Ветер над АЭС: <strong>${windData.speed.toFixed(1)} м/с</strong>, 
            направление: <strong>${windDirection}</strong>
            <i class="arrow" style="transform: rotate(${windData.deg || 0}deg);">↑</i>
        `;
    }

    function updateCityTimer(city, text) {
        // ID таймера должен быть в формате "timer-город" в нижнем регистре
        const timerElement = document.getElementById(`timer-${city.toLowerCase()}`);
        if (timerElement) {
            timerElement.innerText = text;
        }
    }

    function resetTimers() {
        for (const cityName in CITIES) {
            updateCityTimer(cityName, '-');
        }
        arrivedCities = {}; // Сбрасываем трекер достигнутых городов
    }
    

    // --- 6. ЛОГИКА СИМУЛЯЦИИ ---
    function startSimulation() {
        // 1. Проверка, есть ли данные о ветре
        if (!windData.speed) {
            alert('Данные о ветре еще не загружены. Пожалуйста, подождите.');
            return;
        }

        // 2. Сброс предыдущей симуляции
        if (simulationInterval) clearInterval(simulationInterval);
        if (plumeLayer) map.removeLayer(plumeLayer);
        resetTimers();
        
        // 3. Инициализация симуляции
        let totalDistance = 0; // Общее расстояние, пройденное облаком (в метрах)
        let totalSeconds = 0;

        simulationInterval = setInterval(() => {
            // Расчет смещения за один "тик"
            const timeDelta = (UPDATE_INTERVAL_MS / 1000) * SIMULATION_SPEED_MULTIPLIER;
            totalSeconds += timeDelta;
            totalDistance += windData.speed * timeDelta;
            
            // Расчет формы облака (конуса)
            const plumePoints = createPlumePolygon(totalDistance);
            
            // Отрисовка или обновление облака на карте
            if (!plumeLayer) {
                plumeLayer = L.polygon(plumePoints, { color: 'red', fillColor: '#f03', fillOpacity: 0.5, weight: 1 }).addTo(map);
            } else {
                plumeLayer.setLatLngs(plumePoints);
            }
            
            // Проверка достижения городов
            checkCityArrival();
            
        }, UPDATE_INTERVAL_MS);
    }
    
    function createPlumePolygon(radius) {
        // Создаем полигон в форме сектора (конуса)
        const center = L.latLng(NPP_COORDS);
        const points = [center];
        
        const startAngle = windData.deg - PLUME_SPREAD_ANGLE / 2;
        const endAngle = windData.deg + PLUME_SPREAD_ANGLE / 2;
        
        // Создаем "дугу" из 20 точек для сглаживания
        for (let i = 0; i <= 20; i++) {
            const angle = startAngle + (i / 20) * PLUME_SPREAD_ANGLE;
            points.push(getDestinationPoint(center, angle, radius));
        }
        return points;
    }

    function checkCityArrival() {
        if (!plumeLayer) return;

        for (const cityName in CITIES) {
            if (!arrivedCities[cityName]) { // Проверяем, только если город еще не "накрыт"
                const cityLatLng = L.latLng(CITIES[cityName]);

                // Используем bounding box для простой и быстрой проверки
                if (plumeLayer.getBounds().contains(cityLatLng)) {
                    // Более точная проверка: точка внутри полигона
                    if (isMarkerInsidePolygon(cityLatLng, plumeLayer)) {
                        arrivedCities[cityName] = true;
                        
                        const distanceToCity = map.distance(NPP_COORDS, CITIES[cityName]); // Расстояние в метрах
                        const timeToArrivalSeconds = distanceToCity / windData.speed; // Время в секундах

                        const hours = Math.floor(timeToArrivalSeconds / 3600);
                        const minutes = Math.floor((timeToArrivalSeconds % 3600) / 60);
                        updateCityTimer(cityName, `~ ${hours} ч. ${minutes} мин.`);
                    }
                }
            }
        }
    }


    // --- 7. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

    /**
     * Вычисляет координаты точки назначения по начальной точке, азимуту и расстоянию.
     * @param {L.latLng} startPoint - Начальные координаты
     * @param {number} bearing - Азимут в градусах (направление движения)
     * @param {number} distance - Расстояние в метрах
     * @returns {L.latLng} - Координаты точки назначения
     */
    function getDestinationPoint(startPoint, bearing, distance) {
        const R = 6371e3; // Радиус Земли в метрах
        const lat1 = startPoint.lat * Math.PI / 180;
        const lon1 = startPoint.lng * Math.PI / 180;
        const brng = bearing * Math.PI / 180;

        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance / R) +
                              Math.cos(lat1) * Math.sin(distance / R) * Math.cos(brng));
        const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(distance / R) * Math.cos(lat1),
                                     Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2));
        
        return L.latLng(lat2 * 180 / Math.PI, lon2 * 180 / Math.PI);
    }

    /**
     * Проверяет, находится ли маркер внутри полигона (алгоритм Ray-casting)
     * @param {L.latLng} markerLatLng - Координаты маркера
     * @param {L.polygon} polygonLayer - Слой полигона
     * @returns {boolean}
     */
    function isMarkerInsidePolygon(markerLatLng, polygonLayer) {
        let inside = false;
        const x = markerLatLng.lng;
        const y = markerLatLng.lat;
        const points = polygonLayer.getLatLngs()[0];
    
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].lng, yi = points[i].lat;
            const xj = points[j].lng, yj = points[j].lat;
    
            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }


    // --- 8. ЗАПУСК СКРИПТА ---
    initMap();
    fetchWindData(); // Первоначальная загрузка данных
    setInterval(fetchWindData, 15 * 60 * 1000); // Обновлять данные о погоде каждые 15 минут

    // Назначаем обработчик на кнопку
    simulateBtn.addEventListener('click', startSimulation);
});