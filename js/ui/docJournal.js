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

function DocJournalDay(width) {
    this._init(width);
}

DocJournalDay.prototype = {
    __proto__:  DocDisplay.DocDisplay.prototype,

    _init : function(width) {
        DocDisplay.DocDisplay.prototype._init.call(this, width);
        this.show();
    },

    _connectDocsSource : function() {
         let items = [], i, docInfo;

        this._recentManager = Gtk.RecentManager.get_default();
        let docs = this._recentManager.get_items();
        items.sort(function (a, b) { return b.timestamp - a.timestamp });

        for (i = 0; i < docs.length; i++) {
                docInfo = new DocInfo.DocInfo (docs[i]);

                if (docInfo.exists())
                    items.push(docInfo);
        }
        this._refreshCache(items);
    }
};

function DocJournal(width, height) {
    this._init(width, height);
}

DocJournal.prototype = {
    _init : function(width, height) {
        this.actor = new Big.Box({ orientation: Big.BoxOrientation.HORIZONTAL,
                                   reactive: true });

        this._rowLeft = new Big.Box({ orientation: Big.BoxOrientation.VERTICAL,
                                      reactive: true });
        this.actor.append(this._rowLeft, Big.BoxPackFlags.EXPAND);
        this._rowMiddle = new Big.Box({ orientation: Big.BoxOrientation.VERTICAL,
                                        reactive: true });
        this.actor.append(this._rowMiddle, Big.BoxPackFlags.EXPAND);
        this._rowRight = new Big.Box({ orientation: Big.BoxOrientation.VERTICAL,
                                       reactive: true });
        this.actor.append(this._rowRight, Big.BoxPackFlags.EXPAND);

        this._textLeft = new Clutter.Text({ color: DASH_TEXT_COLOR,
                                            font_name: "Sans Bold 14px",
                                            text: "Two days ago" });
        this._rowLeft.append(this._textLeft, Big.BoxPackFlags.EXPAND);
        this._textMiddle = new Clutter.Text({ color: DASH_TEXT_COLOR,
                                              font_name: "Sans Bold 14px",
                                              text: "Yesterday" });
        this._rowMiddle.append(this._textMiddle, Big.BoxPackFlags.EXPAND);
        this._textRight = new Clutter.Text({ color: DASH_TEXT_COLOR,
                                             font_name: "Sans Bold 14px",
                                             text: "Today" });
        this._rowRight.append(this._textRight, Big.BoxPackFlags.EXPAND);

        this._docsLeft = new DocJournalDay(250, DocDisplay.DocDisplay, "");
        this._rowLeft.append(this._docsLeft.actor, Big.BoxPackFlags.EXPAND);

        this._docsMiddle = new DocJournalDay(250, DocDisplay.DocDisplay, "");
        this._rowMiddle.append(this._docsMiddle.actor, Big.BoxPackFlags.EXPAND);

        this._docsRight = new DocJournalDay(250, DocDisplay.DocDisplay, "");
        this._rowRight.append(this._docsRight.actor, Big.BoxPackFlags.EXPAND);

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
