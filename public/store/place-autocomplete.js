(()=>{
  // One autocomplete for every place field in the Store. It asks the server's
  // /api/store/suggest (worldwide, no local city list) and keeps the WHOLE
  // suggestion -- name, region, country, lat, lon -- because a bare name is a
  // guess two different cities can share.
  const attach=(input,options={})=>{
    if(!input||input.dataset.placeAutocomplete)return null;
    input.dataset.placeAutocomplete='1';
    let wrap=input.parentElement;
    if(!wrap.classList.contains('place-field-wrap')){
      wrap=document.createElement('div');wrap.className='place-field-wrap';
      input.replaceWith(wrap);wrap.append(input);
    }
    let list=wrap.querySelector('.place-suggestions');
    if(!list){list=document.createElement('ul');list.className='place-suggestions';list.hidden=true;wrap.append(list)}
    list.setAttribute('role','listbox');
    input.setAttribute('autocomplete','off');input.setAttribute('role','combobox');input.setAttribute('aria-expanded','false');input.setAttribute('aria-autocomplete','list');
    const airports=options.kind==='airports';
    const state={place:options.initial||null};
    let debounce=null,seq=0,active=-1,lastQuery='',lastItems=[];
    const memo=new Map();
    const close=()=>{list.hidden=true;list.replaceChildren();input.setAttribute('aria-expanded','false');active=-1};
    const choose=item=>{state.place=item;input.value=airports?item.label:(item.label||item.name);close();options.onChoose?.(item)};
    const setActive=index=>{const rows=[...list.querySelectorAll('li[role="option"]')];if(!rows.length)return;active=(index+rows.length)%rows.length;rows.forEach((row,i)=>row.setAttribute('aria-selected',String(i===active)));rows[active].scrollIntoView({block:'nearest'})};
    const render=(items,message)=>{
      list.replaceChildren();active=-1;
      if(!items.length){const li=document.createElement('li');li.className='place-suggestion-empty';li.textContent=message||'No matching places found.';list.append(li)}
      for(const item of items){
        const li=document.createElement('li');li.setAttribute('role','option');
        const name=document.createElement('strong');name.textContent=airports?`${item.iataCode} · ${item.name}`:item.name;
        const meta=document.createElement('span');meta.textContent=airports?(item.type==='city'?`Every airport · ${item.countryCode||''}`.trim():`Airport · ${[item.cityName,item.countryCode].filter(Boolean).join(', ')}`):[item.region,item.country].filter(Boolean).join(', ');
        li.append(name,meta);
        li.addEventListener('mousedown',event=>{event.preventDefault();choose(item)});
        li._item=item;list.append(li);
      }
      list.hidden=false;input.setAttribute('aria-expanded','true');
    };
    const textOf=item=>[item.name,item.region,item.country,item.iataCode,item.cityName,item.countryCode,item.label].filter(Boolean).join(' ').toLowerCase();
    input.addEventListener('input',()=>{
      if(state.place){state.place=null;options.onClear?.()}
      const q=input.value.trim();
      clearTimeout(debounce);
      if(q.length<2){seq++;wrap.classList.remove('is-loading');close();return}
      const key=q.toLowerCase();
      // A repeat (backspacing) answers instantly from what this field already fetched.
      if(memo.has(key)){seq++;wrap.classList.remove('is-loading');render(memo.get(key));return}
      // Typing on from a query we already hold: narrow that list ourselves so the menu
      // follows every keystroke while the slower server answer is on its way.
      if(lastQuery&&key.startsWith(lastQuery)&&lastItems.length){
        const words=key.split(/\s+/).filter(Boolean);
        const narrowed=lastItems.filter(item=>{const t=textOf(item);return words.every(w=>t.includes(w))});
        if(narrowed.length)render(narrowed);else close();
      }else if(!list.hidden&&lastQuery&&!key.startsWith(lastQuery))close();
      const mine=++seq;
      wrap.classList.add('is-loading');
      debounce=setTimeout(async()=>{
        try{
          const response=await fetch(`/api/store/${airports?'airports':'suggest'}?q=${encodeURIComponent(q)}`,{headers:{Accept:'application/json'}});
          // A newer keystroke has been issued since: this answer is for an older prefix and must not be shown.
          if(mine!==seq)return;
          if(!response.ok){wrap.classList.remove('is-loading');const body=await response.json().catch(()=>null);if(mine!==seq)return;return render([],response.status===503?'Place search is not connected yet.':(response.status===429&&body?.message)||'Place search is unavailable. Try again.')}
          const payload=await response.json();
          const items=Array.isArray(payload.suggestions)?payload.suggestions:[];
          // Kept for later (backspacing), but only the newest answer is ever shown.
          memo.set(key,items);
          if(mine!==seq)return;
          wrap.classList.remove('is-loading');
          lastQuery=key;lastItems=items;
          render(items);
        }catch{if(mine===seq){wrap.classList.remove('is-loading');render([],'Place search is unavailable. Try again.')}}
      },250);
    });
    input.addEventListener('keydown',event=>{
      if(event.key==='Escape')close();
      else if(event.key==='ArrowDown'&&!list.hidden){event.preventDefault();setActive(active+1)}
      else if(event.key==='ArrowUp'&&!list.hidden){event.preventDefault();setActive(active-1)}
      else if(event.key==='Enter'&&!list.hidden&&active>=0){event.preventDefault();const row=list.querySelectorAll('li[role="option"]')[active];if(row?._item)choose(row._item)}
    });
    input.addEventListener('blur',()=>setTimeout(close,120));
    return state;
  };
  // Typed text with no suggestion picked: take the best match, so Enter always goes somewhere.
  const resolveFirst=async text=>{
    const q=String(text||'').trim();
    if(q.length<2)return {place:null,reason:'short'};
    try{
      const response=await fetch(`/api/store/suggest?q=${encodeURIComponent(q)}`,{headers:{Accept:'application/json'}});
      if(!response.ok)return {place:null,reason:response.status===503?'offline':'error'};
      const payload=await response.json();
      const first=Array.isArray(payload.suggestions)?payload.suggestions[0]:null;
      return first?{place:first}:{place:null,reason:'none'};
    }catch{return {place:null,reason:'error'}}
  };
  window.TourGuidPlaces={attach,resolveFirst};
  // Declarative fields: data-place="fill" fills the box; data-place="navigate"
  // reloads THIS page with the chosen place as its destination context.
  const auto=()=>document.querySelectorAll('input[data-place]').forEach(input=>{
    if(input.dataset.place==='navigate'){
      attach(input,{onChoose:place=>{
        const q=new URLSearchParams({destination:place.name});
        for(const key of ['region','country','countryCode','lat','lon'])if(place[key]!=null&&place[key]!=='')q.set(key,place[key]);
        location.href=`${location.pathname}?${q}`;
      }});
    }else attach(input);
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',auto);else auto();
})();
