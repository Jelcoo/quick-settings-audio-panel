import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { get_settings, get_stack, rsplit, split } from './libs/libpanel/utils.js';
import { get_pactl_path } from "./libs/utils.js";

export default class QSAPPreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window: Adw.PreferencesWindow) {
        const settings = this.getSettings();

        // Update ordering from older versions
        let ordering = settings.get_strv("ordering");
        if (ordering.length < 5) ordering = ["volume-output", "sink-mixer", "volume-input", "media", "mixer"];
        if (ordering.length < 6) ordering.push("balance-slider");
        if (ordering.length < 7) ordering.push("profile-switcher");
        settings.set_strv("ordering", ordering);

        window.add(this.makeExtensionSettingsPage(settings));

        // we remove the 'file://' and the filename at the end
        const parent_folder = '/' + split(rsplit(get_stack()[0].file, '/', 1)[0], '/', 3)[3];
        const libpanel_settings = get_settings(`${parent_folder}/libs/libpanel/org.gnome.shell.extensions.libpanel.gschema.xml`);
        window.add(this.makeLibpanelSettingsPage(libpanel_settings));
    }

    makeExtensionSettingsPage(settings: Gio.Settings): Adw.PreferencesPage {
        const page = new Adw.PreferencesPage({ title: "Extension settings", icon_name: "preferences-system-symbolic" });

        // ====================================== Main group ======================================
        const main_group = new PreferencesGroup();
        main_group.add_switch(settings, "move-master-volume",
            {
                title: _("Move master volume sliders"),
                subtitle: _("Thoses are the speaker / headphone and microphone volume sliders")
            }
        );
        main_group.add_switch(settings, "always-show-input-slider",
            {
                title: _("Always show microphone volume slider"),
                subtitle: _("Show even when there is no application recording audio")
            }
        );
        main_group.add_combobox(settings, "media-control",
            {
                title: _("Media controls"),
                subtitle: _("What should we do with media controls ?"),
                fields: [
                    ["none", _("Leave as is")],
                    ["move", _("Move into new panel")],
                    ["duplicate", _("Duplicate into new panel")]
                ]
            }
        );

        const mixer_slier_switch = main_group.add_switch(settings, "create-mixer-sliders",
            {
                title: _("Create applications mixer"),
            }
        );
        main_group.add_switch(settings, "ignore-css",
            {
                title: _("Do not apply custom CSS"),
                subtitle: _("Disable the CSS in this extension that could override your theme")
            }
        );
        main_group.add_switch(settings, "create-sink-mixer",
            {
                title: _("Create per-device volume sliders"),
            }
        );
        main_group.add_switch(settings, "show-current-device",
            {
                title: _("Show the currently selected device for the master sliders"),
            }
        );
        main_group.add_switch(settings, "remove-output-slider",
            {
                title: _("Remove the output slider"),
                subtitle: _("This is useful if you enabled the per-device volume sliders")
            }
        );
        const balance_slider_switch = main_group.add_switch(settings, "create-balance-slider",
            {
                title: _("Add a balance slider"),
            }
        );
        main_group.add_switch(settings, "create-profile-switcher",
            {
                title: _("Add a profile switcher"),
                subtitle: _("Allows you to quickly change the audio profile of the current device")
            }
        );
        main_group.add_switch(settings, "autohide-profile-switcher",
            {
                title: _("Auto-hide the profile switcher"),
                subtitle: _("Hide the profile switcher when the current device only have one profile")
            }
        );
        main_group.add_switch(settings, "merge-panel",
            {
                title: _("Merge the new panel into the main one"),
                subtitle: _("The new panel will not be separated from the main one")
            }
        );
        const position_dropdown = main_group.add_combobox(settings, "panel-position",
            {
                title: _("Panel position"),
                subtitle: _("Where the new panel should be located relative to the main panel"),
                fields: [
                    ["top", _("Top")],
                    ["bottom", _("Bottom")]
                ]
            }
        );
        settings.bind("merge-panel", position_dropdown, "visible", Gio.SettingsBindFlags.GET);

        main_group.add_switch(settings, "separate-indicator",
            {
                title: _("Put the panel in a separate indicator"),
            }
        );

        const pactl_callbacks = [
            (found: boolean) => {
                let subtitle = _("Thoses sliders are the same you can find in pavucontrol or in the sound settings");
                if (!found) {
                    subtitle += "\n" + _(`<span color="darkorange" weight="bold"><tt>pactl</tt> was not found, you won't be able to change the output device per application</span>`);
                }
                mixer_slier_switch.subtitle = subtitle;
            },
            (found: boolean) => {
                let subtitle = _("This slider allows you to change the balance of the current output");
                if (!found) {
                    subtitle += "\n" + _(`<span color="darkorange" weight="bold"><tt>pactl</tt> was not found, the slider won't work</span>`);
                }
                balance_slider_switch.subtitle = subtitle;
            }
        ];
        const pactl_path_entry = main_group.add_file_chooser(settings, "pactl-path",
            {
                title: _("Path to the <tt>pactl</tt> executable"),
            }
        );

        const update_pactl_status = (): [boolean, boolean] => {
            let [pactl_path, found_using_custom_path] = get_pactl_path(settings);

            for (const callback of pactl_callbacks) {
                callback(pactl_path !== null);
            }

            return [pactl_path !== null, found_using_custom_path];
        };
        const [found_pactl, found_pactl_using_path] = update_pactl_status();
        settings.connect("changed::pactl-path", () => update_pactl_status());
        pactl_path_entry.visible = found_pactl_using_path || !found_pactl;

        // ================================= Widget ordering group ================================
        const widgets_order_group = new ReorderablePreferencesGroup(settings, "ordering", {
            title: _("Elements order"),
            description: _("Reorder elements in the new panel (disabled elments will just be ignored)")
        });

        widgets_order_group.add(new DraggableRow("profile-switcher", { title: _("Profile switcher") }));
        widgets_order_group.add(new DraggableRow("volume-output", { title: _("Speaker / Headphone volume slider") }));
        widgets_order_group.add(new DraggableRow("sink-mixer", { title: _("Per-device volume sliders") }));
        widgets_order_group.add(new DraggableRow("balance-slider", { title: _("Output balance slider") }));
        widgets_order_group.add(new DraggableRow("volume-input", { title: _("Microphone volume slider") }));
        widgets_order_group.add(new DraggableRow("media", { title: _("Media controls") }));
        widgets_order_group.add(new DraggableRow("mixer", { title: _("Applications mixer") }));

        // ================================== Mixer filter group ==================================
        const add_filter_button = new Gtk.Button({ icon_name: "list-add", has_frame: false });
        const mixer_filter_group = new PreferencesGroup({
            title: _("Mixer filtering"),
            description: _("Allow you to filter the streams that show up in the application mixer **using regexes**"),
            header_suffix: add_filter_button
        });
        mixer_filter_group.add_combobox(settings, "filter-mode",
            {
                title: _("Filtering mode"),
                subtitle: _("On blacklist mode, matching elements are removed from the list. On whitelist mode, only matching elements will be shown"),
                fields: [
                    ['blacklist', _("Blacklist")],
                    ['whitelist', _("Whitelist")],
                ]
            }
        );

        const filters = [];
        const create_filter_row = (text) => {
            const new_row = new Adw.EntryRow({ "title": _("Stream name") });
            if (text != undefined) new_row.text = text;

            const delete_button = new Gtk.Button({ icon_name: "user-trash-symbolic", has_frame: false });
            delete_button.connect("clicked", () => {
                mixer_filter_group.remove(new_row);
                filters.splice(filters.indexOf(new_row), 1);
                save_filters(settings, filters);
            });
            new_row.add_suffix(delete_button);

            new_row.connect("changed", () => {
                try {
                    new RegExp(new_row.text);
                } catch (e) {
                    new_row.title = "<span color=\"red\" weight=\"bold\">Invalid regex (filters were not saved)</span>";
                    return;
                }
                new_row.title = "Stream name";
                save_filters(settings, filters);
            });

            filters.push(new_row);
            mixer_filter_group.add(new_row);
        };
        add_filter_button.connect("clicked", () => {
            create_filter_row();
        });

        for (const filter of settings.get_strv("filters")) {
            create_filter_row(filter);
        }

        // ================================ Sink mixer filter group ===============================
        const sink_add_filter_button = new Gtk.Button({ icon_name: "list-add", has_frame: false });
        const sink_mixer_filter_group = new PreferencesGroup({
            title: _("Output sliders filtering"),
            description: _("Allow you to filter the per-device volume sliders. The content of the filters are regexes and are applied to the device's display name and pulseaudio name."),
            header_suffix: sink_add_filter_button
        });
        sink_mixer_filter_group.add_combobox(settings, "sink-filter-mode",
            {
                title: _("Filtering mode"),
                subtitle: _("On blacklist mode, matching elements are removed from the list. On whitelist mode, only matching elements will be shown"),
                fields: [
                    ["blacklist", _("Blacklist")],
                    ["whitelist", _("Whitelist")],
                ]
            }
        );

        const sink_filters = [];
        const sink_create_filter_row = (text) => {
            const new_row = new Adw.EntryRow({ "title": _("Device name") });
            if (text != undefined) new_row.text = text;

            const delete_button = new Gtk.Button({ icon_name: "user-trash-symbolic", has_frame: false });
            delete_button.connect("clicked", () => {
                sink_mixer_filter_group.remove(new_row);
                sink_filters.splice(sink_filters.indexOf(new_row), 1);
                sink_save_filters(settings, sink_filters);
            });
            new_row.add_suffix(delete_button);

            new_row.connect("changed", () => {
                try {
                    new RegExp(new_row.text);
                } catch (e) {
                    new_row.title = "<span color=\"red\" weight=\"bold\">Invalid regex (filters were not saved)</span>";
                    return;
                }
                new_row.title = "Device name";
                sink_save_filters(settings, sink_filters);
            });

            sink_filters.push(new_row);
            sink_mixer_filter_group.add(new_row);
        };
        sink_add_filter_button.connect("clicked", () => {
            sink_create_filter_row();
        });

        for (const filter of settings.get_strv("sink-filters")) {
            sink_create_filter_row(filter);
        }
        
        page.add(main_group);
        page.add(widgets_order_group);
        page.add(mixer_filter_group);
        page.add(sink_mixer_filter_group);
        return page;
    }

    makeLibpanelSettingsPage(settings: Gio.Settings): Adw.PreferencesPage {
        const page = new Adw.PreferencesPage({
            title: "Libpanel settings",
            icon_name: "view-grid-symbolic"
        });
        const group = new PreferencesGroup({
            title: _("LibPanel settings"),
            description: _("Those settings are not specific to this extension, they apply to every panels"),
        });

        group.add_switch(settings, "single-column",
            {
                title: _("Single-column mode"),
                subtitle: _("Only one column of panels will be allowed. Also prevents the panel from being put at the left/right of the screen by libpanel.")
            }
        );
        group.add_combobox(
            settings, "alignment",
            {
                title: _("Panel alignment"),
                fields: [
                    ["left", _("Left")],
                    ["right", _("Right")],
                ]
            }
        );
        group.add_switch_spin(settings, "padding-enabled", "padding",
            {
                title: _("Padding"),
                subtitle: _("Use this to override the default padding of the panels")
            }, 0, 100
        );
        group.add_switch_spin(settings, "row-spacing-enabled", "row-spacing",
            {
                title: _("Row spacing"),
                subtitle: _("Use this to override the default row spacing of the panels")
            }, 0, 100
        );
        group.add_switch_spin(settings, "column-spacing-enabled", "column-spacing",
            {
                title: _("Column spacing"),
                subtitle: _("Use this to override the default column spacing of the panels")
            }, 0, 100
        );

        page.add(group);
        return page;
    }
}

const PreferencesGroup = GObject.registerClass(class PreferencesGroup extends Adw.PreferencesGroup {
    add_switch(
        settings: Gio.Settings,
        key: string,
        properties: Partial<Adw.SwitchRow.ConstructorProps>
    ): Adw.SwitchRow {
        const row = new Adw.SwitchRow(properties);
        settings.bind(
            key,
            row,
            "active",
            Gio.SettingsBindFlags.DEFAULT
        );

        this.add(row);
        return row;
    }

    add_combobox(
        settings: Gio.Settings,
        key: string,
        properties: Partial<Adw.ComboRow.ConstructorProps> & { fields: [string, string][] }
    ): Adw.ComboRow {
        const { fields, ...props } = properties;

        const model = Gtk.StringList.new(fields.map(x => x[1]));
        const row = new Adw.ComboRow({
            model: model,
            selected: fields.map(x => x[0]).indexOf(settings.get_string(key)),
            ...props
        });

        row.connect("notify::selected", () => {
            settings.set_string(key, fields[row.selected][0]);
        });

        this.add(row);
        return row;
    }

    add_switch_spin(
        settings: Gio.Settings,
        switch_key: string,
        spin_key: string,
        properties: { title: string, subtitle: string },
        lower: number = 0,
        higher: number = 0
    ): Adw.SpinRow {
        const row = Adw.SpinRow.new_with_range(lower, higher, 1);
        row.title = properties.title;
        row.subtitle = properties.subtitle;

        const switch_ = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        settings.bind(
            switch_key,
            switch_,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        row.add_prefix(switch_);
        row.activatable_widget = switch_;

        settings.bind(
            spin_key,
            row,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        this.add(row);
        return row;
    }

    add_file_chooser(
        settings: Gio.Settings,
        key: string,
        properties: Partial<Adw.EntryRow.ConstructorProps>
    ): Adw.EntryRow {
        const row = new Adw.EntryRow({ ...properties, show_apply_button: false });
        settings.bind(
            key,
            row,
            "text",
            Gio.SettingsBindFlags.DEFAULT
        );

        const chooser_button = new Gtk.Button({ label: "Choose file...", has_frame: false });
        chooser_button.connect("clicked", () => {
            const dialog = new Gtk.FileDialog();
            dialog.set_initial_file(Gio.File.new_for_path(row.text));
            dialog.open(null, null, (_, result) => {
                let path = dialog.open_finish(result)?.get_path();
                if (path !== null && path !== undefined)
                    row.text = path;
            });
        });
        row.add_suffix(chooser_button);

        this.add(row);
        return row;
    }
});

function save_filters(settings, filters) {
    settings.set_strv("filters", filters.map(filter => filter.text));
}

function sink_save_filters(settings, filters) {
    settings.set_strv("sink-filters", filters.map(filter => filter.text));
}

// From this point onwards, the code is mostly a reimplementation of this:
// https://gitlab.gnome.org/GNOME/gnome-control-center/-/tree/main/panels/search

const ReorderablePreferencesGroup = GObject.registerClass(class extends Adw.PreferencesGroup {
    constructor(settings, key, options) {
        super(options);
        this._settings = settings;
        this._key = key;

        this._list_box = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE });
        this._list_box.add_css_class('boxed-list');
        this._list_box.set_sort_func((a, b) => {
            const data = settings.get_strv(key);
            const index_a = data.indexOf(a.id);
            const index_b = data.indexOf(b.id);
            return index_a < index_b ? -1 : 1;
        });
        super.add(this._list_box);
    }

    add(row) {
        this._list_box.set_valign(Gtk.Align.FILL);
        row.connect('move-row', (source, target) => {
            this.selected_row = source;
            const data = this._settings.get_strv(this._key);
            const source_index = data.indexOf(source.id);
            const target_index = data.indexOf(target.id);
            if (target_index < source_index) {
                data.splice(source_index, 1); // remove 1 element at source_index
                data.splice(target_index, 0, source.id); // insert source.id at target_index
            } else {
                data.splice(target_index + 1, 0, source.id); // insert source.id at target_index
                data.splice(source_index, 1); // remove 1 element at source_index
            }
            this._settings.set_strv(this._key, data);
            this._list_box.invalidate_sort();
        });
        this._list_box.append(row);
    }
});

class DraggableRowClass extends Adw.ActionRow {
    constructor(id, options) {
        super(options);

        this.id = id;

        const drag_handle = new Gtk.Image({ icon_name: 'list-drag-handle-symbolic' });
        // css don't work
        drag_handle.add_css_class('drag-handle');
        this.add_prefix(drag_handle);

        const drag_source = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE });
        drag_source.connect('prepare', (source, x, y) => {
            this._drag_x = x;
            this._drag_y = y;
            return Gdk.ContentProvider.new_for_value(this);
        });
        drag_source.connect('drag-begin', (source, drag) => {
            this._drag_widget = new Gtk.ListBox();
            this._drag_widget.set_size_request(this.get_allocated_width(), this.get_allocated_height());

            const row_copy = new DraggableRow("", options);
            this._drag_widget.append(row_copy);
            this._drag_widget.drag_highlight_row(row_copy);

            Gtk.DragIcon.get_for_drag(drag).set_child(this._drag_widget);
            drag.set_hotspot(this._drag_x, this._drag_y);
        });
        this.add_controller(drag_source);

        const drop_target = Gtk.DropTarget.new(DraggableRow, Gdk.DragAction.MOVE);
        drop_target.preload = true;
        drop_target.connect('drop', (target, source, x, y) => {
            source.emit('move-row', this);

            return true;
        });
        this.add_controller(drop_target);
    }
}

const DraggableRow = GObject.registerClass({
    Signals: {
        flags: GObject.SignalFlags.RUN_LAST,
        'move-row': {
            param_types: [DraggableRowClass],
        }
    },
}, DraggableRowClass);
