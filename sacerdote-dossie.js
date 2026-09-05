const audio=document.getElementById('pageAudio');const btn=document.getElementById('musicBtn');const player=document.getElementById('miniPlayer');const toggle=document.getElementById('miniToggle');const title=document.getElementById('miniTitle');if(audio){audio.volume=.35;const sync=()=>{const p=!audio.paused&&!!audio.src;if(btn)btn.classList.toggle('playing',p);if(btn)btn.querySelector('span').textContent=p?'Ⅱ':'▶';if(toggle)toggle.textContent=p?'Ⅱ':'▶'};if(btn&&!btn.disabled){btn.addEventListener('click',async()=>{if(!audio.src){audio.src=btn.dataset.src;title.textContent=btn.dataset.title;player.classList.add('open')}audio.paused?audio.play().catch(()=>{}):audio.pause();sync()})}if(toggle)toggle.addEventListener('click',()=>{audio.paused?audio.play().catch(()=>{}):audio.pause()});audio.addEventListener('play',sync);audio.addEventListener('pause',sync)}

// Galeria de anexos visuais
const visualLightbox=document.getElementById('visualLightbox');
const lightboxImage=document.getElementById('lightboxImage');
const lightboxCaption=document.getElementById('lightboxCaption');
const lightboxClose=document.getElementById('lightboxClose');
if(visualLightbox&&lightboxImage){
  const closeVisual=()=>{visualLightbox.classList.remove('open');visualLightbox.setAttribute('aria-hidden','true');document.body.style.overflow=''};
  document.querySelectorAll('.visual-thumb[data-full]').forEach(item=>item.addEventListener('click',()=>{
    lightboxImage.src=item.dataset.full;
    const label=item.querySelector('span');
    if(lightboxCaption) lightboxCaption.textContent=label?label.textContent.trim():'anexo visual';
    visualLightbox.classList.add('open');
    visualLightbox.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
  }));
  if(lightboxClose) lightboxClose.addEventListener('click',closeVisual);
  visualLightbox.addEventListener('click',e=>{if(e.target===visualLightbox)closeVisual()});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&visualLightbox.classList.contains('open'))closeVisual()});
}
