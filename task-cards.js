window.DailyCards=(()=>{
 const percent=card=>card.progressPercent??card.progress*50;
 const number=card=>typeof card==='string'?card:card.number;
 const valid=card=>typeof card==='string'?/^\d{1,30}$/.test(card):!!card&&typeof card.number==='string'&&/^\d{1,5}$/.test(card.number)&&(card.progressPercent===undefined?Number.isInteger(card.progress)&&card.progress>=0&&card.progress<=2:Number.isInteger(card.progressPercent)&&card.progressPercent>=0&&card.progressPercent<=100)&&typeof card.needsHelp==='boolean';
 const label=(card,showProgress=true)=>typeof card==='string'?card:`${card.number}${showProgress?' · '+percent(card)+'%':''}${card.needsHelp?' · Preciso de ajuda':''}`;
 const merge=cards=>[...new Map(cards.map(card=>[number(card),card])).values()];
 function editor(container,cards=[]){
  container.innerHTML='<div class="task-card-rows"></div><button class="task-card-add" type="button">+ Adicionar card</button>';
  const rows=container.firstElementChild;
  function add(card){
   const row=document.createElement('fieldset');row.className='task-card-row';row.setAttribute('aria-label','Card');
   row.innerHTML='<input aria-label="Número do card" class="task-card-number" type="text" inputmode="numeric" pattern="[0-9]{1,5}" maxlength="5" required placeholder="Ex.: 00001"><label>Andamento <input class="task-card-progress" type="range" min="0" max="100" step="1" value="0"></label><div class="task-card-stages" aria-hidden="true"><span>Iniciando</span><span>Finalizando</span></div><label class="task-card-help-label"><input class="task-card-help" type="checkbox" role="switch"> Preciso de ajuda</label><button type="button" class="task-card-remove" aria-label="Remover card" title="Remover card">×</button>';
   const input=row.querySelector('.task-card-number'),progress=row.querySelector('.task-card-progress');
   input.value=card?number(card):'';progress.value=card&&typeof card!=='string'?percent(card):0;row.querySelector('.task-card-help').checked=card?.needsHelp??false;
   const paint=()=>progress.style.setProperty('--progress-fill',progress.value+'%');progress.addEventListener('input',paint);paint();
   row.querySelector('.task-card-remove').onclick=()=>{const next=row.nextElementSibling||row.previousElementSibling;row.remove();(next?.querySelector('input')||container.lastElementChild).focus()};
   rows.append(row);return input;
  }
  (cards.length?cards:[null]).forEach(add);container.lastElementChild.onclick=()=>add(null).focus();
 }
 function read(container){return merge([...container.querySelectorAll('.task-card-row')].map(row=>({number:row.querySelector('.task-card-number').value,progressPercent:Number(row.querySelector('.task-card-progress').value),needsHelp:row.querySelector('.task-card-help').checked})))}
 return{number,valid,label,merge,editor,read};
})();
