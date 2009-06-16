/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const DBus = imports.dbus;

let bus = DBus.session;

var zeitgeistIface = {
    name: 'org.gnome.Zeitgeist',
    methods: [{ name: 'GetItems',
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

function ZeitgeistItem(item) {
    this._init(item);
};

ZeitgeistItem.prototype = {
    _init: function(item) {
        if (item.length == 13) {
            // Item from Zeitgeist
            this.timestamp = item[0];
            this.uri = item[1];
            this.name = item[2];
            //this.source = item[3];
            //this.content = item[4];
            this.mime_type = item[5];
            this.tags = item[6];
            //this.comment = item[7];
            this.bookmark = item[8];
            //this.usage = item[9];
            this.icon = item[10];
            this.app = item[11];
            //this.origin = item[12];
        } else {
            // Item from GtkRecentlyUsed
            this.uri = item.get_uri();
            this.name = item.get_display_name();
            this.mime_type = item.get_mime_type();
            this.app = item.last_application();
        }
    }
};
