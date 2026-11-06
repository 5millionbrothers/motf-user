(() => {
  const copy=JSON.parse(document.querySelector('#motfSiteCopy').textContent);
  window.motfSiteCopy=copy;
  const setMeta=(key,value,property=false)=>{let el=document.head.querySelector(`meta[${property?'property':'name'}="${key}"]`);if(!el){el=document.createElement('meta');el.setAttribute(property?'property':'name',key);document.head.append(el);}el.content=value;};
  function update(){
    const path=location.pathname.replace(/\/$/,'')||'/',config=copy.routes[path]||copy.routes['/'];
    document.title=config.title;setMeta('description',config.description||copy.description);
    setMeta('og:title',config.title,true);setMeta('og:description',config.description||copy.description,true);
    setMeta('twitter:title',config.title);setMeta('twitter:description',config.description||copy.description);
    setMeta('robots',config.private?'noindex, follow':'index, follow');
    const canonical=document.head.querySelector('link[rel="canonical"]');if(canonical){const url=new URL(path,copy.origin),query=new URLSearchParams(location.search),keys=({'/stays/detail':['stay'],'/stays/room':['stay','room'],'/events/detail':['event']})[path]||[];keys.forEach(key=>{if(query.get(key))url.searchParams.set(key,query.get(key));});canonical.href=url.href;setMeta('og:url',canonical.href,true);}
  }
  window.addEventListener('motf:routechange',update);window.addEventListener('popstate',update);update();
})();
