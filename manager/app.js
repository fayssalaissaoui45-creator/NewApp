(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const R = window.CSMRules;
  const state = { shifts:[], staff:[], leave:[], corrections:[], assignments:{}, view:'dashboard', filter:'all', query:'', staffQuery:'' };

  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function now(){ return new Date(); }
  function today(){ return R.todayKey(); }
  function fmtTime(value){ return value == null ? '—' : R.minToHM(value); }
  function stateFor(shift){ return R.shiftState(shift, today()); }
  function statusClass(status){ return ({ok:'ok',warn:'warn',crit:'danger',break:'info',breakover:'danger',done:'muted',notpunched:'muted'}[status] || 'muted'); }
  function statusLabel(status){ return ({ok:'En poste',warn:'Pause bientôt requise',crit:'Pause immédiate',break:'En pause',breakover:'Pause dépassée',done:'Terminé',notpunched:'Pas encore pointé'}[status] || 'À vérifier'); }
  function notify(message){
    const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(notify.timer); notify.timer = setTimeout(() => toast.classList.remove('show'), 3500);
  }

  function renderShell(){
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === state.view));
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === 'view-' + state.view));
    const labels = {dashboard:['Centre opérationnel','Vue temps réel de votre restaurant'],staff:['Équipe','Annuaire et état des collaborateurs'],requests:['Demandes','Décisions et corrections à traiter']};
    $('pageTitle').textContent = (labels[state.view] || labels.dashboard)[0];
    $('pageSubtitle').textContent = (labels[state.view] || labels.dashboard)[1];
  }
  function renderKpis(){
    const calculated = state.shifts.map(shift => stateFor(shift));
    const working = calculated.filter(x => ['ok','warn','crit'].includes(x.status)).length;
    const breaks = calculated.filter(x => ['break','breakover'].includes(x.status)).length;
    const actions = calculated.filter(x => ['warn','crit','breakover'].includes(x.status)).length;
    $('kpiTotal').textContent = state.shifts.length;
    $('kpiWorking').textContent = working;
    $('kpiBreak').textContent = breaks;
    $('kpiAction').textContent = actions;
    $('kpiDate').textContent = today().split('-').reverse().join('/');
  }
  function renderDashboard(){
    renderKpis();
    const query = state.query.toLowerCase();
    const rows = state.shifts.map(shift => ({shift, calc:stateFor(shift)})).filter(item => {
      const {shift,calc} = item;
      if(state.filter === 'working' && !['ok','warn','crit'].includes(calc.status)) return false;
      if(state.filter === 'break' && !['break','breakover'].includes(calc.status)) return false;
      if(state.filter === 'action' && !['warn','crit','breakover'].includes(calc.status)) return false;
      return !query || String(shift.name || '').toLowerCase().includes(query) || String(shift.badge || '').toLowerCase().includes(query);
    }).sort((a,b) => ({crit:0,breakover:1,warn:2,break:3,ok:4,done:5}[a.calc.status] || 6) - ({crit:0,breakover:1,warn:2,break:3,ok:4,done:5}[b.calc.status] || 6));
    $('shiftRows').innerHTML = rows.length ? rows.map(({shift,calc}) => {
      const ins = shift.inPunches || (shift.clockIn != null ? [shift.clockIn] : []);
      const outs = (shift.outPunches || []).slice();
      if(shift.breakStart != null) outs.push(shift.breakStart);
      if(shift.clockOut != null) outs.push(shift.clockOut);
      outs.sort((a,b) => a-b);
      const complete = calc.status === 'done';
      return '<tr><td class="mono">'+esc(shift.badge)+'</td><td><div class="person">'+esc(shift.name || 'Sans nom')+'</div><div class="subtle">'+esc(findPost(shift.badge))+'</div></td><td class="mono">'+fmtTime(ins[0])+'</td><td class="mono">'+fmtTime(outs[0])+'</td><td class="mono">'+fmtTime(ins[1])+'</td><td class="mono">'+R.fmtHrs(calc.workedMinutes || 0)+'</td><td><span class="status '+statusClass(calc.status)+'">'+esc(statusLabel(calc.status))+'</span></td><td><div class="action-row">'+(complete ? '<span class="subtle">Clôturé</span>' : actionButtons(shift,calc))+'</div></td></tr>';
    }).join('') : '<tr><td colspan="8"><div class="empty"><strong>Aucun pointage correspondant</strong>Modifiez le filtre ou la recherche.</div></td></tr>';
    $('alertList').innerHTML = state.shifts.map(shift => ({shift,calc:stateFor(shift)})).filter(x => ['crit','warn','breakover'].includes(x.calc.status)).slice(0,5).map(x => '<div class="alert-item"><div><strong>'+esc(x.shift.name || x.shift.badge)+'</strong><span>'+esc(statusLabel(x.calc.status))+' · '+R.fmtHrs(x.calc.workedMinutes || 0)+'</span></div><span class="status '+statusClass(x.calc.status)+'">Action</span></div>').join('') || '<div class="empty"><strong>Aucune alerte active</strong>Le service est sous contrôle.</div>';
    $('requestSummary').innerHTML = '<div class="request-item"><div><strong>Congés en attente</strong><span>À examiner par le responsable</span></div><span class="status '+(pending(state.leave) ? 'warn':'ok')+'">'+pending(state.leave)+'</span></div><div class="request-item"><div><strong>Corrections en attente</strong><span>Pointages à vérifier</span></div><span class="status '+(pending(state.corrections) ? 'warn':'ok')+'">'+pending(state.corrections)+'</span></div>';
    $('syncTime').textContent = 'Synchronisé à ' + now().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  }
  function pending(list){ return list.filter(item => item.status === 'pending').length; }
  function findPost(badge){ return Object.keys(state.assignments || {}).find(key => String(state.assignments[key]) === String(badge)) || 'Poste non affecté'; }
  function actionButtons(shift,calc){
    if(['break','breakover'].includes(calc.status)) return '<button class="action primary" data-act="return" data-id="'+shift.id+'">Retour</button><button class="action" data-act="out" data-id="'+shift.id+'">Sortie</button>';
    return '<button class="action warn" data-act="break" data-id="'+shift.id+'">Pause</button><button class="action" data-act="out" data-id="'+shift.id+'">Sortie</button>';
  }
  function renderStaff(){
    const query = state.staffQuery || '';
    const list = state.staff.filter(s => !query || String(s.name||'').toLowerCase().includes(query.toLowerCase()) || String(s.badge||'').includes(query));
    $('staffCards').innerHTML = list.length ? list.map(s => '<article class="staff-card"><div class="avatar">'+esc((s.name||'?').trim().charAt(0).toUpperCase())+'</div><div><strong>'+esc(s.name||'Sans nom')+'</strong><small>Badge '+esc(s.badge)+' · '+(s.active === false ? 'Désactivé':'Actif')+'</small></div><span class="spacer"></span><span class="status '+(s.active === false ? 'muted':'ok')+'">'+(s.active === false ? 'Inactif':'Actif')+'</span></article>').join('') : '<div class="empty"><strong>Aucun collaborateur</strong>Ajoutez ou importez votre équipe depuis la page Employés.</div>';
  }
  function renderRequests(){
    const all = state.leave.map(x => Object.assign({type:'Congé'},x)).concat(state.corrections.map(x => Object.assign({type:'Correction'},x)));
    $('requestRows').innerHTML = all.length ? all.slice(0,30).map(r => '<tr><td><div class="person">'+esc(r.name || 'Employé')+'</div><div class="subtle">Badge '+esc(r.badge)+'</div></td><td>'+esc(r.type)+'</td><td class="mono">'+esc(r.fromDate || r.date || '—')+'</td><td><span class="status '+(r.status === 'pending'?'warn':r.status === 'approved'?'ok':'danger')+'">'+esc(r.status)+'</span></td><td><a class="action" href="requests.html">Ouvrir</a></td></tr>').join('') : '<tr><td colspan="5"><div class="empty"><strong>Aucune demande</strong>Les demandes apparaîtront ici.</div></td></tr>';
  }
  function loadData(){
    CSM.ready.then(() => {
      CSM.refs.shifts().where('date','==',today()).onSnapshot(snap => { state.shifts=snap.docs.map(d=>Object.assign({id:d.id},d.data())); renderDashboard(); });
      CSM.refs.staffColl().onSnapshot(snap => { state.staff=snap.docs.map(d=>d.data()); renderStaff(); });
      CSM.refs.leaveReqs().onSnapshot(snap => { state.leave=snap.docs.map(d=>Object.assign({_id:d.id},d.data())); renderDashboard(); renderRequests(); });
      CSM.refs.corrections().onSnapshot(snap => { state.corrections=snap.docs.map(d=>Object.assign({_id:d.id},d.data())); renderDashboard(); renderRequests(); });
      CSM.refs.restaurant().collection('assignments').doc('current').onSnapshot(doc => { state.assignments=doc.exists ? doc.data() : {}; renderDashboard(); });
      $('restaurantName').textContent = CSM.restaurantName || CSM.restaurantId;
      $('userEmail').textContent = auth.currentUser && auth.currentUser.email || 'Responsable';
      $('app').classList.add('ready');
    }).catch(err => notify('Impossible de charger les données : ' + err.message));
  }
  function doPunch(id,act){
    const shift = state.shifts.find(x => x.id === id); if(!shift) return;
    const t = R.nowMinutes(); const ins=(shift.inPunches || (shift.clockIn != null ? [shift.clockIn] : [])).slice(); const outs=(shift.outPunches || []).slice();
    if(shift.breakStart != null && !outs.includes(shift.breakStart)) outs.push(shift.breakStart);
    if(shift.clockOut != null && !outs.includes(shift.clockOut)) outs.push(shift.clockOut);
    if(act==='break') outs.push(t); if(act==='return') ins.push(t); if(act==='out') outs.push(t);
    ins.sort((a,b)=>a-b); outs.sort((a,b)=>a-b);
    CSM.refs.shift(id).update({inPunches:ins,outPunches:outs,status:act==='out'?'closed':'open',updatedAt:new Date().toISOString()}).then(()=>notify('Pointage mis à jour')).catch(err=>notify('Erreur : '+err.message));
  }
  function wire(){
    document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { state.view=button.dataset.view; renderShell(); }));
    document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { state.filter=button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===button)); renderDashboard(); }));
    $('shiftSearch').addEventListener('input', e => { state.query=e.target.value; renderDashboard(); });
    $('staffSearch').addEventListener('input', e => { state.staffQuery=e.target.value; renderStaff(); });
    document.addEventListener('click', e => { const b=e.target.closest('[data-act]'); if(b) doPunch(b.dataset.id,b.dataset.act); });
    $('themeToggle').addEventListener('click', () => { document.documentElement.classList.toggle('theme-dark'); try{localStorage.setItem('csm_theme',document.documentElement.classList.contains('theme-dark')?'dark':'light')}catch(e){} });
    $('logout').addEventListener('click', () => auth.signOut());
  }
  function boot(){
    try{ if(localStorage.getItem('csm_theme')==='dark') document.documentElement.classList.add('theme-dark'); }catch(e){}
    wire();
    CSM.authReady.then(user => {
      if(!user){ location.replace('login.html'); return; }
      db.collection('managerRestaurants').doc(user.uid).get().then(doc => {
        if(!doc.exists){ notify('Accès responsable requis.'); auth.signOut(); return; }
        loadData();
      }).catch(err => notify('Vérification des droits impossible : ' + err.message));
    });
  }
  boot();
})();
