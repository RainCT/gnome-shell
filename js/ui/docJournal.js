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
const Zeitgeist = imports.misc.zeitgeist;
const Main = imports.ui.main;
const Panel = imports.ui.panel;

const DASH_BORDER_COLOR = new Clutter.Color();
DASH_BORDER_COLOR.from_pixel(0x213b5dfa);

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

const SHADOW_WIDTH = 6;
const DASH_SECTION_PADDING = 6;
const DASH_SECTION_SPACING = 6;
const DASH_CORNER_RADIUS = 5;

function DocJournal(width, height) {
    this._init(width, height);
}

DocJournal.prototype = {
    _init : function(width, height) {
        let global = Shell.Global.get();

        this.actor = new Big.Box({ orientation: Big.BoxOrientation.HORIZONTAL,
                                   x: 500,
                                   y: Panel.PANEL_HEIGHT + 50,
                                   width: 700, // width
                                   height: 600, // height
                                   reactive: true });

        let detailsBackground = new Big.Box({ orientation: Big.BoxOrientation.HORIZONTAL,
                                              width: 700, // width
                                              height: 500, // height
                                              corner_radius: DASH_CORNER_RADIUS,
                                              border: DASH_BORDER_WIDTH,
                                              border_color: DASH_BORDER_COLOR });

        this.actor.append(detailsBackground, Big.BoxPackFlags.EXPAND);

        let detailsLeft = global.create_horizontal_gradient(PANE_LEFT_COLOR,
                                                            PANE_MIDDLE_COLOR);
        let detailsRight = global.create_horizontal_gradient(PANE_MIDDLE_COLOR,
                                                             PANE_RIGHT_COLOR);
        let detailsShadow = global.create_horizontal_gradient(SHADOW_COLOR,
                                                              TRANSPARENT_COLOR);
        detailsShadow.set_width(SHADOW_WIDTH);

        detailsBackground.append(detailsLeft, Big.BoxPackFlags.EXPAND);
        detailsBackground.append(detailsRight, Big.BoxPackFlags.EXPAND);
        this.actor.append(detailsShadow, Big.BoxPackFlags.NONE);

        this._detailsContent = new Big.Box({ padding: DASH_SECTION_PADDING + DASH_BORDER_WIDTH });
        this.actor.add_actor(this._detailsContent);
    }
};

Signals.addSignalMethods(DocJournal.prototype);
