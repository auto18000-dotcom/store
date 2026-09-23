(()=>{
  // Wall clocks arrive with no zone (local to each airport): read them as text, never through Date().
  const clock=iso=>{const m=/T(\d{2}:\d{2})/.exec(iso||'');return m?m[1]:null};
  const day=iso=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(iso||'');if(!m)return null;return new Date(Date.UTC(+m[1],+m[2]-1,+m[3])).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})};
  const span=iso=>{const m=/^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(iso||'');if(!m||(!m[1]&&!m[2]))return null;return `${m[1]?`${m[1]}h`:''}${m[1]&&m[2]?' ':''}${m[2]?`${m[2]}m`:''}`};
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node};
  const logo=url=>{try{const u=new URL(url);return u.protocol==='https:'?u.href:null}catch{return null}};
  const legLine=(label,origin,dest,dep,arr,dur,stops)=>{
    const parts=[`${origin} ${clock(dep)||''} → ${dest} ${clock(arr)||''}`.replace(/\s+/g,' ').trim(),day(dep),span(dur),stops==null?null:stops===0?'Nonstop':`${stops} ${stops===1?'stop':'stops'}`].filter(Boolean);
    const row=el('p','flight-leg');row.append(el('b','',label+' '),document.createTextNode(parts.join(' · ')));return row;
  };
  // Bags decide whether a fare is a deal, so they sit beside the price. Absent data says nothing rather than "no bags".
  const bagText=list=>{if(!Array.isArray(list))return null;const n=type=>list.filter(b=>b&&b.type===type).reduce((t,b)=>t+(Number(b.quantity)||0),0);const carry=n('carry_on'),checked=n('checked');return `${checked} checked · ${carry} carry-on`};
  const bagKey=list=>Array.isArray(list)?bagText(list):null;
  const card=(offer,ctx)=>{
    const c=el('article','card flight-card');const body=el('div','card-body');
    const head=el('div','flight-head');
    const mark=logo(offer.airlineLogo);
    if(mark){const img=el('img','flight-logo');img.src=mark;img.alt='';img.width=32;img.height=32;img.loading='lazy';head.append(img)}
    head.append(el('h3','',offer.operatingCarrier||'Operating carrier unavailable'));
    body.append(head);
    const flags=el('div','flight-flags');
    if(offer.cheapest)flags.append(el('span','flight-flag flag-cheapest','Cheapest'));
    if(offer.fastest)flags.append(el('span','flight-flag flag-fastest','Fastest'));
    if(offer.fewestStops)flags.append(el('span','flight-flag flag-stops','Fewest stops'));
    if(flags.children.length)body.append(flags);
    const rs=Array.isArray(offer.returnSegments)?offer.returnSegments:[];
    body.append(legLine('Outbound',offer.origin||ctx.origin,offer.destination||ctx.destination,offer.departure,offer.arrival,offer.duration,offer.stops));
    if(rs.length){const last=rs[rs.length-1];body.append(legLine('Return',rs[0].origin,last.destination,rs[0].departure,last.arrival,offer.returnDuration,rs.length-1))}
    const cabins=[...new Set([...(Array.isArray(offer.segments)?offer.segments:[]),...rs].map(g=>g.cabin).filter(Boolean))];const facts=[offer.fareBrand,offer.cabin||(cabins.length?cabins.join(' / '):null),offer.emissionsKg!=null?`${Math.round(offer.emissionsKg)} kg CO₂`:null].filter(Boolean);
    if(facts.length)body.append(el('p','flight-facts',facts.join(' · ')));
    const baggageLine=bagText(offer.baggage);
    const segs=[...(Array.isArray(offer.segments)?offer.segments:[]),...rs];
    if(baggageLine)body.append(el('p','flight-bags',`Bags: ${baggageLine}`));
    else if(segs.some(g=>Array.isArray(g.baggage))){
      // Mixed across the journey: show each segment rather than a headline the data does not support.
      const line=el('p','flight-bags','Bags vary by flight: ');
      line.append(document.createTextNode(segs.filter(g=>Array.isArray(g.baggage)).map(g=>`${g.origin}→${g.destination} ${bagText(g.baggage)}`).join(' · ')));
      body.append(line);
    }
    body.append(el('p','flight-price',offer.totalAmount&&offer.currency?`${offer.currency} ${offer.totalAmount} total`:'Price not available'));
    if(offer.detailUrl){const u=new URL(offer.detailUrl,location.origin);if(u.origin===location.origin){const link=el('a','btn btn-primary','View flight');link.href=u.href;body.append(link)}}
    window.TourGuidJourney?.addButton(body,{title:`${offer.operatingCarrier||'Flight'} ${offer.origin||ctx.origin} to ${offer.destination||ctx.destination}`,type:'Flight',source:'Duffel'});
    c.append(body);return c;
  };
  window.TourGuidFlights={card};
})();
