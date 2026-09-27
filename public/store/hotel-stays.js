(()=>{
  // HOTELS WITH PRICES. Renders /api/store/hotels (LiteAPI stays) on the Hotels page: a dates-and-guests form, the test-data banner, and one card per hotel.
  // Called by category-store.js as window.TourGuidHotels.mount(...); it answers true when it showed the stays, so the page does not also show the older Google listings.
  //
  // WHAT EACH FIELD MEANS, AND WHAT THIS PAGE MUST NEVER DO (owner and TG-Mobile-1A, 2026-09-26; TG-Web-1A's design):
  //  * price.total is the WHOLE STAY. "total for N nights" is printed under the figure, in the same block. It is never a nightly rate, and `fromPrice` is never read.
  //  * price is null when there are no dates, when the hotel has no availability, or when the supplier was throttled. That is NORMAL: no figure and no alarm.
  //  * liveMode false means TEST data. The banner and the mark on the figure both read this flag and nothing else: never a build setting and never a constant.
  //    The banner shows only when a price is on the page AND liveMode is not true: a warning about prices that are not shown teaches people to ignore it.
  //  * notIncluded: null means NOT KNOWN, so the card says nothing about taxes. [] would claim everything is included (only the rooms call can support that);
  //    a list is what is payable at the hotel.
  //  * guestScoreOutOfTen is out of TEN and is not a star rating: it is printed as words, never drawn as stars. `rating` is null on purpose. `stars` is the hotel's class.
  //  * pricedFor says what was actually priced; currency and guest nationality are OUR defaults, so the page says so.
  //  * There is no booking button and no "Book" wording anywhere: TourGuid shows prices only. No LiteAPI key of any kind is in a page.
  const el=(tag,attrs={},...kids)=>{
    const node=document.createElement(tag);
    for(const [key,value] of Object.entries(attrs)){if(value==null||value===false)continue;if(key==='class')node.className=value;else node.setAttribute(key,value===true?'':value)}
    for(const kid of kids.flat()){if(kid==null||kid===false)continue;node.append(kid.nodeType?kid:document.createTextNode(String(kid)))}
    return node;
  };
  const p2=n=>String(n).padStart(2,'0');
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`};
  const isDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'');
  const at=iso=>new Date(`${iso}T12:00:00`);
  const dayText=iso=>at(iso).toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const rangeText=(a,b)=>at(a).getMonth()===at(b).getMonth()?`${dayText(a)} to ${at(b).getDate()}`:`${dayText(a)} to ${dayText(b)}`;
  const plural=(n,one,many)=>`${n} ${n===1?one:(many||`${one}s`)}`;
  const money=(amount,currency)=>{try{return new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:0}).format(amount)}catch{return String(Math.round(amount))}};
  const score=n=>String(Number(n.toFixed(1)));

  const occupancyText=occupancy=>{
    if(!occupancy||!Number.isFinite(occupancy.adults))return '';
    const kids=Array.isArray(occupancy.children)?occupancy.children.length:0;
    return `${plural(occupancy.adults,'adult')}${kids?`, ${plural(kids,'child','children')}`:''}`;
  };

  // The price block, in every state. `state` = { liveMode, dated }.
  const priceBlock=(stay,state,onChoose)=>{
    const price=stay.price;
    if(price&&Number.isFinite(price.total)){
      const mode=state.liveMode===true?'live':state.liveMode===false?'test':'prov';
      const box=el('div',{class:`hs-price ${mode}`,'data-price':mode});
      if(mode==='test')box.append(el('div',{class:'hs-tag'},'Test price · not real'));
      if(mode==='prov')box.append(el('div',{class:'hs-tag'},'Provisional price'));
      box.append(el('div',{class:'hs-fig'},el('b',{},money(price.total,price.currency)),el('span',{class:'hs-cur'},price.currency||'')));
      box.append(el('div',{class:'hs-tot'},`total for ${plural(price.nights,'night')}`));
      const who=[price.checkIn&&price.checkOut?rangeText(price.checkIn,price.checkOut):'',occupancyText(price.occupancy)].filter(Boolean).join(' · ');
      if(who)box.append(el('div',{class:'hs-for'},who));
      if(Array.isArray(price.notIncluded)){
        if(!price.notIncluded.length)box.append(el('div',{class:'hs-fee'},'Taxes and fees included'));
        else{
          box.append(el('div',{class:'hs-fee'},'Taxes and fees included, except:'));
          for(const item of price.notIncluded)box.append(el('div',{class:'hs-fee item'},`${money(item.amount,item.currency)} ${String(item.name||'charge').toLowerCase()} payable at the hotel`));
        }
      }
      if(mode==='prov')box.append(el('div',{class:'hs-fee'},'Live status not confirmed. Treat as provisional.'));
      return box;
    }
    if(state.dated)return el('div',{class:'hs-price na','data-price':'none'},el('b',{},'Price not available for these dates'),el('p',{},'The hotel may be full, or we could not ask just now.'));
    const choose=el('button',{type:'button',class:'hs-choose'},'Choose dates');
    choose.addEventListener('click',onChoose);
    return el('div',{class:'hs-price na','data-price':'dateless'},el('b',{},'Choose dates to see a price'),el('p',{},'Hotel prices depend on the dates and the number of guests.'),choose);
  };

  const card=(stay,state,onChoose)=>{
    const article=el('article',{class:'hs-card',role:'listitem','aria-label':stay.name||'Hotel'});
    article.append(stay.photo?el('img',{class:'hs-photo',src:stay.photo,alt:'',loading:'lazy',referrerpolicy:'no-referrer'}):el('div',{class:'hs-photo empty','aria-hidden':'true'}));
    const body=el('div',{class:'hs-body'});
    body.append(el('h3',{},stay.name||'Hotel'));
    const area=[stay.address,stay.city].filter(Boolean).join(', ');
    if(area)body.append(el('p',{class:'hs-area'},area));
    const facts=[];
    if(typeof stay.guestScoreOutOfTen==='number')facts.push(el('span',{},'Guest score ',el('b',{},`${score(stay.guestScoreOutOfTen)} out of 10`)));
    if(Number.isFinite(stay.reviewCount)&&stay.reviewCount>0)facts.push(el('span',{},`${stay.reviewCount.toLocaleString('en-US')} reviews`));
    if(Number.isFinite(stay.stars)&&stay.stars>0)facts.push(el('span',{},`${stay.stars}-star hotel`));
    if(facts.length)body.append(el('p',{class:'hs-rate'},facts.flatMap((f,i)=>i?[' · ',f]:[f])));
    body.append(priceBlock(stay,state,onChoose));
    article.append(body);
    // No booking button, on purpose: a labelled row that says what this card is. The hotel is found on a map, because the supplier gives no address of a hotel's own site.
    const query=[stay.name,stay.address,stay.city].filter(Boolean).join(', ');
    article.append(el('div',{class:'hs-where'},el('p',{},"TourGuid shows prices only. Check availability on the hotel's own site."),
      el('a',{href:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,target:'_blank',rel:'noopener noreferrer','aria-label':`Find ${stay.name||'the hotel'} on a map (opens in a new tab)`},'Find the hotel ↗')));
    return article;
  };

  const banner=liveMode=>el('div',{class:'live-mode-banner hs-banner',role:'note','data-banner':liveMode===false?'test':'unconfirmed'},
    el('div',{},el('div',{},liveMode===false?'Test data — these hotel prices are not real.':'Live status not confirmed — treat these prices as provisional.'),
      el('small',{},liveMode===false?'Do not plan around them. TourGuid does not take hotel reservations yet.':'Check every price on the hotel’s own site before you rely on it.')));

  const KEYS=['region','country','countryCode','lat','lon'];

  window.TourGuidHotels={
    /** Shows the stays after `after`. Resolves true when it did, false when the page should carry on without it. */
    async mount({after,destination,params}){
      if(!destination)return false;
      // A missing value is not zero: Number(null) is 0, which would pass for a place in the Atlantic.
      const number=v=>v!=null&&String(v).trim()!==''&&Number.isFinite(Number(v));
      const hasPlace=number(params.get('lat'))&&number(params.get('lon'));
      const section=el('section',{class:'wrap hs','aria-labelledby':'hs-h','data-state':'loading'});
      const title=el('h2',{id:'hs-h'},`Hotels in ${destination}`);
      const sub=el('p',{class:'hs-sub'});
      const status=el('p',{class:'hs-status',role:'status','aria-live':'polite'});
      const slot=el('div',{class:'hs-slot'});
      const grid=el('div',{class:'hs-grid',role:'list','aria-label':`Hotels in ${destination}`});
      const note=el('p',{class:'hs-note'});
      const checkIn=el('input',{type:'date',id:'checkin',name:'checkIn',min:today(),value:isDate(params.get('checkIn'))?params.get('checkIn'):''});
      const checkOut=el('input',{type:'date',id:'checkout',name:'checkOut',value:isDate(params.get('checkOut'))?params.get('checkOut'):''});
      const adults=el('input',{type:'number',id:'guests',name:'adults',min:'1',max:'12',value:String(Math.min(12,Math.max(1,Number(params.get('adults'))||2)))});
      const submit=el('button',{class:'btn primary',type:'submit'},'Show prices');
      const clear=el('button',{class:'hs-clear',type:'button'},'Clear dates');
      const form=el('form',{class:'hs-form',novalidate:true},
        el('div',{class:'hs-field'},el('label',{for:'checkin'},'Check-in'),checkIn),
        el('div',{class:'hs-field'},el('label',{for:'checkout'},'Check-out'),checkOut),
        el('div',{class:'hs-field narrow'},el('label',{for:'guests'},'Adults'),adults),
        el('div',{class:'hs-actions'},submit,clear));
      section.append(el('div',{class:'kicker'},'Where to stay'),title,sub,form,status,slot,grid,note);
      after.after(section);
      const chooseDates=()=>{checkIn.focus();try{checkIn.showPicker?.()}catch{}};

      if(!hasPlace){
        // A typed name, an old bookmark or a shared link has no coordinates, and the supplier searches by coordinates only.
        sub.textContent='';form.hidden=true;
        status.textContent='Choose the city from the suggestions above to see hotels and their prices.';
        section.dataset.state='no-coordinates';
        return false;
      }

      let generation=0;
      const load=async()=>{
        const mine=++generation;
        const inValue=checkIn.value,outValue=checkOut.value;
        if(!!inValue!==!!outValue){status.textContent='Choose both dates, or clear both to see hotels without prices.';return}
        if(inValue&&outValue&&outValue<=inValue){status.textContent='Check-out must be at least one night after check-in.';return}
        const q=new URLSearchParams({destination});
        for(const key of KEYS)if(params.get(key))q.set(key,params.get(key));
        if(inValue&&outValue){q.set('checkIn',inValue);q.set('checkOut',outValue)}
        q.set('adults',String(Math.min(12,Math.max(1,Number(adults.value)||2))));
        // The address bar keeps the choices, so a reload or a shared link shows the same stay.
        const shown=new URLSearchParams(location.search);
        for(const key of ['checkIn','checkOut','adults'])shown.delete(key);
        for(const key of ['checkIn','checkOut','adults'])if(q.get(key))shown.set(key,q.get(key));
        history.replaceState(null,'',`${location.pathname}?${shown}`);
        section.dataset.state='loading';status.textContent='Loading hotels…';grid.replaceChildren();slot.replaceChildren();note.textContent='';
        let payload=null,failed=false,badDates=null;
        try{
          const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
          const response=await fetch(`/api/store/hotels?${q}`,{signal:controller.signal,headers:{Accept:'application/json'}});
          clearTimeout(timer);
          if(response.status===400){const body=await response.json().catch(()=>null);if(body&&body.error==='bad_dates')badDates=body.message||'Check the dates and try again.';else failed=true}
          else if(!response.ok)failed=true;
          else payload=await response.json();
        }catch{failed=true}
        if(mine!==generation)return true;
        if(badDates){status.textContent=badDates;section.dataset.state='bad-dates';return true}
        if(failed||!payload||!Array.isArray(payload.stays)){status.textContent='';section.dataset.state='unavailable';section.hidden=true;return false}
        section.hidden=false;
        const stays=payload.stays;
        if(!stays.length){
          // An empty list with a reason is a PROMPT; an empty list without one means nothing was found there. They are not the same sentence.
          status.textContent=payload.reason==='no_coordinates'?'Choose the city from the suggestions above to see hotels and their prices.':`No hotels were found near ${destination}.`;
          section.dataset.state=payload.reason==='no_coordinates'?'no-coordinates':'empty';
          return payload.reason!=='no_coordinates';
        }
        const dated=!!(inValue&&outValue);
        const pricedCount=stays.filter(s=>s.price&&Number.isFinite(s.price.total)).length;
        const state={liveMode:payload.liveMode===true?true:payload.liveMode===false?false:null,dated};
        if(pricedCount>0&&state.liveMode!==true)slot.append(banner(state.liveMode));
        for(const stay of stays)grid.append(card(stay,state,chooseDates));
        sub.textContent=dated?`${rangeText(inValue,outValue)} · ${plural(Math.round((at(outValue)-at(inValue))/86400000),'night')} · ${plural(Number(adults.value)||2,'adult')}`:'Prices appear when you choose dates.';
        status.textContent=dated?`${plural(stays.length,'hotel')}, ${pricedCount} with a price for these dates.`:`${plural(stays.length,'hotel')}.`;
        const priced=payload.pricedFor;
        if(pricedCount>0&&priced)note.textContent=`Priced for ${occupancyText(priced.occupancy)||'the guests shown'}, ${priced.checkIn&&priced.checkOut?rangeText(priced.checkIn,priced.checkOut):'these dates'}, in ${priced.currency||'the currency shown'}${priced.guestNationality?`, for guests from ${priced.guestNationality}`:''}. We chose the currency and the guests’ country for you; you cannot change them here yet. The price is the total for the stay.`;
        section.dataset.state=dated?'priced':'dateless';
        return true;
      };
      form.addEventListener('submit',event=>{event.preventDefault();load()});
      clear.addEventListener('click',()=>{checkIn.value='';checkOut.value='';checkOut.removeAttribute('min');load()});
      return load();
    },
  };
})();
