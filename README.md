# 🤽 Sportlink Waterpolo Assistant

A lightweight Chrome Extension built for waterpolo secretaries (*wedstrijdsecretarissen*) to bypass the clunky Sportlink Club portal and look up opposing club contacts and pool locations in 2 seconds.

---

## ✨ Features

- **⚡ Instant Opponent Search:** Type a club name (e.g. *Otters*, *Het Y*, *De Dolfijn*) and hit Enter—no navigating through menus.
- **🥇 Waterpolo Contact Highlighting:** Automatically scans all club officials and highlights the official **Contactperson waterpolo** at the very top.
- **📋 1-Click Copy:**
  - **Copy Email** (`wp-secr@...`) with visual checkmark feedback + direct `mailto:` link.
  - **Copy Mobile** (`06-...`) + direct **WhatsApp Web** link (automatically formats Dutch numbers to `+316...`).
- **🏊 Swimming Pool Details:** Surfaces the match pool name (*bv. Sportcentrum De Zandzee*), address, and direct **Google Maps** link.
- **💬 1-Click WhatsApp Summary:** Generates and copies a preformatted message ready to paste directly into your team or coaches' WhatsApp chat:
  ```text
  🤽 De Otters Het Gooi (BUSSUM)
  🏊 Zwembad: Sportcentrum De Zandzee, Struikheiweg 14, 1406 TK BUSSUM
  📞 Tel bad: 035-6933554

  👤 Contactpersoon waterpolo: Posno - van der Zwaan, P.E.J.M
  ✉️ wp-secr@deottershetgooi.nl
  📱 06-24866524
  ```
- **🕒 Recent Searches:** Remembers recently searched clubs so frequent opponents can be re-opened with a single click.
- **👥 Full Officials Fallback:** Easily expand to view and filter all other club officials (chairperson, general secretary, swimming officials).
- **⌨️ Keyboard Shortcut:** Press `Ctrl+Shift+K` anywhere on Sportlink to open/close the lookup dialog.
- **🎯 Floating Launcher:** A discreet `🤽 WP Lookup` button in the bottom corner of `club.sportlink.com` for quick mouse access.
- **🧩 Toolbar Popup:** Also works as an extension popup from the Chrome toolbar.

---

## 💻 Installing on a Chromebook

Since Chrome extensions require the folder on the device:

### Step 1: Copy the extension folder to the Chromebook
1. Copy or zip the `sportlink` folder:
   - You can copy it to **Google Drive** or a **USB stick**, or email a `.zip` of this directory.
2. On the Chromebook, open the **Files** app and place the folder in **My files** (or **Downloads**).
   *(If you transferred a `.zip`, double-click to open it and drag the unzipped folder into Downloads)*.

### Step 2: Load into Chrome
1. Open Google Chrome on the Chromebook.
2. In the address bar, type:
   ```text
   chrome://extensions
   ```
   and press **Enter**.
3. In the top-right corner, toggle on **Developer mode**.
4. In the top-left corner, click **Load unpacked**.
5. Select the `sportlink` folder and click **Open**.

The extension is now installed! You will see the **Sportlink Waterpolo Assistant** icon in the extensions list.

---

## 🚀 How to Use It

1. Log into [club.sportlink.com](https://club.sportlink.com).
2. Press **`Ctrl+Shift+K`** (or click the floating **🤽 WP Lookup** button in the bottom-right corner).
3. Type the club name and press **Enter** (or click a match).
4. Click **Copy** next to the email or mobile, or click **Copy WhatsApp Summary** to share with your team!
