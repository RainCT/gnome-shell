/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Shell = imports.gi.Shell;

const Lang = imports.lang;
const Signals = imports.signals;
const Main = imports.ui.main;

const THUMBNAIL_ICON_MARGIN = 2;

function DocInfo(item) {
    this._init(item);
}

DocInfo.prototype = {
    _init : function(item) {
        if ("uri" in item) {
            // Item from Zeitgeist
            this._recentInfo = null;
            this.timestamp = item["timestamp"];
            this.uri = item["uri"];
            this.name = item["text"];
            this.source = item["source"];
            this.content = item["content"];
            this.mimeType = item["mimetype"];
            this.tags = item["tags"].split(",");
            this.comment = item["comment"];
            this.bookmark = item["bookmark"];
            this.use = item["use"];
            this._iconOverride = item["icon"];
            this.app = item["app"];      // !!!!!!!!!!!!!!!!!!!!!!!!
            this.origin = item["origin"];
        } else {
            // Item from GtkRecentlyUsed
            this._recentInfo = item;
            // We actually used get_modified() instead of get_visited()
            // here, as GtkRecentInfo doesn't updated get_visited()
            // correctly. See http://bugzilla.gnome.org/show_bug.cgi?id=567094
            this.timestamp = item.get_modified().getTime() / 1000;
            this.uri = item.get_uri();
            this.name = item.get_display_name();
            this.mimeType = item.get_mime_type();
            this.app = item.last_application();
        }
    },

    createIcon : function(size) {
        if (this._recentInfo)
            return Shell.TextureCache.get_default().load_recent_thumbnail(size, this._recentInfo);
        else
            return Shell.TextureCache.get_default().load_thumbnail(size, this.uri, this.mimeType);
    },

    launch : function() {
        // While using Gio.app_info_launch_default_for_uri() would be
        // shorter in terms of lines of code, we are not doing so
        // because that would duplicate the work of retrieving the
        // mime type.

        let appInfo = Gio.app_info_get_default_for_type(this.mimeType, true);

        if (appInfo != null) {
            appInfo.launch_uris([this.uri], Main.createAppLaunchContext());
        } else {
            log("Failed to get default application info for mime type " + mimeType +
                ". Will try to use the last application that registered the document.");
            let [success, appExec, count, time] = this._recentInfo.get_application_info(this.app);
            if (success) {
                log("Will open a document with the following command: " + appExec);
                // TODO: Change this once better support for creating
                // GAppInfo is added to GtkRecentInfo, as right now
                // this relies on the fact that the file uri is
                // already a part of appExec, so we don't supply any
                // files to appInfo.launch().

                // The 'command line' passed to
                // create_from_command_line is allowed to contain
                // '%<something>' macros that are expanded to file
                // name / icon name, etc, so we need to escape % as %%
                appExec = appExec.replace(/%/g, "%%");

                let appInfo = Gio.app_info_create_from_commandline(appExec, null, 0, null);

                // The point of passing an app launch context to
                // launch() is mostly to get startup notification and
                // associated benefits like the app appearing on the
                // right desktop; but it doesn't really work for now
                // because with the way we create the appInfo we
                // aren't reading the application's desktop file, and
                // thus don't find the StartupNotify=true in it. So,
                // despite passing the app launch context, no startup
                // notification occurs.
                appInfo.launch([], Main.createAppLaunchContext());
            } else {
                log("Failed to get application info for " + this.uri);
            }
        }
    },

    exists : function() {
        if (this._recentInfo)
            return this._recentInfo.exists();
        else {
            if (this.uri.match("^file://")) {
                let file = Gio.file_new_for_path(this.uri.replace("file://", ""));
                return (file.query_exists(null) == true) ? true : false;
            } else
                return true;
        }
    }
};

var docManagerInstance = null;

function getDocManager(size) {
    if (docManagerInstance == null)
        docManagerInstance = new DocManager(size);
    return docManagerInstance;
}

function DocManager(size) {
    this._init(size);
}

DocManager.prototype = {
    _init: function(iconSize) {
        this._iconSize = iconSize;
        this._recentManager = Gtk.RecentManager.get_default();
        this._items = {};
        this._recentManager.connect('changed', Lang.bind(this, function(recentManager) {
            this._reload();
            this.emit('changed');
        }));
        this._reload();
    },

    _reload: function() {
        let docs = this._recentManager.get_items();
        let newItems = {};
        for (let i = 0; i < docs.length; i++) {
            let recentInfo = docs[i];
            let docInfo = new DocInfo(recentInfo);

            // we use GtkRecentInfo URI as an item Id
            newItems[docInfo.uri] = docInfo;
        }
        let deleted = {};
        for (var uri in this._items) {
            if (!(uri in newItems))
                deleted[uri] = this._items[uri];
        }
        /* If we'd cached any thumbnail references that no longer exist,
           dump them here */
        let texCache = Shell.TextureCache.get_default();
        for (var uri in deleted) {
            texCache.evict_recent_thumbnail(this._iconSize, this._items[uri]);
        }
        this._items = newItems;
    },

    getItems: function() {
        return this._items;
    }
}

Signals.addSignalMethods(DocManager.prototype);
