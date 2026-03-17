#!/usr/bin/gjs -m

import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gtk.init();

let resolved = false;

function finish(paths) {
    if (resolved)
        return;

    resolved = true;
    print(JSON.stringify(paths));
    app.quit();
}

function openPicker(parent) {
    const chooser = new Gtk.FileChooserNative({
        title: 'Choose files to upload',
        action: Gtk.FileChooserAction.OPEN,
        modal: true,
        transient_for: parent,
        select_multiple: true,
    });

    chooser.connect('response', (dialog, response) => {
        const paths = [];

        if (response === Gtk.ResponseType.ACCEPT) {
            const files = dialog.get_files();
            const count = files.get_n_items();

            for (let i = 0; i < count; i++) {
                const file = files.get_item(i);
                if (file instanceof Gio.File) {
                    const path = file.get_path();
                    if (path)
                        paths.push(path);
                }
            }
        }

        dialog.destroy();

        if (paths.length > 0)
            finish(paths);
    });

    chooser.show();
}

const app = new Gtk.Application({
    application_id: 'com.zam.PixeldrainDropzone',
    flags: Gio.ApplicationFlags.NON_UNIQUE,
});

app.connect('activate', application => {
    const window = new Gtk.ApplicationWindow({
        application,
        title: 'Pixeldrain Dropzone',
        default_width: 420,
        default_height: 240,
        modal: true,
        resizable: false,
    });

    const outer = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 16,
        margin_top: 24,
        margin_bottom: 24,
        margin_start: 24,
        margin_end: 24,
    });

    const frame = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 10,
        vexpand: true,
        hexpand: true,
        valign: Gtk.Align.FILL,
        halign: Gtk.Align.FILL,
        css_classes: ['card'],
        margin_top: 12,
        margin_bottom: 12,
        margin_start: 12,
        margin_end: 12,
    });

    const title = new Gtk.Label({
        label: 'Drop files here',
        css_classes: ['title-3'],
        wrap: true,
        justify: Gtk.Justification.CENTER,
        halign: Gtk.Align.CENTER,
        margin_top: 36,
    });

    const subtitle = new Gtk.Label({
        label: 'or click the button below to choose files',
        wrap: true,
        justify: Gtk.Justification.CENTER,
        halign: Gtk.Align.CENTER,
        margin_bottom: 12,
    });

    const button = new Gtk.Button({
        label: 'Choose Files',
        halign: Gtk.Align.CENTER,
        margin_bottom: 32,
    });
    button.connect('clicked', () => openPicker(window));

    frame.append(title);
    frame.append(subtitle);
    frame.append(button);

    const dropTarget = Gtk.DropTarget.new(Gdk.FileList, Gdk.DragAction.COPY);
    dropTarget.connect('drop', (_target, value) => {
        const fileList = value?.get_files ? value : value?.get_object?.();
        const paths = [];

        if (fileList) {
            const files = fileList.get_files();
            const count = files.get_n_items();

            for (let i = 0; i < count; i++) {
                const file = files.get_item(i);
                if (file instanceof Gio.File) {
                    const path = file.get_path();
                    if (path)
                        paths.push(path);
                }
            }
        }

        if (paths.length > 0) {
            finish(paths);
            return true;
        }

        return false;
    });
    frame.add_controller(dropTarget);

    outer.append(frame);
    window.set_child(outer);
    window.present();
});

app.run([]);
