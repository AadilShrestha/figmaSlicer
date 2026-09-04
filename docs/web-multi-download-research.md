# Separate-file downloads from a Figma plugin

Research date: 2026-09-04

## Direct answer

Turning off **Ask where to save each file before downloading** does **not** fix the current one-click, three-file failure. That switch only decides whether an already-authorized download uses the default Downloads folder or opens a destination prompt. Chrome documents download location and **Automatic downloads** under separate settings. The latter controls whether a site may start related downloads together. [Chrome Help: Download a file](https://support.google.com/chrome/answer/95759?hl=en&co=GENIE.Platform%3DDesktop)

The useful combinations are:

| UI behavior | Ask where to save | Automatic downloads | Expected result |
| --- | --- | --- | --- |
| One Export click starts 3 files | Off | Ask/default or Block | First may save silently; later files can still be gated. **Not fixed.** |
| One Export click starts 3 files | Off | Allow | Ordinary pages may save all 3 silently. This is **not a dependable Figma-plugin fix**; see the null-origin caveat below. |
| Three real Download buttons, clicked once each | Off | Ask/default | Each click should save one file directly to Downloads in current Chromium behavior. **Recommended non-ZIP fallback.** |
| Three real Download buttons, clicked once each | On | Ask/default | Each click should be authorized, but the browser may ask for a destination for every file. |

If the user has explicitly set Automatic downloads to **Block**, change it back to **Ask/default** for the per-file-click fallback. Edge's official policy documentation says its default requires a user gesture for each additional download, while its Block mode prevents multiple downloads even after a gesture. [Microsoft Edge: DefaultAutomaticDownloadsSetting](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/defaultautomaticdownloadssetting)

## 1. The two browser settings are independent

Chrome's help page defines two different controls:

- **Automatic downloads:** whether sites may download related files together.
- **Ask where to save each file before downloading:** whether each permitted download opens a destination chooser instead of using the default location.

The implementation also keeps these concerns separate. Chromium stores the location prompt in `kPromptForDownload` in `DownloadPrefs`, while successive downloads are governed by the `AUTOMATIC_DOWNLOADS` content setting in `DownloadRequestLimiter`. [Chromium `download_prefs.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/download/download_prefs.cc) · [Chromium `download_request_limiter.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/download/download_request_limiter.cc)

Therefore, turning off the save-location prompt can make successful downloads less annoying, but it cannot authorize download numbers 2 and 3.

### Can the user allow Automatic downloads for `figma.com`?

For an ordinary top-level page, yes: Chrome exposes **Settings → Privacy and security → Site settings → Additional permissions → Automatic downloads**, and Edge supports per-site allow lists for successive automatic downloads. [Chrome Help](https://support.google.com/chrome/answer/95759?hl=en&co=GENIE.Platform%3DDesktop) · [Microsoft Edge: AutomaticDownloadsAllowedForUrls](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/automaticdownloadsallowedforurls)

For a default Figma plugin UI, this is **not guaranteed**:

- Figma says `figma.showUI()` places the plugin UI in an iframe, and says the default plugin UI iframe has a **null origin**. [Figma: Creating a user interface](https://developers.figma.com/docs/plugins/creating-ui/) · [Figma: Making network requests](https://developers.figma.com/docs/plugins/making-network-requests/)
- Chromium's content-setting schema describes Automatic downloads as keyed to the top-level frame, which suggests `figma.com`. [Chromium `content_settings.json`, automaticDownloads](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/common/extensions/api/content_settings.json#368)
- However, current Chromium download-limiter code checks the **request initiator** and forces an opaque initiator to `BLOCK`; a null origin is opaque. [Chromium `download_request_limiter.cc`, initiator check](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/download/download_request_limiter.cc#638)

Those official sources do not establish that a `figma.com` allow entry overrides a download initiated by Figma's null-origin plugin iframe. It may vary with how that browser/host attributes a Blob download. Treat it as an optional user workaround to test, not product behavior to rely on.

## 2. One real click per file is the practical non-ZIP fallback

Current Chromium resets its successive-download count on a real user interaction, explicitly commenting that the reset lets one download proceed. [Chromium `DidGetUserInteraction`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/download/download_request_limiter.cc#187) · [Chromium `OnUserInteraction`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/download/download_request_limiter.cc#308)

Microsoft describes the same default behavior for Edge: “A user gesture is required for each additional download.” [Microsoft Edge: DefaultAutomaticDownloadsSetting](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/defaultautomaticdownloadssetting)

**Confirmed by primary sources:** Chromium's limiter resets on browser-observed user input, and Edge's default policy is one user gesture per additional download.

**Inference requiring one Figma-web check:** a physical click on a Download button inside Figma's null-origin plugin iframe will be reported to the containing `WebContents` as that user input and will authorize that button's one Blob download. No Figma document or Web standard explicitly guarantees this end-to-end host behavior. The source evidence makes it the strongest non-ZIP option, but it should be described as “expected” until the verification matrix passes.

This is materially different from one Export click followed later by three scripted `anchor.click()` calls. The HTML Standard says `HTMLElement.click()` dispatches an event whose `isTrusted` is false. It is not a new physical user interaction. [WHATWG HTML: `HTMLElement.click()`](https://html.spec.whatwg.org/multipage/interaction.html#dom-click)

Recommended flow:

1. User clicks **Export** once; the plugin renders and retains all result Blobs/object URLs.
2. The UI shows a visible **Download next** action (or one button per slice).
3. Each real button click initiates exactly one file download.

With **Ask where to save** turned off, those three clicks should put the three files directly in Downloads without three location dialogs.

Do not programmatically click all three per-file buttons from one user action; that recreates the original gate.

## 3. A folder picker cannot solve this inside the default Figma iframe

The File System Access specification applies the same gate to `showOpenFilePicker()`, `showSaveFilePicker()`, and `showDirectoryPicker()`. Its “allowed to show a file picker” algorithm rejects both:

- an **opaque origin**, and
- an origin that is not same-origin with the top-level origin,

with `SecurityError`; it also requires transient user activation. [File System Access specification: local file system handle factories](https://wicg.github.io/file-system-access/#local-file-system-handle-factories) · [picker eligibility algorithm](https://wicg.github.io/file-system-access/#is-allowed-to-show-a-file-picker)

Figma documents that the default plugin iframe has a null origin, so it fails the opaque-origin rule. Figma also permits navigating the iframe to a custom URL, but that custom origin would normally be cross-origin with the top-level `figma.com` page and would fail the same-origin rule. [Figma: non-null origin iframes](https://developers.figma.com/docs/plugins/creating-ui/#non-null-origin-iframes)

Therefore neither `showDirectoryPicker()` nor `showSaveFilePicker()` is a usable fix in this plugin UI. Feature-detecting the method is insufficient: the method can exist and still reject for origin/security reasons.

## 4. Practical alternatives to always downloading a ZIP

| Alternative | Separate files | One action | Setup | Verdict |
| --- | ---: | ---: | --- | --- |
| One visible Download button per rendered slice | Yes | No; one click/file | None, unless Automatic downloads is explicitly Blocked | **Best in-plugin fallback** |
| Allow Automatic downloads, turn off Ask where to save | Yes | Usually | User changes browser/site settings | Optional convenience only; null-origin attribution is not guaranteed |
| ZIP, offered as a secondary button | No | Yes | None | Keep as reliable bulk option, not mandatory for 2–3 slices |
| Same-origin top-level web app or installed native companion | Yes | Yes, after choosing a folder | New product surface/install | Can use folder/native filesystem APIs; far beyond this fix |
| Upload to a server and return links | Yes | Still one click/file unless archived | Server, storage, privacy/security work | Adds cost and does not remove browser download rules |
| Open several tabs/windows or synthesize several clicks | Maybe | Yes | None | Popup/download blockers; not reliable |

Within a null-origin Figma plugin iframe there is no documented standards-based API that writes several separate user-visible files from one click without one of these three things: browser permission, one user gesture per file, or one container file such as ZIP.

## Product recommendation

For 2–3 slices, prepare all files, then show a **Download next** action that consumes one file per click. Keep ZIP as a parallel bulk option without consuming the separate-file queue. Include one short hint: “Turn off ‘Ask where to save each file’ to send each clicked file straight to Downloads.” Do not claim that turning it off enables multi-downloads, and do not require users to grant Automatic downloads for `figma.com`.

## Verification matrix

Run this in Figma web on both Chrome and Edge:

1. Automatic downloads = Ask/default; Ask where to save = Off; click each of 3 Download buttons once. Expect 3 separate files in Downloads.
2. Automatic downloads = Block; repeat. Record whether file 2/3 are blocked, then restore Ask/default.
3. Automatic downloads = Allow for `figma.com`; use one bulk action that scripts 3 downloads. Record whether the null-origin iframe is covered; this result is browser/host evidence, not an API guarantee.
4. Call `showDirectoryPicker()` from a direct click only as a diagnostic. Expect `SecurityError` in the default null-origin iframe.
5. Confirm the ZIP option produces one download containing all slices while leaving the separate files available.
