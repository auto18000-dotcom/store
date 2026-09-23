(()=>{
  const form=document.getElementById('flight-form');
  if(!form||!window.TourGuidPlaces)return;
  const MAX_LEGS=10;
  const el=(tag,attrs={},text)=>{const n=document.createElement(tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!=null)n.textContent=text;return n};
  const field=(labelText,input)=>{const wrap=el('div',{class:'field'});const label=el('label',{},labelText);if(input.id)label.htmlFor=input.id;wrap.append(label,input);return wrap};
  const place=(id,label,placeholder)=>{const input=el('input',{id,placeholder,maxlength:'60',autocomplete:'off'});const wrap=field(label,input);const state=window.TourGuidPlaces.attach(input,{kind:'airports'});return {wrap,input,state}};
  // A picked suggestion carries coordinates; a typed 3-letter entry is an IATA code; anything else is refused rather than guessed.
  const resolve=p=>{const picked=p.state?.place;if(picked&&picked.iataCode)return {code:picked.iataCode,name:picked.name};if(picked)return {name:picked.name,lat:picked.lat,lon:picked.lon};const t=p.input.value.trim();if(/^[A-Za-z]{3}$/.test(t))return {code:t.toUpperCase()};return null};
  let mode='oneway';
  const status=el('div',{class:'status',id:'flight-status',role:'status','aria-live':'polite'});
  const results=document.getElementById('flight-results');
  form.replaceChildren();

  const modeSelect=el('select',{id:'flight-mode','aria-label':'Trip type',class:'flight-mode-select'});
  for(const [key,text] of [['oneway','One way'],['round','Round trip'],['multi','Multi-city']])modeSelect.append(el('option',{value:key},text));
  modeSelect.addEventListener('change',()=>setMode(modeSelect.value));
  const tabs=el('div',{class:'flight-modes'});tabs.append(modeSelect);

  const from=place('origin','From','City or Airport Code, e.g. SFO');from.wrap.classList.add('flight-place');
  const to=place('flight-to','To','City or Airport Code, e.g. CDG');to.wrap.classList.add('flight-place');
  const departure=el('input',{type:'date',id:'departure'});const returnInput=el('input',{type:'date',id:'return'});
  const passengers=el('input',{type:'number',id:'passengers',min:'1',max:'9',value:'1'});
  const simple=el('div',{class:'flight-simple'});
  const returnField=field('Return',returnInput);
  simple.append(from.wrap,to.wrap,field('Departure',departure),returnField);

  const legsBox=el('div',{class:'flight-legs'});const addLeg=el('button',{type:'button',class:'btn'},'Add a stop');
  const legs=[];
  const legDates=()=>legs.forEach((leg,i)=>{const prev=i?legs[i-1].date.value:'';if(prev)leg.date.min=prev;else leg.date.removeAttribute('min');if(leg.date.value&&prev&&leg.date.value<prev)leg.date.value=''});
  const renumber=()=>{legs.forEach((leg,i)=>{leg.title.textContent=`Leg ${i+1}`;leg.remove.hidden=legs.length<=2});addLeg.disabled=legs.length>=MAX_LEGS;addLeg.textContent=legs.length>=MAX_LEGS?'Ten legs is the most one search allows':'Add a stop'};
  const newLeg=()=>{
    const n=legs.length+1,stamp=Date.now()+'-'+n;
    const row=el('div',{class:'flight-leg-row'});const title=el('strong',{class:'flight-leg-title'},`Leg ${n}`);
    const f=place(`leg-from-${stamp}`,'From','City or Airport Code');const t=place(`leg-to-${stamp}`,'To','City or Airport Code');
    const date=el('input',{type:'date'});const remove=el('button',{type:'button',class:'flight-leg-remove'},'Remove');const err=el('div',{class:'flight-leg-error',role:'alert'});
    const leg={row,title,from:f,to:t,date,remove,err};
    remove.addEventListener('click',()=>{legs.splice(legs.indexOf(leg),1);row.remove();legDates();renumber()});
    date.addEventListener('change',legDates);
    // The next leg starts from where this one lands, but stays editable: a journey may resume somewhere else.
    t.input.addEventListener('blur',()=>setTimeout(()=>{const next=legs[legs.indexOf(leg)+1];if(next&&!next.from.input.value&&t.state.place){next.from.input.value=t.state.place.label||t.state.place.name;next.from.state.place=t.state.place}},200));
    row.append(title,f.wrap,t.wrap,field('Date',date),remove,err);legsBox.append(row);legs.push(leg);return leg;
  };
  addLeg.addEventListener('click',()=>{if(legs.length>=MAX_LEGS)return;const prev=legs[legs.length-1];const leg=newLeg();if(prev?.to.state.place){leg.from.input.value=prev.to.state.place.label||prev.to.state.place.name;leg.from.state.place=prev.to.state.place}legDates();renumber()});
  newLeg();newLeg();renumber();
  const multi=el('div',{class:'flight-multi'});multi.append(legsBox,addLeg);

  const submit=el('button',{class:'btn btn-primary',type:'submit',id:'flight-submit'},'Search flights');
  const bottom=el('div',{class:'flight-bottom'});bottom.append(field('Passengers',passengers),submit);
  bottom.append(status);form.append(tabs,simple,multi,bottom);

  function setMode(next){
    mode=next;
    modeSelect.value=mode;
    simple.hidden=mode==='multi';multi.hidden=mode!=='multi';returnField.hidden=mode!=='round';
    if(mode!=='round')returnInput.value='';
    status.textContent='';
  }
  // The chosen destination (from the search bar above) pre-fills To on one-way and round trips.
  const chosen=window.TourGuidDestination;
  if(chosen){to.input.value=chosen.label||chosen.name;to.state.place=chosen}
  setMode('oneway');

  const label=v=>typeof v==='string'?v:v&&(v.name||v.iata_code||v.iataCode)||null;
  const banner=text=>results.append(el('div',{class:'live-mode-banner'},text));

  form.addEventListener('submit',async event=>{
    event.preventDefault();results.replaceChildren();legs.forEach(l=>{l.err.textContent=''});
    const pax=String(Math.min(9,Math.max(1,Number(passengers.value)||1)));
    let url;
    if(mode==='multi'){
      const slices=[];
      for(const [i,leg] of legs.entries()){
        const a=resolve(leg.from),b=resolve(leg.to);
        if(!a){leg.err.textContent=`Leg ${i+1} needs somewhere to fly from. Pick a place from the suggestions or type an airport code.`;return}
        if(!b){leg.err.textContent=`Leg ${i+1} needs somewhere to fly to. Pick a place from the suggestions or type an airport code.`;return}
        if(!leg.date.value){leg.err.textContent=`Leg ${i+1} needs a date.`;return}
        const s={from:a.code||a.name,to:b.code||b.name,date:leg.date.value};
        if(!a.code&&Number.isFinite(a.lat)){s.from_lat=a.lat;s.from_lon=a.lon}
        if(!b.code&&Number.isFinite(b.lat)){s.to_lat=b.lat;s.to_lon=b.lon}
        slices.push(s);
      }
      url=`/api/store/flights?${new URLSearchParams({slices:JSON.stringify(slices),passengers:pax})}`;
      status.textContent=`Pricing a ${slices.length}-leg journey — this can take up to a minute.`;
    }else{
      const a=resolve(from),b=resolve(to);
      if(!a){status.textContent='Pick your departure city from the suggestions, or type a 3-letter airport code.';return}
      if(!b){status.textContent='Pick your destination from the suggestions, or type a 3-letter airport code.';return}
      if(!departure.value){status.textContent='Choose a departure date.';return}
      if(mode==='round'&&!returnInput.value){status.textContent='Choose a return date, or switch to One way.';return}
      const q={origin:a.code||a.name,destination:b.code||b.name,departure:departure.value,passengers:pax};
      if(!a.code&&Number.isFinite(a.lat)){q.originLat=String(a.lat);q.originLon=String(a.lon)}
      if(!b.code&&Number.isFinite(b.lat)){q.lat=String(b.lat);q.lon=String(b.lon)}
      if(mode==='round')q.return=returnInput.value;
      url=`/api/store/flights?${new URLSearchParams(q)}`;
      status.textContent=`Searching live Duffel offers from ${a.name||a.code} to ${b.name||b.code}. This usually takes a few seconds.`;
    }
    submit.disabled=true;submit.classList.add('is-busy');submit.textContent='Searching…';form.setAttribute('aria-busy','true');
    const controller=new AbortController();
    // Duffel prices a long itinerary as one search and it can take well over 15 seconds, so no short abort here.
    const timer=setTimeout(()=>controller.abort(),75000);
    try{
      const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
      const payload=await response.json().catch(()=>null);
      if(!response.ok){
        const message=payload?.message||'Flight service unavailable.';
        const leg=/Leg (\d+)/.exec(message);
        if(mode==='multi'&&leg&&legs[Number(leg[1])-1])legs[Number(leg[1])-1].err.textContent=message;
        status.textContent=message;return;
      }
      if(!Array.isArray(payload?.offers))throw new Error('bad');
      if(!payload.offers.length){status.textContent='No flight offers returned for these dates. Try another search.';return}
      const isLive=payload.liveMode===true;
      status.textContent=isLive?`${payload.offers.length} live ${payload.offers.length===1?'offer':'offers'} returned. Confirm price and terms before booking.`:`${payload.offers.length} test ${payload.offers.length===1?'offer':'offers'} returned.`;
      if(!isLive)banner(payload.liveMode===false?'Test data — these fares and airlines are not real.':'Live status not confirmed — treat these fares as provisional.');
      const expected=mode==='multi'?'multi_city':mode==='round'?'round_trip':'one_way';
      if(payload.trip&&payload.trip!==expected)banner(`You asked for ${expected.replace('_',' ')} fares but the results are ${String(payload.trip).replace('_',' ')}. Check the legs before booking.`);
      const o=label(payload.origin),d=label(payload.destination);
      if(mode!=='multi'&&(o||d))banner(`Flying ${o?`from ${o}`:''}${o&&d?' ':''}${d?`to ${d}`:''} — the nearest airport to the place you chose.`);
      const grid=el('div',{class:'grid'});
      const ctx={isLive,origin:o||'',destination:d||''};
      for(const offer of payload.offers)grid.append(window.TourGuidFlights.card(offer,ctx));
      results.append(grid);
    }catch(error){
      status.textContent=error.name==='AbortError'?'The flight search took too long. Try fewer legs or try again.':'Live Duffel flight results are not connected to this prototype.';
      results.replaceChildren(Object.assign(el('div',{class:'empty'}),{textContent:'No fares are displayed until the live Duffel service responds.'}));
    }finally{clearTimeout(timer);submit.disabled=false;submit.classList.remove('is-busy');submit.textContent='Search flights';form.removeAttribute('aria-busy')}
  });
})();
