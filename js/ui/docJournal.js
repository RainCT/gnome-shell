/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Big = imports.gi.Big;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const Signals = imports.signals;
const Mainloop = imports.mainloop;

const DocInfo = imports.misc.docInfo;
const DocDisplay = imports.ui.docDisplay;
const Zeitgeist = imports.misc.zeitgeist;
const Main = imports.ui.main;
const Panel = imports.ui.panel;

const DASH_BORDER_COLOR = new Clutter.Color();
DASH_BORDER_COLOR.from_pixel(0x213b5dfa);

const DASH_TEXT_COLOR = new Clutter.Color();
DASH_TEXT_COLOR.from_pixel(0xffffffff);

const DASH_BORDER_WIDTH = 2;

// The results and details panes have a somewhat transparent blue background with a gradient.
const PANE_LEFT_COLOR = new Clutter.Color();
PANE_LEFT_COLOR.from_pixel(0x0d131ff4);
const PANE_MIDDLE_COLOR = new Clutter.Color();
PANE_MIDDLE_COLOR.from_pixel(0x0d131ffa);
const PANE_RIGHT_COLOR = new Clutter.Color();
PANE_RIGHT_COLOR.from_pixel(0x0d131ff4);

const SHADOW_COLOR = new Clutter.Color();
SHADOW_COLOR.from_pixel(0x00000033);
const TRANSPARENT_COLOR = new Clutter.Color();
TRANSPARENT_COLOR.from_pixel(0x00000000);

const ITEM_DISPLAY_BACKGROUND_COLOR = new Clutter.Color();
ITEM_DISPLAY_BACKGROUND_COLOR.from_pixel(0x00000000);

const SHADOW_WIDTH = 6;
const DASH_SECTION_PADDING = 6;
const DASH_SECTION_SPACING = 6;
const DASH_CORNER_RADIUS = 5;

function DocJournalDay() {
    this._init();
}

DocJournalDay.prototype = {
    _init : function() {
        return null;
    }
};

function DocJournal(width, height) {
    this._init(width, height);
}

DocJournal.prototype = {
    _init : function(width, height) {
        let global = Shell.Global.get();

        this.actor = new Big.Box({ orientation: Big.BoxOrientation.VERTICAL,
                                   width: width,
                                   reactive: true });

        this._headers = new Big.Box({ orientation: Big.BoxOrientation.HORIZONTAL,
                                      reactive: true });
        this.actor.append(this._headers, Big.BoxPackFlags.EXPAND);

        this._textLeft = new Clutter.Text({ color: DASH_TEXT_COLOR,
                                            font_name: "Sans Bold 14px",
                                            text: "Yesterday" });
        this._textMiddle = new Clutter.Text({ color: DASH_TEXT_COLOR,
                                              font_name: "Sans Bold 14px",
                                              text: "Today" });
        this._textRight = new Clutter.Text({ color: DASH_TEXT_COLOR,
                                             font_name: "Sans Bold 14px",
                                             text: "Tomorrow" });
        this._headers.append(this._textLeft, Big.BoxPackFlags.EXPAND);
        this._headers.append(this._textMiddle, Big.BoxPackFlags.EXPAND);
        this._headers.append(this._textRight, Big.BoxPackFlags.EXPAND);


        /*let docs = new DocJournalDay(250, 600, DocDisplay.DocDisplay, "Yesterday");
        docs.display.show();
        this.actor.append(docs.actor, Big.BoxPackFlags.EXPAND);
        docs = new DocJournalDay(250, 600, DocDisplay.DocDisplay, "Today");
        docs.display.show();
        this.actor.append(docs.actor, Big.BoxPackFlags.EXPAND);
        docs = new DocJournalDay(250, 600, DocDisplay.DocDisplay, "Tomorrow");
        docs.display.show();
        this.actor.append(docs.actor, Big.BoxPackFlags.EXPAND);*/

        this.displayControl = new Big.Box({ background_color: ITEM_DISPLAY_BACKGROUND_COLOR,
                                            spacing: 12,
                                            orientation: Big.BoxOrientation.HORIZONTAL});
    },

    getNavigationArea: function () {
        return null;
    },

    setAvailableDimensionsForItemDetails: function (itemDetailsAvailableWidth, itemDetailsAvailableHeight) {
        return null;
    },

    setSearch: function() {
        return null;
    },

    hide: function() {
        return null;
    },

    show: function() {
        return null;
    }
};

Signals.addSignalMethods(DocJournal.prototype);
