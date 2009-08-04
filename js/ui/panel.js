/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Big = imports.gi.Big;
const Clutter = imports.gi.Clutter;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Tweener = imports.ui.tweener;

const Button = imports.ui.button;
const Main = imports.ui.main;

const PANEL_HEIGHT = 26;
const TRAY_HEIGHT = PANEL_HEIGHT - 1;

const PANEL_BACKGROUND_COLOR = new Clutter.Color();
PANEL_BACKGROUND_COLOR.from_pixel(0x000000ff);
const PANEL_FOREGROUND_COLOR = new Clutter.Color();
PANEL_FOREGROUND_COLOR.from_pixel(0xffffffff);

const TRANSPARENT_COLOR = new Clutter.Color();
TRANSPARENT_COLOR.from_pixel(0x00000000);

// Don't make the mouse hover effect visible to the user for a menu feel.
const PANEL_BUTTON_COLOR = new Clutter.Color();
PANEL_BUTTON_COLOR.from_pixel(0x00000000);

// Lighten pressed buttons; darkening has no effect on a black background.
const PRESSED_BUTTON_BACKGROUND_COLOR = new Clutter.Color();
PRESSED_BUTTON_BACKGROUND_COLOR.from_pixel(0x324c6ffa);

const DEFAULT_FONT = 'Sans 16px';

const TRAY_PADDING = 0;
// See comments around _recomputeTraySize
const TRAY_SPACING = 14;
const TRAY_SPACING_MIN = 8;

// Used for the tray icon container with gtk pre-2.16, which doesn't
// fully support tray icon transparency
const TRAY_BACKGROUND_COLOR = new Clutter.Color();
TRAY_BACKGROUND_COLOR.from_pixel(0xefefefff);
const TRAY_BORDER_COLOR = new Clutter.Color();
TRAY_BORDER_COLOR.from_pixel(0x00000033);
const TRAY_CORNER_RADIUS = 5;
const TRAY_BORDER_WIDTH = 0;

function Panel() {
    this._init();
}

Panel.prototype = {
    _init : function() {
        let global = Shell.Global.get();

        // Put the background under the panel within a group.
        this.actor = new Clutter.Group();

        // backBox contains the panel background and the clock.
        let backBox = new Big.Box({ width: global.screen_width,
                                    height: PANEL_HEIGHT,
                                    backgroundColor: PANEL_BACKGROUND_COLOR,
                                    x_align: Big.BoxAlignment.CENTER });
        this.actor.add_actor(backBox);

        let box = new Big.Box({ x: 0,
                                y: 0,
                                height: PANEL_HEIGHT,
                                width: global.screen_width,
                                orientation: Big.BoxOrientation.HORIZONTAL,
                                spacing: 4 });

        this.button = new Button.Button("Activities", PANEL_BUTTON_COLOR, PRESSED_BUTTON_BACKGROUND_COLOR, PANEL_FOREGROUND_COLOR, true, null, PANEL_HEIGHT, DEFAULT_FONT);

        box.append(this.button.button, Big.BoxPackFlags.NONE);

        let statusbox = new Big.Box();
        let statusmenu = this._statusmenu = new Shell.StatusMenu();
        statusmenu.get_icon().hide();
        statusmenu.get_name().fontName = DEFAULT_FONT;
        statusmenu.get_name().color = PANEL_FOREGROUND_COLOR;
        statusbox.append(this._statusmenu, Big.BoxPackFlags.NONE);
        let statusbutton = new Button.Button(statusbox,
                                             PANEL_BUTTON_COLOR,
                                             PRESSED_BUTTON_BACKGROUND_COLOR,
                                             PANEL_FOREGROUND_COLOR,
                                             true, null, PANEL_HEIGHT);
        statusbutton.button.connect('button-press-event', function (b, e) {
            statusmenu.toggle(e);
            return false;
        });
        box.append(statusbutton.button, Big.BoxPackFlags.END);
        // We get a deactivated event when the popup disappears
        this._statusmenu.connect('deactivated', function (sm) {
            statusbutton.release();
        });

        this._clock = new Clutter.Text({ font_name: DEFAULT_FONT,
                                         color: PANEL_FOREGROUND_COLOR,
                                         text: "" });
        let clockbox = new Big.Box({ y_align: Big.BoxAlignment.CENTER,
                                     padding_left: 4,
                                     padding_right: 4 });
        clockbox.append(this._clock, Big.BoxPackFlags.NONE);
        backBox.append(clockbox, Big.BoxPackFlags.EXPAND);

        // The tray icons live in trayBox within trayContainer.
        // The trayBox is hidden when there are no tray icons.
        let trayContainer = new Big.Box({ orientation: Big.BoxOrientation.VERTICAL,
                                          y_align: Big.BoxAlignment.START });
        box.append(trayContainer, Big.BoxPackFlags.END);
        let trayBox = new Big.Box({ orientation: Big.BoxOrientation.HORIZONTAL,
                                    height: TRAY_HEIGHT,
                                    padding: TRAY_PADDING,
                                    spacing: TRAY_SPACING });
        this._trayBox = trayBox;

        // gtk+ < 2.16 doesn't have fully-working icon transparency,
        // so we want trayBox to be opaque in that case (the icons
        // will at least pick up its background color).
        if (Gtk.MAJOR_VERSION == 2 && Gtk.MINOR_VERSION < 16) {
            trayBox.background_color = TRAY_BACKGROUND_COLOR;
            trayBox.corner_radius = TRAY_CORNER_RADIUS;
            trayBox.border = TRAY_BORDER_WIDTH;
            trayBox.border_color = TRAY_BORDER_COLOR;
        }

        trayBox.hide();
        trayContainer.append(trayBox, Big.BoxPackFlags.NONE);

        this._traymanager = new Shell.TrayManager({ bg_color: TRAY_BACKGROUND_COLOR });
        this._traymanager.connect('tray-icon-added',
            Lang.bind(this, function(o, icon) {
                trayBox.append(icon, Big.BoxPackFlags.NONE);

                // Make sure the trayBox is shown.
                trayBox.show();
                this._recomputeTraySize();
            }));
        this._traymanager.connect('tray-icon-removed',
            Lang.bind(this, function(o, icon) {
                trayBox.remove_actor(icon);

                if (trayBox.get_children().length == 0)
                    trayBox.hide();
                this._recomputeTraySize();
            }));
        this._traymanager.manage_stage(global.stage);

        // TODO: decide what to do with the rest of the panel in the overlay mode (make it fade-out, become non-reactive, etc.)
        // We get into the overlay mode on button-press-event as opposed to button-release-event because eventually we'll probably
        // have the overlay act like a menu that allows the user to release the mouse on the activity the user wants
        // to switch to.
        this.button.button.connect('button-press-event',
                                   Lang.bind(Main.overlay, Main.overlay.toggle));
        // In addition to pressing the button, the overlay can be entered and exited by other means, such as
        // pressing the System key, Alt+F1 or Esc. We want the button to be pressed in when the overlay is entered
        // and to be released when it is exited regardless of how it was triggered.
        Main.overlay.connect('showing', Lang.bind(this.button, this.button.pressIn));
        Main.overlay.connect('hiding', Lang.bind(this.button, this.button.release));

        this.actor.add_actor(box);

        Main.chrome.addActor(this.actor, box);
        Main.chrome.setVisibleInOverlay(this.actor, true);

        // Start the clock
        this._updateClock();
    },

    startupAnimation: function() {
        this.actor.y = -this.actor.height;
        Tweener.addTween(this.actor,
                         { y: 0,
                           time: 0.2,
                           transition: "easeOutQuad"
                         });
    },

    // By default, tray icons have a spacing of TRAY_SPACING.  However this
    // starts to fail if we have too many as can sadly happen; just jump down
    // to a spacing of 8 if we're over 6.
    // http://bugzilla.gnome.org/show_bug.cgi?id=590495
    _recomputeTraySize: function () {
        if (this._trayBox.get_children().length > 6)
            this._trayBox.spacing = TRAY_SPACING_MIN;
        else
            this._trayBox.spacing = TRAY_SPACING;
    },

    _updateClock: function() {
        let displayDate = new Date();
        let msecRemaining = 60000 - (1000 * displayDate.getSeconds() +
                                     displayDate.getMilliseconds());
        if (msecRemaining < 500) {
            displayDate.setMinutes(displayDate.getMinutes() + 1);
            msecRemaining += 60000;
        }
        this._clock.set_text(displayDate.toLocaleFormat("%a %l:%M %p"));
        Mainloop.timeout_add(msecRemaining, Lang.bind(this, this._updateClock));
        return false;
    }
};
