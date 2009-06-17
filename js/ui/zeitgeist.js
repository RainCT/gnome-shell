/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const DBus = imports.dbus;

const DocInfo = imports.misc.docInfo;

let bus = DBus.session;

var zeitgeistIface = {
    name: 'org.gnome.Zeitgeist',
    methods: [{ name: 'FindEvents',
                inSignature: 'iiibba(ssssss)',
                outSignature: 'a(isssssssbssss)' },
             ],
    signals: [{ name: 'SignalUpdated',
                inSignature: '' },
              { name: 'SignalExit',
                inSignature: '' },
            ]
};


function Zeitgeist() {
    this._init();
};

Zeitgeist.prototype = {
     _init: function() {
         DBus.session.proxifyObject(this, 'org.gnome.Zeitgeist',
             '/org/gnome/Zeitgeist');
     }
};

DBus.proxifyPrototype(Zeitgeist.prototype, zeitgeistIface);
let iface = new Zeitgeist();



function RecentDocsWatcher() {
    this._init();
}

RecentDocsWatcher.prototype = {
    
    _init : function() {
        this._numberOfItems = 0;
        this._callbacks = [];
        // If retrieving items from Zeitgeist fails we fallback to
        // GtkRecentlyUsed. In this case, we save the ID of the
        // connection to its 'changed' signal in the variable below.
        this._zeitgeistError = null;

        iface.connect('SignalUpdated', Lang.bind(this, this._updateItems));
        iface.connect('SignalExit', Lang.bind(this, this._zeitgeistQuit));
    },

    _updateItems: function(emitter) {
        if (this._numberOfItems) {
            iface.FindEventsRemote(0, 0, this._numberOfItems,
                false, true, [], Lang.bind(this, this._recentChanged));
        }
    },

    _zeitgeistQuit: function(emitter) {
        log('Zeitgeist is leaving...');
        this._recentChanged();
    },

    _recentChanged: function(docs, excp) {
        let i;

        if (excp || (!docs && this._zeitgeistError == null)) {
            log('Could not fetch recently used items from Zeitgeist: ' + excp);
            this._recentManager = Gtk.RecentManager.get_default();
            this._zeitgeistError = this._recentManager.connect('changed',
                Lang.bind(this, function(a) { this._recentChanged(); }));
        }

        if (this._zeitgeistError != null && docs) {
            log('Recovered connection to Zeitgeist.')
            this._recentManager.disconnect(this._zeitgeistError);
            this._zeitgeistError = null;
        }

        let items = [];
        if (docs) {
            for (i = 0; i < docs.length; i++)
                items.push(new DocInfo.DocInfo (docs[i]));
        } else {
            docs = this._recentManager.get_items();
            for (i = 0; i < docs.length; i++) {
                let docInfo = new DocInfo.DocInfo (docs[i]);

                if (docInfo.exists())
                    items.push(docInfo);
            }
            items.sort(function (a,b) { return b.lastVisited() - a.lastVisited() });
        }

        for (i = 0; i < this._callbacks.length; i++)
            this._callbacks[i](items);
    },
    
    addCallback: function(callback, numberOfItems) {
        if (numberOfItems > this._numberOfItems)
            this._numberOfItems = numberOfItems;
        this._callbacks.push(callback);
        this._updateItems();
    }
};

let recentDocsWatcher = new RecentDocsWatcher();
