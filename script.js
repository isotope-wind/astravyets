document.addEventListener('DOMContentLoaded', () => {

    const API_KEY = 'd243e79aea8a70aaeeeda6f16f6ccf63';
    const NPP_COORDS = [54.773, 26.096];
    const CITIES = {"Вильнюс":[54.687,25.279],"Минск":[53.904,27.561],"Варшава":[52.229,21.012],"Рига":[56.949,24.105],"Каунас":[54.898,23.903],"Даугавпилс":[55.874,26.516],"Киев":[50.45,30.523],"Новогрудок":[53.596,25.827],"Жодино":[54.093,28.34],"Гродно":[53.669,23.826],"Брест":[52.097,23.734],"Москва":[55.755,37.617],"Витебск":[55.19,30.205]};
    const SIMULATION_SPEED_MULTIPLIER = 3600; const UPDATE_INTERVAL_MS = 100; const PLUME_SPREAD_ANGLE = 45;

    let map, windData = {}, simulationInterval = null, plumeLayer = null, cityMarkers = {}, arrivedCities = {};
    const windInfoPanel = document.getElementById('windInfo'), simulateBtn = document.getElementById('simulateBtn'), mainTitle = document.getElementById('mainTitle'),
    cityTimersPanel = document.getElementById('cityTimers'), iodinePopup = document.getElementById('iodine-tooltip'), closePopupBtn = document.getElementById('close-popup-btn'),
    infoPanel = document.getElementById('infoPanel'), panelToggleBtn = document.getElementById('panelToggleBtn'), panelHeader = document.querySelector('.panel-header');
    
    const isMobile = window.innerWidth <= 768;

    function initializeApp() {
        initMap(); setupEventListeners(); fetchWindData();
        setInterval(fetchWindData, 15 * 60 * 1000);
        if (isMobile) { infoPanel.classList.add('hidden'); }
    }
    
    function initMap() {
        if (map) return;
        try {
            map = L.map('map', {zoomControl: false}).setView(NPP_COORDS, isMobile ? 5 : 6);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
            L.marker(NPP_COORDS, { icon: L.divIcon({ className: 'npp-icon', html: '☢️' }) }).addTo(map).bindPopup("БелАЭС");
            for (const cityName in CITIES) {
                const marker = L.marker(CITIES[cityName]).addTo(map).bindPopup(cityName);
                marker.bindTooltip(cityName, { permanent: false, direction: 'top' });
                cityMarkers[cityName] = marker;
            }
        } catch (error) { console.error("Не удалось инициализировать карту:", error); }
    }

    async function fetchWindData() { /* без изменений */ }

    function setupEventListeners() {
        simulateBtn.addEventListener('click', startSimulation);
        if (isMobile) {
            panelToggleBtn.addEventListener('click', () => infoPanel.classList.toggle('hidden'));
            panelHeader.addEventListener('click', () => infoPanel.classList.toggle('hidden'));
        }
        document.addEventListener('click', (e) => {
            if (e.target && e.target.classList.contains('iodine-info-btn')) { iodinePopup.style.display = 'block'; }
        });
        closePopupBtn.addEventListener('click', () => { iodinePopup.style.display = 'none'; });
        window.addEventListener('click', (e) => { if (e.target === iodinePopup) { iodinePopup.style.display = 'none'; } });
    }

    function startSimulation() {
        if (typeof windData.speed === 'undefined') { alert('Данные о ветре еще не загружены.'); return; }
        if (windData.speed === 0) { alert("Ветер отсутствует. Распространение невозможно."); return; }
        
        mainTitle.style.display = 'none'; simulateBtn.style.display = 'none';
        panelToggleBtn.style.display = 'block'; cityTimersPanel.style.display = 'block';
        if (isMobile && infoPanel.classList.contains('hidden')) { infoPanel.classList.remove('hidden'); }

        if (simulationInterval) clearInterval(simulationInterval);
        if (plumeLayer) map.removeLayer(plumeLayer);
        resetTimers();

        let totalDistance = 0;
        simulationInterval = setInterval(() => {
            const timeDelta = (UPDATE_INTERVAL_MS / 1000) * SIMULATION_SPEED_MULTIPLIER;
            totalDistance += windData.speed * timeDelta;
            const plumePoints = createPlumePolygon(totalDistance);
            if (!plumeLayer) { plumeLayer = L.polygon(plumePoints, { color: 'red', fillColor: '#f03', fillOpacity: 0.5, weight: 1 }).addTo(map); }
            else { plumeLayer.setLatLngs(plumePoints); }
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
                if (markerToUpdate) { markerToUpdate.setTooltipContent(tooltipContent); markerToUpdate.openTooltip(); }
            }
        }
    }

    function resetTimers() {
        for (const cityName in CITIES) {
            updateCityTimer(cityName, '-');
            const marker = cityMarkers[cityName];
            if (marker && marker.isTooltipOpen()) { marker.closeTooltip(); marker.setTooltipContent(cityName); }
        }
        arrivedCities = {};
    }

    function getIodineEffectiveness(hours) { /* без изменений */ }
    function createPlumePolygon(radius) { /* без изменений */ }
    function getDestinationPoint(startPoint, bearing, distance) { /* без изменений */ }
    function isMarkerInsidePolygon(markerLatLng, polygonLayer) { /* без изменений */ }
    function updateCityTimer(city, text) { /* без изменений */ }
    function updateWindInfo() { /* без изменений */ }

    initializeApp();
    //Копипаста функций, чтобы ничего не потерялось
    updateWindInfo = function() {if(typeof windData.speed==="undefined")return;const e=windData.deg?`${windData.deg}°`:"Н/Д";windInfoPanel.innerHTML=`Ветер: <strong>${windData.speed.toFixed(1)} м/с</strong>, направление: <strong>${e}</strong><i class="arrow" style="transform: rotate(${windData.deg||0}deg);">↑</i>`},updateCityTimer=function(e,t){const n=document.getElementById(`timer-${e.toLowerCase().replace(/ /g,"-")}`);n&&(n.innerText=t)},getIodineEffectiveness=function(e){return e<=.5?"90-100%":e<=1?"~75%":e<=2?"~66%":e<=5?"50%":e<=8?"очень низкая":"нецелесообразна"},createPlumePolygon=function(e){const t=L.latLng(NPP_COORDS),n=[t];const i=windData.deg-22.5;for(let o=0;o<=20;o++){const r=i+45*o/20;n.push(getDestinationPoint(t,r,e))}return n},getDestinationPoint=function(e,t,n){const i=6371e3,o=e.lat*Math.PI/180,r=e.lng*Math.PI/180,s=t*Math.PI/180,a=Math.asin(Math.sin(o)*Math.cos(n/i)+Math.cos(o)*Math.sin(n/i)*Math.cos(s)),l=r+Math.atan2(Math.sin(s)*Math.sin(n/i)*Math.cos(o),Math.cos(n/i)-Math.sin(o)*Math.sin(a));return L.latLng(180*a/Math.PI,180*l/Math.PI)},isMarkerInsidePolygon=async function(e,t,n,i,o){const r=`https://api.openweathermap.org/data/2.5/weather?lat=${e[0]}&lon=${e[1]}&appid=${t}&units=metric&lang=ru`;try{const e=await fetch(r);if(!e.ok)throw new Error(`Ошибка API: ${e.statusText}`);const t=await e.json();windData={speed:t.wind.speed||0,deg:t.wind.deg||0},n()}catch(e){console.error("Ошибка при получении данных о погоде:",e),i.innerHTML="<strong>Не удалось получить данные о погоде.</strong>"}},fetchWindData=async function(){const e=`https://api.openweathermap.org/data/2.5/weather?lat=${NPP_COORDS[0]}&lon=${NPP_COORDS[1]}&appid=${API_KEY}&units=metric&lang=ru`;try{const t=await fetch(e);if(!t.ok)throw new Error(`Ошибка API: ${t.statusText}`);const n=await t.json();windData={speed:n.wind.speed||0,deg:n.wind.deg||0},updateWindInfo()}catch(t){console.error("Ошибка при получении данных о погоде:",t),windInfoPanel.innerHTML="<strong>Не удалось получить данные о погоде.</strong>"}};isMarkerInsidePolygon=function(e,t){let n=!1;const i=e.lng,o=e.lat,r=t.getLatLngs()[0];for(let s=0,a=r.length-1;s<r.length;a=s++){const e=r[s].lng,t=r[s].lat,l=r[a].lng,d=r[a].lat;t>o!=d>o&&i<(l-e)*(o-t)/(d-t)+e&&(n=!n)}return n};
});
