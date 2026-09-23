(()=>{
  // The end date of a range can never be offered before its start. [start, end, minimum gap in days]:
  // a hotel stay is at least one night; a return flight or trip end may fall on the same day.
  const pairs=[['search-from','search-to',0],['departure','return',0],['depart','return',0],['checkin','checkout',1],['journey-start','journey-end',0]];
  const plus=(iso,days)=>{const d=new Date(`${iso}T00:00:00`);d.setDate(d.getDate()+days);const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`};
  const wire=()=>{
    for(const [startId,endId,gap] of pairs){
      const start=document.getElementById(startId),end=document.getElementById(endId);
      if(!start||!end||start.type!=='date'||end.type!=='date'||start.dataset.rangeWired)continue;
      start.dataset.rangeWired='1';
      const sync=()=>{
        if(!start.value){end.removeAttribute('min');return}
        const min=plus(start.value,gap);
        end.min=min;
        if(end.value&&end.value<min)end.value='';
      };
      start.addEventListener('input',sync);start.addEventListener('change',sync);
      // The end field opens on the start's month: without a value the browser
      // would open on today and make a far-ahead planner page forward.
      end.addEventListener('focus',sync);end.addEventListener('mousedown',sync);
      sync();
    }
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire);else wire();
  window.addEventListener('load',wire);
})();
