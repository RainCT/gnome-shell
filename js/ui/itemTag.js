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

const TAG_DISPLAY_HEIGHT = 22;

// FIXME: Rename this to something generic and import it from genericDisplay.js?
const INFORMATION_BUTTON_SIZE = 16;

/* This is a class that represents a tag. It creates an actor displaying the
 * label inside a box, plus a button to delete the tag.
 */
function ItemTag(tag, uri) {
    this._init(tag, uri);
}

ItemTag.prototype = {
    _init: function(tag, uri) {
        let global = Shell.Global.get();

        this.actor = new Big.Box({ background_color: TAG_DISPLAY_BACKGROUND_COLOR,
                                   //corner_radius: 4,
                                   padding: 4,
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
        this._deleteButton.forceShow(true);
        this._deleteButton.actor.x = -5;
        this._deleteButton.actor.y = 2;

        this._deleteButton.actor.connect('button-release-event',
                                         Lang.bind(this,
                                                   function() {
                                                       log('****** -----------------> clicked ******');
                                                       return true;
                                                    }));
        this.actor.append(this._deleteButton.actor, Big.BoxPackFlags.EXPAND);

        this._tag = tag;
        this._uri = uri;
    },

    // Destroys the item.
    destroy: function() {
      this.actor.destroy();
    }
};

Signals.addSignalMethods(ItemTag.prototype);
