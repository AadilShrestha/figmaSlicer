# Figma native export unexpectedly saves one slice as ZIP

Research date: 2026-08-27

## Finding

The strongest explanation is that the selected slice was nested inside the email frame. Before the fix, Email Slicer's `markSlices()` path reparented a newly created `SliceNode` into the selected frame whenever that frame accepted children. Figma's own Plugin API does the opposite by default: `figma.createSlice()` creates a slice directly under `figma.currentPage`.

This is a Figma native-export packaging behavior, not the plugin's JPG encoder and not Windows/WinRAR changing the format. The Save dialog explicitly has a `.zip` filename and `*.zip` type. The screenshot also shows one selected object (`Export slice 33`), one JPEG configuration, and a visible preview.

The implemented fix keeps plugin-created slices at the page level and preserves their visual position with page/absolute coordinates.

## Confirmed facts

### Official Figma documentation

- A `SliceNode` is an invisible bounding box whose purpose is to export a specific region. Figma says slices are normally given `exportSettings` and exported through `exportAsync`: [SliceNode](https://developers.figma.com/docs/plugins/api/SliceNode/).
- `figma.createSlice()` creates a slice under `figma.currentPage` by default: [createSlice](https://developers.figma.com/docs/plugins/api/properties/figma-createslice/).
- Figma permits reparenting a `SceneNode` with `appendChild()` when the target supports children, subject to restrictions. This means a nested slice can be API-valid without being equivalent to Figma's default page-level slice placement: [appendChild](https://developers.figma.com/docs/plugins/api/properties/nodes-appendchild/).
- Figma's normal export flow applies an export configuration to the current selection. A preview is not shown when multiple objects are selected. In the desktop app, Figma opens a prompt to rename the export and choose its destination: [Export static designs from Figma](https://help.figma.com/hc/en-us/articles/360040028114-Export-static-designs-from-Figma).
- The same Help Center article documents slash-separated export names as folder paths. Its example, `button/pill/default`, is exported into `button/pill/` with the file named `default`. Figma does not state in that article exactly when the desktop app wraps such a folder hierarchy in a ZIP.
- Plugin-side `exportAsync()` returns encoded JPG/PNG bytes (`Uint8Array`); it does not invoke Figma's native Save dialog. Therefore the plugin cannot configure the native sidebar export's archive behavior. It can only avoid document structures/names that trigger it, or use its own downloader: [exportAsync](https://developers.figma.com/docs/plugins/api/properties/nodes-exportasync/).

### Evidence in this repository and report

- Before the fix, `code.js` created each slice with `figma.createSlice()`, then called `node.appendChild(slice)` when `canNest(node)` succeeded. The fix removes that reparenting.
- The supplied Figma screenshot says `Export slice 33`, has one `2x JPEG` configuration, and displays a preview. This is consistent with one selected export target, not an accidental multi-selection.
- The Windows Save dialog defaults to the Figma document name plus `.zip`. Because the extension and file type are ZIP, WinRAR is only the registered ZIP handler; it is not converting a JPEG into an archive.

## First-party-hosted community evidence

Figma's official community forum has an exact report, [“Figma is only exporting zip folders instead of single files”](https://forum.figma.com/ask-the-community-7/figma-is-only-exporting-zip-folders-instead-of-single-files-16446). The thread includes these user-reported fixes:

- One user stopped the ZIP by moving a frame out of another frame.
- Another stopped it by removing `/` from the page name.
- Another stopped it by moving the frame out of a section.

These reports closely support the nested-parent and slash-path explanations. However, the answers are community posts, not a Figma employee statement or product specification. The thread does not establish the exact internal ZIP rule.

## Leading hypothesis

Figma native export derives a folder/path context from an export target's ancestry or naming. When Email Slicer puts a slice inside a frame, Figma may package that path context as a ZIP even though only one JPEG-producing slice is selected. A page-level slice has no containing frame path, matches `createSlice()`'s documented default, and should save as one `.jpg`.

Confidence: **high enough to implement and test, but not officially specified**. Figma documents page-level creation and folder-generating slash names, and multiple forum users report nesting as the ZIP trigger; Figma does not publish the desktop export packager's decision algorithm.

## Other possible triggers to rule out

1. A `/` in the slice, ancestor frame, section, page, or file name. Figma officially documents slash-based export folders; the forum specifically reports a slash in a page name causing ZIP output.
2. A Figma desktop regression affecting all exports. Test a new page-level manual slice in the same file and in a blank file.
3. Multiple selected nodes or multiple export configurations. The screenshots argue against both: the button names one slice, shows one setting, and the preview is visible.

## Minimal confirmation matrix

Run these in the same file and Figma desktop version:

| Case | Expected result if hypothesis is correct |
| --- | --- |
| Existing Email Slicer slice nested under the frame | ZIP |
| The same slice reparented to the page, same name/settings/bounds | Direct `.jpg` |
| Fresh manual page-level slice with one JPEG setting | Direct `.jpg` |
| Page-level slice after removing `/` from slice/ancestor/page/file names | Direct `.jpg` |

The decisive comparison is the first two rows. If reparenting alone changes ZIP to JPG, nesting is confirmed locally and no download-code change is needed.
