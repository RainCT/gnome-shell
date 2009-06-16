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
let zeitgeist = new Zeitgeist();
