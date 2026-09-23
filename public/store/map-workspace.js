(()=>{
  const storageKey='tourguid-travel-store-journey-prototype-v1';
  const itinerary=document.querySelector('#workspace-itinerary');
  const mapNode=document.querySelector('#destination-map');
  if(!itinerary||!mapNode)return;

  // Editorial example stops keep the map useful before a traveler saves anything.
  // A destination config can be supplied by the store shell or query parameters.
  // Positions are planning locations, not supplier meeting points or bookings.
  const params=new URLSearchParams(location.search);
  const destinationName=(params.get('destination')||window.TourGuidDestination?.name||'Barcelona').trim();
  const destinationKey=destinationName.toLowerCase();
  const isBarcelona=destinationKey==='barcelona';
  const demoCenters={barcelona:[41.3874,2.1686],paris:[48.8566,2.3522],lisbon:[38.7223,-9.1393]};
  const configuredCenter=window.TourGuidDestination?.center;

  const workspace=document.querySelector('#trip-workspace');
  const toolsToggle=document.querySelector('#tools-toggle');
  const toolsState=document.querySelector('#tools-tab-state');
  const wireDisclosure=onOpen=>{
    if(!workspace||!toolsToggle||!toolsState)return()=>{};
    const setToolsOpen=open=>{workspace.hidden=!open;toolsToggle.setAttribute('aria-expanded',String(open));toolsState.textContent=open?'Hide optimization tools':'Show optimization tools';if(open&&onOpen)setTimeout(onOpen,80)};
    toolsToggle.addEventListener('click',()=>setToolsOpen(workspace.hidden));
    document.querySelector('#view-journey-link')?.addEventListener('click',()=>setToolsOpen(true));
    return setToolsOpen;
  };

  // A destination we have no verified center for must not silently borrow
  // Barcelona's coordinates -- that would show one city's map and example
  // stops labeled as another's.
  if(!(destinationKey in demoCenters)&&!Array.isArray(configuredCenter)){
    wireDisclosure(null);
    mapNode.innerHTML=`<div class="map-fallback"><div><strong>${destinationName}</strong><br><span>We don't have a verified map center for ${destinationName} yet, so Optimization Tools can't plan a day here. Try Barcelona, Paris or Lisbon, or check back once this destination is connected.</span></div></div>`;
    itinerary.innerHTML='<p class="workspace-empty">No verified destination center yet -- nothing to plan against safely.</p>';
    return;
  }

  const destinationCenter=Array.isArray(configuredCenter)?configuredCenter:demoCenters[destinationKey];
  const genericHotel={id:'destination-hotel',label:`${destinationName} hotel base`,category:'hotel',position:[destinationCenter[0]+.004,destinationCenter[1]+.004]};
  const hotel=isBarcelona?{id:'hotel-arts-barcelona',label:'Hotel Arts Barcelona',category:'hotel',position:[41.3863,2.1967]}:genericHotel;
  const hotelAnchors=isBarcelona?[hotel,{id:'w-barcelona',label:'W Barcelona',category:'hotel',position:[41.3688,2.1897]},{id:'majestic-barcelona',label:'Majestic Hotel & Spa Barcelona',category:'hotel',position:[41.3932,2.1634]}]:[hotel];
  const genericStops=[{id:'destination-activity',label:`${destinationName} local activity`,category:'activity',position:[destinationCenter[0]+.012,destinationCenter[1]-.006]},{id:'destination-site',label:`${destinationName} must-see site`,category:'site',position:[destinationCenter[0]-.008,destinationCenter[1]-.012]}];
  const examples={
    1:{name:isBarcelona?'Waterfront cluster':'Arrival cluster',stops:isBarcelona?[hotel,{id:'port-walk',label:'Port Olímpic walk',category:'activity',position:[41.3871,2.1991]},{id:'barceloneta-beach',label:'Barceloneta Beach',category:'site',position:[41.3784,2.1925]}]:[hotel,...genericStops]},
    2:{name:isBarcelona?'Gaudí cluster':'Local highlights',stops:isBarcelona?[hotel,{id:'batllo-walk',label:'Passeig de Gràcia walk',category:'activity',position:[41.3916,2.1649]},{id:'sagrada-familia',label:'Sagrada Família',category:'site',position:[41.4036,2.1744]}]:[hotel,...genericStops]},
    3:{name:isBarcelona?'Old city cluster':'Flexible day',stops:isBarcelona?[hotel,{id:'gothic-walk',label:'Gothic Quarter walk',category:'activity',position:[41.3801,2.1752]},{id:'barcelona-cathedral',label:'Barcelona Cathedral',category:'site',position:[41.3839,2.1762]}]:[hotel,...genericStops]}
  };
  const catalogPositions={
    'hotel-arts-barcelona':hotel.position,
    'enoteca-paco-perez':[41.3863,2.1967],
    'port-olimpic':[41.3871,2.1991],
    'sagrada-familia':[41.4036,2.1744],
    'barcelona-waterfront':[41.3784,2.1925],
    'gaudi-architecture':[41.3916,2.1649],
    'barcelona-water':[41.3871,2.1991],
    'barcelona-neighborhood-walks':[41.3801,2.1752],
    'barcelona-food-tours':[41.3816,2.1721]
  };
  const categoryFor=item=>item.type==='Hotel'?'hotel':item.type==='Place'?'site':'activity';
  // Scoped by destination as well as day: an unrelated destination's saved
  // Cards must never bleed into this one just because they share a day number.
  const readItems=()=>{try{const value=JSON.parse(localStorage.getItem(storageKey));return Array.isArray(value)?value.filter(item=>(item.journeyDestination||'Barcelona')===destinationName):[]}catch{return []}};
  const dayButtons=[...document.querySelectorAll('.day-chip[data-day]')];
  const anchorInput=document.querySelector('#hotel-anchor');
  const anchorStatus=document.querySelector('#hotel-anchor-status');
  let selectedAnchor=hotel;
  if(anchorInput&&!isBarcelona){anchorInput.value=hotel.label;anchorInput.placeholder=`Search a hotel in ${destinationName}`;document.querySelector('#hotel-anchor-options')?.replaceChildren(Object.assign(document.createElement('option'),{value:hotel.label}));if(anchorStatus)anchorStatus.textContent=`Choose a hotel returned by the ${destinationName} accommodation feed to recenter the map.`}
  const requestedDay=Number(new URLSearchParams(location.search).get('day'));
  let activeDay=[1,2,3].includes(requestedDay)?requestedDay:1,activeStops=[],drawMap=()=>{},refreshMap=()=>{};

  // Great-circle straight-line distance -- an illustrative planning estimate,
  // never a walking or transit route. Defined before any caller (including
  // the no-Leaflet fallback below) so it can't be reached uninitialized.
  const distanceMeters=(a,b)=>{const rad=Math.PI/180,lat1=a[0]*rad,lat2=b[0]*rad,dLat=(b[0]-a[0])*rad,dLon=(b[1]-a[1])*rad;const q=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q))};
  const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  const journeyLinkHref=()=>`./journey-building.html?destination=${encodeURIComponent(destinationName)}&day=${activeDay}#planner`;
  const syncJourneyLink=()=>{const link=document.querySelector('.itinerary-link');if(link)link.href=journeyLinkHref()};

  const createStop=(stop,saved)=>{
    const row=document.createElement('div');row.className='workspace-stop';
    const dot=document.createElement('span');dot.className='stop-dot';dot.textContent=String(stop.sequence).padStart(2,'0');
    const copy=document.createElement('div');copy.className=`stop-copy type-${stop.category}`;
    const category=document.createElement('em');category.textContent=stop.category==='site'?'Must-see site':stop.category;
    const title=document.createElement('strong');title.textContent=stop.label;
    const detail=document.createElement('small');detail.textContent=stop.position?'':'Map location to confirm · ';
    detail.textContent+=saved?`${stop.date||'Date to be chosen'} · ${stop.status==='idea'?'Saved idea':'Planned, not booked'}`:'Suggested stop · not booked';
    copy.append(category,title,detail);row.append(dot,copy);return row;
  };
  const renderDay=()=>{
    dayButtons.forEach(button=>{const selected=Number(button.dataset.day)===activeDay;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected))});
    const saved=readItems().filter(item=>Number(item.dayIndex||1)===activeDay).map(item=>({id:item.catalogId||item.title,label:item.title,category:categoryFor(item),position:catalogPositions[item.catalogId]||null,date:item.date,status:item.status,saved:true}));
    const suggestions=examples[activeDay].stops.filter(stop=>!saved.some(item=>item.id===stop.id));
    // One ordered list is the source of truth for both the itinerary rows and
    // the map markers -- a Card with no coordinate keeps its place in this
    // order and its number, rather than the map silently renumbering around it.
    const combined=[...saved,...suggestions];
    combined.forEach((stop,index)=>{stop.sequence=index+1});
    itinerary.replaceChildren();
    combined.forEach(stop=>itinerary.append(createStop(stop,Boolean(stop.saved))));
    const mapped=combined.filter(stop=>Array.isArray(stop.position));
    const withoutPosition=combined.length-mapped.length;
    const meters=mapped.slice(1).reduce((total,stop,index)=>total+distanceMeters(mapped[index].position,stop.position),0);
    const minutes=Math.max(1,Math.round(meters/80));
    const distanceNote=mapped.length>1?` · about ${(meters/1000).toFixed(1)} km straight-line · ~${minutes} min walking (illustrative estimate)`:'';
    document.querySelector('#day-summary').textContent=`Day ${activeDay} · ${examples[activeDay].name} · centered on ${selectedAnchor.label} · ${combined.length} stops${distanceNote}${withoutPosition?` · ${withoutPosition} awaiting an exact map location`:''}. Suggested stops are examples.`;
    syncJourneyLink();
    drawMap(mapped);
  };
  dayButtons.forEach(button=>button.addEventListener('click',()=>{activeDay=Number(button.dataset.day);renderDay()}));
  window.addEventListener('storage',renderDay);

  const setToolsOpen=wireDisclosure(()=>refreshMap());
  if(!window.L){mapNode.innerHTML=`<div class="map-fallback"><div><strong>${destinationName} daily map</strong><br><span>Map tiles are unavailable. Suggested and saved stops remain listed in the itinerary.</span></div></div>`;renderDay();return}

  const townCenter=destinationCenter;
  const map=L.map(mapNode,{zoomControl:false,attributionControl:true}).setView(selectedAnchor.position,13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  const anchorLayer=L.layerGroup().addTo(map);
  const transitLayer=L.layerGroup().addTo(map);
  const townMarker=L.circleMarker(townCenter,{radius:3,color:'#87918f',weight:1,fillColor:'#87918f',fillOpacity:.75}).addTo(anchorLayer).bindPopup(`${destinationName} town center`);
  const anchorRings=[1000,3000,5000].map(radius=>L.circle(selectedAnchor.position,{radius,color:'#7c9a96',weight:2,opacity:.9,fill:false,dashArray:'5 6',interactive:false}).addTo(anchorLayer));
  const anchorMarker=L.marker(selectedAnchor.position,{icon:L.divIcon({className:'map-stop-icon type-hotel',html:'<span class="pin-dot">⌂</span>',iconSize:[30,30],iconAnchor:[15,15]}),zIndexOffset:700}).addTo(anchorLayer).bindTooltip(selectedAnchor.label,{permanent:true,direction:'bottom',offset:[0,11],className:'map-stop-label type-hotel'}).bindPopup(`<strong>${selectedAnchor.label}</strong><br>Map anchor hotel`);
  const transitStations=isBarcelona?[['Barceloneta',41.3803,2.1895],['Ciutadella | Vila Olímpica',41.3881,2.1874],['Marina',41.394,2.187],['Urquinaona',41.3903,2.1805],['Catalunya',41.387,2.1701],['Sagrada Família',41.4036,2.1744]]:[['Central station',destinationCenter[0]+.006,destinationCenter[1]-.004],['City interchange',destinationCenter[0]-.004,destinationCenter[1]-.009],['Airport link',destinationCenter[0]+.012,destinationCenter[1]+.008]];
  const transitLines=isBarcelona?[[[41.3803,2.1895],[41.3881,2.1874],[41.394,2.187],[41.3903,2.1805],[41.387,2.1701]],[[41.387,2.1701],[41.3932,2.1634],[41.4036,2.1744]]]:[[transitStations[0].slice(1),transitStations[1].slice(1),transitStations[2].slice(1)]];
  const transitColors=['#5146b8','#d35f2f'];
  transitLines.forEach((line,index)=>L.polyline(line,{color:transitColors[index%transitColors.length],weight:5,opacity:.96,dashArray:'10 5',interactive:false}).addTo(transitLayer));
  transitStations.forEach(([label,lat,lng])=>L.circleMarker([lat,lng],{radius:5,color:'#6f7288',weight:2,fillColor:'#fff',fillOpacity:1}).addTo(transitLayer).bindTooltip(label,{permanent:true,direction:'top',offset:[0,-6],className:'transit-label'}));
  const dayLayer=L.layerGroup().addTo(map);
  drawMap=stops=>{
    activeStops=stops;
    dayLayer.clearLayers();
    const positioned=stops.filter(stop=>Array.isArray(stop.position));
    positioned.forEach(stop=>{
      // Marker numbers come from the stop's own canonical sequence (set in
      // renderDay from the full itinerary order), never a re-derived index
      // after filtering -- otherwise a coordinate-less earlier stop shifts
      // every later map number out of sync with its itinerary row.
      const icon=L.divIcon({className:`map-stop-icon type-${stop.category}`,html:`<span class="pin-dot">${stop.sequence}</span>`,iconSize:[30,30],iconAnchor:[15,15]});
      const direction=stop.category==='hotel'?'left':stop.category==='activity'?'top':'right';
      const offset=direction==='left'?[-8,0]:direction==='top'?[0,-8]:[8,0];
      L.marker(stop.position,{icon}).addTo(dayLayer).bindTooltip(escapeHtml(stop.label),{permanent:true,direction,offset,className:`map-stop-label type-${stop.category}`}).bindPopup(`<strong>${escapeHtml(stop.label)}</strong><br>${stop.saved?'Saved Journey item':'Suggested stop · not booked'}`);
    });
    if(positioned.length>1){
      L.polyline(positioned.map(stop=>stop.position),{color:'#e07824',weight:4,opacity:.96,dashArray:'10 6',interactive:false}).addTo(dayLayer);
      positioned.slice(1).forEach((stop,index)=>{const from=positioned[index].position,to=stop.position;const midpoint=[(from[0]+to[0])/2,(from[1]+to[1])/2];const minutes=Math.max(1,Math.round(distanceMeters(from,to)/80));L.marker(midpoint,{interactive:false,icon:L.divIcon({className:'travel-label',html:`~${minutes} min`,iconSize:[60,18],iconAnchor:[30,9]})}).addTo(dayLayer)});
    }
    // Fit the anchor together with the day's positioned stops in one bounds
    // calculation -- a later panTo(anchor) could recenter past a fitBounds
    // that already included distant stops and push them back out of view.
    const boundsPoints=[selectedAnchor.position,...positioned.map(stop=>stop.position)];
    if(boundsPoints.length)map.fitBounds(L.latLngBounds(boundsPoints).pad(.25),{padding:[48,48],maxZoom:14,animate:false});
  };
  refreshMap=()=>{map.invalidateSize();if(activeStops.length)drawMap(activeStops)};
  renderDay();
  const panel=document.querySelector('#map-panel');
  document.querySelector('#map-zoom-in').addEventListener('click',()=>map.zoomIn());
  document.querySelector('#map-zoom-out').addEventListener('click',()=>map.zoomOut());
  document.querySelector('#map-transit').addEventListener('click',event=>{const visible=map.hasLayer(transitLayer);if(visible)map.removeLayer(transitLayer);else transitLayer.addTo(map);event.currentTarget.setAttribute('aria-pressed',String(!visible));event.currentTarget.textContent=`TRANSIT · ${visible?'OFF':'ON'}`});
  document.querySelector('#map-max-one').addEventListener('click',event=>{workspace.classList.toggle('map-wide');event.currentTarget.setAttribute('aria-pressed',String(workspace.classList.contains('map-wide')));setTimeout(()=>map.invalidateSize(),260)});
  document.querySelector('#map-max-two').addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen();else panel.requestFullscreen?.()});
  document.addEventListener('fullscreenchange',()=>setTimeout(()=>map.invalidateSize(),80));
  const chooseAnchor=value=>{const match=hotelAnchors.find(item=>item.label.toLowerCase()===String(value).trim().toLowerCase());if(!match){if(anchorInput)anchorInput.value=selectedAnchor.label;return}selectedAnchor=match;anchorInput.value=match.label;anchorRings.forEach(ring=>ring.setLatLng(match.position));anchorMarker.setLatLng(match.position).setTooltipContent(match.label);if(anchorStatus)anchorStatus.textContent=`Distance rings are measured from ${match.label}. The transit layer is a separate, fixed overlay and does not move with the hotel.`;map.setView(match.position,14,{animate:false});renderDay()};
  anchorInput?.addEventListener('change',event=>chooseAnchor(event.target.value));
})();
