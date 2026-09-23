(()=>{
  const hero=document.querySelector('.hero');
  const credit=document.querySelector('#hero-photo-credit');
  if(!hero||!credit)return;
  const destination=(new URLSearchParams(location.search).get('destination')||'Barcelona').trim();
  const fallback=destination.toLowerCase().startsWith('barcelona')?{
    image:'https://images.pexels.com/photos/1388030/pexels-photo-1388030.jpeg?auto=compress&cs=tinysrgb&w=2000',
    photographer:'Aleksandar Pasaric',
    page:'https://www.pexels.com/photo/aerial-photography-of-city-1388030/'
  }:null;
  const show=photo=>{
    if(!photo?.image||!photo.image.startsWith('https://images.pexels.com/'))return;
    const image=new Image();
    image.onload=()=>{
      hero.style.backgroundImage=`linear-gradient(90deg,rgba(4,46,55,.87) 0%,rgba(5,77,78,.7) 52%,rgba(5,66,66,.4) 100%),url("${photo.image}")`;
      credit.href=photo.page||'https://www.pexels.com/';
      credit.textContent=`Photo by ${photo.photographer||'a Pexels photographer'} on Pexels`;
      credit.hidden=false;
    };
    image.src=photo.image;
  };
  if(fallback)show(fallback);
  fetch(`/api/store/hero-photo?destination=${encodeURIComponent(destination)}`,{headers:{Accept:'application/json'}})
    .then(response=>response.ok?response.json():null)
    .then(photo=>{if(photo?.source==='pexels_api')show(photo)})
    .catch(()=>{});
})();
