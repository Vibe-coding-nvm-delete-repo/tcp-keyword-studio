/* Standalone TCP Keyword Studio — 100% isolated to thecreditpeople.com */
(function () {
  const DATA = window.TCP_STUDIO_DATA || { categories: [], items: [] };
  const STORAGE_KEY = 'tcp_keyword_studio_decisions_v1';
  const VIEW_KEY = 'tcp_keyword_studio_view_v1';

  const BUCKET_LABELS = {
    new_page: 'New page',
    add_to_existing: 'Add to existing',
    already_covered: 'Already covered',
    merged_duplicate: 'Merged dup',
    not_kept: 'Not kept',
  };

  let decisions = loadJson(STORAGE_KEY, {});
  let view = Object.assign(
    {
      nav: 'sheet',
      category: 'all',
      bucket: 'new_page',
      minScore: '',
      decision: '',
      search: '',
      colFilters: { pageType: '', intent: '', overlapRisk: '', qaFlag: '' },
      sortKey: 'score',
      sortDir: 'desc',
      page: 1,
      pageSize: 100,
      cols: { pageType: true, intent: true, raters: true, overlap: true, counts: true, qa: true },
    },
    loadJson(VIEW_KEY, {})
  );

  const selected = new Set();
  const expanded = new Set();

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function saveState() {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
    } catch { /* ignore */ }
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function getDecision(uid) {
    return decisions[uid]?.status || 'pending';
  }
  function setDecision(uid, status) {
    decisions[uid] = { status, updatedAt: new Date().toISOString() };
    saveState();
    renderAll();
  }

  function categoryItems() {
    if (view.category === 'all') return DATA.items;
    return DATA.items.filter((it) => it.categoryId === view.category);
  }

  function filteredItems() {
    let rows = categoryItems();
    if (view.nav === 'approved') {
      rows = rows.filter((it) => getDecision(it.uid) === 'approved');
    } else if (view.bucket !== 'all') {
      rows = rows.filter((it) => it.bucket === view.bucket);
    }

    if (view.minScore !== '') {
      const min = Number(view.minScore);
      rows = rows.filter((it) => it.score !== null && it.score >= min);
    }
    if (view.decision) {
      rows = rows.filter((it) => getDecision(it.uid) === view.decision);
    }
    if (view.search.trim()) {
      const q = view.search.trim().toLowerCase();
      rows = rows.filter((it) =>
        [it.title, it.keyword, it.pageType, it.intent, it.cta, it.matchingUrl, it.qaFlag, it.qaNote, it.id]
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    for (const [k, v] of Object.entries(view.colFilters || {})) {
      if (v) rows = rows.filter((it) => String(it[k] || '').toLowerCase() === v.toLowerCase());
    }

    const dir = view.sortDir === 'asc' ? 1 : -1;
    const key = view.sortKey;
    rows = rows.slice().sort((a, b) => {
      if (key === 'score') {
        const av = a.score == null ? -1 : a.score;
        const bv = b.score == null ? -1 : b.score;
        return (av - bv) * dir || (b.searchCount - a.searchCount);
      }
      if (key === 'searchCount' || key === 'questionCount') {
        return ((a[key] || 0) - (b[key] || 0)) * dir;
      }
      if (key === 'priority') {
        const ord = { P0: 0, P1: 1, P2: 2, P3: 3 };
        return ((ord[a.priority] ?? 9) - (ord[b.priority] ?? 9)) * dir;
      }
      return String(a[key] || '').localeCompare(String(b[key] || '')) * dir;
    });
    return rows;
  }

  function renderSidebarMeta() {
    const el = document.getElementById('sidebar-meta');
    const mined = DATA.categories.filter((c) => c.status === 'mined').length;
    el.textContent = `${DATA.items.length.toLocaleString()} ideas · ${mined}/${DATA.categories.length} categories mined · ${DATA.generatedAt || ''}`;
  }

  function renderCategoryTabs() {
    const host = document.getElementById('ks-category-tabs');
    const tabs = [
      { id: 'dashboard', label: 'Dashboard', count: null, isDash: true },
      { id: 'all', label: 'All Categories', count: DATA.items.length },
      ...DATA.categories.map((c) => ({
        id: c.id,
        label: c.name,
        count: c.counts.total,
        status: c.status,
      })),
    ];

    host.innerHTML = tabs
      .map((t) => {
        const active = (t.isDash && view.nav === 'dashboard') || (!t.isDash && view.nav !== 'dashboard' && view.category === t.id);
        const badge = t.status === 'queued'
          ? `<span class="tab-queued">Queued</span>`
          : t.count !== null
          ? `<span class="tab-cnt">${t.count.toLocaleString()}</span>`
          : '';
        return `<button class="ks-tab-btn ${active ? 'active' : ''}" role="tab" aria-selected="${active}" data-tab="${esc(t.id)}">${esc(t.label)} ${badge}</button>`;
      })
      .join('');

    host.querySelectorAll('.ks-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.tab;
        if (id === 'dashboard') {
          setNav('dashboard');
        } else {
          view.category = id;
          view.page = 1;
          if (view.nav !== 'sheet' && view.nav !== 'approved') view.nav = 'sheet';
          saveState();
          renderAll();
        }
      });
    });
  }

  function renderStats() {
    const rows = categoryItems();
    const newCnt = rows.filter((r) => r.bucket === 'new_page').length;
    const addCnt = rows.filter((r) => r.bucket === 'add_to_existing').length;
    const covCnt = rows.filter((r) => r.bucket === 'already_covered').length;
    const highCnt = rows.filter((r) => r.bucket === 'new_page' && r.score !== null && r.score >= 8).length;
    const appCnt = rows.filter((r) => getDecision(r.uid) === 'approved').length;
    const scores = rows.filter((r) => r.score !== null).map((r) => r.score);
    const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';

    document.getElementById('ks-stats').innerHTML = `
      <div class="ks-stat"><span>Total</span><strong>${rows.length.toLocaleString()}</strong></div>
      <div class="ks-stat"><span>New Pages</span><strong>${newCnt.toLocaleString()}</strong></div>
      <div class="ks-stat"><span>Add to Existing</span><strong>${addCnt.toLocaleString()}</strong></div>
      <div class="ks-stat"><span>Already Covered</span><strong>${covCnt.toLocaleString()}</strong></div>
      <div class="ks-stat"><span>Score 8+ New</span><strong>${highCnt.toLocaleString()}</strong></div>
      <div class="ks-stat"><span>Avg Score</span><strong>${avg}</strong></div>
      <div class="ks-stat"><span>Approved</span><strong>${appCnt.toLocaleString()}</strong></div>
    `;
  }

  function renderHead() {
    const c = view.cols;
    const arrow = (k) => (view.sortKey === k ? (view.sortDir === 'asc' ? ' ▴' : ' ▾') : '');
    document.getElementById('ks-head-row').innerHTML = `
      <th style="width:32px"><input type="checkbox" id="chk-all" aria-label="Select visible rows"></th>
      <th class="ks-col-keyword" data-sort="title">Page Title &amp; Main Search${arrow('title')}</th>
      <th data-sort="bucket">Action${arrow('bucket')}</th>
      <th data-sort="priority">Prio${arrow('priority')}</th>
      <th data-sort="score">Score${arrow('score')}</th>
      ${c.raters ? '<th>Raters</th>' : ''}
      ${c.pageType ? `<th data-sort="pageType">Page Type${arrow('pageType')}</th>` : ''}
      ${c.intent ? `<th data-sort="intent">Reader Intent${arrow('intent')}</th>` : ''}
      ${c.overlap ? `<th data-sort="overlapRisk">Overlap Risk${arrow('overlapRisk')}</th>` : ''}
      ${c.counts ? `<th data-sort="searchCount">Searches / FAQs${arrow('searchCount')}</th>` : ''}
      ${c.qa ? '<th>QA</th>' : ''}
      <th>Decision</th>
    `;

    const uniq = (field) => [...new Set(categoryItems().map((r) => r[field]).filter(Boolean))].sort();
    const selHtml = (field, opts) => `
      <select class="ks-select" data-col-filter="${field}" style="width:100%;min-width:95px;padding:3px 6px;min-height:24px;font-size:11px">
        <option value="">All</option>
        ${opts.map((o) => `<option value="${esc(o)}" ${view.colFilters[field] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
      </select>`;

    document.getElementById('ks-filter-row').innerHTML = `
      <th></th>
      <th class="ks-col-keyword"><span style="font-size:11px;color:#64748b;font-weight:500">Click + on any row to inspect overlap, searches, FAQs &amp; SERPs</span></th>
      <th></th>
      <th></th>
      <th></th>
      ${c.raters ? '<th></th>' : ''}
      ${c.pageType ? `<th>${selHtml('pageType', uniq('pageType'))}</th>` : ''}
      ${c.intent ? `<th>${selHtml('intent', uniq('intent'))}</th>` : ''}
      ${c.overlap ? `<th>${selHtml('overlapRisk', uniq('overlapRisk'))}</th>` : ''}
      ${c.counts ? '<th></th>' : ''}
      ${c.qa ? `<th>${selHtml('qaFlag', uniq('qaFlag'))}</th>` : ''}
      <th></th>
    `;

    document.querySelectorAll('#ks-head-row th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const k = th.dataset.sort;
        if (view.sortKey === k) view.sortDir = view.sortDir === 'asc' ? 'desc' : 'asc';
        else { view.sortKey = k; view.sortDir = k === 'score' || k === 'searchCount' ? 'desc' : 'asc'; }
        saveState();
        renderSheet();
      });
    });

    document.querySelectorAll('[data-col-filter]').forEach((el) => {
      el.addEventListener('change', () => {
        view.colFilters[el.dataset.colFilter] = el.value;
        view.page = 1;
        saveState();
        renderSheet();
      });
    });

    const chkAll = document.getElementById('chk-all');
    if (chkAll) {
      chkAll.addEventListener('change', () => {
        document.querySelectorAll('.row-chk').forEach((box) => {
          box.checked = chkAll.checked;
          if (chkAll.checked) selected.add(box.dataset.uid);
          else selected.delete(box.dataset.uid);
        });
        updateApproveBtn();
      });
    }
  }

  function updateApproveBtn() {
    const btn = document.getElementById('btn-approve-selected');
    btn.disabled = selected.size === 0;
    btn.textContent = `Approve selected (${selected.size})`;
  }

  function scoreClass(s) {
    if (s == null) return 'score-lo';
    if (s >= 8) return 'score-hi';
    if (s >= 6) return 'score-mid';
    return 'score-lo';
  }

  function renderDetailRow(it, colSpan) {
    const dec = getDecision(it.uid);
    const tcpLink = it.matchingUrl
      ? `<a href="https://www.thecreditpeople.com${it.matchingUrl.startsWith('/') ? '' : '/'}${esc(it.matchingUrl)}" target="_blank" rel="noopener">${esc(it.matchingUrl)}</a>`
      : '<span class="muted">None (net-new topic)</span>';

    return `
      <tr class="ks-detail-row">
        <td colspan="${colSpan}">
          <div class="ks-detail">
            <div class="ks-detail-card">
              <h4>Conversion &amp; Reader Intent</h4>
              <p><strong>CTA:</strong> ${esc(it.cta || '—')}</p>
              <p><strong>Rater reasoning:</strong> ${esc(it.raterWhy || '—')}</p>
              ${it.urlSlug ? `<h4 style="margin-top:8px">SEO Metadata</h4><p><strong>URL slug:</strong> <code>${esc(it.urlSlug)}</code></p><p><strong>Meta title (${it.metaTitle ? it.metaTitle.length : 0}c):</strong> ${esc(it.metaTitle || '—')}</p><p><strong>Meta desc (${it.metaDescription ? it.metaDescription.length : 0}c):</strong> ${esc(it.metaDescription || '—')}</p>` : ''}
              ${it.qaNote ? `<p><strong>QA note:</strong> ${esc(it.qaNote)}</p>` : ''}
              <div class="ks-detail-actions">
                <button class="button btn-sm ${dec === 'approved' ? 'primary' : ''}" data-act="approve" data-uid="${esc(it.uid)}">${dec === 'approved' ? '✓ Approved' : 'Approve'}</button>
                <button class="button btn-sm" data-act="defer" data-uid="${esc(it.uid)}">Defer</button>
                <button class="button btn-sm" data-act="pending" data-uid="${esc(it.uid)}">Reset</button>
              </div>
            </div>
            <div class="ks-detail-card">
              <h4>Live TCP Overlap &amp; Structure</h4>
              <p><strong>Matching TCP page:</strong> ${tcpLink}</p>
              ${it.headingToAdd ? `<p><strong>Heading to add:</strong> ${esc(it.headingToAdd)}</p>` : ''}
              <p><strong>Judge (${esc(it.judgeConfidence || 'n/a')}):</strong> ${esc(it.judgeWhy || it.plannerWhy || '—')}</p>
              ${it.nearestPages.length ? `<h4>Nearest live TCP pages</h4><ul>${it.nearestPages.map((p) => `<li><a href="${esc(p)}" target="_blank" rel="noopener">${esc(p.replace(/^https?:\/\/(www\.)?thecreditpeople\.com/i, ''))}</a></li>`).join('')}</ul>` : ''}
            </div>
            <div class="ks-detail-card">
              <h4>Grouped Searches (${it.searchCount})</h4>
              ${it.allSearches.length ? `<ul>${it.allSearches.slice(0, 12).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : '<p class="muted">No additional searches recorded.</p>'}
              ${it.mergedDupes.length ? `<h4 style="margin-top:8px">Also covers (merged duplicates)</h4><ul>${it.mergedDupes.slice(0, 8).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
            </div>
            <div class="ks-detail-card">
              <h4>Questions to Answer (${it.questionCount})</h4>
              ${it.questions.length ? `<ul>${it.questions.slice(0, 10).map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : '<p class="muted">No FAQ questions listed.</p>'}
              ${it.topUrls.length ? `<h4 style="margin-top:8px">Top Ranking SERP Pages</h4><ul>${it.topUrls.slice(0, 5).map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a></li>`).join('')}</ul>` : ''}
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  function renderSheet() {
    renderHead();
    const rows = filteredItems();
    const totalPages = Math.max(1, Math.ceil(rows.length / view.pageSize));
    if (view.page > totalPages) view.page = totalPages;
    const start = (view.page - 1) * view.pageSize;
    const slice = rows.slice(start, start + view.pageSize);

    document.getElementById('ks-range-info').textContent = rows.length
      ? `Showing ${start + 1}–${Math.min(start + slice.length, rows.length)} of ${rows.length.toLocaleString()}`
      : '0 matching rows';
    document.getElementById('ks-page-info').textContent = `Page ${view.page} of ${totalPages}`;
    document.getElementById('btn-prev').disabled = view.page <= 1;
    document.getElementById('btn-next').disabled = view.page >= totalPages;

    const c = view.cols;
    const colSpan = 6 + (c.raters ? 1 : 0) + (c.pageType ? 1 : 0) + (c.intent ? 1 : 0) + (c.overlap ? 1 : 0) + (c.counts ? 1 : 0) + (c.qa ? 1 : 0);

    const tbody = document.getElementById('ks-table-body');
    if (!slice.length) {
      const cat = DATA.categories.find((x) => x.id === view.category);
      const msg = cat && cat.status === 'queued'
        ? `<strong>${esc(cat.name)}</strong> is queued for topic-miner discovery. Run <code>miner.mjs</code> for <code>${esc(cat.topic)}</code> and re-run <code>scripts/import_tcp_runs.py</code> to populate this tab.`
        : 'No keyword candidates match your current filters.';
      tbody.innerHTML = `<tr><td colspan="${colSpan}" class="ks-empty">${msg}</td></tr>`;
      return;
    }

    tbody.innerHTML = slice
      .map((it) => {
        const isExp = expanded.has(it.uid);
        const dec = getDecision(it.uid);
        const riskKey = (it.overlapRisk || 'none').toLowerCase().split(/\s+/)[0];
        const ratersTxt = it.raterA != null || it.raterB != null ? `${it.raterA ?? '—'} / ${it.raterB ?? '—'}` : '—';
        const mainRow = `
          <tr class="ks-row">
            <td><input type="checkbox" class="row-chk" data-uid="${esc(it.uid)}" ${selected.has(it.uid) ? 'checked' : ''} aria-label="Select ${esc(it.title)}"></td>
            <td class="ks-col-keyword">
              <div class="ks-keyword-cell">
                <button class="ks-expand" data-expand="${esc(it.uid)}" aria-expanded="${isExp}" title="Toggle details">${isExp ? '−' : '+'}</button>
                <div class="ks-keyword-text">
                  <strong>${esc(it.title)}</strong>
                  <small>${esc(it.keyword)} · <span>${esc(it.id)}</span></small>
                </div>
              </div>
            </td>
            <td><span class="ks-bucket ks-bucket-${esc(it.bucket)}">${esc(BUCKET_LABELS[it.bucket] || it.bucket)}</span></td>
            <td class="ks-num"><span class="ks-prio ks-prio-${esc(it.priority)}">${esc(it.priority)}</span></td>
            <td class="ks-num"><span class="score-pill ${scoreClass(it.score)}">${it.score != null ? it.score : '—'}</span></td>
            ${c.raters ? `<td class="ks-num">${esc(ratersTxt)}</td>` : ''}
            ${c.pageType ? `<td><span class="ks-badge">${esc(it.pageType)}</span></td>` : ''}
            ${c.intent ? `<td class="ks-clip" title="${esc(it.intent)}">${esc(it.intent || '—')}</td>` : ''}
            ${c.overlap ? `<td><span class="ks-risk ks-risk-${esc(riskKey)}">${esc(it.overlapRisk || '—')}</span></td>` : ''}
            ${c.counts ? `<td class="ks-num">${it.searchCount} / ${it.questionCount}</td>` : ''}
            ${c.qa ? `<td>${it.qaFlag ? `<span class="ks-badge">${esc(it.qaFlag)}</span>` : '<span class="muted">—</span>'}</td>` : ''}
            <td><span class="ks-decision ks-decision-${dec}">${dec}</span></td>
          </tr>`;
        return mainRow + (isExp ? renderDetailRow(it, colSpan) : '');
      })
      .join('');

    tbody.querySelectorAll('[data-expand]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const uid = btn.dataset.expand;
        if (expanded.has(uid)) expanded.delete(uid);
        else expanded.add(uid);
        renderSheet();
      });
    });

    tbody.querySelectorAll('.row-chk').forEach((box) => {
      box.addEventListener('change', () => {
        if (box.checked) selected.add(box.dataset.uid);
        else selected.delete(box.dataset.uid);
        updateApproveBtn();
      });
    });

    tbody.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        setDecision(btn.dataset.uid, act === 'approve' ? 'approved' : act === 'defer' ? 'deferred' : 'pending');
      });
    });
  }

  function renderDashboard() {
    const items = DATA.items;
    const total = items.length || 1;
    const buckets = [
      { key: 'new_page', label: 'New page ideas', count: items.filter((i) => i.bucket === 'new_page').length },
      { key: 'add_to_existing', label: 'Add to existing', count: items.filter((i) => i.bucket === 'add_to_existing').length },
      { key: 'already_covered', label: 'Already covered', count: items.filter((i) => i.bucket === 'already_covered').length },
      { key: 'merged_duplicate', label: 'Merged duplicates', count: items.filter((i) => i.bucket === 'merged_duplicate').length },
      { key: 'not_kept', label: 'Not kept', count: items.filter((i) => i.bucket === 'not_kept').length },
    ];
    const approvedCnt = items.filter((i) => getDecision(i.uid) === 'approved').length;
    const p0Cnt = items.filter((i) => i.priority === 'P0').length;
    const p1Cnt = items.filter((i) => i.priority === 'P1').length;

    // Matrix: Page Type x Reader Intent (for New page ideas)
    const newItems = items.filter((i) => i.bucket === 'new_page');
    const types = [...new Set(newItems.map((i) => i.pageType).filter(Boolean))].sort();
    const intents = [...new Set(newItems.map((i) => i.intent).filter(Boolean))].sort();
    const matrixCounts = {};
    for (const it of newItems) {
      const k = `${it.pageType}||${it.intent}`;
      matrixCounts[k] = (matrixCounts[k] || 0) + 1;
    }

    document.getElementById('view-dashboard').innerHTML = `
      <div class="ks-dash-body">
        <div class="ks-dash-grid">
          <div class="ks-dash-card">
            <h3>TCP Pipeline Overview</h3>
            <div class="ks-dash-kpis">
              <div><span>Mined Ideas</span><strong>${items.length.toLocaleString()}</strong></div>
              <div><span>New Pages</span><strong>${buckets[0].count.toLocaleString()}</strong></div>
              <div><span>P0 / P1 Priority</span><strong>${(p0Cnt + p1Cnt).toLocaleString()}</strong></div>
              <div><span>Approved Queue</span><strong>${approvedCnt.toLocaleString()}</strong></div>
            </div>
          </div>
          <div class="ks-dash-card">
            <h3>Decision Funnel</h3>
            ${buckets
              .map((b) => `
                <div class="ks-funnel-row">
                  <span class="ks-funnel-label">${esc(b.label)}</span>
                  <div class="ks-funnel-bar"><span style="width:${Math.max(2, Math.round((b.count / total) * 100))}%"></span></div>
                  <span class="ks-funnel-count">${b.count.toLocaleString()}</span>
                </div>`)
              .join('')}
          </div>
        </div>

        <div class="ks-dash-section">
          <h3>Category Coverage</h3>
          <div class="ks-dash-table-wrap">
            <table class="ks-dash-table">
              <thead>
                <tr><th>Category</th><th>Status</th><th>Total</th><th>New Pages</th><th>Add to Existing</th><th>Already Covered</th><th>Action</th></tr>
              </thead>
              <tbody>
                ${DATA.categories
                  .map((c) => `
                    <tr>
                      <td><strong>${esc(c.name)}</strong></td>
                      <td><span class="ks-badge" style="${c.status === 'queued' ? 'background:#fff4e8;color:#986b42' : ''}">${c.status === 'mined' ? 'Mined & QA\'d' : 'Queued'}</span></td>
                      <td>${c.counts.total.toLocaleString()}</td>
                      <td>${c.counts.new_page.toLocaleString()}</td>
                      <td>${c.counts.add_to_existing.toLocaleString()}</td>
                      <td>${c.counts.already_covered.toLocaleString()}</td>
                      <td><button class="ks-link-btn" data-open-cat="${esc(c.id)}">Open tab →</button></td>
                    </tr>`)
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="ks-dash-section">
          <h3>New Page Coverage Matrix (Page Type × Reader Intent)</h3>
          <div class="ks-matrix-wrap">
            <table class="ks-matrix">
              <thead>
                <tr><th>Page Type</th>${intents.map((n) => `<th>${esc(n)}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${types
                  .map((t) => `
                    <tr>
                      <td class="ks-matrix-type">${esc(t)}</td>
                      ${intents
                        .map((n) => {
                          const cnt = matrixCounts[`${t}||${n}`] || 0;
                          const lvl = cnt === 0 ? 0 : cnt <= 3 ? 1 : cnt <= 10 ? 2 : 3;
                          return `<td class="ks-heat ks-heat-${lvl}" data-mx-type="${esc(t)}" data-mx-intent="${esc(n)}">${cnt}</td>`;
                        })
                        .join('')}
                    </tr>`)
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    document.querySelectorAll('[data-open-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        view.category = btn.dataset.openCat;
        view.nav = 'sheet';
        view.page = 1;
        saveState();
        renderAll();
      });
    });

    document.querySelectorAll('[data-mx-type]').forEach((cell) => {
      cell.addEventListener('click', () => {
        view.nav = 'sheet';
        view.bucket = 'new_page';
        view.colFilters.pageType = cell.dataset.mxType;
        view.colFilters.intent = cell.dataset.mxIntent;
        view.page = 1;
        saveState();
        renderAll();
      });
    });
  }

  function renderCategoriesView() {
    document.getElementById('view-categories').innerHTML = `
      <div class="ks-dash-grid">
        ${DATA.categories
          .map((c) => `
            <div class="ks-dash-card">
              <h3>${esc(c.topic)}</h3>
              <h2 style="margin:0 0 6px;font-family:var(--font-serif);color:var(--ink);font-size:18px">${esc(c.name)}</h2>
              <p style="margin:0 0 10px;color:var(--muted);line-height:1.5">${esc(c.description)}</p>
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                <span class="ks-badge" style="${c.status === 'queued' ? 'background:#fff4e8;color:#986b42' : ''}">${c.status === 'mined' ? `${c.counts.new_page} new pages · ${c.counts.total} total` : 'Ready for topic-miner'}</span>
                <button class="ks-link-btn" data-open-cat="${esc(c.id)}">View sheet →</button>
              </div>
            </div>`)
          .join('')}
      </div>
    `;
    document.querySelectorAll('#view-categories [data-open-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        view.category = btn.dataset.openCat;
        view.nav = 'sheet';
        saveState();
        renderAll();
      });
    });
  }

  function renderMethodView() {
    document.getElementById('view-method').innerHTML = `
      <div class="ks-dash-body">
        <div class="ks-dash-section">
          <h3>TCP Keyword Discovery Engine (100% Standalone)</h3>
          <p><strong>Engine:</strong> ${esc(DATA.engine || 'topic-miner')}</p>
          <ol class="method-list">
            <li><strong>Live-site registry &amp; v46 removed-URL gate:</strong> Match every candidate against current <code>thecreditpeople.com</code> live pages (excluding v46-removed URLs) to separate net-new pages from updates to existing pages.</li>
            <li><strong>90/10 saturation harvest ($0 session engine):</strong> Multi-round query expansion + competitor sitemap &amp; index scraping (Experian, Equifax, TransUnion, CFPB, Credit Karma, NerdWallet, Bankrate, MyFICO, Credit.com, Lexington Law) until new-idea yield saturates.</li>
            <li><strong>Pattern &amp; entity expansion:</strong> Expand <code>{bureau}</code>, <code>{collector}</code>, <code>{loan_type}</code>, <code>{score_band}</code>, and <code>{a} vs {b}</code> comparisons across all 6 TCP categories.</li>
            <li><strong>2-layer &amp; cross-category semantic deduplication:</strong> Fold same-wording and same-intent pairs inside each category AND across all 6 categories into one canonical home page.</li>
            <li><strong>Dual-rater commercial QA &amp; SEO metadata:</strong> Two independent raters score every page 1–10 for TCP conversion potential, reader intent, CTA, grounded FAQs, competitor references, URL slug, meta title (&le;60c), and meta description (&le;155c).</li>
          </ol>
        </div>
        <div class="ks-dash-section">
          <h3>Importing a Newly Mined TCP Category</h3>
          <div class="code-block">C:\Users\chris\AppData\Local\Programs\Python\Python311\python.exe C:\dev\tcp-keyword-studio\scripts\import_tcp_runs.py</div>
          <p class="muted" style="margin-top:8px">Add the new category's rated workbook path to <code>CATEGORY_REGISTRY</code> in <code>scripts/import_tcp_runs.py</code> and run the command above. Reload <code>index.html</code> — no server required.</p>
        </div>
      </div>
    `;
  }

  function setNav(nav) {
    view.nav = nav;
    saveState();
    renderAll();
    document.body.classList.remove('nav-open');
  }

  function renderAll() {
    renderSidebarMeta();
    renderCategoryTabs();
    renderStats();

    document.querySelectorAll('.sidebar nav button[data-nav]').forEach((b) => {
      b.classList.toggle('selected', b.dataset.nav === view.nav);
    });

    const isSheet = view.nav === 'sheet' || view.nav === 'approved';
    document.getElementById('view-sheet').hidden = !isSheet;
    document.getElementById('sheet-header-actions').hidden = !isSheet;
    document.getElementById('view-dashboard').hidden = view.nav !== 'dashboard';
    document.getElementById('view-categories').hidden = view.nav !== 'categories';
    document.getElementById('view-method').hidden = view.nav !== 'method';

    const titles = {
      sheet: 'Keyword ideas',
      approved: 'Approved writing queue',
      dashboard: 'Opportunity dashboard',
      categories: 'TCP category roadmap',
      method: 'Engine & method',
    };
    document.getElementById('page-title').textContent = titles[view.nav] || 'Keyword ideas';

    if (isSheet) renderSheet();
    if (view.nav === 'dashboard') renderDashboard();
    if (view.nav === 'categories') renderCategoriesView();
    if (view.nav === 'method') renderMethodView();
  }

  function exportCsv() {
    const rows = filteredItems();
    const cols = ['id', 'category', 'bucket', 'priority', 'score', 'raterA', 'raterB', 'title', 'keyword', 'urlSlug', 'metaTitle', 'metaDescription', 'pageType', 'intent', 'cta', 'overlapRisk', 'matchingUrl', 'headingToAdd', 'searchCount', 'questionCount', 'qaFlag'];
    const csvCell = (v) => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
    };
    const lines = [cols.join(','), ...rows.map((r) => cols.map((k) => csvCell(r[k])).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tcp-keywords-${view.category}-${view.bucket}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Wire controls
  document.getElementById('nav-toggle').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  document.getElementById('nav-close').addEventListener('click', () => document.body.classList.remove('nav-open'));
  document.getElementById('nav-backdrop').addEventListener('click', () => document.body.classList.remove('nav-open'));
  document.querySelectorAll('.sidebar nav button[data-nav]').forEach((b) => {
    b.addEventListener('click', () => setNav(b.dataset.nav));
  });

  const searchInput = document.getElementById('ks-search-input');
  searchInput.value = view.search;
  searchInput.addEventListener('input', () => { view.search = searchInput.value; view.page = 1; saveState(); renderSheet(); });

  const bucketSel = document.getElementById('ks-bucket-select');
  bucketSel.value = view.bucket;
  bucketSel.addEventListener('change', () => { view.bucket = bucketSel.value; view.page = 1; saveState(); renderSheet(); });

  const scoreSel = document.getElementById('ks-score-select');
  scoreSel.value = view.minScore;
  scoreSel.addEventListener('change', () => { view.minScore = scoreSel.value; view.page = 1; saveState(); renderSheet(); });

  const decSel = document.getElementById('ks-decision-select');
  decSel.value = view.decision;
  decSel.addEventListener('change', () => { view.decision = decSel.value; view.page = 1; saveState(); renderSheet(); });

  const sizeSel = document.getElementById('ks-page-size');
  sizeSel.value = String(view.pageSize);
  sizeSel.addEventListener('change', () => { view.pageSize = Number(sizeSel.value); view.page = 1; saveState(); renderSheet(); });

  document.querySelectorAll('#ks-colmenu input[data-col]').forEach((box) => {
    box.checked = Boolean(view.cols[box.dataset.col]);
    box.addEventListener('change', () => { view.cols[box.dataset.col] = box.checked; saveState(); renderSheet(); });
  });

  document.getElementById('btn-prev').addEventListener('click', () => { if (view.page > 1) { view.page--; saveState(); renderSheet(); } });
  document.getElementById('btn-next').addEventListener('click', () => { view.page++; saveState(); renderSheet(); });
  document.getElementById('btn-export-csv').addEventListener('click', exportCsv);
  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    view.search = '';
    view.minScore = '';
    view.decision = '';
    view.bucket = 'new_page';
    view.colFilters = { pageType: '', intent: '', overlapRisk: '', qaFlag: '' };
    view.page = 1;
    searchInput.value = '';
    bucketSel.value = 'new_page';
    scoreSel.value = '';
    decSel.value = '';
    saveState();
    renderAll();
  });
  document.getElementById('btn-approve-selected').addEventListener('click', () => {
    selected.forEach((uid) => { decisions[uid] = { status: 'approved', updatedAt: new Date().toISOString() }; });
    selected.clear();
    saveState();
    updateApproveBtn();
    renderAll();
  });

  renderAll();
})();
