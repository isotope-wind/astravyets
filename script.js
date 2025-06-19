document.addEventListener('DOMContentLoaded', () => {

    // --- 1. СОСТОЯНИЕ И КОНСТАНТЫ ---
    const appState = { status: 'loading' }; // 'loading', 'ready', 'simulating'
    const API_KEY = 'd243e79aea8a70aaeeeda6f16f6ccf63';
    const NPP_COORDS = [54.773, 26.096];
    const CITIES = {"Вильнюс":[54.687,25.279],"Минск":[53.904,27.561],"Варшава":[52.229,21.012],"Рига":[56.949,24.105],"Каунас":[54.898,23.903],"Даугавпилс":[55.874,26.516],"Киев":[50.45,30.523],"Новогрудок":[53.596,25.827],"Жодино":[54.093,28.34],"Гродно":[53.669,23.826],"Брест":[52.097,23.734],"Москва":[55.755,37.617],"Витебск":[55.19,30.205]};
    const SIMULATION_SPEED_MULTIPLIER = 3600; const UPDATE_INTERVAL_MS = 100; const PLUME_SPREAD_ANGLE = 45;

    // --- 2. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И DOM-ЭЛЕМЕНТЫ ---
    let map, windData = {}, simulationInterval = null, plumeLayer = null, cityMarkers = {}, arrivedCities = {};
    const windInfoPanel = document.getElementById('windInfo'), simulateBtn = document.getElementById('simulateBtn'), mainTitle = document.getElementById('mainTitle'), cityTimersPanel = document.getElementById('cityTimers'), iodinePopup = document.getElementById('iodine-tooltip'), closePopupBtn = document.getElementById('close-popup-btn'), infoPanel = document.getElementById('infoPanel'), panelToggleBtn = document.getElementById('panelToggleBtn'), panelHeader = document.querySelector('.panel-header');
    const isMobile = window.innerWidth <= 768;

    // --- 3. ГЛАВНАЯ ЛОГИКА ---
    function initializeApp() {
        if(isMobile) { infoPanel.style.display = 'none'; }
        else { panelToggleBtn.style.display = 'none'; infoPanel.style.display = 'flex';}
        
        initMap();
        setupEventListeners();
        setAppState('loading'); // Устанавливаем начальное состояние
    }
    
    function setAppState(newState) {
        appState.status = newState;
        updateUIForState(newState);
    }
    
    function updateUIForState(state) {
        if (state === 'loading') {
            simulateBtn.disabled = true; simulateBtn.textContent = 'Загрузка данных о ветре...';
        } else if (state === 'ready') {
            simulateBtn.disabled = false; simulateBtn.textContent = '▶︎ Начать симуляцию';
        } else if (state === 'simulating') {
            simulateBtn.disabled = true; simulateBtn.textContent = 'Симуляция запущена...';
            // После начала симуляции, кнопка исчезает, так что текст не так важен
            simulateBtn.style.display = 'none'; 
            mainTitle.style.display = 'none';
        }
    }
    
    function initMap() {
        if (map) return;
        try {
            map = L.map('map', {zoomControl: false}).setView(NPP_COORDS, isMobile ? 5 : 6);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
            L.marker(NPP_COORDS, { icon: L.divIcon({ className: 'npp-icon', html: '☢️' }) }).addTo(map).bindPopup("Белорусская АЭС");
            for (const cityName in CITIES) {
                const marker = L.marker(CITIES[cityName]).addTo(map).bindPopup(cityName);
                marker.bindTooltip(cityName, { permanent: false, direction: 'top' });
                cityMarkers[cityName] = marker;
            }
        } catch (e) { console.error("Не удалось инициализировать карту:", e); }
    }
    
    async function fetchWindData() {
        if (appState.status === 'simulating') return; // Не обновляем погоду во время симуляции
        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=${NPP_COORDS[0]}&lon=${NPP_COORDS[1]}&appid=${API_KEY}&units=metric&lang=ru`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Ошибка API: ${response.statusText}`);
            const data = await response.json();
            windData = {speed: data.wind.speed || 0, deg: data.wind.deg || 0};
            updateWindInfo();
            if(appState.status !== 'simulating') setAppState('ready');
        } catch(error) {
            console.error("Критическая ошибка загрузки данных:", error);
            windInfoPanel.innerHTML = "<strong>Не удалось получить данные.</strong>";
            simulateBtn.textContent = 'Ошибка загрузки';
            simulateBtn.disabled = true;
        }
    }

    function setupEventListeners() {
        simulateBtn.addEventListener('click', startSimulation);
        if (isMobile) {
            panelToggleBtn.addEventListener('click', () => { infoPanel.style.display = 'flex'; infoPanel.classList.add('visible'); });
            panelHeader.addEventListener('click', () => { infoPanel.classList.remove('visible'); });
        }
        document.addEventListener('click', (e) => {
            if (e.target && e.target.classList.contains('iodine-info-btn')) { iodinePopup.style.display = 'block'; }
        });
        closePopupBtn.addEventListener('click', () => { iodinePopup.style.display = 'none'; });
        window.addEventListener('click', (e) => { if (e.target === iodinePopup) { iodinePopup.style.display = 'none'; } });
    }

    function startSimulation() {
        if (appState.status !== 'ready') return;
        if (windData.speed === 0) { alert("Ветер отсутствует. Распространение невозможно."); return; }
        
        setAppState('simulating');
        if (isMobile) { panelToggleBtn.style.display = 'block'; }
        else { infoPanel.style.display = 'flex'; }
        cityTimersPanel.style.display = 'block';
        
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
    
    function checkCityArrival(){
        if(!plumeLayer)return;
        for(const cityName in CITIES){
            if(!arrivedCities[cityName]&&isMarkerInsidePolygon(L.latLng(CITIES[cityName]),plumeLayer)){
                arrivedCities[cityName]=!0;
                const distanceToCity=map.distance(NPP_COORDS,CITIES[cityName]),
                      timeToArrivalSeconds=distanceToCity/windData.speed,
                      hours=Math.floor(timeToArrivalSeconds/3600),
                      minutes=Math.floor(timeToArrivalSeconds%3600/60);
                const arrivalTimeText=`~ ${hours} ч. ${minutes} мин.`;
                updateCityTimer(cityName,arrivalTimeText);
                const iodineEffectiveness=getIodineEffectiveness(hours);
                const tooltipContent=`<div style="text-align:center;line-height:1.5;"><strong>${arrivalTimeText}</strong><br>Эфф. йода: ${iodineEffectiveness} <span class="iodine-info-btn" title="Что это значит?">(?)</span></div>`;
                const markerToUpdate=cityMarkers[cityName];
                if(markerToUpdate){
                    markerToUpdate.setTooltipContent(tooltipContent);
                    markerToUpdate.openTooltip();
                }
            }
        }
    }
    
    function resetTimers(){
        for(const cityName in CITIES){
            updateCityTimer(cityName,"-");
            const marker=cityMarkers[cityName];
            if(marker&&marker.isTooltipOpen()){
                marker.closeTooltip();
                marker.setTooltipContent(cityName);
            }
        }
        arrivedCities={};
    }
    
    function updateWindInfo(){
        if(typeof windData.speed!=="undefined"){
            const text=windData.deg?`${windData.deg}°`:"Н/Д";
            windInfoPanel.innerHTML=`Ветер: <strong>${windData.speed.toFixed(1)} м/с</strong>, направление: <strong>${text}</strong><i class="arrow" style="transform: rotate(${windData.deg||0}deg);">↑</i>`
        }
    }

    function updateCityTimer(cityName,text){
        const timerElement=document.getElementById(`timer-${cityName.toLowerCase().replace(/ /g,"-")}`);
        if(timerElement) timerElement.innerText=text;
    }
    
    function getIodineEffectiveness(hours){
        if(hours<=.5) return "90-100%";
        if(hours<=1) return "~75%";
        if(hours<=2) return "~66%";
        if(hours<=5) return "50%";
        if(hours<=8) return "очень низкая";
        return "нецелесообразна";
    }

    function createPlumePolygon(radius){
        const center=L.latLng(NPP_COORDS),points=[center],startAngle=windData.deg-PLUME_SPREAD_ANGLE/2;
        for(let i=0;i<=20;i++){
            const angle=startAngle+(i/20)*PLUME_SPREAD_ANGLE;
            points.push(getDestinationPoint(center,angle,radius));
        }
        return points;
    }

    function getDestinationPoint(startPoint,bearing,distance){
        const R=6371e3,lat1=startPoint.lat*Math.PI/180,lon1=startPoint.lng*Math.PI/180,brng=bearing*Math.PI/180;
        const lat2=Math.asin(Math.sin(lat1)*Math.cos(distance/R)+Math.cos(lat1)*Math.sin(distance/R)*Math.cos(brng));
        const lon2=lon1+Math.atan2(Math.sin(brng)*Math.sin(distance/R)*Math.cos(lat1),Math.cos(distance/R)-Math.sin(lat1)*Math.sin(lat2));
        return L.latLng(lat2*180/Math.PI,lon2*180/Math.PI);
    }
    
    function isMarkerInsidePolygon(markerLatLng,polygonLayer){
        let inside=!1;
        const x=markerLatLng.lng,y=markerLatLng.lat,points=polygonLayer.getLatLngs()[0];
        for(let i=0,j=points.length-1;i<points.length;j=i++){
            const xi=points[i].lng,yi=points[i].lat,xj=points[j].lng,yj=points[j].lat;
            const intersect=(yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi;
            if(intersect) inside=!inside;
        }
        return inside;
    }

    // Запускаем всё
    initializeApp();
    
    fetchWindData().then(() => {
        setAppState('ready');
    });
});
