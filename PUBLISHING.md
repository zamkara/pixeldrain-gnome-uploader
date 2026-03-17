# Publishing Notes

## Before Uploading To extensions.gnome.org

- Review the extension description and mention clipboard behavior clearly
- Test on a fresh GNOME session before uploading

## Project Metadata

- Author: `zamkara`
- Project version: `0.1.0`
- Repository: `https://github.com/zamkara/pixeldrain-gnome-uploader`
- License: `GPL-3.0-or-later`

## Package Contents

The release zip should include:

- `extension.js`
- `prefs.js`
- `metadata.json`
- `stylesheet.css`
- `icons/`
- `helpers/pick-files.js`
- `schemas/org.gnome.shell.extensions.pixeldrain-uploader.gschema.xml`

The release zip should not include:

- `schemas/gschemas.compiled`
- unused helper files

## Review Risk

This extension currently uses external subprocesses:

- `/usr/bin/curl` for uploads
- `/usr/bin/gjs` for the file picker helper

That may receive extra scrutiny during review.
