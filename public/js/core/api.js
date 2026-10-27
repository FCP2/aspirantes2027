window.api={
 async get(url){const r=await fetch(url);const j=await r.json();if(!r.ok||j.ok===false)throw new Error(j.message||'ERROR');return j.data},
 async post(url,data){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const j=await r.json();if(!r.ok||j.ok===false)throw new Error(j.message||'ERROR');return j.data},
 async put(url,data){const r=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const j=await r.json();if(!r.ok||j.ok===false)throw new Error(j.message||'ERROR');return j.data},
 async postHtml(url,data,signal){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal});if(!r.ok){let message='ERROR AL ACTUALIZAR LA VISTA PREVIA';try{message=(await r.json()).message||message}catch{}throw new Error(message)}return r.text()},
 async delete(url){const r=await fetch(url,{method:'DELETE'});const j=await r.json();if(!r.ok||j.ok===false)throw new Error(j.message||'ERROR');return j.data},
 async uploadMany(url,files){const fd=new FormData();Array.from(files).forEach(file=>fd.append('files',file));const r=await fetch(url,{method:'POST',body:fd});const j=await r.json();if(!r.ok||j.ok===false)throw new Error(j.message||'ERROR');return j.data},
 async replaceUpload(url,file){const fd=new FormData();fd.append('file',file);const r=await fetch(url,{method:'PUT',body:fd});const j=await r.json();if(!r.ok||j.ok===false)throw new Error(j.message||'ERROR');return j.data},
 async upload(url,file){const fd=new FormData();fd.append('file',file);const r=await fetch(url,{method:'POST',body:fd});const j=await r.json();if(!r.ok||j.ok===false)throw new Error(j.message||'ERROR');return j.data}
};
