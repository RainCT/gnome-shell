/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Big = imports.gi.Big;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Mainloop = imports.mainloop;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const Signals = imports.signals;

const AppDisplay = imports.ui.appDisplay;
const DocDisplay = imports.ui.docDisplay;
const Zeitgeist = imports.ui.zeitgeist;

const COLLAPSED_WIDTH = 24;
const EXPANDED_WIDTH = 200;

const STATE_EXPANDED    = 0;
const STATE_COLLAPSING  = 1;
const STATE_COLLAPSED   = 2;
const STATE_EXPANDING   = 3;
const STATE_POPPING_OUT = 4;
const STATE_POPPED_OUT  = 5;
const STATE_POPPING_IN  = 6;

function Widget() {
}

Widget.prototype = {
    // _init():
    //
    // Your widget constructor. Receives no arguments. Must define a
    // field named "actor" containing the Clutter.Actor to show in
    // expanded mode. This actor will be clipped to
    // Widget.EXPANDED_WIDTH. Most widgets will also define a field
    // named "title" containing the title string to show above the
    // widget in the sidebar.
    //
    // If you want to have a separate collapsed view, you can define a
    // field "collapsedActor" containing the Clutter.Actor to show in
    // that mode. (It may be the same actor.) This actor will be
    // clipped to Widget.COLLAPSED_WIDTH, and will normally end up
    // having the same height as the main actor.
    //
    // If you do not set a collapsedActor, then you must set a title,
    // since that is what will be displayed in collapsed mode, and
    // in this case (and only in this case), the widget will support
    // pop-out, meaning that if the user hovers over its title while
    // the sidebar is collapsed, the widget's expanded view will pop
    // out of the sidebar until either the cursor moves out of it,
    // or else the widget calls this.activated() on itself.

    // destroy():
    //
    // Optional. Will be called when the widget is removed from the
    // sidebar. (Note that you don't need to destroy the actors,
    // since they will be destroyed for you.)

    // collapse():
    //
    // Optional. Called during the sidebar collapse process, at the
    // point when the expanded sidebar has slid offscreen, but the
    // collapsed sidebar has not yet slid onscreen.

    // expand():
    //
    // Optional. Called during the sidebar expand process, at the
    // point when the collapsed sidebar has slid offscreen, but the
    // expanded sidebar has not yet slid onscreen.

    // activated():
    //
    // Emits the "activated" signal for you, which will cause pop-out
    // to end.
    activated: function() {
        this.emit('activated');
    }

    // state:
    //
    // A field set on your widget by the sidebar. Will contain one of
    // the Widget.STATE_* values. (Eg, Widget.STATE_EXPANDED). Note
    // that this will not be set until *after* _init() is called, so
    // you cannot rely on it being set at that point. The widget will
    // always initially be in STATE_EXPANDED.
};

Signals.addSignalMethods(Widget.prototype);


function ClockWidget() {
  this._init();
}

ClockWidget.prototype = {
    __proto__ : Widget.prototype,

    _init: function() {
        this.actor = new Clutter.Text({ font_name: "Sans Bold 16px",
                                        text: "",
                                        // Give an explicit height to ensure
                                        // it's the same in both modes
                                        height: COLLAPSED_WIDTH });

        this.collapsedActor = new Clutter.CairoTexture({ width: COLLAPSED_WIDTH,
                                                         height: COLLAPSED_WIDTH,
                                                         surface_width: COLLAPSED_WIDTH,
                                                         surface_height: COLLAPSED_WIDTH });

        this._update();
    },

    destroy: function() {
        if (this.timer)
            Mainloop.source_remove(this.timer);
    },

    expand: function() {
        this._update();
    },

    collapse: function() {
        this._update();
    },

    _update: function() {
        let time = new Date();
        let msec_remaining = 60000 - (1000 * time.getSeconds() +
                                      time.getMilliseconds());
        if (msec_remaining < 500) {
            time.setMinutes(time.getMinutes() + 1);
            msec_remaining += 60000;
        }

        if (this.state == STATE_COLLAPSED || this.state == STATE_COLLAPSING)
            this._updateCairo(time);
        else
            this._updateText(time);

        if (this.timer)
            Mainloop.source_remove(this.timer);
        this.timer = Mainloop.timeout_add(msec_remaining, Lang.bind(this, this._update));
        return false;
    },

    _updateText: function(time) {
        this.actor.set_text(time.toLocaleFormat("%H:%M"));
    },

    _updateCairo: function(time) {
        let global = Shell.Global.get();
        global.clutter_cairo_texture_draw_clock(this.collapsedActor,
                                                time.getHours() % 12,
                                                time.getMinutes());
    }
};


const ITEM_BG_COLOR = new Clutter.Color();
ITEM_BG_COLOR.from_pixel(0x00000000);
const ITEM_NAME_COLOR = new Clutter.Color();
ITEM_NAME_COLOR.from_pixel(0x000000ff);
const ITEM_DESCRIPTION_COLOR = new Clutter.Color();
ITEM_DESCRIPTION_COLOR.from_pixel(0x404040ff);

function hackUpDisplayItemColors(item) {
    item._bg.background_color = ITEM_BG_COLOR;
    item._name.color = ITEM_NAME_COLOR;
    item._description.color = ITEM_DESCRIPTION_COLOR;
};

function AppsWidget() {
    this._init();
}

AppsWidget.prototype = {
    __proto__ : Widget.prototype,

    _init : function() {
        this.title = "Applications";
        this.actor = new Big.Box({ spacing: 2 });
        this.collapsedActor = new Big.Box({ spacing: 2});

        let added = 0;
        for (let i = 0; i < AppDisplay.DEFAULT_APPLICATIONS.length && added < 5; i++) {
            let id = AppDisplay.DEFAULT_APPLICATIONS[i];
            let appInfo = Gio.DesktopAppInfo.new(id);
            if (!appInfo)
                continue;

            let box = new Big.Box({ padding: 2,
                                    corner_radius: 2 });
            let appDisplayItem = new AppDisplay.AppDisplayItem(
                appInfo, EXPANDED_WIDTH);
            hackUpDisplayItemColors(appDisplayItem);
            box.append(appDisplayItem.actor, Big.BoxPackFlags.NONE);
            this.actor.append(box, Big.BoxPackFlags.NONE);
            appDisplayItem.connect('select', Lang.bind(this, this._itemActivated));

            // Cheaty cheat cheat
            let icon = new Clutter.Clone({ source: appDisplayItem._icon,
                                           width: COLLAPSED_WIDTH,
                                           height: COLLAPSED_WIDTH,
                                           reactive: true });
            this.collapsedActor.append(icon, Big.BoxPackFlags.NONE);
            icon.connect('button-release-event', Lang.bind(this, function() { this._itemActivated(appDisplayItem); }));

            added++;
        }
    },

    _itemActivated: function(item) {
        item.launch();
        this.activated();
    }
};

function DocsWidget() {
    this._init();
}

DocsWidget.prototype = {
    __proto__ : Widget.prototype,

    _init : function() {
        this.title = "Recent Docs";
        this.actor = new Big.Box({ spacing: 2 });
        
        // If retrieving items from Zeitgeist fails we fallback to
        // GtkRecentlyUsed. In this case, we save the ID of the
        // connection to its 'changed' signal in the variable below.
        this.zeitgeist_error = null;

        Zeitgeist.iface.connect('SignalUpdated', Lang.bind(this, this._updateItems));
        Zeitgeist.iface.connect('SignalExit', Lang.bind(this, this._zeitgeistQuit));
        this._updateItems();
    },

    _updateItems: function(emitter) {
        Zeitgeist.iface.GetItemsRemote(0, 0, 5, false, true, [],
            Lang.bind(this, this._recentChanged));
    },

    _zeitgeistQuit: function(emitter) {
        log('Zeitgeist is leaving...');
        this._recentChanged();
    },

    _recentChangedProxy: function(data) {
        this._recentChanged();
    },

    _recentChanged: function(docs, excp) {
        let i;

        if (excp || (!docs && this.zeitgeist_error == null)) {
            log('Could not fetch recently used items from Zeitgeist: ' + excp);
            this._recentManager = Gtk.RecentManager.get_default();
            this.zeitgeist_error = this._recentManager.connect('changed',
                Lang.bind(this, this._recentChangedProxy));
        }

        if (this.zeitgeist_error != null && docs) {
            log('Recovered connection to Zeitgeist.')
            this._recentManager.disconnect(this.zeitgeist_error);
            this.zeitgeist_error = null;
        }

        if (!docs) {
            docs = this._recentManager.get_items();
            for (i = 0; i < docs.length; i++) {
                if (!docs[i].exists())
                    delete docs[i];
            }
            docs.sort(function (a,b) { return b.get_modified() - a.get_modified() });
        }

        let children = this.actor.get_children();
        for (let c = 0; c < children.length; c++)
            this.actor.remove_actor(children[c]);
       
        for (i = 0; i < Math.min(docs.length, 5); i++) {
            let box = new Big.Box({ padding: 2,
                                    corner_radius: 2 });
            let item = new Zeitgeist.ZeitgeistItem(docs[i]);
            let docDisplayItem = new DocDisplay.ZeitgeistDocDisplayItem(
               item, EXPANDED_WIDTH);
            hackUpDisplayItemColors(docDisplayItem);
            box.append(docDisplayItem.actor, Big.BoxPackFlags.NONE);
            this.actor.append(box, Big.BoxPackFlags.NONE);
            docDisplayItem.connect('select', Lang.bind(this, this._itemActivated));
        }
    },

    _itemActivated: function(item) {
        item.launch();
        this.activated();
    }
};
