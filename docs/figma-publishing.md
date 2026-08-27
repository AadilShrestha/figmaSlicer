# Publish Email Slicer to Figma Community

Verified against official Figma documentation on 2026-08-26. Figma now calls locally coded plugins **classic plugins** to distinguish them from generative plugins.

## Before submitting

- Use the Figma desktop app on macOS or Windows; publishing is supported on any plan.
- Enable two-factor authentication on the publishing account.
- Create a Community profile: file browser avatar → **Create your Community profile**. Organization and Enterprise accounts may also be limited by their Community publishing permissions.
- Open/import the development plugin and test the exact build that will be submitted.
- Decide whether to publish as yourself, an eligible team, or an organization. A free public plugin does not require paid-creator approval; paid plugins do.

Sources: [Publish classic plugins](https://help.figma.com/hc/en-us/articles/360042293394-Publish-classic-plugins-to-the-Figma-Community), [Create a Community profile](https://help.figma.com/hc/en-us/articles/360038510833-Create-a-Community-profile), [Community publishing permissions](https://help.figma.com/hc/en-us/articles/360041423614-Community-publishing-permissions).

## Manifest ID

The `id` in `manifest.json` identifies the Community listing that receives updates. Figma assigns it when a plugin is created through Figma, or can assign a new one during first publication.

This repository currently uses the development placeholder `email-slicer-local`. At first publication, obtain the real Figma-assigned ID and keep that value in every future release. Do not invent a different ID for an update; a new ID means a new plugin/listing.

Source: [Plugin manifest: `id`](https://developers.figma.com/docs/plugins/manifest/).

## Submission path

In the desktop app:

1. Create or open any Figma file.
2. Open the Figma menu → **Plugins → Manage plugins**.
3. Open the three-dot menu beside Email Slicer → **Publish**.
4. Complete the **Publish plugin** modal.
5. Click **Publish** to submit it for review.

Source: [Publish classic plugins](https://help.figma.com/hc/en-us/articles/360042293394-Publish-classic-plugins-to-the-Figma-Community).

## Listing checklist

Prepare:

- Plugin name, short tagline, accurate description, category, and setup/usage instructions.
- Icon; Figma recommends **128 × 128 px**.
- Thumbnail image or video; Figma recommends **1920 × 1080 px**.
- Optional playground file and up to nine optional carousel images/videos.
- Required support contact: an email address or a website/help-center URL. The publisher, not Figma, supports users.
- Correct publishing destination/profile and a review of the network-access label generated from `manifest.json`.

Email Slicer declares no network access (`allowedDomains: ["none"]`), so confirm the modal says **No access to network**, not **Unknown network access**.

Sources: [Publish classic plugins](https://help.figma.com/hc/en-us/articles/360042293394-Publish-classic-plugins-to-the-Figma-Community), [Manage classic plugins](https://help.figma.com/hc/en-us/articles/360042293714-Manage-classic-plugins-as-a-developer).

## Privacy and security

- A privacy policy is required if the plugin processes user data; it must satisfy applicable law and remain maintained.
- Clearly disclose third-party accounts, payments, licensing, and data sharing, and obtain necessary permissions for third-party sharing.
- The Data security disclosure is optional but encouraged. Figma reviews its answers separately; approval may take up to two weeks, after which answers appear to signed-in Community users.
- Plugins must use only official Figma Plugin APIs and must not read or modify files without the user's awareness and consent.

Email Slicer operates locally and declares no network access. Verify that its listing says this accurately; do not claim that a privacy policy is unnecessary unless its actual release behavior processes no user data outside Figma.

Sources: [Plugin and widget review guidelines](https://help.figma.com/hc/en-us/articles/360039958914-Plugin-and-widget-review-guidelines), [Security disclosure principles](https://help.figma.com/hc/en-us/articles/16354660649495-Security-disclosure-principles).

## Review and release testing

Figma requires thorough testing across varied scenarios and rejects incomplete plugins, crashes, obvious bugs, inaccurate descriptions, poor usability, material performance harm, weak privacy/security, or non-official API use. Its publishing checklist specifically calls out empty, wrong-type, multiple, and component selections; missing fonts; large documents; offline network behavior; deleted nodes; multiplayer changes; rotations; unnecessary all-page loading; and oversized development bundles.

Before submission, test at minimum:

- No selection, one frame, and multiple frames.
- Existing slices plus new, undo, and cleared cut points.
- Small and very large frames/documents, including files with multiple pages.
- Plugin restart and persisted settings.
- Slice/export correctness, duplicate names, and failure messages.
- Production output rather than a development/debug build.

The initial public submission appears under **Published** with an **In review** badge. Figma emails the account address with its decision; it gives no fixed plugin-review SLA. Rejected plugins may be corrected and resubmitted, and updates may be pushed while initial review is pending. Private organization plugins are not reviewed for Community publication.

Sources: [Publishing robustness checklist](https://developers.figma.com/docs/plugins/publishing/), [Plugin and widget review guidelines](https://help.figma.com/hc/en-us/articles/360039958914-Plugin-and-widget-review-guidelines), [Publish classic plugins](https://help.figma.com/hc/en-us/articles/360042293394-Publish-classic-plugins-to-the-Figma-Community).

## Publishing updates

Desktop app → **Plugins → Manage plugins** → plugin menu → **Publish new version**. If that command is missing, choose **Locate local version**, select the same plugin's `manifest.json`, then publish.

Approved-plugin updates ordinarily go live immediately for every user. Users only receive the latest version and cannot revert; rollback requires republishing an earlier build. Listing copy and artwork can be changed without a code release from the Community page via **Manage resource → Edit this page**.

Important caveat: although ordinary updates are immediate, Figma's review guidelines reserve re-review for material updates and periodic compliance checks. If the plugin's core purpose changes substantially, Figma says to create a separate plugin/listing.

Source: [Manage classic plugins](https://help.figma.com/hc/en-us/articles/360042293714-Manage-classic-plugins-as-a-developer), [Plugin and widget review guidelines](https://help.figma.com/hc/en-us/articles/360039958914-Plugin-and-widget-review-guidelines).

## 2026 caveats

- Figma labels this workflow **classic plugins**; older links may redirect to renamed articles.
- Review rules are expressly evolving and non-exhaustive, so recheck the official pages immediately before submission.
- Plugins that recreate Figma functionality or work around paid offerings may be rejected. Current AI-specific examples include general-purpose AI chat, bring-your-own-model-key chat, and exposing an MCP server.
- Paid publication adds separate eligibility and Stripe requirements plus irreversible payee/payment-model constraints; none are needed for a free Email Slicer release.

Source: [Plugin and widget review guidelines](https://help.figma.com/hc/en-us/articles/360039958914-Plugin-and-widget-review-guidelines), [Publish classic plugins](https://help.figma.com/hc/en-us/articles/360042293394-Publish-classic-plugins-to-the-Figma-Community).
