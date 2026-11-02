(() => {
  'use strict';
  const D=window.ATLAS_DATA;
  const owner=D.profile?.displayName||'我', siteName=D.profile?.siteName||'个人知识库';
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const url=(kind,id)=>'#'+kind+(id?'/'+encodeURIComponent(id):'');
  const byId=new Map(D.records.map(r=>[r.id,r]));
  const docs=new Map(D.documents.map(r=>[r.id,r]));
  const groups=[...new Set(D.records.map(r=>r.group))];
  const domains=Object.keys(D.domains);
  const symbols={
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    moon:'<path d="M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10Z"/>',
    book:'<path d="M12 5v15M3 4c3-1 6-1 9 1 3-2 6-2 9-1v15c-3-1-6-1-9 1-3-2-6-2-9-1Z"/>',
    network:'<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="8" r="2.5"/><circle cx="11" cy="19" r="2.5"/><path d="m7.5 6.5 9 1M6 8.5l4 8m7.5-6.5-5 7"/>',
    home:'<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
    list:'<path d="M8 5h13M8 12h13M8 19h13M3 5h.1M3 12h.1M3 19h.1"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    file:'<path d="M14 2H5v20h14V7Zm0 0v5h5M8 11h8M8 15h8M8 19h5"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
    fit:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
    fullscreen:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  };
  const icon=n=>'<svg class="icon" aria-hidden="true" viewBox="0 0 24 24">'+(symbols[n]||symbols.file)+'</svg>';
  const hydrateIcons=()=>$$('[data-icon]').forEach(e=>{e.outerHTML=icon(e.dataset.icon);});
  function tag(r){return '<span class="tag" data-kind="'+esc(r.kind)+'">'+esc(r.kind)+'</span>';}
  function notify(text){const n=$('#notice');n.textContent=text;n.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>n.hidden=true,3500);}
  let graph=null;
  let currentRoute={type:'home',id:''};
  function getTheme(){try{return localStorage.getItem('atlas-theme')||'dark';}catch{return 'dark';}}
  document.documentElement.dataset.theme=getTheme();
  function syncTheme(){const light=document.documentElement.dataset.theme==='light';$('#theme-btn').innerHTML=icon(light?'moon':'sun');$('#theme-btn').setAttribute('aria-label',light?'切换深色模式':'切换浅色模式');graph?.draw();}
  $('#theme-btn').addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('atlas-theme',theme);}catch{}syncTheme();});
  $('#reading-btn').addEventListener('click',()=>{const on=document.body.classList.toggle('reading');$('#reading-btn').setAttribute('aria-pressed',String(on));graph?.resize();});
  function setMenu(open){document.body.classList.toggle('nav-open',open);$('#menu-btn').setAttribute('aria-expanded',String(open));$('#menu-btn').setAttribute('aria-label',open?'关闭目录':'打开目录');$('#nav-backdrop').hidden=!open;}
  $('#menu-btn').addEventListener('click',()=>setMenu(!document.body.classList.contains('nav-open')));
  $('#nav-backdrop').addEventListener('click',()=>setMenu(false));
  const review=window.createAtlasReviews({data:D,$,esc,foot,crumb,context});
  function sideNav(){
    $('#sidebar').innerHTML='<p class="nav-caption">我的知识空间</p>'+[['home','知识库首页','home'],['overview','成长总览','clock'],['monthly','月度档案','book'],['graph','关系图谱总览','network'],['index','全部目录索引','list']].map(([r,t,i])=>'<a class="nav-link" href="#'+r+'">'+icon(i)+t+'</a>').join('')+
      '<details class="nav-folder" open><summary>按月份查看</summary>'+D.reviews.months.slice(0,4).map(m=>'<a class="nav-link" href="#month/'+m.id+'">'+m.id.replace('-','年')+'月<span class="count">'+esc(m.mode)+'</span></a>').join('')+'<a class="nav-link" href="#monthly">查看全部月份 →</a></details>'+
      '<p class="nav-caption">主题目录 · '+groups.length+'</p>'+domains.map((d,i)=>'<details class="nav-folder" '+(i<2?'open':'')+'><summary>'+esc(d)+'</summary>'+D.domains[d].map(g=>'<a class="nav-link" href="'+url('group',g)+'"><span>'+esc(g)+'</span><span class="count">'+D.records.filter(r=>r.group===g).length+'</span></a>').join('')+'</details>').join('')+
      '<p class="nav-caption">沿着时间与关系阅读</p>'+[['update-20261102','本次更新 · 11月2日','clock'],['growth','成长变化','clock'],['connections','十二组关键关系','network'],['timeline','历史时间线','clock'],['abilities','能力与证据','file'],['risks','三个规划缺口','file'],['conflicts','冲突与时间边界','file'],['about','阅读与证据说明','book'],['sources','来源索引','list']].map(([id,t,i])=>'<a class="nav-link" href="'+url('read',id)+'">'+icon(i)+t+'</a>').join('')+
      '<div class="side-foot"><strong>'+esc(siteName)+'</strong>记录截至 '+D.date+'<br>全历史检索版 · '+esc(D.version)+'</div>';
  }
  function crumb(items=[]){return '<nav class="breadcrumb" aria-label="面包屑"><a href="#home">知识库</a>'+items.map(x=>'<span>/</span>'+(x.href?'<a href="'+x.href+'">'+esc(x.name)+'</a>':'<span>'+esc(x.name)+'</span>')).join('')+'</nav>';}
  function foot(){return '<footer class="article-footer">'+esc(siteName)+'<br>'+esc(D.date)+' 记录快照 · 计划和推断不等同于已发生的事实</footer>';}
  function card(r){return '<a class="entry" href="'+url('node',r.id)+'"><div class="entry-head"><h3>'+esc(r.label)+'</h3>'+tag(r)+'</div><p>'+esc(r.detail)+'</p><span class="meta">'+r.id+' · '+esc(r.when)+'</span></a>';}
  function home(){
    $('#main').innerHTML=crumb()+ '<div class="eyebrow">PERSONAL ATLAS</div><h1>'+esc(owner)+'的个人知识库</h1><p class="intro">从一段经历，找到它与当下的联系。沿着主题阅读，或进入关系图谱，看看你的兴趣、选择与成长如何彼此连接。</p><div class="stat-row"><span class="stat"><strong>'+D.records.length+'</strong>条个人信息</span><span class="stat"><strong>'+groups.length+'</strong>个主题</span><span class="stat"><strong>'+D.edges.length+'</strong>条交叉关系</span></div><div class="review-entrypoints"><a class="review-card" href="#overview"><span class="eyebrow">成长总览</span><h2>看见整条变化主线</h2><p>学习、消费、任务冲突、长期目标和人格观察，连接过去与现在。</p><span class="review-open">查看趋势与依据 →</span></a><a class="review-card" href="#monthly"><span class="eyebrow">月度档案</span><h2>每个月，单独回看</h2><p>按月份查看记忆回顾与保存快照，保留当时状态和判断。</p><span class="review-open">进入月份目录 →</span></a></div><div class="callout"><strong>本次更新 · '+esc(D.date)+'</strong><br>新增'+D.updateSummary.addedRecords+'条信息、'+D.updateSummary.addedEdges+'条关联；保留历次历史状态与10月14日快照。 <a href="#read/update-20261102">查看变化、时间线与待核结果 →</a></div><div class="section-heading"><h2>从一个主题开始</h2><a href="#index">全部目录</a></div><div class="domain-grid">'+domains.map((d,i)=>{
      const n=D.records.filter(r=>D.domains[d].includes(r.group)).length;
      return '<section class="domain-card"><span class="number">0'+(i+1)+' / '+String(n).padStart(2,'0')+' NODES</span><h3>'+esc(d)+'</h3><p class="meta">'+esc(D.domainSummaries[d])+'</p><div class="chips">'+D.domains[d].map(g=>'<a href="'+url('group',g)+'">'+esc(g)+'</a>').join('')+'</div><div class="card-end"><span>'+n+'条记录</span><a href="'+url('group',D.domains[d][0])+'">进入主题</a></div></section>';
    }).join('')+'</div><div class="section-heading"><h2>连起来读</h2></div><div class="entry-list">'+['growth','connections','timeline','risks'].map(id=>'<a class="entry" href="'+url('read',id)+'"><h3>'+docs.get(id).title+'</h3><p>'+({growth:'沿着2025年到现在的记录，看见前后变化，而不是给自己贴一个固定标签。',connections:'从独处与表达、认可与能力、启动与坚持等关系理解自己。',timeline:'把后来回忆、当时状态、未来计划放回各自的时间。',risks:'时间预算、机会收益、履历与能力状态，哪些前提仍需核实。'}[id])+'</p></a>').join('')+'</div><div class="callout"><strong>关于这份记录</strong><br>最早可检索聊天为2025年3月9日，包含对更早经历的回忆。更早未命中的内容保留为空缺，不能视为从未发生。</div>'+foot();
    context(null,[{name:'主题目录',href:'#index'},{name:'成长变化',href:'#read/growth'},{name:'来源与证据',href:'#read/about'}]);
  }
  function groupView(name){
    const rows=D.records.filter(r=>r.group===name);if(!rows.length)return missing();
    const d=domains.find(d=>D.domains[d].includes(name));
    $('#main').innerHTML=crumb([{name:d},{name}])+'<div class="eyebrow">主题目录 / '+String(groups.indexOf(name)+1).padStart(2,'0')+'</div><h1>'+esc(name)+'</h1><div class="page-meta"><span>'+rows.length+'条个人记录</span><span>更新于 '+D.date+'</span></div><div class="accent-rule"></div><div class="entry-list">'+rows.map(card).join('')+'</div>'+foot();
    context(rows[0].id,rows.map(r=>({name:r.label,href:url('node',r.id)})));
  }
  function successorNote(r){const ids=D.superseded?.[r.id]||[];if(!ids.length)return '';return '<div class="callout"><strong>此条保留当时状态，已有后续进展</strong><br>'+ids.map(id=>'<a href="'+url('node',id)+'">'+esc(byId.get(id).label)+'</a>').join(' · ')+'</div>';}
  function nodeView(id){
    const r=byId.get(id);if(!r)return missing();
    const es=D.edges.filter(e=>e.from===id||e.to===id);
    const sourceKeys=[...new Set(r.source.match(/(?:H\d+|F\d+|U\d+|\bM\b|\bU\b)/g)||[])];
    $('#main').innerHTML=crumb([{name:r.group,href:url('group',r.group)},{name:r.label}])+'<div class="eyebrow">PERSONAL RECORD · '+r.id+'</div><h1>'+esc(r.label)+'</h1><div class="page-meta">'+tag(r)+'<span>'+esc(r.when)+'</span><span>'+esc(r.group)+'</span></div><div class="accent-rule"></div>'+successorNote(r)+'<div class="node-text"><strong>'+esc(r.relation)+'：</strong>'+esc(r.detail)+'</div>'+
      (['推断','计划','待核'].includes(r.kind)?'<div class="callout">'+({推断:'这是一条有依据的解释，可以被新信息修正；它不是对你的定论。',计划:'这条信息记录了当时的设想。没有后续结果时，不将它记作已经完成。',待核:'此处存在信息缺口、冲突或过时状态，暂不补写确定结论。'}[r.kind])+'</div>':'')+
      '<div class="section-heading" id="relations"><h2>与它相连</h2><a href="'+url('graph',id)+'">在图谱中查看</a></div>'+(es.length?'<div class="relation-list">'+es.map(e=>{const incoming=e.to===id,other=byId.get(incoming?e.from:e.to);return '<a class="relation-item" href="'+url('node',other.id)+'"><span class="verb">'+esc(incoming?other.label+' → '+e.relation+' → 当前': '当前 → '+e.relation+' → '+other.label)+'</span><strong>'+esc(other.label)+'</strong> '+tag(e)+'<p>'+esc(e.basis)+'</p></a>';}).join('')+'</div>':'<p class="source-note">暂未整理出独立的交叉关系。可返回主题目录查看相关经历。</p>')+
      '<details class="source-details" id="sources"><summary>来源与证据</summary><p>节点来源：'+esc(r.source)+'</p>'+sourceKeys.filter(k=>D.sources[k]).map(k=>'<p><strong>'+k+'</strong> '+esc(D.sources[k])+'</p>').join('')+'</details>'+foot();
    context(id,[{name:'与它相连',anchor:'relations'},{name:'来源与证据',anchor:'sources'},{name:'同主题全部记录',href:url('group',r.group)}]);
  }
  function reading(id){const d=docs.get(id);if(!d)return missing();$('#main').innerHTML=crumb([{name:'专题阅读'},{name:d.title}])+'<div class="eyebrow">READING / EVIDENCE & REFLECTION</div><h1>'+esc(d.title)+'</h1><div class="page-meta"><span>'+esc(d.date||D.date)+'</span><span>基于全历史检索版</span></div><div class="prose">'+d.html+'</div>'+foot();context(null,d.toc.map(t=>({name:t.label,anchor:t.id})));}
  function index(){
    $('#main').innerHTML=crumb([{name:'全部目录索引'}])+'<div class="eyebrow">COMPLETE INDEX</div><h1>全部目录索引</h1><p class="intro">'+D.records.length+'条信息按'+groups.length+'个主题展开。每一条都有独立页面、时间标记和来源。</p><div class="all-index">'+domains.map(d=>'<h2>'+esc(d)+'</h2>'+D.domains[d].map(g=>'<section class="index-group"><h3><a href="'+url('group',g)+'">'+esc(g)+'</a></h3><div class="index-links">'+D.records.filter(r=>r.group===g).map(r=>'<a href="'+url('node',r.id)+'"><span class="meta">'+r.id+'</span>　'+esc(r.label)+' '+tag(r)+'</a>').join('')+'</div></section>').join('')).join('')+'</div>'+foot();context(null,domains.map(d=>({name:d,href:url('group',D.domains[d][0])})));
  }
  function context(id,toc=[]){
    const links=id?D.edges.filter(e=>e.from===id||e.to===id):[];
    const neighbors=id?[...new Set(links.map(e=>e.from===id?e.to:e.from))].slice(0,7):['G01','Q04','P13','O01','D01','F05'];
    const rootLabel=id?byId.get(id).label:owner;
    const pts=neighbors.map((n,i)=>({id:n,x:120+Math.cos(i/neighbors.length*Math.PI*2-.8)*79,y:100+Math.sin(i/neighbors.length*Math.PI*2-.8)*68}));
    $('#context').innerHTML='<section class="context-box"><div class="context-title">文章关系导航</div><h2>'+(id?'当前记录关系':'个人关系导航')+'</h2><p class="stats">'+(neighbors.length+1)+'个可见节点'+(links.length?' · '+links.length+'条关系':'')+'</p><svg class="mini-graph" viewBox="0 0 240 200" role="img" aria-label="'+esc(rootLabel)+'的局部关系图">'+pts.map(p=>'<line x1="120" y1="100" x2="'+p.x+'" y2="'+p.y+'"/>').join('')+pts.map(p=>'<a href="'+url('node',p.id)+'" aria-label="'+esc(byId.get(p.id).label)+'"><circle cx="'+p.x+'" cy="'+p.y+'" r="6"/><title>'+esc(byId.get(p.id).label)+'</title></a>').join('')+'<circle class="focus" cx="120" cy="100" r="10"/><text x="120" y="122" text-anchor="middle">'+esc(rootLabel.length>12?rootLabel.slice(0,11)+'…':rootLabel)+'</text></svg><a class="full-graph-link" href="'+url('graph',id||'')+'">打开完整关系图谱</a></section>'+
      (toc.length?'<section class="context-box"><h2>当前目录</h2><ul class="toc">'+toc.map(t=>'<li><a '+(t.anchor?'href="#'+esc(t.anchor)+'" data-scroll="'+esc(t.anchor)+'"':'href="'+t.href+'"')+'>'+esc(t.name)+'</a></li>').join('')+'</ul></section>':'')+
      '<p class="source-note">实线记录已整理的关系。<br>推断、计划与待核信息分别标记，避免把解释当作事实。</p>';
    $$('#context [data-scroll]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();document.getElementById(a.dataset.scroll)?.scrollIntoView({behavior:'smooth'});}));
  }
  function missing(){ $('#main').innerHTML='<div class="empty-state"><h1>没有找到这条记录</h1><p>它可能已移动，或链接中的编号不正确。</p><a class="btn" href="#index">查看全部目录</a></div>';$('#context').innerHTML='';}
  function route(){
    graph?.destroy();graph=null;
    let [type,id]=location.hash.slice(1).split('/');type=type||'home';try{id=decodeURIComponent(id||'');}catch{id='';}
    currentRoute={type,id};document.body.classList.toggle('graph-page',type==='graph');setMenu(false);
    const funcs={home,index,group:groupView,node:nodeView,read:reading,graph:graphView,monthly:review.monthly,month:review.month,monthnode:review.monthnode,overview:review.overview};(funcs[type]||missing)(id);
    $$('#sidebar a').forEach(a=>{if(a.getAttribute('href')===location.hash||a.getAttribute('href')==='#overview'&&type==='overview'||a.getAttribute('href')==='#monthly'&&['month','monthnode'].includes(type)||type==='home'&&a.getAttribute('href')==='#home'){a.setAttribute('aria-current','page');if(a.closest('details'))a.closest('details').open=true;}else a.removeAttribute('aria-current');});
    const name=type==='overview'?'成长总览':type==='monthly'?'月度档案':type==='month'?id.split('@')[0].replace('-','年')+'月档案'+(id.includes('@')?' · 历史快照':''):type==='monthnode'?'月度保存记录':type==='node'?byId.get(id)?.label:type==='group'?id:type==='read'?docs.get(id)?.title:type==='graph'?'关系图谱':type==='index'?'全部目录':'个人知识库';
    document.title=(name||'个人知识库')+' · '+siteName;window.scrollTo({top:0});hydrateIcons();
  }
  function searchAll(q){const words=q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);if(!words.length)return [];
    return D.records.filter(r=>{const t=[r.id,r.label,r.detail,r.group,r.when,r.kind].join(' ').toLocaleLowerCase();return words.every(w=>t.includes(w));}).sort((a,b)=>Number(b.label.includes(q))-Number(a.label.includes(q)));
  }
  function openSearch(){const d=$('#search-dialog');if(!d.open)d.showModal();$('#search-input').focus();renderSearch();}
  $('#search-open').addEventListener('click',openSearch);
  $('#search-dialog').addEventListener('click',e=>{if(e.target===$('#search-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
  function renderSearch(){const q=$('#search-input').value.trim();const matches=searchAll(q),chapters=q?D.documents.filter(d=>(d.title+d.text).includes(q)):[];
    $('#search-summary').textContent=q?matches.length+'条记录 · '+chapters.length+'篇专题'+(matches.length>40?'（先显示前40条）':''):'试试“知识图谱”“主持”“关系”或一个节点编号';
    $('#search-results').innerHTML=q?(matches.slice(0,40).map(r=>'<a class="search-result" href="'+url('node',r.id)+'"><strong>'+esc(r.label)+'</strong> '+tag(r)+'<p>'+esc(r.detail.slice(0,110))+'</p><small>'+r.id+' · '+esc(r.group)+' · '+esc(r.when)+'</small></a>').join('')+chapters.map(d=>'<a class="search-result" href="'+url('read',d.id)+'"><strong>'+esc(d.title)+'</strong><p>专题阅读 · '+esc(d.text.replace(/[\n#*|]/g,' ').slice(0,100))+'</p></a>').join('')||'<div class="empty-state">没有匹配内容。可以换一个关键词，或搜索记录编号。</div>'):['growth','connections','about'].map(id=>'<a class="search-result" href="'+url('read',id)+'"><strong>'+docs.get(id).title+'</strong><p>从专题开始阅读</p></a>').join('');
    $$('#search-results a').forEach(a=>a.addEventListener('click',()=>$('#search-dialog').close()));
  }
  $('#search-input').addEventListener('input',renderSearch);
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();}if(e.key==='Escape'){setMenu(false);}});

  function graphView(focusId){
    $('#main').innerHTML='<div class="graph-top"><div><div class="eyebrow">全量个人知识图谱</div><h1>把经历、选择与关系连起来</h1></div><div class="graph-stats"><span class="stat"><strong>'+D.records.length+'</strong>信息节点</span><span class="stat"><strong>'+D.edges.length+'</strong>交叉关系</span><span class="stat"><strong>'+groups.length+'</strong>主题</span></div></div><div class="graph-controls"><div class="graph-search"><input id="graph-query" type="search" placeholder="搜索节点、人物、经历或目标" aria-label="搜索图谱节点" autocomplete="off"><div id="graph-results" class="graph-results" hidden></div></div><button class="btn" id="graph-reset">重置视图</button><button class="btn" id="graph-center">回到当前节点</button><button class="btn" id="graph-fullscreen">'+icon('fullscreen')+'全屏查看</button></div><div class="graph-shell" id="graph-shell"><canvas id="network" class="network-canvas" aria-label="个人关系网络。可以拖动平移、双指缩放。使用上方搜索选择节点，或通过下方目录键盘浏览。" role="img"></canvas><div class="zoom-controls"><button class="icon-button" id="zoom-in" aria-label="放大图谱">'+icon('plus')+'</button><button class="icon-button" id="zoom-out" aria-label="缩小图谱">'+icon('minus')+'</button><button class="icon-button" id="zoom-fit" aria-label="适应画布">'+icon('fit')+'</button></div><div id="graph-detail" class="graph-detail" hidden aria-live="polite"></div><div class="graph-hint"><span>拖动画布平移 · 滚轮 / 双指缩放 · 点选查看联系</span><span id="zoom-label">100%</span></div></div><div class="legend"><span><i></i>中心</span><span><i style="background:var(--violet)"></i>领域 / 主题</span><span><i style="background:var(--node)"></i>个人信息</span><span>→ 有向交叉关系</span><span>虚线：推断或待核</span></div><details class="source-details"><summary>键盘浏览与图谱说明</summary><p>全图包含'+(1+domains.length+groups.length+D.records.length)+'个节点：1个中心、'+domains.length+'个领域、'+groups.length+'个主题和'+D.records.length+'条信息。'+(domains.length+groups.length+D.records.length)+'条分组连线用于组织目录；'+D.edges.length+'条有向连线表示信息之间的交叉关系。线条不自动代表因果。</p><p>搜索可以直接定位节点。也可以通过完整目录逐条阅读。</p><a class="btn" href="#index">打开完整目录</a></details>';
    graph=new Network($('#network'));
    $('#graph-reset').addEventListener('click',()=>{graph.clear();graph.reset();$('#graph-query').value='';$('#graph-results').hidden=true;});
    $('#graph-center').addEventListener('click',()=>graph.centerSelected());
    $('#zoom-in').addEventListener('click',()=>graph.zoom(1.3));$('#zoom-out').addEventListener('click',()=>graph.zoom(1/1.3));$('#zoom-fit').addEventListener('click',()=>graph.reset());
    $('#graph-fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('#graph-shell').requestFullscreen)await $('#graph-shell').requestFullscreen();else notify('当前浏览器不支持全屏，横屏可获得更大的图谱视野。');}catch{notify('当前浏览器暂时无法进入全屏。');}});
    $('#graph-query').addEventListener('input',()=>{const q=$('#graph-query').value.trim();const list=$('#graph-results');list.hidden=!q;if(!q)return;const matches=graph.nodes.filter(n=>(n.label+' '+(n.record?.detail||'')).toLowerCase().includes(q.toLowerCase())).slice(0,15);list.innerHTML=matches.length?matches.map(n=>'<button data-gid="'+esc(n.id)+'">'+esc(n.label)+' <span class="meta">'+esc(n.record?.group||'分类节点')+'</span></button>').join(''):'<p class="graph-empty">没有找到对应节点</p>';list.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{graph.select(b.dataset.gid,true);list.hidden=true;}));});
    $('#graph-query').addEventListener('keydown',e=>{if(e.key==='Escape')$('#graph-results').hidden=true;if(e.key==='Enter')$('#graph-results button')?.click();});
    if(focusId&&byId.has(focusId))requestAnimationFrame(()=>graph?.select(focusId,true));
  }

  class Network{
    constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.nodes=[];this.edges=[];this.index=new Map();this.points=new Map();this.selected=null;this.hover=null;this.tx=0;this.ty=0;this.scale=1;this.handlers=[];this.makeData();this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.listen();this.resize(true);}
    makeData(){
      const add=n=>{this.nodes.push(n);this.index.set(n.id,n);return n;};add({id:'root',label:owner,type:'root',x:0,y:0,r:13});
      domains.forEach((d,di)=>{const ang=di/domains.length*Math.PI*2-Math.PI/2,dx=Math.cos(ang)*450,dy=Math.sin(ang)*450;const domain=add({id:'domain-'+di,label:d,type:'domain',x:dx*.58,y:dy*.58,r:8});this.edges.push({source:'root',target:domain.id,structural:true});
        D.domains[d].forEach((g,gi)=>{const ga=ang+(gi-(D.domains[d].length-1)/2)*.38;const gx=Math.cos(ga)*(460+(gi%2)*60),gy=Math.sin(ga)*(460+(gi%2)*60);const group=add({id:'group-'+groups.indexOf(g),label:g,type:'group',group:g,x:gx,y:gy,r:5.5});this.edges.push({source:domain.id,target:group.id,structural:true});
          D.records.filter(r=>r.group===g).forEach((r,ri,arr)=>{const a=ga+(ri-(arr.length-1)/2)*.085;const radius=630+(ri%3)*73+(gi%2)*18;add({id:r.id,label:r.label,type:'record',record:r,x:Math.cos(a)*radius,y:Math.sin(a)*radius,r:3.4});this.edges.push({source:group.id,target:r.id,structural:true});});
        });
      });D.edges.forEach(e=>this.edges.push({...e,source:e.from,target:e.to,structural:false}));
    }
    resize(initial=false){const box=this.canvas.getBoundingClientRect();if(!box.width||!box.height)return;const oldW=this.w,oldH=this.h;this.w=box.width;this.h=box.height;const dpr=Math.min(devicePixelRatio||1,2.5);this.canvas.width=Math.round(this.w*dpr);this.canvas.height=Math.round(this.h*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);if(initial||!oldW)this.reset();else{this.tx+=(this.w-oldW)/2;this.ty+=(this.h-oldH)/2;this.draw();}}
    on(target,name,fn,opts){target.addEventListener(name,fn,opts);this.handlers.push(()=>target.removeEventListener(name,fn,opts));}
    xy(e){const b=this.canvas.getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top};}
    nearest(p){let best=null,dist=Infinity;for(const n of this.nodes){const d=Math.hypot(n.x*this.scale+this.tx-p.x,n.y*this.scale+this.ty-p.y);if(d<Math.max(12,n.r*this.scale+7)&&d<dist){dist=d;best=n;}}return best;}
    listen(){
      this.on(this.canvas,'wheel',e=>{e.preventDefault();const p=this.xy(e);this.zoom(Math.exp(-e.deltaY*.0015),p);},{passive:false});
      this.on(this.canvas,'pointerdown',e=>{this.canvas.setPointerCapture(e.pointerId);const p=this.xy(e);this.points.set(e.pointerId,p);if(this.points.size===1){this.drag={start:p,last:p,node:this.nearest(p),moved:false};}else{this.drag=null;const ps=[...this.points.values()];this.pinch={dist:Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y),mid:{x:(ps[0].x+ps[1].x)/2,y:(ps[0].y+ps[1].y)/2}};}});
      this.on(this.canvas,'pointermove',e=>{const p=this.xy(e);if(this.points.has(e.pointerId)){this.points.set(e.pointerId,p);if(this.points.size===2){const ps=[...this.points.values()],dist=Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y),mid={x:(ps[0].x+ps[1].x)/2,y:(ps[0].y+ps[1].y)/2};if(this.pinch&&this.pinch.dist>0){this.tx+=mid.x-this.pinch.mid.x;this.ty+=mid.y-this.pinch.mid.y;this.zoom(dist/this.pinch.dist,mid);}this.pinch={dist,mid};}else if(this.drag){const dx=p.x-this.drag.last.x,dy=p.y-this.drag.last.y;if(Math.hypot(p.x-this.drag.start.x,p.y-this.drag.start.y)>5)this.drag.moved=true;if(this.drag.moved){if(this.drag.node){this.drag.node.x+=dx/this.scale;this.drag.node.y+=dy/this.scale;}else{this.tx+=dx;this.ty+=dy;}this.draw();}this.drag.last=p;}}else{const n=this.nearest(p);if(this.hover!==n?.id){this.hover=n?.id||null;this.canvas.style.cursor=n?'pointer':'grab';this.draw();}}});
      const up=e=>{if(this.drag&&!this.drag.moved&&this.points.size===1){const n=this.nearest(this.xy(e));if(n)this.select(n.id,false);else this.clear();}this.points.delete(e.pointerId);this.drag=null;this.pinch=null;};this.on(this.canvas,'pointerup',up);this.on(this.canvas,'pointercancel',up);this.on(this.canvas,'pointerleave',()=>{this.hover=null;this.draw();});
      this.on(document,'fullscreenchange',()=>{this.resize();const b=$('#graph-fullscreen');if(b)b.innerHTML=icon('fullscreen')+(document.fullscreenElement?'退出全屏':'全屏查看');});
    }
    zoom(f,p={x:this.w/2,y:this.h/2}){const next=Math.max(.12,Math.min(4,this.scale*f)),ratio=next/this.scale;this.tx=p.x-(p.x-this.tx)*ratio;this.ty=p.y-(p.y-this.ty)*ratio;this.scale=next;this.draw();}
    reset(){this.scale=Math.min(this.w/1850,this.h/1850);this.tx=this.w/2;this.ty=this.h/2;this.draw();}
    centerSelected(){if(!this.selected)return this.reset();this.center(this.index.get(this.selected));}
    center(n){this.scale=Math.max(this.w<650?.9:1.05,this.scale);this.tx=(this.w>850?this.w*.4:this.w*.5)-n.x*this.scale;this.ty=(this.w<650?this.h*.3:this.h*.5)-n.y*this.scale;this.draw();}
    clear(){this.selected=null;$('#graph-detail').hidden=true;this.draw();}
    select(id,center){const n=this.index.get(id);if(!n)return;this.selected=id;if(center)this.center(n);this.draw();const panel=$('#graph-detail');panel.hidden=false;
      const es=D.edges.filter(e=>e.from===id||e.to===id),r=n.record;
      panel.innerHTML='<button class="icon-button close-detail" aria-label="关闭节点详情">'+icon('close')+'</button><div class="eyebrow">'+(r?r.id+' · '+esc(r.group):'分类节点')+'</div><h2>'+esc(n.label)+'</h2>'+(r?tag(r)+'<p>'+esc(r.detail)+'</p><small>'+esc(r.when)+'</small><a class="btn primary" href="'+url('node',id)+'">阅读全文与证据</a>':'<p>'+(n.type==='root'?'个人经历、兴趣、目标与关系的中心。':n.type==='domain'?esc(D.domainSummaries[n.label]):'这一主题包含 '+D.records.filter(r=>r.group===n.group).length+'条信息。')+'</p><a class="btn primary" href="'+(n.type==='group'?url('group',n.group):'#index')+'">查看主题记录</a>')+
      (es.length?'<div class="related-mini">'+es.length+'条交叉关系'+es.slice(0,5).map(e=>{const out=e.from===id,other=byId.get(out?e.to:e.from);return '<button data-related="'+other.id+'"><small>'+esc(out?e.relation:'来自：'+e.relation)+'</small>'+esc(other.label)+'</button>';}).join('')+'</div>':'');
      panel.querySelector('.close-detail').addEventListener('click',()=>this.clear());panel.querySelectorAll('[data-related]').forEach(b=>b.addEventListener('click',()=>this.select(b.dataset.related,true)));
    }
    draw(){
      if(!this.w)return;const c=this.ctx,css=getComputedStyle(document.documentElement),color=k=>css.getPropertyValue(k).trim();c.clearRect(0,0,this.w,this.h);c.fillStyle=color('--canvas');c.fillRect(0,0,this.w,this.h);
      const active=this.selected||this.hover,neighbors=new Set(active?[active]:[]);if(active)this.edges.forEach(e=>{if(e.source===active)neighbors.add(e.target);if(e.target===active)neighbors.add(e.source);});
      // A subtle coordinate grid keeps the network spatially legible while zooming.
      c.strokeStyle=color('--border');c.globalAlpha=.14;c.lineWidth=1;const gap=40;for(let x=((this.tx%gap)+gap)%gap;x<this.w;x+=gap){c.beginPath();c.moveTo(x,0);c.lineTo(x,this.h);c.stroke();}for(let y=((this.ty%gap)+gap)%gap;y<this.h;y+=gap){c.beginPath();c.moveTo(0,y);c.lineTo(this.w,y);c.stroke();}
      const point=n=>({x:n.x*this.scale+this.tx,y:n.y*this.scale+this.ty});
      for(const e of this.edges){const a=this.index.get(e.source),b=this.index.get(e.target),p=point(a),q=point(b),hit=active&&(e.source===active||e.target===active);c.globalAlpha=active?(hit?.8:.055):(e.structural?.23:.13);c.strokeStyle=hit?color(e.structural?'--node':e.kind==='推断'?'--violet':'--accent'):color(e.structural?'--muted':'--node');c.lineWidth=hit?1.5:.7;c.setLineDash(!e.structural&&(e.kind==='推断'||e.kind==='待核')?[4,4]:[]);c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke();c.setLineDash([]);
        if(!e.structural&&(hit||this.scale>.9)){const angle=Math.atan2(q.y-p.y,q.x-p.x),r=b.r*this.scale+4,ex=q.x-Math.cos(angle)*r,ey=q.y-Math.sin(angle)*r;const ar=hit?6:3.5;c.beginPath();c.moveTo(ex,ey);c.lineTo(ex-Math.cos(angle-.45)*ar,ey-Math.sin(angle-.45)*ar);c.moveTo(ex,ey);c.lineTo(ex-Math.cos(angle+.45)*ar,ey-Math.sin(angle+.45)*ar);c.stroke();}
      }
      // Labels appear progressively with zoom and selection.
      const boxes=[];
      const sorted=[...this.nodes].sort((a,b)=>Number(a.id===active)-Number(b.id===active));
      for(const n of sorted){const p=point(n);if(p.x<-100||p.x>this.w+100||p.y<-50||p.y>this.h+50)continue;const hit=neighbors.has(n.id),selected=n.id===active;const r=Math.max(n.type==='root'?6:n.type==='record'?2:3,n.r*this.scale);c.globalAlpha=active?(hit?1:.23):1;c.fillStyle=color(n.type==='root'?'--accent':n.type==='record'?'--node':'--violet');if(selected){c.shadowColor=color('--accent');c.shadowBlur=20;}c.beginPath();c.arc(p.x,p.y,r,0,Math.PI*2);c.fill();c.shadowBlur=0;if(selected){c.strokeStyle=color('--accent');c.lineWidth=2;c.beginPath();c.arc(p.x,p.y,r+5,0,Math.PI*2);c.stroke();}
        const label=selected||hit&&active||n.type==='root'||(!active&&n.type==='domain')||(!active&&n.type==='group'&&this.scale>.48)||(!active&&n.type==='record'&&this.scale>1.2);
        if(label){const fs=n.type==='root'?15:selected?14:n.type==='domain'?13:12;c.font=(n.type==='root'?'600 ':'400 ')+fs+'px system-ui,sans-serif';const text=n.label.length>20&&!selected?n.label.slice(0,19)+'…':n.label;const tw=c.measureText(text).width;let x=p.x-tw/2,y=p.y+r+17;x=Math.max(4,Math.min(this.w-tw-4,x));if(y>this.h-4)y=p.y-r-9;const box={x,y:y-fs,w:tw,h:fs+5};const clash=boxes.some(b=>box.x<b.x+b.w&&box.x+box.w>b.x&&box.y<b.y+b.h&&box.y+box.h>b.y);if(!clash||selected){c.globalAlpha=1;c.fillStyle=color('--canvas');c.fillRect(x-3,y-fs,tw+6,fs+5);c.fillStyle=color(selected||n.type==='root'?'--text':'--muted');c.fillText(text,x,y);boxes.push(box);}}
      }c.globalAlpha=1;const label=$('#zoom-label');if(label)label.textContent=Math.round(this.scale*100)+'%';
    }
    destroy(){this.resizeObserver.disconnect();this.handlers.forEach(f=>f());}
  }
  document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();document.querySelector('#main').focus();});
  sideNav();hydrateIcons();syncTheme();window.addEventListener('hashchange',route);route();
})();
