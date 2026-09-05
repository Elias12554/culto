(() => {
  const LOCAL_STORAGE_KEY = 'velaminis_member_registry_v1';
  const $ = id => document.getElementById(id);

  const rows = $('memberRows');
  const emptyState = $('emptyState');
  const modal = $('memberModal');
  const form = $('memberForm');
  const adminModal = $('adminModal');
  const adminForm = $('adminForm');
  const searchInput = $('searchInput');
  const statusFilter = $('statusFilter');
  const deleteBtn = $('deleteBtn');
  const importInput = $('importInput');

  let members = [];
  let logs = [];
  let client = null;
  let currentUser = null;
  let channel = null;
  let isLoading = false;

  function isConfigured() {
    const cfg = window.VELAMINIS_SUPABASE || {};
    return Boolean(
      cfg.url && cfg.anonKey &&
      !cfg.url.includes('COLE_AQUI') &&
      !cfg.anonKey.includes('COLE_AQUI')
    );
  }

  function statusLabel(status) {
    return status === 'ativo' ? 'NO CULTO' : status === 'espera' ? 'PARA ENTRAR' : 'SAIU';
  }

  function formatDate(value) {
    if (!value) return '—';
    const [year, month, day] = String(value).split('-');
    return day && month && year ? `${day}/${month}/${year}` : value;
  }

  function formatTimestamp(value) {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
    } catch {
      return value;
    }
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>'"]/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
    }[ch]));
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/`/g, '&#96;');
  }

  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function setSyncState(state, title, detail = '') {
    const strip = $('syncStrip');
    strip.dataset.state = state;
    $('syncTitle').textContent = title;
    $('syncDetail').textContent = detail;
  }

  function setAdminUI(user) {
    currentUser = user || null;
    document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !currentUser));
    $('adminLoginBtn').classList.toggle('hidden', Boolean(currentUser));
    $('adminLogoutBtn').classList.toggle('hidden', !currentUser);

    if (currentUser) {
      setSyncState('online', 'REGISTRO CENTRAL SINCRONIZADO', `admin: ${currentUser.email}`);
    } else if (client) {
      setSyncState('online', 'REGISTRO CENTRAL SINCRONIZADO', 'modo de consulta pública');
    }

    updateMigrationButton();
    renderRows();
  }

  function counts() {
    $('countActive').textContent = members.filter(m => m.status === 'ativo').length;
    $('countWaiting').textContent = members.filter(m => m.status === 'espera').length;
    $('countLeft').textContent = members.filter(m => m.status === 'saiu').length;
    $('countTotal').textContent = members.length;
    $('lastUpdate').textContent = logs.length
      ? `Última alteração: ${formatTimestamp(logs[0].createdAt)}`
      : 'Nenhuma alteração registrada.';
  }

  function renderRows() {
    const term = searchInput.value.trim().toLowerCase();
    const filter = statusFilter.value;
    const visible = members
      .filter(m => filter === 'all' || m.status === filter)
      .filter(m => !term || [m.name, m.order, m.rank, m.notes].join(' ').toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    rows.innerHTML = '';
    visible.forEach(member => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="member-name">${escapeHtml(member.name)}</td>
        <td>${escapeHtml(member.order || 'Não definida')}</td>
        <td>${escapeHtml(member.rank || '—')}</td>
        <td><span class="status-pill status-${escapeAttr(member.status)}">${statusLabel(member.status)}</span></td>
        <td>${formatDate(member.entryDate)}</td>
        <td>${formatDate(member.exitDate)}</td>
        <td class="notes-cell" title="${escapeAttr(member.notes || '')}">${escapeHtml(member.notes || '—')}</td>
        <td>${currentUser ? `<div class="row-actions"><button class="icon-btn" data-edit="${escapeAttr(member.id)}" title="Editar">✎</button></div>` : '<span class="read-only-mark">—</span>'}</td>
      `;
      rows.appendChild(tr);
    });

    emptyState.classList.toggle('visible', visible.length === 0);
  }

  function renderLog() {
    const list = $('logList');
    if (!logs.length) {
      list.innerHTML = '<div class="log-empty">Nenhuma movimentação foi registrada ainda.</div>';
      return;
    }

    list.innerHTML = logs.slice(0, 12).map(item => `
      <div class="log-entry">
        <time>${formatTimestamp(item.createdAt)}</time>
        <p><b>${escapeHtml(item.person)}</b> — ${escapeHtml(item.detail || item.action)}</p>
        <span>${escapeHtml(item.action)}</span>
      </div>
    `).join('');
  }

  function render() {
    counts();
    renderRows();
    renderLog();
  }

  function mapMember(row) {
    return {
      id: row.id,
      name: row.name || '',
      order: row.order_name || 'Não definida',
      rank: row.rank_name || 'Iniciado',
      status: row.status || 'espera',
      entryDate: row.entry_date || '',
      exitDate: row.exit_date || '',
      notes: row.notes || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function mapLog(row) {
    return {
      id: row.id,
      memberId: row.member_id,
      action: row.action,
      person: row.person,
      detail: row.detail || '',
      createdAt: row.created_at
    };
  }

  async function fetchRegistry({ silent = false } = {}) {
    if (!client || isLoading) return;
    isLoading = true;
    if (!silent) setSyncState('loading', 'SINCRONIZANDO REGISTRO', 'buscando dados centrais...');

    try {
      const [memberResult, logResult] = await Promise.all([
        client.from('velaminis_members').select('*').order('name', { ascending: true }),
        client.from('velaminis_member_logs').select('*').order('created_at', { ascending: false }).limit(100)
      ]);

      if (memberResult.error) throw memberResult.error;
      if (logResult.error) throw logResult.error;

      members = (memberResult.data || []).map(mapMember);
      logs = (logResult.data || []).map(mapLog);
      render();

      setSyncState(
        'online',
        'REGISTRO CENTRAL SINCRONIZADO',
        currentUser ? `admin: ${currentUser.email}` : 'modo de consulta pública'
      );
    } catch (error) {
      console.error('Velaminis/Supabase:', error);
      const code = error?.code ? ` [${error.code}]` : '';
      const detail = (error?.message || error?.details || error?.hint || 'erro desconhecido') + code;
      setSyncState('error', 'FALHA NA SINCRONIZAÇÃO', detail);
      toast('Não foi possível carregar o registro central.');
    } finally {
      isLoading = false;
    }
  }

  async function addLog(action, person, detail = '', memberId = null) {
    const payload = { action, person, detail, member_id: memberId || null };
    const { error } = await client.from('velaminis_member_logs').insert(payload);
    if (error) throw error;
  }

  function openModal(member = null) {
    if (!currentUser) {
      openAdminModal();
      return;
    }

    $('formTitle').textContent = member ? 'Editar Registro' : 'Novo Membro';
    $('memberId').value = member?.id || '';
    $('nameInput').value = member?.name || '';
    $('orderInput').value = member?.order || 'Não definida';
    $('rankInput').value = member?.rank || 'Iniciado';
    $('statusInput').value = member?.status || 'espera';
    $('entryDateInput').value = member?.entryDate || '';
    $('exitDateInput').value = member?.exitDate || '';
    $('notesInput').value = member?.notes || '';
    deleteBtn.classList.toggle('hidden', !member);
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('nameInput').focus(), 80);
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    form.reset();
  }

  function openAdminModal() {
    $('adminError').textContent = '';
    adminModal.classList.add('open');
    adminModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('adminEmail').focus(), 80);
  }

  function closeAdminModal() {
    adminModal.classList.remove('open');
    adminModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    adminForm.reset();
    $('adminError').textContent = '';
  }

  function normalizeDates(status, entryDate, exitDate) {
    const today = new Date().toISOString().slice(0,10);
    if (status === 'espera') return { entryDate: entryDate || '', exitDate: '' };
    if (status === 'ativo') return { entryDate: entryDate || today, exitDate: '' };
    return { entryDate: entryDate || '', exitDate: exitDate || today };
  }

  async function saveMember(event) {
    event.preventDefault();
    if (!currentUser || !client) return openAdminModal();

    const id = $('memberId').value;
    const current = members.find(m => m.id === id);
    const status = $('statusInput').value;
    const dates = normalizeDates(status, $('entryDateInput').value, $('exitDateInput').value);
    const name = $('nameInput').value.trim();
    if (!name) return;

    const payload = {
      name,
      order_name: $('orderInput').value,
      rank_name: $('rankInput').value,
      status,
      entry_date: dates.entryDate || null,
      exit_date: dates.exitDate || null,
      notes: $('notesInput').value.trim()
    };

    try {
      setSyncState('loading', 'SALVANDO NO REGISTRO CENTRAL', name);

      if (current) {
        const { error } = await client.from('velaminis_members').update(payload).eq('id', id);
        if (error) throw error;
        const detail = current.status !== status
          ? `estado alterado de ${statusLabel(current.status)} para ${statusLabel(status)}`
          : 'registro atualizado';
        await addLog('ATUALIZAÇÃO', name, detail, id);
        toast('Registro atualizado para todos.');
      } else {
        const { data, error } = await client.from('velaminis_members').insert(payload).select('id').single();
        if (error) throw error;
        await addLog('NOVO REGISTRO', name, `inscrito como ${statusLabel(status)}`, data?.id || null);
        toast('Novo membro registrado para todos.');
      }

      closeModal();
      await fetchRegistry({ silent: true });
    } catch (error) {
      console.error(error);
      toast('Não foi possível salvar no registro central.');
      setSyncState('error', 'FALHA AO SALVAR', error.message || 'erro desconhecido');
    }
  }

  async function deleteMember() {
    if (!currentUser || !client) return openAdminModal();
    const id = $('memberId').value;
    const member = members.find(m => m.id === id);
    if (!member) return;

    const ok = confirm(`Excluir permanentemente o registro de ${member.name}?\n\nSe a pessoa apenas saiu do culto, prefira mudar o estado para “Saiu” para manter o histórico.`);
    if (!ok) return;

    try {
      const { error } = await client.from('velaminis_members').delete().eq('id', id);
      if (error) throw error;
      await addLog('EXCLUSÃO', member.name, 'registro removido do livro');
      closeModal();
      await fetchRegistry({ silent: true });
      toast('Registro excluído para todos.');
    } catch (error) {
      console.error(error);
      toast('Não foi possível excluir o registro.');
    }
  }

  async function loginAdmin(event) {
    event.preventDefault();
    if (!client) return;
    $('adminError').textContent = '';

    const email = $('adminEmail').value.trim();
    const password = $('adminPassword').value;
    const submit = adminForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'ENTRANDO...';

    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setAdminUI(data.user);
      closeAdminModal();
      toast('Acesso de administrador liberado.');
    } catch (error) {
      console.error(error);
      $('adminError').textContent = 'E-mail ou senha inválidos, ou conta não autorizada.';
    } finally {
      submit.disabled = false;
      submit.textContent = 'ENTRAR';
    }
  }

  async function logoutAdmin() {
    if (!client) return;
    await client.auth.signOut();
    setAdminUI(null);
    toast('Modo administrador encerrado.');
  }

  function exportRegistry() {
    const payload = JSON.stringify({ version: 2, source: 'velaminis-supabase', exportedAt: new Date().toISOString(), members, logs }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `velaminis-registro-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Cópia do registro exportada.');
  }

  async function importRegistry() {
    if (!currentUser || !client) return openAdminModal();
    const file = importInput.files?.[0];
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.members)) throw new Error('Formato inválido');
      const ok = confirm(`Importar ${data.members.length} registro(s) para o banco compartilhado?\n\nOs registros atuais NÃO serão apagados; estes serão adicionados.`);
      if (!ok) return;

      const payload = data.members.map(m => ({
        name: String(m.name || '').trim(),
        order_name: m.order || m.order_name || 'Não definida',
        rank_name: m.rank || m.rank_name || 'Iniciado',
        status: ['ativo','espera','saiu'].includes(m.status) ? m.status : 'espera',
        entry_date: m.entryDate || m.entry_date || null,
        exit_date: m.exitDate || m.exit_date || null,
        notes: m.notes || ''
      })).filter(m => m.name);

      if (!payload.length) throw new Error('Nenhum registro válido');
      const { error } = await client.from('velaminis_members').insert(payload);
      if (error) throw error;
      await addLog('IMPORTAÇÃO', 'Arquivo do registro', `${payload.length} registros importados`);
      await fetchRegistry({ silent: true });
      toast('Importação concluída no registro central.');
    } catch (error) {
      console.error(error);
      toast('Não foi possível importar este arquivo.');
    } finally {
      importInput.value = '';
    }
  }

  function getLocalMembers() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function updateMigrationButton() {
    const btn = $('migrateLocalBtn');
    const local = getLocalMembers();
    btn.classList.toggle('hidden', !(currentUser && local.length));
    btn.textContent = local.length ? `MIGRAR ${local.length} REGISTRO(S) LOCAL(IS)` : 'MIGRAR REGISTRO LOCAL';
  }

  async function migrateLocal() {
    if (!currentUser || !client) return openAdminModal();
    const local = getLocalMembers();
    if (!local.length) return toast('Nenhum registro local encontrado neste navegador.');

    const ok = confirm(`Enviar ${local.length} registro(s) que estavam salvos apenas neste navegador para o registro compartilhado?`);
    if (!ok) return;

    const payload = local.map(m => ({
      name: String(m.name || '').trim(),
      order_name: m.order || 'Não definida',
      rank_name: m.rank || 'Iniciado',
      status: ['ativo','espera','saiu'].includes(m.status) ? m.status : 'espera',
      entry_date: m.entryDate || null,
      exit_date: m.exitDate || null,
      notes: m.notes || ''
    })).filter(m => m.name);

    try {
      const { error } = await client.from('velaminis_members').insert(payload);
      if (error) throw error;
      await addLog('MIGRAÇÃO', 'Registro local', `${payload.length} registros movidos para o banco central`);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.removeItem('velaminis_member_registry_log_v1');
      updateMigrationButton();
      await fetchRegistry({ silent: true });
      toast('Registros locais migrados para todos.');
    } catch (error) {
      console.error(error);
      toast('A migração não pôde ser concluída.');
    }
  }

  function setupRealtime() {
    if (!client) return;
    if (channel) client.removeChannel(channel);

    channel = client
      .channel('velaminis-registry-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'velaminis_members' }, () => fetchRegistry({ silent: true }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'velaminis_member_logs' }, () => fetchRegistry({ silent: true }))
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          setSyncState('online', 'REGISTRO CENTRAL SINCRONIZADO', currentUser ? `admin: ${currentUser.email}` : 'modo de consulta pública');
        }
      });
  }

  function showSetupMode() {
    setSyncState('setup', 'BANCO COMPARTILHADO AINDA NÃO CONFIGURADO', 'preencha membros-config.js e rode supabase-setup.sql');
    members = getLocalMembers();
    logs = [];
    render();
    document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    $('adminLoginBtn').classList.add('hidden');
    $('adminLogoutBtn').classList.add('hidden');
  }

  async function init() {
    if (!isConfigured()) {
      showSetupMode();
      return;
    }

    if (!window.supabase?.createClient) {
      setSyncState('error', 'BIBLIOTECA DO SUPABASE NÃO CARREGOU', 'recarregue a página; se persistir, verifique bloqueadores ou a conexão');
      members = getLocalMembers();
      logs = [];
      render();
      document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
      $('adminLoginBtn').classList.add('hidden');
      $('adminLogoutBtn').classList.add('hidden');
      return;
    }

    const cfg = window.VELAMINIS_SUPABASE;
    client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    const { data } = await client.auth.getSession();
    setAdminUI(data.session?.user || null);

    client.auth.onAuthStateChange((_event, session) => {
      setAdminUI(session?.user || null);
    });

    await fetchRegistry();
    setupRealtime();
  }

  form.addEventListener('submit', saveMember);
  adminForm.addEventListener('submit', loginAdmin);
  deleteBtn.addEventListener('click', deleteMember);

  rows.addEventListener('click', event => {
    const btn = event.target.closest('[data-edit]');
    if (!btn) return;
    const member = members.find(m => m.id === btn.dataset.edit);
    if (member) openModal(member);
  });

  $('openFormBtn').addEventListener('click', () => openModal());
  $('emptyAddBtn').addEventListener('click', () => openModal());
  $('adminLoginBtn').addEventListener('click', openAdminModal);
  $('adminLogoutBtn').addEventListener('click', logoutAdmin);
  $('exportBtn').addEventListener('click', exportRegistry);
  $('migrateLocalBtn').addEventListener('click', migrateLocal);
  importInput.addEventListener('change', importRegistry);

  document.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', closeModal));
  document.querySelectorAll('[data-close-admin]').forEach(el => el.addEventListener('click', closeAdminModal));
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (modal.classList.contains('open')) closeModal();
    if (adminModal.classList.contains('open')) closeAdminModal();
  });

  searchInput.addEventListener('input', renderRows);
  statusFilter.addEventListener('change', renderRows);
  $('statusInput').addEventListener('change', () => {
    if ($('statusInput').value !== 'saiu') $('exitDateInput').value = '';
  });

  init();
})();
