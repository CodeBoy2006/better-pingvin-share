# Changelog

All notable changes to this project will be documented in this file.

## [1.15.0] - 2026-04-03

### Highlights

Better Pingvin Share 1.15.0 focuses on better administrator visibility and control, a smoother sharing and upload experience, and much richer in-browser file previews.

### Added

- QR code support for share links in the share completion modal and in the **My Shares** information panel.
- An admin storage overview on **Admin -> Share Management** showing total share storage usage and remaining local disk space.
- Clipboard support for uploads, including both pasted files and pasted plain text.
- A text editor modal for supported text-based uploads before they are sent.
- A one-click action to copy the contents of shared text files directly to the clipboard.
- Rich share previews for text and media files, including:
  - syntax-highlighted source code previews for common programming languages
  - Markdown rendering with GitHub Flavored Markdown support
  - LaTeX math rendering inside Markdown previews
  - inline previews for images, audio, video, and PDF files
- Office document previews for supported file types, including Word, Excel-compatible spreadsheets, and PowerPoint presentations.

### Changed

- Administrators can now opt in to access all shares, including shares that are password-protected, expired, or soft-deleted during the retention window.
- A new file retention workflow allows expired and uploader-deleted shares to remain available for a configurable period before permanent cleanup.
- When an uploader deletes a share, it is now soft-deleted first so administrators can still inspect it during the retention period.
- Administrators can now change the default share expiration from the configuration UI.
- The admin share management table now shows a **Deletes on** column when file retention is enabled.
- File previews now use both filename extensions and lightweight content sniffing to classify files more accurately.
- Unknown but previewable small files can now be identified and rendered without relying only on MIME guesses.

### Fixed

- Permanent upload failures, including server-capacity and file-size errors, no longer get stuck in endless retry loops.
- Missing config rows are now backfilled automatically on startup, preventing upgraded instances from crashing when new config variables are introduced.
- Newly introduced share retention settings now upgrade cleanly even on older databases that do not yet contain the required config entries.
- Direct text/code preview detection now avoids incorrect MIME-based classifications for certain extensions such as `.ts`.

### Upgrade notes

- This release introduces new administrator-facing share controls, including share-wide admin access and file retention settings.
- Existing installations are automatically backfilled with any missing config rows at startup, so a manual reseed is no longer required when upgrading to 1.15.0.
- Preview functionality now pulls in additional frontend-only viewer dependencies for Markdown, code, Office files, and embedded media.
