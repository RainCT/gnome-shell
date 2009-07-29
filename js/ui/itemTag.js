/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Big = imports.gi.Big;
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Pango = imports.gi.Pango;
const Signals = imports.signals;
const Shell = imports.gi.Shell;

const Button = imports.ui.button;

const TAG_DISPLAY_NAME_COLOR = new Clutter.Color();
TAG_DISPLAY_NAME_COLOR.from_pixel(0xffffffff);
const TAG_DISPLAY_BACKGROUND_COLOR = new Clutter.Color();
TAG_DISPLAY_BACKGROUND_COLOR.from_pixel(0x3d5229ff);

const TAG_DISPLAY_HEIGHT = 23;

// FIXME: Rename this to something generic and import it from genericDisplay.js?
const INFORMATION_BUTTON_SIZE = 16;

/* This is a class that represents a tag. It creates an actor displaying the
 * label inside a box, plus a button to delete the tag.
 */
function ItemTag(parent, tag, uri) {
    this._init(parent, tag, uri);
}

ItemTag.prototype = {
    _init: function(parent, tag, uri) {
        let global = Shell.Global.get();

        this._parent = parent;
        this._tag = tag;
        this._uri = uri;

        this.actor = new Big.Box({ reactive: true,
                                   background_color: TAG_DISPLAY_BACKGROUND_COLOR,
                                   //corner_radius: 4,
                                   padding: 4,
                                   spacing: 4,
                                   height: TAG_DISPLAY_HEIGHT,
                                   orientation: Big.BoxOrientation.HORIZONTAL });

        let label = new Clutter.Text({ color: TAG_DISPLAY_NAME_COLOR,
                                   font_name: "Sans 14px",
                                   line_wrap: true,
                                   ellipsize: Pango.EllipsizeMode.END,
                                   text: tag });
        this.actor.append(label, Big.BoxPackFlags.EXPAND);

        let deleteIconUri = "file://" + global.imagedir + "delete.svg";
        let deleteIcon = Shell.TextureCache.get_default().load_uri_sync(Shell.TextureCachePolicy.FOREVER,
                                                                      deleteIconUri,
                                                                      INFORMATION_BUTTON_SIZE,
                                                                      INFORMATION_BUTTON_SIZE);
        this._deleteButton = new Button.iconButton(this.actor, INFORMATION_BUTTON_SIZE, deleteIcon);
        this._deleteButton.actor.connect('button-release-event',
                                         Lang.bind(this,
                                                   function() {
                                                       // FIXME: Delete the tag from Zeitgeist
                                                       this._parent.remove_actor(this.actor);
                                                       return true;
                                                    }));
        this.actor.append(this._deleteButton.actor, Big.BoxPackFlags.EXPAND);
    },

    // Destroys the item.
    destroy: function() {
      this.actor.destroy();
    }
};

Signals.addSignalMethods(ItemTag.prototype);
