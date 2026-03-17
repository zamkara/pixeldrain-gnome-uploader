#!/usr/bin/gjs -m

import Gtk from 'gi://Gtk?version=4.0';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

Gtk.init();
const loop = GLib.MainLoop.new(null, false);

const chooser = new Gtk.FileChooserNative({
    title: 'Choose files to upload',
    action: Gtk.FileChooserAction.OPEN,
    modal: true,
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
    print(JSON.stringify(paths));
    loop.quit();
});

chooser.show();
loop.run();
