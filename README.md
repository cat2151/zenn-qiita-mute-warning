# Zenn/Qiita Mute Warning

This is a Chrome extension that displays a warning banner at the top of the screen when you open an article by a user you've muted on Zenn or Qiita.

While Zenn hides muted users from your timeline, articles from those users will still be displayed if you access them directly via their URL. Qiita behaves similarly, allowing you to open articles by muted users. This extension helps you become aware of such instances.

## How It Works

When you open an article by a muted user, a warning banner like the following will be displayed:

- **"← Back"**: Returns to the previous page
- **"Read Anyway"**: Closes the banner and continues reading the article

## Supported Pages

- Standard article pages (`/username/articles/slug`)
- Articles via Publication (organization) pages (URL uses Org slug, but accurately detects the actual author)
- Book pages (`/username/books/slug`)
- Qiita article pages (`/username/items/slug`)
- SPA transitions (detects navigation from in-page links as well)

## Debug Mode

There is a "Debug Mode" toggle on the extension's options page. Turning it ON enables debug logs to the console. It is OFF by default, so please only enable it when investigating issues.

## Mechanism

Zenn retrieves the mute list using the official API `GET /api/me/mutes` and caches it in `chrome.storage.local` for 24 hours. Qiita calls GraphQL `GetMutingUsers` from the content script (utilizing a CSRF token) and similarly keeps the data only locally. No data is ever sent to external servers.

## Installation (Developer Mode)

Since it's not yet published on the Chrome Web Store, manual installation is required.

**1. Clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/zenn-mute-warning.git
```

**2. Open Chrome's Extensions page**

Enter the following in the address bar:

```
chrome://extensions
```

**3. Enable Developer Mode**

Turn ON the "Developer Mode" toggle in the top right.

**4. Load the extension**

Click "Load unpacked" and select the cloned `zenn-mute-warning` folder.

**5. Log in to Zenn**

Please use it while logged in to Zenn. The banner will not be displayed if you are not logged in, as the mute list cannot be retrieved.

## Updating the Mute List

The mute list is automatically retrieved on the first access and then cached for 24 hours. If you wish to update it immediately, refresh the extension once from `chrome://extensions`.

## File Structure

```
zenn-mute-warning/
├── manifest.json   # Extension settings
├── background.js   # Mute list retrieval and caching
├── content.js      # Author detection and warning banner display
└── README.md
```

## Important Notes

- The extension may stop working due to changes in Zenn's API specifications.
- As it is not published on the Chrome Web Store, the extension may be disabled during Chrome updates.
- This extension is a Proof-of-Concept (PoC). No guarantee of operation is provided.

## License

MIT