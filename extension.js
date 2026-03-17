import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Animation from 'resource:///org/gnome/shell/ui/animation.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const CURL_PATH = '/usr/bin/curl';
const PICKER_SCRIPT = 'helpers/pick-files.js';
const RECENT_LIMIT = 10;
const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;
const FILE_NAME_MAX = 30;

function safeParseUploads(serialized) {
    try {
        const parsed = JSON.parse(serialized);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
        return [];
    }
}

function truncateMiddle(text, maxLength = FILE_NAME_MAX) {
    if (!text || text.length <= maxLength)
        return text;

    const visible = maxLength - 1;
    const left = Math.ceil(visible / 2);
    const right = Math.floor(visible / 2);
    return `${text.slice(0, left)}…${text.slice(-right)}`;
}

const PixeldrainUploaderButton = GObject.registerClass(
class PixeldrainUploaderButton extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'Pixeldrain Uploader');

        this._extension = extension;
        this._settings = extension.getSettings();
        this._clipboard = St.Clipboard.get_default();
        this._uploads = safeParseUploads(this._settings.get_string('recent-uploads'));
        this._uploadQueue = [];
        this._uploading = false;
        this._activeUpload = null;

        this.add_child(new St.Icon({
            gicon: Gio.icon_new_for_string(`${this._extension.path}/icons/pixeldrain-symbolic.svg`),
            style_class: 'system-status-icon',
        }));

        this.connect('button-press-event', (_actor, event) => this._handlePanelPress(event));
        this.connect('button-release-event', (_actor, event) => this._handlePanelRelease(event));

        this._statusItem = new PopupMenu.PopupMenuItem('Ready', {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(this._statusItem);

        this._uploadItem = new PopupMenu.PopupImageMenuItem('Upload File', 'folder-upload-symbolic');
        this._uploadItem.connect('activate', () => this._openPicker());
        this.menu.addMenuItem(this._uploadItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._uploadsCardItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        this._uploadsCardBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'pixeldrain-uploads-card',
        });
        this._uploadsCardItem.add_child(this._uploadsCardBox);
        this.menu.addMenuItem(this._uploadsCardItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._prefsItem = new PopupMenu.PopupMenuItem('Open settings');
        this._prefsItem.connect('activate', () => this._extension.openPreferences());
        this.menu.addMenuItem(this._prefsItem);

        this._settings.connectObject(
            'changed::api-key', () => this._syncStatus(),
            'changed::recent-uploads', () => this._reloadRecentUploads(),
            this
        );

        this._syncStatus();
        this._renderUploads();
    }

    _syncStatus() {
        const hasApiKey = Boolean(this._settings.get_string('api-key').trim());

        if (this._uploading && this._activeUpload) {
            this._statusItem.label.text = `Uploading ${this._activeUpload.name}...`;
            return;
        }

        if (this._uploadQueue.length > 0) {
            this._statusItem.label.text = `${this._uploadQueue.length} upload(s) queued`;
            return;
        }

        if (hasApiKey)
            this._statusItem.label.text = 'Upload file here';
        else
            this._statusItem.label.text = 'Set your API key in settings';
    }

    _handlePanelPress(event) {
        this._pressedButton = event.get_button();
        return Clutter.EVENT_STOP;
    }

    _handlePanelRelease(event) {
        const button = event.get_button() || this._pressedButton;
        this._pressedButton = null;

        if (button === 1) {
            this.menu.close();
            this._openPicker();
            return Clutter.EVENT_STOP;
        }

        if (button === 2 || button === 3) {
            this.menu.open();
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_STOP;
    }

    _reloadRecentUploads() {
        this._uploads = safeParseUploads(this._settings.get_string('recent-uploads'));
        this._renderUploads();
        this._syncStatus();
    }

    _createProgressRow(upload) {
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });

        const box = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'pixeldrain-upload-row',
        });

        const topLine = new St.BoxLayout({
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const nameLabel = new St.Label({
            text: truncateMiddle(upload.name),
            style_class: 'pixeldrain-file-name',
            x_expand: true,
        });
        nameLabel.clutter_text.ellipsize = Pango.EllipsizeMode.MIDDLE;
        nameLabel.clutter_text.single_line_mode = true;

        const spinner = new Animation.Spinner(16);
        spinner.play();

        topLine.add_child(nameLabel);
        topLine.add_child(spinner);
        box.add_child(topLine);
        item.add_child(box);

        return {
            item,
            nameLabel,
            spinner,
        };
    }

    _createSavedUploadRow(upload) {
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });

        const line = new St.BoxLayout({
            x_expand: true,
            style_class: 'pixeldrain-upload-row',
        });

        const nameLabel = new St.Label({
            text: truncateMiddle(upload.name ?? 'Unknown file'),
            style_class: 'pixeldrain-file-name',
            x_expand: true,
        });
        nameLabel.clutter_text.ellipsize = Pango.EllipsizeMode.MIDDLE;
        nameLabel.clutter_text.single_line_mode = true;

        const copyButton = new St.Button({
            style_class: 'pixeldrain-copy-button',
            can_focus: true,
            child: new St.Icon({
                icon_name: 'edit-copy-symbolic',
                style_class: 'popup-menu-icon',
            }),
        });
        copyButton.connect('clicked', () => this._copyLink(upload.url, upload.name));

        line.add_child(nameLabel);
        line.add_child(copyButton);
        item.add_child(line);

        return item;
    }

    _renderUploads() {
        this._uploadsCardBox.remove_all_children();

        if (this._activeUpload?.row)
            this._uploadsCardBox.add_child(this._activeUpload.row.item);

        if (this._uploads.length === 0 && !this._activeUpload) {
            this._uploadsCardBox.add_child(new St.Label({
                text: 'No uploads yet',
                style_class: 'pixeldrain-empty-state',
                x_expand: true,
            }));
            return;
        }

        for (const upload of this._uploads)
            this._uploadsCardBox.add_child(this._createSavedUploadRow(upload));
    }

    _copyLink(url, name) {
        if (!url)
            return;

        this._clipboard.set_text(CLIPBOARD_TYPE, url);
        Main.notify('Pixeldrain Uploader', `Copied link for ${name}`);
    }

    _ensureApiKey() {
        const apiKey = this._settings.get_string('api-key').trim();
        if (!apiKey) {
            Main.notify('Pixeldrain Uploader', 'Set the Pixeldrain API key in extension settings first.');
            return null;
        }

        return apiKey;
    }

    _runJsonHelper(helperName, callback) {
        const helperPath = `${this._extension.path}/${helperName}`;
        const proc = Gio.Subprocess.new(
            ['/usr/bin/gjs', '-m', helperPath],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );

        proc.communicate_utf8_async(null, null, (_proc, result) => {
            try {
                const [, stdout, stderr] = proc.communicate_utf8_finish(result);
                if (!proc.get_successful()) {
                    Main.notify('Pixeldrain Uploader', (stderr || 'Helper process failed').trim());
                    return;
                }

                const paths = JSON.parse((stdout || '[]').trim() || '[]');
                if (Array.isArray(paths) && paths.length > 0)
                    callback(paths);
            } catch (error) {
                Main.notify('Pixeldrain Uploader', `Failed to read helper output: ${error.message}`);
            }
        });
    }

    _openPicker() {
        this._runJsonHelper(PICKER_SCRIPT, paths => this._queueUploads(paths));
    }

    _queueUploads(paths) {
        const uniquePaths = [...new Set(paths.filter(path => typeof path === 'string' && path.length > 0))];
        if (uniquePaths.length === 0)
            return;

        this._uploadQueue.push(...uniquePaths);
        this._syncStatus();

        if (!this._uploading)
            this._processQueue();
    }

    _processQueue() {
        const apiKey = this._ensureApiKey();
        if (!apiKey) {
            this._uploadQueue = [];
            this._uploading = false;
            this._syncStatus();
            return;
        }

        const nextPath = this._uploadQueue.shift();
        if (!nextPath) {
            this._uploading = false;
            this._activeUpload = null;
            this._renderUploads();
            this._syncStatus();
            return;
        }

        const fileName = GLib.path_get_basename(nextPath);
        this._uploading = true;
        this._activeUpload = {
            name: fileName,
            path: nextPath,
            row: this._createProgressRow({name: fileName}),
        };
        this._renderUploads();
        this._syncStatus();
        this._uploadFile(nextPath, apiKey, () => this._processQueue());
    }

    _finishActiveUpload(uploaded) {
        this._activeUpload = null;
        this._uploading = false;

        if (uploaded) {
            this._uploads = [uploaded, ...this._uploads].slice(0, RECENT_LIMIT);
            this._settings.set_string('recent-uploads', JSON.stringify(this._uploads));
        }

        this._renderUploads();
        this._syncStatus();
    }

    _uploadFile(filePath, apiKey, done) {
        if (!GLib.file_test(filePath, GLib.FileTest.EXISTS)) {
            Main.notify('Pixeldrain Uploader', `File not found: ${filePath}`);
            this._finishActiveUpload(null);
            done();
            return;
        }

        const fileName = GLib.path_get_basename(filePath);
        const url = `https://pixeldrain.com/api/file/${encodeURIComponent(fileName)}`;
        const auth = GLib.base64_encode(new TextEncoder().encode(`:${apiKey}`));
        const proc = Gio.Subprocess.new(
            [
                CURL_PATH,
                '--silent',
                '--show-error',
                '--globoff',
                '--request', 'PUT',
                '--upload-file', filePath,
                '--header', `Authorization: Basic ${auth}`,
                '--write-out', '\n%{http_code}',
                '--url', url,
            ],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );

        proc.communicate_utf8_async(null, null, (_proc, result) => {
            let uploaded = null;

            try {
                const [, stdout, stderr] = proc.communicate_utf8_finish(result);
                const lines = (stdout || '').trimEnd().split('\n');
                const httpCode = Number.parseInt(lines.pop() ?? '0', 10);
                const body = lines.join('\n').trim();

                if (stderr && stderr.trim().length > 0 && httpCode === 0) {
                    Main.notify('Pixeldrain Uploader', stderr.trim());
                    return;
                }

                let payload = {};
                if (body.length > 0) {
                    try {
                        payload = JSON.parse(body);
                    } catch (_error) {
                        payload = {};
                    }
                }

                if (httpCode < 200 || httpCode >= 300 || !payload.id) {
                    const message = payload.message || stderr.trim() || 'Upload failed.';
                    Main.notify('Pixeldrain Uploader', `${fileName}: ${message}`);
                    return;
                }

                uploaded = {
                    id: payload.id,
                    name: fileName,
                    url: `https://pixeldrain.com/u/${payload.id}`,
                    uploadedAt: new Date().toISOString(),
                };
                this._clipboard.set_text(CLIPBOARD_TYPE, uploaded.url);
                Main.notify('Pixeldrain Uploader', `Uploaded ${fileName}`);
            } catch (error) {
                Main.notify('Pixeldrain Uploader', `Upload failed: ${error.message}`);
            } finally {
                this._finishActiveUpload(uploaded);
                done();
            }
        });
    }

    destroy() {
        this._settings.disconnectObject(this);
        super.destroy();
    }
});

export default class PixeldrainUploaderExtension extends Extension {
    enable() {
        this._button = new PixeldrainUploaderButton(this);
        Main.panel.addToStatusArea('pixeldrain-uploader', this._button);
    }

    disable() {
        this._button?.destroy();
        this._button = null;
    }
}
