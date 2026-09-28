// Sportlink Waterpolo Assistant - Content Script
(function () {
  'use strict';

  if (window.__sportlinkWpAssistantInjected) return;
  window.__sportlinkWpAssistantInjected = true;

  let currentClubDetails = null;
  let searchTimeout = null;

  // Cached Auth State
  let authToken = null;
  let navajoInstance = 'KNZB';
  let navajoLocale = 'en';

  // Cache for De Meeuwen teams & competition pools
  let deMeeuwenTeams = [];
  let poolMatchesCache = {}; // poolId -> { items, timestamp }
  let activeTabMode = 'lookup'; // 'lookup' or 'reschedule'

  // --- Blackout Date Ranges (Dutch School Holidays & Holiday breaks) ---
  const BLACKOUT_RANGES = [
    { start: '2026-10-10', end: '2026-10-11', reason: 'Herfstvakantie' },
    { start: '2026-10-17', end: '2026-10-18', reason: 'Herfstvakantie' },
    { start: '2026-12-05', end: '2026-12-06', reason: 'Sinterklaas' },
    { start: '2026-12-19', end: '2027-01-03', reason: 'Kerstvakantie' },
    { start: '2027-02-20', end: '2027-02-21', reason: 'Voorjaarsvakantie' },
    { start: '2027-02-27', end: '2027-02-28', reason: 'Voorjaarsvakantie' },
    { start: '2027-03-27', end: '2027-03-28', reason: 'Pasen' },
    { start: '2027-04-24', end: '2027-05-09', reason: 'Meivakantie' },
    { start: '2027-05-15', end: '2027-05-16', reason: 'Pinksteren' }
  ];

  // --- Listen for Auth captured by interceptor.js ---
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SL_WP_AUTH_CAPTURED') {
      authToken = event.data.token;
      if (event.data.instance) navajoInstance = event.data.instance;
      if (event.data.locale) navajoLocale = event.data.locale;

      try {
        chrome.storage.local.set({
          sl_auth_token: authToken,
          sl_navajo_instance: navajoInstance,
          sl_navajo_locale: navajoLocale,
          sl_auth_timestamp: Date.now()
        });
      } catch (_) {}
    }
  });

  // Load previously saved token
  try {
    chrome.storage.local.get(['sl_auth_token', 'sl_navajo_instance', 'sl_navajo_locale'], (res) => {
      if (res.sl_auth_token) authToken = res.sl_auth_token;
      if (res.sl_navajo_instance) navajoInstance = res.sl_navajo_instance;
      if (res.sl_navajo_locale) navajoLocale = res.sl_navajo_locale;
    });
  } catch (_) {}

  function getActiveToken() {
    if (authToken && isJwtValid(authToken)) return authToken;

    const storages = [sessionStorage, localStorage];
    for (const store of storages) {
      try {
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          const val = store.getItem(key);
          if (!val) continue;

          const match = val.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
          if (match) {
            const jwt = match[0];
            if (isJwtValid(jwt)) {
              authToken = `Bearer ${jwt}`;
              try {
                chrome.storage.local.set({ sl_auth_token: authToken, sl_navajo_instance: navajoInstance });
              } catch (_) {}
              return authToken;
            }
          }
        }
      } catch (_) {}
    }
    return authToken;
  }

  function isJwtValid(tokenStr) {
    try {
      const clean = tokenStr.replace(/^Bearer\s+/i, '');
      const parts = clean.split('.');
      if (parts.length !== 3) return false;
      const payload = JSON.parse(atob(parts[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        return false;
      }
      return true;
    } catch (_) {
      return true;
    }
  }

  // Generic Navajo Fetch
  async function fetchNavajo(path, entityName) {
    const token = getActiveToken();
    if (!token) throw new Error('Sportlink authentication token not detected. Refresh the page.');

    const headers = {
      'accept': '*/*',
      'authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      'x-navajo-entity': entityName,
      'x-navajo-instance': navajoInstance || 'KNZB',
      'x-navajo-locale': navajoLocale || 'en'
    };

    const res = await fetch(path, { headers, credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  }

  // --- SVG Icons ---
  const ICONS = {
    copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    email: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
    whatsapp: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
    map: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>`,
    phone: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    calendar: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`
  };

  // --- Initialize UI ---
  createFloatingLauncher();
  createModal();
  createToast();
  loadRecents();

  // Listen for commands / hotkeys
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
      e.preventDefault();
      toggleModal();
    } else if (e.key === 'Escape') {
      closeModal();
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'toggle-modal') {
      toggleModal();
    } else if (msg.action === 'get-auth-token') {
      sendResponse({ token: getActiveToken(), instance: navajoInstance, locale: navajoLocale });
    }
  });

  // --- Launcher Button ---
  function createFloatingLauncher() {
    const btn = document.createElement('button');
    btn.id = 'sl-wp-launcher-btn';
    btn.innerHTML = `
      <span>🤽 WP Assistant</span>
      <span class="sl-wp-badge">Ctrl+Shift+K</span>
    `;
    btn.title = 'Sportlink Waterpolo Assistant (Ctrl+Shift+K)';
    btn.addEventListener('click', toggleModal);
    document.body.appendChild(btn);
  }

  // --- Modal Window ---
  function createModal() {
    const overlay = document.createElement('div');
    overlay.id = 'sl-wp-overlay';
    overlay.innerHTML = `
      <div id="sl-wp-modal">
        <div class="sl-wp-header">
          <div class="sl-wp-title">
            <span class="sl-wp-title-icon">🤽</span>
            <span id="sl-wp-modal-title">Sportlink Waterpolo Assistant</span> <span id="sl-wp-header-version" style="font-size:11px;font-weight:normal;color:#94a3b8;cursor:pointer;padding:2px 6px;border-radius:4px;background:#f1f5f9;" title="Click to copy diagnostic info">v1.2.0</span>
          </div>
          <button class="sl-wp-close-btn" id="sl-wp-close" title="Close (Esc)">✕</button>
        </div>

        <div class="sl-wp-nav-tabs">
          <button class="sl-wp-tab-btn sl-wp-tab-active" id="sl-wp-tab-lookup">
            🔍 Opponent Lookup
          </button>
          <button class="sl-wp-tab-btn" id="sl-wp-tab-reschedule">
            📅 Reschedule Matches
          </button>
        </div>

        <div id="sl-wp-lookup-controls">
          <div class="sl-wp-search-bar">
            <span class="sl-wp-search-icon">🔍</span>
            <input type="text" id="sl-wp-search-input" class="sl-wp-input" placeholder="Search opponent club (e.g. Otters, Sassenheim, De Dolfijn)..." autocomplete="off" />
            <button class="sl-wp-clear-btn" id="sl-wp-clear">✕</button>
          </div>

          <div id="sl-wp-recents-bar" class="sl-wp-recents" style="display: none;">
            <span>Recent:</span>
            <div id="sl-wp-recents-chips" style="display: flex; gap: 6px; flex-wrap: wrap;"></div>
          </div>
        </div>

        <div class="sl-wp-body" id="sl-wp-body">
          <div style="text-align: center; color: #64748b; padding: 40px 20px;">
            <div style="font-size: 32px; margin-bottom: 8px;">🤽</div>
            <div style="font-weight: 600; font-size: 15px; color: #334155;">Quick Opponent Contact, Pools & Reschedule Finder</div>
            <div style="font-size: 13px; margin-top: 4px;">Search any club above to find waterpolo secretaries, pool addresses, and open reschedule dates.</div>
          </div>
        </div>
      </div>
    `;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    document.body.appendChild(overlay);

    document.getElementById('sl-wp-close').addEventListener('click', closeModal);
    const verBtn = document.getElementById('sl-wp-header-version');
    if (verBtn) {
      verBtn.addEventListener('click', () => {
        const diag = {
          version: '1.2.0',
          timestamp: new Date().toISOString(),
          url: window.location.href,
          hasToken: Boolean(getActiveToken()),
          navajoInstance: navajoInstance || 'KNZB',
          teamsCount: deMeeuwenTeams.length,
          cachedPoolsCount: Object.keys(poolMatchesCache).length
        };
        copyToClipboard(JSON.stringify(diag, null, 2));
        showToast('Diagnostics copied to clipboard! ✓');
      });
    }


    // Tab buttons
    document.getElementById('sl-wp-tab-lookup').addEventListener('click', () => switchTab('lookup'));
    document.getElementById('sl-wp-tab-reschedule').addEventListener('click', () => switchTab('reschedule'));

    const input = document.getElementById('sl-wp-search-input');
    const clearBtn = document.getElementById('sl-wp-clear');

    input.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      clearBtn.style.display = val ? 'block' : 'none';

      clearTimeout(searchTimeout);
      if (!val) {
        showWelcome();
        return;
      }

      searchTimeout = setTimeout(() => {
        performClubSearch(val);
      }, 250);
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      input.focus();
      showWelcome();
    });
  }

  function switchTab(mode) {
    activeTabMode = mode;
    const tabLookup = document.getElementById('sl-wp-tab-lookup');
    const tabReschedule = document.getElementById('sl-wp-tab-reschedule');
    const lookupControls = document.getElementById('sl-wp-lookup-controls');

    if (mode === 'lookup') {
      tabLookup.classList.add('sl-wp-tab-active');
      tabReschedule.classList.remove('sl-wp-tab-active');
      lookupControls.style.display = 'block';
      if (currentClubDetails) {
        renderClubDetails(currentClubDetails);
      } else {
        showWelcome();
      }
    } else {
      tabReschedule.classList.add('sl-wp-tab-active');
      tabLookup.classList.remove('sl-wp-tab-active');
      lookupControls.style.display = 'none';
      renderRescheduleHub();
    }
  }

  // --- Toast Notification ---
  function createToast() {
    const toast = document.createElement('div');
    toast.id = 'sl-wp-toast';
    document.body.appendChild(toast);
  }

  function showToast(message) {
    const toast = document.getElementById('sl-wp-toast');
    toast.innerHTML = `${ICONS.check} <span>${escapeHtml(message)}</span>`;
    toast.classList.add('sl-wp-show');
    setTimeout(() => {
      toast.classList.remove('sl-wp-show');
    }, 2200);
  }

  // --- Modal Open/Close ---
  function toggleModal() {
    const overlay = document.getElementById('sl-wp-overlay');
    if (overlay.classList.contains('sl-wp-visible')) {
      closeModal();
    } else {
      openModal();
    }
  }

  function openModal() {
    const overlay = document.getElementById('sl-wp-overlay');
    overlay.classList.add('sl-wp-visible');
    const input = document.getElementById('sl-wp-search-input');
    if (activeTabMode === 'lookup') {
      setTimeout(() => input.focus(), 50);
    }
    loadRecents();
    getActiveToken();
    // Warm up De Meeuwen teams in background
    preloadDeMeeuwenTeams();
  }

  function closeModal() {
    const overlay = document.getElementById('sl-wp-overlay');
    overlay.classList.remove('sl-wp-visible');
  }

  function showWelcome() {
    const body = document.getElementById('sl-wp-body');
    body.innerHTML = `
      <div style="text-align: center; color: #64748b; padding: 40px 20px;">
        <div style="font-size: 32px; margin-bottom: 8px;">🤽</div>
        <div style="font-weight: 600; font-size: 15px; color: #334155;">Quick Opponent Contact, Pools & Reschedule Finder</div>
        <div style="font-size: 13px; margin-top: 4px;">Search any club above to find waterpolo secretaries, pool addresses, and open reschedule dates.</div>
      </div>
    `;
  }

  // --- Preload De Meeuwen Teams & Competitions ---
  async function preloadDeMeeuwenTeams() {
    if (deMeeuwenTeams.length > 0) return deMeeuwenTeams;

    try {
      const data = await fetchNavajo('/navajo/entity/common/clubweb/team/UnionTeams', 'team/UnionTeams');
      const teamsRaw = data.Teams || data.UnionTeams || data.Team || (Array.isArray(data) ? data : []);

      const parsedTeams = [];
      for (const t of teamsRaw) {
        const teamId = t.PublicTeamId || t.TeamId || t.Id;
        const name = t.TeamName || t.PublicTeamName || t.Description || 'Team';
        if (teamId) {
          parsedTeams.push({ teamId, name });
        }
      }

      parsedTeams.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

      deMeeuwenTeams = parsedTeams;
      return deMeeuwenTeams;
    } catch (e) {
      console.warn('Could not preload De Meeuwen teams:', e);
      return [];
    }
  }

  // Fetch Competitions for a Team
  async function getTeamCompetitions(teamId) {
    try {
      const data = await fetchNavajo(
        `/navajo/entity/common/clubweb/team/UnionTeamCompetitions?PublicTeamId=${encodeURIComponent(teamId)}`,
        'team/UnionTeamCompetitions'
      );
      return data.Competition || [];
    } catch (e) {
      console.warn('Error fetching team competitions:', e);
      return [];
    }
  }

  // Fetch Full Pool Schedule
  async function getPoolSchedule(poolId) {
    if (poolMatchesCache[poolId]) {
      return poolMatchesCache[poolId];
    }
    const data = await fetchNavajo(
      `/navajo/entity/common/clubweb/competition/competitiondata/CompetitionPoolSchedule?OwnMatches=false&PublicPoolId=${encodeURIComponent(poolId)}`,
      'competition/competitiondata/CompetitionPoolSchedule'
    );
    const items = data.Items || [];
    poolMatchesCache[poolId] = items;
    return items;
  }

  // --- API: Search Clubs ---
  async function performClubSearch(query) {
    const body = document.getElementById('sl-wp-body');
    body.innerHTML = `
      <div class="sl-wp-loading">
        <div class="sl-wp-spinner"></div>
        <span>Searching clubs for "${escapeHtml(query)}"...</span>
      </div>
    `;

    try {
      const data = await fetchNavajo(
        `/navajo/entity/common/clubweb/organization/SearchClub?SearchValue=${encodeURIComponent(query)}`,
        'organization/SearchClub'
      );
      const clubs = data.Club || [];

      if (clubs.length === 0) {
        body.innerHTML = `
          <div style="text-align: center; color: #64748b; padding: 40px 20px;">
            <div style="font-size: 24px; margin-bottom: 8px;">🔍</div>
            <div style="font-weight: 600; font-size: 15px; color: #334155;">No clubs found</div>
            <div style="font-size: 13px; margin-top: 4px;">No club matching "${escapeHtml(query)}" was returned by Sportlink.</div>
          </div>
        `;
        return;
      }

      if (clubs.length === 1) {
        loadClubDetails(clubs[0].ClubId, clubs[0].ClubName, clubs[0].ClubLocation);
        return;
      }

      renderClubList(clubs);
    } catch (err) {
      body.innerHTML = `
        <div style="text-align: center; color: #ef4444; padding: 30px 20px;">
          <div style="font-weight: 600; font-size: 15px;">Search Error</div>
          <div style="font-size: 13px; margin-top: 4px; color: #64748b;">${escapeHtml(err.message)}</div>
          <div style="font-size: 12px; margin-top: 8px; color: #94a3b8;">If you see HTTP 401, refresh club.sportlink.com.</div>
        </div>
      `;
    }
  }

  function renderClubList(clubs) {
    const body = document.getElementById('sl-wp-body');
    let html = `<div class="sl-wp-club-list">`;

    clubs.forEach((club) => {
      const logoUrl = club.Logo && club.Logo.Url ? club.Logo.Url : '';
      const logoHtml = logoUrl
        ? `<img class="sl-wp-club-logo" src="${escapeHtml(logoUrl)}" alt="logo" onerror="this.style.display='none'" />`
        : `<div class="sl-wp-club-logo" style="display:flex;align-items:center;justify-content:center;font-size:18px;">🏊</div>`;

      html += `
        <div class="sl-wp-club-item" data-id="${escapeHtml(club.ClubId)}" data-name="${escapeHtml(club.ClubName)}" data-location="${escapeHtml(club.ClubLocation || '')}">
          <div class="sl-wp-club-meta">
            ${logoHtml}
            <div>
              <div class="sl-wp-club-name">${escapeHtml(club.ClubName)}</div>
              <div class="sl-wp-club-city">${escapeHtml(club.ClubLocation || '')}</div>
            </div>
          </div>
          <span class="sl-wp-club-id">${escapeHtml(club.ClubId)}</span>
        </div>
      `;
    });

    html += `</div>`;
    body.innerHTML = html;

    body.querySelectorAll('.sl-wp-club-item').forEach((item) => {
      item.addEventListener('click', () => {
        const clubId = item.getAttribute('data-id');
        const clubName = item.getAttribute('data-name');
        const clubLoc = item.getAttribute('data-location');
        loadClubDetails(clubId, clubName, clubLoc);
      });
    });
  }

  // --- API: Load Club Details ---
  async function loadClubDetails(clubId, clubName, clubLocation) {
    const body = document.getElementById('sl-wp-body');
    body.innerHTML = `
      <div class="sl-wp-loading">
        <div class="sl-wp-spinner"></div>
        <span>Loading details for ${escapeHtml(clubName || clubId)}...</span>
      </div>
    `;

    saveRecentClub(clubId, clubName, clubLocation);

    try {
      const data = await fetchNavajo(
        `/navajo/entity/common/clubweb/maintenance/addressbook/ClubDetails?ClubIdentifier=${encodeURIComponent(clubId)}`,
        'maintenance/addressbook/ClubDetails'
      );
      currentClubDetails = { ...data, clubId, clubName, clubLocation };
      renderClubDetails(currentClubDetails);
      // Asynchronously search for head-to-head matches against De Meeuwen
      searchHeadToHeadMatches(clubName);
    } catch (err) {
      body.innerHTML = `
        <div style="text-align: center; color: #ef4444; padding: 30px 20px;">
          <div style="font-weight: 600; font-size: 15px;">Failed to load club details</div>
          <div style="font-size: 13px; margin-top: 4px; color: #64748b;">${escapeHtml(err.message)}</div>
        </div>
      `;
    }
  }

  // --- Render Full Details ---
  function renderClubDetails(data) {
    const body = document.getElementById('sl-wp-body');
    const officials = data.ClubOfficials || [];
    const facilityData = data.Data || {};
    const clubData = data.ClubData || {};

    const clubName = clubData.ClubName || data.clubName || 'Club Details';
    const logoUrl = clubData.Logo && clubData.Logo.Url ? clubData.Logo.Url : '';

    const wpPrimary = [];
    const wpOther = [];
    const generalOfficials = [];

    officials.forEach((off) => {
      const role = (off.FunctionDescription || '').toLowerCase();
      const isWp = role.includes('waterpolo');
      const isContactOrSecr = role.includes('contact') || role.includes('secr') || role.includes('wedstrijd');

      if (isWp && isContactOrSecr) {
        wpPrimary.push(off);
      } else if (isWp) {
        wpOther.push(off);
      } else {
        generalOfficials.push(off);
      }
    });

    let html = `
      <div class="sl-wp-details-header">
        <div class="sl-wp-club-hero">
          ${logoUrl ? `<img class="sl-wp-club-hero-logo" src="${escapeHtml(logoUrl)}" alt="logo" onerror="this.style.display='none'" />` : ''}
          <div>
            <div class="sl-wp-hero-title">${escapeHtml(clubName)}</div>
            <div class="sl-wp-hero-sub">Club Code: <strong>${escapeHtml(data.clubId)}</strong> ${data.clubLocation ? `• ${escapeHtml(data.clubLocation)}` : ''}</div>
          </div>
        </div>
        <button id="sl-wp-copy-summary" class="sl-wp-btn-summary">
          ${ICONS.copy} Copy WhatsApp Summary
        </button>
      </div>
    `;

    // 1. Featured Waterpolo Contact Person
    if (wpPrimary.length > 0) {
      wpPrimary.forEach((off) => {
        html += renderFeaturedOfficialCard(off, '🤽 Contactpersoon Waterpolo');
      });
    } else if (wpOther.length > 0) {
      wpOther.forEach((off) => {
        html += renderFeaturedOfficialCard(off, '🤽 Waterpolo Official');
      });
    } else {
      html += `
        <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 13px; color: #92400e;">
          ℹ️ No specific "Contactperson waterpolo" published by this club. Check general officials below.
        </div>
      `;
    }

    // 2. Head-to-Head Matches Placeholder (loaded async)
    html += `
      <div id="sl-wp-h2h-container" style="display: none;">
        <div class="sl-wp-card-matches">
          <div class="sl-wp-matches-title">
            <span>📅 Scheduled Matches vs. De Meeuwen</span>
          </div>
          <div id="sl-wp-h2h-list"></div>
        </div>
      </div>
    `;

    // 3. Swimming Pool / Facility Card
    const poolName = facilityData.FacilityName || '';
    const poolAddress = facilityData.FacilityStreetAndNumber || '';
    const poolCity = facilityData.FacilityZipCodeAndCity || '';
    const poolPhone = (facilityData.FacilityTelephoneNumber || '').trim();
    const fullPoolLocation = [poolName, poolAddress, poolCity].filter(Boolean).join(', ');

    if (poolName || poolAddress) {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullPoolLocation)}`;
      html += `
        <div class="sl-wp-card-facility">
          <div class="sl-wp-facility-title">
            <span>🏊 ${escapeHtml(poolName || 'Wedstrijdbad')}</span>
            <div class="sl-wp-action-group">
              <a href="${mapsUrl}" target="_blank" class="sl-wp-btn-action" title="Open in Google Maps">
                ${ICONS.map} Maps
              </a>
              <button class="sl-wp-btn-action sl-wp-copy-pool-btn" data-address="${escapeHtml(fullPoolLocation)}" title="Copy address">
                ${ICONS.copy} Copy
              </button>
            </div>
          </div>
          <div class="sl-wp-facility-address">
            ${poolAddress ? `${escapeHtml(poolAddress)}<br>` : ''}
            ${poolCity ? `${escapeHtml(poolCity)}<br>` : ''}
            ${poolPhone ? `Tel: <strong>${escapeHtml(poolPhone)}</strong>` : ''}
          </div>
        </div>
      `;
    }

    // 4. Collapsible list of all other officials
    const totalOthers = generalOfficials.length + (wpPrimary.length > 0 ? wpOther.length : 0);
    if (totalOthers > 0) {
      html += `
        <div class="sl-wp-accordion-header" id="sl-wp-officials-toggle">
          <span>👥 View all ${totalOthers} other club officials</span>
          <span id="sl-wp-officials-arrow">▼</span>
        </div>
        <div class="sl-wp-accordion-content" id="sl-wp-officials-content">
          <input type="text" class="sl-wp-all-officials-filter" id="sl-wp-officials-filter" placeholder="Filter officials by name or role..." />
          <div class="sl-wp-all-officials-list" id="sl-wp-officials-list">
      `;

      const remainingList = (wpPrimary.length > 0 ? wpOther : []).concat(generalOfficials);
      remainingList.forEach((off) => {
        html += `
          <div class="sl-wp-official-compact-item" data-text="${escapeHtml((off.FullName + ' ' + off.FunctionDescription).toLowerCase())}">
            <div class="sl-wp-official-compact-info">
              <span class="sl-wp-official-compact-name">${escapeHtml(off.FullName || 'Unnamed')}</span>
              <span class="sl-wp-official-compact-func">${escapeHtml(off.FunctionDescription || off.RoleDescription || '')}</span>
            </div>
            <div class="sl-wp-action-group">
              ${off.Email ? `<button class="sl-wp-btn-action sl-wp-copy-val" data-val="${escapeHtml(off.Email)}" title="Copy email">${ICONS.email} Email</button>` : ''}
              ${off.Mobile ? `<button class="sl-wp-btn-action sl-wp-copy-val" data-val="${escapeHtml(off.Mobile)}" title="Copy mobile">${ICONS.phone} ${escapeHtml(off.Mobile)}</button>` : ''}
            </div>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

    body.innerHTML = html;

    setupDetailActionListeners(data, wpPrimary[0] || wpOther[0], fullPoolLocation, poolPhone);
  }

  function renderFeaturedOfficialCard(off, badgeTitle) {
    const email = (off.Email || '').trim();
    const mobile = (off.Mobile || '').trim();
    const phone = (off.Telephone || '').trim();
    const waNumber = formatWhatsAppNumber(mobile || phone);

    return `
      <div class="sl-wp-card-featured">
        <div class="sl-wp-badge-featured">${badgeTitle}</div>
        <div class="sl-wp-official-name">${escapeHtml(off.FullName || 'Unnamed Official')}</div>
        <div class="sl-wp-official-role">${escapeHtml(off.FunctionDescription || 'Contactperson waterpolo')}</div>

        <div class="sl-wp-contact-rows">
          ${email ? `
            <div class="sl-wp-contact-row">
              <span class="sl-wp-contact-val">✉️ ${escapeHtml(email)}</span>
              <div class="sl-wp-action-group">
                <button class="sl-wp-btn-action sl-wp-copy-val" data-val="${escapeHtml(email)}" title="Copy email">
                  ${ICONS.copy} Copy
                </button>
                <a href="mailto:${escapeHtml(email)}" class="sl-wp-btn-action" title="Open mail app">
                  ${ICONS.email} Email
                </a>
              </div>
            </div>
          ` : `<div class="sl-wp-contact-row" style="color:#94a3b8;font-size:13px;">No email address registered</div>`}

          ${mobile ? `
            <div class="sl-wp-contact-row">
              <span class="sl-wp-contact-val">📱 ${escapeHtml(mobile)}</span>
              <div class="sl-wp-action-group">
                <button class="sl-wp-btn-action sl-wp-copy-val" data-val="${escapeHtml(mobile)}" title="Copy mobile">
                  ${ICONS.copy} Copy
                </button>
                ${waNumber ? `
                  <a href="https://wa.me/${waNumber}" target="_blank" class="sl-wp-btn-action sl-wp-whatsapp" title="Chat on WhatsApp">
                    ${ICONS.whatsapp} WhatsApp
                  </a>
                ` : ''}
              </div>
            </div>
          ` : ''}

          ${phone && phone !== mobile ? `
            <div class="sl-wp-contact-row">
              <span class="sl-wp-contact-val">📞 ${escapeHtml(phone)}</span>
              <div class="sl-wp-action-group">
                <button class="sl-wp-btn-action sl-wp-copy-val" data-val="${escapeHtml(phone)}" title="Copy phone">
                  ${ICONS.copy} Copy
                </button>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // --- Async Search for Head-to-Head Matches ---
  async function searchHeadToHeadMatches(opponentClubName) {
    const teams = await preloadDeMeeuwenTeams();
    if (!teams || teams.length === 0) return;

    const cleanOpponent = opponentClubName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchedGames = [];

    // Check pools for each team
    for (const team of teams) {
      const comps = await getTeamCompetitions(team.teamId);
      for (const comp of comps) {
        if (!comp.PublicPoolId) continue;
        const poolMatches = await getPoolSchedule(comp.PublicPoolId);
        poolMatches.forEach((m) => {
          const home = (m.HomeTeamName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const away = (m.AwayTeamName || '').toLowerCase().replace(/[^a-z0-9]/g, '');

          // Check if match involves both De Meeuwen and this opponent
          const isHomeMeeuwen = home.includes('meeuwen');
          const isAwayMeeuwen = away.includes('meeuwen');
          const isOpponent = home.includes(cleanOpponent) || away.includes(cleanOpponent);

          if ((isHomeMeeuwen || isAwayMeeuwen) && isOpponent) {
            matchedGames.push({ match: m, poolId: comp.PublicPoolId, teamName: team.name });
          }
        });
      }
    }

    const container = document.getElementById('sl-wp-h2h-container');
    const list = document.getElementById('sl-wp-h2h-list');
    if (!container || !list) return;

    if (matchedGames.length > 0) {
      container.style.display = 'block';
      let html = '';
      matchedGames.forEach(({ match, poolId }) => {
        html += `
          <div class="sl-wp-match-item">
            <div>
              <div class="sl-wp-match-teams">🤽 ${escapeHtml(match.HomeTeamName)} vs ${escapeHtml(match.AwayTeamName)}</div>
              <div class="sl-wp-match-meta">
                📆 ${formatDutchDate(match.MatchDate)} om ${escapeHtml(match.MatchTime || '')} @ ${escapeHtml(match.FacilityName || '')} (${escapeHtml(match.FacilityCity || '')}) • Nr: #${escapeHtml(match.ExternalMatchId || match.InternalMatchId)}
              </div>
            </div>
            <button class="sl-wp-btn-reschedule" data-match='${JSON.stringify(match)}' data-pool="${escapeHtml(poolId)}">
              ${ICONS.refresh} Reschedule
            </button>
          </div>
        `;
      });
      list.innerHTML = html;

      list.querySelectorAll('.sl-wp-btn-reschedule').forEach((btn) => {
        btn.addEventListener('click', () => {
          const match = JSON.parse(btn.getAttribute('data-match'));
          const poolId = btn.getAttribute('data-pool');
          startRescheduleFlow(match, poolId);
        });
      });
    }
  }

  // --- Reschedule Hub Tab ---
  async function renderRescheduleHub() {
    const body = document.getElementById('sl-wp-body');
    body.innerHTML = `
      <div class="sl-wp-loading">
        <div class="sl-wp-spinner"></div>
        <span>Loading De Meeuwen teams & match schedules...</span>
      </div>
    `;

    const teams = await preloadDeMeeuwenTeams();
    if (!teams || teams.length === 0) {
      body.innerHTML = `
        <div style="text-align: center; color: #ef4444; padding: 30px 20px;">
          <div style="font-weight: 600; font-size: 15px;">No Teams Found</div>
          <div style="font-size: 13px; margin-top: 4px; color: #64748b;">Could not fetch De Meeuwen teams from Sportlink. Make sure you are logged in.</div>
        </div>
      `;
      return;
    }

    let html = `
      <div class="sl-wp-reschedule-view">
        <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
          Select a De Meeuwen team and match to reschedule:
        </div>
        <select id="sl-wp-team-select" class="sl-wp-input" style="font-size: 14px; padding: 10px;">
          <option value="">-- Choose De Meeuwen Team --</option>
    `;

    teams.forEach((t) => {
      html += `<option value="${escapeHtml(t.teamId)}">${escapeHtml(t.name)}</option>`;
    });

    html += `
        </select>
        <div id="sl-wp-team-matches-container" style="display:none; margin-top: 10px;"></div>
      </div>
    `;

    body.innerHTML = html;

    const select = document.getElementById('sl-wp-team-select');
    select.addEventListener('change', async (e) => {
      const teamId = e.target.value;
      if (!teamId) return;
      loadTeamMatchesForReschedule(teamId);
    });
  }

  async function loadTeamMatchesForReschedule(teamId) {
    const container = document.getElementById('sl-wp-team-matches-container');
    container.style.display = 'block';
    container.innerHTML = `
      <div class="sl-wp-loading" style="padding: 20px;">
        <div class="sl-wp-spinner"></div>
        <span>Loading matches...</span>
      </div>
    `;

    const comps = await getTeamCompetitions(teamId);
    let allMatches = [];

    for (const c of comps) {
      if (!c.PublicPoolId) continue;
      const matches = await getPoolSchedule(c.PublicPoolId);
      matches.forEach((m) => {
        allMatches.push({ match: m, poolId: c.PublicPoolId, compDesc: c.ClassDescription || c.CompetitionTypeName });
      });
    }

    allMatches.sort((a, b) => {
      const dateA = a.match.MatchDate || '';
      const dateB = b.match.MatchDate || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return (a.match.MatchTime || '').localeCompare(b.match.MatchTime || '');
    });

    if (allMatches.length === 0) {
      container.innerHTML = `<div style="color: #64748b; padding: 10px;">No scheduled matches found for this team.</div>`;
      return;
    }

    let html = `
      <div style="font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 8px;">Select match to reschedule:</div>
      <div class="sl-wp-card-matches">
    `;

    allMatches.forEach(({ match, poolId }) => {
      html += `
        <div class="sl-wp-match-item">
          <div>
            <div class="sl-wp-match-teams">🤽 ${escapeHtml(match.HomeTeamName)} vs ${escapeHtml(match.AwayTeamName)}</div>
            <div class="sl-wp-match-meta">
              📆 ${formatDutchDate(match.MatchDate)} om ${escapeHtml(match.MatchTime || '')} @ ${escapeHtml(match.FacilityName || '')} • Nr: #${escapeHtml(match.ExternalMatchId || match.InternalMatchId)}
            </div>
          </div>
          <button class="sl-wp-btn-reschedule" data-match='${JSON.stringify(match)}' data-pool="${escapeHtml(poolId)}">
            ${ICONS.refresh} Reschedule
          </button>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;

    container.querySelectorAll('.sl-wp-btn-reschedule').forEach((btn) => {
      btn.addEventListener('click', () => {
        const match = JSON.parse(btn.getAttribute('data-match'));
        const poolId = btn.getAttribute('data-pool');
        startRescheduleFlow(match, poolId);
      });
    });
  }

  // --- Reschedule Slot Finder Engine ---
  async function startRescheduleFlow(targetMatch, poolId) {
    const body = document.getElementById('sl-wp-body');
    body.innerHTML = `
      <div class="sl-wp-loading">
        <div class="sl-wp-spinner"></div>
        <span>Analyzing schedules & calculating open weekends...</span>
      </div>
    `;

    // 1. Fetch pool schedule
    const allPoolMatches = await getPoolSchedule(poolId);

    // 2. Identify Team A (De Meeuwen) and Team B (Opponent)
    const teamA = targetMatch.HomeTeamName;
    const teamB = targetMatch.AwayTeamName;

    // 3. Collect busy dates for Team A and Team B
    const busyDatesA = new Map();
    const busyDatesB = new Map();
    const deMeeuwenDuranDates = new Set();

    allPoolMatches.forEach((m) => {
      // Skip the match being rescheduled
      if (m.InternalMatchId === targetMatch.InternalMatchId) return;
      if (m.Status === 'Cancelled' || m.Status === 'Afgelast') return;

      const d = m.MatchDate; // YYYY-MM-DD
      if (!d) return;

      if (m.HomeTeamName === teamA || m.AwayTeamName === teamA) {
        const opponent = m.HomeTeamName === teamA ? m.AwayTeamName : m.HomeTeamName;
        busyDatesA.set(d, { ...m, opponent });
      }
      if (m.HomeTeamName === teamB || m.AwayTeamName === teamB) {
        const opponent = m.HomeTeamName === teamB ? m.AwayTeamName : m.HomeTeamName;
        busyDatesB.set(d, { ...m, opponent });
      }

      // Check home pool Duran
      if ((m.HomeTeamName || '').toLowerCase().includes('meeuwen') && (m.FacilityName || '').toLowerCase().includes('duran')) {
        deMeeuwenDuranDates.add(d);
      }
    });

    // 4. Generate candidate dates from today until end of season (May 31, 2027)
    const startDate = new Date();
    // Round forward to next Saturday
    const dayOfWeek = startDate.getDay();
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
    startDate.setDate(startDate.getDate() + daysUntilSaturday);

    const endDate = new Date('2027-06-01');
    const availableSlots = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const satStr = formatDateISO(currentDate);
      const sunDate = new Date(currentDate);
      sunDate.setDate(sunDate.getDate() + 1);
      const sunStr = formatDateISO(sunDate);

      const isSatBlackout = isDateInBlackout(satStr);
      const isSunBlackout = isDateInBlackout(sunStr);

      const teamAPlaysSat = busyDatesA.has(satStr);
      const teamBPlaysSat = busyDatesB.has(satStr);
      const teamAPlaysSun = busyDatesA.has(sunStr);
      const teamBPlaysSun = busyDatesB.has(sunStr);

      // --- Option 1: Saturday ---
      if (!isSatBlackout && !teamAPlaysSat && !teamBPlaysSat) {
        let warning = null;
        if (teamAPlaysSun && teamBPlaysSun) {
          warning = '⚠️ Beide teams spelen al op zondag';
        } else if (teamAPlaysSun) {
          const opp = busyDatesA.get(sunStr).opponent;
          warning = `⚠️ Meeuwen speelt al op zo (${opp})`;
        } else if (teamBPlaysSun) {
          const opp = busyDatesB.get(sunStr).opponent;
          warning = `⚠️ Tegenstander speelt al op zo (${opp})`;
        }

        availableSlots.push({
          date: satStr,
          day: 'Za',
          formattedDate: formatDutchDate(satStr),
          isSaturday: true,
          hasDuranPool: deMeeuwenDuranDates.has(satStr),
          warning: warning,
          hasWarning: Boolean(warning),
          isCleanWeekend: !warning
        });
      }

      // --- Option 2: Sunday ---
      if (!isSunBlackout && !teamAPlaysSun && !teamBPlaysSun) {
        let warning = null;
        if (teamAPlaysSat && teamBPlaysSat) {
          warning = '⚠️ Beide teams spelen al op zaterdag';
        } else if (teamAPlaysSat) {
          const opp = busyDatesA.get(satStr).opponent;
          warning = `⚠️ Meeuwen speelt al op za (${opp})`;
        } else if (teamBPlaysSat) {
          const opp = busyDatesB.get(satStr).opponent;
          warning = `⚠️ Tegenstander speelt al op za (${opp})`;
        }

        availableSlots.push({
          date: sunStr,
          day: 'Zo',
          formattedDate: formatDutchDate(sunStr),
          isSaturday: false,
          hasDuranPool: deMeeuwenDuranDates.has(sunStr),
          warning: warning,
          hasWarning: Boolean(warning),
          isCleanWeekend: !warning
        });
      }

      // Advance by 7 days to next Saturday
      currentDate.setDate(currentDate.getDate() + 7);
    }

    renderRescheduleResults(targetMatch, availableSlots);
  }

  function renderRescheduleResults(match, slots) {
    const body = document.getElementById('sl-wp-body');

    const cleanSlots = slots.filter((s) => s.isCleanWeekend);
    const satSlots = slots.filter((s) => s.isSaturday);

    // Pre-check up to 3 cleanest options
    let precheckedCount = 0;
    slots.forEach((s) => {
      if (s.isCleanWeekend && s.isSaturday && precheckedCount < 3) {
        s.defaultChecked = true;
        precheckedCount++;
      }
    });
    if (precheckedCount < 3) {
      slots.forEach((s) => {
        if (s.isCleanWeekend && !s.defaultChecked && precheckedCount < 3) {
          s.defaultChecked = true;
          precheckedCount++;
        }
      });
    }
    if (precheckedCount < 3) {
      slots.forEach((s) => {
        if (!s.defaultChecked && precheckedCount < 3) {
          s.defaultChecked = true;
          precheckedCount++;
        }
      });
    }

    let html = `
      <div class="sl-wp-reschedule-view">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <button id="sl-wp-reschedule-back" class="sl-wp-btn-action" style="padding:6px 12px;">
            ← Back to Matches
          </button>
          <span style="font-size:12px;color:#64748b;">Wedstrijdnr: #${escapeHtml(match.ExternalMatchId || match.InternalMatchId)}</span>
        </div>

        <div class="sl-wp-target-match-card">
          <div style="font-weight:700;font-size:16px;color:#0369a1;margin-bottom:4px;">
            🤽 ${escapeHtml(match.HomeTeamName)} vs ${escapeHtml(match.AwayTeamName)}
          </div>
          <div style="font-size:13px;color:#334155;">
            Oorspronkelijk gepland: <strong>${formatDutchDate(match.MatchDate)} om ${escapeHtml(match.MatchTime || '')}</strong>
          </div>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">
            Bad: ${escapeHtml(match.FacilityName || '')} (${escapeHtml(match.FacilityCity || '')})
          </div>
        </div>

        <div class="sl-wp-free-slots-header">
          <span>✨ ${slots.length} Mogelijke Speeldagen Gevonden:</span>
        </div>
        <div style="font-size:12px;color:#64748b;margin-top:-8px;margin-bottom:10px;">
          ✓ Excluded holiday blackouts (Meivakantie, Kerst, Pasen, etc.)<br>
          ✓ Excluded dates with same-day match conflicts.<br>
          ℹ️ Dates with another match on the same weekend are included with a warning.
        </div>

        <div class="sl-wp-filter-pills">
          <button class="sl-wp-filter-pill sl-wp-filter-active" data-filter="all">Alle opties (${slots.length})</button>
          <button class="sl-wp-filter-pill" data-filter="clean">100% Vrij weekend (${cleanSlots.length})</button>
          <button class="sl-wp-filter-pill" data-filter="saturday">Alleen zaterdagen (${satSlots.length})</button>
        </div>
    `;

    if (slots.length === 0) {
      html += `
        <div style="background:#fffbeb;padding:16px;border-radius:8px;color:#92400e;font-size:13px;">
          No open dates found without same-day conflicts. Try consulting the pool manager directly.
        </div>
      `;
    } else {
      html += `<div id="sl-wp-slots-list" style="display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto;">`;

      slots.forEach((slot) => {
        const checked = slot.defaultChecked ? 'checked' : '';
        html += `
          <label class="sl-wp-slot-item ${slot.hasWarning ? 'sl-wp-slot-warning' : (slot.hasDuranPool ? 'sl-wp-home-pool' : '')}"
                 data-clean="${slot.isCleanWeekend}" data-sat="${slot.isSaturday}" style="cursor:pointer;">
            <div style="display:flex;align-items:center;gap:10px;">
              <input type="checkbox" class="sl-wp-slot-check" value="${slot.formattedDate}" ${checked} />
              <div>
                <div class="sl-wp-slot-date">📅 ${slot.formattedDate}</div>
                <div style="font-size:11px;color:${slot.hasWarning ? '#b45309' : '#15803d'};">
                  ${slot.hasWarning ? escapeHtml(slot.warning) : '✓ Heel weekend vrij voor beide teams'}
                </div>
              </div>
            </div>
            <div>
              ${slot.hasDuranPool
                ? `<span class="sl-wp-slot-badge sl-wp-badge-pool">⭐ Badwater Duran</span>`
                : (slot.hasWarning
                    ? `<span class="sl-wp-slot-badge sl-wp-badge-warning">⚠️ Dubbel weekend</span>`
                    : `<span class="sl-wp-slot-badge sl-wp-badge-free">✅ 100% Vrij</span>`
                  )
              }
            </div>
          </label>
        `;
      });

      html += `</div>`;

      // Proposal Text Generator
      html += `
        <div class="sl-wp-proposal-box">
          <div style="font-weight:700;font-size:13px;color:#0f172a;margin-bottom:6px;">
            📝 Ready-to-Send Reschedule Proposal:
          </div>
          <textarea id="sl-wp-proposal-area" class="sl-wp-proposal-text"></textarea>
          <div style="display:flex;gap:8px;">
            <button id="sl-wp-copy-proposal" class="sl-wp-btn-summary">
              ${ICONS.copy} Kopieer WhatsApp Voorstel
            </button>
            <button id="sl-wp-email-proposal" class="sl-wp-btn-action" style="padding:8px 14px;font-size:13px;">
              ${ICONS.email} Email Voorstel
            </button>
          </div>
        </div>
      `;
    }

    html += `</div>`;
    body.innerHTML = html;

    // Listeners
    const backBtn = document.getElementById('sl-wp-reschedule-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (activeTabMode === 'lookup') {
          switchTab('lookup');
        } else {
          renderRescheduleHub();
        }
      });
    }

    // Filter pills listeners
    body.querySelectorAll('.sl-wp-filter-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        body.querySelectorAll('.sl-wp-filter-pill').forEach((b) => b.classList.remove('sl-wp-filter-active'));
        btn.classList.add('sl-wp-filter-active');
        const filter = btn.dataset.filter;
        body.querySelectorAll('.sl-wp-slot-item').forEach((item) => {
          if (filter === 'all') {
            item.style.display = 'flex';
          } else if (filter === 'clean') {
            item.style.display = item.dataset.clean === 'true' ? 'flex' : 'none';
          } else if (filter === 'saturday') {
            item.style.display = item.dataset.sat === 'true' ? 'flex' : 'none';
          }
        });
      });
    });

    function updateProposalText() {
      const selectedDates = [];
      body.querySelectorAll('.sl-wp-slot-check:checked').forEach((cb) => {
        selectedDates.push(cb.value);
      });

      const datesList = selectedDates.map((d) => `• ${d}`).join('\n');
      const text = `Hoi,

Vanuit De Meeuwen Diemen willen we graag kijken naar het verplaatsen van onze wedstrijd:
🤽 ${match.HomeTeamName} - ${match.AwayTeamName} (Wedstrijdnr: #${match.ExternalMatchId || match.InternalMatchId})
Oorspronkelijk gepland: ${formatDutchDate(match.MatchDate)} om ${match.MatchTime || ''} in ${match.FacilityName || ''}

Volgens het bondsrooster zijn beide teams op de volgende data vrij:
${datesList || '• [Geen data geselecteerd]'}

Zou een van deze data voor jullie uitkomen?

Met sportieve groet,
De Meeuwen Diemen`;

      const area = document.getElementById('sl-wp-proposal-area');
      if (area) area.value = text;
    }

    body.querySelectorAll('.sl-wp-slot-check').forEach((cb) => {
      cb.addEventListener('change', updateProposalText);
    });

    updateProposalText();

    const copyBtn = document.getElementById('sl-wp-copy-proposal');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const area = document.getElementById('sl-wp-proposal-area');
        copyToClipboard(area.value);
        showToast('WhatsApp voorstel gekopieerd! ✓');
      });
    }

    const emailBtn = document.getElementById('sl-wp-email-proposal');
    if (emailBtn) {
      emailBtn.addEventListener('click', () => {
        const area = document.getElementById('sl-wp-proposal-area');
        const subject = encodeURIComponent(`Verplaatsen wedstrijd: ${match.HomeTeamName} - ${match.AwayTeamName} (#${match.ExternalMatchId || match.InternalMatchId})`);
        const bodyText = encodeURIComponent(area.value);
        window.open(`mailto:?subject=${subject}&body=${bodyText}`);
      });
    }
  }

  // --- Date & Weekend Helpers ---
  function getWeekendId(dateStr) {
    const d = new Date(dateStr);
    const day = d.getDay();
    // Normalize to Saturday of that weekend
    const diff = (6 - day + 7) % 7;
    const sat = new Date(d);
    sat.setDate(d.getDate() + (day === 0 ? -1 : diff));
    return formatDateISO(sat);
  }

  function isDateInBlackout(dateStr) {
    for (const b of BLACKOUT_RANGES) {
      if (dateStr >= b.start && dateStr <= b.end) {
        return true;
      }
    }
    return false;
  }

  function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatDutchDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const days = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
      const months = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
      return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch (_) {
      return dateStr;
    }
  }

  function setupDetailActionListeners(data, primaryContact, fullPoolLocation, poolPhone) {
    const body = document.getElementById('sl-wp-body');

    body.querySelectorAll('.sl-wp-copy-val').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-val');
        copyToClipboard(val);
        showToast(`Copied: ${val}`);
      });
    });

    const poolBtn = body.querySelector('.sl-wp-copy-pool-btn');
    if (poolBtn) {
      poolBtn.addEventListener('click', () => {
        const addr = poolBtn.getAttribute('data-address');
        copyToClipboard(addr);
        showToast('Pool address copied!');
      });
    }

    const summaryBtn = document.getElementById('sl-wp-copy-summary');
    if (summaryBtn) {
      summaryBtn.addEventListener('click', () => {
        const clubName = data.ClubData?.ClubName || data.clubName || '';
        const summaryText = buildSummaryText(clubName, primaryContact, fullPoolLocation, poolPhone);
        copyToClipboard(summaryText);
        showToast('WhatsApp summary copied!');
      });
    }

    const toggle = document.getElementById('sl-wp-officials-toggle');
    const content = document.getElementById('sl-wp-officials-content');
    const arrow = document.getElementById('sl-wp-officials-arrow');
    if (toggle && content) {
      toggle.addEventListener('click', () => {
        const isOpen = content.classList.toggle('sl-wp-open');
        arrow.textContent = isOpen ? '▲' : '▼';
      });
    }

    const filterInput = document.getElementById('sl-wp-officials-filter');
    const list = document.getElementById('sl-wp-officials-list');
    if (filterInput && list) {
      filterInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        list.querySelectorAll('.sl-wp-official-compact-item').forEach((item) => {
          const text = item.getAttribute('data-text') || '';
          item.style.display = text.includes(term) ? 'flex' : 'none';
        });
      });
    }
  }

  function buildSummaryText(clubName, contact, poolLocation, poolPhone) {
    let out = `🤽 *${clubName}*\n`;
    if (poolLocation) {
      out += `🏊 *Zwembad:* ${poolLocation}\n`;
      if (poolPhone) out += `📞 *Tel bad:* ${poolPhone}\n`;
    }
    if (contact) {
      out += `\n👤 *Contactpersoon waterpolo:* ${contact.FullName}\n`;
      if (contact.Email) out += `✉️ ${contact.Email}\n`;
      if (contact.Mobile) out += `📱 ${contact.Mobile}\n`;
      if (contact.Telephone && contact.Telephone !== contact.Mobile) out += `📞 ${contact.Telephone}\n`;
    }
    return out.trim();
  }

  // --- Recents Management ---
  function saveRecentClub(clubId, clubName, clubLocation) {
    try {
      chrome.storage.local.get(['sl_recent_clubs'], (res) => {
        let recents = res.sl_recent_clubs || [];
        recents = recents.filter((c) => c.clubId !== clubId);
        recents.unshift({ clubId, clubName, clubLocation, timestamp: Date.now() });
        recents = recents.slice(0, 8);
        chrome.storage.local.set({ sl_recent_clubs: recents });
      });
    } catch (_) {}
  }

  function loadRecents() {
    try {
      chrome.storage.local.get(['sl_recent_clubs'], (res) => {
        const recents = res.sl_recent_clubs || [];
        const bar = document.getElementById('sl-wp-recents-bar');
        const container = document.getElementById('sl-wp-recents-chips');

        if (!bar || !container) return;

        if (recents.length === 0) {
          bar.style.display = 'none';
          return;
        }

        bar.style.display = 'flex';
        container.innerHTML = '';
        recents.forEach((c) => {
          const chip = document.createElement('span');
          chip.className = 'sl-wp-recent-tag';
          chip.textContent = c.clubName || c.clubId;
          chip.title = `${c.clubName} (${c.clubId})`;
          chip.addEventListener('click', () => {
            loadClubDetails(c.clubId, c.clubName, c.clubLocation);
          });
          container.appendChild(chip);
        });
      });
    } catch (_) {}
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  }

  function formatWhatsAppNumber(phone) {
    if (!phone) return null;
    let clean = phone.replace(/[^0-9+]/g, '');
    if (clean.startsWith('06')) {
      clean = '316' + clean.slice(2);
    } else if (clean.startsWith('+31')) {
      clean = '31' + clean.slice(3);
    } else if (clean.startsWith('0')) {
      clean = '31' + clean.slice(1);
    }
    return clean;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
