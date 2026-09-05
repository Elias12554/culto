const audio=document.getElementById('audio');
const player=document.getElementById('player');
const title=document.getElementById('playerTitle');
const toggle=document.getElementById('playerToggle');
const mute=document.getElementById('playerMute');
const time=document.getElementById('playerTime');
const bar=document.getElementById('progressBar');
const icon=document.getElementById('playerIcon');
const master=document.getElementById('soundMaster');
let activeBtn=null;
audio.volume=.35;

const fmt=s=>{if(!Number.isFinite(s))return'0:00';const m=Math.floor(s/60),ss=Math.floor(s%60);return `${m}:${String(ss).padStart(2,'0')}`};
function sync(){
  const playing=!audio.paused && !!audio.src;
  toggle.textContent=playing?'Ⅱ':'▶';icon.textContent=playing?'Ⅱ':'▶';
  if(activeBtn){activeBtn.classList.toggle('playing',playing);activeBtn.querySelector('span').textContent=playing?'Ⅱ':'▶'}
  const d=audio.duration||0,c=audio.currentTime||0;bar.style.width=d?`${c/d*100}%`:'0%';time.textContent=`${fmt(c)} / ${fmt(d)}`;
  mute.textContent=audio.muted?'MUDO':`VOL ${Math.round(audio.volume*100)}%`;
}
document.querySelectorAll('.track-btn[data-src]').forEach(btn=>btn.addEventListener('click',async()=>{
  const same=activeBtn===btn;
  if(same){audio.paused?audio.play().catch(()=>{}):audio.pause();return}
  if(activeBtn){activeBtn.classList.remove('playing');activeBtn.querySelector('span').textContent='▶'}
  activeBtn=btn;audio.src=btn.dataset.src;title.textContent=btn.dataset.title;player.classList.add('open');
  try{await audio.play()}catch(e){}sync();
}));
toggle.addEventListener('click',()=>{if(!audio.src)return;audio.paused?audio.play().catch(()=>{}):audio.pause()});
mute.addEventListener('click',()=>{audio.muted=!audio.muted;sync()});
master.addEventListener('click',()=>{audio.muted=!audio.muted;master.textContent=audio.muted?'SOM · OFF':'SOM · ON';sync()});
audio.addEventListener('play',sync);audio.addEventListener('pause',sync);audio.addEventListener('timeupdate',sync);audio.addEventListener('loadedmetadata',sync);audio.addEventListener('ended',sync);

const obs=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('show')}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>obs.observe(el));

const glow=document.querySelector('.cursor-glow');
window.addEventListener('pointermove',e=>{glow.style.left=e.clientX+'px';glow.style.top=e.clientY+'px'});
const accentObs=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){const c=e.target.dataset.accent;if(c){glow.style.background=`radial-gradient(circle,${c}18,transparent 68%)`;bar.style.background=c;document.querySelector('.player-orb').style.borderColor=c;document.querySelector('.player-orb').style.color=c}}}),{threshold:.35});
document.querySelectorAll('.priest[data-accent]').forEach(s=>accentObs.observe(s));
