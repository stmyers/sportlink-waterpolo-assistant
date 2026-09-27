// Sportlink Waterpolo Assistant - Popup Script

const BASE_URL = 'https://club.sportlink.com';
let searchTimeout = null;
let currentClubDetails = null;

let authToken = null;
let navajoInstance = 'KNZB';
let navajoLocale = 'en';

document.addEventListener('DOMContentLoaded', async () => {
  const input = document.getElementById('popup-search-input');
  const clearBtn = document.getElementById('popup-clear-btn');

  loadRecents();
  await refreshAuth();

  input.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    clearBtn.style.display = val ? 'block' : 'none';

    clearTimeout(searchTimeout);
    if (!val) {
      showEmpty();
      return;
    }

    searchTimeout = setTimeout(() => {
      searchClubs(val);
    }, 250);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    input.focus();
    showEmpty();
  });
});

async function refreshAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['sl_auth_token', 'sl_navajo_instance', 'sl_navajo_locale'], async (res) => {
      if (res.sl_auth_token) {
        authToken = res.sl_auth_token;
        if (res.sl_navajo_instance) navajoInstance = res.sl_navajo_instance;
        if (res.sl_navajo_locale) navajoLocale = res.sl_navajo_locale;
        resolve();
      } else {
        // Try getting from active tab
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.id) {
            chrome.tabs.sendMessage(tab.id, { action: 'get-auth-token' }, (response) => {
              if (response && response.token) {
                authToken = response.token;
                if (response.instance) navajoInstance = response.instance;
                if (response.locale) navajoLocale = response.locale;
              }
              resolve();
            });
          } else {
            resolve();
          }
        } catch (_) {
          resolve();
        }
      }
    });
  });
}

function showEmpty() {
  document.getElementById('popup-content').innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">🤽</div>
      <div class="empty-text">Type a club name to find waterpolo secretaries, phone numbers & pools.</div>
    </div>
  `;
}

async function searchClubs(query) {
  const content = document.getElementById('popup-content');
  content.innerHTML = `
    <div class="spinner-container">
      <div class="spinner"></div>
      <span>Searching "${escapeHtml(query)}"...</span>
    </div>
  `;

  if (!authToken) {
    await refreshAuth();
  }

  if (!authToken) {
    content.innerHTML = `
      <div class="empty-state" style="color: #ef4444;">
        <div style="font-weight: 600;">Authentication Required</div>
        <div style="font-size: 12px; margin-top: 4px; color: #64748b;">No Sportlink session detected.</div>
        <div style="font-size: 11px; margin-top: 6px; color: #94a3b8;">Please open or refresh club.sportlink.com first.</div>
      </div>
    `;
    return;
  }

  try {
    const url = `${BASE_URL}/navajo/entity/common/clubweb/organization/SearchClub?SearchValue=${encodeURIComponent(query)}`;
    const headers = {
      'accept': '*/*',
      'authorization': authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`,
      'x-navajo-entity': 'organization/SearchClub',
      'x-navajo-instance': navajoInstance || 'KNZB',
      'x-navajo-locale': navajoLocale || 'en'
    };

    const res = await fetch(url, {
      headers,
      credentials: 'include'
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const clubs = data.Club || [];

    if (clubs.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <div class="empty-text">No clubs found matching "${escapeHtml(query)}"</div>
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
    content.innerHTML = `
      <div class="empty-state" style="color: #ef4444;">
        <div style="font-weight: 600;">Search Error</div>
        <div style="font-size: 12px; margin-top: 4px; color: #64748b;">${escapeHtml(err.message)}</div>
        <div style="font-size: 11px; margin-top: 6px; color: #94a3b8;">If you see HTTP 401, refresh club.sportlink.com</div>
      </div>
    `;
  }
}

function renderClubList(clubs) {
  const content = document.getElementById('popup-content');
  let html = `<div class="club-list">`;

  clubs.forEach((c) => {
    const logoUrl = c.Logo?.Url || '';
    html += `
      <div class="club-item" data-id="${escapeHtml(c.ClubId)}" data-name="${escapeHtml(c.ClubName)}" data-loc="${escapeHtml(c.ClubLocation || '')}">
        <div class="club-meta">
          ${logoUrl ? `<img class="club-logo" src="${escapeHtml(logoUrl)}" alt="logo" onerror="this.style.display='none'" />` : `<span>🏊</span>`}
          <div>
            <div class="club-name">${escapeHtml(c.ClubName)}</div>
            <div class="club-city">${escapeHtml(c.ClubLocation || '')}</div>
          </div>
        </div>
        <span class="club-id">${escapeHtml(c.ClubId)}</span>
      </div>
    `;
  });

  html += `</div>`;
  content.innerHTML = html;

  content.querySelectorAll('.club-item').forEach((item) => {
    item.addEventListener('click', () => {
      loadClubDetails(item.dataset.id, item.dataset.name, item.dataset.loc);
    });
  });
}

async function loadClubDetails(clubId, clubName, clubLocation) {
  const content = document.getElementById('popup-content');
  content.innerHTML = `
    <div class="spinner-container">
      <div class="spinner"></div>
      <span>Loading ${escapeHtml(clubName || clubId)}...</span>
    </div>
  `;

  saveRecent(clubId, clubName, clubLocation);

  try {
    const url = `${BASE_URL}/navajo/entity/common/clubweb/maintenance/addressbook/ClubDetails?ClubIdentifier=${encodeURIComponent(clubId)}`;
    const headers = {
      'accept': '*/*',
      'authorization': authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`,
      'x-navajo-entity': 'maintenance/addressbook/ClubDetails',
      'x-navajo-instance': navajoInstance || 'KNZB',
      'x-navajo-locale': navajoLocale || 'en'
    };

    const res = await fetch(url, {
      headers,
      credentials: 'include'
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    currentClubDetails = { ...data, clubId, clubName, clubLocation };
    renderDetails(currentClubDetails);
  } catch (err) {
    content.innerHTML = `
      <div class="empty-state" style="color: #ef4444;">
        <div style="font-weight: 600;">Failed to load details</div>
        <div style="font-size: 12px; margin-top: 4px; color: #64748b;">${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}

function renderDetails(data) {
  const content = document.getElementById('popup-content');
  const officials = data.ClubOfficials || [];
  const facility = data.Data || {};
  const clubData = data.ClubData || {};

  const clubName = clubData.ClubName || data.clubName || 'Club';

  const wpOfficials = officials.filter((o) => {
    const r = (o.FunctionDescription || '').toLowerCase();
    return r.includes('waterpolo');
  });

  const primaryContact = wpOfficials.find((o) => {
    const r = (o.FunctionDescription || '').toLowerCase();
    return r.includes('contact') || r.includes('secr') || r.includes('wedstrijd');
  }) || wpOfficials[0] || officials.find((o) => (o.FunctionDescription || '').toLowerCase().includes('secretaris'));

  let html = `
    <div class="hero-card">
      <div>
        <div class="hero-title">${escapeHtml(clubName)}</div>
        <div class="hero-sub">${escapeHtml(data.clubId)} ${data.clubLocation ? `• ${escapeHtml(data.clubLocation)}` : ''}</div>
      </div>
      <button id="popup-copy-summary" class="btn-summary">📋 Summary</button>
    </div>
  `;

  if (primaryContact) {
    const email = (primaryContact.Email || '').trim();
    const mobile = (primaryContact.Mobile || '').trim();
    const phone = (primaryContact.Telephone || '').trim();
    const wa = formatWhatsAppNumber(mobile || phone);

    html += `
      <div class="contact-card">
        <span class="badge-featured">🤽 Waterpolo Contact</span>
        <div class="contact-name">${escapeHtml(primaryContact.FullName)}</div>
        <div class="contact-role">${escapeHtml(primaryContact.FunctionDescription || 'Waterpolo Official')}</div>

        ${email ? `
          <div class="contact-row">
            <span>✉️ ${escapeHtml(email)}</span>
            <div style="display:flex;gap:4px;">
              <button class="btn-action copy-btn" data-val="${escapeHtml(email)}">Copy</button>
              <a href="mailto:${escapeHtml(email)}" class="btn-action">Email</a>
            </div>
          </div>
        ` : ''}

        ${mobile ? `
          <div class="contact-row">
            <span>📱 ${escapeHtml(mobile)}</span>
            <div style="display:flex;gap:4px;">
              <button class="btn-action copy-btn" data-val="${escapeHtml(mobile)}">Copy</button>
              ${wa ? `<a href="https://wa.me/${wa}" target="_blank" class="btn-action btn-whatsapp">WhatsApp</a>` : ''}
            </div>
          </div>
        ` : ''}

        ${phone && phone !== mobile ? `
          <div class="contact-row">
            <span>📞 ${escapeHtml(phone)}</span>
            <button class="btn-action copy-btn" data-val="${escapeHtml(phone)}">Copy</button>
          </div>
        ` : ''}
      </div>
    `;
  } else {
    html += `
      <div style="background:#fffbeb;padding:8px 12px;border-radius:6px;font-size:12px;color:#92400e;margin-bottom:12px;">
        No specific waterpolo contact found.
      </div>
    `;
  }

  const poolName = facility.FacilityName || '';
  const poolAddr = facility.FacilityStreetAndNumber || '';
  const poolCity = facility.FacilityZipCodeAndCity || '';
  const poolPhone = (facility.FacilityTelephoneNumber || '').trim();
  const fullLoc = [poolName, poolAddr, poolCity].filter(Boolean).join(', ');

  if (poolName || poolAddr) {
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullLoc)}`;
    html += `
      <div class="pool-card">
        <div class="pool-title">
          <span>🏊 ${escapeHtml(poolName || 'Zwembad')}</span>
          <div style="display:flex;gap:4px;">
            <a href="${maps}" target="_blank" class="btn-action">Maps</a>
            <button class="btn-action copy-btn" data-val="${escapeHtml(fullLoc)}">Copy</button>
          </div>
        </div>
        <div class="pool-address">
          ${poolAddr ? `${escapeHtml(poolAddr)}<br>` : ''}
          ${poolCity ? `${escapeHtml(poolCity)}<br>` : ''}
          ${poolPhone ? `Tel: ${escapeHtml(poolPhone)}` : ''}
        </div>
      </div>
    `;
  }

  content.innerHTML = html;

  content.querySelectorAll('.copy-btn').forEach((b) => {
    b.addEventListener('click', () => {
      copy(b.dataset.val);
      showToast('Copied!');
    });
  });

  const sumBtn = document.getElementById('popup-copy-summary');
  if (sumBtn) {
    sumBtn.addEventListener('click', () => {
      let t = `🤽 *${clubName}*\n`;
      if (fullLoc) t += `🏊 *Zwembad:* ${fullLoc}\n`;
      if (poolPhone) t += `📞 *Tel bad:* ${poolPhone}\n`;
      if (primaryContact) {
        t += `\n👤 *Contactpersoon waterpolo:* ${primaryContact.FullName}\n`;
        if (primaryContact.Email) t += `✉️ ${primaryContact.Email}\n`;
        if (primaryContact.Mobile) t += `📱 ${primaryContact.Mobile}\n`;
      }
      copy(t.trim());
      showToast('Summary copied!');
    });
  }
}

function saveRecent(clubId, clubName, clubLocation) {
  try {
    chrome.storage.local.get(['sl_recent_clubs'], (res) => {
      let recents = res.sl_recent_clubs || [];
      recents = recents.filter((c) => c.clubId !== clubId);
      recents.unshift({ clubId, clubName, clubLocation, timestamp: Date.now() });
      recents = recents.slice(0, 6);
      chrome.storage.local.set({ sl_recent_clubs: recents });
      loadRecents();
    });
  } catch (_) {}
}

function loadRecents() {
  try {
    chrome.storage.local.get(['sl_recent_clubs'], (res) => {
      const recents = res.sl_recent_clubs || [];
      const bar = document.getElementById('popup-recents-bar');
      const container = document.getElementById('popup-recents-chips');
      if (!bar || !container) return;

      if (recents.length === 0) {
        bar.style.display = 'none';
        return;
      }

      bar.style.display = 'flex';
      container.innerHTML = '';
      recents.forEach((c) => {
        const span = document.createElement('span');
        span.className = 'recent-chip';
        span.textContent = c.clubName || c.clubId;
        span.addEventListener('click', () => {
          loadClubDetails(c.clubId, c.clubName, c.clubLocation);
        });
        container.appendChild(span);
      });
    });
  } catch (_) {}
}

function copy(text) {
  navigator.clipboard.writeText(text);
}

function showToast(msg) {
  const toast = document.getElementById('popup-toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function formatWhatsAppNumber(phone) {
  if (!phone) return null;
  let clean = phone.replace(/[^0-9+]/g, '');
  if (clean.startsWith('06')) return '316' + clean.slice(2);
  if (clean.startsWith('+31')) return '31' + clean.slice(3);
  if (clean.startsWith('0')) return '31' + clean.slice(1);
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
