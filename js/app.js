(() => {
  'use strict';
  const db = window.portfolioDb;
  const safeText = (node, value) => { node.textContent = typeof value === 'string' ? value : ''; };
  const el = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) safeText(node, value);
    return node;
  };
  const siteError = (target, message) => {
    if (!target) return;
    target.replaceChildren(el('p', 'error-state', message));
  };
  const missingTechnologiesColumn = error => error?.code === 'PGRST204'
    && /'technologies'.*column.*'projects'|column.*'technologies'.*'projects'/i.test(error.message || '');
  document.querySelectorAll('[data-year]').forEach(node => safeText(node, String(new Date().getFullYear())));

  async function loadProjects() {
    const grid = document.getElementById('project-grid');
    if (!grid) return;
    if (!db) return siteError(grid, window.portfolioDbError || 'Projects are temporarily unavailable.');
    let { data, error } = await db.from('projects').select('id,title,description,repo_url,technologies,created_at').order('created_at', { ascending: false });
    if (missingTechnologiesColumn(error)) {
      ({ data, error } = await db.from('projects').select('id,title,description,repo_url,created_at').order('created_at', { ascending: false }));
    }
    if (error) return siteError(grid, 'Projects could not be loaded. Please try again later.');
    if (!data?.length) return siteError(grid, 'No projects have been published yet.');
    const cards = data.map(project => {
      const article = el('article', 'project-card');
      const row = el('div', 'project-title-row');
      row.append(el('h2', '', project.title));
      const url = safeHttpUrl(project.repo_url);
      if (url) {
        const link = el('a', 'project-link', 'View repository ↗');
        link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        row.append(link);
      }
      article.append(row, el('p', '', project.description));
      if (Array.isArray(project.technologies) && project.technologies.length) {
        const tags = el('div', 'tag-row');
        project.technologies.slice(0, 12).forEach(label => tags.append(el('span', 'tag', label)));
        article.append(tags);
      }
      return article;
    });
    grid.replaceChildren(...cards);
  }
  function safeHttpUrl(value) {
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; }
    catch { return ''; }
  }
  async function loadWriteups() {
    const grid = document.getElementById('writeup-grid');
    if (!grid) return;
    if (!db) return siteError(grid, window.portfolioDbError || 'Write-ups are temporarily unavailable.');
    const { data, error } = await db.from('writeups').select('id,title,summary,tags,created_at').order('created_at', { ascending: false });
    if (error) return siteError(grid, 'Write-ups could not be loaded. Please try again later.');
    if (!data?.length) return siteError(grid, 'No write-ups have been published yet.');
    grid.replaceChildren(...data.map(item => {
      const card = el('article', 'writeup-card');
      const date = item.created_at ? new Date(item.created_at) : null;
      card.append(el('time', 'writeup-date', date && !Number.isNaN(date.valueOf()) ? date.toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Research note'));
      card.append(el('h2', '', item.title), el('p', '', item.summary || 'Read the full research note.'));
      const tags = Array.isArray(item.tags) ? item.tags : [];
      if (tags.length) {
        const tagRow = el('div', 'tag-row');
        tags.forEach(tag => tagRow.append(el('span', 'tag', `#${String(tag).replace(/^#/, '')}`)));
        card.append(tagRow);
      }
      const link = el('a', 'read-link', 'Read write-up →');
      link.href = `article.html?id=${encodeURIComponent(String(item.id))}`;
      card.append(link);
      return card;
    }));
  }
  async function loadArticle() {
    const target = document.getElementById('article');
    if (!target) return;
    const id = new URLSearchParams(location.search).get('id');
    if (!id || id.length > 128) return siteError(target, 'This article link is invalid.');
    if (!db) return siteError(target, window.portfolioDbError || 'This article is temporarily unavailable.');
    const { data, error } = await db.from('writeups').select('title,summary,tags,content,created_at').eq('id', id).maybeSingle();
    if (error || !data) return siteError(target, 'This article could not be found.');
    document.title = `${data.title} — Pemos`;
    if (!window.marked?.parse || !window.DOMPurify?.sanitize) return siteError(target, 'The article reader could not be loaded. Refresh and try again.');
    const articleTitle = el('h1', '', data.title);
    const date = data.created_at ? new Date(data.created_at) : null;
    const meta = el('p', 'writeup-date', date && !Number.isNaN(date.valueOf()) ? date.toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Research note');
    const body = el('div', 'article-markdown');
    const parsed = window.marked.parse(typeof data.content === 'string' ? data.content : '', { gfm: true, breaks: false });
    const parsedDocument = document.createElement('template');
    parsedDocument.innerHTML = parsed;
    const calloutTypes = {
      note: ['note', 'Note'], info: ['info', 'Info'],
      abstract: ['summary', 'Abstract'], summary: ['summary', 'Summary'], tldr: ['summary', 'TL;DR'],
      todo: ['todo', 'To-do'], success: ['success', 'Success'], check: ['success', 'Check'], done: ['success', 'Done'],
      caution: ['caution', 'Caution'], attention: ['caution', 'Attention'],
      failure: ['failure', 'Failure'], fail: ['failure', 'Fail'], missing: ['failure', 'Missing'],
      danger: ['danger', 'Danger'], error: ['danger', 'Error'], bug: ['bug', 'Bug'],
      quote: ['quote', 'Quote'], cite: ['quote', 'Cite']
    };
    parsedDocument.content.querySelectorAll('blockquote').forEach(quote => {
      const firstParagraph = quote.querySelector(':scope > p');
      if (!firstParagraph) return;
      const paragraphText = firstParagraph.textContent;
      const markerPattern = /\[!([a-z][\w-]*)\]([+-])?/i;
      const marker = markerPattern.exec(paragraphText);
      const type = marker && calloutTypes[marker[1].toLowerCase()];
      if (!type) return;
      const precedingText = paragraphText.slice(0, marker.index).trim();
      const afterMarker = paragraphText.slice(marker.index + marker[0].length);
      const titleMatch = /^[ \t]+([^\r\n]+)(?:\r?\n|$)/.exec(afterMarker);
      const bodyAfterMarker = (titleMatch ? afterMarker.slice(titleMatch[0].length) : afterMarker).trim();
      const callout = document.createElement('aside');
      callout.className = `callout-note callout-${type[0]}`;
      callout.setAttribute('role', 'note');
      const label = document.createElement('strong');
      label.className = 'callout-title';
      label.textContent = titleMatch?.[1].trim() || type[1];
      firstParagraph.remove();
      [precedingText, bodyAfterMarker].filter(Boolean).reverse().forEach(text => {
        const bodyParagraph = document.createElement('p');
        bodyParagraph.textContent = text;
        quote.insertBefore(bodyParagraph, quote.firstChild);
      });
      callout.append(label, ...Array.from(quote.childNodes));
      quote.replaceWith(callout);
    });
    const safeHtml = window.DOMPurify.sanitize(parsedDocument.innerHTML, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'button', 'object', 'embed', 'svg', 'math'],
      FORBID_ATTR: ['style']
    });
    body.innerHTML = safeHtml;
    body.querySelectorAll('a[href]').forEach(anchor => {
      const url = safeHttpUrl(anchor.getAttribute('href'));
      if (url) { anchor.href = url; anchor.rel = 'noopener noreferrer'; }
      else if (!anchor.getAttribute('href').startsWith('#')) anchor.removeAttribute('href');
    });
    body.querySelectorAll('pre code').forEach(block => window.hljs?.highlightElement(block));
    const tags = Array.isArray(data.tags) ? data.tags : [];
    const tagRow = el('div', 'tag-row');
    tags.forEach(tag => tagRow.append(el('span', 'tag', `#${String(tag).replace(/^#/, '')}`)));
    target.replaceChildren(articleTitle, meta, ...(tags.length ? [tagRow] : []), body);
  }

  function inputField(form, label, name, type = 'text', required = true) {
    const wrap = el('label', 'admin-field', label);
    const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
    input.name = name;
    if (type !== 'textarea') input.type = type;
    if (required) input.required = true;
    wrap.append(input); form.append(wrap); return input;
  }
  function statusNode(panel, message, error = false) {
    const status = panel.querySelector('.admin-status');
    status.textContent = message;
    status.classList.toggle('error', error);
  }
  function openAdmin() {
    if (document.querySelector('.admin-overlay')) return;
    const overlay = el('div', 'admin-overlay');
    overlay.setAttribute('role', 'presentation');
    const panel = el('section', 'admin-panel');
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'admin-title');
    const close = el('button', 'admin-close', 'Close'); close.type = 'button';
    close.addEventListener('click', () => { overlay.remove(); if (location.hash === '#pemos_admin') history.replaceState(null, '', location.pathname + location.search); });
    panel.append(close);
    const title = el('h2', '', 'Owner portal'); title.id = 'admin-title'; panel.append(title);
    panel.append(el('p', '', 'Sign in with the owner account to publish research and projects. Publishing access is enforced by Supabase policies.'));
    const login = document.createElement('form'); login.className = 'admin-form';
    inputField(login, 'Owner email', 'email', 'email'); inputField(login, 'Password', 'password', 'password');
    const actions = el('div', 'admin-actions'); const submit = el('button', '', 'Sign in'); submit.type = 'submit';
    const cancel = el('button', '', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', () => close.click());
    actions.append(submit, cancel); login.append(actions); panel.append(login);
    const status = el('p', 'admin-status', ''); panel.append(status);
    overlay.addEventListener('click', event => { if (event.target === overlay) close.click(); });
    document.addEventListener('keydown', function esc(event) { if (event.key === 'Escape' && document.body.contains(overlay)) { close.click(); document.removeEventListener('keydown', esc); } });
    login.addEventListener('submit', async event => {
      event.preventDefault();
      if (!db) return statusNode(panel, window.portfolioDbError || 'Database unavailable.', true);
      submit.disabled = true; statusNode(panel, 'Signing in…');
      const { error } = await db.auth.signInWithPassword({ email: login.elements.email.value.trim(), password: login.elements.password.value });
      submit.disabled = false;
      if (error) return statusNode(panel, `Sign-in failed: ${error.message || 'Check your email and password, then try again.'}`, true);
      renderDashboard(panel);
    });
    overlay.append(panel);
    document.body.append(overlay); login.elements.email.focus();
  }
  async function renderDashboard(panel) {
    const { data: { user } = {}, error } = await db.auth.getUser();
    if (error || !user) return statusNode(panel, 'Your session could not be verified. Sign in again.', true);
    panel.querySelector('form').remove();
    statusNode(panel, `Signed in as ${user.email || 'owner'}.`);
    panel.append(el('p', 'admin-hint', 'Writes are checked by Supabase row-level security. Configure the policies in README.md before publishing.'));
    const writeupForm = document.createElement('form'); writeupForm.className = 'admin-form';
    writeupForm.append(el('h3', '', 'Publish a write-up'));
    inputField(writeupForm, 'Title', 'title'); inputField(writeupForm, 'Tags (comma-separated)', 'tags'); inputField(writeupForm, 'Short summary', 'summary', 'textarea');
    const content = inputField(writeupForm, 'Markdown content', 'content', 'textarea'); content.required = false; content.placeholder = 'Write Markdown or select a .md file below.';
    const fileWrap = el('label', 'file-label', 'Upload Markdown (.md)');
    const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = '.md'; fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0]; if (!file) return;
      if (file.size > 1024 * 1024) { statusNode(panel, 'Markdown files must be under 1 MB.', true); fileInput.value = ''; return; }
      content.value = await file.text();
    }); fileWrap.append(fileInput); writeupForm.append(fileWrap);
    const publishButton = el('button', '', 'Publish write-up'); publishButton.type = 'submit'; writeupForm.append(publishButton);
    const projectForm = document.createElement('form'); projectForm.className = 'admin-form';
    projectForm.append(el('h3', '', 'Add a GitHub project'));
    inputField(projectForm, 'Project title', 'project_title'); inputField(projectForm, 'Description', 'description', 'textarea'); inputField(projectForm, 'GitHub repository URL', 'repo_url', 'url'); inputField(projectForm, 'Technologies (comma-separated)', 'technologies', 'text', false);
    const projectButton = el('button', '', 'Add project'); projectButton.type = 'submit'; projectForm.append(projectButton);
    writeupForm.addEventListener('submit', async event => {
      event.preventDefault(); publishButton.disabled = true;
      const values = new FormData(writeupForm);
      const tags = String(values.get('tags') || '').split(',').map(tag => tag.trim().replace(/^#/, '').toLowerCase()).filter(Boolean).slice(0, 12);
      if (!tags.length) { publishButton.disabled = false; return statusNode(panel, 'Add at least one tag.', true); }
      const contentText = String(values.get('content') || '');
      if (!contentText.trim()) { publishButton.disabled = false; return statusNode(panel, 'Add Markdown content or upload a .md file.', true); }
      const { error: insertError } = await db.from('writeups').insert({ title: String(values.get('title')).trim(), tags, summary: String(values.get('summary')).trim(), content: contentText });
      publishButton.disabled = false;
      if (insertError) return statusNode(panel, 'Could not publish. Check the writeups table and owner INSERT policy.', true);
      writeupForm.reset(); statusNode(panel, 'Write-up published.');
    });
    projectForm.addEventListener('submit', async event => {
      event.preventDefault();
      const values = new FormData(projectForm); const url = safeHttpUrl(String(values.get('repo_url')));
      if (!url || !(new URL(url).hostname.toLowerCase() === 'github.com' || new URL(url).hostname.toLowerCase().endsWith('.github.com'))) return statusNode(panel, 'Enter a valid github.com repository URL.', true);
      projectButton.disabled = true;
      const technologies = String(values.get('technologies') || '').split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 12);
      const project = { title: String(values.get('project_title')).trim(), description: String(values.get('description')).trim(), repo_url: url, technologies };
      let { error: insertError } = await db.from('projects').insert(project);
      let savedWithoutTechnologies = false;
      if (missingTechnologiesColumn(insertError)) {
        const { technologies: ignored, ...projectWithoutTechnologies } = project;
        ({ error: insertError } = await db.from('projects').insert(projectWithoutTechnologies));
        savedWithoutTechnologies = !insertError;
      }
      projectButton.disabled = false;
      if (insertError) return statusNode(panel, `Could not add project: ${insertError.message || 'Check the projects table and owner INSERT policy.'}`, true);
      projectForm.reset(); statusNode(panel, savedWithoutTechnologies ? 'Project added without technologies. Add the technologies column in Supabase to save them.' : 'Project added.');
    });
    const logout = el('button', 'admin-close', 'Sign out'); logout.type = 'button'; logout.style.float = 'none'; logout.addEventListener('click', async () => { await db.auth.signOut(); panel.replaceChildren(el('h2', '', 'Signed out'), el('p', '', 'Close this window to continue.')); });
    panel.append(writeupForm); const divider = document.createElement('hr'); divider.className = 'admin-divider'; panel.append(divider, projectForm, logout);
  }
  function initAdmin() {
    const keyHandler = event => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') { event.preventDefault(); openAdmin(); }
    };
    document.addEventListener('keydown', keyHandler);
    window.addEventListener('hashchange', () => {
      if (location.hash === '#pemos_admin') openAdmin();
    });
    if (location.hash === '#pemos_admin') openAdmin();
  }
  loadProjects(); loadWriteups(); loadArticle(); initAdmin();
})();
