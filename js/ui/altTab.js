/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Big = imports.gi.Big;
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Pango = imports.gi.Pango;
const Shell = imports.gi.Shell;

const Main = imports.ui.main;
const Tweener = imports.ui.tweener;

const POPUP_BG_COLOR = new Clutter.Color();
POPUP_BG_COLOR.from_pixel(0x00000080);
const POPUP_INDICATOR_COLOR = new Clutter.Color();
POPUP_INDICATOR_COLOR.from_pixel(0xf0f0f0ff);
const POPUP_TRANSPARENT = new Clutter.Color();
POPUP_TRANSPARENT.from_pixel(0x00000000);

const POPUP_INDICATOR_WIDTH = 4;
const POPUP_GRID_SPACING = 8;
const POPUP_ICON_SIZE = 48;
const POPUP_NUM_COLUMNS = 5;

const POPUP_LABEL_MAX_WIDTH = POPUP_NUM_COLUMNS * (POPUP_ICON_SIZE + POPUP_GRID_SPACING);

const OVERLAY_COLOR = new Clutter.Color();
OVERLAY_COLOR.from_pixel(0x00000044);

const SHOW_TIME = 0.05;
const SWITCH_TIME = 0.1;

function AltTabPopup() {
    this._init();
}

AltTabPopup.prototype = {
    _init : function() {
        let global = Shell.Global.get();

        this.actor = new Big.Box({ background_color : POPUP_BG_COLOR,
                                   corner_radius: POPUP_GRID_SPACING,
                                   padding: POPUP_GRID_SPACING,
                                   spacing: POPUP_GRID_SPACING,
                                   orientation: Big.BoxOrientation.VERTICAL });

        // Icon grid. It would be nice to use Tidy.Grid for the this,
        // but Tidy.Grid is lame in various ways. (Eg, it seems to
        // have a minimum size of 200x200.) So we create a vertical
        // Big.Box containing multiple horizontal Big.Boxes.
        this._grid = new Big.Box({ spacing: POPUP_GRID_SPACING,
                                   orientation: Big.BoxOrientation.VERTICAL });
        let gcenterbox = new Big.Box({ orientation: Big.BoxOrientation.HORIZONTAL,
                                       x_align: Big.BoxAlignment.CENTER });
        gcenterbox.append(this._grid, Big.BoxPackFlags.NONE);
        this.actor.append(gcenterbox, Big.BoxPackFlags.NONE);

        // Selected-window label
        this._label = new Clutter.Text({ font_name: "Sans 16px",
                                         ellipsize: Pango.EllipsizeMode.END });

        let labelbox = new Big.Box({ background_color: POPUP_INDICATOR_COLOR,
                                     corner_radius: POPUP_GRID_SPACING / 2,
                                     padding: POPUP_GRID_SPACING / 2 });
        labelbox.append(this._label, Big.BoxPackFlags.NONE);
        let lcenterbox = new Big.Box({ orientation: Big.BoxOrientation.HORIZONTAL,
                                       x_align: Big.BoxAlignment.CENTER,
                                       width: POPUP_LABEL_MAX_WIDTH + POPUP_GRID_SPACING });
        lcenterbox.append(labelbox, Big.BoxPackFlags.NONE);
        this.actor.append(lcenterbox, Big.BoxPackFlags.NONE);

        // Indicator around selected icon
        this._indicator = new Big.Rectangle({ border_width: POPUP_INDICATOR_WIDTH,
                                              corner_radius: POPUP_INDICATOR_WIDTH / 2,
                                              border_color: POPUP_INDICATOR_COLOR,
                                              color: POPUP_TRANSPARENT });
        this.actor.append(this._indicator, Big.BoxPackFlags.FIXED);

        this._items = [];
        this._toplevels = global.window_group.get_children();

        global.stage.add_actor(this.actor);

        // Dark translucent window used to cover all but the
        // currently-selected window while Alt-Tabbing. Actually
        // contains four actors which can we rearrange to create
        // a hole in the overlay.
        this._overlay = new Clutter.Group({ reactive: true });
        this._overlay_top = new Clutter.Rectangle({ color: OVERLAY_COLOR,
                                                    border_width: 0 });
        this._overlay_bottom = new Clutter.Rectangle({ color: OVERLAY_COLOR,
                                                       border_width: 0 });
        this._overlay_left = new Clutter.Rectangle({ color: OVERLAY_COLOR,
                                                     border_width: 0 });
        this._overlay_right = new Clutter.Rectangle({ color: OVERLAY_COLOR,
                                                      border_width: 0 });
        this._overlay.add_actor(this._overlay_top);
        this._overlay.add_actor(this._overlay_bottom);
        this._overlay.add_actor(this._overlay_left);
        this._overlay.add_actor(this._overlay_right);
    },

    addWindow : function(win) {
        let item = { window: win,
                     metaWindow: win.get_meta_window() };

        let pixbuf = item.metaWindow.icon;
        item.icon = new Clutter.Texture({ width: POPUP_ICON_SIZE,
                                          height: POPUP_ICON_SIZE,
                                          keep_aspect_ratio: true });
        Shell.clutter_texture_set_from_pixbuf(item.icon, pixbuf);

        item.box = new Big.Box({ padding: POPUP_INDICATOR_WIDTH * 2 });
        item.box.append(item.icon, Big.BoxPackFlags.NONE);

        item.above = null;
        for (let i = 1; i < this._toplevels.length; i++) {
            if (this._toplevels[i] == win) {
                item.above = this._toplevels[i - 1];
                break;
            }
        }

        item.visible = item.metaWindow.showing_on_its_workspace();

        if (!item.visible) {
            let rect = new Meta.Rectangle();
            if (item.metaWindow.get_icon_geometry(rect))
                item.icon_rect = rect;
        }

        item.n = this._items.length;
        this._items.push(item);

        // Add it to the grid
        if (!this._gridRow || this._gridRow.get_children().length == POPUP_NUM_COLUMNS) {
            this._gridRow = new Big.Box({ spacing: POPUP_GRID_SPACING,
                                          orientation: Big.BoxOrientation.HORIZONTAL });
            this._grid.append(this._gridRow, Big.BoxPackFlags.NONE);
        }
        this._gridRow.append(item.box, Big.BoxPackFlags.NONE);
    },

    show : function(initialSelection) {
        let global = Shell.Global.get();

        Main.startModal();

        global.window_group.add_actor(this._overlay);
        this._overlay.raise_top();
        this._overlay.show();
        this.actor.opacity = 0;
        Tweener.addTween(this.actor, { opacity: 255,
                                       time: SHOW_TIME,
                                       transition: "easeOutQuad" });

        this.actor.show_all();
        this.actor.x = Math.floor((global.screen_width - this.actor.width) / 2);
        this.actor.y = Math.floor((global.screen_height - this.actor.height) / 2);

        this.select(initialSelection);
    },

    destroy : function() {
        this.actor.destroy();
        this._overlay.destroy();

        Main.endModal();
    },

    select : function(n) {
        if (this._selected) {
            // Unselect previous

            if (this._allocationChangedId) {
                this._selected.box.disconnect(this._allocationChangedId);
                delete this._allocationChangedId;
            }

            if (this._selected.above)
                this._selected.window.raise(this._selected.above);
            else
                this._selected.window.lower_bottom();
        }

        let item = this._items[n];
        let changed = this._selected && item != this._selected;
        this._selected = item;

        if (this._selected) {
            this._label.set_size(-1, -1);
            this._label.text = this._selected.metaWindow.title;
            if (this._label.width > POPUP_LABEL_MAX_WIDTH)
                this._label.width = POPUP_LABEL_MAX_WIDTH;

            // Figure out this._selected.box's coordinates in terms of
            // this.actor
            let bx = this._selected.box.x, by = this._selected.box.y;
            let actor = this._selected.box.get_parent();
            while (actor != this.actor) {
                bx += actor.x;
                by += actor.y;
                actor = actor.get_parent();
            }

            if (changed) {
                Tweener.addTween(this._indicator,
                                 { x: bx,
                                   y: by,
                                   width: this._selected.box.width,
                                   height: this._selected.box.height,
                                   time: SWITCH_TIME,
                                   transition: "easeOutQuad" });
            } else {
                Tweener.removeTweens(this.indicator);
                this._indicator.set_position(bx, by);
                this._indicator.set_size(this._selected.box.width,
                                         this._selected.box.height);
            }
            this._indicator.show();

            if (this._overlay.visible) {
                if (this._selected.visible)
                    this._selected.window.raise(this._overlay);
                this._adjust_overlay();
            }

            this._allocationChangedId =
                this._selected.box.connect('notify::allocation',
                                           Lang.bind(this, this._allocationChanged));
        } else {
            this._label.text = "";
            this._indicator.hide();
        }
    },

    _allocationChanged : function() {
        if (this._selected)
            this.select(this._selected.n);
    },

    _adjust_overlay : function() {
        let global = Shell.Global.get();

        if (this._selected && this._selected.icon_rect) {
            // We want to highlight a specific rectangle within the
            // task bar, so rearrange the pieces of the overlay to
            // cover the whole screen except that rectangle

            let rect = this._selected.icon_rect;

            this._overlay_top.x = 0;
            this._overlay_top.y = 0;
            this._overlay_top.width = global.screen_width;
            this._overlay_top.height = rect.y;

            this._overlay_left.x = 0;
            this._overlay_left.y = rect.y;
            this._overlay_left.width = rect.x;
            this._overlay_left.height = rect.height;
            this._overlay_left.show();

            this._overlay_right.x = rect.x + rect.width;
            this._overlay_right.y = rect.y;
            this._overlay_right.width = global.screen_width - rect.x - rect.width;
            this._overlay_right.height = rect.height;
            this._overlay_right.show();

            this._overlay_bottom.x = 0;
            this._overlay_bottom.y = rect.y + rect.height;
            this._overlay_bottom.width = global.screen_width;
            this._overlay_bottom.height = global.screen_height - rect.y - rect.height;
            this._overlay_bottom.show();
        } else {
            // Either there's no current selection, or the selection
            // is a visible window. Make the overlay cover the whole
            // screen. select() will raise the selected window over
            // the overlay.

            this._overlay_top.x = 0;
            this._overlay_top.y = 0;
            this._overlay_top.width = global.screen_width;
            this._overlay_top.height = global.screen_height;
            this._overlay_top.show();

            this._overlay_left.hide();
            this._overlay_right.hide();
            this._overlay_bottom.hide();
        }
    }
};
