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

/* ---------- 計分設定：底 100、台 20（得分 = 底 + 台 x 台數） ---------- */
const BASE=100, PER=20;
const TURN_MS=30000, CLAIM_MS=20000, BG_MS=10000;   // 出牌、吃碰胡宣告、搶槓宣告的思考時間（超時自動處理）
// 各項台數（想調整某一項，改這裡的數字即可，網頁上的台數表會自動跟著變）
const T={zimo:1,menqing:1,buqiu:1,banqiu:1,quanqiu:2,dudiao:1,
  qianggang:1,gangkai:1,haidi:1,hedi:1,
  flower:1,flowerGang:2,
  yuan:1,small3:4,big3:8,
  menfeng:1,quanfeng:1,small4:8,big4:16,
  hun:4,qing:8,zi:16,
  an3:2,an4:5,an5:8,pengpeng:4,pinghu:2,
  tian:24,di:16,ren:16};
const RULES=[
  {g:'莊家台',rows:[['莊家',1,'當莊就有，無論胡牌或放槍都要算'],['連莊拉莊','2n','莊家每連莊（胡牌或流局）一次多 2 台，連 n 拉 n，合計莊家台 = 2n + 1']]},
  {g:'自摸與門前',rows:[['自摸',T.zimo,'自己摸到胡牌，向三家收'],['門清',T.menqing,'完全不吃、不碰、不明槓下胡牌（暗槓可）'],['不求人',T.buqiu,'門清且自摸（門清一摸三 = 門清 + 自摸 + 不求人）'],
    ['半求人',T.banqiu,'全吃碰（無暗槓）只剩 1 張手牌，自摸'],['全求人',T.quanqiu,'全吃碰（無暗槓）只剩 1 張手牌，放槍胡（再加獨聽共 3 台）']]},
  {g:'獨聽',rows:[['獨聽',T.dudiao,'只聽 1 種牌：邊張、嵌張（中洞）、單吊。聽 2 種以上（如小螺絲）不算']]},
  {g:'槓與海底',rows:[['搶槓',T.qianggang,'胡別人加槓的那張牌'],['槓上開花',T.gangkai,'槓牌補牌後自摸（另加自摸 1 台）'],['海底撈月',T.haidi,'自摸最後一張牌'],['河底撈魚',T.hedi,'胡最後一張牌打出來的牌']]},
  {g:'花牌',rows:[['正花',T.flower,'拿到自己座位的花，每張 1 台（東家 1 梅春、南家 2 蘭夏、西家 3 竹秋、北家 4 菊冬）'],['花槓',T.flowerGang,'湊齊梅蘭竹菊或春夏秋冬任一組']]},
  {g:'三元與四喜',rows:[['三元刻',T.yuan,'中、發、白每組刻子 1 台'],['小三元',T.small3,'兩組三元刻 + 第三種三元當眼睛（不再加三元刻）'],['大三元',T.big3,'三組三元刻（不再加三元刻）'],
    ['門風',T.menfeng,'自己座位風的刻子'],['圈風',T.quanfeng,'目前風圈（東風圈）的刻子'],['小四喜',T.small4,'三組風刻 + 第四種風當眼睛（門風、圈風仍可加）'],['大四喜',T.big4,'四組風刻（不再加門風、圈風）']]},
  {g:'一色與刻子',rows:[['混一色',T.hun,'一種花色加字牌'],['清一色',T.qing,'只有一種花色的數牌'],['字一色',T.zi,'全部是字牌'],
    ['碰碰胡',T.pengpeng,'全是刻子加一對眼睛，沒有順子'],['三暗刻',T.an3,'3 組暗刻（暗槓也算；放槍胡的那組不算暗刻）'],['四暗刻',T.an4,'4 組暗刻'],['五暗刻',T.an5,'5 組暗刻']]},
  {g:'胡牌類',rows:[['平胡',T.pinghu,'無字、無花、無刻、非獨聽、非自摸'],['天胡',T.tian,'莊家起手第一張牌就自摸'],['地胡',T.di,'閒家第一巡自摸（無人吃碰）'],['人胡',T.ren,'閒家第一巡、摸牌前就胡別人打的牌（無人吃碰）']]}
];

// 把 closed 手牌拆成「順子/刻子 + 眼睛」的所有拆法
function decomps(c){
  const out=[];
  const rec=(acc,p)=>{
    let i=0;while(i<34&&!c[i])i++;
    if(i>=34){out.push({pair:p,sets:acc.slice()});return}
    if(c[i]>=3){c[i]-=3;acc.push({k:'t',t:i});rec(acc,p);acc.pop();c[i]+=3}
    if(i<27&&i%9<7&&c[i+1]&&c[i+2]){c[i]--;c[i+1]--;c[i+2]--;acc.push({k:'s',t:i});rec(acc,p);acc.pop();c[i]++;c[i+1]++;c[i+2]++}
  };
  for(let p=0;p<34;p++)if(c[p]>=2){c[p]-=2;rec([],p);c[p]+=2}
  return out;
}

function createRoom(code){
  let G={ph:'lobby',seats:[null,null,null,null],sc:[0,0,0,0],dealer:0,streak:0,tk:0,
    hands:[],wall:[],disc:[],mel:[],fl:[],wait:[],opts:{},claims:{}};
  let timer=null,destroyed=false;
  const room={code,onChange:null,lastActive:Date.now()};
  const isAuto=s=>{const x=G.seats[s];return !!(x&&(x.b||x.off))};
  const seatOf=p=>G.seats.findIndex(x=>x&&x.p===p);
  // 吃牌後的食替限制：剛吃的那張牌，這回合不能打出（手上只剩這種牌時例外）
  const banned=s=>{
    const n=G.noDisc;
    if(!n||n.s!==s||G.mode!=='d'||G.turn!==s)return -1;
    return G.hands[s].some(x=>x!==n.t)?n.t:-1;
  };

function tally(s,zm,extra,wt){
  const hd=G.hands[s],ms=G.mel[s],w=(s-G.dealer+4)%4;let tai=0;const L=[];
  const A=(n,x)=>{if(!x)return;tai+=x;L.push(n+x+'台')};
  const all=[...hd,...ms.flatMap(m=>m.ts)],c=cnt(all);
  const noMeld=G.mel.every(m=>!m.length);
  const open=ms.some(m=>m.k!=='ag');
  // 門前
  if(!open)A('門清',T.menqing);
  if(zm)A('自摸',T.zimo);
  if(!open&&zm)A('不求人',T.buqiu);
  if(hd.length===2&&ms.length&&!ms.some(m=>m.k==='ag')){ if(zm)A('半求人',T.banqiu);else A('全求人',T.quanqiu); }
  // 獨聽：拿掉胡的那張後，只聽 1 種牌
  const h0=hd.slice();const wi=h0.indexOf(wt);if(wi>=0)h0.splice(wi,1);
  let waits=0;for(let x=0;x<34;x++)if(win([...h0,x]))waits++;
  const single=waits===1;
  if(single)A('獨聽',T.dudiao);
  // 槓、海底
  if(extra==='gang')A('槓上開花',T.gangkai);
  if(extra==='rob')A('搶槓',T.qianggang);
  if(zm&&!extra&&G.wall.length<=16)A('海底撈月',T.haidi);
  if(!zm&&extra!=='rob'&&G.wall.length<=16)A('河底撈魚',T.hedi);
  // 天、地、人胡
  if(zm&&noMeld&&s===G.dealer&&G.disc.every(d=>!d.length))A('天胡',T.tian);
  else if(zm&&noMeld&&s!==G.dealer&&!G.disc[s].length)A('地胡',T.di);
  if(!zm&&noMeld&&s!==G.dealer&&!G.disc[s].length&&extra!=='rob')A('人胡',T.ren);
  // 花牌（春夏秋冬 34 到 37，梅蘭竹菊 38 到 41，各對應東南西北座位）
  G.fl[s].forEach(f=>{if((f-34)%4===w)A('正花',T.flower)});
  const fs=new Set(G.fl[s]);
  if([34,35,36,37].every(x=>fs.has(x)))A('花槓（春夏秋冬）',T.flowerGang);
  if([38,39,40,41].every(x=>fs.has(x)))A('花槓（梅蘭竹菊）',T.flowerGang);
  // 三元
  const dr=[31,32,33].filter(t=>c[t]>=3),dp=[31,32,33].filter(t=>c[t]===2);
  if(dr.length===3)A('大三元',T.big3);
  else if(dr.length===2&&dp.length===1)A('小三元',T.small3);
  else dr.forEach(t=>A(ZN[t-31]+'刻',T.yuan));
  // 四喜、門風、圈風
  const wr=[27,28,29,30].filter(t=>c[t]>=3),wp=[27,28,29,30].filter(t=>c[t]===2);
  if(wr.length===4)A('大四喜',T.big4);
  else{
    if(wr.length===3&&wp.length===1)A('小四喜',T.small4);
    if(c[27+w]>=3)A('門風',T.menfeng);
    if(c[27]>=3)A('圈風',T.quanfeng);
  }
  // 一色
  const su=new Set(all.filter(t=>t<27).map(t=>t/9|0)),ho=all.some(t=>t>=27);
  if(!su.size)A('字一色',T.zi);else if(su.size===1)ho?A('混一色',T.hun):A('清一色',T.qing);
  // 與拆法有關的台數：暗刻、碰碰胡、平胡（取台數最高的拆法）
  const noHonor=all.every(t=>t<27);
  let best=null;
  for(const d of decomps(cnt(hd))){
    const it=[];let x=0;
    const tris=d.sets.filter(e=>e.k==='t');
    let an=tris.length;if(!zm&&tris.some(e=>e.t===wt))an--;
    an+=ms.filter(m=>m.k==='ag').length;
    if(an>=5){it.push(['五暗刻',T.an5]);x+=T.an5}
    else if(an===4){it.push(['四暗刻',T.an4]);x+=T.an4}
    else if(an===3){it.push(['三暗刻',T.an3]);x+=T.an3}
    if(!ms.some(m=>m.k==='chi')&&d.sets.every(e=>e.k==='t')){it.push(['碰碰胡',T.pengpeng]);x+=T.pengpeng}
    if(!zm&&!single&&noHonor&&!G.fl[s].length&&ms.every(m=>m.k==='chi')&&d.sets.every(e=>e.k==='s')){it.push(['平胡',T.pinghu]);x+=T.pinghu}
    if(!best||x>best.x)best={x,it};
  }
  if(best)best.it.forEach(([n,x])=>A(n,x));
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
  // 只有「現在輪到你操作」的人才收到倒數時間，其他人看不出誰在思考
  const mine=G.ph==='play'&&me>=0&&((G.mode==='d'&&G.turn===me&&!isAuto(me))||G.wait.includes(me));
  const tl=mine&&G.dl?Math.max(0,G.dl-Date.now()):-1;
  const mel=G.mel.map((ms,idx)=>ms.map(m=>{
    if(m.k==='ag'&&G.ph!=='end'&&idx!==me)return{k:'ag',ts:[-1,-1,-1,-1]};
    return m;
  }));
  return{ph:G.ph,code,me,seats:G.seats.map(x=>x&&{n:x.n,b:x.b?1:0,off:x.off?1:0}),sc:G.sc,dealer:G.dealer,
    streak:G.streak,turn:G.turn,mode:G.mode,drew:G.drew,wl:b?0:G.wall.length,disc:G.disc,mel,fl:G.fl,
    nd:me>=0?banned(me):-1,cnt:b?[]:G.hands.map(x=>x.length),last:G.last,wait:G.wait.includes(me)?[me]:[],tl,res:G.res,shout:G.shout,H,O};
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
    last:null,noDisc:null,res:null,wait:[],opts:{},claims:{},drew:false,fromGang:false,pendingBg:null,shout:null,
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
  G.dl=(G.ph==='play'&&G.mode==='d'&&!isAuto(G.turn))?Date.now()+TURN_MS:0;
  bc();
  if(G.ph!=='play'||G.mode!=='d')return;
  const s=G.turn,k=++G.tk;
  // 模擬真人思考時間（650ms ~ 1150ms）
  const delay = 650 + Math.floor(Math.random() * 500);
  if(isAuto(s))setTimeout(()=>{if(k===G.tk&&!destroyed)bot(s)}, delay);
  else setTimeout(()=>{if(k===G.tk&&!destroyed&&G.ph==='play'&&G.mode==='d'&&G.turn===s)bot(s)}, TURN_MS); // 真人閒置超時自動代打
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
  const bn=banned(s);
  let bestTile = hd.find(x=>x!==bn);
  if(bestTile==null)bestTile=hd[0];
  let bestRemainScore = -1e9;
  const seen = new Set();
  for(let i = 0; i < hd.length; i++){
    const t = hd[i];
    if(seen.has(t)||t===bn) continue;
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
  if(banned(s)===t)return;
  G.noDisc=null;
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
  G.dl=G.wait.length?Date.now()+CLAIM_MS:0;
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
    },CLAIM_MS);
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
  G.noDisc=k==='chi'?{s,t}:null;
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
  G.dl=G.wait.length?Date.now()+BG_MS:0;
  bc();
  if(!G.wait.length) setTimeout(resolveBg, 450);
  else timer=setTimeout(()=>{
    G.wait.forEach(x=>{G.passedHu[x]=true; G.claims[x]='pass';});
    G.wait=[]; resolveBg();
  }, BG_MS);
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
  G.ph='end';G.tk++;clearTimeout(timer);G.wait=[];G.dl=0;
  if(w==null)G.res={draw:1};
  else{
    let f=-1,wt;
    if(!zm){
      f=G.last.f;wt=G.last.t;
      G.hands[w].push(G.last.t);
      if(extra!=='rob') G.disc[f].pop();
    }else wt=G.hands[w][G.hands[w].length-1];
    const r=tally(w,zm,extra,wt);
    const dTai=1+2*G.streak;   // 莊家台 = 2n + 1（只在莊家與對手之間計算）
    const payers=zm?[0,1,2,3].filter(i=>i!==w):[f];
    const pay=payers.map(i=>{
      const t=r.tai+((w===G.dealer||i===G.dealer)?dTai:0);
      return{i,tai:t,amt:BASE+PER*t};
    });
    pay.forEach(p=>{G.sc[p.i]-=p.amt;G.sc[w]+=p.amt});
    const a=pay.reduce((x,p)=>x+p.amt,0);
    G.res={w,zm,f,tai:r.tai,L:r.L,a,extra,wt,pay,dTai,base:BASE,per:PER,dealer:G.dealer};
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
    if(G.res.draw)G.streak++;
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

const api={createRoom,win,cnt,RULES,BASE,PER};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.MJ=api;
})(typeof window!=='undefined'?window:globalThis);
