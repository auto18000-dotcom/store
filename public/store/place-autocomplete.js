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
    const state={place:options.initial||null};
    let debounce=null,seq=0,active=-1;
    const close=()=>{list.hidden=true;list.replaceChildren();input.setAttribute('aria-expanded','false');active=-1};
    const choose=item=>{state.place=item;input.value=item.label||item.name;close();options.onChoose?.(item)};
    const setActive=index=>{const rows=[...list.querySelectorAll('li[role="option"]')];if(!rows.length)return;active=(index+rows.length)%rows.length;rows.forEach((row,i)=>row.setAttribute('aria-selected',String(i===active)));rows[active].scrollIntoView({block:'nearest'})};
    const render=items=>{
      list.replaceChildren();active=-1;
      if(!items.length){const li=document.createElement('li');li.className='place-suggestion-empty';li.textContent='No matching places found.';list.append(li)}
      for(const item of items){
        const li=document.createElement('li');li.setAttribute('role','option');
        const name=document.createElement('strong');name.textContent=item.name;
        const meta=document.createElement('span');meta.textContent=[item.region,item.country].filter(Boolean).join(', ');
        li.append(name,meta);
        li.addEventListener('mousedown',event=>{event.preventDefault();choose(item)});
        li._item=item;list.append(li);
      }
      list.hidden=false;input.setAttribute('aria-expanded','true');
    };
    input.addEventListener('input',()=>{
      if(state.place){state.place=null;options.onClear?.()}
      const q=input.value.trim();
      clearTimeout(debounce);
      if(q.length<2){seq++;close();return}
      const mine=++seq;
      debounce=setTimeout(async()=>{
        try{
          const response=await fetch(`/api/store/suggest?q=${encodeURIComponent(q)}`,{headers:{Accept:'application/json'}});
          if(mine!==seq)return;
          if(!response.ok)return close();
          const payload=await response.json();
          if(mine!==seq)return;
          render(Array.isArray(payload.suggestions)?payload.suggestions:[]);
        }catch{if(mine===seq)close()}
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
  window.TourGuidPlaces={attach};
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
