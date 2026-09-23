(()=>{
  const root=document.getElementById('flight-detail');
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n};
  let stored=null;
  try{stored=JSON.parse(sessionStorage.getItem('tourguid-flight-offer'))}catch{}
  const offer=stored?.offer;
  root.replaceChildren();
  if(!offer){
    root.append(el('p','flight-detail-empty','This flight is no longer available on this page. Search again from the Travel Store to see its details.'));
    const back=el('a','btn btn-primary','Back to flights');back.href='./#flights';root.append(back);return;
  }
  // Times arrive as airport-local wall clocks: read them as text, never through a zone conversion.
  const parts=iso=>{const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso||'');return m?{y:+m[1],mo:+m[2],d:+m[3],h:+m[4],mi:+m[5]}:null};
  const when=iso=>{const p=parts(iso);if(!p)return 'time not supplied';return `${new Date(Date.UTC(p.y,p.mo-1,p.d)).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'})} · ${String(p.h).padStart(2,'0')}:${String(p.mi).padStart(2,'0')}`};
  const span=iso=>{const m=/^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(iso||'');if(!m||(!m[1]&&!m[2]))return null;return `${m[1]?`${m[1]}h`:''}${m[1]&&m[2]?' ':''}${m[2]?`${m[2]}m`:''}`};
  const gap=(arr,dep)=>{const a=parts(arr),d=parts(dep);if(!a||!d)return null;const mins=Math.round((Date.UTC(d.y,d.mo-1,d.d,d.h,d.mi)-Date.UTC(a.y,a.mo-1,a.d,a.h,a.mi))/60000);if(mins<0)return null;return `${Math.floor(mins/60)}h ${String(mins%60).padStart(2,'0')}m`};
  const bags=list=>{if(!Array.isArray(list))return null;const n=t=>list.filter(b=>b&&b.type===t).reduce((s,b)=>s+(Number(b.quantity)||0),0);return `${n('checked')} checked · ${n('carry_on')} carry-on`};
  const logo=url=>{try{const u=new URL(url);return u.protocol==='https:'?u.href:null}catch{return null}};

  const back=el('button','flight-detail-back','← Back to results');back.type='button';back.addEventListener('click',()=>{history.length>1?history.back():location.href='./#flights'});
  root.append(back);
  const head=el('div','fd-head');
  const mark=logo(offer.airlineLogoWide)||logo(offer.airlineLogo);
  if(mark){const img=el('img','fd-logo');img.src=mark;img.alt='';head.append(img)}
  head.append(el('h1','',offer.operatingCarrier||'Flight'));
  root.append(head);
  if(stored.isLive!==true)root.append(el('div','live-mode-banner',stored.isLive===false?'Test data — these fares and airlines are not real.':'Live status not confirmed — treat these fares as provisional.'));
  const flags=el('div','flight-flags');
  if(offer.cheapest)flags.append(el('span','flight-flag flag-cheapest','Cheapest'));
  if(offer.fastest)flags.append(el('span','flight-flag flag-fastest','Fastest'));
  if(offer.fewestStops)flags.append(el('span','flight-flag flag-stops','Fewest stops'));
  if(flags.children.length)root.append(flags);

  const itinerary=(title,segs,totalDuration)=>{
    if(!Array.isArray(segs)||!segs.length)return;
    const section=el('section','fd-section');
    const total=span(totalDuration);
    section.append(el('h2','',`${title}${total?` · ${total} total`:''}`));
    segs.forEach((g,i)=>{
      if(i>0){const l=gap(segs[i-1].arrival,g.departure);if(l)section.append(el('div','fd-layover',`${l} layover in ${segs[i-1].destination}`))}
      const row=el('div','fd-seg');
      row.append(el('strong','',`${g.origin} → ${g.destination}`));
      row.append(el('span','',`Departs ${when(g.departure)} · Arrives ${when(g.arrival)}`));
      const line=[g.carrier?`${g.carrier}${g.flightNumber?` ${g.flightNumber}`:''}`:null,span(g.duration)].filter(Boolean).join(' · ');
      if(line){row.append(document.createElement('br'));row.append(el('span','',line))}
      const extra=[g.cabin,bags(g.baggage)?`Bags: ${bags(g.baggage)}`:null].filter(Boolean).join(' · ');
      if(extra){row.append(document.createElement('br'));row.append(el('span','',extra))}
      section.append(row);
    });
    root.append(section);
  };
  itinerary('Outbound',offer.segments,offer.duration);
  itinerary('Return',offer.returnSegments,offer.returnDuration);

  const fare=el('section','fd-section');fare.append(el('h2','','Fare'));
  const dl=el('dl','fd-facts');
  const fact=(k,v)=>{if(v==null||v==='')return;const wrap=el('div');wrap.append(el('dt','',k),el('dd','',v));dl.append(wrap)};
  fact('Fare type',offer.fareBrand);
  fact('Cabin',offer.cabin);
  fact('Bags',bags(offer.baggage));
  fact('Stops',offer.stops==null?null:offer.stops===0?'Nonstop':`${offer.stops} ${offer.stops===1?'stop':'stops'}`);
  fact('Emissions',offer.emissionsKg!=null?`${Math.round(Number(offer.emissionsKg))} kg CO₂`:null);
  fare.append(dl);
  fare.append(el('p','flight-detail-empty',offer.conditions?'Refund and change terms apply; confirm them with the airline before booking.':'Refund and change terms were not provided for this fare. Confirm them before booking.'));
  root.append(fare);

  const price=el('section','fd-section');
  price.append(el('p','fd-price',offer.totalAmount&&offer.currency?`${offer.currency} ${offer.totalAmount} total`:'Price not available'));
  const actions=el('div','fd-actions');
  const add=el('button','btn btn-primary','Add to Trip');add.type='button';add.disabled=true;
  actions.append(add,el('small','','Saving to a trip is coming. Nothing is saved yet.'));
  price.append(actions);root.append(price);
  document.title=`${offer.operatingCarrier||'Flight'} ${offer.origin||''} to ${offer.destination||''} | TourGuid Travel Store`;
})();
