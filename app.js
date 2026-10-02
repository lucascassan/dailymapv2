'use strict';
const $=id=>document.getElementById(id), palette=['#2563eb','#8b5cf6','#059669','#e08820'];
const DEFAULT_BACKGROUND='#f8faff';
function emptyState(){return{backgroundColor:DEFAULT_BACKGROUND,projectName:'Projeto',areas:[],employees:[],assignments:{},source:'Mapa personalizado',catalogRevision:window.AREA_REVISION}}
let state=emptyState(),selected=null,zoom=1,mapZoom=1,viewMode='map';
let cardLayouts=Object.create(null),currentGeometry=null,editMode=false,pendingAssignment=null;
try{const saved=JSON.parse(localStorage.getItem('mapa-daily-layout')||'{}');for(const [id,box] of Object.entries(saved||{})){if(box&&['x','y','w','h','scale'].every(key=>Number.isFinite(box[key]))&&box.w>0&&box.h>0&&box.scale>0)cardLayouts[id]=box}}catch{}
function saveLayout(){if(window.DailyOnline?.active){window.DailyOnline.publish();return}try{localStorage.setItem('mapa-daily-layout',JSON.stringify(cardLayouts))}catch{toast('Não foi possível salvar a posição dos cards.')}}
function cardHandles(card){
 for(const [mode,symbol,label] of [['move','✥','Arrastar card'],['resize','↘','Redimensionar card'],['grow','+','Aumentar fonte'],['shrink','−','Diminuir fonte']]){
  const handle=el('button','card-handle '+mode,symbol);handle.type='button';handle.hidden=!editMode;handle.title=label+((mode==='move'||mode==='resize')?' (ou use as setas)':'');handle.setAttribute('aria-label',label);handle.addEventListener('click',event=>event.stopPropagation());
  const change=(base,dx,dy)=>{
   if(!editMode||viewMode==='compact')return;const width=$('branches').clientWidth,height=$('branches').clientHeight;let box={...base};
   if(mode==='grow'||mode==='shrink'){cardLayouts[card.dataset.id]={x:base.x/width,y:base.y/height,w:base.w/width,h:base.h/height,scale:zoom,font:Math.max(6,Math.min(48,base.font+(mode==='grow'?1:-1)))};drawLines();return}
   if(mode==='move'){box.x+=dx;box.y+=dy}else{box.w=Math.max(Math.min(72,width),Math.min(width,box.w+dx));box.h=Math.max(Math.min(48,height),Math.min(height,box.h+dy));if(mode==='resize'){box.x=base.x+(box.w-base.w)/2;box.y=base.y+(box.h-base.h)/2}}
   box.x=Math.max(box.w/2,Math.min(width-box.w/2,box.x));box.y=Math.max(box.h/2,Math.min(height-box.h/2,box.y));
   const core=currentGeometry.core;if(Math.abs(box.x-width/2)<(box.w+core)/2+6&&Math.abs(box.y-height/2)<(box.h+core)/2+6)return;
   if(currentGeometry.cards.some(other=>other.id!==card.dataset.id&&Math.abs(box.x-other.x)<(box.w+other.w)/2+6&&Math.abs(box.y-other.y)<(box.h+other.h)/2+6))return;
   cardLayouts[card.dataset.id]={x:box.x/width,y:box.y/height,w:box.w/width,h:box.h/height,scale:zoom,font:base.font};drawLines();window.DailyOnline?.publish();
  };
  handle.addEventListener('pointerdown',event=>{
   if(!editMode||mode==='grow'||mode==='shrink'||event.button!==0||viewMode==='compact'||!currentGeometry)return;event.preventDefault();event.stopPropagation();const base={...currentGeometry.cards.find(box=>box.id===card.dataset.id)},x=event.clientX,y=event.clientY;const previous=cardLayouts[card.dataset.id];handle.setPointerCapture(event.pointerId);card.classList.add('editing');
   const move=e=>change(base,(e.clientX-x)/mapZoom,(e.clientY-y)/mapZoom);
   const finish=e=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',finish);handle.removeEventListener('pointercancel',finish);card.classList.remove('editing');if(e.type==='pointercancel'){if(previous)cardLayouts[card.dataset.id]=previous;else delete cardLayouts[card.dataset.id];drawLines()}else saveLayout()};
   handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);
  });
  handle.addEventListener('keydown',event=>{const delta={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[event.key];if(!editMode||mode==='grow'||mode==='shrink'||!delta||viewMode==='compact'||!currentGeometry)return;event.preventDefault();event.stopPropagation();change(currentGeometry.cards.find(box=>box.id===card.dataset.id),...delta);saveLayout()});if(mode==='grow'||mode==='shrink')handle.addEventListener('click',event=>{event.stopPropagation();if(!editMode||!currentGeometry)return;const base=currentGeometry.cards.find(box=>box.id===card.dataset.id),factor=mode==='grow'?1.1:1/1.1;change(base,base.w*(factor-1),base.h*(factor-1));saveLayout()});card.append(handle);
 }
 const trash=el('button','card-handle delete-area');trash.type='button';trash.hidden=!editMode;trash.title='Excluir área';trash.setAttribute('aria-label','Excluir área');trash.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';trash.addEventListener('click',event=>{event.stopPropagation();deleteArea(card.dataset.id)});card.append(trash);
}
function normalizeTasks(data){data.employees.forEach(employee=>{if(!employee.tasksByArea){employee.tasksByArea={};const first=(data.assignments[employee.id]||[])[0];if(first&&employee.taskNumbers?.length)employee.tasksByArea[first]=[...employee.taskNumbers]}})}
function validState(s){return s&&(s.backgroundColor===undefined||typeof s.backgroundColor==='string'&&/^#[0-9a-f]{6}$/i.test(s.backgroundColor))&&(s.projectName===undefined||typeof s.projectName==='string'&&s.projectName.trim().length>0&&s.projectName.length<=100)&&Array.isArray(s.areas)&&s.areas.length<=500&&s.areas.every(a=>typeof a.id==='string'&&typeof a.name==='string'&&a.name.length>0&&Array.isArray(a.topics)&&a.topics.every(t=>typeof t==='string'))&&new Set(s.areas.map(a=>a.id)).size===s.areas.length&&Array.isArray(s.employees)&&s.employees.length<=1000&&s.employees.every(e=>typeof e.id==='string'&&typeof e.name==='string'&&e.name.trim()&&typeof e.role==='string'&&(e.tasksByArea===undefined||e.tasksByArea&&typeof e.tasksByArea==='object'&&!Array.isArray(e.tasksByArea)&&Object.entries(e.tasksByArea).every(([id,numbers])=>s.areas.some(area=>area.id===id)&&Array.isArray(numbers)&&numbers.every(number=>typeof number==='string'&&/^[0-9]{1,30}$/.test(number))))&&/^#[0-9a-f]{6}$/i.test(e.color)&&(e.taskNumbers===undefined||Array.isArray(e.taskNumbers)&&e.taskNumbers.every(number=>typeof number==='string'&&/^[0-9]{1,30}$/.test(number))))&&new Set(s.employees.map(e=>e.id)).size===s.employees.length&&s.assignments&&typeof s.assignments==='object'&&!Array.isArray(s.assignments)&&Object.entries(s.assignments).every(([id,ids])=>s.employees.some(e=>e.id===id)&&Array.isArray(ids)&&ids.every(a=>s.areas.some(x=>x.id===a)));}
try{const saved=JSON.parse(localStorage.getItem('mapa-daily-v1'));if(validState(saved)){state=saved;normalizeTasks(state)}}catch{}
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',3500)}
function save(){if(window.DailyOnline?.active){window.DailyOnline.publish();return}try{localStorage.setItem('mapa-daily-v1',JSON.stringify(state));$('save-status').textContent='Salvo neste navegador'}catch{$('save-status').textContent='Não foi possível salvar';toast('O navegador não permitiu salvar. Exporte um backup.')}}
function el(tag,cls,text){const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x}
function avatar(e){const x=el('span','avatar',e.name.trim().split(/\s+/).map(n=>n[0]).slice(0,2).join('').toUpperCase());x.style.setProperty('--person-color',e.color);return x}
function parseTasks(text){if(typeof text!=='string')throw Error('Informe as tarefas separadas por vírgula.');const numbers=text.split(',').map(number=>number.trim());if(!numbers.length||numbers.some(number=>!/^[0-9]{1,30}$/.test(number)))throw Error('Use números separados por vírgula, como 0001, 0002.');return[...new Set(numbers)]}
function updateTaskNumbers(employee){employee.taskNumbers=[...new Set(Object.values(employee.tasksByArea||{}).flat())]}
function removeAssignment(employeeId,areaId){const employee=state.employees.find(item=>item.id===employeeId);if(!employee)return;state.assignments[employeeId]=(state.assignments[employeeId]||[]).filter(id=>id!==areaId);if(employee.tasksByArea)delete employee.tasksByArea[areaId];updateTaskNumbers(employee);save();render()}
function deleteArea(id){const area=state.areas.find(item=>item.id===id);if(!area||!confirm('Excluir a área '+area.name+' e suas alocações?'))return;state.areas=state.areas.filter(item=>item.id!==id);state.employees.forEach(employee=>{state.assignments[employee.id]=(state.assignments[employee.id]||[]).filter(areaId=>areaId!==id);delete employee.tasksByArea?.[id];updateTaskNumbers(employee)});delete cardLayouts[id];state.source='Mapa personalizado';save();saveLayout();render();toast('Área excluída.')}
function assign(employeeId,areaId,taskNumber){
 if(window.DailyOnline?.active&&!window.DailyOnline.canEdit)throw Error("Visitantes apenas visualizam a sessão.");
 const employee=state.employees.find(person=>person.id===employeeId),area=state.areas.find(item=>item.id===areaId);if(!employee||!area)throw Error('Pessoa ou área inválida.');
 const ids=state.assignments[employeeId]||[];
 if(taskNumber===undefined){pendingAssignment={employeeId,areaId};$('task-context').textContent=employee.name+' · '+area.name;$('task-form').reset();$('task-number').value='';$('task-number').setCustomValidity('');$('task-dialog').showModal();$('task-number').focus();return}
 const numbers=parseTasks(taskNumber);employee.tasksByArea??={};employee.tasksByArea[areaId]=[...new Set([...(employee.tasksByArea[areaId]||[]),...numbers])];state.assignments[employeeId]=[...new Set([...ids,areaId])];updateTaskNumbers(employee);save();render();toast('Tarefas registradas: '+numbers.join(', ')+'.');
}
$('task-number').addEventListener('input',()=>$('task-number').setCustomValidity(''));
$('task-form').addEventListener('submit',event=>{event.preventDefault();if(!pendingAssignment)return;const text=$('task-number').value.trim();try{parseTasks(text)}catch(error){$('task-number').setCustomValidity(error.message);$('task-number').reportValidity();$('task-number').focus();return}const {employeeId,areaId}=pendingAssignment;assign(employeeId,areaId,text);$('task-dialog').close()});
$('task-dialog').addEventListener('close',()=>{pendingAssignment=null});$('cancel-task').onclick=()=>$('task-dialog').close();
function hideTooltip(){$('area-tooltip').hidden=true}
function areaTooltipContent(area){
 return{title:area.name,topics:area.topics,participants:state.employees.filter(employee=>(state.assignments[employee.id]||[]).includes(area.id)).map(employee=>({name:employee.name,color:employee.color,tasks:employee.tasksByArea?.[area.id]||((state.assignments[employee.id]||[]).length===1?employee.taskNumbers||[]:[])}))};
}
function areaHint(card,area){
 card.setAttribute('aria-describedby','area-tooltip');
 const show=()=>{
  if(document.querySelector('dialog[open]'))return;
  const tooltip=$('area-tooltip'),content=areaTooltipContent(area);tooltip.replaceChildren(el('strong','tooltip-title',content.title));
  const topics=el('ul','tooltip-topics');(content.topics.length?content.topics:['Nenhuma descrição cadastrada.']).forEach(topic=>topics.append(el('li','',topic)));tooltip.append(topics,el('div','tooltip-section','Participantes e tarefas'));
  if(!content.participants.length)tooltip.append(el('p','tooltip-empty','Nenhum participante nesta área.'));
  content.participants.forEach(participant=>{
   const row=el('div','tooltip-participant'),dot=el('span','tooltip-dot');dot.style.backgroundColor=participant.color;
   const info=el('div','tooltip-person');info.append(el('strong','',participant.name),el('p','',participant.tasks.length?'Tarefas: '+participant.tasks.join(', '):'Nenhuma tarefa vinculada.'));row.append(dot,info);tooltip.append(row);
  });
  tooltip.hidden=false;const box=card.getBoundingClientRect(),width=tooltip.offsetWidth,height=tooltip.offsetHeight;
  tooltip.style.left=Math.max(12,Math.min(window.innerWidth-width-12,box.left+box.width/2-width/2))+'px';
  tooltip.style.top=Math.max(12,box.bottom+12+height<window.innerHeight?box.bottom+12:box.top-height-12)+'px';
 };
 card.addEventListener('pointerenter',show);card.addEventListener('pointerleave',hideTooltip);card.addEventListener('focusin',show);card.addEventListener('focusout',event=>{if(!card.contains(event.relatedTarget))hideTooltip()});card.addEventListener('dragstart',hideTooltip);card.addEventListener('click',hideTooltip);
}
function nextEmployeeColor(){
 const used=new Set(state.employees.map(employee=>employee.color.toLowerCase()));const available=palette.find(color=>!used.has(color));if(available)return available;
 for(let i=0;i<20000;i++){
  const hue=(i*137.508)%360,saturation=.62,lightness=.46,a=saturation*Math.min(lightness,1-lightness);
  const channel=n=>{const k=(n+hue/30)%12;return Math.round(255*(lightness-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0')};
  const color='#'+channel(0)+channel(8)+channel(4);if(!used.has(color))return color;
 }throw Error('Não foi possível atribuir uma cor.');
}
function dropTarget(node,action){node.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';node.classList.add('dragover')});node.addEventListener('dragleave',e=>{if(!node.contains(e.relatedTarget))node.classList.remove('dragover')});node.addEventListener('drop',e=>{e.preventDefault();node.classList.remove('dragover');const id=e.dataTransfer.getData('text/plain');if(state.employees.some(p=>p.id===id))action(id)})}
function drag(node,id){node.draggable=true;node.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',id);e.dataTransfer.effectAllowed='copyMove'})}
function applyBackground(){const color=state.backgroundColor||DEFAULT_BACKGROUND;$('viewport').style.background=color;$('background-color').value=color}
function render(){applyBackground();hideTooltip();const projectName=state.projectName||'Projeto';$('project-title').textContent=projectName;document.title='Mapa Daily · '+projectName;const areas=state.areas;$('branches').replaceChildren();$('people').replaceChildren();$('area-count').textContent=state.areas.length;$('people-count').textContent=state.employees.length;$('allocated-count').textContent=state.employees.filter(e=>(state.assignments[e.id]||[]).length).length;$('source-label').textContent=state.source||'CSV importado';$('no-results').hidden=areas.length>0;$('map').hidden=!areas.length;
areas.forEach((a,i)=>{const card=el('article','area');card.dataset.id=a.id;areaHint(card,a);card.style.setProperty('--accent',palette[Math.floor(i/2)%palette.length]);card.tabIndex=0;card.setAttribute('aria-label',a.name+(selected?' — alocar pessoa selecionada':''));const heading=el('button','area-title');heading.type='button';heading.append(el('span','area-number',String(state.areas.indexOf(a)+1).padStart(2,'0')),el('span','',a.name),el('span','chevron','+'));heading.setAttribute('aria-expanded','false');const preview=el('p','topics-preview',a.topics.join(' · ')),list=el('ul','topics');list.hidden=true;a.topics.forEach(t=>list.append(el('li','',t)));heading.addEventListener('click',e=>{e.stopPropagation();if(selected){assign(selected,a.id);return}showTopics(a)});const assigned=el('div','assigned');const people=state.employees.filter(e=>(state.assignments[e.id]||[]).includes(a.id));card.classList.toggle('occupied',people.length>0);people.forEach(e=>{const chip=el('div','chip');drag(chip,e.id);chip.append(avatar(e),el('span','',e.name));const remove=el('button','','×');remove.setAttribute('aria-label','Retirar '+e.name+' de '+a.name);remove.addEventListener('click',evt=>{evt.stopPropagation();removeAssignment(e.id,a.id)});chip.append(remove);assigned.append(chip)});if(!people.length)assigned.append(el('span','drop-label',selected?'Clique para alocar a pessoa selecionada':'Solte um funcionário aqui'));card.append(heading,preview,list,assigned);cardHandles(card);dropTarget(card,id=>assign(id,a.id));card.addEventListener('click',e=>{if(selected&&!e.target.closest('button'))assign(selected,a.id)});card.addEventListener('keydown',e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();if(selected)assign(selected,a.id);else heading.click()}});$('branches').append(card)});
state.employees.forEach(e=>{const person=el('div','person'+(selected===e.id?' selected':'')+((state.assignments[e.id]||[]).length?' allocated':''));person.tabIndex=0;person.setAttribute('role','button');person.setAttribute('aria-pressed',String(selected===e.id));person.setAttribute('aria-label','Selecionar '+e.name+' para alocar');drag(person,e.id);const info=el('div','person-info');info.append(el('strong','',e.name),el('small','',e.role||'Funcionário'),el('small','allocation',(state.assignments[e.id]||[]).length+' área(s)'));if(e.taskNumbers?.length)info.append(el('small','task-numbers','Tarefa(s): '+e.taskNumbers.join(', ')));const del=el('button','delete','×');del.setAttribute('aria-label','Excluir '+e.name);del.addEventListener('click',evt=>{evt.stopPropagation();if(!confirm('Excluir '+e.name+' e suas alocações?'))return;state.employees=state.employees.filter(p=>p.id!==e.id);delete state.assignments[e.id];if(selected===e.id)selected=null;save();render()});const select=()=>{selected=selected===e.id?null:e.id;render();if(selected)toast('Clique em uma área para alocar. Clique na pessoa novamente para cancelar.')};person.addEventListener('click',select);person.addEventListener('keydown',evt=>{if(evt.target===person&&(evt.key==='Enter'||evt.key===' ')){evt.preventDefault();select()}});person.append(el('span','grip','⠿'),avatar(e),info,del);$('people').append(person)});if(!state.employees.length)$('people').append(el('div','empty','Cadastre o time para começar a distribuir as pessoas no mapa.'));window.DailyOnline?.applyPermissions();requestAnimationFrame(drawLines)}
function showTopics(area){const dialog=el('dialog');const close=el('button','','×');close.setAttribute('aria-label','Fechar assuntos');close.onclick=()=>dialog.close();const list=el('ul','topics');area.topics.forEach(topic=>list.append(el('li','',topic)));dialog.append(close,el('h2','',area.name),list);dialog.addEventListener('close',()=>dialog.remove());dialog.addEventListener('click',event=>{if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dialog.close()}});document.body.append(dialog);dialog.showModal()}
function orbitLayout(width,height,count,scale=1){
 const cx=width/2,cy=height/2,core=Math.min(132,width*.22,height*.27);
 let cardWidth=Math.min(132*scale,width*.26),cardHeight=Math.min(78*scale,height*.22);
 function intersects(a,b,box,padding=5){
  let lo=0,hi=1;
  for(const [origin,delta,min,max] of [[a.x,b.x-a.x,box.x-box.w/2-padding,box.x+box.w/2+padding],[a.y,b.y-a.y,box.y-box.h/2-padding,box.y+box.h/2+padding]]){
   if(Math.abs(delta)<1e-8){if(origin<min||origin>max)return false;continue}
   const t1=(min-origin)/delta,t2=(max-origin)/delta;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)return false;
  }return true;
 }
 let cards=[];
 for(let attempt=0;attempt<80;attempt++){
  const rx=Math.max(0,(width-cardWidth)/2-10),ry=Math.max(0,(height-cardHeight)/2-10);
  cards=Array.from({length:count},(_,index)=>{
   const angle=-Math.PI/2+index*Math.PI*2/count,dx=rx*Math.cos(angle),dy=ry*Math.sin(angle),distance=Math.hypot(dx,dy);
   const reach=Math.min(cardWidth/2/Math.max(Math.abs(dx),1e-8),cardHeight/2/Math.max(Math.abs(dy),1e-8));
   return{x:cx+dx,y:cy+dy,w:cardWidth,h:cardHeight,start:{x:cx+dx/distance*core/2,y:cy+dy/distance*core/2},end:{x:cx+dx*(1-reach),y:cy+dy*(1-reach)}};
  });
  const blocked=cards.some((card,i)=>cards.some((other,j)=>i!==j&&(intersects(card.start,card.end,other)||Math.abs(card.x-other.x)<(card.w+other.w)/2+8&&Math.abs(card.y-other.y)<(card.h+other.h)/2+8)));
  if(!blocked)break;cardWidth*=.94;cardHeight*=.94;
 }
 return{core,cards};
}
function connectionRoute(start,end,obstacles){
 function blocked(a,b){return obstacles.some(box=>{let lo=0,hi=1;for(const [o,d,min,max] of [[a.x,b.x-a.x,box.x-box.w/2-3,box.x+box.w/2+3],[a.y,b.y-a.y,box.y-box.h/2-3,box.y+box.h/2+3]]){if(Math.abs(d)<1e-8){if(o<min||o>max)return false}else{const u=(min-o)/d,v=(max-o)/d;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));if(lo>hi)return false}}return true})}
 if(!blocked(start,end))return[start,end];
 const nodes=[start,end];obstacles.forEach(box=>{for(const dx of [-1,1])for(const dy of [-1,1])nodes.push({x:box.x+dx*(box.w/2+7),y:box.y+dy*(box.h/2+7)})});
 const distance=nodes.map(()=>Infinity),previous=[],visited=new Set();distance[0]=0;
 for(let step=0;step<nodes.length;step++){let next=-1;nodes.forEach((_,i)=>{if(!visited.has(i)&&(next<0||distance[i]<distance[next]))next=i});if(next<0||!Number.isFinite(distance[next]))break;if(next===1){const path=[];for(let i=1;i!==undefined;i=previous[i])path.unshift(nodes[i]);return path}visited.add(next);
  nodes.forEach((node,i)=>{if(visited.has(i))return;const cost=distance[next]+Math.hypot(node.x-nodes[next].x,node.y-nodes[next].y);if(cost<distance[i]&&!blocked(nodes[next],node)){distance[i]=cost;previous[i]=next}});
 }return[];
}
function drawLines(){

 const map=$('map'),grid=$('branches'),cards=[...grid.children],root=map.querySelector('.root'),svg=$('connections');
 svg.replaceChildren();if(!cards.length||!grid.clientWidth||!grid.clientHeight){currentGeometry=null;applyMapZoom();return;}
 const layout=orbitLayout(grid.clientWidth,grid.clientHeight,cards.length,zoom);
 const width=grid.clientWidth,height=grid.clientHeight;
 layout.cards.forEach((box,index)=>{box.id=cards[index].dataset.id;const saved=cardLayouts[box.id];if(saved){box.w=Math.min(width,saved.w*width*zoom/saved.scale);box.h=Math.min(height,saved.h*height*zoom/saved.scale);box.x=Math.max(box.w/2,Math.min(width-box.w/2,saved.x*width));box.y=Math.max(box.h/2,Math.min(height-box.h/2,saved.y*height))}
 });
 const fitted=fitZoomCards(layout.cards,layout.core,map.clientWidth,map.clientHeight,grid.offsetLeft,grid.offsetTop,mapZoom);mapZoom=fitted.scale;layout.cards=fitted.cards;
 layout.cards.forEach(box=>{const dx=box.x-width/2,dy=box.y-height/2,distance=Math.max(1,Math.hypot(dx,dy)),reach=Math.min(box.w/2/Math.max(Math.abs(dx),1e-8),box.h/2/Math.max(Math.abs(dy),1e-8));box.start={x:width/2+dx/distance*layout.core/2,y:height/2+dy/distance*layout.core/2};box.end={x:box.x-dx*reach,y:box.y-dy*reach};});currentGeometry=layout;
 root.style.width=layout.core+'px';root.style.height=layout.core+'px';
 const offsetX=grid.offsetLeft,offsetY=grid.offsetTop;
 layout.connectionPoints=[];
 cards.forEach((card,index)=>{
  const box=layout.cards[index];const saved=cardLayouts[box.id];box.font=saved&&Number.isFinite(saved.font)?Math.max(6,Math.min(48,saved.font*zoom/saved.scale)):Math.min(13*zoom,box.w/8,box.h/3.8);card.style.gridColumn='';card.style.gridRow='';
  Object.assign(card.style,{left:(box.x-box.w/2)+'px',top:(box.y-box.h/2)+'px',width:box.w+'px',height:box.h+'px'});
  card.style.setProperty('--card-font',box.font+'px');
  const line=document.createElementNS('http://www.w3.org/2000/svg','path');
  const points=connectionRoute(box.start,box.end,layout.cards.filter(other=>other!==box));line.setAttribute('d',points.map((point,i)=>(i?'L ':'M ')+(point.x+offsetX)+' '+(point.y+offsetY)).join(' '));line.setAttribute('stroke-linejoin','round');
  layout.connectionPoints.push(...points.map(point=>({x:point.x+offsetX,y:point.y+offsetY})));
  line.setAttribute('fill','none');line.setAttribute('stroke',card.style.getPropertyValue('--accent'));line.setAttribute('stroke-opacity','.4');line.setAttribute('stroke-width','1.5');svg.append(line);
 });
 applyMapZoom(fitted.limited);
}
function setZoom(value){zoom=value;$('map').style.zoom=1;$('map').style.setProperty('--size-scale',zoom);drawLines()}
function fitZoomCards(cards,core,width,height,offsetX,offsetY,requested){
 const cx=width/2-offsetX,cy=height/2-offsetY;
 for(let scale=Math.min(2,requested);scale>=.5;scale=Math.round((scale-.02)*100)/100){
  const padding=20/scale,gap=8,minX=cx-width/(2*scale)+padding,maxX=cx+width/(2*scale)-padding,minY=cy-height/(2*scale)+padding,maxY=cy+height/(2*scale)-padding;
  const placed=[{x:cx,y:cy,w:core,h:core}],result=new Map();let fits=true;
  for(const original of [...cards].sort((a,b)=>b.w*b.h-a.w*a.h)){
   const box={...original},left=minX+box.w/2,right=maxX-box.w/2,top=minY+box.h/2,bottom=maxY-box.h/2;
   if(left>right||top>bottom){fits=false;break}
   const x=Math.max(left,Math.min(right,box.x)),y=Math.max(top,Math.min(bottom,box.y));
   const free=(px,py)=>placed.every(other=>Math.abs(px-other.x)>=(box.w+other.w)/2+gap||Math.abs(py-other.y)>=(box.h+other.h)/2+gap);
   if(free(x,y)){box.x=x;box.y=y}else{
    const xs=[left,right,x],ys=[top,bottom,y];placed.forEach(other=>{xs.push(other.x-(other.w+box.w)/2-gap,other.x+(other.w+box.w)/2+gap);ys.push(other.y-(other.h+box.h)/2-gap,other.y+(other.h+box.h)/2+gap)});
    const candidates=[];for(const px of xs)for(const py of ys)if(px>=left&&px<=right&&py>=top&&py<=bottom)candidates.push({x:px,y:py,d:(px-x)**2+(py-y)**2});
    candidates.sort((a,b)=>a.d-b.d);const position=candidates.find(point=>free(point.x,point.y));
    if(!position){fits=false;break}box.x=position.x;box.y=position.y;
   }
   placed.push(box);result.set(box.id,box);
  }
  if(fits)return{scale,cards:cards.map(box=>result.get(box.id)),limited:scale<requested-.001};
 }
 return{scale:.5,cards,limited:true};
}
function applyMapZoom(limited=false){hideTooltip();$('map').style.transform=`scale(${mapZoom})`;$('map-zoom-label').textContent=Math.round(mapZoom*100)+'%';$('map-zoom-in').disabled=limited||mapZoom>=2;$('map-zoom-out').disabled=mapZoom<=.5;}
function setMapZoom(value){mapZoom=Math.max(.5,Math.min(2,Math.round(value*100)/100));drawLines();}
$('map-zoom-in').onclick=()=>setMapZoom(mapZoom+.1);
$('map-zoom-out').onclick=()=>setMapZoom(mapZoom-.1);
function setEditMode(enabled){editMode=enabled;$('background-control').hidden=!enabled;document.body.classList.toggle('cards-editable',enabled);$('edit-map').setAttribute('aria-pressed',String(enabled));$('edit-map').title=enabled?'Terminar edição':'Editar cards';$('edit-map').setAttribute('aria-label',enabled?'Terminar edição':'Editar cards');document.querySelectorAll('.card-handle').forEach(handle=>handle.hidden=!enabled)}
$('edit-map').onclick=()=>setEditMode(!editMode);
$('background-color').addEventListener('input',event=>{state.backgroundColor=event.target.value;applyBackground();save()});
function expandMap(expanded){document.body.classList.toggle('map-expanded',expanded);$('fit').setAttribute('aria-pressed',String(expanded));$('fit').setAttribute('aria-label',expanded?'Restaurar visualização':'Expandir mapa');$('fit').title=expanded?'Restaurar visualização (Esc)':'Expandir mapa';requestAnimationFrame(drawLines)}
$('fit').onclick=()=>expandMap(!document.body.classList.contains('map-expanded'));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]'))expandMap(false)});

$('employee-form').addEventListener('submit',e=>{e.preventDefault();const name=$('name').value.trim();if(!name){$('name').focus();return}if(state.employees.length>=1000){toast('Limite de 1.000 membros atingido.');return}state.employees.push({id:crypto.randomUUID(),name,role:$('role').value.trim(),color:nextEmployeeColor(),taskNumbers:[],tasksByArea:{}});save();$('name').value='';$('role').value='';render();$('employee-dialog').close();toast('Membro da equipe cadastrado.')});
function unassign(id){if(!id||!state.employees.some(e=>e.id===id)){toast('Selecione uma pessoa primeiro.');return}state.assignments[id]=[];const employee=state.employees.find(item=>item.id===id);employee.tasksByArea={};employee.taskNumbers=[];save();render();toast('Alocações e tarefas removidas.')}dropTarget($('unassign'),unassign);$('unassign').onclick=()=>unassign(selected);$('unassign').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();unassign(selected)}};
function parseCSV(text){text=text.replace(/^\uFEFF/,'');const first=text.split(/\r?\n/)[0],delimiter=first.includes(';')?';':',';const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===delimiter&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell=''}else cell+=c}if(quoted)throw Error('O CSV contém aspas não fechadas.');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);const normalize=s=>s.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const head=(rows.shift()||[]).map(normalize),ai=head.indexOf('area'),ti=head.indexOf('assuntos');if(ai<0||ti<0)throw Error('O CSV precisa das colunas Área e Assuntos.');if(!rows.length||rows.length>500)throw Error('Importe entre 1 e 500 áreas.');return rows.map((r,i)=>{if(!r[ai]?.trim()||r[ti]===undefined)throw Error('Linha '+(i+2)+' inválida.');return {id:crypto.randomUUID(),name:r[ai].trim(),topics:r[ti].split(';').map(t=>t.trim()).filter(Boolean)}})}
$('csv').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2000000)throw Error('O CSV deve ter até 2 MB.');const areas=parseCSV(await file.text());if(!confirm('Substituir as áreas pelo novo CSV? As alocações atuais serão removidas. Os funcionários serão mantidos.'))return;state.areas=areas;state.assignments={};state.employees.forEach(employee=>{employee.tasksByArea={};employee.taskNumbers=[]});state.source=file.name;save();render();toast('CSV importado: '+areas.length+' áreas.')}catch(err){toast(err.message)}finally{e.target.value=''}};
function exportMap(){
 const grid=$('branches'),width=grid.clientWidth,height=grid.clientHeight;
 const layout=orbitLayout(width,height,state.areas.length,zoom);
 const layouts=Object.create(null);state.areas.forEach((area,index)=>{
  const box=layout.cards[index],saved=cardLayouts[area.id];
  layouts[area.id]=saved?{...saved}:{x:box.x/width,y:box.y/height,w:box.w/width,h:box.h/height,scale:zoom,font:Math.min(13*zoom,box.w/8,box.h/3.8)};
 });
 const {assignments,...mapState}=state;return{version:2,...mapState,backgroundColor:state.backgroundColor||DEFAULT_BACKGROUND,projectName:state.projectName||'Projeto',employees:state.employees.map(({role,tasksByArea,...employee})=>({...employee,department:role})),layouts};
}
function decodeMap(data){
 if(!data||typeof data!=='object'||(data.version!==undefined&&data.version!==2))throw Error('Formato de mapa inválido.');
 const restored={...data,backgroundColor:data.backgroundColor===undefined?DEFAULT_BACKGROUND:data.backgroundColor,projectName:data.projectName??'Projeto',assignments:data.assignments??{},employees:Array.isArray(data.employees)?data.employees.map(employee=>({...employee,role:employee.department??employee.role})):data.employees};
 if(!validState(restored))throw Error('Este arquivo não é um mapa válido.');
 const layouts=Object.create(null);if(data.layouts!==undefined){
  if(!data.layouts||typeof data.layouts!=='object'||Array.isArray(data.layouts))throw Error('Posições dos cards inválidas.');
  for(const [id,box] of Object.entries(data.layouts)){
   if(!restored.areas.some(area=>area.id===id)||!box||!['x','y','w','h','scale'].every(key=>Number.isFinite(box[key]))||box.x<0||box.x>1||box.y<0||box.y>1||box.w<=0||box.w>1||box.h<=0||box.h>1||box.scale<=0||box.scale>3||(box.font!==undefined&&(!Number.isFinite(box.font)||box.font<=0||box.font>48)))throw Error('Tamanho ou posição de card inválido.');
   layouts[id]={x:box.x,y:box.y,w:box.w,h:box.h,scale:box.scale,...(box.font===undefined?{}:{font:box.font})};
  }
 }
 normalizeTasks(restored);delete restored.layouts;delete restored.version;return{state:restored,layouts};
}
function openSettingsDialog(id){fileMenu(false);$(id).showModal()}
$('rename-project').onclick=()=>{$('project-name').value=state.projectName||'Projeto';openSettingsDialog('project-dialog')};
$('project-form').addEventListener('submit',event=>{event.preventDefault();const name=$('project-name').value.trim();if(!name){$('project-name').focus();return}state.projectName=name;save();render();$('project-dialog').close();toast('Nome do projeto atualizado.');});
$('add-area').onclick=()=>openSettingsDialog('area-dialog');
$('add-member').onclick=()=>openSettingsDialog('employee-dialog');
document.querySelectorAll('[data-close-dialog]').forEach(button=>button.onclick=()=>button.closest('dialog').close());
$('area-form').addEventListener('submit',event=>{
 event.preventDefault();const name=$('area-name').value.trim();if(!name){$('area-name').focus();return}
 if(state.areas.length>=500){toast('Limite de 500 áreas atingido.');return}
 const topics=$('area-topics').value.split(/\r?\n/).map(topic=>topic.trim()).filter(Boolean);
 state.areas.push({id:crypto.randomUUID(),name,topics});state.source='Mapa personalizado';save();render();$('area-form').reset();$('area-dialog').close();toast('Área adicionada.');
});
function fileMenu(open){$('files-menu').hidden=!open;$('files-toggle').setAttribute('aria-expanded',String(open))}
$('clear-all').onclick=()=>openSettingsDialog('clear-dialog');$('cancel-clear').onclick=()=>$('clear-dialog').close();$('confirm-clear').onclick=()=>{state=emptyState();cardLayouts=Object.create(null);selected=null;pendingAssignment=null;setEditMode(false);save();saveLayout();render();$('clear-dialog').close();toast('Todos os dados foram excluídos.');};
$('files-toggle').onclick=()=>fileMenu($('files-menu').hidden);
$('import-json').onclick=()=>{fileMenu(false);$('restore').click()};
document.addEventListener('click',event=>{if(!event.target.closest('.file-actions'))fileMenu(false)});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('files-menu').hidden){fileMenu(false);$('files-toggle').focus()}});
$('export-results').onclick=async()=>{fileMenu(false);const button=$('export-results');button.disabled=true;button.textContent='Gerando PDF…';try{await window.DailyResults.download(state);toast('Resultados exportados em PDF.')}catch(error){console.error('Falha ao exportar resultados:',error);toast('Não foi possível gerar o PDF. Tente novamente.')}finally{button.disabled=false;button.textContent='Exportar Resultados'}};
$('backup').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(exportMap(),null,2)],{type:'application/json'}));a.download='mapa-daily.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);fileMenu(false)};
$('restore').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{
 if(file.size>5000000)throw Error('O JSON deve ter até 5 MB.');
 const restored=decodeMap(JSON.parse(await file.text()));restored.state.source=file.name;restored.state.catalogRevision=window.AREA_REVISION;
 state=restored.state;cardLayouts=restored.layouts;selected=null;save();saveLayout();render();toast('Mapa e funcionários importados.');
 }catch(error){toast(error instanceof SyntaxError?'Arquivo JSON inválido.':error.message)}finally{event.target.value=''}};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){selected=null;render()}});window.addEventListener('resize',()=>{hideTooltip();drawLines()});$('viewport').addEventListener('scroll',hideTooltip);document.addEventListener('keydown',event=>{if(event.key==='Escape')hideTooltip()});new ResizeObserver(drawLines).observe($('viewport'));
if(document.modelContext?.registerTool){try{document.modelContext.registerTool({name:'list_daily_map',description:'Lista áreas, funcionários e alocações desta daily neste navegador.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>JSON.parse(JSON.stringify(state))});document.modelContext.registerTool({name:'assign_employee_to_area',description:'Aloca um membro e registra o número da tarefa.',inputSchema:{type:'object',properties:{employeeId:{type:'string'},areaId:{type:'string'},taskNumber:{type:'string'}},required:['employeeId','areaId','taskNumber'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||typeof input.employeeId!=='string'||typeof input.areaId!=='string'||typeof input.taskNumber!=='string')throw Error('Informe employeeId, areaId e taskNumber.');assign(input.employeeId,input.areaId,input.taskNumber);return{employeeId:input.employeeId,areas:state.assignments[input.employeeId]}}})}catch{}}
render();setZoom(1);
