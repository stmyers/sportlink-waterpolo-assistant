# 🤽 Sportlink Waterpolo Assistant

A lightweight, zero-dependency Chrome Extension (Manifest V3) built for water polo match secretaries (*wedstrijdsecretarissen*) to bypass the clunky Sportlink Club portal. Look up opposing club contacts, pools, and find open reschedule dates in seconds.

---

## ✨ Features

- **⚡ Instant Opponent Search:** Type a club name (e.g. *Otters*, *Het Y*, *Sassenheim*) and hit Enter—no navigating through nested menus.
- **🥇 Waterpolo Contact Highlighting:** Automatically scans all club officials and highlights the official **Contactperson waterpolo** with 1-click email and phone copying.
- **🏊 Swimming Pool Details:** Surfaces the match pool name (*bv. Sportcentrum De Zandzee*), address, and direct **Google Maps** link.
- **📅 Automated Match Rescheduling Engine:**
  - Pulls the entire division schedule via Sportlink's competition API (`CompetitionPoolSchedule`).
  - **Weekend Rest Constraint:** Eliminates weekends where either team already plays a match (no back-to-back weekend doubleheaders).
  - **Holiday Blackouts:** Excludes all Dutch school breaks and holiday weekends (*Herfstvakantie, Sinterklaas, Kerstvakantie, Voorjaarsvakantie, Pasen, Meivakantie, Pinksteren*).
  - **Badwater Detection:** Automatically flags weekends where De Meeuwen already has pool time booked at *Weth. F.B. Duran*.
- **💬 1-Click WhatsApp & Email Proposals:** Automatically formats a polite rescheduling proposal in Dutch with candidate dates, ready to send via WhatsApp Web or email.
- **🩺 1-Click Diagnostics:** Click the **`v1.1.0`** badge in the modal header to instantly copy system diagnostics (URL, auth state, loaded teams) to clipboard for easy troubleshooting.
- **⌨️ Universal Shortcuts:** Press **`Ctrl+Shift+K`** anywhere on Sportlink to toggle the spotlight modal, or use the discreet floating launcher button in the bottom-right corner.

---

## 💻 Installation (Chromebook & Chrome)

### Step 1: Download the Latest Release
1. Go to the **[GitHub Releases Page](https://github.com/stmyers/sportlink-waterpolo-assistant/releases)**.
2. Under the latest release, download **`sportlink-waterpolo-assistant.zip`**.

### Step 2: Unzip the Folder
* **On a Chromebook:** Open the **Files** app, double-click the downloaded `.zip` file, and drag the extracted folder into **My files** (or **Downloads**).
* **On Linux / Mac / Windows:** Right-click the `.zip` and extract it to a folder of your choice.

### Step 3: Load into Chrome
1. In Google Chrome, navigate to:
   ```text
   chrome://extensions
   ```
2. In the top-right corner, enable **Developer mode**.
3. In the top-left corner, click **Load unpacked**.
4. Select the unzipped folder and click **Open**.

The extension is now installed and ready!

---

## 🚀 How to Use It

1. Log into [club.sportlink.com](https://club.sportlink.com).
2. Press **`Ctrl+Shift+K`** (or click the floating **🤽 WP Assistant** button in the bottom-right corner).
3. **Opponent Lookup:** Type any club name to view their water polo secretary contact, phone, and match pool.
4. **Reschedule a Match:** 
   - Click the **"📅 Reschedule Matches"** tab (or click **`[ 🔄 Reschedule ]`** directly on any scheduled head-to-head match).
   - Select candidate dates from the conflict-free list.
   - Click **`[ 📋 Kopieer WhatsApp Voorstel ]`** to paste the proposal directly into WhatsApp!

---

## 📦 How to Make Future Releases (Automated via GitHub Actions)

Releases are **100% automated** using GitHub Actions. The workflow packages all extension files into a clean `.zip` asset, writes release notes, and publishes the release.

### Method A: Via Git Tags (Terminal)
Whenever you are ready to publish a new version:
```bash
# 1. Update "version" in manifest.json (e.g. 1.2.0)
git commit -am "chore: Bump version to 1.2.0"
git push origin main

# 2. Tag and push the tag
git tag v1.2.0
git push origin v1.2.0
```
GitHub Actions will automatically build `dist/sportlink-waterpolo-assistant.zip` and publish **Release v1.2.0** on GitHub in ~15 seconds.

### Method B: Via the GitHub Web UI (No Terminal Needed)
1. Go to your repository on GitHub.
2. Click the **Actions** tab.
3. In the left sidebar, click **Release Extension**.
4. Click **Run workflow**, enter the new tag name (e.g. `v1.2.0`), and click the green **Run workflow** button.

---

## 🩺 Debugging & Support

If an error or edge case occurs:
1. Click the grey **`v1.1.0`** badge in the modal header to copy system diagnostics.
2. On a Chromebook, take a screenshot of the error with **`Ctrl + Shift + Show Windows`**.
3. Open the Chrome Console with **`Ctrl + Shift + J`** to view any red network or JavaScript errors.
