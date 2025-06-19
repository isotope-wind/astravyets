document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. КОНСТАНТЫ И СОСТОЯНИЕ ---
    const API_KEY = 'd243e79aea8a70aaeeeda6f16f6ccf63';
    const NPP_COORDS = [54.773, 26.096];
    const CITIES = {"Вильнюс":[54.687,25.279],"Минск":[53.904,27.561],"Варшава":[52.229,21.012],"Рига":[56.949,24.105],"Каунас":[54.898,23.903],"Даугавпилс":[55.874,26.516],"Киев":[50.45,30.523],"Новогрудок":[53.596,25.827],"Жодино":[54.093,28.34],"Гродно":[53.669,23.826],"Брест":[52.097,23.734],"Москва":[55.755,37.617],"Витебск":[55.19,30.205]};
    const SIMULATION_SPEED_MULTIPLIER = 3600;
    const UPDATE_INTERVAL_MS = 100;
    const DEVIATION_ANGLE = 15; // Угол отклонения для боковых прогнозов в градусах

    let appState = { status: 'loading' }; 
    let map, windData = {};
    let simulationInterval = null, cityMarkers = {}, arrivedCities = {};
    let plumeLayers = { center: null, left: null, right: null };

    const ui = { /* ... как в предыдущей версии ... */ };
    const isMobile = window.innerWidth <= 768;

    // --- 2. ЛОГИКА СИМУЛЯЦИИ ---

    async function startSimulation() {
        if (appState.status !== 'ready') return;
        ui.simulateBtn.disabled = true;
        ui.simulateBtn.textContent = 'Получение данных...';
        
        const success = await fetchAndUpdateWindData();
        if (!success) { alert('Не удалось получить актуальные данные о ветре.'); setAppState('ready'); return; }
        if (windData.speed === 0) { alert("Ветер отсутствует. Распространение невозможно."); setAppState('ready'); return; }
        setAppState('simulating');
        if (simulationInterval) clearInterval(simulationInterval);
        resetSimulation();
        
        let totalDistance = 0;
        simulationInterval = setInterval(() => {
            totalDistance += windData.speed * (UPDATE_INTERVAL_MS / 1000) * SIMULATION_SPEED_MULTIPLIER;
            
            // Создаем и отрисовываем 3 полигона
            const centerPoints = createPlumePolygon(totalDistance, windData.deg);
            const leftPoints = createPlumePolygon(totalDistance, windData.deg - DEVIATION_ANGLE);
            const rightPoints = createPlumePolygon(totalDistance, windData.deg + DEVIATION_ANGLE);
            
            updatePlumeLayer('center', centerPoints, { color: "red", fillColor: "#f03", fillOpacity: 0.5, weight: 1.5 });
            updatePlumeLayer('left', leftPoints, { color: "#f03", fillColor: "#f03", fillOpacity: 0.15, weight: 0 });
            updatePlumeLayer('right', rightPoints, { color: "#f03", fillColor: "#f03", fillOpacity: 0.15, weight: 0 });
            
            checkCityArrival(centerPoints); // Проверяем только для центрального прогноза
        }, UPDATE_INTERVAL_MS);
    }
    
    function resetSimulation() {
        Object.keys(plumeLayers).forEach(key => {
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
        }
    }
    
    function checkCityArrival(centerPolygonPoints) {
        // Создаем временный полигон для проверки, не добавляя его на карту
        const centerPolygon = L.polygon(centerPolygonPoints);
        for (const cityName in CITIES) {
            if (!arrivedCities[cityName] && isMarkerInsidePolygon(L.latLng(CITIES[cityName]), centerPolygon)) {
                arrivedCities[cityName] = true;
                const distanceToCity = map.distance(NPP_COORDS, CITIES[cityName]);
                const timeToArrivalSeconds = distanceToCity / windData.speed;
                const hours = Math.floor(timeToArrivalSeconds / 3600), minutes = Math.floor((timeToArrivalSeconds % 3600) / 60);
                const arrivalTimeText = `~ ${hours} ч. ${minutes} мин.`;
                updateCityTimer(cityName, arrivalTimeText);
                const markerToUpdate = cityMarkers[cityName];
                if (markerToUpdate) {
                    markerToUpdate.setTooltipContent(`<strong>${arrivalTimeText}</strong>`).openTooltip();
                }
            }
        }
    }

    // Модель Гауссовой струи теперь принимает угол как аргумент
    function createPlumePolygon(distance, angle) {
        const center = L.latLng(NPP_COORDS);
        const plumeHalfWidth = distance * Math.tan(15 * Math.PI / 180);
        const segments = 50, segmentLength = distance / segments;
        let currentPoint = center;
        const centerLine = [center];
        for (let i = 0; i < segments; i++) {
            currentPoint = getDestinationPoint(currentPoint, angle, segmentLength);
            centerLine.push(currentPoint);
        }
        const leftBoundary = [], rightBoundary = [];
        for (let i = 0; i < centerLine.length; i++) {
            const currentWidth = (i / segments) * plumeHalfWidth;
            leftBoundary.push(getDestinationPoint(centerLine[i], angle - 90, currentWidth));
            rightBoundary.push(getDestinationPoint(centerLine[i], angle + 90, currentWidth));
        }
        return [center, ...leftBoundary, ...rightBoundary.slice(1).reverse()];
    }

    // --- ОСТАЛЬНОЙ КОД (без изменений) ---
    function initializeApp(){populateCityTimers();initMap();setupEventListeners();setAppState("loading");fetchAndUpdateWindData();setInterval(fetchAndUpdateWindData,6e4)}
    function populateCityTimers(){const e=ui.cityTimers.querySelector(".timers-grid");let t="";for(const i in CITIES)t+=`<p>${i}:<span id="timer-${i.toLowerCase().replace(/ /g,"-")}">-</span></p>`;e.innerHTML=t}
    function setAppState(newState){appState.status=newState;const updateElement=(element,action)=>{if(element)action(element)};switch(newState){case"loading":updateElement(ui.simulateBtn,el=>{el.disabled=!0;el.textContent="Загрузка..."});updateElement(ui.iodineInfoFooter,el=>el.style.display="none");break;case"ready":updateElement(ui.simulateBtn,el=>{el.disabled=!1;el.textContent="▶︎ Начать симуляцию";el.style.display="block"});updateElement(ui.mainTitle,el=>el.style.display="block");updateElement(ui.cityTimers,el=>el.style.display="none");updateElement(ui.iodineInfoFooter,el=>el.style.display="none");break;case"simulating":updateElement(ui.simulateBtn,el=>el.style.display="none");updateElement(ui.mainTitle,el=>el.style.display="none");updateElement(ui.cityTimers,el=>el.style.display="block");updateElement(ui.iodineInfoFooter,el=>el.style.display="block");isMobile&&ui.infoPanel&&ui.infoPanel.classList.remove("visible");ui.overlay&&ui.overlay.classList.remove("visible");break;case"error":updateElement(ui.simulateBtn,el=>{el.disabled=!0;el.textContent="Ошибка загрузки"});updateElement(ui.iodineInfoFooter,el=>el.style.display="none");break;}}
    function initMap(){if(map)return;map=L.map("map",{zoomControl:!1}).setView(NPP_COORDS,isMobile?5:6);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"&copy; OpenStreetMap"}).addTo(map);L.marker(NPP_COORDS,{icon:L.divIcon({className:"npp-icon",html:"☢️"})}).addTo(map).bindPopup("Белорусская АЭС");for(const e in CITIES){const t=L.marker(CITIES[e]).addTo(map).bindPopup(e);t.bindTooltip(e,{permanent:!1,direction:"top"}),cityMarkers[e]=t}isMobile?(ui.infoPanel&&(ui.infoPanel.style.display="flex"),ui.panelToggleBtn&&(ui.panelToggleBtn.style.display="block")):(ui.infoPanel&&(ui.infoPanel.style.display="flex"),ui.panelToggleBtn&&(ui.panelToggleBtn.style.display="none"))}
    function setupEventListeners(){if(ui.simulateBtn)ui.simulateBtn.addEventListener("click",startSimulation);const e=()=>{ui.infoPanel&&ui.infoPanel.classList.toggle("visible"),ui.overlay&&ui.overlay.classList.toggle("visible")};ui.panelToggleBtn&&ui.panelToggleBtn.addEventListener("click",e),ui.panelHeader&&ui.panelHeader.addEventListener("click",e),ui.overlay&&ui.overlay.addEventListener("click",e)}
    async function fetchAndUpdateWindData(){try{const e=await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${NPP_COORDS[0]}&lon=${NPP_COORDS[1]}&appid=${API_KEY}&units=metric`);if(!e.ok)throw new Error(`API ${e.status}`);const t=await e.json();if(!t.wind)throw new Error("No wind data");return windData={speed:t.wind.speed||0,deg:t.wind.deg||0},updateWindInfoUI(),("loading"===appState.status||"error"===appState.status)&&setAppState("ready"),!0}catch(e){return console.error("Wind fetch error:",e.message),updateWindInfoUI(!0),setAppState("error"),!1}}
    function updateWindInfoUI(e=!1){const t=document.getElementById("wind-pointer"),i=document.getElementById("wind-speed"),a=document.getElementById("update-time");if(!t||!i||!a)return;if(e)return i.textContent="Ошибка",a.textContent="нет данных",void i.classList.remove("has-data");void 0!==windData.speed?(t.style.transform=`rotate(${windData.deg+180}deg)`,i.textContent=`${windData.speed.toFixed(1)}`,i.classList.add("has-data"),a.textContent=`обновлено в ${new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}`):(i.textContent="--",i.classList.remove("has-data"),a.textContent="ожидание...")}
    function resetTimers(){for(const e in CITIES){updateCityTimer(e,"-");const t=cityMarkers[e];t&&t.isTooltipOpen()&&t.closeTooltip().setTooltipContent(e)}arrivedCities={}}
    function updateCityTimer(e,t){const i=document.getElementById(`timer-${e.toLowerCase().replace(/ /g,"-")}`);i&&(i.innerText=t)}
    function getDestinationPoint(e,t,i){const a=6371e3,l=e.lat*Math.PI/180,s=e.lng*Math.PI/180,o=t*Math.PI/180,n=Math.asin(Math.sin(l)*Math.cos(i/a)+Math.cos(l)*Math.sin(i/a)*Math.cos(o)),r=s+Math.atan2(Math.sin(o)*Math.sin(i/a)*Math.cos(l),Math.cos(i/a)-Math.sin(l)*Math.sin(n));return L.latLng(180*n/Math.PI,180*r/Math.PI)}
    function isMarkerInsidePolygon(e,t){let i=!1;const a=e.lng,l=e.lat,s=t.getLatLngs()[0];for(let o=0,n=s.length-1;o<s.length;n=o++){const e=s[o].lng,r=s[o].lat,d=s[n].lng,c=s[n].lat,_=(r>l)!==(c>l)&&a<(d-e)*(l-r)/(c-r)+e;_&&(i=!i)}return i}
    
    initializeApp();
});
