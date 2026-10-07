'use strict';
window.DailyVisitor=(()=>{
 let context=null,profiles={},draft={},areas=[],unsubscribe=null,version=0,signature='',busy=false,notice='';
 const form=document.getElementById('visitor-form'),rows=document.getElementById('visitor-areas'),message=document.getElementById('visitor-message');
 const own=()=>context?profiles[context.client.uid]:null;
 function parseTasksJSON(profile){try{const value=JSON.parse(profile?.tasksJson||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return{}}}
 function entries(profile){const tasks=parseTasksJSON(profile);return areas.filter(area=>Array.isArray(tasks[area.id])).map(area=>({area,tasks:tasks[area.id].filter(task=>typeof task==='string'&&/^\d{1,30}$/.test(task))}));}
 function color(uid){let hash=0;for(const char of uid)hash=(hash*31+char.charCodeAt(0))>>>0;return '#'+(hash%0xaaaaaa+0x333333).toString(16).padStart(6,'0')}
 function viewState(base){
  if(!context)return base;
  const visitors=context.session.owner?Object.entries(profiles):[[context.client.uid,{name:context.name,tasksJson:JSON.stringify(draft),finalized:own()?.finalized}]];
  const employees=[],assignments={};
  for(const [uid,profile]of visitors){if(!profile?.name)continue;const list=entries(profile),id='visitor-'+uid;if(base.employees.some(employee=>employee.id===id))continue;employees.push({id,name:profile.name,role:profile.finalized?'Finalizado':'Preenchendo',color:color(uid),onlineMember:true,tasksByArea:Object.fromEntries(list.map(row=>[row.area.id,row.tasks])),taskNumbers:[...new Set(list.flatMap(row=>row.tasks))]});assignments[id]=list.map(row=>row.area.id)}
  if(context.session.owner)return{...base,employees:[...base.employees,...employees],assignments:{...base.assignments,...assignments}};
  return{...base,employees:[...base.employees,...employees],assignments:{...base.assignments,...assignments}};
 }
 function refresh(base){
  areas=base.areas;
  const visitor=context&&!context.session.owner;
  document.getElementById('visitor-panel').hidden=!visitor;
  document.body.classList.toggle('visitor-reporting',!!visitor);
  document.body.classList.toggle('visitor-editable',!!visitor&&!own()?.finalized&&!context.session.closed&&!busy);
  const showMeet=visitor&&own()?.finalized&&!context.session.closed&&context.session.meetUrl;
  if(showMeet){meetDialog.querySelector('a').href=context.session.meetUrl;if(!meetDialog.open){hideTooltip();meetDialog.showModal()}}else if(meetDialog.open)meetDialog.close();
  if(!visitor)return;
  const finalized=!!own()?.finalized,locked=finalized||context.session.closed||busy;
  const next=JSON.stringify([areas.map(area=>[area.id,area.name]),draft,locked]);
  if(signature!==next){signature=next;rows.replaceChildren();areas.forEach((area,index)=>{
   if(!Object.hasOwn(draft,area.id))return;
   const row=document.createElement('div');row.className='visitor-area-row';
   const edit=document.createElement('button');edit.type='button';edit.textContent=String(index+1).padStart(2,'0')+' · '+area.name;edit.disabled=locked;edit.onclick=()=>openArea(area.id);
   const tasks=document.createElement('p');tasks.textContent='Tarefas: '+draft[area.id].join(', ');
   const remove=document.createElement('button');remove.type='button';remove.textContent='Remover';remove.disabled=locked;remove.onclick=()=>{delete draft[area.id];notice='';render()};
   row.append(edit,tasks,remove);rows.append(row);
  })}
  if(locked&&taskDialog.open)taskDialog.close();
  document.getElementById('visitor-title').textContent=context.name;
  document.getElementById('visitor-finish').disabled=locked;
  document.getElementById('visitor-finish').hidden=finalized||context.session.closed;
  document.getElementById('visitor-meet-retry').hidden=!finalized||!!context.session.meetUrl||!!context.session.closed;
  message.textContent=notice||(context.session.closed?'Sessão encerrada.':finalized?'Atuação finalizada. O link do Meet está disponível.':context.session.closed?'Sessão encerrada.':'Clique em uma área do mapa para informar os números das tarefas em que está atuando.');
 }
 const meetDialog=document.createElement('dialog');meetDialog.id='visitor-meet-dialog';meetDialog.setAttribute('aria-labelledby','visitor-meet-title');
 meetDialog.innerHTML='<h2 id="visitor-meet-title">Tudo pronto para a daily!</h2><p>Sua atuação foi enviada. Entre na reunião pelo link abaixo.</p><a id="visitor-meet-link" target="_blank" rel="noopener noreferrer">Entrar no Google Meet</a>';
 meetDialog.addEventListener('cancel',event=>event.preventDefault());document.body.append(meetDialog);
 const taskDialog=document.createElement('dialog');taskDialog.id='visitor-task-dialog';taskDialog.setAttribute('aria-labelledby','visitor-task-title');
 taskDialog.innerHTML='<button type="button" class="dialog-close" aria-label="Fechar">×</button><h2 id="visitor-task-title">Suas tarefas</h2><p id="visitor-task-context"></p><form id="visitor-task-form"><label for="visitor-task-number">Números dos cards / tarefas</label><input id="visitor-task-number" required maxlength="2000" placeholder="Ex.: 0001, 0002"><div class="form-bottom"><button type="button" id="visitor-task-cancel">Cancelar</button><button type="submit" class="primary">Salvar</button></div></form>';
 document.body.append(taskDialog);
 const taskInput=taskDialog.querySelector('input');let editingArea=null;
 function openArea(id){
  if(!context||context.session.owner)return false;
  if(context.session.closed||own()?.finalized||busy)return true;
  const area=areas.find(area=>area.id===id);if(!area)return true;
  editingArea=id;taskDialog.querySelector('p').textContent=context.name+' · '+area.name;
  taskInput.value=(draft[id]||[]).join(', ');taskInput.setCustomValidity('');hideTooltip();taskDialog.showModal();taskInput.focus();return true;
 }
 taskInput.oninput=()=>taskInput.setCustomValidity('');
 taskDialog.querySelector('.dialog-close').onclick=taskDialog.querySelector('#visitor-task-cancel').onclick=()=>taskDialog.close();
 taskDialog.onclose=()=>editingArea=null;
 taskDialog.querySelector('form').onsubmit=event=>{
  event.preventDefault();if(!context||context.session.owner||context.session.closed||own()?.finalized||busy||!areas.some(area=>area.id===editingArea))return;
  const tasks=taskInput.value.split(',').map(value=>value.trim()).filter(Boolean);
  if(!tasks.length||tasks.some(task=>!/^\d{1,30}$/.test(task))){taskInput.setCustomValidity('Informe números separados por vírgula. Ex.: 0001, 0002');taskInput.reportValidity();return}
  draft[editingArea]=[...new Set(tasks)];notice='';taskDialog.close();render();
 };
 document.getElementById('branches').addEventListener('click',event=>{const card=event.target.closest('.area');if(card&&openArea(card.dataset.id)){event.preventDefault();event.stopImmediatePropagation()}},true);
 document.getElementById('branches').addEventListener('keydown',event=>{const card=event.target.closest('.area');if(card&&['Enter',' '].includes(event.key)&&openArea(card.dataset.id)){event.preventDefault();event.stopImmediatePropagation()}},true);
 async function connect(value){
  disconnect();context=value;areas=state.areas;render();const current=version;
  const profile=await value.client.getParticipant(value.session.code);
  if(current!==version)return;
  if(!value.session.owner){context.name=profile?.name||value.name;draft=parseTasksJSON(profile);if(profile)profiles[value.client.uid]=profile;else{const initial={name:value.name,tasksJson:'{}',finalized:false};await value.client.writeParticipant(value.session.code,initial);if(current!==version)return;profiles[value.client.uid]=initial}}
  if(!value.session.owner){try{localStorage.setItem('daily-visitor-name',context.name)}catch{}}
  unsubscribe=value.client.watchParticipants(value.session.code,value.session.owner,data=>{
   if(current!==version)return;profiles=value.session.owner?(data||{}):{[value.client.uid]:data};
   if(!value.session.owner&&data?.finalized){draft=parseTasksJSON(data);value.session.finalized=true;value.loadMeet().catch(()=>{notice='Não foi possível liberar o Meet. Tente novamente.';refresh(state)})}
   render();
  },()=>{if(current===version){message.textContent='Não foi possível carregar sua atuação. Verifique as regras do Firebase.'}});
  if(own()?.finalized){value.session.finalized=true;await value.loadMeet().catch(()=>{notice='Não foi possível liberar o Meet. Tente novamente.';refresh(state)})}
  render();
 }
 function disconnect(){if(meetDialog.open)meetDialog.close();if(taskDialog.open)taskDialog.close();unsubscribe?.();unsubscribe=null;version++;context=null;profiles={};draft={};areas=[];signature='';busy=false;notice=''}
 form.onsubmit=async event=>{
  event.preventDefault();if(!context||context.session.owner||context.session.closed||own()?.finalized||busy)return;
  const allowed=new Set(areas.map(area=>area.id)),tasks={};
  for(const [id,list]of Object.entries(draft)){if(!allowed.has(id))continue;if(!list.length||list.some(task=>!/^\d{1,30}$/.test(task))){notice='Informe números de tarefas separados por vírgula para cada área selecionada.';refresh(state);return}tasks[id]=[...new Set(list)]}
  const current=version;notice='';busy=true;refresh(state);
  try{const profile={name:context.name,tasksJson:JSON.stringify(tasks),finalized:true};await context.client.writeParticipant(context.session.code,profile);if(current!==version)return;profiles[context.client.uid]=profile;draft=tasks;context.session.finalized=true;await context.loadMeet();render()}
  catch{if(current===version)notice='Não foi possível finalizar ou liberar o Meet. Confira a conexão e as regras do Firebase.'}
  finally{if(current===version){busy=false;signature='';refresh(state)}}
 };
 document.getElementById('visitor-meet-retry').onclick=async()=>{if(!context||!own()?.finalized||context.session.closed)return;try{await context.loadMeet();notice=''}catch{notice='Não foi possível liberar o Meet. Confira as regras do Firebase.'}refresh(state)};
 return{connect,disconnect,viewState,refresh};
})();
