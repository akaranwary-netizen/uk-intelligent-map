(()=>{
const menu=document.querySelector('.layers');
if(!menu)return;
menu.setAttribute('aria-label','Map layers');
menu.addEventListener('click',e=>{
  const b=e.target.closest('button');
  if(b){setTimeout(()=>menu.classList.remove('open'),140);return;}
  menu.classList.toggle('open');
});
document.addEventListener('click',e=>{
  if(!menu.contains(e.target))menu.classList.remove('open');
});
})();