/* 台灣麻將牌局引擎（伺服器與瀏覽器單機試玩共用） */
(function(root){
const NM='東南西北', ZN='中發白';
const cnt=a=>{const c=Array(34).fill(0);a.forEach(t=>c[t]++);return c};
function sets(c,pg,cg){
  let i=0;while(i<34&&!c[i])i++;if(i>=34)return true;
  if(pg&&c[i]>=3){c[i]-=3;const r=sets(c,pg,cg);c[i]+=3;if(r)return true}
  if(cg&&i<27&&i%9<7&&c[i+1]&&c[i+2]){c[i]--;c[i+1]--;c[i+2]--;const r=sets(c,pg,cg);c[i]++;c[i+1]++;c[i+2]++;if(r)return true}
  return false;
}
function win(a,pg=1,cg=1,pf=()=>1){
  if(a.length%3!==2)return false;
  const c=cnt(a);
  for(let i=0;i<34;i++)if(c[i]>=2&&pf(i)){c[i]-=2;const r=sets(c,pg,cg);c[i]+=2;if(r)return true}
  return false;
}

function createRoom(code){
  let G={ph:'lobby',seats:[null,null,null,null],sc:[0,0,0,0],dealer:0,streak:0,tk:0,
    hands:[],wall:[],disc:[],mel:[],fl:[],wait:[],opts:{},claims:{}};
  let timer=null,destroyed=false;
  const room={code,onChange:null,lastActive:Date.now()};
  const isAuto=s=>{const x=G.seats[s];return !!(x&&(x.b||x.off))};
  const seatOf=p=>G.seats.findIndex(x=>x&&x.p===p);

function tally(s,zm,extra){
  const hd=G.hands[s],ms=G.mel[s],w=(s-G.dealer+4)%4;let tai=0;const L=[],A=(n,x)=>{tai+=x;L.push(n+x+'台')};
  const all=[...hd,...ms.flatMap(m=>m.ts)],c=cnt(all);
  if(s===G.dealer){A('莊家',1);if(G.streak)A('連'+G.streak+'拉'+G.streak,2*G.streak)}
  if(ms.every(m=>m.k==='ag'))A('門清',1);
  if(zm)A('自摸',1);
  if(extra==='gang')A('槓上開花',1);
  if(extra==='rob')A('搶槓胡',1);
  G.fl[s].forEach(f=>{if(f%4===w)A('花牌',1)});
  [31,32,33].forEach(t=>{if(c[t]>=3)A(ZN[t-31],1)});
  if(c[27+w]>=3)A('門風',1);if(c[27]>=3)A('圈風',1);
  const su=new Set(all.filter(t=>t<27).map(t=>t/9|0)),ho=all.some(t=>t>=27);
  if(!su.size)A('字一色',16);else if(su.size===1)ho?A('混一色',4):A('清一色',8);
  if(!ms.some(m=>m.k==='chi')&&win(hd,1,0))A('碰碰胡',4);
  if(ms.every(m=>m.k==='chi')&&!G.fl[s].length&&win(hd,0,1,i=>i<27))A('平胡',2);
  return{tai,L};
}

/* ---------- 人機智慧評估工具 ---------- */
// 計算手牌的「進張潛力分數」（越多順子搭子、刻子、對子分數越高）
function evalHandScore(hd, seat){
  const c = cnt(hd);
  let score = 0;
  const windTile = 27 + (seat - G.dealer + 4) % 4;
  for(let i = 0; i < 34; i++){
    if(!c[i]) continue;
    const isHonor = i >= 27;
    const isValueHonor = i >= 31 || i === 27 || i === windTile;
    if(c[i] >= 3) score += isValueHonor ? 14 : 11;
    else if(c[i] === 2) score += isValueHonor ? 6 : 4.5;
    else if(isHonor) score -= 2.5; // 孤張字牌扣分
  }
  // 評估順子與兩面/嵌張搭子
  for(let suit = 0; suit < 3; suit++){
    const base = suit * 9;
    for(let n = 0; n < 9; n++){
      const t = base + n;
      if(!c[t]) continue;
      if(n <= 6 && c[t+1] && c[t+2]) score += 9; // 完整順子
      if(n <= 7 && c[t+1]) score += (n > 0 && n < 7) ? 3.5 : 2.2; // 兩面搭子優於邊張
      if(n <= 6 && c[t+2]) score += 2.0; // 嵌張搭子
    }
  }
  return score;
}

// 決定人機面對別家打牌時的吃、碰、槓、胡決策
function botDecideClaim(s, t, o){
  if(o.hu) return 'hu';
  const hd = G.hands[s];
  const windTile = 27 + (s - G.dealer + 4) % 4;
  const isValueHonor = t >= 31 || t === 27 || t === windTile;
  const baseScore = evalHandScore(hd, s);

  // 1. 評估明槓：手牌有3張相同，通常直接槓（除非會拆掉關鍵順子且手牌極好）
  if(o.gang){
    const afterGang = hd.filter(x => x !== t);
    if(evalHandScore(afterGang, s) >= baseScore - 14) return 'gang';
  }

  // 2. 評估碰牌：
  if(o.pon){
    // 中發白、圈風、門風，幾乎必碰（95% 機率）
    if(isValueHonor && Math.random() < 0.95) return 'pon';
    // 其他牌：比較碰牌後剩餘手牌的進張分數，若有提升或保持面子結構（且沒有拆掉完整順子）就碰
    const afterPon = hd.slice();
    for(let k = 0; k < 2; k++) afterPon.splice(afterPon.indexOf(t), 1);
    const newScore = evalHandScore(afterPon, s) + 11; // 加上桌面上已完成1組刻子的價值
    if(newScore >= baseScore - 1.0 && Math.random() < 0.85) return 'pon';
  }

  // 3. 評估吃牌（僅下家有 o.chi）：
  if(o.chi && o.chi.length){
    let bestChi = null;
    let bestScore = baseScore;
    for(const pair of o.chi){
      const afterChi = hd.slice();
      pair.forEach(v => afterChi.splice(afterChi.indexOf(v), 1));
      const newScore = evalHandScore(afterChi, s) + 9.5; // 加上桌面上已完成1組順子的價值
      // 只有吃牌能讓手牌整體結構變好（例如把孤張/嵌張變成完整面子），才執行吃牌
      if(newScore > bestScore + 0.5){
        bestScore = newScore;
        bestChi = pair;
      }
    }
    if(bestChi && Math.random() < 0.8) return bestChi;
  }

  return 'pass';
}


/* ---------- 狀態輸出（每位玩家只看得到自己的牌） ---------- */
function stateFor(pid){
  const me=seatOf(pid),H={},O={};
  const b=G.ph==='lobby';
  if(!b&&me>=0)H[me]=G.hands[me];
  if(G.ph==='end'&&G.res&&G.res.w!=null)H[G.res.w]=G.hands[G.res.w];
  if(G.ph==='play'&&me>=0){
    if(G.mode==='c'||G.mode==='bg_c'){ if(G.wait.includes(me))O[me]=G.opts[me]; }
    else if(G.turn===me&&!isAuto(me)){
      const hd=G.hands[me],c=cnt(hd),ms=G.mel[me];
      const bgList=G.drew&&G.wall.length>16
        ?[...new Set(ms.filter(m=>m.k==='pon'&&hd.includes(m.ts[0])).map(m=>m.ts[0]))]:[];
      O[me]={hu:G.drew&&win(hd)?1:0,
        ag:G.drew&&G.wall.length>16?[...new Set(hd.filter(t=>c[t]===4))]:[],bg:bgList};
    }
  }
  const mel=G.mel.map((ms,idx)=>ms.map(m=>{
    if(m.k==='ag'&&G.ph!=='end'&&idx!==me)return{k:'ag',ts:[-1,-1,-1,-1]};
    return m;
  }));
  return{ph:G.ph,code,me,seats:G.seats.map(x=>x&&{n:x.n,b:x.b?1:0,off:x.off?1:0}),sc:G.sc,dealer:G.dealer,
    streak:G.streak,turn:G.turn,mode:G.mode,drew:G.drew,wl:b?0:G.wall.length,disc:G.disc,mel,fl:G.fl,
    cnt:b?[]:G.hands.map(x=>x.length),last:G.last,wait:G.wait,res:G.res,shout:G.shout,H,O};
}

function bc(){ room.lastActive=Date.now(); if(!destroyed&&room.onChange)room.onChange(); }

function triggerShout(s, text){
  G.shout = { s, text, id: Date.now() + Math.random() };
  const sid = G.shout.id;
  setTimeout(()=>{
    if(G && G.shout && G.shout.id === sid){
      G.shout = null;
      bc();
    }
  }, 1800);
}

function start(){
  G.seats.forEach((x,i)=>{if(!x)G.seats[i]={n:'人機'+(i+1),p:'bot'+i,b:1}});
  newRound();
}

function newRound(){
  const w=[];
  for(let t=0;t<34;t++)for(let k=0;k<4;k++)w.push(t);
  for(let t=34;t<42;t++)w.push(t);
  for(let i=w.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[w[i],w[j]]=[w[j],w[i]]}
  Object.assign(G,{
    wall:w,hands:[[],[],[],[]],mel:[[],[],[],[]],fl:[[],[],[],[]],disc:[[],[],[],[]],
    last:null,res:null,wait:[],opts:{},claims:{},drew:false,fromGang:false,pendingBg:null,shout:null,
    passedHu:[false,false,false,false]
  });
  for(let r=0;r<16;r++)for(let s=0;s<4;s++)G.hands[s].push(G.wall.pop());
  for(let k=0;k<4;k++){
    const s=(G.dealer+k)%4;let hd=G.hands[s];
    while(hd.some(t=>t>=34)){
      const f=hd.filter(t=>t>=34);G.fl[s].push(...f);hd=hd.filter(t=>t<34);
      f.forEach(()=>hd.push(G.wall.shift()));G.hands[s]=hd;
    }
  }
  G.hands.forEach(a=>a.sort((x,y)=>x-y));
  G.ph='play';
  draw(G.dealer, false);
}

function pull(s){
  let t=G.wall.shift();
  while(t>=34){G.fl[s].push(t);t=G.wall.shift()}
  return t;
}

function draw(s, isFromGang=false){
  if(G.wall.length<=16)return fin(null);
  let t=G.wall.pop();
  while(t>=34){G.fl[s].push(t);t=G.wall.shift()}
  G.hands[s].push(t);
  G.turn=s;G.mode='d';G.drew=true;G.fromGang=isFromGang;
  G.passedHu[s]=false;
  sync();
}

function sync(){
  bc();
  if(G.ph!=='play'||G.mode!=='d')return;
  const s=G.turn,k=++G.tk;
  // 模擬真人思考時間（650ms ~ 1150ms）
  const delay = 650 + Math.floor(Math.random() * 500);
  if(isAuto(s))setTimeout(()=>{if(k===G.tk&&!destroyed)bot(s)}, delay);
  else setTimeout(()=>{if(k===G.tk&&!destroyed&&G.ph==='play'&&G.mode==='d'&&G.turn===s)bot(s)}, 60000); // 真人閒置 60 秒自動代打
}

function bot(s){
  const hd=G.hands[s];
  // 1. 自摸胡牌
  if(G.drew&&win(hd)){
    triggerShout(s, '自摸！');
    return fin(s,1,G.fromGang?'gang':null);
  }
  // 2. 暗槓判斷（手牌有4張相同）
  if(G.drew && G.wall.length > 16){
    const c = cnt(hd);
    const agTile = hd.find(t => c[t] === 4);
    if(agTile != null){
      // 確認暗槓不會嚴重破壞順子結構才槓
      const withoutAg = hd.filter(t => t !== agTile);
      if(evalHandScore(withoutAg, s) >= evalHandScore(hd, s) - 15){
        return ag(s, agTile);
      }
    }
    // 3. 加槓判斷（已碰且摸到第4張）
    const ponMeld = G.mel[s].find(m => m.k === 'pon' && hd.includes(m.ts[0]));
    if(ponMeld) return initiateBg(s, ponMeld.ts[0]);
  }
  // 4. 捨牌判斷：評估打出每張牌後剩餘手牌的進張價值，保留最高分的手牌組合
  let bestTile = hd[0];
  let bestRemainScore = -1e9;
  const seen = new Set();
  for(let i = 0; i < hd.length; i++){
    const t = hd[i];
    if(seen.has(t)) continue;
    seen.add(t);
    const remain = hd.slice();
    remain.splice(i, 1);
    // 加上微量隨機擾動避免死板
    const sc = evalHandScore(remain, s) + (Math.random() * 0.6);
    if(sc > bestRemainScore){
      bestRemainScore = sc;
      bestTile = t;
    }
  }
  disc(s, bestTile);
}

function disc(s,t){
  const hd=G.hands[s],i=hd.indexOf(t);if(i<0)return;
  hd.splice(i,1);hd.sort((a,b)=>a-b);
  G.passedHu[s]=false;
  G.disc[s].push(t);G.last={t,f:s};G.mode='c';G.tk++;G.drew=false;G.fromGang=false;G.opts={};G.claims={};G.wait=[];
  let botHasClaim = false;
  for(let k=1;k<4;k++){
    const x=(s+k)%4,h2=G.hands[x],n=h2.filter(v=>v===t).length,o={};
    if(!G.passedHu[x] && win([...h2,t]))o.hu=1;
    if(n>=2)o.pon=1;
    if(k!==1 && n>=3 && G.wall.length>16)o.gang=1;
    if(k===1&&t<27){
      const q=t%9,has=v=>h2.includes(v),ch=[];
      if(q>=2&&has(t-2)&&has(t-1))ch.push([t-2,t-1]);
      if(q>=1&&q<=7&&has(t-1)&&has(t+1))ch.push([t-1,t+1]);
      if(q<=6&&has(t+1)&&has(t+2))ch.push([t+1,t+2]);
      if(ch.length)o.chi=ch;
    }
    if(Object.keys(o).length){
      G.opts[x]=o;
      if(isAuto(x)){
        const decision = botDecideClaim(x, t, o);
        G.claims[x] = decision;
        if(decision !== 'pass') botHasClaim = true;
      } else {
        G.wait.push(x);
      }
    }
  }
  bc();
  if(!G.wait.length){
    // 若人機要吃/碰/槓/胡，稍微停頓 700ms 模擬真人反應喊牌
    setTimeout(resolve, botHasClaim ? 700 : 450);
  } else {
    timer=setTimeout(()=>{
      G.wait.forEach(x=>{
        if(G.opts[x]&&G.opts[x].hu)G.passedHu[x]=true;
        G.claims[x]='pass';
      });
      G.wait=[];resolve();
    },12000);
  }
}

function resolve(){
  clearTimeout(timer);
  if(G.mode!=='c'||G.ph!=='play')return;
  const d=G.last.f,t=G.last.t,ord=[1,2,3].map(k=>(d+k)%4),cl=G.claims;
  ord.forEach(s=>{if(G.opts[s]&&G.opts[s].hu&&cl[s]!=='hu')G.passedHu[s]=true});
  const hu=ord.find(s=>cl[s]==='hu');
  if(hu!=null){
    triggerShout(hu, '胡！');
    return fin(hu,0);
  }
  const pg=ord.find(s=>cl[s]==='pon'||cl[s]==='gang'),ch=ord.find(s=>Array.isArray(cl[s])),s=pg!=null?pg:ch;
  if(s==null)return draw((d+1)%4, false);
  const c=cl[s],hd=G.hands[s];G.disc[d].pop();let ts,k;
  if(Array.isArray(c)){
    k='chi';
    ts=[c[0], t, c[1]];
    triggerShout(s, '吃！');
  } else {
    k=c;
    ts=Array(c==='gang'?4:3).fill(t);
    triggerShout(s, c==='gang' ? '槓！' : '碰！');
  }
  const rm=ts.slice();rm.splice(rm.indexOf(t),1);rm.forEach(v=>hd.splice(hd.indexOf(v),1));
  G.mel[s].push({k,ts});G.turn=s;G.mode='d';G.last=null;
  G.passedHu[s]=false;
  if(k==='gang'){hd.push(pull(s));G.drew=true;G.fromGang=true}else{G.drew=false;G.fromGang=false}
  hd.sort((a,b)=>a-b);if(k==='gang')hd.push(hd.splice(hd.length-1,1)[0]);
  sync();
}

function ag(s,t){
  const hd=G.hands[s];
  G.hands[s]=hd.filter(x=>x!==t);
  G.mel[s].push({k:'ag',ts:[t,t,t,t]});
  G.hands[s].push(pull(s));
  G.fromGang=true;
  triggerShout(s, '暗槓！');
  sync();
}

/* ---------- 加槓與搶槓胡流程 ---------- */
function initiateBg(s, t){
  const hd=G.hands[s], idx=hd.indexOf(t);
  const m=G.mel[s].find(x=>x.k==='pon' && x.ts[0]===t);
  if(idx<0 || !m) return;

  G.mode='bg_c'; G.tk++; G.opts={}; G.claims={}; G.wait=[];
  G.pendingBg={s, t};
  G.last={t, f:s};
  triggerShout(s, '加槓！');

  for(let k=1;k<4;k++){
    const x=(s+k)%4, h2=G.hands[x];
    if(!G.passedHu[x] && win([...h2, t])){
      G.opts[x]={hu:1};
      if(isAuto(x)) G.claims[x]='hu';
      else G.wait.push(x);
    }
  }
  bc();
  if(!G.wait.length) setTimeout(resolveBg, 450);
  else timer=setTimeout(()=>{
    G.wait.forEach(x=>{G.passedHu[x]=true; G.claims[x]='pass';});
    G.wait=[]; resolveBg();
  }, 10000);
}

function resolveBg(){
  clearTimeout(timer);
  if(G.mode!=='bg_c'||G.ph!=='play'||!G.pendingBg) return;
  const {s, t} = G.pendingBg;
  const ord=[1,2,3].map(k=>(s+k)%4), cl=G.claims;
  ord.forEach(x=>{if(G.opts[x]&&G.opts[x].hu&&cl[x]!=='hu')G.passedHu[x]=true});

  const hu=ord.find(x=>cl[x]==='hu');
  if(hu!=null){
    const hd=G.hands[s], idx=hd.indexOf(t);
    if(idx>=0) hd.splice(idx,1);
    G.pendingBg=null;
    triggerShout(hu, '搶槓胡！');
    return fin(hu, 0, 'rob');
  }

  const hd=G.hands[s], idx=hd.indexOf(t);
  const m=G.mel[s].find(x=>x.k==='pon' && x.ts[0]===t);
  if(idx>=0 && m){
    hd.splice(idx,1);
    m.k='bg';
    m.ts=[t,t,t,t];
    hd.push(pull(s));
  }
  G.pendingBg=null;
  G.last=null;
  G.mode='d';
  G.drew=true;
  G.fromGang=true;
  sync();
}

function fin(w,zm,extra){
  G.ph='end';G.tk++;clearTimeout(timer);G.wait=[];
  if(w==null)G.res={draw:1};
  else{
    let f=-1,wt;
    if(!zm){
      f=G.last.f;wt=G.last.t;
      G.hands[w].push(G.last.t);
      if(extra!=='rob') G.disc[f].pop();
    }else wt=G.hands[w][G.hands[w].length-1];
    const r=tally(w,zm,extra),a=3+r.tai;
    if(zm){for(let i=0;i<4;i++)if(i!==w){G.sc[i]-=a;G.sc[w]+=a}}
    else{G.sc[f]-=a;G.sc[w]+=a}
    G.res={w,zm,f,tai:r.tai,L:r.L,a,extra,wt};
  }
  bc();
}

function act(s,d){
  const a=d.a;
  if(G.ph==='lobby'&&s===0){
    if(a==='bot'){const i=G.seats.findIndex(x=>!x);if(i>=0)G.seats[i]={n:'人機'+(i+1),p:'bot'+i,b:1};bc()}
    else if(a==='start')start();
    return;
  }
  if(G.ph==='end'&&a==='next'){
    if(G.res.draw);
    else if(G.res.w===G.dealer)G.streak++;
    else{G.dealer=(G.dealer+1)%4;G.streak=0}
    newRound();
    return;
  }
  if(G.ph!=='play')return;
  if(G.mode==='d'&&G.turn===s){
    const hd=G.hands[s];
    if(a==='disc'&&hd.includes(d.t))disc(s,d.t);
    else if(a==='hu'&&G.drew&&win(hd))fin(s,1,G.fromGang?'gang':null);
    else if(a==='ag'&&G.drew&&G.wall.length>16&&hd.filter(x=>x===d.t).length===4)ag(s,d.t);
    else if(a==='bg'&&G.drew&&G.wall.length>16&&hd.includes(d.t)&&G.mel[s].some(m=>m.k==='pon'&&m.ts[0]===d.t))initiateBg(s,d.t);
  }else if(G.mode==='c'&&G.wait.includes(s)){
    const o=G.opts[s];let c=null;
    if(a==='pass')c='pass';
    else if((a==='hu'||a==='pon'||a==='gang')&&o[a])c=a;
    else if(a==='chi'&&o.chi&&o.chi[d.i])c=o.chi[d.i];
    if(c){G.claims[s]=c;G.wait=G.wait.filter(x=>x!==s);G.wait.length?bc():resolve()}
  }else if(G.mode==='bg_c'&&G.wait.includes(s)){
    const o=G.opts[s];let c=null;
    if(a==='pass')c='pass';
    else if(a==='hu'&&o.hu)c='hu';
    if(c){G.claims[s]=c;G.wait=G.wait.filter(x=>x!==s);G.wait.length?bc():resolveBg()}
  }
}

/* ---------- 對外介面 ---------- */
room.stateFor=stateFor;
room.seatOf=seatOf;
room.phase=()=>G.ph;
room.act=(pid,d)=>{ const s=seatOf(pid); if(s>=0&&d&&!destroyed){room.lastActive=Date.now();act(s,d)} };
room.join=(pid,n)=>{
  const s0=seatOf(pid);
  if(s0>=0){G.seats[s0].off=0;bc();return s0}
  if(G.ph!=='lobby')return -1;
  let j=G.seats.findIndex(x=>!x);
  if(j<0)j=G.seats.findIndex(x=>x&&x.b);
  if(j<0)return -1;
  G.seats[j]={n:String(n||'玩家').slice(0,8),p:pid,b:0,off:0};
  bc();return j;
};
room.setConnected=(pid,on)=>{
  const s=seatOf(pid); if(s<0||destroyed)return;
  const x=G.seats[s];
  if(on){x.off=0;bc();return}
  if(G.ph==='lobby'){ if(s>0){G.seats[s]=null;bc()} return; }
  x.off=1;
  if(G.ph!=='play'){bc();return}
  if(G.mode==='d'&&G.turn===s){sync();return}
  if((G.mode==='c'||G.mode==='bg_c')&&G.wait.includes(s)){
    const o=G.opts[s];
    if(G.mode==='c'){
      const dcs=botDecideClaim(s,G.last.t,o);G.claims[s]=dcs;
      if(dcs==='pass'&&o.hu)G.passedHu[s]=true;
    }else G.claims[s]=o&&o.hu?'hu':'pass';
    G.wait=G.wait.filter(v=>v!==s);
    if(G.wait.length)bc();else G.mode==='c'?resolve():resolveBg();
    return;
  }
  bc();
};
room.humans=()=>G.seats.filter(x=>x&&!x.b).length;
room.initDemo=(pid,n)=>{
  G.seats=[{n:String(n||'玩家').slice(0,8),p:pid,b:0,off:0},{n:'電腦東風',p:'bot1',b:1},{n:'電腦西風',p:'bot2',b:1},{n:'電腦北風',p:'bot3',b:1}];
  start();
};
room.destroy=()=>{destroyed=true;G.ph='dead';G.tk++;clearTimeout(timer)};
return room;
}

const api={createRoom,win,cnt};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.MJ=api;
})(typeof window!=='undefined'?window:globalThis);
