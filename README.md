# Zenn/Qiita Mute Warning

This is a Chrome extension that displays a warning banner at the top of the screen when opening an article by a muted user on Zenn or Qiita.

Zenn hides muted users from your timeline (TL), but if you access an article directly via its URL, it will still be displayed. Qiita also allows articles from muted users to be opened in the same way, so this extension helps you notice them.

## Operation Image

When you open an article by a muted user, a warning banner like the following will be displayed:

- **"← Go back"**: Returns to the previous page
- **"Read anyway"**: Closes the banner and continues reading the article

## Supported Pages

- Standard article pages (`/username/articles/slug`)
- Publication (organization) articles (URL uses Org slug, but correctly detects the actual author)
- Book pages (`/username/books/slug`)
- Zenn author pages (`/username`)
- Qiita article pages (`/username/items/slug`)
- SPA transitions (detects transitions from in-page links)

## Debug Mode

There is a "Debug Mode" toggle on the extension's options page. Turning it ON enables debug logs to the console. It is OFF by default, so please only turn it ON when investigating issues.

## Zenn local mute

Users exceeding Zenn's official mute limit can be added as local mutes from the extension's options page. On Zenn article pages, a "Local Mute" button will also be displayed for unmuted authors.

Local mutes are not registered in Zenn's main mute settings. This is local storage for this extension to treat them as warning targets.

## Mechanism

Zenn retrieves the mute list using the official API `GET /api/me/mutes` and caches it in `chrome.storage.local` for 24 hours. Zenn local mutes are also stored in `chrome.storage.local`, and for judgment, the official mute list and local mutes are combined. Qiita calls GraphQL `GetMutingUsers` from the content script (utilizing CSRF token) and similarly keeps it only locally. No data is sent to external servers whatsoever.

## Installation (Developer Mode)

As it is not yet published on the Chrome Web Store, manual installation is required.

**1. Clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/zenn-mute-warning.git
```

**2. Open Chrome's extensions page**

Enter the following in the address bar:

```
chrome://extensions
```

**3. Enable Developer Mode**

Toggle "Developer mode" ON in the top right.

**4. Load the extension**

Click "Load unpacked" and select the `extension` folder directly under the cloned repository.

**5. Log in to Zenn**

Please use this while logged in to Zenn. If not logged in, the mute list cannot be retrieved, so the banner will not be displayed.

## Updating the Mute List

The mute list is automatically fetched on the first access and then cached for 24 hours. If you want to update it immediately, refresh the extension once from `chrome://extensions`.

## File Structure

```
zenn-mute-warning/
├── extension/
│   ├── manifest.json   # Extension settings
│   ├── background.js   # Mute list acquisition and caching
│   ├── content.js      # Author detection and warning banner display
│   ├── options.html    # Options page
│   └── options.js      # Options page processing
├── _config.yml     # Jekyll settings for GitHub Pages
└── README.md
```

## Notes

- It may stop working due to changes in Zenn's API specifications.
- As it is not published on the Chrome Web Store, the extension may be disabled during Chrome updates.
- This extension is a PoC (Proof of Concept). No guarantee of operation is provided.

## License

MIT