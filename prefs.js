import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class PixeldrainUploaderPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Pixeldrain',
            description: 'Set the API key used by the panel uploader.',
        });

        const apiKeyRow = new Adw.PasswordEntryRow({
            title: 'API Key',
            text: settings.get_string('api-key'),
        });

        apiKeyRow.connect('changed', row => {
            settings.set_string('api-key', row.text.trim());
        });

        const helpRow = new Adw.ActionRow({
            title: 'Recent uploads storage',
            subtitle: 'Recent uploads are stored locally so the panel menu can show names and links.',
        });

        const clearRow = new Adw.ActionRow({
            title: 'Clear recent uploads',
        });

        const clearButton = new Gtk.Button({
            label: 'Clear',
            valign: Gtk.Align.CENTER,
        });
        clearButton.connect('clicked', () => settings.set_string('recent-uploads', '[]'));
        clearRow.add_suffix(clearButton);
        clearRow.activatable_widget = clearButton;

        group.add(apiKeyRow);
        group.add(helpRow);
        group.add(clearRow);
        page.add(group);
        window.add(page);
    }
}
